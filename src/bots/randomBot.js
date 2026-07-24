// Random bot: makes random legal moves. A full strategy (decideSweep /
// decidePlacements / decideBonusTile / decideClaim reuse the fast bot's random
// policy) plus its own chaotic tea decisions — used to exercise the tea path
// under maximum noise in simulate.js.

import { getValidPlacements, getTotalCardsClaimed } from '../engine/game.js';

// Reuse the fast bot's random legal-move policy for the ordinary phases (its
// decideClaim already treats a reserved card as a claim candidate).
export { decideSweep, decideBonusTile, decidePlacements, decideClaim } from './fastBot.js';

// Order a fresh pot of tea (once per game) with a small random chance each turn
// while the card is unused, and force it in the late game so it never goes to
// waste. NOTE: the old "no valid sweep -> tea" escape hatch is gone — the engine
// backstop now auto-refreshes a completely empty tile market, so tea is no longer
// the only way to make progress.
export function decideOrderTea(gameState) {
  const player = gameState.players[gameState.currentPlayerIndex];
  if (player.teaCardUsed) return false;
  const cardsLeft = Math.max(0, gameState.cardsNeededToEnd - getTotalCardsClaimed(gameState));
  if (cardsLeft <= gameState.playerCount) return true; // late game — use it
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
