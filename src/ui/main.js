import { createGame, sweep, place } from '../engine/game.js';
import { renderSetupScreen, renderGameScreen, updateGameDisplay } from './board.js';
import { makeRandomMove } from '../bots/randomBot.js';

let gameState = null;
let autoPlayMode = false;

// Initialize: show setup screen
function init() {
  const app = document.getElementById('app');
  renderSetupScreen(app, onGameStart);
}

// Game start callback
function onGameStart(playerConfigs) {
  gameState = createGame(playerConfigs);
  autoPlayMode = playerConfigs.every(p => !p.isHuman);

  const app = document.getElementById('app');
  renderGameScreen(app, gameState, onMarketClick, onPlacementSubmit, onGameEnd);

  updateDisplay();

  // Auto-play AI if no humans
  if (autoPlayMode) {
    autoPlayGame();
  }
}

// Handle market tile click (sweep phase)
function onMarketClick(marketIndex) {
  if (gameState.gamePhase !== 'sweep') return;
  const currentPlayer = gameState.players[gameState.currentPlayerIndex];
  if (currentPlayer.isHuman && gameState.gamePhase === 'sweep') {
    try {
      sweep(gameState, marketIndex);
      updateDisplay();
    } catch (e) {
      alert(e.message);
    }
  }
}

// Handle placement submission
function onPlacementSubmit(placements) {
  try {
    place(gameState, placements);
    updateDisplay();

    if (gameState.gameOver) {
      onGameEnd();
    } else if (autoPlayMode) {
      autoPlayGame();
    }
  } catch (e) {
    alert(e.message);
  }
}

// Auto-play moves for AI players
async function autoPlayGame() {
  while (!gameState.gameOver && gameState.players.every(p => !p.isHuman)) {
    const currentPlayer = gameState.players[gameState.currentPlayerIndex];

    if (gameState.gamePhase === 'sweep') {
      // AI chooses a market tile to sweep
      const availableTiles = gameState.market
        .map((tile, idx) => tile ? idx : null)
        .filter(idx => idx !== null);

      if (availableTiles.length > 0) {
        const marketIndex = availableTiles[Math.floor(Math.random() * availableTiles.length)];
        sweep(gameState, marketIndex);
      } else {
        // No tiles in market - end game
        gameState.gameOver = true;
        break;
      }
    } else if (gameState.gamePhase === 'place') {
      // AI chooses placement for selected tiles
      const placements = makeRandomMove(currentPlayer.board, gameState.selectedTiles.length);
      place(gameState, placements);
    }

    updateDisplay();
    await new Promise(r => setTimeout(r, 500)); // Pause for visibility
  }

  if (gameState.gameOver) {
    onGameEnd();
  }
}

// Update display
function updateDisplay() {
  updateGameDisplay(gameState);
}

// Game end callback
function onGameEnd() {
  const stats = {
    turnsPlayed: gameState.stats.turnsPlayed,
    scores: gameState.players.map(p => ({
      name: p.name,
      score: p.score,
      cardsWon: p.claimedCards.length,
      tracks: p.ingredientTracks,
    })),
  };

  console.log('Game Over!', stats);
  alert(`Game Over!\n\nWinner: ${gameState.players.reduce((a, b) => a.score > b.score ? a : b).name}\n\nStats: ${JSON.stringify(stats, null, 2)}`);
}

// Start the app
init();
