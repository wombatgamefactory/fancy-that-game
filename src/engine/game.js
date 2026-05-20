import { BOARD_SIZE, MARKET_SIZE, CARD_MARKET_SIZE, TOTAL_GAME_CARDS, REWARD_CARDS, COLOURS, INGREDIENTS, createTileBag } from './tiles.js';

export function createGame(playerConfigs, statsCollector = null) {
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
    cupcakes: 0,
    score: 0,
  }));

  const market = [];
  for (let i = 0; i < MARKET_SIZE * MARKET_SIZE; i++) {
    market.push(bag.shift());
  }

  if (statsCollector) {
    statsCollector.recordMarketFill();
  }

  const { gameDeck, cardMarket } = initGameDeck(playerCount);
  const cardsNeededToEnd = TOTAL_GAME_CARDS;

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
    const patternCells = getAllPatternCells(card.pattern, match.row, match.col, match.rotation, match.isFlipped);
    patternCells.forEach(cell => allValidCells.add(cell));
  }

  if (!allValidCells.has(removedBoardIndex)) {
    throw new Error('Removed tile not in any valid matching pattern');
  }

  player.scoringPile.push(player.board[removedBoardIndex]);
  player.board[removedBoardIndex] = { type: 'blocked' };
  player.claimedCards.push(cardId);
  player.cupcakes++;

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

  if (tilesInMarket <= 6 && gameState.bag.length > 0) {
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

function reflectPatternHorizontal(pattern) {
  return [pattern[1], pattern[0], pattern[3], pattern[2]];
}

export function getPatternMatches(board, cardPattern) {
  const matches = [];

  const isSingleTile = cardPattern[0] && !cardPattern[1];

  if (isSingleTile) {
    const colour = cardPattern[0];
    for (let i = 0; i < board.length; i++) {
      if (board[i] && board[i].colour === colour) {
        matches.push({ row: Math.floor(i / BOARD_SIZE), col: i % BOARD_SIZE, rotation: 0, isFlipped: false, cells: [i] });
      }
    }
    return matches;
  }

  for (let row = 0; row < BOARD_SIZE - 1; row++) {
    for (let col = 0; col < BOARD_SIZE - 1; col++) {
      for (let rotation = 0; rotation < 4; rotation++) {
        for (let isFlipped = 0; isFlipped < 2; isFlipped++) {
          const rotated = rotatePattern(cardPattern, rotation);
          const pattern = isFlipped ? reflectPatternHorizontal(rotated) : rotated;

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

          if (patternMatches(boardCells, pattern)) {
            matches.push({ row, col, rotation, isFlipped: isFlipped === 1, cells: boardIndices });
          }
        }
      }
    }
  }

  return matches;
}

function patternMatches(boardCells, pattern) {
  for (let i = 0; i < 4; i++) {
    if (pattern[i]) {
      const cell = boardCells[i];
      if (!cell || isBlockedSpace(cell) || cell.colour !== pattern[i]) return false;
    }
  }
  return true;
}

function getAllPatternCells(pattern, row, col, rotation, isFlipped = false) {
  let p = rotatePattern(pattern, rotation);
  if (isFlipped) {
    p = reflectPatternHorizontal(p);
  }

  const cells = [];
  const boardIndices = [
    row * BOARD_SIZE + col,
    row * BOARD_SIZE + col + 1,
    (row + 1) * BOARD_SIZE + col,
    (row + 1) * BOARD_SIZE + col + 1,
  ];

  for (let i = 0; i < 4; i++) {
    if (p[i]) {
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
