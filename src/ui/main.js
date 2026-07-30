import { createGame, sweep, takeBonusTile, declineBonusTile, place, claim, skipClaim, skipMove, refill, moveTile, orderTea, teaReserve, teaReserveMustPass, getValidSweeps, getValidPlacements, getPatternMatches, REWARD_CARDS, BOARD_SIZE } from '../engine/game.js';
import { createStatsCollector } from '../engine/statsCollector.js';
import { renderSetupScreen, renderGameScreen, updateGameDisplay, setThinkingState, setThinkingProgress, renderEndScreen } from './board.js';
import * as basicBot from '../bots/basicBot.js';
import * as mctsBot from '../bots/mctsBot.js';

let gameState = null;
let statsCollector = null;
let autoPlayMode = false;
let lastPlayerIndex = -1;
let undoStack = [];

function init() {
  const app = document.getElementById('app');
  renderSetupScreen(app, onGameStart);
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
  }
  updateDisplay();
}

function confirmTurn() {
  undoStack.length = 0;
  refill(gameState);
  updateDisplay();
  if (gameState.gameOver) {
    onGameEnd();
  } else if (gameState.gamePhase === 'teaReserve') {
    // Rotating the turn can start it mid tea round: an empty tile market forces
    // a mandatory refresh (see the engine's empty-market rule). driveTeaReserves
    // owns the whole round and resumes bot autoplay itself afterwards.
    driveTeaReserves();
  } else {
    setTimeout(() => {
      const nextPlayer = gameState.players[gameState.currentPlayerIndex];
      if (!nextPlayer.isHuman) {
        autoPlayGame();
      }
    }, 500);
  }
}

function onGameStart(playerConfigs) {
  undoStack.length = 0;
  statsCollector = createStatsCollector();
  gameState = createGame(playerConfigs, statsCollector);
  autoPlayMode = playerConfigs.every(p => !p.isHuman);

  const app = document.getElementById('app');
  renderGameScreen(app, gameState, onMarketClick, onBonusTile, onPlacementSubmit, onClaimSubmit, onSkipClaim, onSkipMove, onMoveTile, onCupcakeClick, onOrderTea, onTeaReserve);

  updateDisplay();

  if (autoPlayMode) {
    autoPlayGame();
  }
}

function onMarketClick(rowOrCol, isRow, declaration, declarationType) {
  if (gameState.gamePhase !== 'sweep') return;
  const currentPlayer = gameState.players[gameState.currentPlayerIndex];
  if (!currentPlayer.isHuman) return;

  try {
    pushUndoSnapshot();
    sweep(gameState, rowOrCol, isRow, declaration, declarationType);
    updateDisplay();

    if (!gameState.bonusTileAvailable) {
      checkAutoAdvance();
    }
  } catch (e) {
    alert(e.message);
  }
}

function onBonusTile(marketIndex) {
  if (!gameState.bonusTileAvailable) return;
  const currentPlayer = gameState.players[gameState.currentPlayerIndex];
  if (!currentPlayer.isHuman) return;

  try {
    pushUndoSnapshot();
    takeBonusTile(gameState, marketIndex);
    updateDisplay();
    checkAutoAdvance();
  } catch (e) {
    alert(e.message);
  }
}

function onPlacementSubmit(placements) {
  try {
    pushUndoSnapshot();
    place(gameState, placements);
    updateDisplay();
    checkAutoAdvance();
  } catch (e) {
    alert(e.message);
  }
}

function onClaimSubmit(cardId, removedBoardIndex, destination) {
  try {
    pushUndoSnapshot();
    claim(gameState, cardId, removedBoardIndex, destination);
    updateDisplay();
    checkAutoAdvance();
  } catch (e) {
    alert(e.message);
  }
}

function onSkipClaim() {
  try {
    pushUndoSnapshot();
    skipClaim(gameState);
    updateDisplay();
    checkAutoAdvance();
  } catch (e) {
    alert(e.message);
  }
}

function onSkipMove() {
  try {
    pushUndoSnapshot();
    skipMove(gameState);
    updateDisplay();
    checkAutoAdvance();
  } catch (e) {
    alert(e.message);
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

function onCupcakeClick() {
  const currentPlayer = gameState.players[gameState.currentPlayerIndex];
  if (currentPlayer.cupcakes > 0 && gameState.gamePhase === 'move' && !gameState.cupcakesUsedThisTurn) {
    window._gameUI.cupcakeMode = !window._gameUI.cupcakeMode;
    updateDisplay();
  }
}

// Human player orders a fresh pot of tea at the start of their turn (they still
// take their full turn afterwards, and may order another on a later turn — there
// is no per-game limit). This is the ONLY place a tea round pushes an undo
// snapshot — undo then rewinds the entire round (every player's reserve, the card
// flush, the cupcake pot, the full tile flush) in one step. Individual reserve
// steps in driveTeaReserves deliberately do NOT snapshot. A MANDATORY refresh
// never comes through here: the engine opens that round itself during the turn
// rotation, and confirmTurn/checkAutoAdvance/autoPlayGame drive it.
function onOrderTea() {
  const currentPlayer = gameState.players[gameState.currentPlayerIndex];
  if (gameState.gamePhase !== 'sweep' || !currentPlayer.isHuman || gameState.bonusTileAvailable) return;

  try {
    pushUndoSnapshot();
    orderTea(gameState);
    updateDisplay();
    driveTeaReserves();
  } catch (e) {
    alert(e.message);
  }
}

// A human reserver resolves their tea-round decision: cardId to take a market
// card into their reserve, or null to pass ("No, thank you"). The deciding
// player is gameState.teaReserverIndex, NOT necessarily the current player
// (hotseat: someone may act on the flusher's turn). No snapshot here — the whole
// round is covered by the single snapshot taken in onOrderTea.
function onTeaReserve(cardId) {
  if (gameState.gamePhase !== 'teaReserve') return;
  const reserver = gameState.players[gameState.teaReserverIndex];
  if (!reserver.isHuman) return;

  try {
    teaReserve(gameState, cardId);
    updateDisplay();
    driveTeaReserves();
  } catch (e) {
    alert(e.message);
  }
}

// Resolve tea-round reserve decisions in clockwise order. Bots decide via their
// decideTeaReserve heuristic (with the usual thinking affordance + ~500ms pacing);
// a human who is forced to pass (reserve full or empty market) is auto-passed
// without a click. The loop stops when a human reserver who CAN act is reached
// (the banner/market UI then waits for onTeaReserve) or when the round ends. On
// completion the phase is 'sweep' for the tea player, who now takes their FULL
// normal turn (tea no longer replaces the sweep); if that player is a bot the
// normal autoplay loop is resumed.
async function driveTeaReserves() {
  while (gameState.gamePhase === 'teaReserve') {
    const reserver = gameState.players[gameState.teaReserverIndex];

    if (reserver.isHuman) {
      if (teaReserveMustPass(gameState)) {
        // Forced pass — no card can be taken, so resolve it without a click.
        teaReserve(gameState, null);
        updateDisplay();
        continue;
      }
      // A human with a real choice: hand control to the UI and wait.
      return;
    }

    // Bot reserver.
    const isMCTS = reserver.aiDifficulty && reserver.aiDifficulty.startsWith('mcts');
    const bot = isMCTS ? mctsBot : basicBot;
    setThinkingState(reserver.name, true);
    updateDisplay();
    await new Promise(r => setTimeout(r, 500));

    let cardId = null;
    if (!teaReserveMustPass(gameState)) {
      cardId = bot.decideTeaReserve ? bot.decideTeaReserve(gameState, gameState.teaReserverIndex) : null;
    }
    teaReserve(gameState, cardId);
    setThinkingState(reserver.name, false);
    updateDisplay();
  }

  // Round finished (gamePhase is now 'sweep' — the tea player takes their full
  // turn). If that player is a bot, keep the all-bot / bot-turn autoplay going; a
  // human just resumes their turn. Their tea button is disabled now not because
  // tea is spent (there is no per-game limit any more) but because the flush has
  // just covered every teapot symbol, so canOrderTea is false again.
  if (!gameState.gameOver) {
    const currentPlayer = gameState.players[gameState.currentPlayerIndex];
    if (!currentPlayer.isHuman) {
      autoPlayGame();
    }
  }
}

function checkAutoAdvance() {
  if (gameState.gamePhase === 'refill') {
    const currentPlayer = gameState.players[gameState.currentPlayerIndex];
    if (currentPlayer.isHuman) {
      // Don't auto-advance — show Confirm Turn button instead
      updateDisplay();
      return;
    }
    // AI player: auto-advance as before
    refill(gameState);
    updateDisplay();
    if (gameState.gameOver) {
      onGameEnd();
    } else if (gameState.gamePhase === 'teaReserve') {
      // Mandatory refresh forced by an empty tile market — same handling as in
      // confirmTurn: driveTeaReserves runs the round and resumes autoplay.
      driveTeaReserves();
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
        const bot = isMCTS ? mctsBot : basicBot;

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
              // Decline the bonus and move to place (may trigger board overflow).
              declineBonusTile(gameState);
            }
          } else if (bot.decideOrderTea?.(gameState)) {
            // Same driver contract as simulate.js: offer a fresh pot of tea
            // before sweeping. orderTea moves us into the teaReserve phase, which
            // the branch below (and driveTeaReserves) resolves.
            orderTea(gameState);
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
        } else if (gameState.gamePhase === 'teaReserve') {
          // Reservers are keyed on teaReserverIndex, not currentPlayerIndex, and
          // may include hotseat humans — driveTeaReserves owns the whole round and
          // resumes autoplay itself when the flusher (a bot here) regains control.
          await driveTeaReserves();
          return;
        } else if (gameState.gamePhase === 'place') {
          // Board overflow is handled by the engine at the transition into this
          // phase (checkBoardOverflowOnPlace), so any state seen here is placeable.
          setThinkingState(currentPlayer.name, true);
          updateDisplay();
          const placements = await bot.decidePlacements(gameState, currentPlayer.aiDifficulty);
          setThinkingState(currentPlayer.name, false);
          updateDisplay();

          place(gameState, placements);
        } else if (gameState.gamePhase === 'move') {
          // Cupcake move: relocate one tile if it completes a card we could
          // not otherwise claim this turn.
          const moveDecision = bot.decideMove ? await bot.decideMove(gameState, currentPlayer.aiDifficulty) : null;
          if (moveDecision) {
            moveTile(gameState, moveDecision.fromIndex, moveDecision.toIndex);
          }
          skipMove(gameState);
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
      // Handing control back to a human. Their turn may already have been forced
      // into a mandatory refresh (empty tile market) by the turn rotation, in
      // which case the reserve round must be driven rather than dropped.
      if (gameState.gamePhase === 'teaReserve') driveTeaReserves();
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
}

function onGameEnd() {
  const app = document.getElementById('app');
  const gameStats = statsCollector?.getReport() || {};
  renderEndScreen(
    app,
    gameState,
    () => init(),
    () => init(),
    gameStats
  );
}

init();
