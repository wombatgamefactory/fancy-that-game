import { createGame, sweep, takeBonusTile, declineBonusTile, dealCards, canDealCards, takeExtraTile, canBuyExtraTile, place, claim, skipClaim, skipSpend, refill, moveTile, removePlate, canRemovePlate, getMoveCost, reserveCard, canReserveCard, canClaimMore, getValidSweeps, getValidPlacements, getPatternMatches, getWinningPlayers, REWARD_CARDS, BOARD_SIZE } from '../engine/game.js';
import { renderSetupScreen, renderGameScreen, updateGameDisplay, setThinkingState, setThinkingProgress, renderEndScreen, showToast, getRailSaveState, restoreRailSaveState, resetRailState } from './board.js';
import {
  runTransition, predictSweep, tileName, marketCell, trayTileFor, boardCell,
  standPlate, cardEl, haptic, gatePassed, resetCount, startMotion, clearLine,
  onIdle, isHumanTurn, setCountListener,
} from './motion.js';
import { playCue, armAudioUnlock } from './sound.js';
import { readSave, writeSave, clearSave, describeSave } from './save.js';

// ---------------------------------------------------------------------------
// THE THREE MODULES THE LANDING PAGE CANNOT USE (9 August, stage 1, plan
// section 12.6)
// ---------------------------------------------------------------------------
//
// basicBot.js, mctsBot.js and statsCollector.js were static imports, which put
// 57,499 gzipped bytes of them on the landing page's critical path - 34% of the
// module graph's second wave - for three things that cannot exist until a game
// has been created. No bot has an opponent to think about on a seat-taking
// screen and no collector has a game to bind to.
//
// THEY ARE PREWARMED, NOT MERELY LAZY, and the difference is the whole of plan
// section 12.4's deferral rule: "an asset the current screen does not draw is
// not fetched before that screen is interactive; it is fetched afterwards, at
// low priority, so it is warm by the time the player asks for it." Firing the
// import() at window.load means the fetch is off the critical path AND finished
// long before anybody has chosen a player count, so pressing Start is still the
// 42ms render it was rather than a load. The await below is what makes that
// safe if it is not: a player who presses Start on the first frame waits for
// the download instead of getting a half-built game.
//
// One promise, memoised, so a second call cannot start a second fetch.
let deferredModules = null;
function loadDeferredModules() {
  if (!deferredModules) {
    deferredModules = Promise.all([
      import('../engine/statsCollector.js'),
      import('../bots/basicBot.js'),
      import('../bots/mctsBot.js'),
    ]).then(([stats, basic, mcts]) => ({
      createStatsCollector: stats.createStatsCollector,
      basicBot: basic,
      mctsBot: mcts,
    }));
  }
  return deferredModules;
}

// main.js is a module script, so it runs at DOMContentLoaded time and the load
// event is still ahead of it - but a bfcache restore or a re-executed bundle
// could land after it has already fired, and then nothing would ever warm.
if (document.readyState === 'complete') {
  loadDeferredModules();
} else {
  addEventListener('load', () => loadDeferredModules(), { once: true });
}

// Set by onGameStart, before anything can ask a bot for a move. autoPlayGame is
// only ever reached from onGameStart, confirmTurn or checkAutoAdvance, all of
// which are downstream of a started game.
let bots = null;

// EVERY REFUSAL IN THIS FILE GOES TO showToast, NOT alert() (9 August, ticket 00
// / finding 16). The ten catch blocks below print the engine's own message, word
// for word, exactly as they did before - only the transport changed. See the
// toast's own note in board.js for why an OS dialog was the wrong one.
let gameState = null;
let statsCollector = null;
let autoPlayMode = false;
let lastPlayerIndex = -1;
let undoStack = [];

// ---------------------------------------------------------------------------
// SAVE AND RESUME (stage 8, plan section 10)
// ---------------------------------------------------------------------------
// One write per turn boundary, whoever's turn it is, plus one at setup. The
// trigger is a single test - gameState.stats.turnsPlayed differs from the turn
// last written - which moves exactly once per turn inside refill(), so it fires
// on the first render after every rotation and at no other time. It is robust to
// the two irregular paths the step model names, which is the whole reason to test
// the counter rather than the phase: a locked player rotates into `spend` rather
// than `sweep`, and autoSkipEmptyClaim can carry a turn through the claim step
// without a tap. Neither needs a special case.
//
// BOT TURNS GET A WRITE TOO. Three bots play between your turns on a phone you
// are not watching; if only human turn starts were written, an interruption
// during that lap would rewind past bot moves the player had already watched and
// the bots would re-decide them, so the game would come back different from the
// one they left. Writing every rotation means THE MOST THAT CAN EVER BE
// RE-ROLLED IS THE ONE BOT TURN IN FLIGHT.
//
// NO pagehide AND NO visibilitychange HANDLER. It would exist only to capture a
// mid-turn state, which is the one thing this refuses to store, and it would
// quietly reintroduce the problem the turn boundary was chosen to avoid.
let lastSavedTurn = null;
let resumedThisGame = false;

function saveNow() {
  if (!gameState) return;
  lastSavedTurn = gameState.stats ? gameState.stats.turnsPlayed : 0;
  writeSave(gameState, getRailSaveState(), { resumed: resumedThisGame });
}

// AFTER THE RENDER RETURNS AND NEVER INSIDE A startViewTransition CALLBACK. The
// boundary's largest movements run in that callback and it is on the animation's
// critical path; onIdle runs the write immediately when nothing is in flight and
// on `finished` when something is. A write costs 0.022ms against a 24 to 27ms
// render either way, so the deferral is about honesty rather than about cost.
function maybeSave() {
  if (!gameState || gameState.gameOver) return;
  const turn = gameState.stats ? gameState.stats.turnsPlayed : 0;
  if (turn === lastSavedTurn) return;
  onIdle(saveNow);
}

function init() {
  const app = document.getElementById('app');
  // The fingerprint and the parse run once, here, before anything is rendered.
  // A load is ALL OR NOTHING: either a resume card appears or there is no save.
  const env = readSave();
  const resume = env
    ? {
      ...describeSave(env),
      onResume: () => resumeGame(env),
      onDiscard: () => { clearSave(); init(); },
    }
    : null;
  renderSetupScreen(app, onGameStart, resume);
}

function snapshotGameState() {
  const { statsCollector, ...rest } = gameState;
  const clone = JSON.parse(JSON.stringify(rest));
  clone.statsCollector = statsCollector;
  return clone;
}

function pushUndoSnapshot() {
  undoStack.push(snapshotGameState());
}

function undoAction() {
  if (undoStack.length === 0) return;
  const snapshot = undoStack.pop();
  const statsCollector = gameState.statsCollector;
  Object.assign(gameState, snapshot);
  gameState.statsCollector = statsCollector;
  if (window._gameUI) {
    window._gameUI.selectedPlacements = [];
    window._gameUI.placementMap = {};
    window._gameUI.removableTiles = [];
    window._gameUI.claimingCardId = null;
    window._gameUI.removedBoardIndex = null;
    window._gameUI.destinationChoices = null;
    window._gameUI.cupcakeMode = false;
    window._gameUI.extraTileMode = false;
    window._gameUI.reserveMode = false;
  }
  // THE UNDO SNAPS, and the count snaps with it: every tile object in the game is
  // new after the round trip, so a count left mid-tween would be counting a seat
  // that no longer exists towards a number that has already gone.
  resetCount();
  updateDisplay();
}

// THE END IS A TRIGGER, NOT A STOP (4 August). Nothing here changes, and that is
// worth stating: refill() still either rotates the turn or ends the game, so
// polling gameState.gameOver after it is still the whole of the driver's job. What
// changed is WHEN the flag arrives. An end condition now only ARMS the ending
// (gameState.endTriggered), and play continues until the turn comes back round to
// the start player so that everybody has had the same number of turns - so
// gameOver can land several turns after a player filled their board. Do not add a
// check on endTriggered here and stop early; that is the bug the rule change
// fixed. The end screen names the reason (endGameReasonText in board.js).
function confirmTurn() {
  undoStack.length = 0;
  refill(gameState);
  updateDisplay();
  if (gameState.gameOver) {
    onGameEnd();
  } else {
    // Ending the turn with four teapots showing brews a fresh pot of tea. Since
    // 3 August that is MECHANICAL - refill() flushes the cards, pays the pot,
    // flushes the tiles and rotates, all inside the one call - so there is
    // nothing for the UI to drive and no reserve round to sit through.
    setTimeout(() => {
      const nextPlayer = gameState.players[gameState.currentPlayerIndex];
      if (!nextPlayer.isHuman) {
        autoPlayGame();
      }
    }, 500);
  }
}

// Start is now asynchronous (it awaits the deferred modules), so for the first
// time there is a window in which it can be pressed twice. On a warm import
// that window is one microtask; on a cold one it is a download. Two games would
// otherwise be created and the second would render over the first.
let starting = false;

async function onGameStart(playerConfigs) {
  if (starting) return;
  starting = true;
  try {
    await startGame(playerConfigs);
  } finally {
    starting = false;
  }
}

async function startGame(playerConfigs) {
  undoStack.length = 0;
  // A NEW GAME IS A DISCARD CASE (plan section 10, decision 6), and the rail's
  // memory, the count and the log line all belong to the game that is ending.
  resetRailState();
  resetCount();
  clearLine();
  resumedThisGame = false;
  lastSavedTurn = null;
  // Normally already resolved: the import fired at window.load and the player
  // has spent seconds on the seat screen since. See loadDeferredModules.
  const deferred = await loadDeferredModules();
  bots = deferred;
  statsCollector = deferred.createStatsCollector();
  gameState = createGame(playerConfigs, statsCollector);
  autoPlayMode = playerConfigs.every(p => !p.isHuman);

  mountGameScreen();
  // AT SETUP, immediately after createGame, so a player interrupted during the
  // very first turn resumes into the opening rather than losing the game
  // entirely. Stated as a rule: the start of the game IS a turn boundary. It is
  // an overwrite rather than a clear, so there is no window in which a started
  // game is unsaved.
  saveNow();
  updateDisplay();

  if (autoPlayMode) {
    autoPlayGame();
  }
}

// The one place the game screen is mounted, so the new game and the resume
// cannot drift apart in what they hand renderGameScreen.
function mountGameScreen() {
  const app = document.getElementById('app');
  renderGameScreen(app, gameState, onMarketClick, onBonusTile, onPlacementSubmit, onClaimSubmit, onSkipClaim, onSkipMove, onMoveTile, onCupcakeClick, {
    onExtraTile,
    onExtraTileToggle,
    onDealCards,
    onReserveCard,
    onRemovePlate,
    onReserveToggle,
  });
  startMotion();
}

// THE RESUME, AND ITS THREE TRAPS, ALL OF WHICH FAIL SILENTLY
//
// 1. window._gameUI.gameState MUST BE THE SAME OBJECT as this module's
//    gameState. A resume that hands renderGameScreen one object while main.js
//    keeps another gives a UI rendering a state nobody is mutating, and nothing
//    throws. mountGameScreen passes the module's own binding, which is why the
//    assignment below happens BEFORE it.
// 2. collector.bindTo(state) OR NO METRICS. metrics() returns null unless
//    collector.owner === gameState (game.js:866-870). Undo gets away with
//    Object.assign into the SAME object, so ownership survives; a resume builds
//    a NEW object, so it has to be bound. It fails by recording nothing rather
//    than by erroring.
// 3. autoPlayGame() MUST BE RESTARTED when the resumed turn belongs to a bot, or
//    the game sits still and looks frozen. It dispatches on gamePhase, so it
//    restarts from any turn boundary without special-casing.
//
// THE FIRST RENDER AFTER A RESUME IS PLAIN, WITH ZERO VIEW TRANSITION NAMES.
// Nothing travels, because there is no previous position for anything to travel
// from; a resume renders the entire game at once, and naming a whole board was
// measured at 456ms of frozen main thread. The threshold rails are painted on
// that first render in their static form.
async function resumeGame(env) {
  if (starting) return;
  starting = true;
  try {
    undoStack.length = 0;
    const deferred = await loadDeferredModules();
    bots = deferred;
    statsCollector = deferred.createStatsCollector();

    gameState = env.state;                       // trap 1: this exact object
    statsCollector.bindTo(gameState);            // trap 2
    gameState.statsCollector = statsCollector;

    autoPlayMode = gameState.players.every(p => !p.isHuman);
    resumedThisGame = true;
    lastSavedTurn = env.turn;

    // Every tile in the game is a new object after a JSON round trip, so the
    // count starts from the truth rather than counting a stale seat up from
    // whatever the last game left, and the log line from before the reload is
    // not a thing that just happened.
    resetCount();
    clearLine();

    mountGameScreen();
    // AFTER the mount, because renderGameScreen does not touch the rail's memory
    // and updateSummaryRail reads it on the first render that follows.
    restoreRailSaveState(env.ui);
    updateDisplay();

    const current = gameState.players[gameState.currentPlayerIndex];
    if (!current.isHuman) autoPlayGame();        // trap 3
  } finally {
    starting = false;
  }
}

// ---------------------------------------------------------------------------
// MOVEMENT ONE, THE GATHER (plan sections 7.1 and 13.1)
// ---------------------------------------------------------------------------
// Tiles travelling from market cells to the swept tray. A VIEW TRANSITION,
// because tiles LEAVE the market - an exit, which FLIP has to clone its way
// around - and because it is the movement the game is named after, so it is the
// one a player is most meant to follow.
//
// FIVE NAMES AT MOST, one per swept tile, plus the phase bar. THE VACATED MARKET
// CELLS ARE DELIBERATELY NOT NAMED: they cross-fade inside the root snapshot for
// nothing, and naming them would double the count to say the same thing twice.
//
// The names are minted BEFORE the mutation, from the engine's own six-line
// matcher, because a name has to be on the live node when the old snapshot is
// taken. Identity is the tile OBJECT, not its data - the bag holds five shallow
// copies of each of twenty-five value objects, so a name derived from
// {colour, ingredient} would collide and a collision drops the whole transition.
function gatherPlan(indices, run) {
  const tiles = indices.map(i => gameState.market[i]).filter(Boolean);
  if (!tiles.length) { run(); return; }
  const snapshot = gameState;
  runTransition({
    kind: 'gather',
    bar: true,
    scrollTo: () => document.getElementById('playerPanel1'),
    travel: tiles.map((tile, k) => ({
      name: tileName(tile),
      old: () => marketCell(indices[k]),
      neu: () => trayTileFor(snapshot, tile),
    })),
    mutate: run,
  });
  // ONE GRAIN OF CHINA PER TILE, at the movement's own stagger. The cue begins
  // when the movement begins - not when it lands - because on Android the buzz
  // and the cue are the same event in two channels and two channels 160ms apart
  // read as two events. The gather has no buzz, so it takes the gate alone.
  if (gatePassed()) playCue('gather', { n: Math.min(5, tiles.length) });
}

function onMarketClick(rowOrCol, isRow, declaration, declarationType) {
  if (gameState.gamePhase !== 'sweep') return;
  const currentPlayer = gameState.players[gameState.currentPlayerIndex];
  if (!currentPlayer.isHuman) return;

  const run = () => {
    try {
      pushUndoSnapshot();
      sweep(gameState, rowOrCol, isRow, declaration, declarationType);
      updateDisplay();

      if (!gameState.bonusTileAvailable) {
        checkAutoAdvance();
      }
    } catch (e) {
      showToast(e.message);
    }
  };

  if (gameState.bonusTileAvailable) { run(); return; }
  gatherPlan(predictSweep(gameState, rowOrCol, isRow, declaration, declarationType), run);
}

function onBonusTile(marketIndex) {
  if (!gameState.bonusTileAvailable) return;
  const currentPlayer = gameState.players[gameState.currentPlayerIndex];
  if (!currentPlayer.isHuman) return;

  const run = () => {
    try {
      pushUndoSnapshot();
      takeBonusTile(gameState, marketIndex);
      updateDisplay();
      checkAutoAdvance();
    } catch (e) {
      showToast(e.message);
    }
  };
  // The free line-clear bonus tile and the paid extra tile are the same movement
  // from a different source, so they are the same cue - the grain count tells one
  // from the other for free.
  gatherPlan([marketIndex], run);
}

function onPlacementSubmit(placements) {
  try {
    pushUndoSnapshot();
    place(gameState, placements);
    updateDisplay();
    checkAutoAdvance();
  } catch (e) {
    showToast(e.message);
  }
}

// ---------------------------------------------------------------------------
// MOVEMENT THREE, THE PLATING (plan sections 7.1 and 13.1)
// ---------------------------------------------------------------------------
// A claim is not one movement. It moves a TILE from your board to a cake-stand
// plate, and it takes a CARD off the row which is never drawn again - claimed
// cards are counted, not rendered.
//
// ONE FLIGHT AND ONE DISSOLVE, and which is which is not arbitrary: A FLIGHT HAS
// TO END SOMEWHERE THE EYE CAN LAND. The tile has a destination the player has
// just chosen, so the tile flies; the card's destination is a number, so the card
// dissolves in place while the score counts up. THE COUNT IS THE CARD'S RECEIPT,
// and it is the reason movement four exists at all.
//
// THREE NAMES. THE CARDS THAT REFLOW ALONG THE ROW ARE NOT NAMED, and that is a
// measurement rather than a preference: naming them makes the row close up rather
// than jump, which is nicer, and it was inside the count budget at ten names -
// but it measured 286ms to `ready` at 4x throttle against 111ms for the same
// claim with three. A card is a sprite crop at device pixel ratio 3, so eight of
// them cost more than twenty-five tiles would. THE BUDGET IS REALLY AREA AND THE
// COUNT IS ITS PROXY: twelve holds for tile-sized things.
//
// This one wrapper catches the whole claim, because the claim's third step goes
// through commitClaimDestination (board.js) with the destination in hand.
function onClaimSubmit(cardId, removedBoardIndex, destination) {
  const run = () => {
    try {
      pushUndoSnapshot();
      claim(gameState, cardId, removedBoardIndex, destination);
      updateDisplay();
      checkAutoAdvance();
    } catch (e) {
      showToast(e.message);
    }
  };

  if (!isHumanTurn(gameState)) { run(); return; }

  const p = gameState.currentPlayerIndex;
  const tile = gameState.players[p].board[removedBoardIndex];
  const isRow = destination && destination.type === 'row';
  const rowIndex = isRow ? destination.rowIndex : null;
  const snapshot = gameState;

  const travel = [];
  if (tile && isRow) {
    travel.push({
      name: tileName(tile),
      old: () => boardCell(p, removedBoardIndex),
      neu: () => standPlate(snapshot, p, rowIndex),
    });
  }

  runTransition({
    kind: 'plate',
    bar: true,
    scrollTo: () => document.getElementById('playerScore1'),
    travel,
    dissolve: [{ name: `ft-card-${cardId}`, old: () => cardEl(cardId) }],
    mutate: run,
  });

  // TWO CHANNELS, ONE EVENT, on the same two lines and through the same gate.
  // TWO CONTACTS in the cue and TWO TICKS in the buzz - `[10, 60, 18]` against
  // the settle's `10` - which is the whole reason an iPhone player can tell a
  // claim from a placement without looking, and an Android player without either.
  if (gatePassed()) { haptic('claim'); playCue('plating'); }
}

function onSkipClaim() {
  try {
    pushUndoSnapshot();
    skipClaim(gameState);
    updateDisplay();
    checkAutoAdvance();
  } catch (e) {
    showToast(e.message);
  }
}

function onSkipMove() {
  try {
    pushUndoSnapshot();
    skipSpend(gameState);
    updateDisplay();
    checkAutoAdvance();
  } catch (e) {
    showToast(e.message);
  }
}

function onMoveTile(fromIndex, toIndex) {
  try {
    pushUndoSnapshot();
    moveTile(gameState, fromIndex, toIndex);
    window._gameUI.cupcakeMode = false;
    updateDisplay();
  } catch (e) {
    console.warn('Move tile failed:', e.message);
  }
}

// SPEND CUPCAKES (REMOVE_PLATE_CUPCAKE_COST): REMOVE AN EMPTY PLATE, to the box. One click on the plate -
// unlike a tile move there is no destination to choose, because the plate leaves
// the game rather than going anywhere on the board.
function onRemovePlate(index) {
  try {
    pushUndoSnapshot();
    removePlate(gameState, index);
    window._gameUI.cupcakeMode = false;
    updateDisplay();
  } catch (e) {
    showToast(e.message);
  }
}

function onCupcakeClick() {
  const currentPlayer = gameState.players[gameState.currentPlayerIndex];
  // Board-spend mode covers TWO actions with separate prices and separate
  // per-turn allowances: move a tile (1) and remove an empty plate (3). Open the
  // mode if either is still available - the engine gates the specific cell.
  const canMoveTile = currentPlayer.cupcakes >= 1 && !gameState.moveUsedThisTurn;
  if (gameState.gamePhase === 'spend' && (canMoveTile || canRemovePlate(gameState))) {
    window._gameUI.cupcakeMode = !window._gameUI.cupcakeMode;
    updateDisplay();
  }
}

// SPEND 1 CUPCAKE: TAKE 1 EXTRA TILE (3 August; deleted 8 August, restored
// 9 August). Offered at the sweep step, once the sweep has resolved and before
// the swept tiles are placed - the bought tile joins them, so the placement UI
// must see it. Reuses the bonus-tile click path.
//
// TWO CLICKS, unlike the deal below: the button ARMS the market, then the player
// picks the tile. extraTileMode is that armed state and board.js clears it the
// moment the purchase stops being legal.
function onExtraTile(marketIndex) {
  if (!canBuyExtraTile(gameState)) return;
  const currentPlayer = gameState.players[gameState.currentPlayerIndex];
  if (!currentPlayer.isHuman) return;
  const run = () => {
    try {
      pushUndoSnapshot();
      takeExtraTile(gameState, marketIndex);
      window._gameUI.extraTileMode = false;
      updateDisplay();
    } catch (e) {
      showToast(e.message);
    }
  };
  // The third site of the gather: one tile, bought, on the same flight as a
  // swept one. It is also the state that used to put 35 infinite animations on
  // the page, and now puts one.
  gatherPlan([marketIndex], run);
}

function onExtraTileToggle() {
  if (!canBuyExtraTile(gameState)) return;
  window._gameUI.extraTileMode = !window._gameUI.extraTileMode;
  updateDisplay();
}

// SPEND 1 CUPCAKE: DEAL 2 NEW CARDS (8 August). Sits at the spend step, one step
// after the extra tile above.
//
// IT NEEDS NO MODE AND NO SECOND CLICK, which is the whole difference between
// the two buttons: the player chooses nothing here, so the button IS the action.
// No armed market, no highlighted targets, nothing to cancel out of.
function onDealCards() {
  if (!canDealCards(gameState)) return;
  const currentPlayer = gameState.players[gameState.currentPlayerIndex];
  if (!currentPlayer.isHuman) return;
  try {
    pushUndoSnapshot();
    dealCards(gameState);
    updateDisplay();
  } catch (e) {
    showToast(e.message);
  }
}

// SPEND 1 CUPCAKE: RESERVE A CARD (3 August). Offered at the spend step on the
// player's own turn. The reserve holds one card, and the card cannot be claimed
// on the turn it was reserved - the engine enforces both.
function onReserveCard(cardId) {
  if (!canReserveCard(gameState)) return;
  const currentPlayer = gameState.players[gameState.currentPlayerIndex];
  if (!currentPlayer.isHuman) return;
  try {
    pushUndoSnapshot();
    reserveCard(gameState, cardId);
    window._gameUI.reserveMode = false;
    updateDisplay();
  } catch (e) {
    showToast(e.message);
  }
}

function onReserveToggle() {
  if (!canReserveCard(gameState)) return;
  window._gameUI.reserveMode = !window._gameUI.reserveMode;
  updateDisplay();
}

// onOrderTea DELETED 1 AUGUST, and the whole TEA RESERVE ROUND deleted 3 August.
//
// A human used to click a button to order a fresh pot at the start of their turn
// (1 August: the engine fires it automatically at the end of the turn instead).
// Every player then took a turn in a clockwise reserve round, which the UI drove
// through onTeaReserve / driveTeaReserves and rendered with its own banner.
//
// None of that exists now. A fresh pot is mechanical and single-player: refill()
// flushes the card row, pays the tea player TEA_POT_REWARD, flushes and redeals
// the tiles, and rotates the turn - all in the one synchronous call. Reserving is
// a PAID action a player takes on their own turn instead (onReserveCard).
//
// Undo was never a concern for a tea round and still is not: confirmTurn clears
// the undo stack before calling refill, so by the time tea fires the turn it
// belongs to is already over.

// A claim phase with nothing claimable is a dead stop for a human: the only
// control is "Skip Claim", which does nothing but reveal "Confirm Turn". Skip it
// on their behalf so the turn ends in one click instead of two. No undo snapshot
// is pushed here - the snapshot taken when the player left the move phase already
// covers this step, so undo rewinds past the auto-skip rather than back onto it.
function autoSkipEmptyClaim() {
  if (gameState.gamePhase !== 'claim') return;
  const currentPlayer = gameState.players[gameState.currentPlayerIndex];
  if (!currentPlayer.isHuman) return;

  // canClaimMore is unconditionally true since 6 August (empty plates are
  // unlimited), so in practice this is now just "is anything claimable". The call
  // is kept as the engine's hook for a future claim limit - see canClaimMore.
  const cards = [...gameState.cardMarket, ...currentPlayer.reservedCards];
  const anyMatch = canClaimMore(gameState)
    && cards.some(card => getPatternMatches(currentPlayer.board, card.pattern).length > 0);
  if (anyMatch) return;

  skipClaim(gameState);
}

function checkAutoAdvance() {
  autoSkipEmptyClaim();

  if (gameState.gamePhase === 'refill') {
    const currentPlayer = gameState.players[gameState.currentPlayerIndex];
    if (currentPlayer.isHuman) {
      // Don't auto-advance — show Confirm Turn button instead
      updateDisplay();
      return;
    }
    // AI player: auto-advance as before. refill() may brew a pot of tea on the
    // way out; that is mechanical now, so it needs no handling here.
    refill(gameState);
    updateDisplay();
    if (gameState.gameOver) {
      onGameEnd();
    } else {
      setTimeout(() => {
        const nextPlayer = gameState.players[gameState.currentPlayerIndex];
        if (!nextPlayer.isHuman) {
          autoPlayGame();
        }
      }, 500);
    }
  }
}

async function autoPlayGame() {
  console.log('autoPlayGame started, autoPlayMode:', autoPlayMode);
  while (!gameState.gameOver) {
    const currentPlayer = gameState.players[gameState.currentPlayerIndex];
    console.log(`Turn: Player ${currentPlayer.id} (${currentPlayer.name}), Phase: ${gameState.gamePhase}`);

    if (!currentPlayer.isHuman) {
      try {
        const isMCTS = currentPlayer.aiDifficulty && currentPlayer.aiDifficulty.startsWith('mcts');
        const bot = isMCTS ? bots.mctsBot : bots.basicBot;

        if (gameState.gamePhase === 'sweep') {
          if (gameState.bonusTileAvailable) {
            setThinkingState(currentPlayer.name, true);
            updateDisplay();
            const bonusTileIndex = await bot.decideBonusTile(gameState, currentPlayer.aiDifficulty);
            setThinkingState(currentPlayer.name, false);
            updateDisplay();

            if (bonusTileIndex !== null) {
              takeBonusTile(gameState, bonusTileIndex);
            } else {
              // Decline the bonus and move to the placement step. (It used to be
              // able to trigger the board-overflow ending here; that ending is
              // deleted - see the placement branch below.)
              declineBonusTile(gameState);
            }
          } else {
            setThinkingState(currentPlayer.name, true);
            updateDisplay();
            const progressCallback = (progress) => setThinkingProgress(currentPlayer.name, progress);
            const sweepMove = await bot.decideSweep(gameState, currentPlayer.aiDifficulty, progressCallback);
            setThinkingState(currentPlayer.name, false);
            updateDisplay();

            if (!sweepMove) {
              // No valid sweeps - game should be over, but end it just in case
              gameState.gameOver = true;
              break;
            }
            sweep(gameState, sweepMove.rowOrCol, sweepMove.isRow, sweepMove.declaration, sweepMove.declarationType);
          }
        } else if (gameState.gamePhase === 'place') {
          // A sweep bigger than the board is legal since 6 August, and the bot's
          // decidePlacements says so: it returns a null for every tile that will
          // not fit, and place() sends those back into the bag. (This used to say
          // the engine had already resolved an overflow before the phase was
          // reached, because an overflow ended the game.)
          setThinkingState(currentPlayer.name, true);
          updateDisplay();
          // Buy an extra tile FIRST: it is a sweep-step option and the tile it
          // buys is placed with the swept tiles, so the placement decision has to
          // see it. (Deleted 8 August, restored 9 August; the paid 2-card deal is
          // a spend-step action and is taken in the 'spend' branch below.)
          //
          // A LOOP SINCE 9 AUGUST (second revision): the extra tile is uncapped,
          // so the bot is asked again after each purchase and stops when it
          // answers null. The engine's purse and free-cell gates are what end it;
          // the counter here is a runaway stop only.
          let botExtraTiles = 0;
          while (botExtraTiles < 25) {
            const extraIndex = bot.decideExtraTile ? bot.decideExtraTile(gameState) : null;
            if (extraIndex === null || extraIndex === undefined) break;
            takeExtraTile(gameState, extraIndex);
            botExtraTiles++;
          }
          const placements = await bot.decidePlacements(gameState, currentPlayer.aiDifficulty);
          setThinkingState(currentPlayer.name, false);
          updateDisplay();

          place(gameState, placements);
        } else if (gameState.gamePhase === 'spend') {
          // Cupcake move: relocate one tile (1) if it completes a card we could
          // not otherwise claim this turn.
          const moveDecision = bot.decideMove ? await bot.decideMove(gameState, currentPlayer.aiDifficulty) : null;
          if (moveDecision) {
            moveTile(gameState, moveDecision.fromIndex, moveDecision.toIndex);
          }
          // Remove an empty plate to the box (3) - a separate allowance from the
          // move, so both can happen on the same turn.
          const plateIndex = bot.decideRemovePlate ? await bot.decideRemovePlate(gameState, currentPlayer.aiDifficulty) : null;
          if (plateIndex !== null && plateIndex !== undefined) {
            removePlate(gameState, plateIndex);
          }
          // Paid 2-card deal (8 August): 1 cupcake for 2 new cards on the row,
          // resolved before the reserve and before the claim step so both can act
          // on what it turns up.
          if (bot.decideDealCards && bot.decideDealCards(gameState)) {
            dealCards(gameState);
          }
          // Paid reserve: 1 cupcake for a market card, not claimable this turn.
          const reserveId = bot.decideReserve ? bot.decideReserve(gameState) : null;
          if (reserveId !== null && reserveId !== undefined) {
            reserveCard(gameState, reserveId);
          }
          skipSpend(gameState);
        } else if (gameState.gamePhase === 'claim') {
          setThinkingState(currentPlayer.name, true);
          updateDisplay();
          const claimDecision = await bot.decideClaim(gameState, currentPlayer.aiDifficulty);
          setThinkingState(currentPlayer.name, false);
          updateDisplay();

          if (claimDecision) {
            claim(gameState, claimDecision.cardId, claimDecision.removedBoardIndex, claimDecision.destination);
          } else {
            skipClaim(gameState);
          }
        } else if (gameState.gamePhase === 'refill') {
          refill(gameState);
        }

        updateDisplay();

        if (gameState.gameOver) {
          onGameEnd();
          break;
        }
      } catch (e) {
        console.error('AI error:', e);
        gameState.gameOver = true;
        break;
      }

      await new Promise(r => setTimeout(r, 500));
    } else {
      // Handing control back to a human. Nothing can be left owed here since
      // 3 August: a pot of tea resolves inside refill() rather than opening an
      // interactive round a human might still owe a decision to.
      break;
    }
  }
}

function updateDisplay() {
  if (window._gameUI) {
    window._gameUI.canUndo = undoStack.length > 0;
    window._gameUI.onUndo = undoAction;
    window._gameUI.onConfirmTurn = confirmTurn;
  }
  updateGameDisplay(gameState);
  // AFTER the render returns. See maybeSave.
  maybeSave();
}

function onGameEnd() {
  // A FINISHED GAME IS NOT A GAME IN PROGRESS, and a player who closes the tab on
  // the end screen must not be dragged back into it. Cleared BEFORE the end
  // screen renders, so there is no frame in which a finished game is resumable.
  clearSave();
  const app = document.getElementById('app');
  const gameStats = statsCollector?.getReport() || {};
  renderEndScreen(
    app,
    gameState,
    () => init(),
    () => init(),
    gameStats,
    // THE ONE SENTENCE A RESUMED GAME OWES THE PLAYER (plan section 10, decision
    // 2). The collector is not saved - rehydrating a data blob onto a fresh one
    // is exactly the half-load a save is written against - so eight of the nine
    // stat boxes cover play since the resume and one of them, Turns Played, is
    // engine state and covers the whole game. The result table above them is
    // computed from engine state and is unaffected.
    { resumed: resumedThisGame }
  );
}

// ---------------------------------------------------------------------------
// WHAT MUST NEVER ANIMATE, and it is the half of the list that is JavaScript
// ---------------------------------------------------------------------------
// Eight handlers in this file are deliberately NOT wrapped, and this comment is
// the record of that rather than an oversight:
//
//   onUndo            snapshotGameState round-trips through JSON, so after an
//                     undo every tile object is new and every name would change
//                     at once: an animated undo reads as "the whole board was
//                     replaced". An undo should snap.
//   onConfirmTurn     a fresh pot of tea returns up to 25 market tiles to the
//                     bag, deals 25 more and cuts the card row back to three -
//                     about 58 elements at a turn boundary, more than twice the
//                     budget. IT IS ONE GESTURE, NOT 58 FLIGHTS: the market
//                     cross-fades as a block inside the root snapshot, for zero
//                     names. It is also where the save is written.
//   onPlacementSubmit a batch commit, and not where a placement is seen. The
//                     visible moment is commitPlacement in board.js.
//   onSkipClaim,      nothing travels and nothing is worth a sound: a step that
//   onSkipMove        was skipped is not an event.
//   onDealCards,      the row changes under the player's own tap and the change
//   onReserveCard,    is the picture. A cue here would be a fifth cue, and the
//   onRemovePlate     vocabulary has four.
//
// And the tap-back is silent BY CONSTRUCTION rather than by rule: unplaceTile
// deletes a key from ui.placementMap rather than setting one, and the settle
// watches for a key being added.

armAudioUnlock();

// THE COUNT'S OWN CUE, registered rather than imported, because motion does not
// depend on sound. A TONE, NOT AN OBJECT - nothing travels during a count, so
// nothing is struck - and it sounds only for YOUR score and only as a claim's
// receipt. Every other score change in the game counts up in silence, including
// all four seats at the end and every point a bot ever scores.
setCountListener((seat, delta, ms) => {
  if (seat !== 0 || delta <= 0) return;
  if (!isHumanTurn(gameState)) return;
  playCue('count', { ms });
});

init();
