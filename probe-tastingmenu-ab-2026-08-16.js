// THE TASTING MENU A/B, RE-RUN 16 AUGUST - the module ON versus OFF, on the
// engine as it stands today.
//
// WHY IT IS A NEW FILE AND NOT AN EDIT. `probe-tastingmenu-ab-2026-08-05.js` is
// broken twice over and neither failure announces itself:
//
//   1. IT IMPORTS `reserveCard`, which was deleted from the engine on 11 August.
//      That one is at least loud - the module fails to load.
//   2. IT ASKS `decideExtraTile` AT THE PLACE STEP, which is the silent one. The
//      extra tile moved to the SPEND step on 10 August and `canBuyExtraTile`
//      refuses outside it, so the call returns null every time and the probe
//      quietly plays a game in which nobody ever buys a tile. That is the defect
//      named at the top of section 4 of `Rulebook\outstanding-changes-v7.md`, and
//      it read the standFull rate an ORDER OF MAGNITUDE high the last time it
//      went unnoticed. Boards fill far more slowly without extra tiles, so games
//      run long and every score, claim-count and length figure comes out
//      off-model.
//
// The spend step below is copied from `arena.js`, which is the one driver in the
// repo that is correct: all four spends are UNCAPPED loops that end when the bot
// declines or the engine's gate closes, and the extra tile is bought here rather
// than at the place step.
//
// WHAT THE TWO ARMS DIFFER BY, AND IT IS DELIBERATELY NOT THE GLOBAL FLAG. The
// old probe drove `setTastingMenusEnabled`, the engine's harness-only seam. This
// one passes `createGame`'s pinned-deal argument an EMPTY deal, per game, which
// is exactly what the shipped web build now does for a base game (see the note
// in `src\ui\main.js`). So this measures the thing that ships rather than a
// process-wide flag that only a harness can set, and the global is never touched.
//
// THE QUESTION IT ANSWERS. The Tasting Menu is an expansion as of 16 August and
// OFF is the default, so the base game is now the arm nobody had measured on the
// current engine. Does the game hold up without it?
//
// Read-only. Same bot in both arms - basicBot is menu-aware, and in the OFF arm
// its menu terms zero out through isTastingMenuInPlay without any special-casing,
// which is the point: no second bot, no second tuning.
import {
  createGame, sweep, takeBonusTile, declineBonusTile, takeExtraTile, dealCards,
  place, claim, skipClaim, skipSpend, moveTile, removePlate, refill,
  calculateFinalScores, getWinningPlayers, TASTING_MENU_VP,
} from './src/engine/game.js';
import { createStatsCollector } from './src/engine/statsCollector.js';
import * as basicBot from './src/bots/basicBot.js';

// `menus` false deals an EMPTY menu deck for this game only.
function runGame(playerConfigs, menus) {
  const strategy = basicBot;
  let gameState = createGame(playerConfigs, createStatsCollector(), {
    tastingMenus: menus ? null : [],
  });
  let steps = 0;

  while (!gameState.gameOver && steps < 1000) {
    switch (gameState.gamePhase) {
      case 'sweep': {
        if (gameState.bonusTileAvailable) {
          const b = strategy.decideBonusTile ? strategy.decideBonusTile(gameState) : null;
          gameState = (b !== null && b !== undefined && gameState.market[b])
            ? takeBonusTile(gameState, b) : declineBonusTile(gameState);
          break;
        }
        const d = strategy.decideSweep(gameState);
        if (d) gameState = sweep(gameState, d.rowOrCol, d.isRow, d.declaration, d.declarationType);
        else gameState.gamePhase = 'place';
        break;
      }
      case 'place': {
        // NOTHING IS BOUGHT HERE. The extra tile lives in the spend step below -
        // this is the exact line the 5 August probe got wrong.
        gameState = place(gameState, strategy.decidePlacements(gameState));
        break;
      }
      case 'spend': {
        // arena.js's block, verbatim in shape: four uncapped loops, iteration
        // counts as runaway stops rather than rules.
        for (let n = 0; n < 25; n++) {
          const ex = strategy.decideExtraTile ? strategy.decideExtraTile(gameState) : null;
          if (ex === null || ex === undefined) break;
          gameState = takeExtraTile(gameState, ex.marketIndex, ex.boardIndex);
        }
        for (let n = 0; n < 25; n++) {
          const mv = strategy.decideMove ? strategy.decideMove(gameState) : null;
          if (!mv) break;
          gameState = moveTile(gameState, mv.fromIndex, mv.toIndex);
        }
        for (let n = 0; n < 25; n++) {
          const rp = strategy.decideRemovePlate ? strategy.decideRemovePlate(gameState) : null;
          if (rp === null || rp === undefined) break;
          gameState = removePlate(gameState, rp);
        }
        for (let n = 0; n < 10; n++) {
          if (!(strategy.decideDealCards && strategy.decideDealCards(gameState))) break;
          gameState = dealCards(gameState);
        }
        gameState = skipSpend(gameState);
        break;
      }
      case 'claim': {
        const d = strategy.decideClaim(gameState);
        if (d && d.cardId) gameState = claim(gameState, d.cardId, d.removedBoardIndex, d.destination);
        else gameState = skipClaim(gameState);
        break;
      }
      case 'refill':
        gameState = refill(gameState);
        break;
    }
    steps++;
  }
  if (gameState.gameOver) calculateFinalScores(gameState);
  return gameState;
}

// WOULD THE WINNER CHANGE IF THE MENU VP WERE TAKEN AWAY? This is the "the module
// decides N% of games" figure. It is a COUNTERFACTUAL ON THE FINISHED GAME, not a
// second game: everybody played for the menus, so it does not say what would have
// happened without them - it says how often the module is what separated first
// from second. Raw score only; the cupcake tiebreak is not re-run, so a game the
// module drags into a tie counts as changed.
function menuDecided(gs) {
  const raw = gs.players.map(p => p.score);
  const less = gs.players.map(p => p.score - p.tastingMenus.length * TASTING_MENU_VP);
  const topRaw = Math.max(...raw);
  const topLess = Math.max(...less);
  const winRaw = raw.map((s, i) => (s === topRaw ? i : -1)).filter(i => i >= 0).join(',');
  const winLess = less.map((s, i) => (s === topLess ? i : -1)).filter(i => i >= 0).join(',');
  return winRaw !== winLess;
}

function runArm(GAMES, COUNT, cfg, menus) {
  const seatWins = new Array(COUNT).fill(0);
  const endReasons = {};
  let spread = 0, ratio = 0, ratioN = 0, meanScore = 0, turns = 0;
  let claims = 0, standTiles = 0, crumbs = 0, cupcakesLeft = 0, hoarders = 0;
  let menuVP = 0, decided = 0, unfinished = 0;

  for (let g = 0; g < GAMES; g++) {
    const gs = runGame(cfg, menus);
    if (!gs.gameOver) { unfinished++; continue; }
    endReasons[gs.endGameReason || 'none'] = (endReasons[gs.endGameReason || 'none'] || 0) + 1;
    turns += gs.stats.turnsPlayed;

    const scores = gs.players.map(p => p.score);
    const top = Math.max(...scores);
    const bottom = Math.min(...scores);
    spread += top - bottom;
    if (top > 0) { ratio += bottom / top; ratioN++; }
    for (let i = 0; i < COUNT; i++) meanScore += scores[i];

    // The engine owns the tiebreak, so the arena asks it who won rather than
    // comparing scores - otherwise every cupcake-broken tie reads as shared.
    const winners = getWinningPlayers(gs).map(p => p.id);
    for (const id of winners) seatWins[id] += 1 / winners.length;

    for (const p of gs.players) {
      claims += p.claimedCards.length;
      standTiles += p.stand.reduce((n, row) => n + row.tiles.length, 0);
      crumbs += p.crumbTray.length;
      cupcakesLeft += p.cupcakes;
      if (p.cupcakes >= 4) hoarders++;
      menuVP += p.tastingMenus.length * TASTING_MENU_VP;
    }
    if (menus && menuDecided(gs)) decided++;
  }

  const n = GAMES - unfinished;
  return {
    n, unfinished, endReasons,
    meanScore: meanScore / (n * COUNT),
    spread: spread / n,
    ratio: 100 * ratio / Math.max(1, ratioN),
    turns: turns / n,
    claims: claims / (n * COUNT),
    standTiles: standTiles / (n * COUNT),
    crumbs: crumbs / (n * COUNT),
    cupcakesLeft: cupcakesLeft / (n * COUNT),
    hoardRate: 100 * hoarders / (n * COUNT),
    menuVP: menuVP / (n * COUNT),
    decided: 100 * decided / n,
    seatWinShare: seatWins.map(w => 100 * w / n),
  };
}

const GAMES = parseInt(process.argv[2]) || 1000;
const COUNTS = (process.argv[3] || '2,3,4').split(',').map(Number);

console.log(`\nTHE TASTING MENU A/B, 16 AUGUST - ${GAMES} games per arm per player count (basicBot)`);
console.log('OFF is the base game and the shipped default; ON is the mini expansion.');
console.log('Correct spend-step driver (arena.js): the extra tile IS bought.\n');

for (const COUNT of COUNTS) {
  const cfg = Array.from({ length: COUNT }, (_, i) => ({ name: `P${i + 1}`, isHuman: false, aiDifficulty: 'basic' }));
  const off = runArm(GAMES, COUNT, cfg, false);
  const on = runArm(GAMES, COUNT, cfg, true);

  const row = (label, a, b, dp = 2, note = '') =>
    console.log(`  ${label.padEnd(24)}${a.toFixed(dp).padStart(10)}${b.toFixed(dp).padStart(12)}${(b - a).toFixed(dp).padStart(10)}   ${note}`);

  console.log(`=== ${COUNT} PLAYERS ===   (off n=${off.n}, on n=${on.n})`);
  console.log('                        BASE GAME    EXPANSION       delta');
  row('mean score', off.meanScore, on.meanScore);
  row('spread (winner-last)', off.spread, on.spread, 2, '<- ANTI-RUNAWAY: lower is better');
  row('last as % of winner', off.ratio, on.ratio, 1, '<- higher is better');
  row('turns per game', off.turns, on.turns);
  row('claims per seat', off.claims, on.claims);
  row('stand tiles per seat', off.standTiles, on.standTiles);
  row('crumbs per seat', off.crumbs, on.crumbs);
  row('unspent cupcakes', off.cupcakesLeft, on.cupcakesLeft);
  row('seats hoarding 4+ (%)', off.hoardRate, on.hoardRate, 1);
  console.log(`  menu VP per seat                     ${on.menuVP.toFixed(2).padStart(12)}`);
  console.log(`  games the module decides             ${on.decided.toFixed(1).padStart(11)}%   <- winner changes if menu VP is removed`);
  const fmt = r => Object.entries(r.endReasons).map(([k, v]) => `${k} ${(100 * v / r.n).toFixed(1)}%`).join(', ');
  console.log(`  end reasons, base game:  ${fmt(off)}`);
  console.log(`  end reasons, expansion:  ${fmt(on)}`);
  // SEAT SHARES ARE COMPUTED AND NOT PRINTED. Section 4 of the worklist records
  // the seat ladder as a LIVE DEFECT at 3 players and forbids any document
  // quoting a seat-fairness figure until it is resolved. What this probe can say
  // is whether the two arms differ, so it prints the largest gap between them and
  // nothing else.
  const gap = Math.max(...off.seatWinShare.map((s, i) => Math.abs(s - on.seatWinShare[i])));
  console.log(`  largest seat-share gap between arms: ${gap.toFixed(1)} points (levels withheld - see worklist section 4)\n`);
}
