import { BOARD_SIZE, CARD_MARKET_SIZE, CARDS_TO_END_2P, REWARD_CARDS, COLOURS, INGREDIENTS, createTileBag } from './tiles.js';

// Cake-stand row scoring: each row has its OWN cumulative value table, indexed to
// match the stand array (0 = bottom/4 plates, 3 = top/1 plate). A row holding N
// tiles scores STAND_ROW_VALUES[rowIndex][N-1] (0 when empty). Per-tile values
// escalate within the bottom row (2/4/8/12) but row entry falls with row length
// (bottom 2, top 5): short rows are safe, the bottom row is a deep gamble. Max
// stand score is 52 (26 + 12 + 9 + 5).
export const STAND_ROW_VALUES = [[2, 6, 14, 26], [3, 7, 12], [4, 9], [5]];

// Cupcake symbols printed on the tile-market board. FOUR cells carry a printed
// cupcake symbol; a symbol is "visible" when its cell is currently empty (no
// tile sitting on it). At the cupcake-pot step of a fresh pot of tea, the tea
// player gains 1 cupcake per visible (empty) symbol cell (see finishTeaRound).
// There is NO cupcake cap any more — every gain always pays.
//
// Keyed by marketSize: 6 for 3-4 players (6×6 board), 5 for 2 players (5×5
// board). Values are flat market-array indices (index = row*marketSize + col)
// forming a symmetric group of 4 within the board. The per-player-count sets are
// DELIBERATE: the 2-player 5×5 layout is a smaller inner area, so it carries its
// own symbol positions rather than reusing the 6×6 ones. POSITIONS ARE NOT FINAL
// — these are placeholders pending the printed board art; they are config, not
// hardcoded logic, precisely so the art team can move them without touching code.
export const CUPCAKE_SYMBOL_CELLS = {
  6: [7, 10, 25, 28], // 6×6: rows 1 & 4, cols 1 & 4 — symmetric 4
  5: [6, 8, 16, 18],  // 5×5: rows 1 & 3, cols 1 & 3 — symmetric 4 within the inner area
};

// Count the cupcake symbols currently VISIBLE (i.e. whose market cell is empty)
// for this game's market size. Shared by the engine (the tea pot), the bots (tea
// timing), and the UI (rendering + pot preview) so all three read visibility the
// same way: purely from cell emptiness, with no separate symbol state.
export function getVisibleCupcakeSymbols(gameState) {
  const cells = CUPCAKE_SYMBOL_CELLS[gameState.marketSize] || [];
  let visible = 0;
  for (const idx of cells) {
    if (gameState.market[idx] === null || gameState.market[idx] === undefined) visible++;
  }
  return visible;
}

// Cupcake plates: the (rowIndex, plateIndex) stand positions that grant a
// cupcake the moment a tile is plated onto them. Indices are 0-based into the
// stand array (rowIndex 0 = bottom/4-plate row … rowIndex 3 = top/1-plate row;
// plateIndex counts plates left→right from the row's locking plate). These are
// the SECOND plate of every multi-plate row plus the top row's single plate —
// bottom[1], second[1], third[1], top[0] — the four plates the board art marks
// with a cupcake icon (images/cake_stand.png). Plating onto one grants 1 cupcake
// from the supply — always (there is no cupcake cap; see plateTileOntoRow). The
// opening-plate variant was rejected in playtesting, so no row's first plate
// (plateIndex 0, except the top) appears.
export const CUPCAKE_PLATES = [
  { rowIndex: 0, plateIndex: 1 },
  { rowIndex: 1, plateIndex: 1 },
  { rowIndex: 2, plateIndex: 1 },
  { rowIndex: 3, plateIndex: 0 },
];

function isCupcakePlate(rowIndex, plateIndex) {
  return CUPCAKE_PLATES.some(p => p.rowIndex === rowIndex && p.plateIndex === plateIndex);
}

// Plate a tile onto a stand row. This is the SINGLE code path that adds a tile
// to a stand row's `tiles` array (claim's 'row' destination is its only caller),
// so the cupcake-plate trigger lives here in one place. The plate the tile lands
// on is the row's length BEFORE the push. On the first tile the row locks to the
// tile's ingredient. If the landing plate is a cupcake plate, the player gains 1
// cupcake from the supply — always; there is no cap, so the gain never forfeits.
function plateTileOntoRow(gameState, player, rowIndex, tile) {
  const row = player.stand[rowIndex];
  const plateIndex = row.tiles.length;
  if (row.ingredient === null) row.ingredient = tile.ingredient; // permanent lock
  row.tiles.push(tile);

  // Metric: record which row each player opened their stand on (first plating).
  if (gameState.statsCollector) gameState.statsCollector.recordPlating(player.id, rowIndex);

  if (!isCupcakePlate(rowIndex, plateIndex)) return;
  player.cupcakes++;
  if (gameState.statsCollector) gameState.statsCollector.recordCupcakePlateGain(player.id);
}

function getMarketSize(playerCount) {
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
    cupcakes: 2,
    // Fresh Pot of Tea is once per game per player. teaCardUsed flips true when
    // that player's tea round completes (finishTeaRound), and orderTea refuses a
    // second use. A never-used tea card scores 0 (it grants no VP itself).
    teaCardUsed: false,
    // Personal reserve for the tea round: a single face-up card object (or null).
    // Filled by teaReserve, emptied by claim (completing it) or left to score 0.
    reservedCard: null,
    score: 0,
  }));

  // Metric: every player starts with 2 cupcakes — log it as their opening influx
  // so the per-source cupcake accounting (start / pot / plates) is complete.
  if (statsCollector) {
    for (const player of players) {
      statsCollector.recordCupcakeGain(player.id, 'start', player.cupcakes);
    }
  }

  const market = [];
  for (let i = 0; i < marketSize * marketSize; i++) {
    market.push(bag.shift());
  }

  if (statsCollector) {
    statsCollector.recordMarketFill();
  }

  const { gameDeck, cardMarket } = initGameDeck();
  // cardsNeededToEnd = 8 tarts × player count. This encodes the tabletop end
  // condition "the game ends when the last (8th) tart is placed" per player, and
  // is the primary live playtime-tuning lever (raise/lower to lengthen/shorten
  // a game). CARDS_TO_END_2P is the 2-player value (16); 3p/4p scale it up.
  let cardsNeededToEnd = CARDS_TO_END_2P;
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
    // Claimed/flushed cards accumulate here and are reshuffled back into an
    // empty gameDeck by drawCard. The tea round's flush (finishTeaRound) and a
    // refilled-slot claim both feed it, so it fills steadily once tea rounds start.
    cardDiscard: [],
    currentPlayerIndex: 0,
    gamePhase: 'sweep',
    pendingSweepTiles: [],
    bonusTileAvailable: false,
    // Tea-round bookkeeping. teaReserverIndex is whose reserve decision is
    // pending during the 'teaReserve' phase (NOT necessarily the current
    // player); teaReservesRemaining counts down from playerCount. Both are
    // dormant (null / 0) outside a tea round.
    teaReserverIndex: null,
    teaReservesRemaining: 0,
    gameOver: false,
    // endGameReason: 'cardMarket' | 'marketTiles' are the documented tabletop
    // end conditions. 'boardOverflow' is an implementation safety valve (a full
    // board that cannot accept swept tiles) — not a documented tabletop rule.
    endGameReason: null,
    remainingTurnsInEndGame: 0, // final-turn countdown for the boardOverflow safety valve
    // Deadlock safety valve for the backstop rule: when the tile market AND bag
    // are both empty no sweep is possible, so a run of turns can pass with nobody
    // able to claim. This counts turns since the last card was claimed (reset in
    // claim); once it reaches playerCount while market+bag are dry, the game ends
    // (see the backstop in advanceToNextTurn).
    turnsSinceLastClaim: 0,
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

// Deal the reward deck for a new game: shuffle all 50 cards, seed the face-up
// card market, and put EVERY remaining card (50 − CARD_MARKET_SIZE = 46) into
// the draw deck. The whole deck must be reachable so the card-count end
// condition (cardsNeededToEnd up to 32 at 4p) can actually fire — an earlier
// version capped the deck at 16, which made 3p/4p games unable to end that way.
export function initGameDeck() {
  const shuffledCards = [...REWARD_CARDS];
  // Fisher-Yates (matches createTileBag in tiles.js), replacing the weaker
  // sort(() => Math.random() - 0.5) shuffle used previously.
  for (let i = shuffledCards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffledCards[i], shuffledCards[j]] = [shuffledCards[j], shuffledCards[i]];
  }

  const cardMarket = shuffledCards.splice(0, CARD_MARKET_SIZE);
  const gameDeck = shuffledCards; // all remaining cards form the draw deck

  return { gameDeck, cardMarket };
}

// Draw the next reward card from the deck. When the deck is empty but cards have
// been discarded, the discard pile is Fisher-Yates shuffled into a fresh deck
// and emptied (the tabletop "reshuffle when the deck runs out" rule). Returns
// the drawn card, or null when both deck and discard are exhausted so callers
// can simply skip the market refill. Tea flushes feed the discard, so at 4p
// (each tea burns 4+ cards) reshuffles are expected rather than a corner case.
export function drawCard(gameState) {
  if (gameState.gameDeck.length === 0 && gameState.cardDiscard.length > 0) {
    const reshuffled = gameState.cardDiscard;
    for (let i = reshuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [reshuffled[i], reshuffled[j]] = [reshuffled[j], reshuffled[i]];
    }
    gameState.gameDeck = reshuffled;
    gameState.cardDiscard = [];
    if (gameState.statsCollector) gameState.statsCollector.recordDeckReshuffle();
  }
  return gameState.gameDeck.shift() ?? null;
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

// Order a fresh pot of tea at the START of a turn, BEFORE the sweep. Unlike the
// old flow, tea no longer replaces the sweep: after the tea round resolves the
// player takes their FULL normal turn (sweep, place, move, claim). The procedure
// runs in this order (see finishTeaRound for steps b-e): (a) a reserve round —
// starting with the tea player and proceeding clockwise, each player may reserve
// one market card; (b) an unconditional flush + redeal of the card market;
// (c) the cupcake pot — the tea player gains 1 cupcake per visible symbol;
// (d) a full tile-market refill from the bag; (e) the tea card is spent.
//
// orderTea sets up only the reserve round (a); teaReserve advances it and
// finishTeaRound performs (b)-(e). Only legal at the very start of a turn (sweep
// phase, no pending bonus tile) and only once per game per player.
export function orderTea(gameState) {
  if (gameState.gamePhase !== 'sweep') throw new Error('Can only order tea at the start of a turn (sweep phase)');
  if (gameState.bonusTileAvailable) throw new Error('Cannot order tea while a bonus tile is pending');

  const player = gameState.players[gameState.currentPlayerIndex];
  if (player.teaCardUsed) throw new Error('Fresh Pot of Tea has already been used this game');

  // The tea player reserves FIRST (deliberate — see design doc); every player
  // gets exactly one reserve opportunity, so the countdown starts at playerCount.
  gameState.teaReserverIndex = gameState.currentPlayerIndex;
  gameState.teaReservesRemaining = gameState.playerCount;
  gameState.gamePhase = 'teaReserve';

  return gameState;
}

// True when the pending reserver (players[teaReserverIndex]) cannot legally take
// any card — either they already hold a reserved card, or the market is empty.
// Drivers/UI call this to auto-pass; the engine deliberately does NOT auto-pass
// itself, so every reserve step stays an explicit, individually-undoable call.
export function teaReserveMustPass(gameState) {
  if (gameState.gamePhase !== 'teaReserve') throw new Error('Not in tea reserve phase');
  const reserver = gameState.players[gameState.teaReserverIndex];
  if (reserver.reservedCard !== null) return true;
  return gameState.cardMarket.length === 0;
}

// Resolve one player's reserve decision during a tea round. Acts for
// players[teaReserverIndex] — NOT necessarily the current player. cardId === null
// is always a legal pass. A non-null cardId requires that this reserver's reserve
// is empty and the card is present in the market. Taking splices the card out of
// the market into the player's reserve; the market is NOT refilled per-take (the
// whole market is discarded and redealt once every player has decided). Advances
// clockwise to the next reserver; when all playerCount decisions are in, the tea
// round finishes (finishTeaRound) and the turn continues into the normal sweep
// phase — the tea player then takes their full turn.
export function teaReserve(gameState, cardId) {
  if (gameState.gamePhase !== 'teaReserve') throw new Error('Not in tea reserve phase');

  const reserver = gameState.players[gameState.teaReserverIndex];

  if (cardId !== null && cardId !== undefined) {
    if (reserver.reservedCard !== null) throw new Error('Reserve is already full');
    const marketIndex = gameState.cardMarket.findIndex(c => c.id === cardId);
    if (marketIndex === -1) throw new Error('Card not in market');

    const [card] = gameState.cardMarket.splice(marketIndex, 1);
    reserver.reservedCard = card;

    if (gameState.statsCollector) {
      // The card leaves the market here (back when reserved), so a later claim
      // from the reserve must NOT record another market exit for it.
      gameState.statsCollector.recordCardMarketExit(card.id, gameState.stats.turnsPlayed);
      gameState.statsCollector.recordTeaReserve(reserver.id, card.id);
    }
  }

  // Advance to the next reserver clockwise; finish the round when everyone has
  // had their single opportunity.
  gameState.teaReserverIndex = (gameState.teaReserverIndex + 1) % gameState.playerCount;
  gameState.teaReservesRemaining--;
  if (gameState.teaReservesRemaining === 0) {
    finishTeaRound(gameState);
  }

  return gameState;
}

// Resolve the tea round once every player has had their reserve decision. Runs
// steps (b)-(e) of the tea procedure IN ORDER (see orderTea):
//   (b) Unconditional flush + redeal: every surviving market card goes to the
//       discard and a fresh CARD_MARKET_SIZE cards are dealt (fewer only when
//       deck+discard are exhausted, mirroring the shrinking-market behaviour).
//   (c) Cupcake pot: the ACTIVE (tea) player — currentPlayerIndex, NOT each
//       reserver — gains 1 cupcake per visible cupcake symbol (an empty symbol
//       cell). Uncapped. This is read BEFORE the tile refill, since (d) covers
//       the symbols.
//   (d) Tile refill: fill EVERY empty market cell from the bag (partial fill if
//       the bag runs dry).
//   (e) Spend the tea card (teaCardUsed) and return to the SWEEP phase — the tea
//       player now takes their full normal turn.
function finishTeaRound(gameState) {
  // (b) Flush unreserved market cards, then redeal a fresh market.
  while (gameState.cardMarket.length > 0) {
    const discarded = gameState.cardMarket.shift();
    gameState.cardDiscard.push(discarded);
    if (gameState.statsCollector) {
      gameState.statsCollector.recordCardMarketExit(discarded.id, gameState.stats.turnsPlayed);
    }
  }

  while (gameState.cardMarket.length < CARD_MARKET_SIZE) {
    const newCard = drawCard(gameState);
    if (!newCard) break; // deck + discard exhausted — market simply stays short
    gameState.cardMarket.push(newCard);
    if (gameState.statsCollector) {
      gameState.statsCollector.recordCardMarketEntry(newCard.id, gameState.stats.turnsPlayed);
    }
  }

  const activePlayer = gameState.players[gameState.currentPlayerIndex];

  // (c) Cupcake pot — count visible symbols BEFORE refilling the tiles.
  const potSize = getVisibleCupcakeSymbols(gameState);
  if (potSize > 0) {
    activePlayer.cupcakes += potSize;
    if (gameState.statsCollector) {
      gameState.statsCollector.recordCupcakeGain(activePlayer.id, 'pot', potSize);
    }
  }

  // (d) Fill every empty tile-market cell from the bag (partial if the bag runs dry).
  let filledAny = false;
  for (let i = 0; i < gameState.market.length; i++) {
    if (gameState.market[i] === null && gameState.bag.length > 0) {
      gameState.market[i] = gameState.bag.shift();
      filledAny = true;
    }
  }
  if (filledAny && gameState.statsCollector) {
    gameState.statsCollector.recordMarketFill();
  }

  // Metric: log the tea firing (turn + pot collected) now that the pot is known.
  if (gameState.statsCollector) {
    gameState.statsCollector.recordTeaRound(gameState.stats.turnsPlayed, potSize);
  }

  // (e) Spend the tea card and hand the tea player their full normal turn.
  activePlayer.teaCardUsed = true;
  gameState.teaReserverIndex = null;
  gameState.gamePhase = 'sweep';

  // If the bag was dry, step (d) may have left the market completely empty — the
  // player cannot sweep, so apply the same empty-market handling as at a normal
  // turn start (skip to the move phase / deadlock valve). With any tiles refilled
  // this is a no-op, making the backstop moot on a tea turn as the design notes.
  applyBackstopRefresh(gameState);
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
  // Card lookup order: the shared market first, then this player's personal
  // reserve. A reserved card completes exactly like a market card except the
  // market is neither spliced nor refilled (see the fromReserve branches below),
  // since the card left the market when it was reserved.
  const cardIndex = gameState.cardMarket.findIndex(c => c.id === cardId);
  const fromReserve = cardIndex === -1 && player.reservedCard && player.reservedCard.id === cardId;
  if (cardIndex === -1 && !fromReserve) throw new Error('Card not in market');

  const card = fromReserve ? player.reservedCard : gameState.cardMarket[cardIndex];
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
    plateTileOntoRow(gameState, player, destination.rowIndex, removedTile);
  } else {
    player.crumbTray.push(removedTile);
  }
  player.board[removedBoardIndex] = { type: 'blocked' };
  player.claimedCards.push(cardId);
  // A claim breaks the empty-market deadlock watch (see the backstop).
  gameState.turnsSinceLastClaim = 0;

  if (gameState.statsCollector) {
    // fromReserve feeds the claims-from-reserve fraction metric.
    gameState.statsCollector.recordCardClaimed(cardId, gameState.stats.turnsPlayed, fromReserve);
    // A reserved card already recorded its market exit when it was reserved.
    if (!fromReserve) {
      gameState.statsCollector.recordCardMarketExit(cardId, gameState.stats.turnsPlayed);
    }
  }

  if (fromReserve) {
    // Completing a reserved card: clear the reserve and skip the market refill —
    // the card was never in the market to leave a slot behind.
    player.reservedCard = null;
  } else {
    gameState.cardMarket.splice(cardIndex, 1);

    // Refill the vacated market slot from the deck (drawCard reshuffles the
    // discard pile in when the deck empties, and returns null once both are gone —
    // in which case the market simply shrinks, as before).
    const newCard = drawCard(gameState);
    if (newCard) {
      gameState.cardMarket.push(newCard);
      if (gameState.statsCollector) {
        gameState.statsCollector.recordCardMarketEntry(newCard.id, gameState.stats.turnsPlayed);
      }
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

  // The tile market no longer refills automatically at end of turn. It is
  // refreshed ONLY by the tea step (finishTeaRound step d) and by the backstop
  // (advanceToNextTurn). This function now just resolves the end conditions and
  // rotates the turn.

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
  } else {
    // No unconditional "market+bag empty → game over" here any more: the
    // backstop in advanceToNextTurn refreshes an empty market from the bag, and
    // only its deadlock valve (market+bag dry, no claim for a full round of
    // turns) ends the game with endGameReason 'marketTiles'.
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
  // Count this turn toward the empty-market deadlock watch (reset by any claim).
  gameState.turnsSinceLastClaim++;

  const nextPlayer = gameState.players[gameState.currentPlayerIndex];
  if (getValidPlacements(nextPlayer.board).length === 0) {
    gameState.gameOver = true;
    gameState.endGameReason = gameState.endGameReason || 'boardFull';
    calculateFinalScores(gameState);
    return;
  }

  applyBackstopRefresh(gameState);
}

// BACKSTOP REFRESH. A sweep is legal whenever any tile sits on the market, so
// the only unplayable sweep is a COMPLETELY EMPTY tile market. Checked at the
// start of every new turn's sweep phase:
//   - Market empty, bag has tiles: refill every cell from the bag for FREE (no
//     cupcakes) and log the firing, then proceed with the normal sweep. Expected
//     frequency is near zero — a firing means player-driven refresh (tea) isn't
//     covering tile supply.
//   - Market AND bag empty: no refill is possible. The game does not end here on
//     its own (it will end on the tart/card clock or a full board). Since no
//     sweep can be made, skip the sweep+place steps straight to the move phase so
//     the player can still move a tile and claim. To avoid spinning forever when
//     nobody can claim again, the deadlock valve ends the game once a full round
//     of turns (playerCount) has passed with no claim.
function applyBackstopRefresh(gameState) {
  if (!gameState.market.every(t => t === null)) return; // tiles present — normal sweep

  if (gameState.bag.length > 0) {
    for (let i = 0; i < gameState.market.length; i++) {
      if (gameState.market[i] === null && gameState.bag.length > 0) {
        gameState.market[i] = gameState.bag.shift();
      }
    }
    if (gameState.statsCollector) {
      gameState.statsCollector.recordBackstopFiring(gameState.stats.turnsPlayed);
      gameState.statsCollector.recordMarketFill();
    }
    return;
  }

  // Market and bag both empty.
  if (gameState.turnsSinceLastClaim >= gameState.playerCount) {
    gameState.gameOver = true;
    gameState.endGameReason = gameState.endGameReason || 'marketTiles';
    calculateFinalScores(gameState);
    return;
  }
  // No tiles anywhere to sweep — jump to the move phase so the player can still
  // move/claim this turn.
  gameState.gamePhase = 'move';
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

    // Cake-stand rows: per-row cumulative value by tile count.
    for (let i = 0; i < player.stand.length; i++) {
      const row = player.stand[i];
      if (row.tiles.length > 0) {
        score += STAND_ROW_VALUES[i][row.tiles.length - 1];
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
