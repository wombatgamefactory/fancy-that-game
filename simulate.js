import { createGame, sweep, takeBonusTile, declineBonusTile, place, claim, skipClaim, skipMove, moveTile, refill, orderTea, teaReserve, teaReserveMustPass, getValidSweeps, getValidPlacements, calculateFinalScores, STAND_ROW_VALUES } from './src/engine/game.js';
import { createStatsCollector } from './src/engine/statsCollector.js';
import * as fastBot from './src/bots/fastBot.js';
import * as basicBot from './src/bots/basicBot.js';
import * as randomBot from './src/bots/randomBot.js';

// THE REPORT THIS HARNESS PRINTS is the 28 July design doc's "Metrics to log per
// simulated/real game" list, which SUPERSEDES the 24 July one. The ten sections
// below are numbered to match the doc, so a finding can be read straight back
// against the design question that asked for it. Anything the old list reported
// that no live rule produces has been deleted rather than left running beside it.
//
// ONE of the ten cannot be simulated: metric 6 also asks for the reserve round's
// TIME cost, which is a stopwatch measure of a real table. The printout says so
// rather than inventing a proxy for it.

const BOT_STRATEGIES = {
  basic: basicBot,
  fast: fastBot,
  random: randomBot,
};

function runGame(playerConfigs, botStrategy) {
  const statsCollector = createStatsCollector();
  const strategy = BOT_STRATEGIES[botStrategy] || fastBot;

  let gameState = createGame(playerConfigs, statsCollector);
  // Driver phase-STEPS, not turns. One real turn is several passes round this
  // loop (sweep, place, move, claim, refill, plus one reserve step per player on
  // a refresh turn), so this runs about five times the turn count. It exists only
  // as the runaway guard; the real turn count is gameState.stats.turnsPlayed and
  // that is what the report calls "turns".
  let steps = 0;
  const maxSteps = 1000;
  // Cards a flush sweeps into the discard pile (counted at each tea round's last
  // reserve decision, just before finishTeaRound clears the market remainder).
  // Context for metric 7: this burn is what makes reshuffles routine.
  let cardsDiscardedByFlushes = 0;

  while (!gameState.gameOver && steps < maxSteps) {
    switch (gameState.gamePhase) {
      case 'sweep': {
        if (gameState.bonusTileAvailable) {
          // A line-clearing sweep earned a bonus tile. Take one if the strategy
          // wants it and a tile exists, otherwise decline and advance to place.
          const bonusIdx = strategy.decideBonusTile ? strategy.decideBonusTile(gameState) : null;
          if (bonusIdx !== null && bonusIdx !== undefined && gameState.market[bonusIdx]) {
            gameState = takeBonusTile(gameState, bonusIdx);
          } else {
            gameState = declineBonusTile(gameState);
          }
          break;
        }
        // Driver contract: at the start of a turn, first offer the fresh-pot-of-
        // tea flush; only if the strategy declines (or lacks the hook) do we
        // sweep as before. The strategies gate themselves on canOrderTea, so a
        // true here is always legal. A MANDATORY refresh (empty tile market)
        // never reaches this branch — the engine has already put the game into
        // the 'teaReserve' phase below before the turn starts.
        if (strategy.decideOrderTea && strategy.decideOrderTea(gameState)) {
          gameState = orderTea(gameState);
          break;
        }
        const decision = strategy.decideSweep(gameState);
        if (decision) {
          gameState = sweep(gameState, decision.rowOrCol, decision.isRow, decision.declaration, decision.declarationType);
        } else {
          // No legal sweep (market emptied) — advance so the engine can reach
          // its end-of-game check instead of spinning in the sweep phase.
          gameState.gamePhase = 'place';
        }
        break;
      }
      case 'teaReserve': {
        // The DECIDING player is teaReserverIndex, not currentPlayerIndex. Fast-
        // path a forced pass (reserve full or market empty) without consulting
        // the bot, otherwise ask THAT player's strategy which card to reserve.
        // Drives voluntary and mandatory refreshes identically — the reserve
        // round is the same either way (gameState.refreshIsMandatory only
        // matters to a UI that must not offer a cancel).
        const reserverIndex = gameState.teaReserverIndex;
        let cardId = null;
        if (!teaReserveMustPass(gameState)) {
          cardId = strategy.decideTeaReserve ? strategy.decideTeaReserve(gameState, reserverIndex) : null;
        }
        // On the final reserve decision, whatever is left in the market (minus a
        // card this reserver takes) is about to be flushed to the discard.
        if (gameState.teaReservesRemaining === 1) {
          const taken = (cardId !== null && cardId !== undefined) ? 1 : 0;
          cardsDiscardedByFlushes += Math.max(0, gameState.cardMarket.length - taken);
        }
        gameState = teaReserve(gameState, cardId);
        break;
      }
      case 'place': {
        // Board overflow is handled by the engine at the transition into this
        // phase (checkBoardOverflowOnPlace), so any state seen here is placeable.
        const placements = strategy.decidePlacements(gameState);
        gameState = place(gameState, placements);
        break;
      }
      case 'move': {
        // Cupcake move: relocate one tile when it completes an otherwise
        // unclaimable card this turn.
        const moveDecision = strategy.decideMove ? strategy.decideMove(gameState) : null;
        if (moveDecision) {
          gameState = moveTile(gameState, moveDecision.fromIndex, moveDecision.toIndex);
        }
        gameState = skipMove(gameState);
        break;
      }
      case 'claim': {
        const decision = strategy.decideClaim(gameState);
        if (decision && decision.cardId) {
          gameState = claim(gameState, decision.cardId, decision.removedBoardIndex, decision.destination);
        } else {
          gameState = skipClaim(gameState);
        }
        break;
      }
      case 'refill': {
        gameState = refill(gameState);
        break;
      }
    }

    steps++;
  }

  if (gameState.gameOver) {
    calculateFinalScores(gameState);
  }

  // Per-player end-of-game metrics: final score, cards claimed, and the
  // stand/crumb breakdown (plate = tiles banked on the cake stand, crumb =
  // tiles sent to the crumb tray). Kept cupcakes ARE the cupcake VP, 1 each.
  const perPlayer = gameState.players.map(p => {
    let standScore = 0;
    let standTiles = 0;
    for (let i = 0; i < p.stand.length; i++) {
      const row = p.stand[i];
      standTiles += row.tiles.length;
      if (row.tiles.length > 0) standScore += STAND_ROW_VALUES[i][row.tiles.length - 1];
    }
    return {
      score: p.score,
      claims: p.claimedCards.length,
      standScore,
      standTiles,
      crumbs: p.crumbTray.length,
      cupcakes: p.cupcakes,
      cardVp: p.score - standScore - p.crumbTray.length - p.cupcakes,
    };
  });

  // Blowout check (standing D1 watch): the winner-vs-last score gap this game.
  const gameScores = perPlayer.map(p => p.score);
  const scoreSpread = Math.max(...gameScores) - Math.min(...gameScores);

  // A reserve is "completed" when the reserving player's claimedCards contains
  // the reserved card's id (claim() pushes it there).
  let reservesCompleted = 0;
  for (const r of statsCollector.teaReserves) {
    if (gameState.players[r.playerId].claimedCards.includes(r.cardId)) reservesCompleted++;
  }

  return {
    gameState,
    steps,
    turnsPlayed: gameState.stats.turnsPlayed,
    endReason: gameState.endGameReason,
    perPlayer,
    scoreSpread,
    report: statsCollector.getReport(),
    // Metric 3's fourth figure: the CARD row length the game finished on. Read
    // off the state rather than collected, since "the end" is not an event the
    // collector sees.
    endRowSize: gameState.cardMarket.length,
    cardsDiscardedByFlushes,
    reservesCompleted,
  };
}

// --- small aggregation helpers ---------------------------------------------
const sumOf = (arr) => arr.reduce((a, v) => a + v, 0);
const meanOf = (arr) => (arr.length ? sumOf(arr) / arr.length : 0);
const minOf = (arr) => (arr.length ? Math.min(...arr) : 0);
const maxOf = (arr) => (arr.length ? Math.max(...arr) : 0);
const pct = (n, d) => (d > 0 ? (100 * n / d).toFixed(1) + '%' : 'n/a');
// Render a sparse count array as "0:12  1:30  2:8", skipping empty buckets.
function histLine(counts) {
  const parts = [];
  for (let i = 0; i < counts.length; i++) {
    if (counts[i]) parts.push(`${i}:${counts[i]}`);
  }
  return parts.length ? parts.join('  ') : '(none)';
}
function addInto(target, source) {
  for (const key in source) target[key] = (target[key] || 0) + source[key];
}

const gamesPerConfig = parseInt(process.argv[2]) || 10;
const playerCount = parseInt(process.argv[3]) || 3;
const botStrategy = process.argv[4] || 'fast';

console.log(`Running ${gamesPerConfig} games with ${playerCount} players (${botStrategy} bot)...\n`);

const games = [];
const allPlayerMetrics = [];
const endReasonCounts = {};
const startTime = Date.now();

for (let i = 0; i < gamesPerConfig; i++) {
  const playerConfigs = Array.from({ length: playerCount }, (_, idx) => ({
    name: `Bot ${idx + 1}`,
    aiDifficulty: botStrategy,
    isHuman: false,
  }));

  const result = runGame(playerConfigs, botStrategy);
  games.push(result);
  for (const pm of result.perPlayer) allPlayerMetrics.push(pm);
  endReasonCounts[result.endReason || 'none'] = (endReasonCounts[result.endReason || 'none'] || 0) + 1;

  if ((i + 1) % Math.max(1, Math.floor(gamesPerConfig / 10)) === 0 || gamesPerConfig <= 10) {
    console.log(`  Game ${i + 1}/${gamesPerConfig} completed in ${result.turnsPlayed} turns`);
  }
}

const elapsed = Date.now() - startTime;
const reports = games.map(g => g.report);
const nGames = games.length;
const nPlayers = allPlayerMetrics.length;

// ---------------------------------------------------------------------------
// Tile-market baseline. Not one of the ten, but it is the shape of the tile game
// all ten sit on top of, and the end screen reports the same figures.
// ---------------------------------------------------------------------------
console.log(`\n=== TILE MARKET BASELINE (${nGames} games) ===\n`);
console.log(`Sweeps/game:       mean=${meanOf(reports.map(r => r.sweepCount)).toFixed(2)}, min=${minOf(reports.map(r => r.sweepCount))}, max=${maxOf(reports.map(r => r.sweepCount))}`);
console.log(`Sweep size:        mean=${meanOf(reports.map(r => parseFloat(r.avgSweepSize))).toFixed(2)}, largest single sweep=${maxOf(reports.map(r => r.maxSweepSize))}`);
console.log(`Tiles taken/game:  mean=${meanOf(reports.map(r => r.totalTilesTaken)).toFixed(2)}, max=${maxOf(reports.map(r => r.totalTilesTaken))} (from a 100-tile bag)`);

// ---------------------------------------------------------------------------
// 1. REFRESH CADENCE. Target: spread through the game, realistic firing around 3
//    symbols. Named failure modes: (A) firing at every legal opportunity - the
//    knob for that is raising REFRESH_THRESHOLD to 3; (B) a bad-for-everyone
//    market sitting unflushed while players wait each other out.
// ---------------------------------------------------------------------------
const allRefreshes = reports.flatMap(r => r.refreshes);
const refreshesPerGame = reports.map(r => r.refreshCount);
const symbolDist = [0, 0, 0, 0, 0, 0];
for (const r of reports) for (let s = 0; s <= 5; s++) symbolDist[s] += r.refreshSymbolDist[s] || 0;
// WHERE in the game each refresh fired, as a fraction of that game's own length,
// bucketed into quarters. This is the "spread through the game" test: a mean turn
// number cannot tell a spread apart from a cluster in the middle.
const quarters = [0, 0, 0, 0];
for (const g of games) {
  const len = Math.max(1, g.turnsPlayed);
  for (const r of g.report.refreshes) {
    quarters[Math.min(3, Math.floor(4 * r.turn / len))]++;
  }
}
// Failure mode A: voluntary refreshes as a share of the turn-starts where one was
// legal. Mandatory ones are excluded - nobody chose those.
const legalTurnStarts = sumOf(reports.map(r => r.refreshLegalTurns));
const voluntaryRefreshes = allRefreshes.filter(r => !r.mandatory).length;
// Failure mode B: the longest run of consecutive turns on which the refresh was
// legal and nobody took it.
const unflushedStreaks = reports.map(r => r.longestUnflushedStreak);
// Is one seat doing all the flushing? Largest share of a game's own refreshes
// fired by a single player.
const seatShares = games.filter(g => g.report.refreshCount > 0)
  .map(g => maxOf(Object.values(g.report.refreshesByPlayer)) / g.report.refreshCount);
const bySeat = {};
for (const r of allRefreshes) bySeat[r.playerId] = (bySeat[r.playerId] || 0) + 1;
console.log(`\n=== 1. REFRESH CADENCE (${allRefreshes.length} refreshes over ${nGames} games) ===\n`);
console.log(`Refreshes/game:    mean=${meanOf(refreshesPerGame).toFixed(2)}, min=${minOf(refreshesPerGame)}, max=${maxOf(refreshesPerGame)}`);
console.log(`Games with >=1:    ${refreshesPerGame.filter(v => v > 0).length}/${nGames}`);
console.log(`Symbols at firing: mean=${meanOf(allRefreshes.map(r => r.symbols)).toFixed(2)}, dist 0/1/2/3/4/5 = ${symbolDist.join('/')}`);
console.log(`Tiles left at pot: mean=${meanOf(allRefreshes.map(r => r.tilesLeft)).toFixed(2)}, min=${minOf(allRefreshes.map(r => r.tilesLeft))}, max=${maxOf(allRefreshes.map(r => r.tilesLeft))} (of 25 cells)`);
console.log(`Reward collected:  total=${sumOf(allRefreshes.map(r => r.reward))}, mean/refresh=${meanOf(allRefreshes.map(r => r.reward)).toFixed(2)} cupcakes`);
console.log(`Firing turn:       mean=${meanOf(allRefreshes.map(r => r.turn)).toFixed(1)}, min=${minOf(allRefreshes.map(r => r.turn))}, max=${maxOf(allRefreshes.map(r => r.turn))}`);
console.log(`Spread over game:  quarters Q1/Q2/Q3/Q4 = ${quarters.join('/')} (an even split is "spread through the game")`);
console.log(`Fired by seat:     ${JSON.stringify(bySeat)}; one seat's share of its own game mean=${(100 * meanOf(seatShares)).toFixed(1)}%`);
console.log(`FAILURE MODE A (fires at every legal chance): ${voluntaryRefreshes} voluntary refreshes over ${legalTurnStarts} legal turn-starts = ${pct(voluntaryRefreshes, legalTurnStarts)} take-up`);
console.log(`FAILURE MODE B (bad market left unflushed):   longest legal-but-unflushed run mean=${meanOf(unflushedStreaks).toFixed(2)}, max=${maxOf(unflushedStreaks)} turns`);

// ---------------------------------------------------------------------------
// 2. MANDATORY (EMPTY-BOARD) REFRESHES. Should be rare.
// ---------------------------------------------------------------------------
const mandatoryPerGame = reports.map(r => r.mandatoryRefreshCount);
const mandatoryTurns = reports.flatMap(r => r.mandatoryRefreshTurns);
console.log(`\n=== 2. MANDATORY (EMPTY-BOARD) REFRESHES ===\n`);
console.log(`Per game:          mean=${meanOf(mandatoryPerGame).toFixed(3)}, max=${maxOf(mandatoryPerGame)}, games affected=${mandatoryPerGame.filter(v => v > 0).length}/${nGames}`);
console.log(`Share of all refreshes: ${pct(sumOf(mandatoryPerGame), allRefreshes.length)}`);
console.log(`Turn numbers:      ${mandatoryTurns.length ? mandatoryTurns.slice(0, 30).join(', ') + (mandatoryTurns.length > 30 ? ' ...' : '') : '(none)'}`);

// ---------------------------------------------------------------------------
// 3. CARD ROW SIZE. One sample per real turn, taken at the START of that turn
//    (before a refresh could flush it back to INITIAL_MARKET_CARDS). Feeds the
//    initialMarketCards knob - the row is capped at MAX_MARKET_CARDS (30 July).
// ---------------------------------------------------------------------------
const allRowSizes = reports.flatMap(r => r.rowSizes);
const rowHist = [];
for (const size of allRowSizes) rowHist[size] = (rowHist[size] || 0) + 1;
const firstClaimRowSizes = reports.map(r => r.firstClaimRowSize).filter(v => v !== null);
const firstClaimTurns = reports.map(r => r.firstClaimTurn).filter(v => v !== null);
const endRowSizes = games.map(g => g.endRowSize);
console.log(`\n=== 3. CARD ROW SIZE (${allRowSizes.length} turn samples) ===\n`);
console.log(`Row size/turn:     mean=${meanOf(allRowSizes).toFixed(2)}, min=${minOf(allRowSizes)}, max=${maxOf(allRowSizes)}`);
// The physical-table check: each game's own peak row. "max" above is the single
// worst turn of the whole batch; this line says how big the row gets in a
// TYPICAL game, which is what decides whether the card row fits on a table.
const gamePeakRows = reports.map(r => r.maxRowSize);
console.log(`Per-game peak:     mean=${meanOf(gamePeakRows).toFixed(2)}, min=${minOf(gamePeakRows)}, max=${maxOf(gamePeakRows)}`);
console.log(`  distribution:    ${histLine(rowHist)}`);
console.log(`At FIRST claim:    mean=${meanOf(firstClaimRowSizes).toFixed(2)}, max=${maxOf(firstClaimRowSizes)} (first claim lands on turn mean=${meanOf(firstClaimTurns).toFixed(2)})`);
console.log(`At game end:       mean=${meanOf(endRowSizes).toFixed(2)}, max=${maxOf(endRowSizes)}`);

// ---------------------------------------------------------------------------
// 4. CARD-LOCK INCIDENCE. A locked turn is one where the active player reached
//    their claim step with no legal claim against the whole row OR their reserve.
//    The 27 July lock (every card wanting a colour absent from market and boards)
//    should be structurally impossible to SUSTAIN now, because the row grows by a
//    card every single turn - so the streak line is the one that decides it.
// ---------------------------------------------------------------------------
const claimSteps = sumOf(reports.map(r => r.claimChanceSamples));
const lockTurns = sumOf(reports.map(r => r.lockTurns));
const lockStreaks = reports.flatMap(r => Object.values(r.longestLockStreakByPlayer));
const streakHist = [];
for (const s of lockStreaks) streakHist[s] = (streakHist[s] || 0) + 1;
console.log(`\n=== 4. CARD-LOCK INCIDENCE (${claimSteps} claim steps) ===\n`);
console.log(`Locked turns:      ${lockTurns}/${claimSteps} (${pct(lockTurns, claimSteps)})`);
console.log(`Games with >=1:    ${reports.filter(r => r.lockTurns > 0).length}/${nGames}`);
console.log(`Longest lock streak per player: max=${maxOf(lockStreaks)}, mean=${meanOf(lockStreaks).toFixed(2)}`);
console.log(`  streak lengths:  ${histLine(streakHist)} (player-results counted by their worst run of consecutive locked turns)`);

// ---------------------------------------------------------------------------
// 5. MULTI-MATCH FREQUENCY. Turns where the player could legally have claimed 2+
//    cards - the turns on which one-claim-per-turn actually bit. This is the
//    evidence for or against the pre-agreed extraClaimCupcakeCost variant.
// ---------------------------------------------------------------------------
const multiMatchTurns = sumOf(reports.map(r => r.multiMatchTurns));
const claimableHist = [];
for (const r of reports) {
  for (let i = 0; i < r.claimableHistogram.length; i++) {
    claimableHist[i] = (claimableHist[i] || 0) + r.claimableHistogram[i];
  }
}
console.log(`\n=== 5. MULTI-MATCH FREQUENCY (${claimSteps} claim steps) ===\n`);
console.log(`Turns with 2+ claimable: ${multiMatchTurns}/${claimSteps} (${pct(multiMatchTurns, claimSteps)})`);
console.log(`Claimable cards/turn:    mean=${meanOf(reports.map(r => r.meanClaimableCards)).toFixed(2)}`);
console.log(`  distribution:          ${histLine(claimableHist)} (cards claimable when the claim step opened)`);

// ---------------------------------------------------------------------------
// 6. CLAIMS FROM RESERVES.
// ---------------------------------------------------------------------------
const reserveClaims = sumOf(reports.map(r => r.reserveClaims));
const totalClaims = sumOf(reports.map(r => r.totalCardsClaimed));
const reservesTaken = sumOf(reports.map(r => r.teaReservesTaken));
const reservesCompleted = sumOf(games.map(g => g.reservesCompleted));
console.log(`\n=== 6. CLAIMS FROM RESERVES ===\n`);
console.log(`From reserve:      ${reserveClaims}/${totalClaims} claims (${pct(reserveClaims, totalClaims)})`);
console.log(`Reserves taken:    ${reservesTaken} (mean/game=${(reservesTaken / nGames).toFixed(2)}), completed ${reservesCompleted} (${pct(reservesCompleted, reservesTaken)})`);
console.log(`Reserve-round TIME cost: NOT SIMULABLE - a stopwatch measure of a real table. Time it in playtest; the fallback if it drags is flusher-only reserves.`);

// ---------------------------------------------------------------------------
// 7. DECK RESHUFFLES. Expected to be routine now: about a card a turn dealt out,
//    plus a whole row burned at every flush.
// ---------------------------------------------------------------------------
const reshuffles = reports.map(r => r.deckReshuffles);
const flushBurn = games.map(g => g.cardsDiscardedByFlushes);
console.log(`\n=== 7. DECK RESHUFFLES ===\n`);
console.log(`Per game:          mean=${meanOf(reshuffles).toFixed(2)}, min=${minOf(reshuffles)}, max=${maxOf(reshuffles)}`);
console.log(`Games with >=1:    ${reshuffles.filter(v => v > 0).length}/${nGames}`);
console.log(`Cards burned by flushes: mean/game=${meanOf(flushBurn).toFixed(2)} (the reason reshuffles are routine)`);

// ---------------------------------------------------------------------------
// 8. CUPCAKE ECONOMY. Influx by source, spend by use, kept-cupcake VP, and the
//    PHYSICAL SUPPLY question. The rules have had no cupcake cap since 24 July,
//    so the last block MEASURES whether a 16-token supply would ever run dry. It
//    caps nothing and changes no rule.
// ---------------------------------------------------------------------------
const influx = { start: 0, pot: 0, plates: 0 };
const spend = { move: 0, extraClaim: 0 };
for (const r of reports) {
  addInto(influx, r.cupcakeInfluxTotals);
  addInto(spend, r.cupcakeSpendTotals);
}
const influxTotal = influx.start + influx.pot + influx.plates;
const spendTotal = spend.move + spend.extraClaim;
const keptCupcakes = sumOf(allPlayerMetrics.map(m => m.cupcakes));
const totalScore = sumOf(allPlayerMetrics.map(m => m.score));
const peakHeld = reports.map(r => r.maxCupcakesHeld);
const gamesOver16 = peakHeld.filter(v => v > 16).length;
console.log(`\n=== 8. CUPCAKE ECONOMY (${nPlayers} player-results) ===\n`);
console.log(`Influx by source:  start=${influx.start}, refresh pot=${influx.pot}, plates=${influx.plates}, total=${influxTotal}`);
console.log(`  mean/player:     start=${(influx.start / nPlayers).toFixed(2)}, pot=${(influx.pot / nPlayers).toFixed(2)}, plates=${(influx.plates / nPlayers).toFixed(2)}, total=${(influxTotal / nPlayers).toFixed(2)}`);
console.log(`Spend by use:      move=${spend.move}, extra claim=${spend.extraClaim} (variant ships disabled), total=${spendTotal} = ${pct(spendTotal, influxTotal)} of influx`);
console.log(`Kept at game end:  ${keptCupcakes} = ${(keptCupcakes / nPlayers).toFixed(2)} VP/player, ${pct(keptCupcakes, totalScore)} of all VP scored`);
console.log(`SUPPLY WATCH (16 tokens in the box; the RULES have no cap):`);
console.log(`  peak held simultaneously across all players: mean=${meanOf(peakHeld).toFixed(2)}, max=${maxOf(peakHeld)}`);
console.log(`  games whose peak exceeded 16 tokens: ${gamesOver16}/${nGames} (${pct(gamesOver16, nGames)})`);

// ---------------------------------------------------------------------------
// 9. BAG SKEW. The refresh is a full destructive flush, so the same tiles cycle
//    board -> bag -> board. A colour nobody sweeps shows up as a surplus in the
//    flushed-back distribution against the bag's flat 20% per colour.
// ---------------------------------------------------------------------------
const returned = {};
const dealt = {};
for (const r of reports) {
  addInto(returned, r.returnedColours);
  addInto(dealt, r.dealtColours);
}
const tilesReturned = sumOf(reports.map(r => r.tilesReturned));
const tilesDealt = sumOf(reports.map(r => r.tilesDealtAfterFlush));
const immediateReturns = sumOf(reports.map(r => r.immediateReturns));
console.log(`\n=== 9. BAG SKEW (${sumOf(reports.map(r => r.bagFlushCount))} flushes) ===\n`);
console.log(`Bag baseline is a flat 20.0% per colour (20 of each in 100 tiles).`);
for (const colour of Object.keys(returned).sort()) {
  const rShare = 100 * (returned[colour] || 0) / (tilesReturned || 1);
  const dShare = 100 * (dealt[colour] || 0) / (tilesDealt || 1);
  console.log(`  ${colour.padEnd(7)} flushed back ${rShare.toFixed(1).padStart(5)}%   dealt out ${dShare.toFixed(1).padStart(5)}%   (skew ${(rShare - 20).toFixed(1).padStart(5)} pts)`);
}
console.log(`Tiles returned=${tilesReturned}, dealt back out=${tilesDealt}, of which ${immediateReturns} came straight back (${pct(immediateReturns, tilesDealt)} of a "fresh" board is recycled)`);

// ---------------------------------------------------------------------------
// 10. PER-PLAYER CLAIMS, FINAL SCORE SPREAD (standing D1 blowout watch) and GAME
//     LENGTH (standing D3 watch - real sessions still need timing).
// ---------------------------------------------------------------------------
const scores = allPlayerMetrics.map(m => m.score);
const claimsPer = allPlayerMetrics.map(m => m.claims);
const claimGaps = games.map(g => maxOf(g.perPlayer.map(p => p.claims)) - minOf(g.perPlayer.map(p => p.claims)));
const spreads = games.map(g => g.scoreSpread);
const turnsPerGame = games.map(g => g.turnsPlayed);
const stepsPerGame = games.map(g => g.steps);
const totalStandTiles = sumOf(allPlayerMetrics.map(m => m.standTiles));
const totalCrumbs = sumOf(allPlayerMetrics.map(m => m.crumbs));
const totalCardVp = sumOf(allPlayerMetrics.map(m => m.cardVp));
const totalStandScore = sumOf(allPlayerMetrics.map(m => m.standScore));
console.log(`\n=== 10. CLAIMS, SCORES AND GAME LENGTH (${nPlayers} player-results) ===\n`);
console.log(`Claims/player:     mean=${meanOf(claimsPer).toFixed(2)}, min=${minOf(claimsPer)}, max=${maxOf(claimsPer)}`);
console.log(`  within-game gap: mean=${meanOf(claimGaps).toFixed(2)}, max=${maxOf(claimGaps)} (most claims minus fewest, per game)`);
console.log(`Final score:       mean=${meanOf(scores).toFixed(1)}, min=${minOf(scores)}, max=${maxOf(scores)}`);
console.log(`Score spread (D1): mean=${meanOf(spreads).toFixed(1)}, min=${minOf(spreads)}, max=${maxOf(spreads)} (winner-vs-last, per game)`);
console.log(`Score make-up:     stand=${(totalStandScore / nPlayers).toFixed(1)}, cards=${(totalCardVp / nPlayers).toFixed(1)}, crumbs=${(totalCrumbs / nPlayers).toFixed(1)}, cupcakes=${(keptCupcakes / nPlayers).toFixed(1)} VP/player`);
console.log(`  card:stand VP    = ${totalCardVp}:${totalStandScore} (card share ${pct(totalCardVp, totalCardVp + totalStandScore)})`);
console.log(`  plate:crumb tiles= ${totalStandTiles}:${totalCrumbs} (crumb share ${pct(totalCrumbs, totalStandTiles + totalCrumbs)})`);
console.log(`Game length (D3):  turns mean=${meanOf(turnsPerGame).toFixed(1)}, min=${minOf(turnsPerGame)}, max=${maxOf(turnsPerGame)}`);
console.log(`  driver phase-steps (NOT turns): mean=${meanOf(stepsPerGame).toFixed(1)} - the loop runs several times per turn`);
console.log(`End reasons:       ${JSON.stringify(endReasonCounts)}`);

console.log(`\nCompleted ${gamesPerConfig} games in ${elapsed}ms (${(elapsed / gamesPerConfig).toFixed(1)}ms/game)`);
