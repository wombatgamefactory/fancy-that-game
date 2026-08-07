// FROZEN 6 AUGUST 2026 - HISTORICAL RECORD, DO NOT MAINTAIN.
//
// This probe measured a CANDIDATE end condition against the rules as they stood
// BEFORE the new one was adopted, and several of the things it drives no longer
// exist: the shared empty-plate pool (gameState.cardsNeededToEnd), the endings
// 'cardMarket', 'bagEmpty' and 'boardOverflow', and isGameOver. It is kept as the
// record of what was measured and why the ruling went the way it did, NOT as a
// tool - it may well not run, and it must not be repaired into looking current.
// The design of record is the ENGINE (src/engine/game.js).
//
// LOPIANO-LENS PROBE, part 2: WHO FEEDS THE CLOCK.
//
// The game's commonest ending counts CLAIMS - 6 per player, pooled across the
// table. Claiming is also the game's only scoring action. So the question the
// lens's first gate asks ("can a player pursuing a winning line decline to spend
// the unit the ending counts?") has an unusual answer here, and this probe
// measures the follow-on: if the unit is compulsory only for the player who is
// WINNING, the leader owns the game's length and the trailing player has the
// ending called on them.
//
// Reports, by FINISHING RANK: claims made, share of the table's plate pool
// consumed, final score, and how many turns each rank was refused a claim.
// Read-only with respect to the engine.
import { createGame, sweep, takeBonusTile, declineBonusTile, takeExtraTile, place, claim, skipClaim, skipSpend, moveTile, removePlate, reserveCard, refill, calculateFinalScores } from './src/engine/game.js';
import { createStatsCollector } from './src/engine/statsCollector.js';
import * as basicBot from './src/bots/basicBot.js';

const GAMES = Number(process.argv[2] || 1000);

function runGame(playerCount) {
  const configs = Array.from({ length: playerCount }, (_, i) => ({ name: `P${i + 1}` }));
  const strategy = basicBot;
  let gameState = createGame(configs, createStatsCollector());
  const claimSteps = new Array(playerCount).fill(0);   // claim steps reached
  const claimsMade = new Array(playerCount).fill(0);   // claim steps that produced a claim
  let steps = 0;

  while (!gameState.gameOver && steps < 4000) {
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
        const who = gameState.currentPlayerIndex;
        claimSteps[who]++;
        const c = strategy.decideClaim(gameState);
        let claimed = false;
        if (c) {
          try { gameState = claim(gameState, c.cardId, c.removedBoardIndex, c.destination); claimed = true; }
          catch (e) { gameState = skipClaim(gameState); }
        } else {
          gameState = skipClaim(gameState);
        }
        if (claimed) claimsMade[who]++;
        break;
      }
      case 'refill': gameState = refill(gameState); break;
      default: throw new Error(`unknown phase ${gameState.gamePhase}`);
    }
    steps++;
  }
  calculateFinalScores(gameState);
  return { gameState, claimSteps, claimsMade };
}

console.log(`WHO FEEDS THE CLOCK - ${GAMES} games per player count, basicBot\n`);

for (const playerCount of [2, 3, 4]) {
  const byRank = Array.from({ length: playerCount }, () => ({ claims: 0, steps: 0, score: 0, n: 0 }));
  let poolTotal = 0;

  for (let g = 0; g < GAMES; g++) {
    const { gameState, claimSteps, claimsMade } = runGame(playerCount);
    const order = gameState.players
      .map((p, i) => ({ i, score: p.score, cupcakes: p.cupcakes, cards: p.claimedCards.length }))
      .sort((a, b) => (b.score - a.score) || (b.cupcakes - a.cupcakes) || (b.cards - a.cards));
    poolTotal += gameState.cardsNeededToEnd;
    order.forEach((entry, rank) => {
      byRank[rank].claims += claimsMade[entry.i];
      byRank[rank].steps += claimSteps[entry.i];
      byRank[rank].score += entry.score;
      byRank[rank].n++;
    });
  }

  const poolPerGame = poolTotal / GAMES;
  const allClaims = byRank.reduce((s, r) => s + r.claims, 0) / GAMES;
  console.log(`--- ${playerCount} PLAYERS (plate pool ${poolPerGame}, table claims/game ${allClaims.toFixed(1)}) ---`);
  byRank.forEach((r, rank) => {
    const label = rank === 0 ? 'winner' : rank === playerCount - 1 ? 'last  ' : `#${rank + 1}    `;
    const claims = r.claims / r.n;
    const refused = 100 * (1 - r.claims / r.steps);
    console.log(`  ${label}  claims ${claims.toFixed(2).padStart(5)}  (${(100 * claims / (allClaims)).toFixed(1)}% of the table's)  refused at ${refused.toFixed(1)}% of claim steps  score ${(r.score / r.n).toFixed(1)}`);
  });
  console.log('');
}
