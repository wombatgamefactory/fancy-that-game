// THE TASTING MENU A/B - module ON versus OFF, through the engine's own
// setTastingMenusEnabled seam, at the 5 August cake-stand values.
//
// WHY THIS EXISTS. The standard report shows the score spread at 3 players
// widening from 17.0 (Today's Speciality) and 17.7 (the Freshness Bonus) to 20.7
// under the Tasting Menu, and last-as-a-share-of-winner falling from 68.6 / 70.0%
// to 62.4%. Two things changed on 5 August, not one: the module AND the cake
// stand revaluation (bottom row 22 -> 26). The standard report cannot separate
// them. This can - both arms run at today's stand values, so the only difference
// is the module.
//
// It also answers the question the standard report cannot ask at all: WHO takes
// the menus. A reward that lands on the player who is already winning is
// rich-get-richer by construction, whatever its dose.
//
// Read-only apart from the enable seam, which is restored in a finally block.
import {
  createGame, sweep, takeBonusTile, declineBonusTile, takeExtraTile, place, claim,
  skipClaim, skipSpend, moveTile, removePlate, reserveCard, refill,
  calculateFinalScores, setTastingMenusEnabled, getTastingMenusEnabled,
} from './src/engine/game.js';
import { createStatsCollector } from './src/engine/statsCollector.js';
import * as basicBot from './src/bots/basicBot.js';

function runGame(playerConfigs) {
  const strategy = basicBot;
  let gameState = createGame(playerConfigs, createStatsCollector());
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
        const extra = strategy.decideExtraTile ? strategy.decideExtraTile(gameState) : null;
        if (extra !== null && extra !== undefined) gameState = takeExtraTile(gameState, extra);
        gameState = place(gameState, strategy.decidePlacements(gameState));
        break;
      }
      case 'spend': {
        const m = strategy.decideMove ? strategy.decideMove(gameState) : null;
        if (m) gameState = moveTile(gameState, m.fromIndex, m.toIndex);
        const rp = strategy.decideRemovePlate ? strategy.decideRemovePlate(gameState) : null;
        if (rp !== null && rp !== undefined) gameState = removePlate(gameState, rp);
        const rc = strategy.decideReserve ? strategy.decideReserve(gameState) : null;
        if (rc !== null && rc !== undefined) gameState = reserveCard(gameState, rc);
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

// One arm: GAMES games at COUNT players, with the module in whatever state the
// caller has set. Returns the spread figures, the seat win shares, and - when the
// module is live - how the menus distributed across the finishing order.
function runArm(GAMES, COUNT, cfg) {
  const seatWins = new Array(COUNT).fill(0);
  const seatScore = new Array(COUNT).fill(0);
  const menusByRank = new Array(COUNT).fill(0);
  const scoreByRank = new Array(COUNT).fill(0);
  let spread = 0, ratio = 0, ratioN = 0, meanScore = 0;

  for (let g = 0; g < GAMES; g++) {
    const gs = runGame(cfg);
    const scores = gs.players.map(p => p.score);
    const top = Math.max(...scores);
    const bottom = Math.min(...scores);
    spread += top - bottom;
    if (top > 0) { ratio += bottom / top; ratioN++; }
    for (let i = 0; i < COUNT; i++) { seatScore[i] += scores[i]; meanScore += scores[i]; }
    // Every seat on the top score shares the win, so a tie is not silently
    // awarded to the lowest seat index.
    const winners = gs.players.filter(p => p.score === top).length;
    for (let i = 0; i < COUNT; i++) if (scores[i] === top) seatWins[i] += 1 / winners;

    const order = gs.players.map((p, i) => ({ i, score: p.score })).sort((a, b) => b.score - a.score);
    order.forEach((o, rank) => {
      menusByRank[rank] += gs.players[o.i].tastingMenus.length;
      scoreByRank[rank] += o.score;
    });
  }

  return {
    spread: spread / GAMES,
    ratio: 100 * ratio / Math.max(1, ratioN),
    meanScore: meanScore / (GAMES * COUNT),
    seatWinShare: seatWins.map(w => 100 * w / GAMES),
    seatScore: seatScore.map(s => s / GAMES),
    menusByRank: menusByRank.map(m => m / GAMES),
    scoreByRank: scoreByRank.map(s => s / GAMES),
  };
}

const GAMES = parseInt(process.argv[2]) || 2000;
const COUNTS = (process.argv[3] || '2,3,4').split(',').map(Number);
const was = getTastingMenusEnabled();

try {
  console.log(`\nTHE TASTING MENU A/B - ${GAMES} games per arm per player count (basicBot)\n`);
  console.log('Both arms run at the 5 August cake-stand values, so the ONLY difference is the module.\n');

  for (const COUNT of COUNTS) {
    const cfg = Array.from({ length: COUNT }, (_, i) => ({ id: i, name: `P${i}`, type: 'ai' }));
    setTastingMenusEnabled(true);
    const on = runArm(GAMES, COUNT, cfg);
    setTastingMenusEnabled(false);
    const off = runArm(GAMES, COUNT, cfg);

    const even = 100 / COUNT;
    console.log(`=== ${COUNT} PLAYERS ===`);
    console.log('                          module OFF   module ON     delta');
    console.log(`  mean score              ${off.meanScore.toFixed(2).padStart(10)}${on.meanScore.toFixed(2).padStart(12)}${(on.meanScore - off.meanScore).toFixed(2).padStart(10)}`);
    console.log(`  spread (winner-last)    ${off.spread.toFixed(2).padStart(10)}${on.spread.toFixed(2).padStart(12)}${(on.spread - off.spread).toFixed(2).padStart(10)}   <- ANTI-RUNAWAY: lower is better`);
    console.log(`  last as % of winner     ${off.ratio.toFixed(1).padStart(10)}${on.ratio.toFixed(1).padStart(12)}${(on.ratio - off.ratio).toFixed(1).padStart(10)}   <- higher is better`);
    console.log('  seat win share, deviation from even:');
    for (let i = 0; i < COUNT; i++) {
      console.log(`    seat ${i + 1}                ${(off.seatWinShare[i] - even).toFixed(1).padStart(10)}${(on.seatWinShare[i] - even).toFixed(1).padStart(12)}${(on.seatWinShare[i] - off.seatWinShare[i]).toFixed(1).padStart(10)}`);
    }
    console.log('  MENUS BY FINISHING RANK (module ON) - rank 1 is the winner:');
    for (let r = 0; r < COUNT; r++) {
      console.log(`    rank ${r + 1}: ${on.menusByRank[r].toFixed(3)} menus/game, mean score ${on.scoreByRank[r].toFixed(1)}`);
    }
    const winnerShare = on.menusByRank[0];
    const loserShare = on.menusByRank[COUNT - 1];
    console.log(`    winner:last menu ratio = ${(winnerShare / Math.max(0.0001, loserShare)).toFixed(2)}x`);
    console.log('    <- a ratio near 1 means the module is neutral; well above 1 means it pays the leader.\n');
  }
} finally {
  setTastingMenusEnabled(was);
}
