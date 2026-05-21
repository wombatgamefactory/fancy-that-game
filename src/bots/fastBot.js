import { getValidSweeps, getValidPlacements, getPatternMatches } from '../engine/game.js';

export function decideSweep(gameState) {
  const validSweeps = getValidSweeps(gameState);
  if (validSweeps.length === 0) return null;
  return validSweeps[Math.floor(Math.random() * validSweeps.length)];
}

export function decideBonusTile(gameState) {
  const availableTiles = gameState.market
    .map((t, i) => ({ tile: t, index: i }))
    .filter(({ tile }) => tile !== null);
  if (availableTiles.length === 0) return null;
  return availableTiles[Math.floor(Math.random() * availableTiles.length)].index;
}

export function decidePlacements(gameState) {
  const currentPlayer = gameState.players[gameState.currentPlayerIndex];
  const validPositions = getValidPlacements(currentPlayer.board);
  const tilesToPlace = gameState.pendingSweepTiles.length;

  const placements = [];
  const availablePositions = [...validPositions];

  for (let i = 0; i < tilesToPlace && availablePositions.length > 0; i++) {
    const idx = Math.floor(Math.random() * availablePositions.length);
    placements.push(availablePositions[idx]);
    availablePositions.splice(idx, 1);
  }

  return placements;
}

export function decideClaim(gameState) {
  const currentPlayer = gameState.players[gameState.currentPlayerIndex];

  // Find first claimable card and randomly pick a tile to remove
  for (const card of gameState.cardMarket) {
    const matches = getPatternMatches(currentPlayer.board, card.pattern);
    if (matches.length > 0) {
      const match = matches[0];
      const patternCells = match.cells;
      const removeIdx = patternCells[Math.floor(Math.random() * patternCells.length)];
      return { cardId: card.id, removedBoardIndex: removeIdx };
    }
  }

  return null;
}
