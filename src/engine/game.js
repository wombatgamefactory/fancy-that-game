import { BOARD_SIZE, CARD_MARKET_SIZE, TOTAL_GAME_CARDS, REWARD_CARDS, COLOURS, INGREDIENTS, createTileBag } from './tiles.js';

function getMarketSize(playerCount) {
  return playerCount === 2 ? 5 : 6;
}

function getRefillThreshold(playerCount) {
  return playerCount === 2 ? 5 : 6;
}

export function createGame(playerConfigs, statsCollector = null) {
  const bag = createTileBag();
  const playerCount = playerConfigs.length;
  const marketSize = getMarketSize(playerCount);

  const players = playerConfigs.map((config, index) => ({
    id: index,
    name: config.name || `Player ${index + 1}`,
    isHuman: config.isHuman || false,
    aiDifficulty: config.aiDifficulty || null,
    board: Array(BOARD_SIZE * BOARD_SIZE).fill(null),
    scoringPile: [],
    claimedCards: [],
    cupcakes: 5,
    score: 0,
  }));

  const market = [];
  for (let i = 0; i < marketSize * marketSize; i++) {
    market.push(bag.shift());
  }

  if (statsCollector) {
    statsCollector.recordMarketFill();
  }

  const { gameDeck, cardMarket } = initGameDeck(playerCount);
  let cardsNeededToEnd = TOTAL_GAME_CARDS;
  if (playerCount === 3) cardsNeededToEnd = 24;
  else if (playerCount === 4) cardsNeededToEnd = 32;

  if (statsCollector) {
    for (const card of cardMarket) {
      statsCollector.recordCardMarketEntry(card.id, 0);
    }
  }

  return {
    players,
    market,
    bag,
    gameDeck,
    cardMarket,
    currentPlayerIndex: 0,
    gamePhase: 'sweep',
    pendingSweepTiles: [],
    bonusTileAvailable: false,
    gameOver: false,
    endGameReason: null, // 'cardMarket' or 'boardOverflow'
    remainingTurnsInEndGame: 0, // for boardOverflow end game
    cardsNeededToEnd,
    playerCount,
    marketSize,
    stats: {
      turnsPlayed: 0,
    },
    statsCollector,
  };
}

export function initGameDeck(playerCount) {
  const shuffledCards = [...REWARD_CARDS].sort(() => Math.random() - 0.5);

  const cardMarket = shuffledCards.splice(0, CARD_MARKET_SIZE);
  const gameDeck = shuffledCards.splice(0, TOTAL_GAME_CARDS);

  return { gameDeck, cardMarket };
}

function getRowTiles(market, rowIndex, marketSize) {
  const tiles = [];
  for (let col = 0; col < marketSize; col++) {
    tiles.push(market[rowIndex * marketSize + col]);
  }
  return tiles;
}

function getColumnTiles(market, colIndex, marketSize) {
  const tiles = [];
  for (let row = 0; row < marketSize; row++) {
    tiles.push(market[row * marketSize + colIndex]);
  }
  return tiles;
}

function getTileIndex(rowOrCol, isRow, marketSize) {
  if (isRow) {
    return (rowOrCol) * marketSize;
  } else {
    return rowOrCol;
  }
}

export function sweep(gameState, rowOrCol, isRow, declaration, declarationType) {
  if (gameState.gamePhase !== 'sweep') throw new Error('Not in sweep phase');

  const tiles = isRow ? getRowTiles(gameState.market, rowOrCol, gameState.marketSize) : getColumnTiles(gameState.market, rowOrCol, gameState.marketSize);

  const sweptTiles = [];
  const sweptIndices = [];

  for (let i = 0; i < tiles.length; i++) {
    const tile = tiles[i];
    if (!tile) continue;

    const matches = declarationType === 'colour' ? tile.colour === declaration : tile.ingredient === declaration;
    if (matches) {
      sweptTiles.push(tile);
      sweptIndices.push(getTileIndex(rowOrCol, isRow, gameState.marketSize) + (isRow ? i : i * gameState.marketSize));
    }
  }

  if (sweptTiles.length === 0) throw new Error('No tiles match declaration');

  gameState.pendingSweepTiles = sweptTiles;

  for (const idx of sweptIndices) {
    gameState.market[idx] = null;
  }

  const isLineClear = isRow
    ? getRowTiles(gameState.market, rowOrCol, gameState.marketSize).every(t => t === null)
    : getColumnTiles(gameState.market, rowOrCol, gameState.marketSize).every(t => t === null);

  gameState.bonusTileAvailable = isLineClear;

  if (gameState.statsCollector) {
    gameState.statsCollector.recordSweep(sweptTiles.length);
  }

  if (!isLineClear) {
    gameState.gamePhase = 'place';
  }

  return gameState;
}

export function takeBonusTile(gameState, marketIndex) {
  if (!gameState.bonusTileAvailable) throw new Error('Bonus tile not available');
  if (gameState.market[marketIndex] === null) throw new Error('No tile at selected position');

  gameState.pendingSweepTiles.push(gameState.market[marketIndex]);
  gameState.market[marketIndex] = null;
  gameState.bonusTileAvailable = false;
  gameState.gamePhase = 'place';

  return gameState;
}

export function place(gameState, placements) {
  if (gameState.gamePhase !== 'place') throw new Error('Not in place phase');
  if (placements.length !== gameState.pendingSweepTiles.length) {
    throw new Error('Must place all swept tiles');
  }

  const player = gameState.players[gameState.currentPlayerIndex];
  const emptyCount = getValidPlacements(player.board).length;

  // Check for board overflow - not enough empty cells to place all swept tiles
  if (placements.length > emptyCount) {
    gameState.endGameReason = 'boardOverflow';
    gameState.remainingTurnsInEndGame = gameState.players.length - 1;
    gameState.pendingSweepTiles = [];
    gameState.gamePhase = 'refill'; // Skip directly to refill to move to next player
    return gameState;
  }

  for (let i = 0; i < placements.length; i++) {
    const boardIndex = placements[i];
    const tile = gameState.pendingSweepTiles[i];

    if (boardIndex < 0 || boardIndex >= BOARD_SIZE * BOARD_SIZE) throw new Error('Invalid board position');
    const cell = player.board[boardIndex];
    if (cell !== null) throw new Error('Cell already occupied or blocked');

    player.board[boardIndex] = tile;
  }

  gameState.pendingSweepTiles = [];
  gameState.gamePhase = 'claim';

  return gameState;
}

export function claim(gameState, cardId, removedBoardIndex) {
  if (gameState.gamePhase !== 'claim') throw new Error('Not in claim phase');

  const player = gameState.players[gameState.currentPlayerIndex];
  const cardIndex = gameState.cardMarket.findIndex(c => c.id === cardId);
  if (cardIndex === -1) throw new Error('Card not in market');

  const card = gameState.cardMarket[cardIndex];
  const matches = getPatternMatches(player.board, card.pattern);

  if (matches.length === 0) throw new Error('Pattern not found on board');

  const allValidCells = new Set();
  for (const match of matches) {
    match.cells.forEach(cell => allValidCells.add(cell));
  }

  if (!allValidCells.has(removedBoardIndex)) {
    throw new Error('Removed tile not in any valid matching pattern');
  }

  const removedTile = player.board[removedBoardIndex];
  if (!removedTile || removedTile.type === 'blocked') {
    throw new Error('Cannot remove blocked or empty cell');
  }

  player.scoringPile.push(removedTile);
  player.board[removedBoardIndex] = { type: 'blocked' };
  player.claimedCards.push(cardId);

  if (gameState.statsCollector) {
    gameState.statsCollector.recordCardClaimed(cardId, gameState.stats.turnsPlayed);
    gameState.statsCollector.recordCardMarketExit(cardId, gameState.stats.turnsPlayed);
  }

  gameState.cardMarket.splice(cardIndex, 1);

  if (gameState.gameDeck.length > 0) {
    const newCard = gameState.gameDeck.shift();
    gameState.cardMarket.push(newCard);
    if (gameState.statsCollector) {
      gameState.statsCollector.recordCardMarketEntry(newCard.id, gameState.stats.turnsPlayed);
    }
  }

  gameState.gamePhase = 'refill';
  return gameState;
}

export function moveTile(gameState, fromIndex, toIndex) {
  const allowedPhases = ['sweep', 'place', 'claim'];
  if (!allowedPhases.includes(gameState.gamePhase)) {
    throw new Error('Cannot move tile in this phase');
  }
  const player = gameState.players[gameState.currentPlayerIndex];
  if (player.cupcakes <= 0) throw new Error('No cupcakes available');
  if (player.board[fromIndex] === null || isBlockedSpace(player.board[fromIndex])) throw new Error('No tile at source cell');
  if (player.board[toIndex] !== null) throw new Error('Target cell is occupied or blocked');
  player.board[toIndex] = player.board[fromIndex];
  player.board[fromIndex] = null;
  player.cupcakes--;
  return gameState;
}

export function skipClaim(gameState) {
  if (gameState.gamePhase !== 'claim') throw new Error('Not in claim phase');
  gameState.gamePhase = 'refill';
  return gameState;
}

export function refill(gameState) {
  if (gameState.gamePhase !== 'refill') throw new Error('Not in refill phase');

  const tilesInMarket = gameState.market.filter(t => t !== null).length;
  const refillThreshold = getRefillThreshold(gameState.playerCount);

  if (tilesInMarket <= refillThreshold && gameState.bag.length > 0) {
    for (let i = 0; i < gameState.market.length; i++) {
      if (gameState.market[i] === null && gameState.bag.length > 0) {
        gameState.market[i] = gameState.bag.shift();
      }
    }
    if (gameState.statsCollector) {
      gameState.statsCollector.recordMarketFill();
    }
  }

  // Handle board overflow end game
  if (gameState.endGameReason === 'boardOverflow') {
    gameState.remainingTurnsInEndGame--;
    if (gameState.remainingTurnsInEndGame === 0) {
      gameState.gameOver = true;
      calculateFinalScores(gameState);
    } else {
      gameState.stats.turnsPlayed++;
      gameState.currentPlayerIndex = (gameState.currentPlayerIndex + 1) % gameState.players.length;
      gameState.gamePhase = 'sweep';
    }
  } else if (isGameOver(gameState)) {
    gameState.gameOver = true;
    gameState.endGameReason = 'cardMarket';
    calculateFinalScores(gameState);
  } else if (gameState.market.every(t => t === null) && gameState.bag.length === 0) {
    // Market tiles exhausted
    gameState.gameOver = true;
    gameState.endGameReason = 'marketTiles';
    calculateFinalScores(gameState);
  } else {
    gameState.stats.turnsPlayed++;
    gameState.currentPlayerIndex = (gameState.currentPlayerIndex + 1) % gameState.players.length;
    gameState.gamePhase = 'sweep';
  }

  return gameState;
}

export function getValidSweeps(gameState) {
  const sweeps = [];

  for (let rowOrCol = 0; rowOrCol < gameState.marketSize; rowOrCol++) {
    for (const isRow of [true, false]) {
      const tiles = isRow ? getRowTiles(gameState.market, rowOrCol, gameState.marketSize) : getColumnTiles(gameState.market, rowOrCol, gameState.marketSize);
      const colours = new Set();
      const ingredients = new Set();

      for (const tile of tiles) {
        if (tile) {
          colours.add(tile.colour);
          ingredients.add(tile.ingredient);
        }
      }

      for (const colour of colours) {
        sweeps.push({ rowOrCol, isRow, declaration: colour, declarationType: 'colour' });
      }
      for (const ingredient of ingredients) {
        sweeps.push({ rowOrCol, isRow, declaration: ingredient, declarationType: 'symbol' });
      }
    }
  }

  return sweeps;
}

// Pattern matching for 3×2 grid patterns (also handles 2×3 via rotation)
// Pattern grid representation:
// 3×2: [0, 1, 2,  (top row)
//       3, 4, 5]  (bottom row)
// 2×3: [0, 1,
//       2, 3,
//       4, 5]

function isSingleTilePattern(pattern) {
  let count = 0;
  for (let i = 0; i < 6; i++) {
    if (pattern[i]) count++;
  }
  return count === 1;
}

// Rotate a 3×2 pattern 90° clockwise to become 2×3
function rotateTo2x3(pattern) {
  // 3×2: [0, 1, 2,  2×3: [3, 0,
  //       3, 4, 5]         4, 1,
  //                         5, 2]
  return [pattern[3], pattern[0], pattern[4], pattern[1], pattern[5], pattern[2]];
}

// Flip a 3×2 pattern horizontally
function flipHorizontal3x2(pattern) {
  return [pattern[2], pattern[1], pattern[0], pattern[5], pattern[4], pattern[3]];
}

// Flip a 2×3 pattern horizontally
function flipHorizontal2x3(pattern) {
  return [pattern[1], pattern[0], pattern[3], pattern[2], pattern[5], pattern[4]];
}

// Flip a 3×2 pattern vertically
function flipVertical3x2(pattern) {
  return [pattern[3], pattern[4], pattern[5], pattern[0], pattern[1], pattern[2]];
}

// Flip a 2×3 pattern vertically
function flipVertical2x3(pattern) {
  return [pattern[4], pattern[5], pattern[2], pattern[3], pattern[0], pattern[1]];
}

export function getPatternMatches(board, cardPattern) {
  const matches = [];

  if (isSingleTilePattern(cardPattern)) {
    // Single tile pattern - find any matching colour
    const colour = cardPattern.find(c => c);
    for (let i = 0; i < board.length; i++) {
      if (board[i] && board[i].colour === colour) {
        matches.push({ row: Math.floor(i / BOARD_SIZE), col: i % BOARD_SIZE, rotation: 0, isFlipped: false, cells: [i] });
      }
    }
    return matches;
  }

  // Try 3×2 orientation (3 wide, 2 tall)
  for (let row = 0; row < BOARD_SIZE - 1; row++) {
    for (let col = 0; col < BOARD_SIZE - 3; col++) {
      // Original 3×2 pattern
      tryPatternMatch(board, cardPattern, row, col, 3, 2, false, matches);
      // Horizontal flip of 3×2
      tryPatternMatch(board, flipHorizontal3x2(cardPattern), row, col, 3, 2, true, matches);
      // Vertical flip of 3×2
      tryPatternMatch(board, flipVertical3x2(cardPattern), row, col, 3, 2, true, matches);
    }
  }

  // Try 2×3 orientation (2 wide, 3 tall) via rotation
  const rotated = rotateTo2x3(cardPattern);
  for (let row = 0; row < BOARD_SIZE - 2; row++) {
    for (let col = 0; col < BOARD_SIZE - 1; col++) {
      // Original rotated pattern
      tryPatternMatch(board, rotated, row, col, 2, 3, false, matches);
      // Horizontal flip of 2×3
      tryPatternMatch(board, flipHorizontal2x3(rotated), row, col, 2, 3, true, matches);
      // Vertical flip of 2×3
      tryPatternMatch(board, flipVertical2x3(rotated), row, col, 2, 3, true, matches);
    }
  }

  return matches;
}

function tryPatternMatch(board, pattern, row, col, width, height, isFlipped, matches) {
  const boardIndices = [];
  const boardCells = [];

  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      const boardIndex = (row + r) * BOARD_SIZE + (col + c);
      boardIndices.push(boardIndex);
      boardCells.push(board[boardIndex]);
    }
  }

  if (patternMatches(boardCells, pattern)) {
    // Collect non-null pattern cells
    const cells = [];
    for (let i = 0; i < boardIndices.length; i++) {
      if (pattern[i]) {
        cells.push(boardIndices[i]);
      }
    }
    matches.push({ row, col, rotation: 0, isFlipped, cells });
  }
}

function patternMatches(boardCells, pattern) {
  for (let i = 0; i < boardCells.length; i++) {
    if (pattern[i]) {
      const cell = boardCells[i];
      if (!cell || isBlockedSpace(cell) || cell.colour !== pattern[i]) return false;
    }
  }
  return true;
}

function getAllPatternCells(pattern, row, col, rotation, isFlipped = false) {
  // For now, assuming we've already applied rotations/flips during pattern matching
  // This is a simplified version - in practice, we'd reconstruct from the match info
  const cells = [];

  // Try both 3×2 and 2×3 layouts
  for (let width = 3; width >= 2; width--) {
    const height = width === 3 ? 2 : 3;
    const maxCol = BOARD_SIZE - width;
    const maxRow = BOARD_SIZE - height;

    if (col <= maxCol && row <= maxRow) {
      for (let r = 0; r < height; r++) {
        for (let c = 0; c < width; c++) {
          if (pattern[r * width + c]) {
            cells.push((row + r) * BOARD_SIZE + (col + c));
          }
        }
      }
      if (cells.length > 0) return cells;
    }
  }

  return cells;
}

export function getValidPlacements(board) {
  const valid = [];
  for (let i = 0; i < board.length; i++) {
    if (board[i] === null) {
      valid.push(i);
    }
  }
  return valid;
}

function isBlockedSpace(cell) {
  return cell && typeof cell === 'object' && cell.type === 'blocked';
}

export function getTotalCardsClaimed(gameState) {
  return gameState.players.reduce((sum, p) => sum + p.claimedCards.length, 0);
}

export function isGameOver(gameState) {
  const totalCardsClaimed = getTotalCardsClaimed(gameState);
  return totalCardsClaimed >= gameState.cardsNeededToEnd;
}

export function calculateFinalScores(gameState) {
  for (const player of gameState.players) {
    let score = 0;

    for (const ingredient of INGREDIENTS) {
      let cardSymbols = 0;
      for (const cardId of player.claimedCards) {
        const card = REWARD_CARDS.find(c => c.id === cardId);
        if (card && card.ingredient === ingredient) {
          cardSymbols += card.symbolCount;
        }
      }

      const pileCount = player.scoringPile.filter(t => t.ingredient === ingredient).length;
      score += cardSymbols * pileCount;
    }

    score += player.cupcakes;
    player.score = score;
  }
}

export { BOARD_SIZE, COLOURS, INGREDIENTS, REWARD_CARDS };
