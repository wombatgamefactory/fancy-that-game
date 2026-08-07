// ANATOMY OF THE SCORE SPREAD - where the winner-minus-last gap comes from, and
// WHEN it opens.
//
// WHY THIS EXISTS. "Last place scores 57.7% of the winner" is a symptom, and the
// Feld lens prescribes two completely different cures depending on the cause:
//
//   If the gap is ALREADY THERE by the first third, the problem is early variance
//   amplification, and the fix is to damp the divergence or add a catch-up lane.
//   If the gap ACCUMULATES STEADILY, the problem is a rich-get-richer engine, and
//   the fix is to reset or cliff the thing that compounds.
//
// Those two fixes are close to opposites, so guessing is expensive. This probe
// tracks committed score turn by turn against each player's EVENTUAL finishing
// rank, and decomposes the final gap by scoring component.
//
//   node probe-spread-2026-08-06.js [games] [players]
//
// Read-only: it computes score from state rather than calling calculateFinalScores
// mid-game, so nothing is written to the live game.
import {
  createGame, sweep, takeBonusTile, declineBonusTile, takeExtraTile, place, claim,
  skipClaim, skipSpend, moveTile, removePlate, reserveCard, refill,
  calculateFinalScores, STAND_ROW_VALUES, REWARD_CARDS, TASTING_MENU_VP,
} from './src/engine/game.js';
import { createStatsCollector } from './src/engine/statsCollector.js';
import * as basicBot from './src/bots/basicBot.js';

const CARD_VP = new Map(REWARD_CARDS.map(c => [c.id, c.vp]));

// Committed score as it stands RIGHT NOW - the same four terms
// calculateFinalScores adds up, read without mutating anything.
function scoreOf(player) {
  let s = 0;
  for (let i = 0; i < player.stand.length; i++) {
    const row = player.stand[i];
    if (row.tiles.length > 0) s += STAND_ROW_VALUES[i][row.tiles.length - 1];
  }
  s += player.crumbTray.length;
  for (const id of player.claimedCards) s += CARD_VP.get(id) || 0;
  s += player.tastingMenus.length * TASTING_MENU_VP;
  return s;
}

function componentsOf(player) {
  let stand = 0;
  for (let i = 0; i < player.stand.length; i++) {
    const row = player.stand[i];
    if (row.tiles.length > 0) stand += STAND_ROW_VALUES[i][row.tiles.length - 1];
  }
  let cards = 0;
  for (const id of player.claimedCards) cards += CARD_VP.get(id) || 0;
  return {
    stand,
    cards,
    crumbs: player.crumbTray.length,
    menus: player.tastingMenus.length * TASTING_MENU_VP,
    claims: player.claimedCards.length,
    standTiles: player.stand.reduce((a, r) => a + r.tiles.length, 0),
    // THE CATCH-UP TEST. A claim takes a tile OFF the 5x5 and drops a plate on the
    // cell, so a player who claims less ends with MORE tiles still on their board.
    // If board tiles run the opposite way to score, then any end-game scoring of
    // the 5x5 is intrinsically catch-up shaped and needs no extra machinery.
    boardTiles: player.board.filter(c => c && c.colour).length,
    boardPlates: player.board.filter(c => c && c.type === 'blocked').length,
  };
}

const DECILES = 10;

function runGame(playerConfigs) {
  let gameState = createGame(playerConfigs, createStatsCollector());
  const n = playerConfigs.length;
  // One snapshot of every player's committed score per completed turn.
  const trace = [];
  // Claims made in each third of the game, per player.
  const claimsByThird = Array.from({ length: n }, () => [0, 0, 0]);
  let lastTurn = -1;
  let steps = 0;

  while (!gameState.gameOver && steps < 1000) {
    const me = gameState.currentPlayerIndex;
    // Snapshot once per turn boundary.
    if (gameState.stats.turnsPlayed !== lastTurn) {
      lastTurn = gameState.stats.turnsPlayed;
      trace.push(gameState.players.map(scoreOf));
    }
    switch (gameState.gamePhase) {
      case 'sweep': {
        if (gameState.bonusTileAvailable) {
          const b = basicBot.decideBonusTile ? basicBot.decideBonusTile(gameState) : null;
          gameState = (b !== null && b !== undefined && gameState.market[b])
            ? takeBonusTile(gameState, b) : declineBonusTile(gameState);
          break;
        }
        const d = basicBot.decideSweep(gameState);
        if (d) gameState = sweep(gameState, d.rowOrCol, d.isRow, d.declaration, d.declarationType);
        else gameState.gamePhase = 'place';
        break;
      }
      case 'place': {
        const e = basicBot.decideExtraTile ? basicBot.decideExtraTile(gameState) : null;
        if (e !== null && e !== undefined) gameState = takeExtraTile(gameState, e);
        gameState = place(gameState, basicBot.decidePlacements(gameState));
        break;
      }
      case 'spend': {
        const m = basicBot.decideMove ? basicBot.decideMove(gameState) : null;
        if (m) gameState = moveTile(gameState, m.fromIndex, m.toIndex);
        const rp = basicBot.decideRemovePlate ? basicBot.decideRemovePlate(gameState) : null;
        if (rp !== null && rp !== undefined) gameState = removePlate(gameState, rp);
        const rc = basicBot.decideReserve ? basicBot.decideReserve(gameState) : null;
        if (rc !== null && rc !== undefined) gameState = reserveCard(gameState, rc);
        gameState = skipSpend(gameState);
        break;
      }
      case 'claim': {
        const d = basicBot.decideClaim(gameState);
        if (d && d.cardId) {
          gameState = claim(gameState, d.cardId, d.removedBoardIndex, d.destination);
          // Bucketed after the fact using the final turn count, so record the raw
          // turn index now and resolve the third below.
          claimsByThird[me].push?.(0);
          claimsByThird[me].lastClaimTurns = claimsByThird[me].lastClaimTurns || [];
          claimsByThird[me].lastClaimTurns.push(gameState.stats.turnsPlayed);
        } else {
          gameState = skipClaim(gameState);
        }
        break;
      }
      case 'refill': gameState = refill(gameState); break;
    }
    steps++;
  }
  if (gameState.gameOver) calculateFinalScores(gameState);

  const totalTurns = Math.max(1, gameState.stats.turnsPlayed);
  const order = gameState.players.map((p, i) => ({ i, score: p.score }))
    .sort((a, b) => b.score - a.score);
  const rankOf = new Array(n);
  order.forEach((o, rank) => { rankOf[o.i] = rank; });

  // Committed score by eventual rank, sampled at each decile of the game.
  const byDecile = Array.from({ length: DECILES + 1 }, () => new Array(n).fill(0));
  for (let d = 0; d <= DECILES; d++) {
    const idx = Math.min(trace.length - 1, Math.round((d / DECILES) * (trace.length - 1)));
    const snap = trace[idx];
    for (let i = 0; i < n; i++) byDecile[d][rankOf[i]] = snap[i];
  }

  // Was the eventual winner already leading at each decile?
  const leaderIsWinner = new Array(DECILES + 1).fill(0);
  for (let d = 0; d <= DECILES; d++) {
    const snap = byDecile[d];
    const best = Math.max(...snap);
    if (snap[0] === best) leaderIsWinner[d] = 1;
  }

  // Claims per third, by eventual rank.
  const thirds = Array.from({ length: n }, () => [0, 0, 0]);
  for (let i = 0; i < n; i++) {
    const turns = claimsByThird[i].lastClaimTurns || [];
    for (const t of turns) {
      const frac = t / totalTurns;
      const third = frac < 1 / 3 ? 0 : frac < 2 / 3 ? 1 : 2;
      thirds[rankOf[i]][third]++;
    }
  }

  const comps = new Array(n);
  for (let i = 0; i < n; i++) comps[rankOf[i]] = componentsOf(gameState.players[i]);

  return { byDecile, leaderIsWinner, thirds, comps, finalGap: order[0].score - order[n - 1].score };
}

const GAMES = parseInt(process.argv[2]) || 1500;
const COUNT = parseInt(process.argv[3]) || 4;
const cfg = Array.from({ length: COUNT }, (_, i) => ({ id: i, name: `P${i}`, type: 'ai' }));

const accDecile = Array.from({ length: DECILES + 1 }, () => new Array(COUNT).fill(0));
const accLeader = new Array(DECILES + 1).fill(0);
const accThirds = Array.from({ length: COUNT }, () => [0, 0, 0]);
const accComps = Array.from({ length: COUNT }, () => ({ stand: 0, cards: 0, crumbs: 0, menus: 0, claims: 0, standTiles: 0, boardTiles: 0, boardPlates: 0 }));
let accGap = 0;

for (let g = 0; g < GAMES; g++) {
  const r = runGame(cfg);
  for (let d = 0; d <= DECILES; d++) {
    for (let k = 0; k < COUNT; k++) accDecile[d][k] += r.byDecile[d][k];
    accLeader[d] += r.leaderIsWinner[d];
  }
  for (let k = 0; k < COUNT; k++) {
    for (let t = 0; t < 3; t++) accThirds[k][t] += r.thirds[k][t];
    for (const key in accComps[k]) accComps[k][key] += r.comps[k][key];
  }
  accGap += r.finalGap;
}

console.log(`\nANATOMY OF THE SCORE SPREAD - ${GAMES} games at ${COUNT} players (basicBot)\n`);
console.log('Players are bucketed by their EVENTUAL finishing rank, then rewound.\n');

console.log('COMMITTED SCORE THROUGH THE GAME, by eventual finishing rank:');
console.log(`  % through | ${Array.from({ length: COUNT }, (_, k) => `rank ${k + 1}`.padStart(7)).join(' | ')} |  gap  | % of final gap`);
const finalGap = accGap / GAMES;
for (let d = 0; d <= DECILES; d++) {
  const row = accDecile[d].map(v => (v / GAMES).toFixed(1).padStart(7));
  const gap = (accDecile[d][0] - accDecile[d][COUNT - 1]) / GAMES;
  console.log(`  ${String(d * 10).padStart(8)}% | ${row.join(' | ')} | ${gap.toFixed(1).padStart(5)} | ${(100 * gap / finalGap).toFixed(0).padStart(9)}%`);
}

console.log('\nWAS THE EVENTUAL WINNER ALREADY LEADING?');
for (let d = 0; d <= DECILES; d += 2) {
  console.log(`  at ${String(d * 10).padStart(3)}% through: ${(100 * accLeader[d] / GAMES).toFixed(1).padStart(5)}% of games`);
}

console.log('\nCLAIMS PER PLAYER BY GAME THIRD, by eventual finishing rank:');
console.log('  rank | 1st third | 2nd third | 3rd third | total | 3rd-third share');
for (let k = 0; k < COUNT; k++) {
  const t = accThirds[k].map(v => v / GAMES);
  const tot = t[0] + t[1] + t[2];
  console.log(`    ${k + 1}  | ${t[0].toFixed(2).padStart(9)} | ${t[1].toFixed(2).padStart(9)} | ${t[2].toFixed(2).padStart(9)} | ${tot.toFixed(2).padStart(5)} | ${(100 * t[2] / tot).toFixed(1).padStart(14)}%`);
}

console.log('\nWHERE THE FINAL GAP LIVES - mean VP by component, by eventual rank:');
console.log('  rank | stand | cards | menus | crumbs | total | claims | stand tiles');
for (let k = 0; k < COUNT; k++) {
  const c = accComps[k];
  const per = (x) => (x / GAMES).toFixed(2).padStart(6);
  const tot = (c.stand + c.cards + c.menus + c.crumbs) / GAMES;
  console.log(`    ${k + 1}  |${per(c.stand)} |${per(c.cards)} |${per(c.menus)} | ${per(c.crumbs)} | ${tot.toFixed(2).padStart(5)} | ${per(c.claims)} | ${per(c.standTiles)}`);
}
const top = accComps[0], bot = accComps[COUNT - 1];
const dStand = (top.stand - bot.stand) / GAMES;
const dCards = (top.cards - bot.cards) / GAMES;
const dMenus = (top.menus - bot.menus) / GAMES;
const dCrumbs = (top.crumbs - bot.crumbs) / GAMES;
const dTot = dStand + dCards + dMenus + dCrumbs;
console.log(`\n  GAP DECOMPOSITION (rank 1 minus rank ${COUNT}), total ${dTot.toFixed(2)} VP:`);
console.log(`    cake stand : ${dStand.toFixed(2).padStart(6)} VP  (${(100 * dStand / dTot).toFixed(0)}%)`);
console.log(`    card VP    : ${dCards.toFixed(2).padStart(6)} VP  (${(100 * dCards / dTot).toFixed(0)}%)`);
console.log(`    menus      : ${dMenus.toFixed(2).padStart(6)} VP  (${(100 * dMenus / dTot).toFixed(0)}%)`);
console.log(`    crumbs     : ${dCrumbs.toFixed(2).padStart(6)} VP  (${(100 * dCrumbs / dTot).toFixed(0)}%)`);
console.log(`\n    claim gap  : ${((top.claims - bot.claims) / GAMES).toFixed(2)} claims`);
console.log(`    VP per claim, rank 1: ${(( (top.stand+top.cards+top.menus+top.crumbs) / Math.max(1,top.claims) )).toFixed(2)}   rank ${COUNT}: ${(( (bot.stand+bot.cards+bot.menus+bot.crumbs) / Math.max(1,bot.claims) )).toFixed(2)}`);
console.log('    <- if VP PER CLAIM is close, the gap is purely claim COUNT and the fix is access.');
console.log('       If it diverges, the leader is also converting each claim better, and the fix is the conversion.');

console.log('\nTHE 5x5 BOARD AT GAME END, by eventual rank - is board scoring CATCH-UP SHAPED?');
console.log('  rank | tiles left on board | plates on board | score');
for (let k = 0; k < COUNT; k++) {
  const c = accComps[k];
  console.log(`    ${k + 1}  | ${(c.boardTiles / GAMES).toFixed(2).padStart(19)} | ${(c.boardPlates / GAMES).toFixed(2).padStart(15)} | ${((c.stand + c.cards + c.menus + c.crumbs) / GAMES).toFixed(1).padStart(5)}`);
}
console.log('  <- a claim REMOVES a tile from the board and drops a plate on the cell, so if this');
console.log('     column runs OPPOSITE to score, end-game board scoring needs no catch-up machinery:');
console.log('     it is catch-up shaped by construction.');
