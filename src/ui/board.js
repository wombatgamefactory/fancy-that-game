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
      html += `
        <div style="margin: 10px 0; padding: 10px; border: 1px solid #ccc;">
          <label>Player ${i + 1}:
            <select id="player${i}Type" style="margin-left: 10px;">
              <option value="ai">AI</option>
              ${i === 0 ? '<option value="human">Human</option>' : ''}
            </select>
          </label>
          <label style="margin-left: 20px;">Difficulty:
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
    <div style="display: flex; height: 100vh; font-family: Arial, sans-serif; background: #f5f5f5;">
      <!-- Left: Market -->
      <div style="flex: 0 0 400px; padding: 20px; background: white; border-right: 2px solid #ddd; overflow-y: auto;">
        <h2>Market (5×5)</h2>
        <div id="market" style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 5px;">
          <!-- Populated dynamically -->
        </div>
      </div>

      <!-- Center: Current Player Board + Selection -->
      <div style="flex: 1; padding: 20px; display: flex; flex-direction: column;">
        <h2 id="currentPlayer">Player Turn</h2>
        <div style="flex: 1; display: flex; gap: 20px;">
          <!-- Player Board -->
          <div style="flex: 1;">
            <h3>Your Board (5×5)</h3>
            <div id="playerBoard" style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 5px; aspect-ratio: 1;">
              <!-- Populated dynamically -->
            </div>
          </div>

          <!-- Stats Sidebar -->
          <div style="flex: 0 0 250px; background: #f9f9f9; padding: 15px; border: 1px solid #ddd; border-radius: 4px; overflow-y: auto;">
            <h3>Game Stats</h3>
            <div id="stats">
              <!-- Populated dynamically -->
            </div>
          </div>
        </div>

        <!-- Placement Controls -->
        <div id="placementControls" style="margin-top: 20px; padding: 15px; background: #fffacd; border: 2px solid #ffeb3b; border-radius: 4px; display: none;">
          <h3>Place Selected Tiles</h3>
          <p id="selectedTilesInfo"></p>
          <button id="placementSubmit" style="padding: 8px 16px; margin-right: 10px; cursor: pointer;">Submit Placement</button>
          <button id="placementCancel" style="padding: 8px 16px; cursor: pointer;">Cancel</button>
        </div>
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
  document.getElementById('currentPlayer').textContent = `${currentPlayer.name}'s Turn (Phase: ${gameState.gamePhase})`;

  // Update market
  const market = document.getElementById('market');
  if (market) {
    market.innerHTML = gameState.market.map((tile, idx) => `
      <div style="aspect-ratio: 1; border: 2px solid #ddd; border-radius: 4px; display: flex; align-items: center; justify-content: center; cursor: ${tile ? 'pointer' : 'default'}; background: ${tile ? getColourCSS(tile.colour) : '#eee'}; opacity: ${tile ? 1 : 0.3}; position: relative;" data-index="${idx}" class="market-tile">
        ${tile ? `<img src="images/symbol_${tile.ingredient}.png" style="width: 70%; height: 70%; object-fit: contain;" alt="${tile.ingredient}">` : ''}
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

  // Update player board
  const playerBoard = document.getElementById('playerBoard');
  if (playerBoard) {
    playerBoard.innerHTML = currentPlayer.board.map((tile, idx) => `
      <div style="aspect-ratio: 1; border: 2px solid #999; border-radius: 4px; display: flex; align-items: center; justify-content: center; background: ${tile ? getColourCSS(tile.colour) : '#fff'}; cursor: ${gameState.gamePhase === 'place' ? 'pointer' : 'default'};" class="board-tile" data-index="${idx}">
        ${tile ? `<img src="images/symbol_${tile.ingredient}.png" style="width: 70%; height: 70%; object-fit: contain;" alt="${tile.ingredient}">` : ''}
      </div>
    `).join('');

    if (gameState.gamePhase === 'place') {
      document.querySelectorAll('.board-tile').forEach(el => {
        el.addEventListener('click', () => togglePlacement(parseInt(el.dataset.index), gameState));
      });
    }
  }

  // Update stats
  const stats = document.getElementById('stats');
  if (stats) {
    const statsHTML = gameState.players.map(p => `
      <div style="margin: 10px 0; padding: 8px; background: white; border-radius: 3px;">
        <strong>${p.name}</strong><br>
        Score: ${p.score}<br>
        Cards: ${p.claimedCards.length}<br>
        Tracks: ${Object.entries(p.ingredientTracks).map(([k, v]) => `${k.substring(0,1)}:${v}`).join(' ')}
      </div>
    `).join('');
    stats.innerHTML = statsHTML;
  }

  // Update placement controls
  const placementControls = document.getElementById('placementControls');
  if (placementControls) {
    if (gameState.gamePhase === 'place' && currentPlayer.isHuman) {
      placementControls.style.display = 'block';
      document.getElementById('selectedTilesInfo').textContent = `Selected: ${gameState.selectedTiles.length} tiles to place. Click on your board to place them.`;
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
