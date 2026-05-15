// UI Rendering for Fancy That!

export function renderSetupScreen(container, onStart) {
  container.innerHTML = `
    <div style="max-width: 600px; margin: 40px auto; font-family: Arial, sans-serif;">
      <h1>Fancy That! Board Game</h1>
      <p>Configure your game:</p>

      <div style="margin: 20px 0;">
        <label>Number of Players (2-4):
          <select id="playerCount" style="margin-left: 10px;">
            <option value="2">2 Players</option>
            <option value="3">3 Players</option>
            <option value="4" selected>4 Players</option>
          </select>
        </label>
      </div>

      <div id="playerSetup" style="margin: 20px 0;">
        <!-- Dynamically populated -->
      </div>

      <button id="startButton" style="padding: 10px 20px; font-size: 16px; cursor: pointer;">Start Game</button>
    </div>
  `;

  const playerCount = document.getElementById('playerCount');
  const playerSetup = document.getElementById('playerSetup');
  const startButton = document.getElementById('startButton');

  function updatePlayerSetup() {
    const count = parseInt(playerCount.value);
    let html = '';
    for (let i = 0; i < count; i++) {
      const isPlayer1 = i === 0;
      const defaultType = isPlayer1 ? 'human' : 'ai';
      html += `
        <div style="margin: 10px 0; padding: 10px; border: 1px solid #ccc;">
          <label>Player ${i + 1}:
            <select id="player${i}Type" style="margin-left: 10px;" onchange="document.getElementById('player${i}DifficultyLabel').style.display = this.value === 'human' ? 'none' : 'inline-block';">
              <option value="ai">AI</option>
              <option value="human" ${isPlayer1 ? 'selected' : ''}>Human</option>
            </select>
          </label>
          <label id="player${i}DifficultyLabel" style="margin-left: 20px; display: ${defaultType === 'human' ? 'none' : 'inline-block'};">Difficulty:
            <select id="player${i}Difficulty">
              <option value="random">Random</option>
              <option value="shallow">Shallow MCTS (100)</option>
              <option value="medium" selected>Medium MCTS (500)</option>
              <option value="deep">Deep MCTS (2000)</option>
            </select>
          </label>
        </div>
      `;
    }
    playerSetup.innerHTML = html;
  }

  playerCount.addEventListener('change', updatePlayerSetup);
  updatePlayerSetup();

  startButton.addEventListener('click', () => {
    const count = parseInt(playerCount.value);
    const playerConfigs = [];
    for (let i = 0; i < count; i++) {
      const type = document.getElementById(`player${i}Type`).value;
      const difficulty = document.getElementById(`player${i}Difficulty`).value;
      playerConfigs.push({
        isHuman: type === 'human',
        aiDifficulty: type === 'ai' ? difficultyMap[difficulty] : null,
      });
    }
    onStart(playerConfigs);
  });
}

const difficultyMap = {
  random: 0,
  shallow: 100,
  medium: 500,
  deep: 2000,
};

export function renderGameScreen(container, gameState, onMarketClick, onPlacementSubmit, onGameEnd) {
  container.innerHTML = `
    <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; grid-template-rows: 1fr 1fr 1fr; height: 100vh; gap: 8px; padding: 10px; font-family: Arial, sans-serif; background: #f5f5f5; overflow: hidden; font-size: 13px;">

      <!-- Top: Player 2 -->
      <div style="grid-column: 2; grid-row: 1; background: white; padding: 6px; border: 2px solid #999; border-radius: 3px; overflow: hidden; display: flex; flex-direction: column;">
        <h3 style="margin: 0; font-size: 12px; padding: 2px 0;">Player 2</h3>
        <div id="playerBoard2" style="display: grid; grid-template-columns: repeat(6, 1fr); gap: 2px; flex: 1;">
        </div>
      </div>

      <!-- Left: Player 3 -->
      <div style="grid-column: 1; grid-row: 2; background: white; padding: 6px; border: 2px solid #999; border-radius: 3px; overflow: hidden; display: flex; flex-direction: column;">
        <h3 style="margin: 0; font-size: 12px; padding: 2px 0;">Player 3</h3>
        <div id="playerBoard3" style="display: grid; grid-template-columns: repeat(6, 1fr); gap: 2px; flex: 1;">
        </div>
      </div>

      <!-- Center: Market + Current Player Info -->
      <div style="grid-column: 2; grid-row: 2; background: white; padding: 8px; border: 2px solid #333; border-radius: 3px; display: flex; flex-direction: column; justify-content: center; align-items: center;">
        <h3 id="currentPlayer" style="margin: 0 0 6px 0; font-size: 12px;">Turn</h3>
        <div id="market" style="display: grid; grid-template-columns: repeat(6, 1fr); gap: 2px; width: 100%; aspect-ratio: 1;">
        </div>
      </div>

      <!-- Right: Player 4 -->
      <div style="grid-column: 3; grid-row: 2; background: white; padding: 6px; border: 2px solid #999; border-radius: 3px; overflow: hidden; display: flex; flex-direction: column;">
        <h3 style="margin: 0; font-size: 12px; padding: 2px 0;">Player 4</h3>
        <div id="playerBoard4" style="display: grid; grid-template-columns: repeat(6, 1fr); gap: 2px; flex: 1;">
        </div>
      </div>

      <!-- Bottom: Player 1 + Controls -->
      <div style="grid-column: 2; grid-row: 3; background: white; padding: 6px; border: 2px solid #0066cc; border-radius: 3px; overflow: hidden; display: flex; flex-direction: column;">
        <h3 style="margin: 0; font-size: 12px; padding: 2px 0;">Your Board (P1)</h3>
        <div id="playerBoard1" style="display: grid; grid-template-columns: repeat(6, 1fr); gap: 2px; flex: 1; margin-bottom: 4px;">
        </div>
        <div id="placementControls" style="background: #fffacd; border: 1px solid #ffeb3b; border-radius: 2px; padding: 4px; display: none; font-size: 11px;">
          <p id="selectedTilesInfo" style="margin: 0 0 3px 0;"></p>
          <button id="placementSubmit" style="padding: 3px 8px; margin-right: 3px; cursor: pointer; font-size: 11px;">Submit</button>
          <button id="placementCancel" style="padding: 3px 8px; cursor: pointer; font-size: 11px;">Cancel</button>
        </div>
      </div>

      <!-- Top-left: Stats -->
      <div style="grid-column: 1; grid-row: 1; background: #f9f9f9; padding: 6px; border: 1px solid #ddd; border-radius: 3px; overflow-y: auto; font-size: 11px;">
        <h4 style="margin: 0 0 4px 0; font-size: 11px;">Scores</h4>
        <div id="stats"></div>
      </div>

      <!-- Top-right: Game Status -->
      <div style="grid-column: 3; grid-row: 1; background: #f9f9f9; padding: 6px; border: 1px solid #ddd; border-radius: 3px; overflow-y: auto; font-size: 11px;">
        <p id="gameInfo" style="margin: 0; font-weight: bold;"></p>
        <p style="margin: 3px 0 0 0;">Turns: <span id="turnsDisplay">0</span></p>
        <p style="margin: 2px 0 0 0;">Market: <span id="marketDisplay">36</span></p>
      </div>

      <!-- Bottom-left: (empty) -->
      <div style="grid-column: 1; grid-row: 3; background: #f9f9f9; padding: 6px; border: 1px solid #ddd; border-radius: 3px; overflow-y: auto; font-size: 11px;">
      </div>

      <!-- Bottom-right: (empty) -->
      <div style="grid-column: 3; grid-row: 3; background: #f9f9f9; padding: 6px; border: 1px solid #ddd; border-radius: 3px; overflow-y: auto; font-size: 11px;">
      </div>
    </div>
  `;

  // Store references for updating
  window._gameUI = {
    onMarketClick,
    onPlacementSubmit,
    selectedPlacement: [],
    gameState,
  };

  // Setup event listeners
  document.getElementById('placementSubmit').addEventListener('click', () => {
    onPlacementSubmit(window._gameUI.selectedPlacement);
    window._gameUI.selectedPlacement = [];
  });

  document.getElementById('placementCancel').addEventListener('click', () => {
    window._gameUI.selectedPlacement = [];
    updateGameDisplay(gameState);
  });
}

export function updateGameDisplay(gameState) {
  const ui = window._gameUI;
  if (!ui) return;

  const currentPlayer = gameState.players[gameState.currentPlayerIndex];

  // Update current player info
  document.getElementById('currentPlayer').textContent = `${currentPlayer.name}'s Turn`;

  // Update market
  const market = document.getElementById('market');
  if (market) {
    market.innerHTML = gameState.market.map((tile, idx) => `
      <div style="aspect-ratio: 1; border: 1px solid #999; border-radius: 2px; display: flex; align-items: center; justify-content: center; cursor: ${tile ? 'pointer' : 'default'}; background: ${tile ? getColourCSS(tile.colour) : '#eee'}; opacity: ${tile ? 1 : 0.2};" data-index="${idx}" class="market-tile">
        ${tile ? `<img src="images/symbol_${tile.ingredient}.png" style="width: 60%; height: 60%; object-fit: contain;" alt="${tile.ingredient}">` : ''}
      </div>
    `).join('');

    if (gameState.gamePhase === 'sweep') {
      document.querySelectorAll('.market-tile').forEach(el => {
        const idx = parseInt(el.dataset.index);
        if (gameState.market[idx]) {
          el.addEventListener('click', () => ui.onMarketClick(idx));
        }
      });
    }
  }

  // Update all 4 player boards
  gameState.players.forEach((player, playerIdx) => {
    const boardEl = document.getElementById(`playerBoard${playerIdx + 1}`);
    if (boardEl) {
      boardEl.innerHTML = player.board.map((tile, idx) => {
        const isP1 = playerIdx === 0;
        const canPlace = gameState.gamePhase === 'place' && isP1 && currentPlayer.isHuman;
        return `
          <div style="aspect-ratio: 1; border: 1px solid #ccc; border-radius: 2px; display: flex; align-items: center; justify-content: center; background: ${tile ? getColourCSS(tile.colour) : '#fff'}; cursor: ${canPlace ? 'pointer' : 'default'};" class="board-tile" data-index="${idx}" data-player="${playerIdx}">
            ${tile ? `<img src="images/symbol_${tile.ingredient}.png" style="width: 60%; height: 60%; object-fit: contain;" alt="${tile.ingredient}">` : ''}
          </div>
        `;
      }).join('');

      // Add click handlers only for Player 1 (human) during placement
      if (playerIdx === 0 && gameState.gamePhase === 'place' && currentPlayer.isHuman) {
        boardEl.querySelectorAll('.board-tile').forEach(el => {
          el.addEventListener('click', () => togglePlacement(parseInt(el.dataset.index), gameState));
        });
      }
    }
  });

  // Update stats
  const stats = document.getElementById('stats');
  if (stats) {
    const statsHTML = gameState.players.map(p => `
      <div style="margin: 5px 0; padding: 6px; background: white; border-radius: 3px; font-size: 11px;">
        <strong>${p.name}</strong><br>
        Score: ${p.score} | Cards: ${p.claimedCards.length}
      </div>
    `).join('');
    stats.innerHTML = statsHTML;
  }

  // Update game info
  const gameInfo = document.getElementById('gameInfo');
  if (gameInfo) {
    gameInfo.textContent = `Phase: ${gameState.gamePhase}`;
  }

  // Update turn and market tile count
  const turnsDisplay = document.getElementById('turnsDisplay');
  if (turnsDisplay) turnsDisplay.textContent = gameState.stats.turnsPlayed;

  const marketDisplay = document.getElementById('marketDisplay');
  if (marketDisplay) {
    const tilesInMarket = gameState.market.filter(t => t !== null).length;
    marketDisplay.textContent = tilesInMarket;
  }

  // Update placement controls (only for Player 1 / human)
  const placementControls = document.getElementById('placementControls');
  if (placementControls) {
    if (gameState.gamePhase === 'place' && gameState.players[0].isHuman && gameState.currentPlayerIndex === 0) {
      placementControls.style.display = 'block';
      document.getElementById('selectedTilesInfo').textContent = `Selected: ${gameState.selectedTiles.length} tiles to place`;
    } else {
      placementControls.style.display = 'none';
    }
  }
}

function togglePlacement(boardIndex, gameState) {
  const ui = window._gameUI;
  const idx = ui.selectedPlacement.indexOf(boardIndex);
  if (idx >= 0) {
    ui.selectedPlacement.splice(idx, 1);
  } else {
    ui.selectedPlacement.push(boardIndex);
  }
  updateGameDisplay(gameState);
}

function getColourCSS(colour) {
  const colourMap = {
    yellow: '#FFD700',
    pink: '#FFB6C1',
    green: '#90EE90',
    blue: '#87CEEB',
    orange: '#FFA500',
  };
  return colourMap[colour] || '#fff';
}
