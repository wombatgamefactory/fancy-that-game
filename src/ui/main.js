import { createGame, sweep, takeBonusTile, declineBonusTile, place, claim, skipClaim, skipMove, refill, moveTile, getValidSweeps, getValidPlacements, getPatternMatches, REWARD_CARDS, BOARD_SIZE } from '../engine/game.js';
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
  renderGameScreen(app, gameState, onMarketClick, onBonusTile, onPlacementSubmit, onClaimSubmit, onSkipClaim, onSkipMove, onMoveTile, onCupcakeClick);

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
