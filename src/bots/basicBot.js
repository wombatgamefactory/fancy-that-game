import { getValidSweeps, getPatternMatches, getValidPlacements, BOARD_SIZE } from '../engine/game.js';

export function decideSweep(gameState) {
  const validSweeps = getValidSweeps(gameState);
  if (validSweeps.length === 0) return null;

  const currentPlayer = gameState.players[gameState.currentPlayerIndex];

  // Prioritize sweeps that help build patterns for available cards
  let bestSweep = validSweeps[0];
  let bestScore = -1;

  for (const sweep of validSweeps) {
    let score = 0;

    // Check if this sweep helps any available card patterns
    for (const card of gameState.cardMarket) {
      const currentMatches = getPatternMatches(currentPlayer.board, card.pattern);
      // Tiles from this sweep could potentially help build future patterns
      score += 1;
    }

    // Prefer sweeps with more tiles (get more options)
    const tiles = gameState.market.filter((t, i) => {
      const rowOrCol = sweep.isRow ? Math.floor(i / 6) : i % 6;
      const matches = sweep.declarationType === 'colour'
        ? t && t.colour === sweep.declaration
        : t && t.ingredient === sweep.declaration;
      return rowOrCol === sweep.rowOrCol && matches;
    });
    score += tiles.length * 0.5;

    if (score > bestScore) {
      bestScore = score;
      bestSweep = sweep;
    }
  }

  return bestSweep;
}

export function decideBonusTile(gameState) {
  const availableTiles = gameState.market
    .map((t, i) => ({ tile: t, index: i }))
    .filter(({ tile }) => tile !== null);

  if (availableTiles.length === 0) return null;

  const currentPlayer = gameState.players[gameState.currentPlayerIndex];
  let bestIndex = availableTiles[0].index;
  let bestScore = -1;

  for (const { tile, index } of availableTiles) {
    let score = 0;

    // Prefer tiles that help existing patterns
    for (const card of gameState.cardMarket) {
      if (card.pattern[0] === tile.colour) {
        score += 10;
      }
    }

    // Prefer tiles matching symbols we're collecting
    const ingredientCount = gameState.pendingSweepTiles.filter(
      t => t.ingredient === tile.ingredient
    ).length;
    score += ingredientCount * 2;

    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  }

  return bestIndex;
}

export function decidePlacements(gameState) {
  const currentPlayer = gameState.players[gameState.currentPlayerIndex];
  const validPositions = getValidPlacements(currentPlayer.board);
  const tilesToPlace = gameState.pendingSweepTiles;

  if (validPositions.length < tilesToPlace.length) {
    throw new Error('Not enough valid positions to place tiles');
  }

  const placements = [];
  const usedPositions = new Set();

  // Sort tiles by color for strategic placement
  const sortedTiles = [...tilesToPlace].sort((a, b) => {
    return (b.colour || '').localeCompare(a.colour || '');
  });

  for (const tile of sortedTiles) {
    let bestPos = validPositions[0];
    let bestScore = -1;

    for (const pos of validPositions) {
      if (usedPositions.has(pos)) continue;

      let score = 0;

      // Prefer positions that could form patterns
      for (const card of gameState.cardMarket) {
        // Simulate placing tile at this position
        currentPlayer.board[pos] = tile;
        const matches = getPatternMatches(currentPlayer.board, card.pattern);
        currentPlayer.board[pos] = null;

        if (matches.length > 0) {
          score += 5;
        }
      }

      // Spread tiles somewhat randomly to avoid overcrowding
      score += Math.random();

      if (score > bestScore) {
        bestScore = score;
        bestPos = pos;
      }
    }

    placements.push(bestPos);
    usedPositions.add(bestPos);
  }

  return placements;
}

export function decideClaim(gameState) {
  const currentPlayer = gameState.players[gameState.currentPlayerIndex];

  // Find all claimable cards
  const claimableCards = [];

  for (const card of gameState.cardMarket) {
    const matches = getPatternMatches(currentPlayer.board, card.pattern);
    if (matches.length > 0) {
      claimableCards.push({ card, matches });
    }
  }

  if (claimableCards.length === 0) {
    return null; // Skip claim
  }

  // Prefer cards with more symbols (better end-game score potential)
  claimableCards.sort((a, b) => {
    const scoreA = (a.card.symbolCount || 0);
    const scoreB = (b.card.symbolCount || 0);
    return scoreB - scoreA;
  });

  const { card, matches } = claimableCards[0];
  const match = matches[0];

  // Choose which tile to remove: prefer tiles with ingredients we already have
  const patternCells = getAllPatternCells(card.pattern, match.row, match.col, match.rotation);
  let bestRemoveIndex = patternCells[0];
  let bestRemoveScore = -1;

  for (const cellIndex of patternCells) {
    const tile = currentPlayer.board[cellIndex];
    if (!tile || tile.type === 'placeholder') continue;

    let score = 0;

    // Prefer removing tiles with ingredients matching other claimed cards
    for (const claimedCardId of currentPlayer.claimedCards) {
      // This would be a bonus strategy - not critical for basic AI
    }

    // Prefer removing duplicates if we have them
    const otherTiles = currentPlayer.board.filter(
      (t, i) => i !== cellIndex && t && t.type !== 'placeholder' && t.ingredient === tile.ingredient
    );
    score += otherTiles.length;

    if (score > bestRemoveScore) {
      bestRemoveScore = score;
      bestRemoveIndex = cellIndex;
    }
  }

  return { cardId: card.id, removedBoardIndex: bestRemoveIndex };
}

function getAllPatternCells(pattern, row, col, rotation) {
  const rotated = rotatePattern(pattern, rotation);
  const cells = [];
  const boardIndices = [
    row * BOARD_SIZE + col,
    row * BOARD_SIZE + col + 1,
    (row + 1) * BOARD_SIZE + col,
    (row + 1) * BOARD_SIZE + col + 1,
  ];

  for (let i = 0; i < 4; i++) {
    if (rotated[i]) {
      cells.push(boardIndices[i]);
    }
  }

  return cells;
}

function rotatePattern(pattern, turns) {
  let p = [...pattern];
  for (let i = 0; i < turns % 4; i++) {
    p = [p[2], p[0], p[3], p[1]];
  }
  return p;
}
