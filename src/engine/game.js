import { BOARD_SIZE, MARKET_SIZE, CARD_MARKET_SIZE, CARDS_PER_PLAYER, REWARD_CARDS, COLOURS, INGREDIENTS, createTileBag } from './tiles.js';

export function createGame(playerConfigs) {
  const bag = createTileBag();
  const playerCount = playerConfigs.length;

  const players = playerConfigs.map((config, index) => ({
    id: index,
    name: config.name || `Player ${index + 1}`,
    isHuman: config.isHuman || false,
    aiDifficulty: config.aiDifficulty || null,
    board: Array(BOARD_SIZE * BOARD_SIZE).fill(null),
    scoringPile: [],
    claimedCards: [],
    score: 0,
  }));

  const market = [];
  for (let i = 0; i < MARKET_SIZE * MARKET_SIZE; i++) {
    market.push(bag.shift());
  }

  const { gameDeck, cardMarket } = initGameDeck(playerCount);

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
    stats: {
      turnsPlayed: 0,
    },
  };
}

export function initGameDeck(playerCount) {
  const cardsNeeded = CARDS_PER_PLAYER * playerCount;
  const shuffledCards = [...REWARD_CARDS].sort(() => Math.random() - 0.5);

  const cardMarket = shuffledCards.splice(0, CARD_MARKET_SIZE);
  const gameDeck = shuffledCards.splice(0, cardsNeeded);

  return { gameDeck, cardMarket };
}

function getRowTiles(market, rowIndex) {
  const tiles = [];
  for (let col = 0; col < MARKET_SIZE; col++) {
    tiles.push(market[rowIndex * MARKET_SIZE + col]);
  }
  return tiles;
}

function getColumnTiles(market, colIndex) {
  const tiles = [];
  for (let row = 0; row < MARKET_SIZE; row++) {
    tiles.push(market[row * MARKET_SIZE + colIndex]);
  }
  return tiles;
}

function getTileIndex(rowOrCol, isRow) {
  if (isRow) {
    return (rowOrCol) * MARKET_SIZE;
  } else {
    return rowOrCol;
  }
}

export function sweep(gameState, rowOrCol, isRow, declaration, declarationType) {
  if (gameState.gamePhase !== 'sweep') throw new Error('Not in sweep phase');

  const tiles = isRow ? getRowTiles(gameState.market, rowOrCol) : getColumnTiles(gameState.market, rowOrCol);

  const sweptTiles = [];
  const sweptIndices = [];

  for (let i = 0; i < tiles.length; i++) {
    const tile = tiles[i];
    if (!tile) continue;

    const matches = declarationType === 'colour' ? tile.colour === declaration : tile.ingredient === declaration;
    if (matches) {
      sweptTiles.push(tile);
      sweptIndices.push(getTileIndex(rowOrCol, isRow) + (isRow ? i : i * MARKET_SIZE));
    }
  }

  if (sweptTiles.length === 0) throw new Error('No tiles match declaration');

  gameState.pendingSweepTiles = sweptTiles;

  for (const idx of sweptIndices) {
    gameState.market[idx] = null;
  }

  const isLineClear = isRow
    ? getRowTiles(gameState.market, rowOrCol).every(t => t === null)
    : getColumnTiles(gameState.market, rowOrCol).every(t => t === null);

  gameState.bonusTileAvailable = isLineClear;

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

  for (let i = 0; i < placements.length; i++) {
    const boardIndex = placements[i];
    const tile = gameState.pendingSweepTiles[i];

    if (boardIndex < 0 || boardIndex >= BOARD_SIZE * BOARD_SIZE) throw new Error('Invalid board position');
    if (player.board[boardIndex] !== null) throw new Error('Cell already occupied');

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

  const match = matches[0];
  const patternCells = getAllPatternCells(card.pattern, match.row, match.col, match.rotation);

  if (!patternCells.includes(removedBoardIndex)) {
    throw new Error('Removed tile not in matching pattern');
  }

  player.scoringPile.push(player.board[removedBoardIndex]);
  player.board[removedBoardIndex] = { type: 'placeholder' };
  player.claimedCards.push(cardId);

  gameState.cardMarket.splice(cardIndex, 1);

  if (gameState.gameDeck.length > 0) {
    gameState.cardMarket.push(gameState.gameDeck.shift());
  }

  gameState.gamePhase = 'refill';
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

  if (tilesInMarket <= 6 && gameState.bag.length > 0) {
    for (let i = 0; i < gameState.market.length; i++) {
      if (gameState.market[i] === null && gameState.bag.length > 0) {
        gameState.market[i] = gameState.bag.shift();
      }
    }
  }

  if (isGameOver(gameState)) {
    gameState.gameOver = true;
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

  for (let rowOrCol = 0; rowOrCol < MARKET_SIZE; rowOrCol++) {
    for (const isRow of [true, false]) {
      const tiles = isRow ? getRowTiles(gameState.market, rowOrCol) : getColumnTiles(gameState.market, rowOrCol);
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

function rotatePattern(pattern, turns) {
  let p = [...pattern];
  for (let i = 0; i < turns % 4; i++) {
    p = [p[2], p[0], p[3], p[1]];
  }
  return p;
}

export function getPatternMatches(board, cardPattern) {
  const matches = [];

  const isSingleTile = cardPattern[0] && !cardPattern[1];

  if (isSingleTile) {
    const colour = cardPattern[0];
    for (let i = 0; i < board.length; i++) {
      if (board[i] && board[i].type !== 'placeholder' && board[i].colour === colour) {
        matches.push({ row: Math.floor(i / BOARD_SIZE), col: i % BOARD_SIZE, rotation: 0, cells: [i] });
      }
    }
    return matches;
  }

  for (let row = 0; row < BOARD_SIZE - 1; row++) {
    for (let col = 0; col < BOARD_SIZE - 1; col++) {
      for (let rotation = 0; rotation < 4; rotation++) {
        const rotated = rotatePattern(cardPattern, rotation);
        const boardCells = [
          board[row * BOARD_SIZE + col],
          board[row * BOARD_SIZE + col + 1],
          board[(row + 1) * BOARD_SIZE + col],
          board[(row + 1) * BOARD_SIZE + col + 1],
        ];

        const boardIndices = [
          row * BOARD_SIZE + col,
          row * BOARD_SIZE + col + 1,
          (row + 1) * BOARD_SIZE + col,
          (row + 1) * BOARD_SIZE + col + 1,
        ];

        if (patternMatches(boardCells, rotated)) {
          matches.push({ row, col, rotation, cells: boardIndices });
        }
      }
    }
  }

  return matches;
}

function patternMatches(boardCells, pattern) {
  for (let i = 0; i < 4; i++) {
    if (pattern[i]) {
      if (!boardCells[i] || boardCells[i].type === 'placeholder' || boardCells[i].colour !== pattern[i]) return false;
    }
  }
  return true;
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

export function getValidPlacements(board) {
  const valid = [];
  for (let i = 0; i < board.length; i++) {
    if (board[i] === null) {
      valid.push(i);
    }
  }
  return valid;
}

export function isGameOver(gameState) {
  return gameState.cardMarket.length === 0 && gameState.gameDeck.length === 0;
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

    player.score = score;
  }
}

export { BOARD_SIZE, COLOURS, INGREDIENTS, REWARD_CARDS };
