import { getValidSweeps, getValidPlacements, getPatternMatches } from '../engine/game.js';
import { decideDestination, decideTeaReserve as basicTeaReserve } from './basicBot.js';

// decideOrderTea is gone (1 August): tea is no longer a decision, it fires from
// the engine at the end of any turn that leaves four teapots showing. The RESERVE
// decision inside a tea round is still real, and still reuses the basicBot
// heuristic (cheap window scans — no rollout cost).
export function decideTeaReserve(gameState, reserverIndex) {
  return basicTeaReserve(gameState, reserverIndex);
}

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

  // Candidates are the market cards plus this player's reserved cards (which
  // complete as normal claims). Find the first claimable one and pick a tile.
  const candidateCards = [...gameState.cardMarket, ...currentPlayer.reservedCards];

  for (const card of candidateCards) {
    const matches = getPatternMatches(currentPlayer.board, card.pattern);
    if (matches.length > 0) {
      const match = matches[0];
      const patternCells = match.cells;
      const removeIdx = patternCells[Math.floor(Math.random() * patternCells.length)];
      const removedTile = currentPlayer.board[removeIdx];
      const destination = decideDestination(currentPlayer, removedTile, gameState);
      return { cardId: card.id, removedBoardIndex: removeIdx, destination };
    }
  }

  return null;
}
