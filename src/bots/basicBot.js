import { getValidSweeps, getPatternMatches, getValidPlacements, BOARD_SIZE, INGREDIENTS, REWARD_CARDS } from '../engine/game.js';

function getSweptTiles(market, sweep, marketSize) {
  const tiles = [];
  if (sweep.isRow) {
    const startIdx = sweep.rowOrCol * marketSize;
    const endIdx = startIdx + marketSize;
    for (let i = startIdx; i < endIdx; i++) {
      const tile = market[i];
      if (tile) {
        const matches = sweep.declarationType === 'colour'
          ? tile.colour === sweep.declaration
          : tile.ingredient === sweep.declaration;
        if (matches) {
          tiles.push(tile);
        }
      }
    }
  } else {
    // Column
    for (let r = 0; r < marketSize; r++) {
      const i = r * marketSize + sweep.rowOrCol;
      const tile = market[i];
      if (tile) {
        const matches = sweep.declarationType === 'colour'
          ? tile.colour === sweep.declaration
          : tile.ingredient === sweep.declaration;
        if (matches) {
          tiles.push(tile);
        }
      }
    }
  }
  return tiles;
}

export function decideSweep(gameState) {
  const validSweeps = getValidSweeps(gameState);
  if (validSweeps.length === 0) return null;

  const currentPlayer = gameState.players[gameState.currentPlayerIndex];
  const marketSize = Math.sqrt(gameState.market.length);

  // Build wanted colours set from card market
  const wantedColours = new Set();
  for (const card of gameState.cardMarket) {
    for (const colour of card.pattern) {
      if (colour) wantedColours.add(colour);
    }
  }

  // Precompute ingredient value from claimed cards
  const ingredientSymbols = {};
  const ingredientValue = {};
  for (const ingredient of INGREDIENTS) {
    ingredientSymbols[ingredient] = 0;
    ingredientValue[ingredient] = 0;
  }

  for (const cardId of currentPlayer.claimedCards) {
    const card = REWARD_CARDS.find(c => c.id === cardId);
    if (card) {
      const ingredient = card.ingredient;
      ingredientSymbols[ingredient] += card.symbolCount;
    }
  }

  // Ingredient value = total symbols already claimed for that ingredient
  for (const ingredient of INGREDIENTS) {
    ingredientValue[ingredient] = ingredientSymbols[ingredient];
  }

  let bestSweep = validSweeps[0];
  let bestScore = -Infinity;

  for (const sweep of validSweeps) {
    let score = 0;

    const sweptTiles = getSweptTiles(gameState.market, sweep, marketSize);

    for (const tile of sweptTiles) {
      // Score based on card pattern matches
      for (const card of gameState.cardMarket) {
        if (sweep.declarationType === 'colour' && card.pattern.includes(tile.colour)) {
          score += 1 + card.symbolCount * 0.5;
        }
      }

      // Score based on ingredient trajectory
      if (sweep.declarationType === 'ingredient') {
        score += ingredientValue[tile.ingredient] * 0.4;
      }
    }

    // Mild bonus for more tiles = more options
    score += sweptTiles.length * 0.1;

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

  if (availableTiles.length === 0) {
    return null;
  }

  const currentPlayer = gameState.players[gameState.currentPlayerIndex];
  let bestIndex = availableTiles[0].index;
  let bestScore = -Infinity;

  for (const { tile, index } of availableTiles) {
    let score = 0;

    // Prefer tiles that help patterns on cards in market
    for (const card of gameState.cardMarket) {
      if (card.pattern.includes(tile.colour)) {
        score += 5 + card.symbolCount;
      }
    }

    // Prefer tiles matching ingredients we're collecting
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

  // Build ingredient symbol map from claimed cards
  const ingredientSymbols = {};
  const ingredientInPile = {};
  for (const ingredient of INGREDIENTS) {
    ingredientSymbols[ingredient] = 0;
    ingredientInPile[ingredient] = 0;
  }

  for (const cardId of currentPlayer.claimedCards) {
    const card = REWARD_CARDS.find(c => c.id === cardId);
    if (card) {
      ingredientSymbols[card.ingredient] += card.symbolCount;
    }
  }

  // Count tiles in scoring pile by ingredient
  for (const tile of currentPlayer.scoringPile) {
    if (tile && tile.ingredient) {
      ingredientInPile[tile.ingredient] = (ingredientInPile[tile.ingredient] || 0) + 1;
    }
  }

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

  // Sort by symbol count (descending), then by ingredient pile count (tie-break)
  claimableCards.sort((a, b) => {
    const symbolDiff = (b.card.symbolCount || 0) - (a.card.symbolCount || 0);
    if (symbolDiff !== 0) return symbolDiff;

    // Tiebreaker: prefer card whose ingredient has more in pile
    const pileA = ingredientInPile[a.card.ingredient] || 0;
    const pileB = ingredientInPile[b.card.ingredient] || 0;
    return pileB - pileA;
  });

  const { card, matches } = claimableCards[0];
  const match = matches[0];

  // Choose which tile to remove with strategic scoring
  const patternCells = match.cells;
  let bestRemoveIndex = patternCells[0];
  let bestRemoveScore = -Infinity;

  for (const cellIndex of patternCells) {
    const tile = currentPlayer.board[cellIndex];
    if (!tile) continue;

    let score = 0;

    // Reward sending high-multiplier ingredient to pile
    const cardSymbols = ingredientSymbols[tile.ingredient] || 0;
    score += cardSymbols * 3;

    // Check if removing this tile breaks future pattern needs
    const coloursNeeded = new Set();
    for (const card of gameState.cardMarket) {
      for (const colour of card.pattern) {
        if (colour) coloursNeeded.add(colour);
      }
    }

    if (coloursNeeded.has(tile.colour)) {
      const otherTilesOfColour = currentPlayer.board.filter(
        (t, i) => i !== cellIndex && t && t.colour === tile.colour
      );
      if (otherTilesOfColour.length === 0) {
        score -= 10; // Penalty for breaking pattern needs
      }
    }

    // Bonus for reinforcing ingredient trajectory
    const alreadyInPile = ingredientInPile[tile.ingredient] || 0;
    score += alreadyInPile * 0.5;

    if (score > bestRemoveScore) {
      bestRemoveScore = score;
      bestRemoveIndex = cellIndex;
    }
  }

  return { cardId: card.id, removedBoardIndex: bestRemoveIndex };
}
