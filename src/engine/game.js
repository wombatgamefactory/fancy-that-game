import { REWARD_CARDS, COLOURS, INGREDIENTS, createTileBag, initMarket, BOARD_SIZE, TRACK_MAX } from './tiles.js';

// Initialize a new game with player configurations
export function createGame(playerConfigs) {
  const bag = createTileBag();
  const market = initMarket(bag);

  const players = playerConfigs.map((config, index) => ({
    id: index,
    name: config.name || `Player ${index + 1}`,
    isHuman: config.isHuman || false,
    aiDifficulty: config.aiDifficulty || null,
    board: initBoard(),
    claimedCards: [], // array of card IDs
    ingredientTracks: {
      lemon: 1,
      chocolate: 1,
      caramel: 1,
      strawberry: 1,
      almond: 1,
    },
    score: 0,
  }));

  return {
    players,
    market: gridToArray(market), // Flatten 5x5 to array of 25
    bag,
    currentPlayerIndex: 0,
    gamePhase: 'sweep', // sweep -> place -> complete
    selectedTiles: [], // Tiles taken in current sweep
    selectedMarketIndex: null, // Index of market tile user clicked
    gameOver: false,
    stats: {
      turnsPlayed: 0,
      totalPlayed: 0,
    },
  };
}

// Initialize a 5x5 player board (null = empty)
function initBoard() {
  return Array(BOARD_SIZE * BOARD_SIZE).fill(null);
}

// Convert flat array to 2D grid coordinates [row, col]
function indexToCoords(index) {
  return [Math.floor(index / BOARD_SIZE), index % BOARD_SIZE];
}

// Convert 2D coords to flat array index
function coordsToIndex(row, col) {
  if (row < 0 || row >= BOARD_SIZE || col < 0 || col >= BOARD_SIZE) return -1;
  return row * BOARD_SIZE + col;
}

// Flatten market grid (array of 25 tiles)
function gridToArray(grid) {
  return grid;
}

// Get list of indices swept in the row from selectedMarketIndex
function calculateSweep(marketIndex) {
  const [row, col] = indexToCoords(marketIndex);
  const swept = [marketIndex];

  // Sweep entire row (left and right)
  for (let c = col - 1; c >= 0; c--) {
    swept.push(row * BOARD_SIZE + c);
  }
  for (let c = col + 1; c < BOARD_SIZE; c++) {
    swept.push(row * BOARD_SIZE + c);
  }

  return swept;
}

// Player selects a market tile (SWEEP phase)
export function sweep(gameState, marketIndex) {
  if (gameState.gamePhase !== 'sweep') throw new Error('Not in sweep phase');
  if (gameState.market[marketIndex] === null) throw new Error('Selected tile is empty');

  const swept = calculateSweep(marketIndex);
  gameState.selectedTiles = swept.map(idx => gameState.market[idx]).filter(t => t);
  gameState.selectedMarketIndex = marketIndex;
  gameState.gamePhase = 'place';

  return gameState;
}

// Check if placement is valid (all tiles must be adjacent to existing or edge)
function isValidPlacement(board, positions) {
  for (const pos of positions) {
    const [row, col] = indexToCoords(pos);

    // Edge is always valid placement
    if (row === 0 || row === BOARD_SIZE - 1 || col === 0 || col === BOARD_SIZE - 1) {
      continue;
    }

    // Must be adjacent to an occupied cell
    const adjacent = [
      coordsToIndex(row - 1, col),
      coordsToIndex(row + 1, col),
      coordsToIndex(row, col - 1),
      coordsToIndex(row, col + 1),
    ];

    if (!adjacent.some(idx => idx >= 0 && board[idx] !== null)) {
      return false;
    }
  }

  return true;
}

// Player places all selected tiles (PLACE phase)
export function place(gameState, placements) {
  if (gameState.gamePhase !== 'place') throw new Error('Not in place phase');

  const player = gameState.players[gameState.currentPlayerIndex];

  // If no placements provided (bot couldn't find valid positions), end game
  if (placements.length === 0 || placements.length < gameState.selectedTiles.length) {
    gameState.gameOver = true;
    calculateFinalScores(gameState);
    return gameState;
  }

  if (placements.length !== gameState.selectedTiles.length) {
    throw new Error('Must place all selected tiles');
  }

  // Check validity
  if (!isValidPlacement(player.board, placements)) {
    throw new Error('Invalid placement');
  }

  // Place tiles
  for (let i = 0; i < placements.length; i++) {
    const boardIndex = placements[i];
    const tile = gameState.selectedTiles[i];
    player.board[boardIndex] = tile;

    // Advance ingredient track on SWEEP (tile taken)
    if (player.ingredientTracks[tile.ingredient] < TRACK_MAX) {
      player.ingredientTracks[tile.ingredient]++;
    }
  }

  // Remove swept tiles from market
  const sweptIndices = calculateSweep(gameState.selectedMarketIndex);
  for (const idx of sweptIndices) {
    gameState.market[idx] = null;
  }

  // Auto-trigger CLAIM
  claimPhase(gameState);

  // Auto-trigger REFILL CHECK
  if (shouldRefill(gameState)) {
    refillMarket(gameState);
  }

  // Advance to next player
  gameState.stats.turnsPlayed++;
  gameState.currentPlayerIndex = (gameState.currentPlayerIndex + 1) % gameState.players.length;
  gameState.gamePhase = 'sweep';
  gameState.selectedTiles = [];
  gameState.selectedMarketIndex = null;

  // Check win condition
  if (isGameOver(gameState)) {
    gameState.gameOver = true;
    calculateFinalScores(gameState);
  }

  return gameState;
}

// CLAIM phase: find and claim completed patterns
function claimPhase(gameState) {
  for (const player of gameState.players) {
    const newCards = findClaimableCards(player.board, player.claimedCards);
    for (const card of newCards) {
      player.claimedCards.push(card.id);
    }
  }
}

// Find cards that match patterns on the board (not yet claimed)
function findClaimableCards(board, claimedCardIds) {
  const claimedSet = new Set(claimedCardIds);
  const claimed = [];

  for (const card of REWARD_CARDS) {
    if (claimedSet.has(card.id)) continue;

    // Check all 2x2 regions on board
    for (let row = 0; row < BOARD_SIZE - 1; row++) {
      for (let col = 0; col < BOARD_SIZE - 1; col++) {
        const cells = [
          board[coordsToIndex(row, col)],
          board[coordsToIndex(row, col + 1)],
          board[coordsToIndex(row + 1, col)],
          board[coordsToIndex(row + 1, col + 1)],
        ];

        if (matchesPattern(cells, card.pattern)) {
          claimed.push(card);
          break; // Each card claimed once
        }
      }
    }
  }

  return claimed;
}

// Check if 2x2 pattern matches card pattern
function matchesPattern(cells, cardPattern) {
  // Card pattern fills positions left-to-right, top-to-bottom
  // Remaining positions can be empty or any colour
  for (let i = 0; i < cardPattern.length; i++) {
    const cell = cells[i];
    // This position must have the required colour
    if (!cell || cell.colour !== cardPattern[i]) return false;
  }
  return true;
}

// Check if market needs refill (3+ empty rows/columns)
function shouldRefill(gameState) {
  let emptyCount = 0;

  // Count empty rows
  for (let row = 0; row < BOARD_SIZE; row++) {
    const rowTiles = [];
    for (let col = 0; col < BOARD_SIZE; col++) {
      rowTiles.push(gameState.market[row * BOARD_SIZE + col]);
    }
    if (rowTiles.every(t => t === null)) emptyCount++;
  }

  // Count empty columns
  for (let col = 0; col < BOARD_SIZE; col++) {
    const colTiles = [];
    for (let row = 0; row < BOARD_SIZE; row++) {
      colTiles.push(gameState.market[row * BOARD_SIZE + col]);
    }
    if (colTiles.every(t => t === null)) emptyCount++;
  }

  return emptyCount >= 3;
}

// Refill market from bag
function refillMarket(gameState) {
  for (let i = 0; i < gameState.market.length; i++) {
    if (gameState.market[i] === null && gameState.bag.length > 0) {
      gameState.market[i] = gameState.bag.shift();
    }
  }
}

// Check if game is over (bag empty and someone sweeps to leave <5 tiles in market)
function isGameOver(gameState) {
  if (gameState.bag.length > 0) return false;

  const tilesInMarket = gameState.market.filter(t => t !== null).length;
  return tilesInMarket < 5; // Arbitrary threshold; adjust as needed
}

// Calculate final scores
function calculateFinalScores(gameState) {
  for (const player of gameState.players) {
    let score = 0;

    for (const cardId of player.claimedCards) {
      const card = REWARD_CARDS.find(c => c.id === cardId);
      const trackLevel = player.ingredientTracks[card.ingredient];
      score += trackLevel;
    }

    player.score = score;
  }
}

// Helper: get all valid board positions for placement
export function getValidPlacements(board, tileCount) {
  const validPositions = [];

  for (let i = 0; i < board.length; i++) {
    if (board[i] !== null) continue; // Cell occupied

    const [row, col] = indexToCoords(i);

    // Edge placement always valid
    if (row === 0 || row === BOARD_SIZE - 1 || col === 0 || col === BOARD_SIZE - 1) {
      validPositions.push(i);
      continue;
    }

    // Check adjacency
    const adjacent = [
      coordsToIndex(row - 1, col),
      coordsToIndex(row + 1, col),
      coordsToIndex(row, col - 1),
      coordsToIndex(row, col + 1),
    ];

    if (adjacent.some(idx => idx >= 0 && board[idx] !== null)) {
      validPositions.push(i);
    }
  }

  return validPositions;
}

// Export game state (for UI/bots)
export function getGameState(gameState) {
  return { ...gameState };
}

// Re-export constants
export { BOARD_SIZE, COLOURS, INGREDIENTS, REWARD_CARDS };
