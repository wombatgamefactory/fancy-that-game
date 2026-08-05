// THE LEADER CHECK (Feld lens, Gate F-4): "the never-dead fallback is taken by
// players who are winning - not only as a consolation prize."
//
// Fancy That! has four candidate fallbacks, and the lens grades them by WHO
// takes them, not by how often they are taken overall:
//
//   - the CRUMB TRAY, the always-legal destination for a removed tile;
//   - the EXTRA TILE at 2 cupcakes, the mitigation for a card-locked claim step;
//   - MOVE A TILE at 1 cupcake;
//   - REMOVE A PLATE at 3, the top rung of the ladder.
//
// This splits every one of them by the player's finishing rank in their own
// game. A fallback the winner uses as much as the loser is a real option; one
// the loser uses twice as often is a consolation prize, and the lens says
// players read it as one.
//
// Read-only with respect to the engine - it touches no seam at all.
import {
  createGame, sweep, takeBonusTile, declineBonusTile, takeExtraTile, place, claim,
  skipClaim, skipSpend, moveTile, removePlate, reserveCard, refill,
  calculateFinalScores,
} from './src/engine/game.js';
import { createStatsCollector } from './src/engine/statsCollector.js';
import * as basicBot from './src/bots/basicBot.js';

function runGame(playerConfigs) {
  const strategy = basicBot;
  let gameState = createGame(playerConfigs, createStatsCollector());
  const n = playerConfigs.length;
  const tally = Array.from({ length: n }, () => ({
    crumb: 0, plated: 0, extraTile: 0, move: 0, removePlate: 0, reserve: 0, lockedSteps: 0, claimSteps: 0,
  }));
  let steps = 0;

  while (!gameState.gameOver && steps < 1000) {
    const me = gameState.currentPlayerIndex;
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
        if (extra !== null && extra !== undefined) { tally[me].extraTile++; gameState = takeExtraTile(gameState, extra); }
        gameState = place(gameState, strategy.decidePlacements(gameState));
        break;
      }
      case 'spend': {
        const m = strategy.decideMove ? strategy.decideMove(gameState) : null;
        if (m) { tally[me].move++; gameState = moveTile(gameState, m.fromIndex, m.toIndex); }
        const rp = strategy.decideRemovePlate ? strategy.decideRemovePlate(gameState) : null;
        if (rp !== null && rp !== undefined) { tally[me].removePlate++; gameState = removePlate(gameState, rp); }
        const rc = strategy.decideReserve ? strategy.decideReserve(gameState) : null;
        if (rc !== null && rc !== undefined) { tally[me].reserve++; gameState = reserveCard(gameState, rc); }
        gameState = skipSpend(gameState);
        break;
      }
      case 'claim': {
        // skipSpend has just moved us into 'claim', which is exactly where the
        // engine samples card-lock. Ask the same question here so the lock can be
        // attributed to a player rather than only to the run.
        tally[me].claimSteps++;
        const d = strategy.decideClaim(gameState);
        if (d && d.cardId) {
          if (d.destination && d.destination.type === 'crumb') tally[me].crumb++; else tally[me].plated++;
          gameState = claim(gameState, d.cardId, d.removedBoardIndex, d.destination);
        } else {
          tally[me].lockedSteps++;
          gameState = skipClaim(gameState);
        }
        break;
      }
      case 'refill':
        gameState = refill(gameState);
        break;
    }
    steps++;
  }
  if (gameState.gameOver) calculateFinalScores(gameState);

  // Rank by final score, ties broken arbitrarily - a tie between two players
  // means their tallies land in adjacent rank buckets, which does not bias a
  // comparison between the TOP and BOTTOM buckets.
  const order = gameState.players
    .map((p, i) => ({ i, score: p.score }))
    .sort((a, b) => b.score - a.score);
  // Cupcake INCOME, reconstructed rather than instrumented: everything a player
  // took in either got spent or is still in front of them. The prices are the
  // engine's (move 1, reserve 1, extra tile 2, remove plate 3), so this has to be
  // revisited if the menu is ever repriced.
  return order.map((o, rank) => {
    const t = tally[o.i];
    const spent = t.move * 1 + t.reserve * 1 + t.extraTile * 2 + t.removePlate * 3;
    return {
      rank, ...t, score: o.score,
      income: gameState.players[o.i].cupcakes + spent,
      kept: gameState.players[o.i].cupcakes,
    };
  });
}

const GAMES = parseInt(process.argv[2]) || 3000;
const COUNT = parseInt(process.argv[3]) || 4;
const cfg = Array.from({ length: COUNT }, (_, i) => ({ id: i, name: `P${i}`, type: 'ai' }));

const FIELDS = ['crumb', 'plated', 'extraTile', 'move', 'removePlate', 'reserve', 'lockedSteps', 'claimSteps', 'score', 'income', 'kept'];
const buckets = Array.from({ length: COUNT }, () => {
  const b = { n: 0 };
  for (const k of FIELDS) b[k] = 0;
  return b;
});
for (let g = 0; g < GAMES; g++) {
  for (const r of runGame(cfg)) {
    const b = buckets[r.rank];
    for (const k of FIELDS) b[k] += r[k];
    b.n++;
  }
}

console.log(`\nTHE LEADER CHECK - ${GAMES} games at ${COUNT} players (basic bot)\n`);
console.log('Per player per game, split by finishing rank. Rank 1 is the winner.');
console.log('A fallback the WINNER uses as much as the LOSER is a real option; one');
console.log('the loser uses far more is a consolation prize.\n');
console.log('  rank | score | crumb | plated | crumb% | extraTile | move | rmPlate | reserve | locked% | cupcakes in | kept');
for (let r = 0; r < COUNT; r++) {
  const b = buckets[r];
  const per = (k) => (b[k] / b.n).toFixed(2).padStart(5);
  const crumbPct = (100 * b.crumb / Math.max(1, b.crumb + b.plated)).toFixed(1).padStart(5);
  const lockedPct = (100 * b.lockedSteps / Math.max(1, b.claimSteps)).toFixed(1).padStart(5);
  console.log(
    `    ${r + 1}  | ${(b.score / b.n).toFixed(1).padStart(5)} | ${per('crumb')} |  ${per('plated')} |  ${crumbPct}% |     ${per('extraTile')} | ${per('move')} |   ${per('removePlate')} |   ${per('reserve')} |  ${lockedPct}% |       ${per('income')} | ${per('kept')}`,
  );
}
console.log('');
