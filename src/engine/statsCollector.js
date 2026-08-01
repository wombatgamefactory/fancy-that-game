// Per-game metrics for Fancy That!
//
// THE LIST THIS FILE SERVES is the 28 July 2026 design doc's "Metrics to log per
// simulated/real game", which explicitly SUPERSEDES the 24 July list. Anything
// the old list asked for that no longer corresponds to a live rule has been
// deleted rather than left to rot beside the new work:
//
//    1  Refresh cadence - every refresh's turn, visible symbols, reward, firer and
//       tiles left on the board, plus the two named failure modes (firing at every
//       legal opportunity, and a bad market sitting unflushed while players wait
//       each other out).
//    2  Mandatory (empty-board) refreshes - count and turn numbers.
//    3  Card row size - sampled once per real turn; max, mean, size at the first
//       claim, size at game end (the last of those is a driver-side reading).
//    4  Card-lock incidence - turns a player reached their claim step with no legal
//       claim anywhere, and the longest such streak per player.
//    5  Multi-match frequency - turns a player could legally have claimed 2+ cards.
//    6  Claims from reserves as a fraction of all claims. (The doc also wants the
//       reserve round's TIME cost; that is a stopwatch measure of a real table and
//       is deliberately not faked here.)
//    7  Deck reshuffles per game.
//    8  Cupcake economy - influx by source, spend by use, and the high-water mark
//       of cupcakes held simultaneously across all players (the 16-token physical
//       supply check; the engine models NO cupcake cap, so this MEASURES whether
//       the component count is sufficient, it does not enforce anything).
//    9  Bag skew - colours flushed back to the bag versus colours dealt out again.
//   10  Per-player claims, final score spread and game length - all readable from
//       the finished game state, so simulate.js reports them from there.
//
// TWO HARD RULES FOR EVERYTHING IN THIS FILE.
//   - Collection must never change the game. gameState.statsCollector may be null
//     and every engine call site goes through metrics(gameState)?.record...(), so a
//     game with no collector must play out identically. Nothing here may mutate
//     the game state, and nothing here may throw on odd input.
//   - Hooks must stay cheap. simulate.js runs hundreds of games; the per-turn
//     samples below are a handful of numbers each, and the one genuinely expensive
//     measurement (the claim-opportunity scan) is computed engine-side ONLY when a
//     collector exists.
export function createStatsCollector() {
  const collector = {
    // The ONE game state these metrics belong to, set by createGame via bindTo.
    // Search bots clone the state to run playouts, and a clone is a different
    // object, so game.js's metrics() guard refuses to log through it. Without
    // that ownership check a single forgotten field in a bot's cloneState
    // silently logged every imaginary rollout turn as if it were real play,
    // which is what once put 61,000 sweeps on the end screen of a 21-turn game.
    owner: null,

    bindTo(gameState) {
      this.owner = gameState;
    },

    sweeps: [], // Array of { count: number } to track each individual sweep
    cardsClaimedCount: 0,
    reserveClaimsCount: 0, // claims completed from a personal reserve (subset of the above)
    // Times the tile market was REFILLED after setup: one per fresh pot of tea,
    // whether ordered or forced by the empty-market rule. The opening deal is
    // NOT a refill and is deliberately not counted here — the end screen calls
    // this "Market Refills" and it should read 0 in a game where nobody ever
    // refreshed the market.
    marketFillCount: 0,
    cardMarketTracking: {}, // { cardId: { entered: turn, exited: turn } }

    // --- 1. Refresh cadence -------------------------------------------------
    // One entry per fresh pot of tea that RESOLVED, in firing order:
    //   { turn, playerId, symbols, reward, mandatory, tilesLeft }
    // symbols is the visible teapot-symbol count read at the pot step and reward
    // is the cupcakes actually paid; they are the same number under the adopted
    // rules (1 cupcake per symbol) and are logged separately so a future payout
    // change does not silently rewrite the cadence history. tilesLeft is how many
    // tiles were still on the market board when the pot was called (0-25; a
    // mandatory refresh always reads 0).
    refreshes: [],
    // --- 2. Mandatory (empty-board) refreshes -------------------------------
    // Turn numbers on which an empty tile market FORCED a refresh. Logged at the
    // moment of forcing (before the reserve round), so this list is written one
    // step earlier than the matching `refreshes` entry, which carries the same
    // fact as its `mandatory` flag.
    mandatoryRefreshTurns: [],
    teaReserves: [], // Array of { playerId, cardId } for each card reserved
    deckReshuffles: 0, // times the card discard was reshuffled into a fresh deck

    // --- 3. Card row size (and the trigger invariant) -----------------------
    // One sample per REAL turn, taken at the very start of that turn before
    // anything happens in it (see recordTurnStart's call site):
    //   { turn, playerId, rowSize, symbols, teaStillDue }
    // rowSize is gameState.cardMarket.length - the variable-length CARD row, not
    // the 5x5 tile market and not the player's personal board. teaStillDue is
    // isTeaDue at that instant, which must be FALSE on every turn start under the
    // end-of-turn trigger - see the teaDueAtTurnStart derivation in getReport.
    turnSamples: [],
    firstClaimRowSize: null, // row length when the game's FIRST claim landed
    firstClaimTurn: null,

    // --- 4/5. Card lock and multi-match -------------------------------------
    // One sample per turn that reaches the claim step, taken as the step opens
    // (so after any cupcake move, which can create a match):
    //   { turn, playerId, rowClaimable, reserveClaimable }
    // 0 claimable = a card-locked turn; 2+ = a multi-match turn. Turns cut short
    // before the claim step (the board-overflow finale) produce no sample, which
    // is why the report also carries the sample count.
    claimChances: [],

    // --- 8. Cupcake economy -------------------------------------------------
    cupcakePlateGains: 0, // cupcakes gained by plating onto a cupcake plate (no cap now)
    // Per-player cupcake influx by source: { playerId: { start, pot, plates } }.
    // start = the 2 opening cupcakes; pot = the refresh reward; plates = cupcake
    // plates covered on the stand.
    cupcakeInflux: {},
    // Per-player cupcake spend by use: { playerId: { move, extraClaim } }.
    // move = the one-tile cupcake move; extraClaim = the pre-agreed extra-claim
    // variant, which ships disabled and so normally stays 0.
    cupcakeSpend: {},
    // High-water mark of cupcakes held SIMULTANEOUSLY across every player, sampled
    // after each influx (spends only ever lower the total, so the peak is always
    // immediately after a gain). This is the physical-supply check: the rules have
    // no cupcake cap at all since 24 July, so if this exceeds the 16 tokens in the
    // box the component count is short. It constrains nothing in play.
    maxCupcakesHeld: 0,

    // --- 9. Bag skew --------------------------------------------------------
    // The refresh is a FULL destructive flush now, so the same tiles cycle bag ->
    // board -> bag repeatedly. Per colour: how many went back on flushes, and how
    // many came straight back out in the redeal. immediateReturns counts tiles
    // that were dealt back onto the board in the very flush that returned them.
    bagFlushCount: 0,
    returnedColours: {},
    dealtColours: {},
    immediateReturns: 0,
    tilesReturned: 0,
    tilesDealtAfterFlush: 0,

    firstPlatingRow: {}, // playerId -> stand rowIndex of that player's FIRST plating
                         // this game (top row = 3). Watches whether the 5-VP top
                         // plate is becoming the automatic opening move.

    recordMarketFill() {
      this.marketFillCount = this.marketFillCount + 1;
    },

    recordSweep(tileCount) {
      const count = parseInt(tileCount);
      if (isNaN(count) || count < 1) return;
      this.sweeps.push({ count: count });
    },

    // fromReserve flags a claim completed out of a personal reserve (vs the shared
    // market), feeding the claims-from-reserve fraction. rowSize is the CARD row
    // length at the instant of the claim (the claimed card still counted, since
    // the engine records before it splices), which is how the "row size when the
    // first claim occurs" figure is captured.
    recordCardClaimed(cardId, turn, fromReserve, rowSize) {
      this.cardsClaimedCount = this.cardsClaimedCount + 1;
      if (fromReserve) this.reserveClaimsCount = this.reserveClaimsCount + 1;
      if (this.firstClaimRowSize === null) {
        this.firstClaimRowSize = rowSize | 0;
        this.firstClaimTurn = parseInt(turn) || 0;
      }
    },

    recordCardMarketEntry(cardId, turn) {
      if (!cardId) return;
      if (!this.cardMarketTracking[cardId]) {
        this.cardMarketTracking[cardId] = {};
      }
      this.cardMarketTracking[cardId].entered = parseInt(turn);
    },

    recordCardMarketExit(cardId, turn) {
      if (!cardId) return;
      if (!this.cardMarketTracking[cardId]) {
        this.cardMarketTracking[cardId] = {};
      }
      this.cardMarketTracking[cardId].exited = parseInt(turn);
    },

    // A fresh pot of tea resolved on `turn`, fired by `playerId`, with `symbols`
    // teapot symbols showing and `reward` cupcakes paid into that player's supply.
    // mandatory distinguishes an empty-board forced refresh from a chosen one -
    // metric 1 and metric 2 are the same event seen two ways, so they are recorded
    // as one row rather than two half-truths. tilesLeft is the count of tiles
    // still on the market board when the pot was called.
    recordRefresh(turn, playerId, symbols, reward, mandatory, tilesLeft) {
      this.refreshes.push({
        turn: parseInt(turn) || 0,
        playerId: playerId === undefined || playerId === null ? -1 : playerId,
        symbols: symbols | 0,
        reward: reward | 0,
        mandatory: !!mandatory,
        tilesLeft: tilesLeft | 0,
      });
    },

    recordTeaReserve(playerId, cardId) {
      if (!cardId) return;
      this.teaReserves.push({ playerId: playerId, cardId: cardId });
    },

    // An empty tile market FORCED a refresh on `turn` (the mandatory route).
    // Called from the empty-market rule, i.e. before the reserve round opens.
    recordBackstopFiring(turn) {
      this.mandatoryRefreshTurns.push(parseInt(turn) || 0);
    },

    recordDeckReshuffle() {
      this.deckReshuffles = this.deckReshuffles + 1;
    },

    // One sample per real turn, at its very start. See the turnSamples comment.
    recordTurnStart(turn, playerId, rowSize, symbols, teaStillDue) {
      this.turnSamples.push({
        turn: parseInt(turn) || 0,
        playerId: playerId === undefined || playerId === null ? -1 : playerId,
        rowSize: rowSize | 0,
        symbols: symbols | 0,
        teaStillDue: !!teaStillDue,
      });
    },

    // How many cards the active player could legally have claimed as their claim
    // step opened. See the claimChances comment.
    recordClaimOpportunity(turn, playerId, rowClaimable, reserveClaimable) {
      this.claimChances.push({
        turn: parseInt(turn) || 0,
        playerId: playerId === undefined || playerId === null ? -1 : playerId,
        rowClaimable: rowClaimable | 0,
        reserveClaimable: reserveClaimable | 0,
      });
    },

    // Add `amount` cupcakes to `playerId`'s influx under `source`
    // ('start' | 'pot' | 'plates').
    recordCupcakeGain(playerId, source, amount) {
      if (playerId === undefined || playerId === null) return;
      const amt = amount | 0;
      if (amt <= 0) return;
      if (!this.cupcakeInflux[playerId]) {
        this.cupcakeInflux[playerId] = { start: 0, pot: 0, plates: 0 };
      }
      if (this.cupcakeInflux[playerId][source] === undefined) {
        this.cupcakeInflux[playerId][source] = 0;
      }
      this.cupcakeInflux[playerId][source] += amt;
    },

    // Spend `amount` cupcakes from `playerId` under `use` ('move' | 'extraClaim').
    recordCupcakeSpend(playerId, use, amount) {
      if (playerId === undefined || playerId === null) return;
      const amt = amount | 0;
      if (amt <= 0) return;
      if (!this.cupcakeSpend[playerId]) {
        this.cupcakeSpend[playerId] = { move: 0, extraClaim: 0 };
      }
      if (this.cupcakeSpend[playerId][use] === undefined) {
        this.cupcakeSpend[playerId][use] = 0;
      }
      this.cupcakeSpend[playerId][use] += amt;
    },

    // Total cupcakes held across ALL players right now. The engine calls this
    // after every influx; only the peak is kept. Nothing reads it back into play.
    recordCupcakeSupply(totalHeld) {
      const held = totalHeld | 0;
      if (held > this.maxCupcakesHeld) this.maxCupcakesHeld = held;
    },

    // One refresh's tile flush: the colours that went BACK to the bag, the colours
    // dealt out to refill the board, and how many of the dealt tiles were the very
    // tiles just returned. Arrays of colour strings; the engine builds them only
    // when a collector exists.
    recordBagFlush(returnedColours, dealtColours, immediateReturns) {
      this.bagFlushCount = this.bagFlushCount + 1;
      if (Array.isArray(returnedColours)) {
        for (const colour of returnedColours) {
          this.returnedColours[colour] = (this.returnedColours[colour] || 0) + 1;
          this.tilesReturned++;
        }
      }
      if (Array.isArray(dealtColours)) {
        for (const colour of dealtColours) {
          this.dealtColours[colour] = (this.dealtColours[colour] || 0) + 1;
          this.tilesDealtAfterFlush++;
        }
      }
      this.immediateReturns = this.immediateReturns + (immediateReturns | 0);
    },

    recordCupcakePlateGain(playerId) {
      this.cupcakePlateGains = this.cupcakePlateGains + 1;
      this.recordCupcakeGain(playerId, 'plates', 1);
    },

    // Record a plating onto a stand row. Only the FIRST plating per player each
    // game is kept (later platings are ignored), so firstPlatingRow captures
    // which row each player opened their stand on.
    recordPlating(playerId, rowIndex) {
      if (playerId === undefined || playerId === null) return;
      if (this.firstPlatingRow[playerId] === undefined) {
        this.firstPlatingRow[playerId] = rowIndex;
      }
    },

    getReport() {
      // Calculate sweep stats from individual sweep records
      let totalTilesTaken = 0;
      let maxSweepSize = 0;
      const sweepCount = this.sweeps.length;

      for (let i = 0; i < sweepCount; i++) {
        const sweepTiles = this.sweeps[i].count || 0;
        totalTilesTaken = totalTilesTaken + sweepTiles;
        if (sweepTiles > maxSweepSize) {
          maxSweepSize = sweepTiles;
        }
      }

      const avgSweepSize = sweepCount > 0
        ? (totalTilesTaken / sweepCount).toFixed(2)
        : '0.0';

      // Calculate card market lifetime
      let totalCardLifetime = 0;
      let cardLifetimeCount = 0;

      for (const cardId in this.cardMarketTracking) {
        const tracking = this.cardMarketTracking[cardId];
        if (typeof tracking.entered === 'number' && typeof tracking.exited === 'number') {
          const lifetime = tracking.exited - tracking.entered;
          if (lifetime >= 0) {
            totalCardLifetime = totalCardLifetime + lifetime;
            cardLifetimeCount = cardLifetimeCount + 1;
          }
        }
      }

      const avgCardMarketLife = cardLifetimeCount > 0
        ? (totalCardLifetime / cardLifetimeCount).toFixed(2)
        : '0.0';

      // --- 1/2. Refresh cadence, and the two named failure modes -------------
      // symbolDist[n] = refreshes fired with n symbols showing (0-5; the gate
      // makes REFRESH_THRESHOLD-5 the live range for a voluntary refresh, and 5
      // the signature of a forced empty board).
      const symbolDist = [0, 0, 0, 0, 0, 0];
      const refreshesByPlayer = {};
      let refreshRewardTotal = 0;
      for (const r of this.refreshes) {
        if (r.symbols >= 0 && r.symbols <= 5) symbolDist[r.symbols]++;
        refreshesByPlayer[r.playerId] = (refreshesByPlayer[r.playerId] || 0) + 1;
        refreshRewardTotal += r.reward;
      }

      // --- 3. Card row size, plus the TRIGGER INVARIANT, from the turn samples -
      // teaDueAtTurnStart counts turns that BEGAN with a fresh pot of tea still
      // owed. Since the 1 August rule change tea fires at the end of the turn
      // that reaches the threshold, so this must be ZERO: a non-zero count means
      // a tea round was skipped, or a flush failed to re-cover the symbols.
      //
      // It replaces the old refreshLegalTurns / longestUnflushedStreak pair, which
      // measured "was a voluntary refresh available and did anyone take it". Tea
      // is not a choice any more, so that question no longer has a subject.
      const rowSizes = [];
      let rowSizeTotal = 0;
      let maxRowSize = 0;
      let teaDueAtTurnStart = 0;
      for (const s of this.turnSamples) {
        rowSizes.push(s.rowSize);
        rowSizeTotal += s.rowSize;
        if (s.rowSize > maxRowSize) maxRowSize = s.rowSize;
        if (s.teaStillDue) teaDueAtTurnStart++;
      }
      const meanRowSize = rowSizes.length > 0 ? rowSizeTotal / rowSizes.length : 0;

      // --- 4/5. Card lock and multi-match ------------------------------------
      // claimableHistogram[n] = claim steps that opened with exactly n claimable
      // cards (row + reserve). Index 0 is a card-locked turn; 2 and above are the
      // multi-match turns that feed the one-claim-per-turn question.
      const claimableHistogram = [];
      const lockTurnsByPlayer = {};
      const longestLockStreakByPlayer = {};
      const runningLockStreak = {};
      let lockTurns = 0;
      let multiMatchTurns = 0;
      let claimableTotal = 0;
      for (const c of this.claimChances) {
        const total = c.rowClaimable + c.reserveClaimable;
        claimableTotal += total;
        claimableHistogram[total] = (claimableHistogram[total] || 0) + 1;
        if (total === 0) {
          lockTurns++;
          lockTurnsByPlayer[c.playerId] = (lockTurnsByPlayer[c.playerId] || 0) + 1;
          const run = (runningLockStreak[c.playerId] || 0) + 1;
          runningLockStreak[c.playerId] = run;
          if (run > (longestLockStreakByPlayer[c.playerId] || 0)) {
            longestLockStreakByPlayer[c.playerId] = run;
          }
        } else {
          runningLockStreak[c.playerId] = 0;
          if (longestLockStreakByPlayer[c.playerId] === undefined) {
            longestLockStreakByPlayer[c.playerId] = 0;
          }
        }
        if (total >= 2) multiMatchTurns++;
      }
      for (let i = 0; i < claimableHistogram.length; i++) {
        if (claimableHistogram[i] === undefined) claimableHistogram[i] = 0;
      }

      // --- 8. Cupcake economy -------------------------------------------------
      const cupcakeInflux = {};
      const cupcakeInfluxTotals = { start: 0, pot: 0, plates: 0 };
      for (const pid in this.cupcakeInflux) {
        const src = this.cupcakeInflux[pid];
        cupcakeInflux[pid] = { start: src.start || 0, pot: src.pot || 0, plates: src.plates || 0 };
        cupcakeInfluxTotals.start += cupcakeInflux[pid].start;
        cupcakeInfluxTotals.pot += cupcakeInflux[pid].pot;
        cupcakeInfluxTotals.plates += cupcakeInflux[pid].plates;
      }
      const cupcakeSpend = {};
      const cupcakeSpendTotals = { move: 0, extraClaim: 0 };
      for (const pid in this.cupcakeSpend) {
        const src = this.cupcakeSpend[pid];
        cupcakeSpend[pid] = { move: src.move || 0, extraClaim: src.extraClaim || 0 };
        cupcakeSpendTotals.move += cupcakeSpend[pid].move;
        cupcakeSpendTotals.extraClaim += cupcakeSpend[pid].extraClaim;
      }

      return {
        marketFills: this.marketFillCount,
        // Reported raw. This used to be clamped to the 100-tile bag size, which
        // did not fix an over-count — it just hid one behind a permanent
        // "100 / 100" on the end screen. If this ever exceeds the bag, that is a
        // real bug worth seeing.
        totalTilesTaken: totalTilesTaken,
        totalCardsClaimed: this.cardsClaimedCount,
        reserveClaims: this.reserveClaimsCount,
        maxSweepSize: maxSweepSize,
        avgSweepSize: avgSweepSize,
        sweepCount: sweepCount,
        cardMarketAvgLifetime: avgCardMarketLife,

        // 1. Refresh cadence
        refreshCount: this.refreshes.length,
        refreshes: this.refreshes.map(r => ({ ...r })),
        refreshSymbolDist: symbolDist,
        refreshesByPlayer: refreshesByPlayer,
        refreshRewardTotal: refreshRewardTotal,
        teaDueAtTurnStart: teaDueAtTurnStart,

        // 2. Mandatory (empty-board) refreshes
        mandatoryRefreshCount: this.mandatoryRefreshTurns.length,
        mandatoryRefreshTurns: this.mandatoryRefreshTurns.slice(),

        // 3. Card row size
        turnSampleCount: this.turnSamples.length,
        rowSizes: rowSizes,
        maxRowSize: maxRowSize,
        meanRowSize: meanRowSize,
        firstClaimRowSize: this.firstClaimRowSize,
        firstClaimTurn: this.firstClaimTurn,

        // 4/5. Card lock and multi-match
        claimChanceSamples: this.claimChances.length,
        lockTurns: lockTurns,
        lockTurnsByPlayer: lockTurnsByPlayer,
        longestLockStreakByPlayer: longestLockStreakByPlayer,
        multiMatchTurns: multiMatchTurns,
        claimableHistogram: claimableHistogram,
        meanClaimableCards: this.claimChances.length > 0 ? claimableTotal / this.claimChances.length : 0,

        // 6. Reserves
        teaReservesTaken: this.teaReserves.length,

        // 7. Deck reshuffles
        deckReshuffles: this.deckReshuffles,

        // 8. Cupcake economy
        cupcakePlateGains: this.cupcakePlateGains,
        cupcakeInflux: cupcakeInflux,
        cupcakeInfluxTotals: cupcakeInfluxTotals,
        cupcakeSpend: cupcakeSpend,
        cupcakeSpendTotals: cupcakeSpendTotals,
        maxCupcakesHeld: this.maxCupcakesHeld,

        // 9. Bag skew
        bagFlushCount: this.bagFlushCount,
        returnedColours: { ...this.returnedColours },
        dealtColours: { ...this.dealtColours },
        tilesReturned: this.tilesReturned,
        tilesDealtAfterFlush: this.tilesDealtAfterFlush,
        immediateReturns: this.immediateReturns,

        firstPlatingRow: { ...this.firstPlatingRow },
      };
    },
  };

  return collector;
}
