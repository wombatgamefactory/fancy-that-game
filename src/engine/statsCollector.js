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
//    6  Claims from reserves as a fraction of all claims. (3 August: reserving is
//       a PAID own-turn action, so the reserve ROUND and its time cost are gone.)
//    7  Deck reshuffles per game.
//    8  Cupcake economy - influx by source, spend by use, and the high-water mark
//       of cupcakes held simultaneously across all players (the 16-token physical
//       supply check; the engine models NO cupcake cap, so this MEASURES whether
//       the component count is sufficient, it does not enforce anything).
//    9  Bag skew - colours flushed back to the bag versus colours dealt out again.
//   10  Per-player claims, final score spread and game length - all readable from
//       the finished game state, so simulate.js reports them from there.
//   13  THE TASTING MENU (5 August, not from the 28 July list). Which menus were
//       dealt, and which player took each one and on what turn. The number the
//       module lives or dies by is DEAD CARDBOARD - the share of dealt menus
//       nobody ever takes. The unsteered floor is 81%; a menu-aware bot that
//       cannot push it well below half means the deck is too steep. That is
//       exactly what happened to the four-tile deck (57.9%), which was replaced
//       on 5 August by the three-tile one (21.9%).
//       (It replaced a Freshness Bonus section that measured a collision rate
//       against a per-period token race, which itself replaced a Today's
//       Speciality / Teapot Track section. All three rules and all three metrics
//       are gone rather than left running beside the new one. The FRESHNESS
//       section also owned the by-tea-period buckets - claimsByPeriod,
//       tokensByPeriod, collisionsByPeriod - which are deleted with it: this
//       module has no periods, because it has no reset.)
//
// THE INGREDIENT-OBJECTIVE METRIC IS DELETED (4 August), along with the rule it
// measured - see the pantry-goals note at the top of game.js. It was an unnumbered
// section rather than one of the ten above, so nothing here is renumbered and
// there is no gap: recordObjectiveClaimed, the objectivesClaimed log, the
// per-seat breakdown and the "turn taken as a fraction of game length" report
// fields are simply gone. The design question it existed to answer - were the
// objectives resolving in the first two turns and becoming a turn-order lottery -
// has no subject any more.
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

    // Array of { count, declarationType } - one entry per sweep. declarationType
    // is 'colour' or 'symbol' and feeds the colour-vs-ingredient split, which is
    // the standing behavioural baseline metric 13 reports each flavour module
    // against (43.8 / 43.4 / 44.4% colour with no module at all).
    sweeps: [],
    cardsClaimedCount: 0,
    reserveClaimsCount: 0, // claims completed from a personal reserve (subset of the above)
    // Times the tile market was REFILLED after setup: one per fresh pot of tea,
    // whether ordered or forced by the empty-market rule. The opening deal is
    // NOT a refill and is deliberately not counted here - the end screen calls
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
    // Every PAID reserve (3 August): { playerId, cardId, turn }. The free
    // tea-round reserve is deleted, so this is now a record of a cupcake spend,
    // not of a round everybody sat through.
    reserves: [],
    // (The objectivesClaimed log lived here until 4 August, one entry per
    // ingredient-objective pair taken. The pantry goals are deleted, so it is
    // gone rather than left collecting an empty array - see the header note.)
    deckReshuffles: 0, // times the card discard was reshuffled into a fresh deck

    // --- 3. Card row size (and the trigger invariant) -----------------------
    // One sample per REAL turn, taken at the very start of that turn before
    // anything happens in it (see recordTurnStart's call site):
    //   { turn, playerId, rowSize, symbols, teaStillDue }
    // rowSize is gameState.cardMarket.length - the variable-length CARD row, not
    // the 5x5 tile market and not the player's personal board. teaStillDue is
    // isTeaDue at that instant - see the teaDueAtTurnStart derivation in getReport
    // for what it must read now that a due pot does not always get brewed.
    turnSamples: [],
    firstClaimRowSize: null, // row length when the game's FIRST claim landed
    firstClaimTurn: null,
    claimTurns: [],          // the turn number of EVERY claim, in order

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
    // Per-player cupcake spend by use:
    //   { playerId: { moveTile, extraTile, removePlate, dealCards, reserve, extraClaim } }
    // moveTile    = relocate a tile on your own board (1)
    // extraTile   = buy 1 extra market tile at the sweep step (1)
    // removePlate = buy an empty plate off your board, to the box (2)
    // dealCards   = pay to deal 2 new cards onto the card row (1)
    // reserve     = pay to take a market card into your personal reserve (1)
    // extraClaim  = the pre-agreed extra-claim variant, which ships disabled and
    //               so normally stays 0.
    //
    // THE TILE/PLATE SPLIT IS DELIBERATE AND WAS ONCE A BLOCKER. The two shared a
    // single `move` bucket until 3 August, so when the plate price changed there
    // was no way to tell whether that repriced something common or something
    // already rare. Do not merge them again.
    //
    // `movePlate` IS GONE, not renamed: moving a plate was deleted when removing
    // one was introduced, and they are different actions at different prices.
    // A run whose report still shows a movePlate bucket is running old code.
    //
    // `extraTile` WENT THE SAME WAY ON 8 AUGUST and CAME BACK ON 9 AUGUST, with
    // `dealCards` staying. The two buckets are NOT interchangeable and never
    // were: they buy different things on opposite sides of the game, so a run
    // comparing one against the other across 8 August is comparing two rules.
    // Runs from 9 August onward carry both, which is the first time either
    // bucket has been measured with the other on the menu.
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

    // --- 13. The Tasting Menu (5 August) ------------------------------------
    // The menu ids dealt this game, in deal order. An empty array when the module
    // is switched off. This is the DENOMINATOR for dead cardboard - the share of
    // dealt menus nobody takes - which is the number the module lives or dies by,
    // so it is recorded even in a game where nothing is ever taken.
    tastingMenuDeal: [],
    // One entry per menu TAKEN: { playerId, menuId, turn }. There is no losing
    // half to record, unlike the collision the Freshness Bonus was judged on: a
    // menu is not contested at a moment, it is contested over the whole game, and
    // the evidence of that is the DEFICIT DISTRIBUTION at game end, which is read
    // off the finished state rather than logged as it happens.
    tastingMenusTaken: [],
    // Menus taken, per player. The MEAN says what dose the module is delivering;
    // the MAX per game says whether one player can hoover the whole deal.
    tastingMenusByPlayer: {},

    // --- 14. The Flavour of the Day (6 August) ------------------------------
    // The ONE ingredient revealed at setup, or null when the module is off. There
    // is nothing else to log: this lane fires no events at all during play - it is
    // a setup draw and an end-game count - so the rest of metric 14 is read off
    // the finished boards by the harness.
    flavourOfTheDay: null,

    recordMarketFill() {
      this.marketFillCount = this.marketFillCount + 1;
    },

    recordSweep(tileCount, declarationType) {
      const count = parseInt(tileCount);
      if (isNaN(count) || count < 1) return;
      this.sweeps.push({ count: count, declarationType: declarationType || null });
    },

    // Which menus were dealt - once per game, from createGame. An empty array (the
    // module switched off for an A/B) is recorded as such rather than skipped, so
    // a run can tell "off" from "never called".
    recordTastingMenuDeal(menuIds) {
      this.tastingMenuDeal = Array.isArray(menuIds) ? [...menuIds] : [];
    },

    // Which ingredient was revealed as the Flavour of the Day - once per game,
    // from createGame. Null (the module switched off for an A/B) is recorded as
    // such rather than skipped, so a run can tell "off" from "never called". Over
    // a long run the five must come up evenly.
    recordFlavourDeal(ingredient) {
      this.flavourOfTheDay = typeof ingredient === 'string' ? ingredient : null;
    },

    // One menu taken, which can happen at most once per menu for the whole game.
    // The TURN is what answers the module's stated job: a module whose menus are
    // all taken in the last two turns is an end-of-game bonus, not a pressure
    // device, and has failed.
    recordTastingMenuTaken(playerId, menuId, turn) {
      if (playerId === undefined || playerId === null) return;
      this.tastingMenusTaken.push({
        playerId: playerId,
        menuId: menuId || null,
        turn: parseInt(turn) || 0,
      });
      this.tastingMenusByPlayer[playerId] = (this.tastingMenusByPlayer[playerId] || 0) + 1;
    },

    // fromReserve flags a claim completed out of a personal reserve (vs the shared
    // market), feeding the claims-from-reserve fraction. rowSize is the CARD row
    // length at the instant of the claim (the claimed card still counted, since
    // the engine records before it splices), which is how the "row size when the
    // first claim occurs" figure is captured.
    //
    // The fifth argument was the TEA PERIOD, and is deleted with the Freshness
    // Bonus that wanted it (5 August). The Tasting Menu has no periods because it
    // has no reset, so there is nothing to bucket claims by.
    recordCardClaimed(cardId, turn, fromReserve, rowSize) {
      this.cardsClaimedCount = this.cardsClaimedCount + 1;
      if (fromReserve) this.reserveClaimsCount = this.reserveClaimsCount + 1;
      if (this.firstClaimRowSize === null) {
        this.firstClaimRowSize = rowSize | 0;
        this.firstClaimTurn = parseInt(turn) || 0;
      }
      // Every claim's turn, so "claims by game third" can be read against each
      // game's own length. Kept as the standing behavioural baseline: 24 / 39 / 37%
      // with no flavour module at all, and 24.0 / 39.4 / 36.6% under Today's
      // Speciality, whose failure to move it one point is half of why it was
      // replaced.
      this.claimTurns.push(parseInt(turn) || 0);
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

    // A player PAID to reserve `cardId` on `turn`. Was recordTeaReserve, when
    // reserving was a free step of the tea round.
    recordReserve(playerId, cardId, turn) {
      if (!cardId) return;
      this.reserves.push({ playerId: playerId, cardId: cardId, turn: parseInt(turn) || 0 });
    },

    // (recordObjectiveClaimed was here. Deleted 4 August with the pantry goals;
    // the engine no longer calls it and nothing else should start.)

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

    // Spend `amount` cupcakes from `playerId` under `use`
    // ('moveTile' | 'extraTile' | 'removePlate' | 'dealCards' | 'reserve' | 'extraClaim').
    recordCupcakeSpend(playerId, use, amount) {
      if (playerId === undefined || playerId === null) return;
      const amt = amount | 0;
      if (amt <= 0) return;
      if (!this.cupcakeSpend[playerId]) {
        this.cupcakeSpend[playerId] = { moveTile: 0, extraTile: 0, removePlate: 0, dealCards: 0, reserve: 0, extraClaim: 0 };
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
      // Colour vs ingredient declarations. Any ingredient-scoring module should
      // pull this toward ingredient; how far is a design reading, not a target.
      // Today's Speciality moved it about one point and that was one of the two
      // readings that condemned it, so this is a live test of the replacement.
      const sweepsByDeclaration = { colour: 0, symbol: 0 };

      for (let i = 0; i < sweepCount; i++) {
        const sweepTiles = this.sweeps[i].count || 0;
        totalTilesTaken = totalTilesTaken + sweepTiles;
        if (sweepTiles > maxSweepSize) {
          maxSweepSize = sweepTiles;
        }
        const declaration = this.sweeps[i].declarationType;
        if (sweepsByDeclaration[declaration] !== undefined) sweepsByDeclaration[declaration]++;
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
      // owed. Since the 1 August rule change tea fires at the end of the turn that
      // reaches the threshold, so through the body of a game this must be ZERO: a
      // non-zero count there means a tea round was skipped, or a flush failed to
      // re-cover the symbols.
      //
      // THE INVARIANT HAS A LEGITIMATE EXCEPTION, and reading it as a flat "must
      // be 0" would report the end rule as a bug. When a pot is due and the bag is
      // already empty the game does NOT brew - since 6 August the pot simply does
      // not happen. Nothing refills the market from that point on, so the symbols
      // stay uncovered and EVERY remaining turn begins with tea still due.
      // (Until 6 August the same turns were produced by the 'bagEmpty' ENDING,
      // which stopped refilling for the same reason and then closed the game out
      // over one round. The ending is deleted; the uncovered late turns are not,
      // and they can now run for longer than a single round.)
      //
      // That is why the turn numbers are reported alongside the count. A driver
      // judging the invariant must check WHERE the samples fall: late in the game
      // they are the end rule working, earlier they are the hole the metric was
      // built to catch. See simulate.js's reading of it.
      //
      // It replaces the old refreshLegalTurns / longestUnflushedStreak pair, which
      // measured "was a voluntary refresh available and did anyone take it". Tea
      // is not a choice any more, so that question no longer has a subject.
      const rowSizes = [];
      let rowSizeTotal = 0;
      let maxRowSize = 0;
      let teaDueAtTurnStart = 0;
      const teaDueTurns = [];
      for (const s of this.turnSamples) {
        rowSizes.push(s.rowSize);
        rowSizeTotal += s.rowSize;
        if (s.rowSize > maxRowSize) maxRowSize = s.rowSize;
        if (s.teaStillDue) {
          teaDueAtTurnStart++;
          teaDueTurns.push(s.turn);
        }
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
      const SPEND_USES = ['moveTile', 'extraTile', 'removePlate', 'dealCards', 'reserve', 'extraClaim'];
      const cupcakeSpend = {};
      const cupcakeSpendTotals = {};
      for (const use of SPEND_USES) cupcakeSpendTotals[use] = 0;
      for (const pid in this.cupcakeSpend) {
        const src = this.cupcakeSpend[pid];
        cupcakeSpend[pid] = {};
        for (const use of SPEND_USES) {
          cupcakeSpend[pid][use] = src[use] || 0;
          cupcakeSpendTotals[use] += cupcakeSpend[pid][use];
        }
      }

      // (The ingredient-objective block was computed here - how many of the five
      // pairs were claimed, when as a fraction of game length, and by which seat.
      // Deleted 4 August with the rule; see the header note.)

      // --- 13. The Tasting Menu ----------------------------------------------
      // The MAX is reported alongside the total deliberately: the mean says what
      // dose the module is delivering, the max says whether one player hoovered it.
      let tastingMenusTotal = 0;
      let tastingMenusMax = 0;
      for (const pid in this.tastingMenusByPlayer) {
        const n = this.tastingMenusByPlayer[pid];
        tastingMenusTotal += n;
        if (n > tastingMenusMax) tastingMenusMax = n;
      }
      // DEAD CARDBOARD, computed here rather than left to the harness because the
      // pair of numbers must never be divided the wrong way round: dealt is the
      // denominator, and a menu is dead when the game ends with nobody having
      // taken it.
      const menusDealt = this.tastingMenuDeal.length;
      const menusDead = Math.max(0, menusDealt - this.tastingMenusTaken.length);

      return {
        marketFills: this.marketFillCount,
        // Reported raw and DELIBERATELY unclamped. It used to be clamped to the
        // bag size, which did not fix an over-count - it just hid one behind a
        // permanent "bag / bag" reading on the end screen. If this ever exceeds
        // TILE_BAG_SIZE, that is a real bug worth seeing.
        //
        // NO LITERAL HERE, EVER. This clamp was written for a 100-tile bag, was
        // silently wrong for the whole life of the 125-tile bag, and the bag is
        // 100 again since 4 August - which is exactly why any consumer that wants
        // to show the total against the bag must import TILE_BAG_SIZE from
        // tiles.js rather than typing the number.
        totalTilesTaken: totalTilesTaken,
        totalCardsClaimed: this.cardsClaimedCount,
        reserveClaims: this.reserveClaimsCount,
        maxSweepSize: maxSweepSize,
        avgSweepSize: avgSweepSize,
        sweepCount: sweepCount,
        sweepsByDeclaration: sweepsByDeclaration,
        cardMarketAvgLifetime: avgCardMarketLife,

        // 1. Refresh cadence
        refreshCount: this.refreshes.length,
        refreshes: this.refreshes.map(r => ({ ...r })),
        refreshSymbolDist: symbolDist,
        refreshesByPlayer: refreshesByPlayer,
        refreshRewardTotal: refreshRewardTotal,
        teaDueAtTurnStart: teaDueAtTurnStart,
        // The turns those samples fell on, so a driver can tell the final round's
        // legitimate firings from a real hole in the trigger - see above.
        teaDueTurns: teaDueTurns,

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
        claimTurns: this.claimTurns.slice(),

        // 4/5. Card lock and multi-match
        claimChanceSamples: this.claimChances.length,
        lockTurns: lockTurns,
        lockTurnsByPlayer: lockTurnsByPlayer,
        longestLockStreakByPlayer: longestLockStreakByPlayer,
        multiMatchTurns: multiMatchTurns,
        claimableHistogram: claimableHistogram,
        meanClaimableCards: this.claimChances.length > 0 ? claimableTotal / this.claimChances.length : 0,

        // 6. Reserves (PAID since 3 August)
        reservesTaken: this.reserves.length,
        reserves: this.reserves.map(r => ({ ...r })),

        // (objectivesClaimedCount / objectivesClaimed / objectivesBySeat were
        // reported here until 4 August. A report that still carries them is
        // running old code.)

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

        // 13. The Tasting Menu
        tastingMenuDeal: [...this.tastingMenuDeal],
        tastingMenusTaken: this.tastingMenusTaken.map(t => ({ ...t })),
        // DEAD CARDBOARD's two halves, reported raw so the harness can print the
        // sample size beside the share. Unsteered floor is 81% dead; a menu-aware
        // bot that cannot push it well below half condemns the four-tile deck.
        menusDealt: menusDealt,
        menusDead: menusDead,
        tastingMenusTotal: tastingMenusTotal,
        tastingMenusByPlayer: { ...this.tastingMenusByPlayer },
        tastingMenusMax: tastingMenusMax,
        // The turn each menu was taken on. If these cluster in the last two turns
        // the module is an end-of-game bonus rather than a pressure device and has
        // failed at its stated job - see metric 13's time-to-first-menu line.
        tastingMenuTurns: this.tastingMenusTaken.map(t => t.turn),

        // 14. The Flavour of the Day. ONE STRING, or null when the module is off.
        // Everything else metric 14 reports is a fact about the FINISHED BOARDS
        // rather than an event - counts, the majority, the lead margin - so the
        // harness reads it off the state exactly as it does the contested-menu
        // figure. This is the only thing the collector can see that it cannot.
        flavourOfTheDay: this.flavourOfTheDay,
      };
    },
  };

  return collector;
}
