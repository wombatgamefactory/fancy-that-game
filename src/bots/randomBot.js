// Random bot: makes random legal moves

import { getValidPlacements } from '../engine/game.js';

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
