import { createGame, sweep, takeBonusTile, place, claim, skipClaim, refill, moveTile, getValidSweeps, getValidPlacements, getPatternMatches, REWARD_CARDS, BOARD_SIZE } from '../engine/game.js';
import { createStatsCollector } from '../engine/statsCollector.js';
import { renderSetupScreen, renderGameScreen, updateGameDisplay, setThinkingState, renderEndScreen } from './board.js';
import * as basicBot from '../bots/basicBot.js';
import * as mctsBot from '../bots/mctsBot.js';

let gameState = null;
let statsCollector = null;
let autoPlayMode = false;
let lastPlayerIndex = -1;

function init() {
  const app = document.getElementById('app');
  renderSetupScreen(app, onGameStart);
}

function onGameStart(playerConfigs) {
  statsCollector = createStatsCollector();
  gameState = createGame(playerConfigs, statsCollector);
  autoPlayMode = playerConfigs.every(p => !p.isHuman);

  const app = document.getElementById('app');
  renderGameScreen(app, gameState, onMarketClick, onBonusTile, onPlacementSubmit, onClaimSubmit, onSkipClaim, onMoveTile, onCupcakeClick);

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
    takeBonusTile(gameState, marketIndex);
    updateDisplay();
    checkAutoAdvance();
  } catch (e) {
    alert(e.message);
  }
}

function onPlacementSubmit(placements) {
  try {
    place(gameState, placements);
    updateDisplay();
    checkAutoAdvance();
  } catch (e) {
    alert(e.message);
  }
}

function onClaimSubmit(cardId, removedBoardIndex) {
  try {
    claim(gameState, cardId, removedBoardIndex);
    updateDisplay();
    checkAutoAdvance();
  } catch (e) {
    alert(e.message);
  }
}

function onSkipClaim() {
  try {
    skipClaim(gameState);
    updateDisplay();
    checkAutoAdvance();
  } catch (e) {
    alert(e.message);
  }
}

function onMoveTile(fromIndex, toIndex) {
  try {
    moveTile(gameState, fromIndex, toIndex);
    window._gameUI.cupcakeMode = false;
    updateDisplay();
  } catch (e) {
    console.warn('Move tile failed:', e.message);
  }
}

function onCupcakeClick() {
  const currentPlayer = gameState.players[gameState.currentPlayerIndex];
  if (currentPlayer.cupcakes > 0 && ['sweep', 'place', 'claim'].includes(gameState.gamePhase)) {
    window._gameUI.cupcakeMode = !window._gameUI.cupcakeMode;
    updateDisplay();
  }
}

function checkAutoAdvance() {
  if (gameState.gamePhase === 'refill') {
    refill(gameState);
    updateDisplay();

    if (gameState.gameOver) {
      onGameEnd();
    } else {
      // Check if next player is AI and let them play
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
              // Skip bonus and move to place phase
              gameState.bonusTileAvailable = false;
              gameState.gamePhase = 'place';
            }
          } else {
            setThinkingState(currentPlayer.name, true);
            updateDisplay();
            const sweepMove = await bot.decideSweep(gameState, currentPlayer.aiDifficulty);
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
          const emptyCount = getValidPlacements(currentPlayer.board).length;

          // Check for board overflow - if not enough space, discard remaining tiles and move to refill
          if (gameState.pendingSweepTiles.length > emptyCount) {
            gameState.endGameReason = 'boardOverflow';
            gameState.remainingTurnsInEndGame = gameState.players.length - 1;
            gameState.pendingSweepTiles = [];
            gameState.gamePhase = 'refill';
          } else {
            setThinkingState(currentPlayer.name, true);
            updateDisplay();
            const placements = await bot.decidePlacements(gameState, currentPlayer.aiDifficulty);
            setThinkingState(currentPlayer.name, false);
            updateDisplay();

            place(gameState, placements);
          }
        } else if (gameState.gamePhase === 'claim') {
          setThinkingState(currentPlayer.name, true);
          updateDisplay();
          const claimDecision = await bot.decideClaim(gameState, currentPlayer.aiDifficulty);
          setThinkingState(currentPlayer.name, false);
          updateDisplay();

          if (claimDecision) {
            claim(gameState, claimDecision.cardId, claimDecision.removedBoardIndex);
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
