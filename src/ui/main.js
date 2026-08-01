import { createGame, sweep, takeBonusTile, declineBonusTile, place, claim, skipClaim, skipMove, refill, moveTile, teaReserve, teaReserveMustPass, getValidSweeps, getValidPlacements, getPatternMatches, REWARD_CARDS, BOARD_SIZE } from '../engine/game.js';
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
    // Ending the turn with four teapots showing forces a fresh pot of tea
    // (1 August rule) - refill() opens the reserve round and leaves the rotation
    // owed. driveTeaReserves owns the whole round, passes the turn on, and
    // resumes bot autoplay itself afterwards.
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
  renderGameScreen(app, gameState, onMarketClick, onBonusTile, onPlacementSubmit, onClaimSubmit, onSkipClaim, onSkipMove, onMoveTile, onCupcakeClick, onTeaReserve);

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

// onOrderTea DELETED 1 AUGUST. A human used to click a button to order a fresh
// pot at the start of their turn; it was also the one place a tea round pushed an
// undo snapshot, so undo rewound the whole round in a step. Neither is needed
// now: the engine opens every tea round itself, from inside refill(), and
// confirmTurn / checkAutoAdvance / autoPlayGame all drive it. Undo is not a
// concern either, because confirmTurn clears the undo stack before calling
// refill - by the time tea fires, the turn it belongs to is already over.

// A human reserver resolves their tea-round decision: cardId to take a market
// card into their reserve, or null to pass ("No, thank you"). The deciding
// player is gameState.teaReserverIndex, NOT necessarily the current player
// (hotseat: someone may act on the tea player's turn). No snapshot here — a tea
// round is never undoable, see above.
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
// a human who is forced to pass (empty card market — the only forced pass left
// now that a reserve is uncapped) is auto-passed without a click. The loop stops when a human reserver who CAN act is reached
// (the banner/market UI then waits for onTeaReserve) or when the round ends.
//
// WHAT THE GAME LOOKS LIKE WHEN THE ROUND ENDS (1 August). The normal route fires
// at the END of a turn, so finishTeaRound passes the turn on: currentPlayerIndex
// is the NEXT player and the phase is 'sweep'. That rotation runs the two
// turn-boundary end conditions, so the round CAN end the game - hence the
// gameOver check below, which the old start-of-turn round never needed.
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

  // Round finished. The turn has rotated, so gameState.currentPlayerIndex is now
  // the INCOMING player, sitting in front of a freshly dealt 25-tile market with
  // every teapot symbol covered again.
  if (gameState.gameOver) {
    // The rotation inside finishTeaRound hit a turn-boundary end condition (a
    // full personal board, or a flush that drained the last of the bag).
    onGameEnd();
    return;
  }
  const currentPlayer = gameState.players[gameState.currentPlayerIndex];
  if (!currentPlayer.isHuman) {
    autoPlayGame();
  }
}

// A claim phase with nothing claimable is a dead stop for a human: the only
// control is "Skip Claim", which does nothing but reveal "Confirm Turn". Skip it
// on their behalf so the turn ends in one click instead of two. No undo snapshot
// is pushed here - the snapshot taken when the player left the move phase already
// covers this step, so undo rewinds past the auto-skip rather than back onto it.
function autoSkipEmptyClaim() {
  if (gameState.gamePhase !== 'claim') return;
  const currentPlayer = gameState.players[gameState.currentPlayerIndex];
  if (!currentPlayer.isHuman) return;

  const cards = [...gameState.cardMarket, ...currentPlayer.reservedCards];
  const anyMatch = cards.some(card => getPatternMatches(currentPlayer.board, card.pattern).length > 0);
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
    // AI player: auto-advance as before
    refill(gameState);
    updateDisplay();
    if (gameState.gameOver) {
      onGameEnd();
    } else if (gameState.gamePhase === 'teaReserve') {
      // The turn ended with four teapots showing — same handling as in
      // confirmTurn: driveTeaReserves runs the round, passes the turn on and
      // resumes autoplay (or ends the game).
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
          // resumes autoplay itself once the turn has passed on.
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
      // Handing control back to a human. A tea round may still be open (the
      // reserve round runs clockwise, so a human can owe a decision on a bot's
      // tea), in which case it must be driven rather than dropped.
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
