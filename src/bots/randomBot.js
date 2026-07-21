// Random bot: makes random legal moves. A full strategy (decideSweep /
// decidePlacements / decideBonusTile / decideClaim reuse the fast bot's random
// policy) plus its own chaotic tea decisions — used to exercise the tea path
// under maximum noise in simulate.js.

import { getValidPlacements, getValidSweeps } from '../engine/game.js';

// Reuse the fast bot's random legal-move policy for the ordinary phases (its
// decideClaim already treats a reserved card as a claim candidate).
export { decideSweep, decideBonusTile, decidePlacements, decideClaim } from './fastBot.js';

// Order a fresh pot of tea 5% of the time. If no valid sweep exists, tea is the
// only way to make progress, so always take it then (orderTea is always legal
// in the sweep phase).
export function decideOrderTea(gameState) {
  if (getValidSweeps(gameState).length === 0) return true;
  return Math.random() < 0.05;
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
