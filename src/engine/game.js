import { BOARD_SIZE, INITIAL_MARKET_CARDS, MAX_MARKET_CARDS, CARDS_TO_END_2P, REWARD_CARDS, COLOURS, INGREDIENTS, createTileBag } from './tiles.js';

// Side length of the TILE MARKET board: 5×5 = 25 cells at EVERY player count.
// (28 July: the market was 6×6 for 3-4 players and 5×5 for 2; the per-player-count
// sizing and the 2-player inner-area restrictions are gone.) Sweep geometry
// therefore is always 10 lines - 5 rows plus 5 columns - of 5 cells each.
// NOTE: this is NOT tiles.js's BOARD_SIZE, which is the player's personal board.
// Both happen to be 5; they are unrelated dimensions.
export const MARKET_SIZE = 5;

// Cake-stand row scoring: each row has its OWN cumulative value table, indexed to
// match the stand array (0 = bottom/4 plates, 3 = top/1 plate). A row holding N
// tiles scores STAND_ROW_VALUES[rowIndex][N-1] (0 when empty). Per-tile values
// escalate within the bottom row (1/3/8/10) but row entry falls with row length
// (bottom 1, top 5): short rows are safe, the bottom row is a deep gamble. Max
// stand score is 50 (22 + 14 + 9 + 5).
export const STAND_ROW_VALUES = [[1, 4, 12, 22], [2, 7, 14], [3, 9], [5]];

// Teapot symbols printed on the tile-market board. FIVE cells carry a printed
// teapot symbol; a symbol is "visible" when its cell is currently empty (no
// tile sitting on it). Visible symbols GATE the fresh pot of tea
// (REFRESH_THRESHOLD of them must show — see canOrderTea). Since 30 July they no
// longer size its reward — the pot pays a flat TEA_POT_REWARD at the cupcake-pot
// step (see finishTeaRound). There is NO cupcake cap any more — every gain
// always pays.
//
// ONE set of 4 cells for all player counts (28 July: the per-player-count sets
// keyed by market size are void, along with the 2-player inner area they existed
// to serve). Values are flat market-array indices on the 5-wide grid
// (index = row*MARKET_SIZE + col).
//
// Positions (adopted 30 July - five symbols): 1-indexed (row, column) (1,4),
// (2,1), (3,3), (4,5), (5,2), matching the printed board art convention.
// Zero-indexed and flattened those are (0,3)=3, (1,0)=5, (2,2)=12, (3,4)=19,
// (4,1)=21.
//
// The 30 July change adds the CENTRE cell (3,3) as a fifth symbol. The set
// keeps the property that matters mechanically - every symbol in its own row AND
// its own column, so no single sweep can ever uncover two at once. Reaching
// REFRESH_THRESHOLD therefore always takes at least REFRESH_THRESHOLD separate
// sweeps, each uncovering one symbol. (The briefly-used inner ring
// (2,2)/(2,4)/(4,2)/(4,4) broke that; it is void.)
//
// They live here as config, not as hardcoded logic, precisely so the art team can
// move them without touching any code that reads them.
export const CUPCAKE_SYMBOL_CELLS = [3, 5, 12, 19, 21];

// Visible teapot symbols needed at the start of a turn before a player may
// order a fresh pot of tea. This is the designated tuning knob for refresh
// frequency - never additional rules. Read by canOrderTea, which is the one gate
// the engine, the bots and the UI all share.
//
// Adopted 30 July: 4 of the 5 symbols must be visible before a fresh pot may be
// ordered. Since no two symbols share a row or column (see CUPCAKE_SYMBOL_CELLS),
// uncovering each one costs a separate sweep, so the gate demands four
// symbol-clearing sweeps. Simulation (200 games/config, 30 July) put the flush
// at ~6.5-7.3 tiles left on the board against a 5-7 design target; the previous
// 3-of-4 gate flushed at ~9 and a 4-of-4 gate overshot to ~3.5 while making
// forced empty-board refreshes common.
export const REFRESH_THRESHOLD = 4;

// Adopted 30 July: the cupcake pot is a FLAT reward - the tea player gains
// exactly this many cupcakes, regardless of how many symbols are showing. Under
// the previous rule the pot paid 1 cupcake per visible symbol; the flat pot
// removes that variability (and most of the refresh's cupcake inflation) so the
// flush is ordered for the board state, not farmed for the payout.
export const TEA_POT_REWARD = 1;

// Cupcake cost of each claim BEYOND the first in a turn (design doc §6).
//
// THE ADOPTED RULE IS ONE CLAIM PER TURN, AND THIS SHIPS DISABLED. Do not flip it
// casually - it is not a tuning knob, it is a whole different game. Values:
//   null (the shipped default) - extra claims are DISALLOWED. A second claim in a
//        turn is rejected outright, with the plain-language message the players
//        actually need to hear (see claim()); a successful claim ends the claim
//        step exactly as it always has.
//   a number n - the PRE-AGREED VARIANT: claims beyond the first are permitted and
//        each costs n cupcakes out of the claiming player's own supply. A claim no
//        longer closes the claim step, so the player may keep going for as long as
//        they can pay and find matches.
//
// WHY IT EXISTS AT ALL: players persistently assume they may claim more than once,
// and the design session pre-agreed this as the escalation IF playtests show that
// frustration is real. It is wired up now, ahead of any decision, purely so
// simulation can A/B it - one constant flip, no other code change. Adopting it is
// a design decision, not an implementation one.
export const EXTRA_CLAIM_CUPCAKE_COST = null;

// The LIVE value of the variant flag, plus the seam that lets a simulation or a
// test harness swing it without editing (and accidentally committing) the shipped
// constant above. Everything in the engine reads getExtraClaimCupcakeCost() rather
// than the constant, so an A/B run is setExtraClaimCupcakeCost(1) ... run ...
// setExtraClaimCupcakeCost(EXTRA_CLAIM_CUPCAKE_COST) to put it back. Production
// code must never call the setter; the game always starts from the constant.
let extraClaimCupcakeCost = EXTRA_CLAIM_CUPCAKE_COST;

export function getExtraClaimCupcakeCost() {
  return extraClaimCupcakeCost;
}

// Test/simulation seam only - see above. Accepts null (rule as adopted) or a
// non-negative integer cupcake cost.
export function setExtraClaimCupcakeCost(cost) {
  if (cost !== null && (!Number.isInteger(cost) || cost < 0)) {
    throw new Error('extraClaimCupcakeCost must be null or a non-negative integer');
  }
  extraClaimCupcakeCost = cost;
}

// Count the teapot symbols currently VISIBLE (i.e. whose market cell is empty).
// Shared by the engine (the tea pot), the bots (tea timing), and the UI
// (rendering + pot preview) so all three read visibility the same way: purely
// from cell emptiness, with no separate symbol state.
export function getVisibleCupcakeSymbols(gameState) {
  const cells = CUPCAKE_SYMBOL_CELLS;
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

// THE ONLY WAY THE ENGINE MAY TOUCH THE STATS COLLECTOR. Use metrics(gameState)?.
// recordX(...) at every call site — never gameState.statsCollector directly.
//
// A collector is bound to exactly one game state (createGame calls bindTo), and
// this returns null for any other object. Search bots run their playouts on
// CLONES of the live state, and a clone is a different object, so a rollout can
// never write to the real game's metrics even if a future clone helper copies
// the collector reference across. It used to rely on mctsBot's cloneState
// remembering to null the field; when that slipped, hundreds of imaginary
// rollout turns per real turn were logged as real, and the end screen showed
// 61,689 sweeps and 48,076 cards claimed for a 21-turn two-player game.
function metrics(gameState) {
  const collector = gameState.statsCollector;
  if (!collector || collector.owner !== gameState) return null;
  return collector;
}

// ---------------------------------------------------------------------------
// METRIC SAMPLERS (design doc, "Metrics to log per simulated/real game").
//
// Three measurements the collector cannot take for itself, because they are
// questions about the whole game state rather than about a single event. All
// three return IMMEDIATELY when there is no collector, and none of them touches
// the state, so a game played without metrics behaves identically and pays
// nothing for these hooks.
// ---------------------------------------------------------------------------

// METRIC 3 (card row size) and the OPPORTUNITY denominator for metric 1. One
// sample at the very start of each real turn: the length of the CARD row
// (gameState.cardMarket — not the 5x5 tile market, not the personal board), the
// visible teapot symbols, and whether a refresh is legal right now. Called from
// exactly two places, createGame for the opening turn and advanceToNextTurn for
// every rotation that actually hands somebody a turn, so there is precisely one
// sample per turn played. Sampling at the START matters: a refresh taken during
// the turn cuts the row back to INITIAL_MARKET_CARDS, and metric 3 is about the
// row the player was faced with.
function sampleTurnStart(gameState) {
  const collector = metrics(gameState);
  if (!collector) return;
  collector.recordTurnStart(
    gameState.stats.turnsPlayed,
    gameState.currentPlayerIndex,
    gameState.cardMarket.length,
    getVisibleCupcakeSymbols(gameState),
    canOrderTea(gameState),
  );
}

// METRICS 4 (card lock) and 5 (multi-match). How many cards the active player
// could LEGALLY claim as their claim step opens. Sampled from skipMove, the sole
// entry into the claim phase, so it reads the board AFTER any cupcake move — a
// move can create the match, and a player who moved into one was never locked.
//
// A completed pattern is the whole test: the crumb tray is always a legal
// destination for the removed tile (see getLegalDestinations), and the first
// claim of a turn is always free (§6), so nothing else can refuse a claim the
// pattern allows. The reserve is counted separately from the row because the
// 27 July lock the design doc asks us to verify was a property of the ROW.
//
// This is the one genuinely expensive hook (a pattern scan per card in the row),
// which is exactly why it sits behind the collector check.
function sampleClaimOpportunity(gameState) {
  const collector = metrics(gameState);
  if (!collector) return;
  const player = gameState.players[gameState.currentPlayerIndex];
  let rowClaimable = 0;
  for (const card of gameState.cardMarket) {
    if (getPatternMatches(player.board, card.pattern).length > 0) rowClaimable++;
  }
  const reserved = player.reservedCard;
  const reserveClaimable = (reserved && getPatternMatches(player.board, reserved.pattern).length > 0) ? 1 : 0;
  collector.recordClaimOpportunity(gameState.stats.turnsPlayed, player.id, rowClaimable, reserveClaimable);
}

// METRIC 8, the physical-supply half. Total cupcakes held simultaneously across
// every player, sampled after each influx (a spend only ever lowers the total, so
// the peak always follows a gain). The rules have had NO cupcake cap since
// 24 July; this measures whether the 16 tokens in the box would ever run out, and
// deliberately enforces nothing.
function noteCupcakeSupply(gameState) {
  const collector = metrics(gameState);
  if (!collector) return;
  let held = 0;
  for (const player of gameState.players) held += player.cupcakes;
  collector.recordCupcakeSupply(held);
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
  metrics(gameState)?.recordPlating(player.id, rowIndex);

  if (!isCupcakePlate(rowIndex, plateIndex)) return;
  player.cupcakes++;
  metrics(gameState)?.recordCupcakePlateGain(player.id);
  noteCupcakeSupply(gameState);
}

export function createGame(playerConfigs, statsCollector = null) {
  const bag = createTileBag();
  const playerCount = playerConfigs.length;
  // The market is MARKET_SIZE square at every player count. It is still copied
  // onto the game state because engine, bots and UI all read gameState.marketSize
  // rather than importing the constant.
  const marketSize = MARKET_SIZE;

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
    // NOTE (28 July): there is no per-player tea state any more. The Fresh Pot of
    // Tea CARD is deleted, and with it the once-per-game "tea spent" flag — the
    // refresh is a standing board option with no per-game or per-player limit,
    // gated purely on visible teapot symbols (see canOrderTea).
    // Personal reserve for the tea round: a single face-up card object (or null).
    // Filled by teaReserve, emptied by claim (completing it) or left to score 0.
    reservedCard: null,
    score: 0,
  }));

  const market = [];
  for (let i = 0; i < marketSize * marketSize; i++) {
    market.push(bag.shift());
  }
  // NOTE: the opening deal is NOT recorded as a market refill. "Market Refills"
  // counts refreshes of a market that was already in play (finishTeaRound), so
  // counting setup here made every game report one refill it never had.

  const { gameDeck, cardMarket } = initGameDeck();
  // cardsNeededToEnd = 8 tarts × player count. This encodes the tabletop end
  // condition "the game ends when the last (8th) tart is placed" per player, and
  // is the primary live playtime-tuning lever (raise/lower to lengthen/shorten
  // a game). CARDS_TO_END_2P is the 2-player value (16); 3p/4p scale it up.
  let cardsNeededToEnd = CARDS_TO_END_2P;
  if (playerCount === 3) cardsNeededToEnd = 24;
  else if (playerCount === 4) cardsNeededToEnd = 32;

  const gameState = {
    players,
    market,
    bag,
    gameDeck,
    cardMarket,
    // Flushed cards accumulate here and are reshuffled back into an empty
    // gameDeck by drawCard. Its ONLY source is the tea round's card flush
    // (finishTeaRound step b) - claimed cards go to the claiming player, and
    // since the 28 July rework a claim draws no replacement, so nothing else
    // discards. The discard therefore sits empty until the first refresh and
    // then fills a whole row at a time.
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
    // True while the tea round in progress was FORCED by an empty tile market
    // (the mandatory refresh — see applyEmptyMarketRule) rather than chosen by
    // the player. Drivers and the UI read it to present/drive a forced refresh
    // differently (no "cancel", no confirm prompt). Cleared by finishTeaRound.
    refreshIsMandatory: false,
    gameOver: false,
    // endGameReason - every value the engine can set:
    //   'cardMarket'    - the documented card end condition: cardsNeededToEnd
    //                     cards have been claimed (isGameOver, checked in refill).
    //   'bagEmpty'      - the documented tile end condition (28 July ruling): "if
    //                     the bag is empty, no refills are possible - this is also
    //                     an end game trigger". Detected at the TURN BOUNDARY in
    //                     advanceToNextTurn so every player has had an equal
    //                     number of turns.
    //   'boardFull'     - the incoming player's personal board has no free cell.
    //                     Also a turn-boundary check, same reasoning.
    //   'marketTiles'   - the empty-market deadlock valve (see
    //                     applyEmptyMarketRule). Since 'bagEmpty' arrived this is
    //                     defence in depth only, not an expected path.
    //   'boardOverflow' - implementation safety valve (a board that cannot accept
    //                     the tiles just swept), not a documented tabletop rule.
    endGameReason: null,
    remainingTurnsInEndGame: 0, // final-turn countdown for the boardOverflow safety valve
    // Deadlock safety valve for the empty-market rule: when the tile market AND
    // bag are both empty no sweep is possible and no refresh can produce tiles,
    // so a run of turns can pass with nobody able to claim. This counts turns
    // since the last card was claimed (reset in claim); once it reaches
    // playerCount while market+bag are dry, the game ends (see
    // applyEmptyMarketRule). NOTE: with the 'bagEmpty' end condition in place an
    // empty bag ends the game at the previous turn boundary, so this counter is
    // now only exercised by a directly-constructed state.
    turnsSinceLastClaim: 0,
    cardsNeededToEnd,
    playerCount,
    marketSize,
    cupcakesUsedThisTurn: false,
    // Claims made by the current player during THIS turn. The one-claim-per-turn
    // rule (§6) is expressed in terms of this counter rather than being left as a
    // side effect of the phase transition, so the engine can say WHY a second
    // claim was refused instead of muttering "not in claim phase". Counts every
    // kind of claim - market or reserve - because the rule is about claims, and a
    // reserved card is claimed. Reset in advanceToNextTurn.
    claimsThisTurn: 0,
    stats: {
      turnsPlayed: 0,
    },
    statsCollector,
  };

  // Bind the collector to THIS state before any metric is logged: every record
  // below (and everywhere else in the engine) goes through metrics(), which only
  // logs for the state the collector was bound to. See metrics() for why.
  statsCollector?.bindTo(gameState);

  // Metric: every player starts with 2 cupcakes — log it as their opening influx
  // so the per-source cupcake accounting (start / pot / plates) is complete.
  for (const player of players) {
    metrics(gameState)?.recordCupcakeGain(player.id, 'start', player.cupcakes);
  }
  noteCupcakeSupply(gameState);

  for (const card of cardMarket) {
    metrics(gameState)?.recordCardMarketEntry(card.id, 0);
  }

  // Metric: the FIRST turn's start sample. Every later turn is sampled by
  // advanceToNextTurn; turn 0 has no rotation to hang off, so it is taken here.
  sampleTurnStart(gameState);

  return gameState;
}

// Deal the reward deck for a new game: shuffle all 50 cards, seed the face-up
// card row, and put EVERY remaining card (50 − INITIAL_MARKET_CARDS = 47) into
// the draw deck. The whole deck must be reachable so the card-count end
// condition (cardsNeededToEnd up to 32 at 4p) can actually fire — an earlier
// version capped the deck at 16, which made 3p/4p games unable to end that way.
//
// INITIAL_MARKET_CARDS is the row's STARTING length only, not its size. From the
// 28 July rework the row is variable-length: it grows by one at the end of every
// turn and shrinks by one per market claim, up to a ceiling of MAX_MARKET_CARDS
// (30 July rule change — see dealEndOfTurnCard).
export function initGameDeck() {
  const shuffledCards = [...REWARD_CARDS];
  // Fisher-Yates (matches createTileBag in tiles.js), replacing the weaker
  // sort(() => Math.random() - 0.5) shuffle used previously.
  for (let i = shuffledCards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffledCards[i], shuffledCards[j]] = [shuffledCards[j], shuffledCards[i]];
  }

  const cardMarket = shuffledCards.splice(0, INITIAL_MARKET_CARDS);
  const gameDeck = shuffledCards; // all remaining cards form the draw deck

  return { gameDeck, cardMarket };
}

// Draw the next reward card from the deck. When the deck is empty but cards have
// been discarded, the discard pile is Fisher-Yates shuffled into a fresh deck
// and emptied (the tabletop "reshuffle when the deck runs out" rule). Returns
// the drawn card, or null when both deck and discard are exhausted so callers
// can simply skip whatever they were dealing (the row then stands still for a
// turn). Its two callers are the end-of-turn deal (dealEndOfTurnCard) and the
// tea round's redeal (finishTeaRound step b) - a claim no longer draws anything.
// Tea flushes feed the discard, and each one burns a whole row, so reshuffles are
// expected rather than a corner case.
export function drawCard(gameState) {
  if (gameState.gameDeck.length === 0 && gameState.cardDiscard.length > 0) {
    const reshuffled = gameState.cardDiscard;
    for (let i = reshuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [reshuffled[i], reshuffled[j]] = [reshuffled[j], reshuffled[i]];
    }
    gameState.gameDeck = reshuffled;
    gameState.cardDiscard = [];
    metrics(gameState)?.recordDeckReshuffle();
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

  metrics(gameState)?.recordSweep(sweptTiles.length);

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

// Is ordering a fresh pot of tea legal RIGHT NOW? The single gate shared by the
// engine (orderTea's own guard), the bots (refresh timing) and the UI (button
// state), so none of the three re-implements it:
//   - it is the very start of a turn (sweep phase, nothing swept yet), and
//   - no bonus tile is pending, and
//   - the BAG IS NOT EMPTY, and
//   - at least REFRESH_THRESHOLD teapot symbols are VISIBLE on the market board.
// There is deliberately NO per-game or per-player limit to check: the refresh is
// a standing board option, and the gate resets itself because the tile flush
// (finishTeaRound step d) covers every symbol again.
//
// THE EMPTY-BAG CLAUSE (28 July ruling: "if the bag is empty, no refills are
// possible - this is also an end game trigger"). A refill needs tiles to refill
// with, so with a dry bag ordering a fresh pot is simply not a legal action.
// That clause is also what makes "the gate resets itself" true. Without it, once
// the bag was short of the market's 25 cells the redeal left cells empty - often
// symbol cells - so the gate stayed OPEN and the same player could order tea
// again, and again, inside one turn, collecting a pot each time (observed: ~200
// refreshes and games that never ended). It closes because a redeal that cannot
// fill the board always drains the bag to exactly 0, so the very next
// canOrderTea fails. The game itself then ends at the next turn boundary with
// endGameReason 'bagEmpty' (see advanceToNextTurn) - the player who emptied the
// bag still finishes their own turn.
export function canOrderTea(gameState) {
  if (gameState.gamePhase !== 'sweep') return false;
  if (gameState.bonusTileAvailable) return false;
  if (gameState.bag.length === 0) return false;
  return getVisibleCupcakeSymbols(gameState) >= REFRESH_THRESHOLD;
}

// Order a fresh pot of tea at the START of a turn, BEFORE the sweep. This is a
// standing option printed on the market board ("4 teapots showing? Order a
// fresh pot of tea"), NOT a held card: the 28 July rules delete the Fresh Pot of
// Tea card and its once-per-game restriction with it, so a player may order tea
// as often as the board AND THE BAG allow (an empty bag cannot refill anything,
// so it makes the order illegal - see canOrderTea). Tea does not cost the sweep
// either - after the round resolves the player takes their FULL normal turn
// (sweep, place, move, claim, including a card they reserved in step (a)).
//
// The procedure runs in this order (see finishTeaRound for steps b-d):
//   (a) reserve round — starting with the tea player and proceeding clockwise,
//       each player may reserve one card from the card market (limit 1);
//   (b) card flush — the ENTIRE remaining card row goes to the discard and
//       exactly INITIAL_MARKET_CARDS fresh cards are dealt;
//   (c) cupcake pot — the ACTIVE player gains a flat TEA_POT_REWARD cupcakes
//       (symbols are still counted, for the metrics, BEFORE the tiles are
//       refilled);
//   (d) FULL tile flush — every tile still on the market returns to the bag, the
//       bag is shuffled, and all cells are dealt afresh. Destructive, not
//       additive: the survivors do not survive.
//
// orderTea sets up only the reserve round (a); teaReserve advances it and
// finishTeaRound performs (b)-(d). Legality is canOrderTea's business.
export function orderTea(gameState) {
  if (gameState.gamePhase !== 'sweep') throw new Error('Can only order tea at the start of a turn (sweep phase)');
  if (gameState.bonusTileAvailable) throw new Error('Cannot order tea while a bonus tile is pending');
  if (gameState.bag.length === 0) throw new Error('Cannot order a fresh pot of tea with an empty bag - no refill is possible');
  if (getVisibleCupcakeSymbols(gameState) < REFRESH_THRESHOLD) {
    throw new Error(`Need at least ${REFRESH_THRESHOLD} visible teapot symbols to order a fresh pot of tea`);
  }

  beginTeaRound(gameState, false);
  return gameState;
}

// Open the reserve round of a fresh pot of tea. Shared by the voluntary route
// (orderTea, which does the legality checking) and the MANDATORY route (an empty
// tile market at the start of a turn — see applyEmptyMarketRule), which bypasses
// the gate because an empty market shows every symbol anyway. isMandatory is
// recorded on the state so drivers and the UI can tell the two apart.
function beginTeaRound(gameState, isMandatory) {
  // The tea player reserves FIRST (deliberate — see design doc); every player
  // gets exactly one reserve opportunity, so the countdown starts at playerCount.
  gameState.teaReserverIndex = gameState.currentPlayerIndex;
  gameState.teaReservesRemaining = gameState.playerCount;
  gameState.refreshIsMandatory = isMandatory;
  gameState.gamePhase = 'teaReserve';
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

    // The card leaves the market here (back when reserved), so a later claim
    // from the reserve must NOT record another market exit for it.
    metrics(gameState)?.recordCardMarketExit(card.id, gameState.stats.turnsPlayed);
    metrics(gameState)?.recordTeaReserve(reserver.id, card.id);
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
// steps (b)-(d) of the tea procedure IN ORDER (see orderTea):
//   (b) Card flush + redeal: every surviving market card goes to the discard and
//       a fresh INITIAL_MARKET_CARDS cards are dealt (fewer only when deck +
//       discard are exhausted). The row is flushed BY LENGTH, not by assuming
//       four cards: the row grows without a cap (see dealEndOfTurnCard), and this
//       flush is the ONLY thing that ever shrinks it back to four.
//   (c) Cupcake pot: the ACTIVE (tea) player — currentPlayerIndex, NOT each
//       reserver — gains a flat TEA_POT_REWARD cupcakes. The visible-symbol
//       count is still read BEFORE the tile flush, since (d) covers the symbols
//       again, but it now only feeds the metrics.
//   (d) FULL tile flush: every tile still on the market goes BACK INTO THE BAG,
//       the bag is Fisher-Yates shuffled, and all cells are dealt afresh (a
//       partial fill only if the bag cannot cover the board). This is
//       destructive, not additive — a tile market a player has been building
//       toward does not survive someone else's refresh, which is the whole
//       point of the 28 July change.
// Finally the phase returns to SWEEP: the tea player now takes their full
// normal turn.
function finishTeaRound(gameState) {
  // (b) Flush unreserved market cards, then redeal a fresh market.
  while (gameState.cardMarket.length > 0) {
    const discarded = gameState.cardMarket.shift();
    gameState.cardDiscard.push(discarded);
    metrics(gameState)?.recordCardMarketExit(discarded.id, gameState.stats.turnsPlayed);
  }

  // The row is EMPTY at this point (the loop above emptied it whatever its
  // length), so this deals exactly INITIAL_MARKET_CARDS. It is a redeal, NOT a
  // "top the row back up to 4" invariant — nothing anywhere else may assume the
  // row is four cards long.
  while (gameState.cardMarket.length < INITIAL_MARKET_CARDS) {
    const newCard = drawCard(gameState);
    if (!newCard) break; // deck + discard exhausted — market simply stays short
    gameState.cardMarket.push(newCard);
    metrics(gameState)?.recordCardMarketEntry(newCard.id, gameState.stats.turnsPlayed);
  }

  const activePlayer = gameState.players[gameState.currentPlayerIndex];

  // (c) Cupcake pot — a FLAT TEA_POT_REWARD, not 1 per symbol (30 July rule).
  // Visible symbols still gate the pot and are still counted here (BEFORE the
  // tile flush covers them again) because the metrics log symbols and reward as
  // separate fields precisely so a payout change like this one cannot rewrite
  // the cadence history.
  const potSize = getVisibleCupcakeSymbols(gameState);
  activePlayer.cupcakes += TEA_POT_REWARD;
  metrics(gameState)?.recordCupcakeGain(activePlayer.id, 'pot', TEA_POT_REWARD);
  noteCupcakeSupply(gameState);

  // METRIC 9 (bag skew) is measured across step (d) below: which colours go back
  // into the bag, which colours come out again, and how many of the returned
  // tiles reappear immediately. `returned` exists only when a collector does, so
  // an unmetered game allocates nothing extra.
  const collector = metrics(gameState);
  const returned = collector ? [] : null;

  // (d) FULL tile flush: market -> bag, shuffle, then deal every cell afresh.
  // Return the survivors first so they are genuinely mixed back in and can come
  // straight back out (colour recirculation is a logged metric, not a bug).
  for (let i = 0; i < gameState.market.length; i++) {
    if (gameState.market[i] !== null && gameState.market[i] !== undefined) {
      if (returned) returned.push(gameState.market[i]);
      gameState.bag.push(gameState.market[i]);
      gameState.market[i] = null;
    }
  }
  // Fisher-Yates (matches createTileBag in tiles.js and the deck reshuffle in
  // drawCard) — without it the returned tiles would sit in a predictable block
  // at the end of the bag.
  const bag = gameState.bag;
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
  let filledAny = false;
  for (let i = 0; i < gameState.market.length; i++) {
    if (bag.length === 0) break; // bag ran dry — fill what we can, as the rules say
    gameState.market[i] = bag.shift();
    filledAny = true;
  }
  if (filledAny) {
    metrics(gameState)?.recordMarketFill();
  }

  // METRICS 1, 2 and 9, all of which need the flush to be over before they can be
  // written. The refresh row carries everything the design doc asks for about this
  // firing: when, who, how many symbols were showing, what it paid, and whether it
  // was CHOSEN or forced by an empty board (refreshIsMandatory is still set here —
  // it is cleared a few lines below).
  if (collector) {
    // `returned` holds every tile the flush swept off the market, and the
    // reserve round between ordering and resolving only touches cards, so its
    // length IS the tile count on the board when the pot was called.
    collector.recordRefresh(
      gameState.stats.turnsPlayed,
      activePlayer.id,
      potSize,
      TEA_POT_REWARD,
      gameState.refreshIsMandatory,
      returned.length,
    );
    // Bag skew: the colours that went back in, the colours dealt out, and how many
    // of the tiles just returned came straight back onto the board.
    const returnedSet = new Set(returned);
    const dealtColours = [];
    let immediateReturns = 0;
    for (const tile of gameState.market) {
      if (!tile) continue;
      dealtColours.push(tile.colour);
      if (returnedSet.has(tile)) immediateReturns++;
    }
    collector.recordBagFlush(returned.map(t => t.colour), dealtColours, immediateReturns);
  }

  // Hand the tea player their full normal turn.
  gameState.teaReserverIndex = null;
  gameState.refreshIsMandatory = false;
  gameState.gamePhase = 'sweep';

  // Defence in depth only. BOTH routes into a tea round now require a non-empty
  // bag (canOrderTea for the chosen one, applyEmptyMarketRule's own bag check for
  // the mandatory one), and step (d) moves the whole bag onto the market until
  // every cell is full, so the market always holds at least one tile here and
  // this call returns immediately. It stays because a driver could construct a
  // tea round directly from an odd state.
  applyEmptyMarketRule(gameState);
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

// Claim a reward card: complete its pattern on the board, plant a tart token on
// one of the matched cells, and send the tile that was there to a stand row or
// the crumb tray.
//
// CARD-ROW EFFECT (28 July rework, §5): a claim only ever REMOVES a card. The
// old "draw the top card of the deck to return the market to 4" rule is DELETED,
// so the row is one card shorter for the rest of the turn. The single
// replenishment point is the end-of-turn deal in refill(), which runs on every
// turn whether or not anything was claimed. A claim from the RESERVE touches the
// row not at all (the card left it when it was reserved) but still gets that
// end-of-turn deal, so a reserve claim actually GROWS the row by one.
export function claim(gameState, cardId, removedBoardIndex, destination) {
  const player = gameState.players[gameState.currentPlayerIndex];
  const extraClaimCost = getExtraClaimCupcakeCost();

  // ONE CLAIM PER TURN (§6), checked BEFORE the phase gate and deliberately so.
  // Under the adopted rule a successful claim leaves the turn in the 'refill'
  // phase, so a second attempt would otherwise trip the phase check and come back
  // as "Not in claim phase" - true, useless, and the single most common thing
  // players get wrong about this game. The counter is the rule; the phase gate
  // below stays as structural defence. These messages are rule EXPLANATIONS and
  // the UI is expected to surface them to the player as such.
  if (gameState.claimsThisTurn > 0) {
    if (extraClaimCost === null) {
      throw new Error('Only one claim per turn');
    }
    // Variant enabled: extra claims are for sale, but only to a player who can
    // actually pay for this one.
    if (player.cupcakes < extraClaimCost) {
      throw new Error(`Not enough cupcakes for an extra claim (costs ${extraClaimCost}, you have ${player.cupcakes})`);
    }
  }

  if (gameState.gamePhase !== 'claim') throw new Error('Not in claim phase');
  // Card lookup order: the shared market first, then this player's personal
  // reserve. A reserved card completes exactly like a market card except the row
  // is not spliced (see the fromReserve branches below), since the card left the
  // row when it was reserved.
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

  // fromReserve feeds the claims-from-reserve fraction metric (6). The row length
  // is passed for metric 3's "row size when the FIRST claim occurs" - read here,
  // before the splice below, so a market claim counts the card it is taking.
  metrics(gameState)?.recordCardClaimed(cardId, gameState.stats.turnsPlayed, fromReserve, gameState.cardMarket.length);
  // A reserved card already recorded its market exit when it was reserved.
  if (!fromReserve) {
    metrics(gameState)?.recordCardMarketExit(cardId, gameState.stats.turnsPlayed);
  }

  if (fromReserve) {
    // Completing a reserved card: clear the reserve. The market is untouched —
    // the card left it when it was reserved.
    player.reservedCard = null;
  } else {
    // The card simply LEAVES the row. No replacement is drawn here (28 July: the
    // claim-refill rule is deleted). The row is replenished once per turn, at the
    // end of the turn, by refill() — see the end-of-turn deal there.
    gameState.cardMarket.splice(cardIndex, 1);
  }

  // Pay for the claim if it was an EXTRA one under the variant (the first claim
  // of a turn is always free). Charged here, after every validation has passed,
  // so a rejected claim never costs a player anything.
  if (gameState.claimsThisTurn > 0 && extraClaimCost !== null) {
    player.cupcakes -= extraClaimCost;
    // Metric 8: the only cupcake spend other than the move. Normally 0 for a whole
    // simulation run, since the variant ships disabled.
    metrics(gameState)?.recordCupcakeSpend(player.id, 'extraClaim', extraClaimCost);
  }
  gameState.claimsThisTurn++;

  // Under the ADOPTED rule the claim step ends the instant a claim lands - one
  // claim, then on to the end of the turn. Under the variant the player may go
  // again, so the phase must stay 'claim' or the variant would be unplayable
  // (this is the whole of the "single constant flip" promise). The exception is a
  // player who can no longer pay for another: there is nothing left for them to
  // decide, so close the step rather than making every driver poll a dead phase.
  if (extraClaimCost === null || player.cupcakes < extraClaimCost) {
    gameState.gamePhase = 'refill';
  }
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
  // Metric 8: the cupcake MOVE is one of only two ways a cupcake is ever spent
  // (the other being the extra-claim variant, which ships disabled).
  metrics(gameState)?.recordCupcakeSpend(player.id, 'move', 1);
  return gameState;
}

// The single entry into the claim phase, which is why the card-lock and
// multi-match sample is taken here: it runs once per turn, on every turn that
// reaches a claim decision, and after any cupcake move that might have created a
// match. (A turn cut short by the board-overflow finale never reaches this and so
// contributes no sample — the report carries the sample count for that reason.)
export function skipMove(gameState) {
  if (gameState.gamePhase !== 'move') throw new Error('Not in move phase');
  gameState.gamePhase = 'claim';
  sampleClaimOpportunity(gameState);
  return gameState;
}

export function skipClaim(gameState) {
  if (gameState.gamePhase !== 'claim') throw new Error('Not in claim phase');
  gameState.gamePhase = 'refill';
  return gameState;
}

// THE END-OF-TURN DEAL (28 July rework, §5; capped 30 July). ONE card goes from
// the deck onto the card row at the end of EVERY turn - claim or no claim,
// refresh or no refresh, market claim or reserve claim - UNLESS the row already
// holds MAX_MARKET_CARDS, in which case the deal is skipped and the row stands
// still. It is not a decision any player or bot makes.
//
// THE CAP (30 July rule change). The 28 July design deliberately had no cap,
// arguing an uncapped row was the staleness valve: a row nobody can claim from
// grows until somebody can, whereas a full capped row stops changing and can
// freeze. The designer overrode that on 30 July: the row starts at
// INITIAL_MARKET_CARDS (now 3) and never exceeds MAX_MARKET_CARDS (8). The
// tea-flush escape hatch is what makes the cap safe where the old frozen-market
// failure wasn't: a stale row at the cap can always be flushed and redealt by
// ordering a fresh pot of tea (finishTeaRound step b cuts it back to
// INITIAL_MARKET_CARDS), so a deadlock now has a player-driven exit.
//
// WHY EVERY TURN, RATHER THAN ONLY WHEN THE PLAYER DID NOT CLAIM. Dealing only
// on claimless turns would let a table of claiming opponents starve a player who
// cannot claim: every card revealed for them would be taken before their next
// turn and the row would never grow. Dealing every turn (cap permitting)
// guarantees that a player who cannot claim sees at least one new card by their
// next turn whenever the row has room.
//
// PLACEMENT: this runs at the TOP of refill(), i.e. before the end-condition
// checks and before advanceToNextTurn's rotation. Two reasons.
//   1. It is a step of the turn that is ENDING, not of the next one. Rotating
//      first would attribute the card to the incoming player, and would let a
//      mandatory refresh opened by advanceToNextTurn (applyEmptyMarketRule)
//      flush a row that had not yet received the deal it was owed.
//   2. Running it ahead of the end checks keeps it a single straight-line
//      statement instead of something that has to be repeated down each of
//      refill's three branches, where a future edit could quietly drop one.
//      Dealing on the final turn costs nothing - the row is not scored.
// drawCard reshuffles the discard pile when the deck runs out and returns null
// only when deck AND discard are both empty, in which case the row simply does
// not grow this turn.
function dealEndOfTurnCard(gameState) {
  if (gameState.cardMarket.length >= MAX_MARKET_CARDS) return; // row at the cap - no deal
  const newCard = drawCard(gameState);
  if (!newCard) return; // deck + discard exhausted - the row stands still
  gameState.cardMarket.push(newCard);
  metrics(gameState)?.recordCardMarketEntry(newCard.id, gameState.stats.turnsPlayed);
}

export function refill(gameState) {
  if (gameState.gamePhase !== 'refill') throw new Error('Not in refill phase');

  // The TILE market no longer refills automatically at end of turn. It is
  // refreshed ONLY by a fresh pot of tea (finishTeaRound step d), whether that
  // was ordered voluntarily or forced by the empty-market rule. The CARD row is
  // the opposite: it is topped up here and nowhere else (see below).
  dealEndOfTurnCard(gameState);

  // The turn just PLAYED is counted here, at the one point every turn passes
  // through, rather than in advanceToNextTurn. Two of refill's three branches end
  // the game without rotating, so counting on rotation dropped the final turn:
  // a game the collector saw 22 sweeps in reported "Turns Played 21". Counted
  // after dealEndOfTurnCard so the turn stamps on card-market entries are
  // unchanged.
  gameState.stats.turnsPlayed++;

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
    // No unconditional "market+bag empty → game over" here: the tile end
    // condition is resolved one level down, at the turn boundary inside
    // advanceToNextTurn, so every player gets the same number of turns. An empty
    // bag ends the game there ('bagEmpty'); a merely empty MARKET with tiles
    // still in the bag forces a refresh instead (applyEmptyMarketRule).
    advanceToNextTurn(gameState);
  }

  return gameState;
}

// Rotate to the next player's turn, then resolve the two TURN-BOUNDARY end
// conditions. Both are checked here, after the rotation, for the same reason:
// the turn order has come full circle, so every player has had an equal number
// of turns and scoring can happen on the spot.
//   BOARD-FULL END: the incoming player's personal board is completely full
//     (tiles + tart tokens), so they could not place anything they swept.
//   EMPTY-BAG END (28 July ruling): the tile bag is empty, so no refill of the
//     tile market is possible ever again. Deliberately NOT checked the instant
//     the bag hits zero mid-turn: a player whose own refresh drains the bag
//     still completes their full turn, exactly as with board-full.
//
// NOTE: this does not always leave the game in the 'sweep' phase. The
// empty-market rule below can start the incoming player's turn in the
// interactive 'teaReserve' phase (a mandatory refresh), and it can also end the
// game outright - drivers must dispatch on gamePhase (and check gameOver) after
// every turn rotation rather than assuming a sweep is next. Its 'move' deadlock
// branch is no longer reachable from here, because the empty-bag check above
// fires a turn earlier.
function advanceToNextTurn(gameState) {
  // stats.turnsPlayed is NOT incremented here — refill() counts the turn that
  // just played, so turns that end the game without rotating still count.
  gameState.currentPlayerIndex = (gameState.currentPlayerIndex + 1) % gameState.players.length;
  gameState.cupcakesUsedThisTurn = false;
  // The one-claim-per-turn allowance refreshes with the turn (§6). Reset here,
  // alongside the cupcake-move allowance, so both per-turn allowances live in one
  // place and cannot drift apart.
  gameState.claimsThisTurn = 0;
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

  // Empty bag: no refill is possible, so the game ends here. Checked BEFORE
  // applyEmptyMarketRule, which is why that rule's market-and-bag-empty branch
  // is unreachable from normal play.
  if (gameState.bag.length === 0) {
    gameState.gameOver = true;
    gameState.endGameReason = gameState.endGameReason || 'bagEmpty';
    calculateFinalScores(gameState);
    return;
  }

  // Metric: the incoming turn is definitely going to be played (neither
  // end-condition above fired), so sample its opening state. Deliberately BEFORE
  // applyEmptyMarketRule: a mandatory refresh would otherwise have already moved
  // the phase to 'teaReserve' and flushed the row, and metric 3 wants the row the
  // player was handed, while metric 1 wants canOrderTea's honest answer.
  sampleTurnStart(gameState);

  applyEmptyMarketRule(gameState);
}

// EMPTY-MARKET RULE (the reworked backstop). A sweep is legal whenever any tile
// sits on the market, so the only unplayable sweep is a COMPLETELY EMPTY tile
// market. Checked at the start of every new turn's sweep phase:
//   - Market empty, bag has tiles: the refresh becomes MANDATORY. It is a normal
//     fresh pot of tea in every way — reserve round, card flush, and the full
//     cupcake pot, which pays the same flat TEA_POT_REWARD as a chosen one.
//     Whoever emptied the board therefore gifts the next player the maximum
//     reward; that gift/deny tension is INTENDED and must not be softened. (This
//     replaces the 24 July free-refill backstop, which handed out tiles with no
//     reserve round and no pot.)
//   - Market AND bag empty: a flush cannot produce a single tile, so forcing a
//     refresh would spin forever. This is the deadlock valve: skip the
//     sweep+place steps straight to the move phase so the player can still move a
//     tile and claim, and end the game once a full round of turns (playerCount)
//     has passed with no claim.
//     SAFETY NET, NOT AN EXPECTED PATH (28 July ruling). An empty bag is now
//     itself an end-game trigger, resolved at the turn boundary in
//     advanceToNextTurn BEFORE this rule runs, so normal play can never reach a
//     turn with an empty bag at all, let alone an empty market as well. The
//     branch is kept deliberately as defence in depth for a driver or test that
//     constructs such a state directly; its 'marketTiles' end reason should
//     never appear in a real game.
// Called from advanceToNextTurn (the normal turn rotation) and from the tail of
// finishTeaRound. Because the mandatory branch enters the interactive
// 'teaReserve' phase, callers must be able to drive a tea round that begins
// without anyone asking for one — gameState.refreshIsMandatory tells them apart.
function applyEmptyMarketRule(gameState) {
  if (!gameState.market.every(t => t === null)) return; // tiles present — normal sweep

  // The bag check comes first, so a mandatory refresh is never forced on a state
  // that could not satisfy it. An empty bag falls through to the valve below.
  if (gameState.bag.length > 0) {
    // Mandatory refresh. Log it as a backstop firing: the metric still means
    // "the tile market ran dry before anyone chose to refresh it", and it should
    // stay rare.
    metrics(gameState)?.recordBackstopFiring(gameState.stats.turnsPlayed);
    beginTeaRound(gameState, true);
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

export { BOARD_SIZE, COLOURS, INGREDIENTS, REWARD_CARDS, INITIAL_MARKET_CARDS, MAX_MARKET_CARDS };
