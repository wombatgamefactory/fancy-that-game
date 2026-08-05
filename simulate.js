import { createGame, sweep, takeBonusTile, declineBonusTile, takeExtraTile, place, claim, skipClaim, skipSpend, moveTile, removePlate, reserveCard, refill, getValidSweeps, getValidPlacements, calculateFinalScores, getWinningPlayers, STAND_ROW_VALUES, getStartingCupcakes, getTastingMenusEnabled, setTastingMenusEnabled, getStandIngredients, menuDeficit, TASTING_MENU_VP, getTastingMenuCount, TASTING_MENUS } from './src/engine/game.js';
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
      // THE TASTING MENU. Read off the player rather than the collector so it is
      // available even in a run with no metrics, and so metric 10's score make-up
      // can be reconciled exactly.
      tastingMenus: p.tastingMenus ? p.tastingMenus.length : 0,
      tastingMenuVp: (p.tastingMenus ? p.tastingMenus.length : 0) * TASTING_MENU_VP,
      // THE DEFICIT AT GAME END against the NEAREST dealt menu still on the table
      // - one of metric 13's four headline readings, and the one that says whether
      // four tiles is reachable. It has to be computed here rather than in the
      // collector because it is a fact about the FINISHED stand, not an event.
      // Infinity when no menu is left untaken, which is filtered out below rather
      // than folded into an average.
      finalDeficit: (() => {
        const counts = getStandIngredients(p);
        let nearest = Infinity;
        for (const menu of (gameState.tastingMenus || [])) {
          if (menu.takenBy !== null) continue;
          const d = menuDeficit(counts, menu);
          if (d < nearest) nearest = d;
        }
        return nearest;
      })(),
      // Card VP by subtraction. Still exact, but the flavour term has to come off
      // as well: since 4 August the score is stand + crumbs + cards + flavour and
      // nothing else. (The pantry goals were the term that used to sit here and
      // were deleted that morning; Today's Speciality replaced them that afternoon,
      // the Freshness Bonus replaced IT the same evening, and the Tasting Menu
      // replaced that on 5 August.)
      cardVp: p.score - standScore - p.crumbTray.length
        - ((p.tastingMenus ? p.tastingMenus.length : 0) * TASTING_MENU_VP),
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

  // CONTESTED MENUS (metric 13.3): dealt menus that MORE THAN ONE player's
  // finished stand satisfies. This is the race made countable, and it is the
  // figure to be most sceptical of - unsteered it measures 0.02 per game, which is
  // to say the unsteered bot produces no race at all.
  //
  // It is read off the FINISHED stands rather than logged, and that is a real
  // approximation worth naming: a player who qualified, took the menu, and would
  // still qualify at the end counts; a player who qualified only transiently
  // cannot (stands never shrink, so in fact there is no such player - a stand only
  // ever gains tiles). What it CANNOT see is order, which is what the take log is
  // for.
  //
  // Also collected: how many players ended the game qualifying for at least one
  // DEALT menu, taken or not, which is the 19.1%-unsteered figure the targets are
  // projected from.
  let contestedMenus = 0;
  let playersQualifyingForAny = 0;
  const standCounts = gameState.players.map(p => getStandIngredients(p));
  const qualifiesAny = Array(gameState.players.length).fill(false);
  for (const menu of (gameState.tastingMenus || [])) {
    let qualifiers = 0;
    for (let i = 0; i < standCounts.length; i++) {
      if (menuDeficit(standCounts[i], menu) > 0) continue;
      qualifiers++;
      qualifiesAny[i] = true;
    }
    if (qualifiers >= 2) contestedMenus++;
  }
  for (const q of qualifiesAny) if (q) playersQualifyingForAny++;

  return {
    contestedMenus,
    playersQualifyingForAny,
    menusDealtThisGame: (gameState.tastingMenus || []).length,
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

// THE A/B CONTROL ARM. A fourth argument of `nomenus` switches the Tasting Menu
// off for the whole run, which is the only way to tell what the MODULE did from
// what the game was already doing - and the two questions it answers are the two
// the 5 August handoff asks to be checked: whether seat fairness (metric 12) and
// last-as-a-share-of-winner (metric 10) survived it.
//
// This is the one legitimate caller of the setter. Nothing else may touch it: the
// game always starts from the constant.
const menusOff = process.argv[5] === 'nomenus';
if (menusOff) setTastingMenusEnabled(false);

console.log(`Running ${gamesPerConfig} games with ${playerCount} players (${botStrategy} bot)${menusOff ? ', TASTING MENUS OFF (A/B control arm)' : ''}...\n`);

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
const totalMenuVp = sumOf(allPlayerMetrics.map(m => m.tastingMenuVp));
console.log(`Score make-up:     stand=${(totalStandScore / nPlayers).toFixed(1)}, cards=${(totalCardVp / nPlayers).toFixed(1)}, crumbs=${(totalCrumbs / nPlayers).toFixed(1)}, menus=${(totalMenuVp / nPlayers).toFixed(1)} VP/player`);
console.log(`  (THOSE FOUR ARE THE WHOLE SCORE. Cupcakes stopped scoring on 3 August (~3 VP/player) and`);
console.log(`   the ingredient objectives were deleted on 4 August (~3-6 VP/player). The fourth term is the`);
console.log(`   flavour module, which has been Today's Speciality, then the Freshness Bonus (9.0 VP/player,`);
console.log(`   18.5% of score - measured TOO HIGH) and is now the Tasting Menu. TARGET ~4.4 VP/player,`);
console.log(`   about 9% of score - half the freshness dose. See metric 13.)`);
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

// ---------------------------------------------------------------------------
// 13. THE TASTING MENU (5 August). Not from the 28 July list - it is the
//     verification pass for the module that replaced the Freshness Bonus.
//
//     DEAD CARDBOARD IS THE NUMBER THIS WHOLE SECTION EXISTS FOR: the share of
//     dealt menus that nobody ever takes. The unsteered floor - a bot that has
//     never heard of the module - is 81%.
//       well under 50%  the deck is reachable; tune TASTING_MENU_VP, not the deck;
//       above 50%       the deck is too steep. Revise THE DECK, not the value;
//       near 0%         every menu goes, which makes it a setup bonus rather than
//                       a race - check the contested line before celebrating.
//
//     THE FOUR-TILE DECK FAILED THIS TEST AND WAS REPLACED ON 5 AUGUST, the same
//     day it shipped. Measured at 2,000 games, 3p, basicBot, with the menu-aware
//     bot wired up in both arms - so this is a clean like-for-like and the only
//     thing that differs is the deck:
//
//                            4 tiles (2/2 + 2/1/1)   3 tiles (2/1 + 1/1/1)
//       dead cardboard              57.9%                   21.9%
//       menus per player             0.56                    1.04
//       contested per game           0.131                   0.545
//       qualifying for 1+           52.2%                   79.5%
//       time to first menu     67.8% through            48.5% through
//
//     The four-tile row is condemned by the rule stated three lines above it: over
//     50% dead with a bot that is genuinely steering is a deck problem. It also
//     failed the LAST line of this section - at 67.8% of the way through a game,
//     the first menu was landing as an end-of-game bonus rather than a pressure
//     device, which is the module's stated job.
//
//     WHAT THE LIGHTER DECK COST was the dose, not reachability: 1.04 menus per
//     player at the original 8 VP was 8.33 VP/player, against the 4.4 this section
//     was built to aim at and the 9.0 that condemned the Freshness Bonus for being
//     too much. SETTLED 5 AUGUST by dropping the card to 5 VP, which measures 4.52
//     VP/player. See TASTING_MENU_VP in game.js.
//
//     BUT CHECK THE BOT FIRST IF IT READS HIGH. basicBot prices the menus at the
//     sweep, placement and claim steps (MENU_*_SHARE). A high figure with those
//     unwired measures the bot's blindness, not the rule - which is exactly what
//     the 81% floor is.
//
//     THE PROJECTION THIS BUILD EXISTS TO CONFIRM OR KILL. A player makes about
//     six claims and 44.3% of them finish exactly ONE TILE SHORT, so one redirected
//     claim converts them: that projects roughly 0.55 menus per player, 4.4 VP,
//     about 9% of score. THAT 0.55 IS A PROJECTION, NOT A MEASUREMENT. Revise
//     TASTING_MENU_VP if the steered rate lands below 0.4 (raise toward 10-12) or
//     above 0.8 (drop to 6).
//
//     TIME TO FIRST MENU is the module's stated job made measurable. If menus are
//     all taken in the last two turns it is an end-of-game bonus rather than a
//     pressure device and has failed, whatever the dose says.
//
//     AND WATCH BY SEAT. The Freshness Bonus got menus-by-seat flat and it must not
//     regress; metric 12 is where a slope shows up as wins.
// ---------------------------------------------------------------------------
const menusDealt = sumOf(reports.map(r => r.menusDealt));
const menusDead = sumOf(reports.map(r => r.menusDead));
const menusTaken = menusDealt - menusDead;
const menusPer = allPlayerMetrics.map(m => m.tastingMenus);
const menuMaxes = reports.map(r => r.tastingMenusMax);
// Which menus were dealt. All ten must come up evenly over a long run; anything
// else is a bug in the deal, not a design finding.
const menuDeal = {};
for (const r of reports) {
  for (const id of r.tastingMenuDeal) menuDeal[id] = (menuDeal[id] || 0) + 1;
}
// THE DISTRIBUTION, not just the mean (metric 13.2). A mean of 0.55 built from
// every player taking about half a menu is a different game from one built from a
// fifth of players taking three.
const menuDist = {};
for (const n of menusPer) menuDist[n] = (menuDist[n] || 0) + 1;
// DEFICIT AT GAME END against the nearest menu still on the table (13.4). The
// 44.3% one-tile-short figure is the whole basis of the 0.55 projection, so this
// is where the projection is confirmed or killed.
const deficits = allPlayerMetrics.map(m => m.finalDeficit).filter(d => Number.isFinite(d));
const deficitDist = {};
for (const d of deficits) deficitDist[Math.min(4, d)] = (deficitDist[Math.min(4, d)] || 0) + 1;
const oneShort = deficitDist[1] || 0;
const twoOrMoreShort = deficits.filter(d => d >= 2).length;
// TIME TO FIRST MENU (13.7), as a fraction of each game's own length, because
// games differ in length and an absolute turn number would blur that away.
const firstMenuFraction = [];
const takeFractions = [];
for (const g of games) {
  const len = Math.max(1, g.turnsPlayed);
  const turns = (g.report.tastingMenuTurns || []).slice().sort((a, b) => a - b);
  for (const t of turns) takeFractions.push(t / len);
  if (turns.length > 0) firstMenuFraction.push(turns[0] / len);
}
const takenInLastThird = takeFractions.filter(f => f >= 2 / 3).length;
// WHERE the claims fall, and the sweep split. Both repeated from the previous two
// sections as the standing behavioural baselines.
const thirds = [0, 0, 0];
for (const g of games) {
  const len = Math.max(1, g.turnsPlayed);
  for (const turn of g.report.claimTurns || []) {
    thirds[Math.min(2, Math.floor(3 * turn / len))]++;
  }
}
const thirdsTotal = sumOf(thirds) || 1;
const declarations = { colour: 0, symbol: 0 };
for (const r of reports) addInto(declarations, r.sweepsByDeclaration);
const declarationTotal = declarations.colour + declarations.symbol;

console.log(`\n=== 13. THE TASTING MENU (${getTastingMenuCount(playerCount)} dealt = players+1, from a deck of ${TASTING_MENUS.length}, ${TASTING_MENU_VP} VP each) ===\n`);
if (!getTastingMenusEnabled()) {
  console.log(`MODULE DISABLED for this run (setTastingMenusEnabled(false)). Everything below reads zero`);
  console.log(`by construction - this is the A/B control arm, so compare metrics 1-12 against a live run.`);
}
console.log(`DEAD CARDBOARD:    ${menusDead}/${menusDealt} dealt menus were never taken = ${pct(menusDead, menusDealt)}`);
console.log(`  <-- THE number this module lives or dies by. Unsteered floor is 81%. Well under 50% means`);
console.log(`      the deck is reachable; above 50% with a menu-aware bot condemns the DECK, not the VP.`);
console.log(`      The four-tile deck read 57.9% here and was replaced on 5 August; three tiles reads ~22%.`);
console.log(`Menus per player:  mean=${meanOf(menusPer).toFixed(2)}, min=${minOf(menusPer)}, max=${maxOf(menusPer)} (= ${(meanOf(menusPer) * TASTING_MENU_VP).toFixed(2)} VP/player)`);
console.log(`  <-- TARGET was 0.55, projected against the FOUR-TILE deck. The three-tile deck lands near`);
console.log(`      0.9-1.0, which is why the card dropped from 8 VP to 5 on 5 August. Watch the VP/player`);
console.log(`      figure above against the ~4.4 target, not this rate alone. Unsteered: 0.19.`);
console.log(`  distribution:    ${Object.keys(menuDist).sort((a, b) => a - b).map(k => `${k} menus: ${pct(menuDist[k], nPlayers)}`).join(', ')}`);
console.log(`  most by ONE player in a game: mean=${meanOf(menuMaxes).toFixed(2)}, max=${maxOf(menuMaxes)}`);
console.log(`  <-- watch the MAX: one player hoovering the deal is the failure mode TASTING_MENU_ONE_PER_TURN`);
console.log(`      exists to fix. It ships OFF; turn it on and re-run before arguing about it.`);
const contested = sumOf(games.map(g => g.contestedMenus));
const qualifiers = sumOf(games.map(g => g.playersQualifyingForAny));
console.log(`CONTESTED MENUS:   ${(contested / nGames).toFixed(3)} per game - dealt menus 2+ players' final stands meet`);
console.log(`  <-- THE RACE, and the figure to be most sceptical of: unsteered it is 0.02 per game, i.e.`);
console.log(`      no race at all. Read off finished stands, so it sees overlap but not order.`);
console.log(`Players qualifying for at least one dealt menu: ${pct(qualifiers, nPlayers)} (19.1% unsteered)`);
console.log(`DEFICIT AT GAME END against the nearest menu still on the table:`);
console.log(`  qualified (0):   ${pct(deficitDist[0] || 0, deficits.length)}`);
console.log(`  ONE TILE SHORT:  ${pct(oneShort, deficits.length)}   <-- 44.3% unsteered. This is the decision the module exists to create.`);
console.log(`  2+ short:        ${pct(twoOrMoreShort, deficits.length)} (36.5% unsteered)`);
console.log(`  (${nPlayers - deficits.length} player-results had no untaken menu left to measure against and are excluded)`);
const menusBySeat = Array(playerCount).fill(0);
for (const pm of allPlayerMetrics) menusBySeat[pm.seat] += pm.tastingMenus;
console.log(`  by seat:         ${menusBySeat.map((v, i) => `seat ${i + 1}=${(v / nGames).toFixed(3)}`).join(', ')}`);
console.log(`  <-- MUST be flat. The Freshness Bonus got this flat and it must not regress; the Teapot`);
console.log(`      Track's equivalent line fell monotonically down the seating order, which condemned it.`);
console.log(`TIME TO FIRST MENU: mean=${firstMenuFraction.length ? (100 * meanOf(firstMenuFraction)).toFixed(1) : 'n/a'}% of the way through the game (over ${firstMenuFraction.length} games that took one)`);
console.log(`  menus taken in the LAST THIRD: ${pct(takenInLastThird, takeFractions.length)}`);
console.log(`  <-- if menus are all taken at the death, this is an end-of-game bonus rather than a pressure`);
console.log(`      device and has failed at its stated job, whatever the dose reads.`);
console.log(`Menus dealt:       ${JSON.stringify(menuDeal)} (should be even over a long run)`);
console.log(`Claims by game third: ${thirds.map(t => pct(t, thirdsTotal)).join(' / ')}`);
console.log(`  (24 / 39 / 37% with no flavour module; 24.0 / 39.4 / 36.6% under Today's Speciality, whose`);
console.log(`   failure to move this AT ALL is half of why it was replaced. This module's urgency is a race`);
console.log(`   against an opponent rather than against the clock, so read this as description.)`);
console.log(`Sweep declarations:   colour ${pct(declarations.colour, declarationTotal)} / ingredient ${pct(declarations.symbol, declarationTotal)}`);
console.log(`  (43.8 / 43.4 / 44.4% colour with no module; 42.8 / 42.9 / 43.4% under Today's Speciality -`);
console.log(`   a one-point move, which was the other reading that condemned it. A menu names INGREDIENTS,`);
console.log(`   so this should swing toward ingredient sweeps if the bot is really steering.)`);

console.log(`\nCompleted ${gamesPerConfig} games in ${elapsed}ms (${(elapsed / gamesPerConfig).toFixed(1)}ms/game)`);
