import { BOARD_SIZE, CARD_MARKET_SIZE, TOTAL_GAME_CARDS, REWARD_CARDS, COLOURS, INGREDIENTS, createTileBag } from './tiles.js';

// Cake-stand row scoring: cumulative value prefix shared by every row and
// truncated by that row's capacity. A row holding N tiles scores ROW_VALUES[N-1]
// (0 when empty). Bottom row (capacity 4) can reach the full 15; the top row
// (capacity 1) tops out at 3.
export const ROW_VALUES = [3, 6, 10, 15];

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
    stand: [
      { capacity: 4, ingredient: null, tiles: [] },  // bottom row
      { capacity: 3, ingredient: null, tiles: [] },
      { capacity: 2, ingredient: null, tiles: [] },
      { capacity: 1, ingredient: null, tiles: [] },  // top row
    ],
    crumbTray: [],
    claimedCards: [],
    cupcakes: 4,
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
  // cardsNeededToEnd = 8 tarts × player count. This encodes the tabletop end
  // condition "the game ends when the last (8th) tart is placed" per player, and
  // is the primary live playtime-tuning lever (raise/lower to lengthen/shorten
  // a game). TOTAL_GAME_CARDS is the 2-player value (16); 3p/4p scale it up.
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
    // endGameReason: 'cardMarket' | 'marketTiles' are the documented tabletop
    // end conditions. 'boardOverflow' is an implementation safety valve (a full
    // board that cannot accept swept tiles) — not a documented tabletop rule.
    endGameReason: null,
    remainingTurnsInEndGame: 0, // final-turn countdown for the boardOverflow safety valve
    cardsNeededToEnd,
    playerCount,
    marketSize,
    cupcakesUsedThisTurn: false,
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

  // A line-clearing sweep pauses in the sweep phase to resolve the bonus tile
  // (see takeBonusTile / declineBonusTile), each of which then transitions into
  // placement and runs the overflow check itself. A non-clearing sweep goes
  // straight to placement, so we check overflow here.
  if (!isLineClear) {
    gameState.gamePhase = 'place';
    checkBoardOverflowOnPlace(gameState);
  }

  return gameState;
}

// Board-overflow end condition. Runs at every transition INTO the place phase:
// if the current player cannot fit all their pending swept tiles on their board
// (empty cells < swept tiles), the game enters its final-turn countdown, the
// pending tiles are discarded, and the turn skips straight to refill. Returns
// true when the overflow end fired. Centralised so the check is identical
// whether placement is reached from a plain sweep, a taken bonus tile, a
// declined bonus tile, or a directly-constructed state calling place().
function checkBoardOverflowOnPlace(gameState) {
  const player = gameState.players[gameState.currentPlayerIndex];
  const emptyCount = getValidPlacements(player.board).length;
  if (gameState.pendingSweepTiles.length > emptyCount) {
    // Only seed the finale countdown once — a second over-sweep during the
    // finale must not extend it.
    if (gameState.endGameReason !== 'boardOverflow') {
      gameState.endGameReason = 'boardOverflow';
      // Grant each of the OTHER players exactly one more turn. refill() decrements
      // this once per turn (including the overflowing player's own turn-ending
      // refill) and ends the game when it reaches 0, so the seed is players.length:
      // the triggering refill rotates to the next player, then the remaining
      // players.length-1 turns are each played out before the game ends.
      gameState.remainingTurnsInEndGame = gameState.players.length;
    }
    gameState.pendingSweepTiles = [];
    gameState.gamePhase = 'refill'; // Skip directly to refill to move to next player
    return true;
  }
  return false;
}

export function takeBonusTile(gameState, marketIndex) {
  if (!gameState.bonusTileAvailable) throw new Error('Bonus tile not available');
  if (gameState.market[marketIndex] === null) throw new Error('No tile at selected position');

  gameState.pendingSweepTiles.push(gameState.market[marketIndex]);
  gameState.market[marketIndex] = null;
  gameState.bonusTileAvailable = false;
  gameState.gamePhase = 'place';
  checkBoardOverflowOnPlace(gameState);

  return gameState;
}

// Decline the offered bonus tile after a line-clearing sweep. Replaces the
// inlined "bonusTileAvailable = false; gamePhase = 'place'" that drivers used
// to run, so the overflow check fires on this transition too (a base sweep can
// already exceed the board's remaining space).
export function declineBonusTile(gameState) {
  if (!gameState.bonusTileAvailable) throw new Error('Bonus tile not available');
  gameState.bonusTileAvailable = false;
  gameState.gamePhase = 'place';
  checkBoardOverflowOnPlace(gameState);
  return gameState;
}

export function place(gameState, placements) {
  if (gameState.gamePhase !== 'place') throw new Error('Not in place phase');

  // Defence in depth: the transition helpers above normally fire overflow
  // before place() is ever reached, but a driver that constructs a place-phase
  // state directly could still arrive here with an over-full board.
  if (checkBoardOverflowOnPlace(gameState)) return gameState;

  if (placements.length !== gameState.pendingSweepTiles.length) {
    throw new Error('Must place all swept tiles');
  }

  const player = gameState.players[gameState.currentPlayerIndex];

  for (let i = 0; i < placements.length; i++) {
    const boardIndex = placements[i];
    const tile = gameState.pendingSweepTiles[i];

    if (boardIndex < 0 || boardIndex >= BOARD_SIZE * BOARD_SIZE) throw new Error('Invalid board position');
    const cell = player.board[boardIndex];
    if (cell !== null) throw new Error('Cell already occupied or blocked');

    player.board[boardIndex] = tile;
  }

  gameState.pendingSweepTiles = [];
  gameState.gamePhase = 'move';

  return gameState;
}

// Destinations a removed tile may go when a card is claimed. The crumb tray is
// ALWAYS a legal choice (a real strategic option, never a mere fallback).
//
// ONE-ROW-PER-INGREDIENT RULE: an ingredient may only ever appear on a single
// stand row. A row is a legal destination for this tile when it has spare
// capacity AND either
//   - it is already locked to this tile's ingredient (extend its own row), or
//   - it is unlocked (ingredient === null) AND no other row is already locked
//     to this ingredient (opening a fresh row is only legal the first time an
//     ingredient is plated).
// Consequence: once an ingredient's row is full, every future tile of that
// ingredient can only go to the crumb tray.
export function getLegalDestinations(player, tile) {
  const destinations = [{ type: 'crumb' }];
  const ingredientAlreadyPlated = player.stand.some(row => row.ingredient === tile.ingredient);
  for (let rowIndex = 0; rowIndex < player.stand.length; rowIndex++) {
    const row = player.stand[rowIndex];
    if (row.tiles.length >= row.capacity) continue;
    const extendsOwnRow = row.ingredient === tile.ingredient;
    const opensFreshRow = row.ingredient === null && !ingredientAlreadyPlated;
    if (extendsOwnRow || opensFreshRow) {
      destinations.push({ type: 'row', rowIndex });
    }
  }
  return destinations;
}

export function claim(gameState, cardId, removedBoardIndex, destination) {
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

  // Validate the destination before mutating any state. getLegalDestinations is
  // the single source of truth for the one-row-per-ingredient rule (see there),
  // so the requested destination must appear among its results.
  if (!destination || typeof destination !== 'object' || (destination.type !== 'row' && destination.type !== 'crumb')) {
    throw new Error('Invalid or missing destination');
  }
  if (destination.type === 'row') {
    const { rowIndex } = destination;
    if (!Number.isInteger(rowIndex) || rowIndex < 0 || rowIndex >= player.stand.length) {
      throw new Error('Invalid stand row index');
    }
  }
  const legal = getLegalDestinations(player, removedTile);
  const isLegal = legal.some(d =>
    d.type === destination.type && (d.type !== 'row' || d.rowIndex === destination.rowIndex)
  );
  if (!isLegal) {
    // Distinguish the common row-rejection reasons for a clearer message.
    if (destination.type === 'row') {
      const row = player.stand[destination.rowIndex];
      if (row.tiles.length >= row.capacity) throw new Error('Stand row is full');
      if (row.ingredient !== null && row.ingredient !== removedTile.ingredient) {
        throw new Error('Stand row is locked to a different ingredient');
      }
      throw new Error('Ingredient is already plated on another row');
    }
    throw new Error('Illegal claim destination');
  }

  if (destination.type === 'row') {
    const row = player.stand[destination.rowIndex];
    if (row.ingredient === null) row.ingredient = removedTile.ingredient; // permanent lock
    row.tiles.push(removedTile);
  } else {
    player.crumbTray.push(removedTile);
  }
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
  if (gameState.gamePhase !== 'move') {
    throw new Error('Can only move tiles in the move phase');
  }
  if (gameState.cupcakesUsedThisTurn) {
    throw new Error('Can only move one tile per turn');
  }
  const player = gameState.players[gameState.currentPlayerIndex];
  if (player.cupcakes <= 0) throw new Error('No cupcakes available');
  // A cupcake may relocate EITHER a tile OR a tart token (a blocked marker):
  // both are non-null cells. Only a genuinely empty (null) source is rejected.
  if (player.board[fromIndex] === null) throw new Error('No tile at source cell');
  if (player.board[toIndex] !== null) throw new Error('Target cell is occupied or blocked');
  player.board[toIndex] = player.board[fromIndex];
  player.board[fromIndex] = null;
  player.cupcakes--;
  gameState.cupcakesUsedThisTurn = true;
  return gameState;
}

export function skipMove(gameState) {
  if (gameState.gamePhase !== 'move') throw new Error('Not in move phase');
  gameState.gamePhase = 'claim';
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
    // If the market and bag are both exhausted, the remaining players have no
    // legal sweep — end now rather than rotating into an unplayable turn.
    if (gameState.remainingTurnsInEndGame === 0 || (gameState.market.every(t => t === null) && gameState.bag.length === 0)) {
      gameState.gameOver = true;
      calculateFinalScores(gameState);
    } else {
      advanceToNextTurn(gameState);
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
    advanceToNextTurn(gameState);
  }

  return gameState;
}

// Rotate to the next player's turn. BOARD-FULL END: if the incoming player's
// board is completely full (tiles + tart tokens) at the start of their turn,
// the game ends immediately — the turn order has come full circle, so every
// player has had an equal number of turns and scoring happens on the spot.
function advanceToNextTurn(gameState) {
  gameState.stats.turnsPlayed++;
  gameState.currentPlayerIndex = (gameState.currentPlayerIndex + 1) % gameState.players.length;
  gameState.cupcakesUsedThisTurn = false;
  gameState.gamePhase = 'sweep';

  const nextPlayer = gameState.players[gameState.currentPlayerIndex];
  if (getValidPlacements(nextPlayer.board).length === 0) {
    gameState.gameOver = true;
    gameState.endGameReason = gameState.endGameReason || 'boardFull';
    calculateFinalScores(gameState);
  }
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

// Convert a 6-cell card pattern (3 wide × 2 tall, indices 0-2 top row,
// 3-5 bottom row) to its tight bounding-box matrix: a 2D array of colour
// strings (or null for don't-care cells) trimmed to the smallest rectangle
// that contains every coloured cell. Returns { matrix, height, width }.
function patternToBoundingBox(cardPattern) {
  const PW = 3; // source grid width
  const PH = 2; // source grid height
  let minR = PH, maxR = -1, minC = PW, maxC = -1;
  for (let r = 0; r < PH; r++) {
    for (let c = 0; c < PW; c++) {
      if (cardPattern[r * PW + c]) {
        if (r < minR) minR = r;
        if (r > maxR) maxR = r;
        if (c < minC) minC = c;
        if (c > maxC) maxC = c;
      }
    }
  }
  const height = maxR - minR + 1;
  const width = maxC - minC + 1;
  const matrix = [];
  for (let r = 0; r < height; r++) {
    const rowArr = [];
    for (let c = 0; c < width; c++) {
      rowArr.push(cardPattern[(minR + r) * PW + (minC + c)] || null);
    }
    matrix.push(rowArr);
  }
  return { matrix, height, width };
}

// Rotate a matrix 90° clockwise.
function rotateMatrixCW(matrix) {
  const h = matrix.length;
  const w = matrix[0].length;
  const out = [];
  for (let c = 0; c < w; c++) {
    const rowArr = [];
    for (let r = h - 1; r >= 0; r--) {
      rowArr.push(matrix[r][c]);
    }
    out.push(rowArr);
  }
  return out;
}

// Mirror a matrix horizontally (reverse each row).
function mirrorMatrix(matrix) {
  return matrix.map(row => [...row].reverse());
}

function serialiseMatrix(matrix) {
  return matrix.map(row => row.map(c => c || '.').join(',')).join('|');
}

// Generate all 8 dihedral orientations (4 rotations × optional mirror) of the
// pattern's bounding-box matrix, deduplicating identical orientations that
// arise from symmetry. Each entry carries informational rotation/isFlipped
// metadata alongside the matrix.
function getPatternOrientations(cardPattern) {
  const base = patternToBoundingBox(cardPattern).matrix;
  const orientations = [];
  const seen = new Set();
  for (const flipped of [false, true]) {
    let m = flipped ? mirrorMatrix(base) : base;
    for (let rotation = 0; rotation < 4; rotation++) {
      const key = serialiseMatrix(m);
      if (!seen.has(key)) {
        seen.add(key);
        orientations.push({ matrix: m, rotation, isFlipped: flipped });
      }
      m = rotateMatrixCW(m);
    }
  }
  return orientations;
}

export function getPatternMatches(board, cardPattern) {
  const matches = [];
  const seenCells = new Set();
  const orientations = getPatternOrientations(cardPattern);

  for (const { matrix, rotation, isFlipped } of orientations) {
    const h = matrix.length;
    const w = matrix[0].length;
    for (let row = 0; row <= BOARD_SIZE - h; row++) {
      for (let col = 0; col <= BOARD_SIZE - w; col++) {
        const cells = [];
        let matched = true;
        for (let r = 0; r < h && matched; r++) {
          for (let c = 0; c < w; c++) {
            const colour = matrix[r][c];
            if (!colour) continue; // don't-care cell
            const boardIndex = (row + r) * BOARD_SIZE + (col + c);
            const cell = board[boardIndex];
            if (!cell || isBlockedSpace(cell) || cell.colour !== colour) {
              matched = false;
              break;
            }
            cells.push(boardIndex);
          }
        }
        if (!matched) continue;
        const dedupeKey = [...cells].sort((a, b) => a - b).join(',');
        if (seenCells.has(dedupeKey)) continue;
        seenCells.add(dedupeKey);
        matches.push({ row, col, rotation, isFlipped, cells });
      }
    }
  }

  return matches;
}

// Enumerate every viable "window" for a card pattern: a placement of one of
// its orientations on the board where no pattern cell sits on a wrong-coloured
// tile or a tart token. Each window reports the matched cells (correct tile
// already in place) and the missing cells (currently empty, with the colour
// each needs), so bots can measure partial progress toward a claim. Complete
// matches appear with missing.length === 0. Windows that make identical
// demands (pattern symmetry) are deduplicated.
export function getPatternWindows(board, cardPattern) {
  const windows = [];
  const seen = new Set();
  const orientations = getPatternOrientations(cardPattern);

  for (const { matrix } of orientations) {
    const h = matrix.length;
    const w = matrix[0].length;
    for (let row = 0; row <= BOARD_SIZE - h; row++) {
      for (let col = 0; col <= BOARD_SIZE - w; col++) {
        const cells = [];
        const missing = [];
        let viable = true;
        for (let r = 0; r < h && viable; r++) {
          for (let c = 0; c < w; c++) {
            const colour = matrix[r][c];
            if (!colour) continue; // don't-care cell
            const boardIndex = (row + r) * BOARD_SIZE + (col + c);
            const cell = board[boardIndex];
            if (cell === null) {
              missing.push({ index: boardIndex, colour });
            } else if (isBlockedSpace(cell) || cell.colour !== colour) {
              viable = false;
              break;
            } else {
              cells.push(boardIndex);
            }
          }
        }
        if (!viable) continue;
        const key = cells.slice().sort((a, b) => a - b).join(',') + '#' +
          missing.map(m => m.index + ':' + m.colour).sort().join(',');
        if (seen.has(key)) continue;
        seen.add(key);
        windows.push({ matched: cells.length, need: cells.length + missing.length, cells, missing });
      }
    }
  }

  return windows;
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

    // Cake-stand rows: cumulative value by tile count, truncated by capacity.
    for (const row of player.stand) {
      if (row.tiles.length > 0) {
        score += ROW_VALUES[row.tiles.length - 1];
      }
    }

    // Crumb tray: 1 VP per tile.
    score += player.crumbTray.length;

    // Claimed cards: flat card VP.
    for (const cardId of player.claimedCards) {
      const card = REWARD_CARDS.find(c => c.id === cardId);
      if (card) score += card.vp;
    }

    // Unspent cupcakes: 1 VP each.
    score += player.cupcakes;

    player.score = score;
  }
}

export { BOARD_SIZE, COLOURS, INGREDIENTS, REWARD_CARDS };
