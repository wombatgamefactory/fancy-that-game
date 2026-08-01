// Random bot: makes random legal moves. A full strategy (decideSweep /
// decidePlacements / decideBonusTile / decideClaim reuse the fast bot's random
// policy) plus a random reserve pick — used to exercise the tea path under
// maximum noise in simulate.js.

import { getValidPlacements } from '../engine/game.js';

// Reuse the fast bot's random legal-move policy for the ordinary phases (its
// decideClaim already treats a reserved card as a claim candidate).
export { decideSweep, decideBonusTile, decidePlacements, decideClaim } from './fastBot.js';

// NO decideOrderTea SINCE 1 AUGUST. This bot used to flush on a 10% coin-flip
// wherever it was legal (kept low so the noise games did not churn the tile
// market every single turn). Tea is no longer a decision at all - it fires from
// inside refill() at the end of any turn that leaves four teapots showing - so
// the random policy now reaches the tea path through decideSweep instead, which
// is a better noise test anyway: the randomness is applied to the thing that
// actually pulls the trigger.

// Reserve a random market card (the reserve is uncapped, so the only pass is an
// empty market).
export function decideTeaReserve(gameState, reserverIndex) {
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
