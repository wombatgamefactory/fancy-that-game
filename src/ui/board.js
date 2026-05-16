import { BOARD_SIZE, MARKET_SIZE, CARD_MARKET_SIZE, REWARD_CARDS, INGREDIENTS } from '../engine/tiles.js';
import { getPatternMatches } from '../engine/game.js';

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
      html += `
        <div style="margin: 10px 0; padding: 10px; border: 1px solid #ccc;">
          <label>Player ${i + 1}:
            <select id="player${i}Type" style="margin-left: 10px;">
              <option value="ai">AI</option>
              <option value="human" ${isPlayer1 ? 'selected' : ''}>Human</option>
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
      playerConfigs.push({
        isHuman: type === 'human',
        aiDifficulty: null,
      });
    }
    onStart(playerConfigs);
  });
}

export function renderGameScreen(container, gameState, onMarketClick, onBonusTile, onPlacementSubmit, onClaimSubmit, onSkipClaim) {
  container.innerHTML = `
    <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; grid-template-rows: auto auto; gap: 3px; padding: 5px; font-family: Arial, sans-serif; background: #f5f5f5; font-size: 10px;">

      <div style="grid-column: 1; grid-row: 1; background: white; padding: 2px; border: 1px solid #0066cc; border-radius: 2px; display: flex; flex-direction: column; align-items: center;">
        <h3 style="margin: 0; font-size: 8px; padding: 1px 0;">Your Board (P1)</h3>
        <div style="display: flex; gap: 2px; width: 100%;">
          <div id="workingArea1" style="display: grid; grid-template-columns: repeat(7, 50px); grid-template-rows: 1fr; gap: 1px; border: 1px dashed #999; padding: 2px; min-width: 60px; visibility: hidden;">
          </div>
          <div id="playerBoard1" style="display: grid; grid-template-columns: repeat(${BOARD_SIZE}, 75px); grid-template-rows: repeat(${BOARD_SIZE}, 75px); gap: 1px;">
          </div>
        </div>
        <div id="phaseControls" style="background: #fffacd; border: 1px solid #ffeb3b; border-radius: 2px; padding: 2px; display: none; font-size: 8px; width: 100%; box-sizing: border-box; margin-top: 2px;">
        </div>
      </div>

      <div style="grid-column: 2; grid-row: 1; background: white; padding: 2px; border: 1px solid #333; border-radius: 2px; display: flex; flex-direction: column; justify-content: flex-start; align-items: center;">
        <div id="marketContainer" style="display: grid; grid-template-columns: 50px repeat(${MARKET_SIZE}, 50px); grid-template-rows: 50px repeat(${MARKET_SIZE}, 50px); gap: 1px;">
          <div style="grid-column: 2 / span ${MARKET_SIZE}; grid-row: 1; display: flex; gap: 1px;" id="marketColButtons">
          </div>
          <div style="grid-column: 1; grid-row: 2 / span ${MARKET_SIZE}; display: flex; flex-direction: column; gap: 1px;" id="marketRowButtons">
          </div>
          <div id="market" style="grid-column: 2 / span ${MARKET_SIZE}; grid-row: 2 / span ${MARKET_SIZE}; display: grid; grid-template-columns: repeat(${MARKET_SIZE}, 50px); grid-template-rows: repeat(${MARKET_SIZE}, 50px); gap: 1px;">
          </div>
        </div>
      </div>

      <div style="grid-column: 3; grid-row: 1; background: white; padding: 2px; border: 1px solid #999; border-radius: 2px; display: flex; flex-direction: column; align-items: center;">
        <h3 style="margin: 0; font-size: 8px; padding: 1px 0;">Player 3</h3>
        <div style="display: flex; gap: 2px;">
          <div id="workingArea3" style="display: grid; grid-template-columns: repeat(7, 50px); grid-template-rows: 1fr; gap: 1px; border: 1px dashed #ccc; padding: 2px; min-width: 60px; visibility: hidden;">
          </div>
          <div id="playerBoard3" style="display: grid; grid-template-columns: repeat(${BOARD_SIZE}, 75px); grid-template-rows: repeat(${BOARD_SIZE}, 75px); gap: 1px;">
          </div>
        </div>
      </div>

      <div style="grid-column: 1; grid-row: 2; background: white; padding: 2px; border: 1px solid #999; border-radius: 2px;">
        <h3 style="margin: 0; font-size: 8px; padding: 1px 0;">Player 2</h3>
        <div style="display: flex; gap: 2px;">
          <div id="workingArea2" style="display: grid; grid-template-columns: repeat(7, 50px); grid-template-rows: 1fr; gap: 1px; border: 1px dashed #ccc; padding: 2px; min-width: 60px; visibility: hidden;">
          </div>
          <div id="playerBoard2" style="display: grid; grid-template-columns: repeat(${BOARD_SIZE}, 75px); grid-template-rows: repeat(${BOARD_SIZE}, 75px); gap: 1px; justify-content: center;">
          </div>
        </div>
      </div>

      <div style="grid-column: 2; grid-row: 2; background: white; padding: 2px; border: 1px solid #333; border-radius: 2px; display: flex; flex-direction: column; justify-content: flex-start; align-items: center;">
        <h3 id="currentPlayer" style="margin: 0 0 2px 0; font-size: 8px;">Turn</h3>
        <div style="display: flex; gap: 3px; align-items: flex-start; flex-direction: column;">
          <div id="cardMarket" style="display: flex; flex-direction: column; gap: 2px; padding: 2px;">
          </div>
          <div style="background: #f9f9f9; padding: 2px; border: 1px solid #ddd; border-radius: 2px; font-size: 8px;">
            <h4 style="margin: 0 0 2px 0;">Scores</h4>
            <div id="stats" style="overflow-y: auto; max-height: 100px;"></div>
          </div>
          <div style="background: #f9f9f9; padding: 2px; border: 1px solid #ddd; border-radius: 2px; overflow-y: auto; font-size: 8px;">
            <p id="gameInfo" style="margin: 0; font-weight: bold;"></p>
            <p style="margin: 1px 0 0 0;">Turns: <span id="turnsDisplay">0</span></p>
            <p style="margin: 1px 0 0 0;">Market: <span id="marketDisplay">36</span></p>
          </div>
        </div>
      </div>

      <div style="grid-column: 3; grid-row: 2; background: white; padding: 2px; border: 1px solid #999; border-radius: 2px; display: flex; flex-direction: column; align-items: center;">
        <h3 style="margin: 0; font-size: 8px; padding: 1px 0;">Player 4</h3>
        <div style="display: flex; gap: 2px;">
          <div id="workingArea4" style="display: grid; grid-template-columns: repeat(7, 50px); grid-template-rows: 1fr; gap: 1px; border: 1px dashed #ccc; padding: 2px; min-width: 60px; visibility: hidden;">
          </div>
          <div id="playerBoard4" style="display: grid; grid-template-columns: repeat(${BOARD_SIZE}, 75px); grid-template-rows: repeat(${BOARD_SIZE}, 75px); gap: 1px;">
          </div>
        </div>
      </div>
    </div>
  `;

  window._gameUI = {
    onMarketClick,
    onBonusTile,
    onPlacementSubmit,
    onClaimSubmit,
    onSkipClaim,
    gameState,
    selectedPlacements: [],
    placementMap: {},
    removableTiles: [],
    claimingCardId: null,
  };
}

export function updateGameDisplay(gameState) {
  const ui = window._gameUI;
  if (!ui) return;

  ui.gameState = gameState;

  const currentPlayer = gameState.players[gameState.currentPlayerIndex];
  document.getElementById('currentPlayer').textContent = `${currentPlayer.name}'s Turn (${gameState.gamePhase})`;

  updateMarket(gameState);
  updateCardMarket(gameState);
  updatePlayerBoards(gameState);
  updateStats(gameState);
  updateGameInfo(gameState);
  updatePhaseControls(gameState);
}

function updateMarket(gameState) {
  const market = document.getElementById('market');
  if (!market) return;

  market.innerHTML = gameState.market.map((tile, idx) => `
    <div style="aspect-ratio: 1; border: 1px solid #999; border-radius: 1px; display: flex; align-items: center; justify-content: center; background: ${tile ? getColourCSS(tile.colour) : '#eee'}; opacity: ${tile ? 1 : 0.3}; cursor: ${(tile && gameState.bonusTileAvailable) ? 'pointer' : 'default'};" data-index="${idx}" class="market-tile">
      ${tile ? `<img src="images/symbol_${tile.ingredient}.png" style="width: 50%; height: 50%; object-fit: contain;" alt="${tile.ingredient}">` : ''}
    </div>
  `).join('');

  const player = gameState.players[gameState.currentPlayerIndex];
  if (gameState.bonusTileAvailable && player.isHuman) {
    setupBonusUI(gameState);
  } else if (gameState.gamePhase === 'sweep' && player.isHuman) {
    setupMarketSelectButtons(gameState);
  }
}

function setupMarketSelectButtons(gameState) {
  const marketRowButtons = document.getElementById('marketRowButtons');
  const marketColButtons = document.getElementById('marketColButtons');
  if (!marketRowButtons || !marketColButtons) return;

  const colLabels = ['A', 'B', 'C', 'D', 'E', 'F'];

  marketColButtons.innerHTML = colLabels.map((label, col) => `
    <button class="market-col-btn" data-col="${col}" style="width: 50px; height: 50px; padding: 0; font-size: 8px; font-weight: bold; background: #f0f0f0; border: 1px solid #999; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 3px;">
      <img src="images/arrow_down.png" style="width: 16px; height: 16px; object-fit: contain;">
      ${label}
    </button>
  `).join('');

  marketRowButtons.innerHTML = Array.from({ length: MARKET_SIZE }, (_, row) => `
    <button class="market-row-btn" data-row="${row}" style="width: 50px; height: 50px; padding: 0; font-size: 8px; font-weight: bold; background: #f0f0f0; border: 1px solid #999; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 3px;">
      <img src="images/arrow_left.png" style="width: 16px; height: 16px; object-fit: contain;">
      ${row + 1}
    </button>
  `).join('');

  document.querySelectorAll('.market-row-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const row = parseInt(btn.dataset.row);
      showSweepOptionsForRow(gameState, row);
    });
  });

  document.querySelectorAll('.market-col-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const col = parseInt(btn.dataset.col);
      showSweepOptionsForCol(gameState, col);
    });
  });
}

function setupBonusUI(gameState) {
  const tiles = document.querySelectorAll('.market-tile');
  tiles.forEach(el => {
    const idx = parseInt(el.dataset.index);
    if (gameState.market[idx]) {
      el.addEventListener('click', () => {
        window._gameUI.onBonusTile(idx);
      });
    }
  });
}

function showSweepOptionsForRow(gameState, row) {
  const tiles = [];
  for (let c = 0; c < MARKET_SIZE; c++) {
    tiles.push(gameState.market[row * MARKET_SIZE + c]);
  }

  const colours = new Set();
  const ingredients = new Set();
  for (const tile of tiles) {
    if (tile) {
      colours.add(tile.colour);
      ingredients.add(tile.ingredient);
    }
  }

  let html = `<div style="position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: white; border: 2px solid #333; padding: 15px; border-radius: 5px; z-index: 1000;">`;
  html += `<p style="margin: 0 0 10px 0; font-weight: bold;">Row ${row + 1} - Select Colour or Ingredient:</p>`;

  html += `<div style="margin: 10px 0;"><strong>Colours:</strong> `;
  for (const colour of colours) {
    const count = tiles.filter(t => t && t.colour === colour).length;
    html += `<button class="sweep-option-btn" data-row="${row}" data-col="-1" data-type="colour" data-val="${colour}" style="padding: 5px 10px; margin: 2px; background: ${getColourCSS(colour)}; color: black; border: 1px solid #999; cursor: pointer;">${colour} (${count})</button>`;
  }
  html += `</div>`;

  html += `<div style="margin: 10px 0;"><strong>Ingredients:</strong> `;
  for (const ing of ingredients) {
    const count = tiles.filter(t => t && t.ingredient === ing).length;
    html += `<button class="sweep-option-btn" data-row="${row}" data-col="-1" data-type="symbol" data-val="${ing}" style="padding: 5px 10px; margin: 2px; background: #e8e8e8; border: 1px solid #999; cursor: pointer; display: flex; align-items: center; gap: 5px; color: black;"><img src="images/symbol_${ing}.png" style="width: 20px; height: 20px; object-fit: contain;"> ${count}</button>`;
  }
  html += `</div>`;

  html += `</div>`;

  const modal = document.createElement('div');
  modal.innerHTML = html;
  modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 999; display: flex; align-items: center; justify-content: center;';
  document.body.appendChild(modal);

  modal.querySelectorAll('.sweep-option-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const row = parseInt(btn.dataset.row);
      const type = btn.dataset.type;
      const val = btn.dataset.val;
      window._gameUI.onMarketClick(row, true, val, type);
      modal.remove();
    });
  });
}

function showSweepOptionsForCol(gameState, col) {
  const tiles = [];
  for (let r = 0; r < MARKET_SIZE; r++) {
    tiles.push(gameState.market[r * MARKET_SIZE + col]);
  }

  const colours = new Set();
  const ingredients = new Set();
  for (const tile of tiles) {
    if (tile) {
      colours.add(tile.colour);
      ingredients.add(tile.ingredient);
    }
  }

  const colLabels = ['A', 'B', 'C', 'D', 'E', 'F'];
  let html = `<div style="position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: white; border: 2px solid #333; padding: 15px; border-radius: 5px; z-index: 1000;">`;
  html += `<p style="margin: 0 0 10px 0; font-weight: bold;">Column ${colLabels[col]} - Select Colour or Ingredient:</p>`;

  html += `<div style="margin: 10px 0;"><strong>Colours:</strong> `;
  for (const colour of colours) {
    const count = tiles.filter(t => t && t.colour === colour).length;
    html += `<button class="sweep-option-btn" data-row="-1" data-col="${col}" data-type="colour" data-val="${colour}" style="padding: 5px 10px; margin: 2px; background: ${getColourCSS(colour)}; color: black; border: 1px solid #999; cursor: pointer;">${colour} (${count})</button>`;
  }
  html += `</div>`;

  html += `<div style="margin: 10px 0;"><strong>Ingredients:</strong> `;
  for (const ing of ingredients) {
    const count = tiles.filter(t => t && t.ingredient === ing).length;
    html += `<button class="sweep-option-btn" data-row="-1" data-col="${col}" data-type="symbol" data-val="${ing}" style="padding: 5px 10px; margin: 2px; background: #e8e8e8; border: 1px solid #999; cursor: pointer; display: flex; align-items: center; gap: 5px; color: black;"><img src="images/symbol_${ing}.png" style="width: 20px; height: 20px; object-fit: contain;"> ${count}</button>`;
  }
  html += `</div>`;

  html += `</div>`;

  const modal = document.createElement('div');
  modal.innerHTML = html;
  modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 999; display: flex; align-items: center; justify-content: center;';
  document.body.appendChild(modal);

  modal.querySelectorAll('.sweep-option-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const col = parseInt(btn.dataset.col);
      const type = btn.dataset.type;
      const val = btn.dataset.val;
      window._gameUI.onMarketClick(col, false, val, type);
      modal.remove();
    });
  });
}

function updateCardMarket(gameState) {
  const cardMarket = document.getElementById('cardMarket');
  if (!cardMarket) return;

  const SPRITE_WIDTH = 3751;
  const SPRITE_HEIGHT = 2598;
  const CARDS_PER_ROW = 10;
  const CARDS_PER_COL = 5;
  const CARD_WIDTH = SPRITE_WIDTH / CARDS_PER_ROW;
  const CARD_HEIGHT = SPRITE_HEIGHT / CARDS_PER_COL;
  const DISPLAY_HEIGHT = 300;
  const DISPLAY_WIDTH = CARD_WIDTH * (DISPLAY_HEIGHT / CARD_HEIGHT);
  const SCALE = DISPLAY_HEIGHT / CARD_HEIGHT;

  const currentPlayer = gameState.players[gameState.currentPlayerIndex];
  const claimableCardIds = new Set();

  // Detect which cards are claimable in claim phase
  if (gameState.gamePhase === 'claim') {
    for (const card of gameState.cardMarket) {
      const matches = getPatternMatches(currentPlayer.board, card.pattern);
      if (matches.length > 0) {
        claimableCardIds.add(card.id);
      }
    }
  }

  const cardsHTML = gameState.cardMarket.map(card => {
    const cardId = card.id;
    const isClaimable = claimableCardIds.has(cardId);
    const col = (cardId - 1) % CARDS_PER_ROW;
    const row = Math.floor((cardId - 1) / CARDS_PER_ROW);

    // Calculate position in sprite (pixel offsets)
    const spriteOffsetX = col * CARD_WIDTH;
    const spriteOffsetY = row * CARD_HEIGHT;

    // Scale the offsets and background size for display
    const bgPosX = -(spriteOffsetX * SCALE);
    const bgPosY = -(spriteOffsetY * SCALE);
    const bgSizeW = SPRITE_WIDTH * SCALE;
    const bgSizeH = SPRITE_HEIGHT * SCALE;

    const borderStyle = isClaimable ? '3px solid #FFD700; box-shadow: 0 0 10px rgba(255, 215, 0, 0.8);' : '1px solid #ccc;';
    const cursorStyle = isClaimable && gameState.gamePhase === 'claim' ? 'cursor: pointer;' : '';

    return `
      <div data-card-id="${cardId}" class="card-market-sprite" style="border: ${borderStyle} border-radius: 3px; width: ${DISPLAY_WIDTH}px; height: ${DISPLAY_HEIGHT}px; background-image: url('images/reward_card_layout.png'); background-position: ${bgPosX}px ${bgPosY}px; background-size: ${bgSizeW}px ${bgSizeH}px; background-repeat: no-repeat; ${cursorStyle}">
      </div>
    `;
  }).join('');

  cardMarket.innerHTML = `<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 5px;">${cardsHTML}</div>`;

  // Add click handlers for claimable cards during claim phase
  if (gameState.gamePhase === 'claim') {
    document.querySelectorAll('.card-market-sprite').forEach(cardEl => {
      const cardId = parseInt(cardEl.dataset.cardId);
      if (claimableCardIds.has(cardId)) {
        cardEl.addEventListener('click', () => {
          showRemovalUI(gameState, cardId);
        });
      }
    });
  }
}

function updatePlayerBoards(gameState) {
  const playerCount = gameState.players.length;
  const ui = window._gameUI || {};

  gameState.players.forEach((player, playerIdx) => {
    const boardEl = document.getElementById(`playerBoard${playerIdx + 1}`);
    const workingAreaEl = document.getElementById(`workingArea${playerIdx + 1}`);
    if (!boardEl || !workingAreaEl) return;

    const isCurrentPlayer = playerIdx === gameState.currentPlayerIndex;
    const isPlacingPhase = gameState.gamePhase === 'place';
    const showWorkingArea = isCurrentPlayer && isPlacingPhase && player.isHuman;

    boardEl.innerHTML = player.board.map((tile, idx) => {
      const isDropTarget = isCurrentPlayer && isPlacingPhase && player.isHuman;
      const isRemovable = isCurrentPlayer && ui.removableTiles && ui.removableTiles.includes(idx);

      // Check if there's a pending placement for this board position
      let pendingTile = null;
      if (isCurrentPlayer && isPlacingPhase && ui.placementMap) {
        for (const [tileIdx, boardIdx] of Object.entries(ui.placementMap)) {
          if (boardIdx == idx) {
            const tIdx = parseInt(tileIdx);
            if (tIdx >= 0 && tIdx < gameState.pendingSweepTiles.length) {
              pendingTile = gameState.pendingSweepTiles[tIdx];
            }
            break;
          }
        }
      }

      const displayTile = tile || pendingTile;
      const isPlaceholder = tile && tile.type === 'placeholder';
      const removableBorder = isRemovable ? '3px solid #FF6B6B' : '1px solid #ccc';
      const removableBoxShadow = isRemovable ? 'box-shadow: 0 0 8px rgba(255, 107, 107, 0.8);' : '';

      let bgColor = '#fff';
      let imageHtml = '';

      if (isPlaceholder) {
        bgColor = '#f0f0f0';
        imageHtml = `<img src="images/place_cake.png" style="width: 60%; height: 60%; object-fit: contain;" alt="placeholder">`;
      } else if (displayTile) {
        bgColor = getColourCSS(displayTile.colour);
        imageHtml = `<img src="images/symbol_${displayTile.ingredient}.png" style="width: 50%; height: 50%; object-fit: contain;" alt="${displayTile.ingredient}">`;
      }

      return `
        <div class="board-tile ${isRemovable ? 'removable-tile' : ''}" style="aspect-ratio: 1; border: ${removableBorder}; border-radius: 1px; display: flex; align-items: center; justify-content: center; background: ${bgColor}; cursor: ${isDropTarget && !isPlaceholder ? 'grab' : (isRemovable ? 'pointer' : 'default')}; opacity: ${pendingTile && !tile ? 0.7 : 1}; ${removableBoxShadow}" data-index="${idx}" data-player="${playerIdx}">
          ${imageHtml}
        </div>
      `;
    }).join('');

    if (showWorkingArea) {
      workingAreaEl.style.visibility = 'visible';
      workingAreaEl.style.backgroundColor = '#f5f5f5';
      workingAreaEl.innerHTML = gameState.pendingSweepTiles.map((tile, idx) => {
        // Hide tiles that have already been placed
        const isPlaced = ui.placementMap && ui.placementMap[idx] !== undefined;
        return !isPlaced ? `
          <div class="working-tile" draggable="true" data-tile-index="${idx}" style="aspect-ratio: 1; border: 1px solid #999; border-radius: 1px; display: flex; align-items: center; justify-content: center; background: ${getColourCSS(tile.colour)}; cursor: grab; user-select: none;" title="${tile.ingredient}">
            <img src="images/symbol_${tile.ingredient}.png" style="width: 50%; height: 50%; object-fit: contain; pointer-events: none;" alt="${tile.ingredient}">
          </div>
        ` : '';
      }).join('');

      setupDragAndDrop(gameState);
    } else {
      workingAreaEl.style.visibility = 'hidden';
      workingAreaEl.innerHTML = '';
    }

    // Add click handlers for removable tiles during removal phase
    if (isCurrentPlayer && ui.removableTiles && ui.removableTiles.length > 0) {
      ui.removableTiles.forEach(idx => {
        const tileEl = boardEl.querySelector(`[data-index="${idx}"]`);
        if (tileEl) {
          tileEl.addEventListener('click', () => {
            const cardId = ui.claimingCardId;
            ui.removableTiles = [];
            ui.claimingCardId = null;
            ui.onClaimSubmit(cardId, idx);
          });
        }
      });
    }
  });
}

function setupDragAndDrop(gameState) {
  const ui = window._gameUI;
  const workingArea = document.getElementById('workingArea1');
  const playerBoard = document.getElementById('playerBoard1');

  if (!workingArea || !playerBoard) return;

  // Setup drag on working tiles
  workingArea.addEventListener('dragstart', (e) => {
    if (e.target.classList.contains('working-tile')) {
      e.dataTransfer.effectAllowed = 'move';
      const tileIndex = parseInt(e.target.dataset.tileIndex);
      e.dataTransfer.setData('tileIndex', tileIndex);
      e.target.style.opacity = '0.5';
    }
  }, false);

  workingArea.addEventListener('dragend', (e) => {
    if (e.target.classList.contains('working-tile')) {
      e.target.style.opacity = '1';
    }
  }, false);

  // Setup drop on board container
  playerBoard.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, false);

  playerBoard.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();

    const tileIndex = parseInt(e.dataTransfer.getData('tileIndex'));

    if (isNaN(tileIndex)) {
      return;
    }

    // Use mouse coordinates to find which grid cell was dropped on
    const rect = playerBoard.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Calculate grid position (accounting for 75px tiles + 1px gaps)
    const CELL_SIZE = 75 + 1; // tile size + gap
    const BOARD_SIZE = 5;

    const col = Math.floor(x / CELL_SIZE);
    const row = Math.floor(y / CELL_SIZE);

    // Validate grid position
    if (col < 0 || col >= BOARD_SIZE || row < 0 || row >= BOARD_SIZE) {
      return;
    }

    const boardIndex = row * BOARD_SIZE + col;
    const currentPlayer = gameState.players[gameState.currentPlayerIndex];
    const targetCell = currentPlayer.board[boardIndex];

    // Only allow drop on empty cells (not placeholders, not occupied)
    if (targetCell === null && tileIndex >= 0 && tileIndex < gameState.pendingSweepTiles.length) {
      if (!ui.placementMap) ui.placementMap = {};
      ui.placementMap[tileIndex] = boardIndex;
      updateGameDisplay(gameState);
    }
  }, false);

  // Visual feedback
  const boardTiles = document.querySelectorAll('.board-tile[data-player="0"]');
  playerBoard.addEventListener('dragover', (e) => {
    const rect = playerBoard.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const CELL_SIZE = 75 + 1;
    const BOARD_SIZE = 5;

    const col = Math.floor(x / CELL_SIZE);
    const row = Math.floor(y / CELL_SIZE);

    boardTiles.forEach(tile => {
      tile.classList.remove('drag-over');
    });

    if (col >= 0 && col < BOARD_SIZE && row >= 0 && row < BOARD_SIZE) {
      const boardIndex = row * BOARD_SIZE + col;
      const targetCell = gameState.players[gameState.currentPlayerIndex].board[boardIndex];
      // Only highlight empty cells (not placeholders)
      if (targetCell === null) {
        const tile = document.querySelector(`.board-tile[data-player="0"][data-index="${boardIndex}"]`);
        if (tile) {
          tile.classList.add('drag-over');
        }
      }
    }
  }, false);

  playerBoard.addEventListener('dragleave', (e) => {
    if (e.target === playerBoard) {
      boardTiles.forEach(tile => {
        tile.classList.remove('drag-over');
      });
    }
  }, false);
}

function getSymbolsFromCards(player) {
  const symbols = {};
  for (const ingredient of INGREDIENTS) {
    symbols[ingredient] = 0;
  }

  for (const cardId of player.claimedCards) {
    const card = REWARD_CARDS.find(c => c.id === cardId);
    if (card) {
      symbols[card.ingredient] += card.symbolCount;
    }
  }

  return symbols;
}

function getSymbolsFromTiles(player) {
  const symbols = {};
  for (const ingredient of INGREDIENTS) {
    symbols[ingredient] = 0;
  }

  for (const tile of player.scoringPile) {
    symbols[tile.ingredient]++;
  }

  return symbols;
}

function calculateScorePerIngredient(cardSymbols, tileSymbols) {
  const scores = {};
  for (const ingredient of INGREDIENTS) {
    scores[ingredient] = (cardSymbols[ingredient] || 0) * (tileSymbols[ingredient] || 0);
  }
  return scores;
}

function updateStats(gameState) {
  const stats = document.getElementById('stats');
  if (!stats) return;

  stats.innerHTML = gameState.players.map(p => {
    const cardSymbols = getSymbolsFromCards(p);
    const tileSymbols = getSymbolsFromTiles(p);
    const scores = calculateScorePerIngredient(cardSymbols, tileSymbols);
    const totalScore = Object.values(scores).reduce((a, b) => a + b, 0);

    let html = `
      <div style="margin: 1px 0; padding: 2px; background: white; border-radius: 2px; font-size: 7px; border-left: 3px solid #ccc;">
        <div style="font-weight: bold; margin-bottom: 2px;">${p.name} — Total: ${totalScore}</div>
        <table style="width: 100%; border-collapse: collapse; font-size: 6px;">
          <tr style="border-bottom: 1px solid #eee;">
            <th style="padding: 1px; text-align: left;">Ingredient</th>
            <th style="padding: 1px; text-align: center;">Cards</th>
            <th style="padding: 1px; text-align: center;">Tiles</th>
            <th style="padding: 1px; text-align: center;">Score</th>
          </tr>
    `;

    for (const ingredient of INGREDIENTS) {
      const cardCount = cardSymbols[ingredient] || 0;
      const tileCount = tileSymbols[ingredient] || 0;
      const score = scores[ingredient] || 0;
      const scoreColor = score > 0 ? '#90EE90' : '#eee';

      html += `
        <tr style="border-bottom: 1px solid #f5f5f5;">
          <td style="padding: 1px; display: flex; align-items: center; gap: 2px;">
            <img src="images/symbol_${ingredient}.png" style="width: 12px; height: 12px; object-fit: contain;">
            <span>${ingredient.slice(0, 4)}</span>
          </td>
          <td style="padding: 1px; text-align: center;">${cardCount}</td>
          <td style="padding: 1px; text-align: center;">${tileCount}</td>
          <td style="padding: 1px; text-align: center; background: ${scoreColor}; font-weight: bold;">${score}</td>
        </tr>
      `;
    }

    html += `</table></div>`;
    return html;
  }).join('');
}

function updateGameInfo(gameState) {
  const gameInfo = document.getElementById('gameInfo');
  if (gameInfo) {
    gameInfo.textContent = `Phase: ${gameState.gamePhase}`;
  }

  const turnsDisplay = document.getElementById('turnsDisplay');
  if (turnsDisplay) turnsDisplay.textContent = gameState.stats.turnsPlayed;

  const marketDisplay = document.getElementById('marketDisplay');
  if (marketDisplay) {
    const tilesInMarket = gameState.market.filter(t => t !== null).length;
    marketDisplay.textContent = tilesInMarket;
  }
}

function updatePhaseControls(gameState) {
  const controls = document.getElementById('phaseControls');
  if (!controls) return;

  const player = gameState.players[gameState.currentPlayerIndex];
  if (!player.isHuman) {
    controls.style.display = 'none';
    return;
  }

  controls.style.display = 'block';
  let html = '';

  if (gameState.gamePhase === 'sweep' && gameState.bonusTileAvailable) {
    html = `<p style="margin: 0; font-weight: bold; color: green;">Bonus tile available! Click a market tile.</p>`;
  } else if (gameState.gamePhase === 'place') {
    const ui = window._gameUI;
    const placementCount = ui.placementMap ? Object.keys(ui.placementMap).length : 0;
    const allPlaced = placementCount === gameState.pendingSweepTiles.length;

    html = `
      <p style="margin: 0 0 5px 0;">Drag tiles from working area onto board</p>
      <p style="margin: 0 0 5px 0; font-size: 7px;">Placed: <strong>${placementCount}/${gameState.pendingSweepTiles.length}</strong></p>
      <button id="placementDone" style="padding: 4px 10px; font-size: 8px; background: ${allPlaced ? '#90EE90' : '#ddd'}; cursor: ${allPlaced ? 'pointer' : 'not-allowed'}; color: black; border: 1px solid #999; font-weight: bold;" ${allPlaced ? '' : 'disabled'}>Done</button>
    `;
  } else if (gameState.gamePhase === 'claim') {
    const ui = window._gameUI;
    const currentPlayer = gameState.players[gameState.currentPlayerIndex];

    if (ui.removableTiles && ui.removableTiles.length > 0) {
      // In tile removal phase - show instructions
      html = `<p style="margin: 0; font-weight: bold; color: #FF6B6B;">Click a highlighted tile to remove it</p>`;
    } else {
      // In card selection phase - show claimable cards
      const claimableCards = [];

      for (const card of gameState.cardMarket) {
        const matches = getPatternMatches(currentPlayer.board, card.pattern);
        if (matches.length > 0) {
          claimableCards.push({ card, matches });
        }
      }

      if (claimableCards.length === 0) {
        html = `<button id="skipClaim" style="padding: 3px 8px; font-size: 8px; cursor: pointer;">Skip Claim</button>`;
        setTimeout(() => {
          const btn = document.getElementById('skipClaim');
          if (btn) btn.addEventListener('click', () => window._gameUI.onSkipClaim());
        }, 0);
      } else {
        html = `<div style="font-size: 7px;"><strong>Click card to claim:</strong></div>`;
        html += `<button id="skipClaim" style="padding: 3px 8px; margin-top: 2px; font-size: 8px; cursor: pointer;">Skip Claim</button>`;

        setTimeout(() => {
          const skipBtn = document.getElementById('skipClaim');
          if (skipBtn) skipBtn.addEventListener('click', () => window._gameUI.onSkipClaim());
        }, 0);
      }
    }
  }

  controls.innerHTML = html;

  // Use event delegation for placement done button
  const placementDoneBtn = controls.querySelector('#placementDone');
  if (placementDoneBtn && gameState.gamePhase === 'place') {
    placementDoneBtn.addEventListener('click', handlePlacementDone);
  }
}

function handlePlacementDone(e) {
  const ui = window._gameUI;
  if (!ui) return;

  const placements = [];
  for (let i = 0; i < ui.gameState.pendingSweepTiles.length; i++) {
    if (ui.placementMap && ui.placementMap[i] !== undefined) {
      placements.push(ui.placementMap[i]);
    }
  }
  if (placements.length === ui.gameState.pendingSweepTiles.length) {
    ui.onPlacementSubmit(placements);
    ui.placementMap = {};
  }
}

function showRemovalUI(gameState, cardId) {
  const player = gameState.players[gameState.currentPlayerIndex];
  const card = gameState.cardMarket.find(c => c.id === cardId);
  const matches = getPatternMatches(player.board, card.pattern);

  if (matches.length === 0) {
    alert('Pattern not found');
    return;
  }

  const match = matches[0];
  const patternCells = getAllPatternCells(card.pattern, match.row, match.col, match.rotation);

  const ui = window._gameUI;
  ui.removableTiles = patternCells;
  ui.claimingCardId = cardId;

  updateGameDisplay(gameState);
}

function getAllPatternCells(pattern, row, col, rotation) {
  const rotated = rotatePattern(pattern, rotation);
  const cells = [];
  const boardIndices = [
    row * BOARD_SIZE + col,
    row * BOARD_SIZE + col + 1,
    (row + 1) * BOARD_SIZE + col,
    (row + 1) * BOARD_SIZE + col + 1,
  ];

  for (let i = 0; i < 4; i++) {
    if (rotated[i]) {
      cells.push(boardIndices[i]);
    }
  }

  return cells;
}

function rotatePattern(pattern, turns) {
  let p = [...pattern];
  for (let i = 0; i < turns % 4; i++) {
    p = [p[2], p[0], p[3], p[1]];
  }
  return p;
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
