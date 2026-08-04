import { createGame, sweep, takeBonusTile, declineBonusTile, takeExtraTile, place, claim, skipClaim, skipSpend, moveTile, removePlate, reserveCard, refill, getValidSweeps, getValidPlacements, calculateFinalScores, getWinningPlayers, STAND_ROW_VALUES, getStartingCupcakes } from './src/engine/game.js';
// COLOURS is imported for the bag-skew baseline arithmetic, not for colour logic:
// the per-colour share and the tiles-per-colour figure are both DERIVED here, so
// a change to TILE_COPIES or to the colour list moves the report with it. The
// bag size has twice been hardcoded into a report string in this file's history.
import { TILE_BAG_SIZE, TILE_COPIES, TILE_COLOUR_SHARE_PCT, COLOURS } from './src/engine/tiles.js';
import { createStatsCollector } from './src/engine/statsCollector.js';

// Cupcake tokens the 3 August component list proposes for the box (was 16). The
// supply watch in metric 8 measures against this - it constrains nothing in play,
// because the RULES have no cupcake cap.
const CUPCAKE_TOKENS_IN_BOX = 30;
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
//
// SECTIONS 11 AND 12 ARE NOT FROM THAT LIST. They are rule-conformance readings
// bolted onto the metrics run because they need thousands of games to be worth
// anything: 11 verifies the 4 August equal-turns rule, 12 verifies the staggered
// starting cupcakes. (11 used to be the ingredient-objective report; the pantry
// goals were deleted on 4 August and it was reused rather than left as a gap.)

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
  // Cards a flush sweeps into the discard pile, read off the report's per-card
  // tracking rather than counted at a reserve decision - there is no reserve
  // round left to count at (3 August). Context for metric 7: this burn is what
  // makes reshuffles routine.
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
        // 1 August: there is no "order tea" decision to offer here any more. Tea
        // fires automatically at the END of a turn, from inside refill(), so the
        // sweep phase is just a sweep. (3 August: the interactive 'teaReserve'
        // phase this comment used to hand off to is deleted - a pot resolves
        // start to finish inside refill() and parks nothing.)
        const decision = strategy.decideSweep(gameState);
        if (decision) {
          gameState = sweep(gameState, decision.rowOrCol, decision.isRow, decision.declaration, decision.declarationType);
        } else {
          // No legal sweep (market emptied) - advance so the engine can reach
          // its end-of-game check instead of spinning in the sweep phase.
          gameState.gamePhase = 'place';
        }
        break;
      }
      case 'place': {
        // Board overflow is handled by the engine at the transition into this
        // phase (checkBoardOverflowOnPlace), so any state seen here is placeable.
        //
        // SPEND 1 CUPCAKE: TAKE 1 EXTRA TILE (3 August) is resolved HERE, before
        // the placements are chosen - it is a sweep-step option, and the tile it
        // buys is placed with the rest of the swept tiles, so the placement
        // decision has to see it.
        const extraIdx = strategy.decideExtraTile ? strategy.decideExtraTile(gameState) : null;
        if (extraIdx !== null && extraIdx !== undefined) {
          gameState = takeExtraTile(gameState, extraIdx);
        }
        const placements = strategy.decidePlacements(gameState);
        gameState = place(gameState, placements);
        break;
      }
      case 'spend': {
        // Cupcake move: relocate one tile (1) when it completes an otherwise
        // unclaimable card this turn.
        const moveDecision = strategy.decideMove ? strategy.decideMove(gameState) : null;
        if (moveDecision) {
          gameState = moveTile(gameState, moveDecision.fromIndex, moveDecision.toIndex);
        }
        // Remove an empty plate to the box (3). A separate allowance from the
        // move, so both can happen on the same turn - see removePlate.
        const plateIndex = strategy.decideRemovePlate ? strategy.decideRemovePlate(gameState) : null;
        if (plateIndex !== null && plateIndex !== undefined) {
          gameState = removePlate(gameState, plateIndex);
        }
        // Paid reserve (3 August): 1 cupcake to take a market card into the
        // personal reserve. Not claimable this same turn.
        const reserveId = strategy.decideReserve ? strategy.decideReserve(gameState) : null;
        if (reserveId !== null && reserveId !== undefined) {
          gameState = reserveCard(gameState, reserveId);
        }
        gameState = skipSpend(gameState);
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
  // tiles sent to the crumb tray). KEPT CUPCAKES NO LONGER SCORE (3 August) -
  // they are reported as a resource and as the tiebreaker, not as VP.
  const perPlayer = gameState.players.map((p, seat) => {
    let standScore = 0;
    let standTiles = 0;
    for (let i = 0; i < p.stand.length; i++) {
      const row = p.stand[i];
      standTiles += row.tiles.length;
      if (row.tiles.length > 0) standScore += STAND_ROW_VALUES[i][row.tiles.length - 1];
    }
    return {
      seat,
      score: p.score,
      claims: p.claimedCards.length,
      standScore,
      standTiles,
      crumbs: p.crumbTray.length,
      cupcakes: p.cupcakes,
      // Card VP by subtraction, which is now exact: since the pantry goals were
      // deleted (4 August) the score is stand + crumbs + cards and nothing else,
      // so there is no objective term left to take off first.
      cardVp: p.score - standScore - p.crumbTray.length,
    };
  });
  const winners = getWinningPlayers(gameState);
  const winnerSeats = winners.map(w => w.id);

  // Blowout check (standing D1 watch): the winner-vs-last score gap this game.
  const gameScores = perPlayer.map(p => p.score);
  const scoreSpread = Math.max(...gameScores) - Math.min(...gameScores);

  // A reserve is "completed" when the reserving player's claimedCards contains
  // the reserved card's id (claim() pushes it there). Since 3 August every
  // reserve was PAID for, so an uncompleted one is a wasted cupcake, not merely
  // a declined freebie.
  let reservesCompleted = 0;
  for (const r of statsCollector.reserves) {
    if (gameState.players[r.playerId].claimedCards.includes(r.cardId)) reservesCompleted++;
  }

  // Metric 7 context: cards burned by tea flushes. A card that ENTERED the row
  // and left it without being claimed by anybody went to the discard on a flush.
  const report = statsCollector.getReport();
  const claimedIds = new Set();
  for (const p of gameState.players) for (const id of p.claimedCards) claimedIds.add(id);
  for (const cardId in statsCollector.cardMarketTracking) {
    const t = statsCollector.cardMarketTracking[cardId];
    if (typeof t.exited === 'number' && !claimedIds.has(parseInt(cardId))) cardsDiscardedByFlushes++;
  }

  // TURNS ACTUALLY TAKEN, PER SEAT - the verification of the 4 August equal-turns
  // rule. Counted from the collector's turn-start samples rather than derived from
  // turnsPlayed / playerCount, because deriving it would assume exactly the thing
  // being checked. There is precisely one sample per turn played (createGame takes
  // turn 0, advanceToNextTurn takes every rotation that actually hands somebody a
  // turn, and it returns before sampling when the equal-turns stop fires), so this
  // is an independent reading of who got how many turns.
  const turnsBySeat = Array(gameState.players.length).fill(0);
  for (const s of statsCollector.turnSamples) {
    if (s.playerId >= 0 && s.playerId < turnsBySeat.length) turnsBySeat[s.playerId]++;
  }

  return {
    gameState,
    steps,
    turnsPlayed: gameState.stats.turnsPlayed,
    endReason: gameState.endGameReason,
    // Armed but not yet honoured is a legitimate mid-state; a FINISHED game must
    // always have both. Reported so the end-reason breakdown can be read as
    // "which condition armed the ending", which is what it means since 4 August.
    endTriggered: gameState.endTriggered,
    turnsBySeat,
    perPlayer,
    winnerSeats,
    scoreSpread,
    report,
    // Metric 3's fourth figure: the CARD row length the game finished on. Read
    // off the state rather than collected, since "the end" is not an event the
    // collector sees.
    endRowSize: gameState.cardMarket.length,
    cardsDiscardedByFlushes,
    reservesCompleted,
    // Empty plates bought off boards and retired to the box. Read off the state
    // for the same reason as endRowSize - it is a running total, not an event.
    platesReturnedToBox: gameState.platesReturnedToBox,
    // PLATE OVERRUN - the component question the 4 August ruling opened.
    // Every claim plants a plate, so total claims IS total plates placed. The
    // POOL is cardsNeededToEnd, and claiming past it is now legal for the whole
    // final round ("take extra plates from the unlimited supply"), so a game can
    // finish having placed more plates than the pool holds. This is the figure
    // the punchboard has to be sized off - the pool is a clock, not an inventory.
    // Never negative: the pool emptying is what arms that ending in the first
    // place, and the other endings simply finish under it.
    plateOverrun: Math.max(0, gameState.players.reduce((n, p) => n + p.claimedCards.length, 0) - gameState.cardsNeededToEnd),
    platePool: gameState.cardsNeededToEnd,
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
console.log(`Tiles taken/game:  mean=${meanOf(reports.map(r => r.totalTilesTaken)).toFixed(2)}, max=${maxOf(reports.map(r => r.totalTilesTaken))} (from a ${TILE_BAG_SIZE}-tile bag)`);

// ---------------------------------------------------------------------------
// 1. REFRESH CADENCE. Target: spread through the game, flushing with 5-7 tiles
//    left on the board.
//
//    THE OLD FAILURE MODES ARE GONE (1 August). Tea used to be a voluntary
//    start-of-turn action, so the two things worth watching were (A) does it fire
//    at every legal chance and (B) does a bad market sit unflushed while players
//    wait each other out. Neither has a subject any more: tea fires automatically
//    at the end of the turn that reaches the threshold. What replaces them is the
//    TRIGGER INVARIANT - no turn should ever BEGIN with tea still due.
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
// The trigger invariant: turns that BEGAN with a fresh pot of tea still owed.
// The end-of-turn trigger is supposed to make this impossible THROUGH THE BODY OF
// THE GAME, so a firing there is a bug, not a tuning result.
//
// 4 AUGUST: THE FINAL ROUND IS A LEGITIMATE EXCEPTION and must be counted apart,
// or this line reports the new end rule as a fault. When a pot is due and the bag
// is already empty the game triggers 'bagEmpty' instead of brewing, nothing
// refills the market after that, and every remaining turn of the round therefore
// begins with tea still due. A game ending that way is EXPECTED to show up to
// playerCount-1 late firings.
//
// The split is by turn number: turns are 0-based and one sample is taken per turn
// played, so the final round is the last playerCount turns of the game.
let teaDueLate = 0;
let teaDueEarly = 0;
for (const g of games) {
  const finalRoundFrom = Math.max(0, g.turnsPlayed - playerCount);
  for (const turn of g.report.teaDueTurns || []) {
    if (turn >= finalRoundFrom) teaDueLate++;
    else teaDueEarly++;
  }
}
const teaDueAtTurnStart = sumOf(reports.map(r => r.teaDueAtTurnStart));
const totalTurnStarts = sumOf(reports.map(r => r.turnSampleCount));
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
console.log(`TRIGGER INVARIANT: ${teaDueAtTurnStart}/${totalTurnStarts} turns began with tea still due`);
console.log(`  before the final round: ${teaDueEarly} (MUST be 0 - a skipped pot or a flush that failed to cover the symbols)`);
console.log(`  in the final round:     ${teaDueLate} (expected: a 'bagEmpty' ending stops refilling, so the round plays on uncovered)`);

// ---------------------------------------------------------------------------
// 2. BACKSTOP (EMPTY-BOARD) REFRESHES. Should now be ZERO, not merely rare: an
//    empty market shows all five teapots, so the end-of-turn trigger refills it
//    before the turn can pass on. Anything here means the trigger has a hole.
// ---------------------------------------------------------------------------
const mandatoryPerGame = reports.map(r => r.mandatoryRefreshCount);
const mandatoryTurns = reports.flatMap(r => r.mandatoryRefreshTurns);
console.log(`\n=== 2. BACKSTOP (EMPTY-BOARD) REFRESHES - should be 0 ===\n`);
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
// 6. CLAIMS FROM PAID RESERVES (3 August: the free tea-round reserve is gone).
// ---------------------------------------------------------------------------
const reserveClaims = sumOf(reports.map(r => r.reserveClaims));
const totalClaims = sumOf(reports.map(r => r.totalCardsClaimed));
const reservesTaken = sumOf(reports.map(r => r.reservesTaken));
const reservesCompleted = sumOf(games.map(g => g.reservesCompleted));
console.log(`\n=== 6. CLAIMS FROM PAID RESERVES ===\n`);
console.log(`From reserve:      ${reserveClaims}/${totalClaims} claims (${pct(reserveClaims, totalClaims)})`);
console.log(`Reserves taken:    ${reservesTaken} (mean/game=${(reservesTaken / nGames).toFixed(2)}), completed ${reservesCompleted} (${pct(reservesCompleted, reservesTaken)})`);
console.log(`  Every reserve now COSTS A CUPCAKE, so an uncompleted one is a wasted spend rather`);
console.log(`  than a declined freebie. The free version completed 47.7 / 46.2 / 35.8% at 2/3/4p.`);

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
// 8. CUPCAKE ECONOMY. Influx by source, spend by use, and the PHYSICAL SUPPLY
//    question. CUPCAKES STOPPED SCORING VP ON 3 AUGUST and became a four-outlet
//    currency plus the tiebreaker, so this block is now the evidence for "what is
//    a cupcake worth" - the number the 1/2/3 price ladder and the seat stagger
//    both rest on. (The held-objective reward used to rest on it too; the pantry
//    goals are deleted since 4 August.) The rules have had no cupcake cap since
//    24 July, so the supply lines MEASURE and enforce nothing.
// ---------------------------------------------------------------------------
const influx = { start: 0, pot: 0, plates: 0 };
const spend = { moveTile: 0, removePlate: 0, extraTile: 0, reserve: 0, extraClaim: 0 };
for (const r of reports) {
  addInto(influx, r.cupcakeInfluxTotals);
  addInto(spend, r.cupcakeSpendTotals);
}
const influxTotal = influx.start + influx.pot + influx.plates;
const spendTotal = Object.values(spend).reduce((a, v) => a + v, 0);
const keptCupcakes = sumOf(allPlayerMetrics.map(m => m.cupcakes));
const totalScore = sumOf(allPlayerMetrics.map(m => m.score));
const peakHeld = reports.map(r => r.maxCupcakesHeld);
const gamesOver30 = peakHeld.filter(v => v > CUPCAKE_TOKENS_IN_BOX).length;
// The two halves of the cupcake-worth question the handoff asks for by name:
// games ending with a player who could not afford what they wanted, and games
// ending with a player sitting on a surplus they had nothing to do with.
const brokeGames = games.filter(g => g.perPlayer.some(pl => pl.cupcakes === 0)).length;
const surplusGames = games.filter(g => g.perPlayer.some(pl => pl.cupcakes >= 4)).length;
console.log(`\n=== 8. CUPCAKE ECONOMY (${nPlayers} player-results) ===\n`);
console.log(`Influx by source:  start=${influx.start}, refresh pot=${influx.pot}, plates=${influx.plates}, total=${influxTotal}`);
console.log(`  mean/player:     start=${(influx.start / nPlayers).toFixed(2)}, pot=${(influx.pot / nPlayers).toFixed(2)}, plates=${(influx.plates / nPlayers).toFixed(2)}, total=${(influxTotal / nPlayers).toFixed(2)}`);
console.log(`Spend by use:      move tile=${spend.moveTile} (1ea), extra tile=${spend.extraTile} (2ea), remove plate=${spend.removePlate} (3ea), reserve=${spend.reserve} (1ea), extra claim=${spend.extraClaim} (disabled)`);
console.log(`  total spent:     ${spendTotal} = ${pct(spendTotal, influxTotal)} of influx (was 47-51% when hoarding paid 1 VP each)`);
console.log(`  PRICES ARE CUPCAKES, NOT ACTIONS: divide each figure by the per-use price above to`);
console.log(`  get how OFTEN it was bought. Removing a plate costs 3, so a small number here is`);
console.log(`  a rarer action than the same number under move tile.`);
console.log(`  plates returned to the box: ${sumOf(games.map(g => g.platesReturnedToBox || 0))} over ${nGames} games (${(sumOf(games.map(g => g.platesReturnedToBox || 0)) / nGames).toFixed(2)}/game)`);
console.log(`Kept at game end:  ${keptCupcakes} = ${(keptCupcakes / nPlayers).toFixed(2)}/player - SCORES NOTHING since 3 August, tiebreaker only`);
console.log(`  games where a player finished BROKE (0 held):   ${brokeGames}/${nGames} (${pct(brokeGames, nGames)})`);
console.log(`  games where a player finished with 4+ unspent:  ${surplusGames}/${nGames} (${pct(surplusGames, nGames)})`);
console.log(`SUPPLY WATCH (${CUPCAKE_TOKENS_IN_BOX} tokens proposed for the box; the RULES have no cap):`);
console.log(`  4p setup alone now places 14 tokens (2+3+4+5) before a single pot is brewed.`);
console.log(`  peak held simultaneously across all players: mean=${meanOf(peakHeld).toFixed(2)}, max=${maxOf(peakHeld)}`);
console.log(`  games whose peak exceeded ${CUPCAKE_TOKENS_IN_BOX} tokens: ${gamesOver30}/${nGames} (${pct(gamesOver30, nGames)})`);

// ---------------------------------------------------------------------------
// 9. BAG SKEW. The refresh is a full destructive flush, so the same tiles cycle
//    board -> bag -> board. A colour nobody sweeps shows up as a surplus in the
//    flushed-back distribution against the bag's flat per-colour share.
//
//    THE BASELINE IS DERIVED, NEVER TYPED. It was "20" as a literal in the skew
//    column until 4 August, which happened to be right only because there are
//    five colours; the bag size beside it was written out as a number twice and
//    was wrong for the whole life of the 125-tile bag. Both now come from
//    TILE_COLOUR_SHARE_PCT / TILE_BAG_SIZE / TILE_COPIES in tiles.js.
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
console.log(`Bag baseline is a flat ${TILE_COLOUR_SHARE_PCT.toFixed(1)}% per colour (${TILE_BAG_SIZE / COLOURS.length} of each in ${TILE_BAG_SIZE} tiles, ${TILE_COPIES} copies per combo).`);
for (const colour of Object.keys(returned).sort()) {
  const rShare = 100 * (returned[colour] || 0) / (tilesReturned || 1);
  const dShare = 100 * (dealt[colour] || 0) / (tilesDealt || 1);
  console.log(`  ${colour.padEnd(7)} flushed back ${rShare.toFixed(1).padStart(5)}%   dealt out ${dShare.toFixed(1).padStart(5)}%   (skew ${(rShare - TILE_COLOUR_SHARE_PCT).toFixed(1).padStart(5)} pts)`);
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
// PLATE OVERRUN - how many plates the box needs BEYOND the pool, now that the
// final round may claim past it from an unlimited supply (4 August ruling). The
// MAX is the number that sizes the punchboard; the mean only says how routine it
// is. Reported next to the pool so the two are never confused: the pool is the
// clock, the pool + overrun is the component count.
const overruns = games.map(g => g.plateOverrun);
const platePool = games[0].platePool;
console.log(`Plate overrun:     mean=${meanOf(overruns).toFixed(2)}, max=${maxOf(overruns)} beyond the ${platePool}-plate pool`);
console.log(`  games needing >0 spare plates: ${pct(overruns.filter(o => o > 0).length, nGames)}`);
console.log(`  BOX MUST HOLD ${platePool + maxOf(overruns)} plates at ${playerCount}p (pool ${platePool} + worst overrun ${maxOf(overruns)}).`);
console.log(`  The pool is a CLOCK, not an inventory - once it empties the ending is armed and the`);
console.log(`  final round claims on from an unlimited supply, so the box outsizes the pool by design.`);
console.log(`Final score:       mean=${meanOf(scores).toFixed(1)}, min=${minOf(scores)}, max=${maxOf(scores)}`);
console.log(`Score spread (D1): mean=${meanOf(spreads).toFixed(1)}, min=${minOf(spreads)}, max=${maxOf(spreads)} (ABSOLUTE winner-minus-last, per game)`);
// The RATIO as well as the gap. Reporting only one of them misleads: the ratio
// moves whenever everyone's score inflates, so removing the cupcake VP (3 August)
// and then the objective VP (4 August) both worsen it without either changing who
// is ahead.
const lastAsShare = games.map(g => {
  const sc = g.perPlayer.map(pl => pl.score);
  const top = maxOf(sc);
  return top > 0 ? minOf(sc) / top : 1;
});
console.log(`  last as % of winner: mean=${(100 * meanOf(lastAsShare)).toFixed(1)}% (report BOTH - the ratio alone moves with score inflation)`);
console.log(`Score make-up:     stand=${(totalStandScore / nPlayers).toFixed(1)}, cards=${(totalCardVp / nPlayers).toFixed(1)}, crumbs=${(totalCrumbs / nPlayers).toFixed(1)} VP/player`);
console.log(`  (THOSE THREE ARE NOW THE WHOLE SCORE. Cupcakes stopped scoring on 3 August (~3 VP/player)`);
console.log(`   and the ingredient objectives were deleted on 4 August (~3-6 VP/player), so expect means`);
console.log(`   well below the 3 August figures for those two reasons before reading anything else in.)`);
console.log(`  card:stand VP    = ${totalCardVp}:${totalStandScore} (card share ${pct(totalCardVp, totalCardVp + totalStandScore)})`);
console.log(`  plate:crumb tiles= ${totalStandTiles}:${totalCrumbs} (crumb share ${pct(totalCrumbs, totalStandTiles + totalCrumbs)})`);
console.log(`Game length (D3):  turns mean=${meanOf(turnsPerGame).toFixed(1)}, min=${minOf(turnsPerGame)}, max=${maxOf(turnsPerGame)}`);
console.log(`  turns per player: mean=${(meanOf(turnsPerGame) / playerCount).toFixed(2)} - the figure to compare across player counts`);
console.log(`  driver phase-steps (NOT turns): mean=${meanOf(stepsPerGame).toFixed(1)} - the loop runs several times per turn`);
console.log(`End reasons:       ${JSON.stringify(endReasonCounts)}`);
console.log(`  Since 4 August a reason names WHICH CONDITION ARMED THE ENDING, not where play stopped:`);
console.log(`  the game runs on to the end of the round after it fires. First reason wins, so a game`);
console.log(`  that arms two in its last round is reported under the one that actually ended it.`);
console.log(`  'bagEmpty' now means "a refill was needed and the bag was already empty" - a bag that`);
console.log(`  cannot cover 25 cells deals what it has and play continues across the thinner market.`);

// ---------------------------------------------------------------------------
// 11. THE EQUAL-TURNS RULE (4 August). Every player must have had exactly the
//     same number of turns when the game is scored, whichever condition armed the
//     ending. This replaces the old pair of turn-boundary checks, which CLAIMED to
//     give equal turns and did not - a boundary check firing in front of seat 3 of
//     4 left seats 1-2 a turn up.
//
//     Two independent readings, and both must hold:
//       (a) turnsPlayed is an exact multiple of the player count, since the game
//           can only be declared over when the turn comes back to the start player;
//       (b) the per-seat turn counts, read from the collector's one-sample-per-turn
//           log rather than derived from (a), are all identical.
//     ANY FAILURE HERE IS A RULE BUG, not a tuning result - and it is worth
//     breaking out by end reason, because the reasons arm at different points in
//     the turn and a hole would show up in only one of them.
// ---------------------------------------------------------------------------
const finished = games.filter(g => g.gameState.gameOver);
const unequalGames = finished.filter(g => Math.min(...g.turnsBySeat) !== Math.max(...g.turnsBySeat));
const nonMultipleGames = finished.filter(g => g.turnsPlayed % playerCount !== 0);
const untriggered = finished.filter(g => !g.endTriggered || !g.endReason);
console.log(`\n=== 11. EQUAL-TURNS RULE (${finished.length}/${nGames} games reached a scored ending) ===\n`);
console.log(`Every seat had the same number of turns: ${finished.length - unequalGames.length}/${finished.length} games (MUST be all)`);
console.log(`turnsPlayed divisible by ${playerCount}:            ${finished.length - nonMultipleGames.length}/${finished.length} games (MUST be all)`);
console.log(`Finished games carrying an end reason:   ${finished.length - untriggered.length}/${finished.length} games (MUST be all)`);
if (unequalGames.length) {
  console.log(`  FAILURES by end reason: ${JSON.stringify(unequalGames.reduce((acc, g) => { acc[g.endReason || 'none'] = (acc[g.endReason || 'none'] || 0) + 1; return acc; }, {}))}`);
  console.log(`  first failing game's per-seat turns: ${JSON.stringify(unequalGames[0].turnsBySeat)}`);
}
if (finished.length < nGames) {
  console.log(`  ${nGames - finished.length} game(s) hit the driver's step guard without ever finishing - investigate before reading anything above.`);
}

// ---------------------------------------------------------------------------
// 12. SEAT FAIRNESS. THE SINGLE MOST IMPORTANT NUMBER IN THE 3 AUGUST SET, and
//     the verification test for the staggered starting cupcakes (2/3/4/5).
//     TARGET: every seat within +/-2 points of an even win share, with an
//     identical strategy in every seat.
//
//     The advantage this corrects was large and real: with one strategy in every
//     seat over 3,000 games per configuration, P1 won 55.8 / 39.8 / 40.3% at
//     2/3/4 players against 50 / 33.3 / 25% expected, and the last seat at 4p
//     won 14.4%. The compensation is a GUESS at what a cupcake is worth, so this
//     must be verified, not assumed.
//
//     RE-MEASURE FROM SCRATCH SINCE 4 AUGUST. Those figures were taken with the
//     ingredient objectives in the game (they leaned the same way, and are now
//     deleted) and under the old turn-boundary endings, which did NOT give equal
//     turns. Equal turns removes one cause of the gradient outright, so the
//     stagger may now be over-correcting.
// ---------------------------------------------------------------------------
const evenShare = 100 / playerCount;
const seatWins = Array(playerCount).fill(0);
const seatScoreTotal = Array(playerCount).fill(0);
const seatClaimTotal = Array(playerCount).fill(0);
for (const g of games) {
  // A shared win counts as a fractional win for each winner, so the shares still
  // sum to 100% and a tie does not silently vanish from one seat's column.
  const share = 1 / Math.max(1, g.winnerSeats.length);
  for (const seat of g.winnerSeats) seatWins[seat] += share;
  for (const pl of g.perPlayer) {
    seatScoreTotal[pl.seat] += pl.score;
    seatClaimTotal[pl.seat] += pl.claims;
  }
}
console.log(`\n=== 12. SEAT FAIRNESS - verifies the staggered starting cupcakes ===\n`);
// Read the live table for THIS player count rather than a by-seat array: since
// 4 August the stagger is keyed by player count, so seat 3 does not get the same
// opening at 3 players as it does at 4.
const startingCupcakes = getStartingCupcakes(playerCount);
console.log(`Even share at ${playerCount}p is ${evenShare.toFixed(1)}%. Target: every seat within +/-2 points of it.`);
console.log(`Live table at ${playerCount}p: ${startingCupcakes.join(' / ')} (total influx ${startingCupcakes.reduce((a, v) => a + v, 0)}).`);
let worstDeviation = 0;
for (let seat = 0; seat < playerCount; seat++) {
  const winShare = 100 * seatWins[seat] / nGames;
  const deviation = winShare - evenShare;
  if (Math.abs(deviation) > Math.abs(worstDeviation)) worstDeviation = deviation;
  const flag = Math.abs(deviation) > 2 ? '  <-- OUTSIDE TARGET' : '';
  console.log(`  seat ${seat + 1} (starts with ${startingCupcakes[seat]} cupcakes): wins ${winShare.toFixed(1)}% (${deviation >= 0 ? '+' : ''}${deviation.toFixed(1)}), mean score ${(seatScoreTotal[seat] / nGames).toFixed(2)}, claims ${(seatClaimTotal[seat] / nGames).toFixed(2)}${flag}`);
}
const scoreGradient = (seatScoreTotal[0] - seatScoreTotal[playerCount - 1]) / nGames;
console.log(`Score gradient first-to-last: ${scoreGradient.toFixed(2)} VP (was 1.68 / 2.32 / 6.26 at 2/3/4p before the stagger)`);
console.log(`Worst seat deviation: ${worstDeviation >= 0 ? '+' : ''}${worstDeviation.toFixed(1)} points - ${Math.abs(worstDeviation) <= 2 ? 'WITHIN TARGET' : 'OUTSIDE TARGET'}`);
console.log(`  NOTE: at ${gamesPerConfig} games the 95% noise band is roughly +/-${(98 / Math.sqrt(gamesPerConfig)).toFixed(1)} points. The original`);
console.log(`  finding used 3,000 games/config; treat anything under ~1,000 as indicative only.`);

console.log(`\nCompleted ${gamesPerConfig} games in ${elapsed}ms (${(elapsed / gamesPerConfig).toFixed(1)}ms/game)`);
