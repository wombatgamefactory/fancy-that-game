// Random bot: makes random legal moves. A full strategy (decideSweep /
// decidePlacements / decideBonusTile / decideClaim reuse the fast bot's random
// policy) plus its own chaotic tea decisions — used to exercise the tea path
// under maximum noise in simulate.js.

import { getValidPlacements, canOrderTea } from '../engine/game.js';
import { refreshWouldRestockBoard } from './basicBot.js';

// Reuse the fast bot's random legal-move policy for the ordinary phases (its
// decideClaim already treats a reserved card as a claim candidate).
export { decideSweep, decideBonusTile, decidePlacements, decideClaim } from './fastBot.js';

// Order a fresh pot of tea with a small random chance on any turn where it is
// legal. canOrderTea is the whole legality gate (28 July: the once-per-game tea
// card is deleted, so there is no per-player flag to check and no "use it before
// it goes to waste" late-game clause). Two deliberate restraints on top of it:
// the chance stays low, because a bot that flushed at every legal opportunity
// would churn the tile market every turn and make the noise-test games
// meaningless; and refreshWouldRestockBoard declines a flush that could not
// refill the board (see its comment in basicBot.js - now play judgement, since
// the empty-bag rule closed the cupcake-pump loop for good).
export function decideOrderTea(gameState) {
  if (!canOrderTea(gameState)) return false;
  if (!refreshWouldRestockBoard(gameState)) return false;
  return Math.random() < 0.1;
}

// Reserve a random market card when this player's reserve is empty, else pass.
export function decideTeaReserve(gameState, reserverIndex) {
  const player = gameState.players[reserverIndex];
  if (player.reservedCard !== null) return null;
  if (gameState.cardMarket.length === 0) return null;
  const card = gameState.cardMarket[Math.floor(Math.random() * gameState.cardMarket.length)];
  return card.id;
}

export function makeRandomMove(board, tileCount) {
  const validPositions = getValidPlacements(board, tileCount);

  // If not enough positions, return what we have (game will handle end condition)
  const placementsCount = Math.min(tileCount, validPositions.length);

  // Randomly select placementsCount positions from valid positions
  const placements = [];
  const availablePositions = [...validPositions];

  for (let i = 0; i < placementsCount; i++) {
    const idx = Math.floor(Math.random() * availablePositions.length);
    placements.push(availablePositions[idx]);
    availablePositions.splice(idx, 1);
  }

  return placements;
}
