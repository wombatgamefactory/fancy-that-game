// HOW MANY PHYSICAL CUPCAKE TOKENS DOES THE BOX ACTUALLY NEED? (17 August 2026)
//
// Dean's setup change: after the 10 empty plates go onto the cake stand, a
// cupcake also goes onto each of the 5 CUPCAKE_PLATES squares, so the reward is
// sitting there waiting rather than being remembered. That turns a token that
// used to be drawn from a shared supply on demand into a token COMMITTED AT
// SETUP, which is a component-count question the engine cannot answer - the
// engine's supply is unbounded (see the CUPCAKE_PLATES block in game.js).
//
// WHAT IS MEASURED. At every step of every game, the physical demand on the box:
//
//     tokens in play = (cupcakes in every player's purse)
//                    + (cupcakes still sitting on unfilled cupcake plates)
//
// A cupcake on a plate has left the supply; a cupcake spent goes back to it. So
// the peak of that sum across a game is the smallest supply that never runs
// short. The rulebook v12 component list says 30 cupcake tokens.
//
// The spend step is copied verbatim from arena.js, per the standing warning in
// the worklist: every probe written before 10 August drives decideExtraTile at
// the PLACE step, where it silently returns null and the game plays cheaper.
import { createGame, sweep, takeBonusTile, declineBonusTile, dealCards, takeExtraTile, place, claim, skipClaim, skipSpend, moveTile, removePlate, refill, calculateFinalScores, CUPCAKE_PLATES, getStartingCupcakes } from './src/engine/game.js';
import * as bot from './src/bots/basicBot.js';

const games = parseInt(process.argv[2]) || 1000;

// Cupcakes still sitting on this player's unfilled cupcake plates. A plate is
// covered once its row holds more tiles than the plate's index.
function unclaimedPlateCupcakes(player) {
  return CUPCAKE_PLATES.filter(p => player.stand[p.rowIndex].tiles.length <= p.plateIndex).length;
}

function tokensInPlay(gameState) {
  return gameState.players.reduce(
    (sum, p) => sum + p.cupcakes + unclaimedPlateCupcakes(p), 0);
}

function runGame(playerCount, stats) {
  const playerConfigs = Array.from({ length: playerCount },
    (_, i) => ({ name: `Bot ${i + 1}`, aiDifficulty: 'basic', isHuman: false }));
  let gameState = createGame(playerConfigs, null);
  let peak = tokensInPlay(gameState);
  const setupDemand = peak;
  let steps = 0;
  while (!gameState.gameOver && steps < 2000) {
    switch (gameState.gamePhase) {
      case 'sweep': {
        if (gameState.bonusTileAvailable) {
          const bonusIdx = bot.decideBonusTile(gameState);
          if (bonusIdx !== null && bonusIdx !== undefined && gameState.market[bonusIdx]) gameState = takeBonusTile(gameState, bonusIdx);
          else gameState = declineBonusTile(gameState);
          break;
        }
        const decision = bot.decideSweep(gameState);
        if (decision) gameState = sweep(gameState, decision.rowOrCol, decision.isRow, decision.declaration, decision.declarationType);
        else gameState.gamePhase = 'place';
        break;
      }
      case 'place':
        gameState = place(gameState, bot.decidePlacements(gameState));
        break;
      case 'spend': {
        for (let n = 0; n < 25; n++) {
          const ex = bot.decideExtraTile ? bot.decideExtraTile(gameState) : null;
          if (ex === null || ex === undefined) break;
          gameState = takeExtraTile(gameState, ex.marketIndex, ex.boardIndex);
        }
        for (let n = 0; n < 25; n++) {
          const mv = bot.decideMove ? bot.decideMove(gameState) : null;
          if (!mv) break;
          gameState = moveTile(gameState, mv.fromIndex, mv.toIndex);
        }
        for (let n = 0; n < 25; n++) {
          const rp = bot.decideRemovePlate ? bot.decideRemovePlate(gameState) : null;
          if (rp === null || rp === undefined) break;
          gameState = removePlate(gameState, rp);
        }
        for (let n = 0; n < 10; n++) {
          if (!(bot.decideDealCards && bot.decideDealCards(gameState))) break;
          gameState = dealCards(gameState);
        }
        gameState = skipSpend(gameState);
        break;
      }
      case 'claim': {
        const d = bot.decideClaim(gameState);
        if (d && d.cardId) gameState = claim(gameState, d.cardId, d.removedBoardIndex, d.destination);
        else gameState = skipClaim(gameState);
        break;
      }
      case 'refill':
        gameState = refill(gameState);
        break;
    }
    const now = tokensInPlay(gameState);
    if (now > peak) peak = now;
    steps++;
  }
  if (gameState.gameOver) calculateFinalScores(gameState);
  stats.setupDemand = setupDemand;
  stats.peaks.push(peak);
  stats.endHeld.push(gameState.players.reduce((s, p) => s + p.cupcakes, 0));
  return gameState;
}

console.log(`CUPCAKE TOKEN DEMAND WITH CUPCAKES PRE-PLACED AT SETUP`);
console.log(`${games} games per player count, basicBot in every seat.`);
console.log(`${CUPCAKE_PLATES.length} cupcake plates per player. Rulebook v12 ships 30 tokens.\n`);

for (const playerCount of [2, 3, 4]) {
  const stats = { peaks: [], endHeld: [], setupDemand: 0 };
  for (let g = 0; g < games; g++) runGame(playerCount, stats);
  const peaks = stats.peaks;
  const mean = peaks.reduce((a, b) => a + b, 0) / peaks.length;
  const max = Math.max(...peaks);
  const sorted = [...peaks].sort((a, b) => a - b);
  const p99 = sorted[Math.floor(sorted.length * 0.99)];
  const over30 = peaks.filter(v => v > 30).length;
  const start = getStartingCupcakes(playerCount);
  const endMean = stats.endHeld.reduce((a, b) => a + b, 0) / stats.endHeld.length;
  console.log(`--- ${playerCount} players ---`);
  console.log(`  starting cupcakes dealt to purses : ${start.join(' + ')} = ${start.reduce((a, b) => a + b, 0)}`);
  console.log(`  cupcakes pre-placed on the stands : ${playerCount} x ${CUPCAKE_PLATES.length} = ${playerCount * CUPCAKE_PLATES.length}`);
  console.log(`  DEMAND AT SETUP, BEFORE A TURN    : ${stats.setupDemand}`);
  console.log(`  peak tokens in play: mean=${mean.toFixed(2)}  p99=${p99}  max=${max}`);
  console.log(`  games whose peak exceeds 30       : ${over30}/${games} (${(100 * over30 / games).toFixed(1)}%)`);
  console.log(`  cupcakes still held at game end   : mean=${endMean.toFixed(2)}\n`);
}
