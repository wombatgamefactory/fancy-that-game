import { getValidSweeps, getValidPlacements, getPatternMatches } from '../engine/game.js';
import { decideDestination, decideOrderTea as basicOrderTea, decideTeaReserve as basicTeaReserve } from './basicBot.js';

// Tea decisions reuse the basicBot heuristics (cheap window scans — no rollout
// cost), so the fast bot exercises the tea path with the same policy.
export function decideOrderTea(gameState) {
  return basicOrderTea(gameState);
}

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

  // Candidates are the market cards plus this player's reserved card (which
  // completes as a normal claim). Find the first claimable one and pick a tile.
  const candidateCards = [...gameState.cardMarket];
  if (currentPlayer.reservedCard) candidateCards.push(currentPlayer.reservedCard);

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
