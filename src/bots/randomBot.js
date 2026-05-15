// Random bot: makes random legal moves

import { getValidPlacements, BOARD_SIZE } from '../engine/game.js';

export function makeRandomMove(board, tileCount) {
  const validPositions = getValidPlacements(board, tileCount);

  if (validPositions.length < tileCount) {
    throw new Error('Not enough valid positions to place tiles');
  }

  // Randomly select tileCount positions from valid positions
  const placements = [];
  const availablePositions = [...validPositions];

  for (let i = 0; i < tileCount; i++) {
    const idx = Math.floor(Math.random() * availablePositions.length);
    placements.push(availablePositions[idx]);
    availablePositions.splice(idx, 1);
  }

  return placements;
}
