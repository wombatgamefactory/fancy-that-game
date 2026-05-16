import { createGame, sweep, takeBonusTile, place, claim, skipClaim, refill, getValidSweeps, getPatternMatches, REWARD_CARDS, BOARD_SIZE } from '../engine/game.js';
import { renderSetupScreen, renderGameScreen, updateGameDisplay } from './board.js';
import { decideSweep, decideBonusTile, decidePlacements, decideClaim } from '../bots/basicBot.js';

let gameState = null;
let autoPlayMode = false;

function init() {
  const app = document.getElementById('app');
  renderSetupScreen(app, onGameStart);
}

function onGameStart(playerConfigs) {
  gameState = createGame(playerConfigs);
  autoPlayMode = playerConfigs.every(p => !p.isHuman);

  const app = document.getElementById('app');
  renderGameScreen(app, gameState, onMarketClick, onBonusTile, onPlacementSubmit, onClaimSubmit, onSkipClaim);

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

function checkAutoAdvance() {
  if (gameState.gamePhase === 'refill') {
    refill(gameState);
    updateDisplay();

    if (gameState.gameOver) {
      onGameEnd();
    } else if (autoPlayMode) {
      setTimeout(() => autoPlayGame(), 500);
    }
  }
}

async function autoPlayGame() {
  while (!gameState.gameOver) {
    const currentPlayer = gameState.players[gameState.currentPlayerIndex];

    if (!currentPlayer.isHuman) {
      try {
        if (gameState.gamePhase === 'sweep') {
          if (gameState.bonusTileAvailable) {
            const bonusTileIndex = decideBonusTile(gameState);
            if (bonusTileIndex !== null) {
              takeBonusTile(gameState, bonusTileIndex);
            }
          } else {
            const sweepMove = decideSweep(gameState);
            if (sweepMove) {
              sweep(gameState, sweepMove.rowOrCol, sweepMove.isRow, sweepMove.declaration, sweepMove.declarationType);
            }
          }
        } else if (gameState.gamePhase === 'place') {
          const placements = decidePlacements(gameState);
          place(gameState, placements);
        } else if (gameState.gamePhase === 'claim') {
          const claimDecision = decideClaim(gameState);
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
  const winner = gameState.players.reduce((a, b) => a.score > b.score ? a : b);
  const stats = {
    turnsPlayed: gameState.stats.turnsPlayed,
    scores: gameState.players.map(p => ({
      name: p.name,
      score: p.score,
      cardsWon: p.claimedCards.length,
      scoringPile: p.scoringPile.length,
    })),
  };

  console.log('Game Over!', stats);
  alert(`Game Over!\n\nWinner: ${winner.name} with ${winner.score} points\n\nScores: ${gameState.players.map(p => `${p.name}: ${p.score}`).join(', ')}`);
}

init();
