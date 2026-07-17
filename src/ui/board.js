import { BOARD_SIZE, CARD_MARKET_SIZE, REWARD_CARDS } from '../engine/tiles.js';
import { getPatternMatches, getLegalDestinations, ROW_VALUES } from '../engine/game.js';

const DIFFICULTY_LABELS = {
  'basic': 'Basic',
  'mcts-1': 'Easy',
  'mcts-2': 'Medium',
  'mcts-3': 'Hard',
  'mcts-4': 'Expert'
};

function getDifficultyLabel(difficulty) {
  return DIFFICULTY_LABELS[difficulty] || difficulty;
}

export function showRulesModal() {
  const modal = document.createElement('div');
  modal.className = 'ft-modal';
  modal.innerHTML = `
    <div class="ft-modal__inner">
      <button class="ft-modal__close" aria-label="Close rules">✕</button>
      <div class="ft-modal__title">
        <h2>How to Play</h2>
      </div>
      <div class="ft-rules">
        <div class="ft-rules__section">
          <div class="ft-rules__section-title">Goal</div>
          <div class="ft-rules__text">Collect patisserie reward cards by building colour patterns on your board. Each card is worth victory points, and every card you claim lets you move one tile onto your tiered cake stand, where filling a row scores escalating points.</div>
        </div>

        <div class="ft-rules__section">
          <div class="ft-rules__section-title">Your Turn (5 Steps)</div>

          <div class="ft-rules__step">
            <div class="ft-rules__step-title">1. Sweep</div>
            <div class="ft-rules__text">Choose a row or column from the market. Declare either a colour or an ingredient symbol. Take all tiles matching your declaration.</div>
            <div class="ft-rules__text"><strong>Bonus:</strong> If you clear a row/column completely, take 1 extra tile from anywhere on the market.</div>
          </div>

          <div class="ft-rules__step">
            <div class="ft-rules__step-title">2. Place Tiles</div>
            <div class="ft-rules__text">Place all swept tiles anywhere on your 5×5 board. No adjacency required — tiles can go in any empty cells.</div>
          </div>

          <div class="ft-rules__step">
            <div class="ft-rules__step-title">3. Move Tiles (Optional)</div>
            <div class="ft-rules__text">You may spend 1 cupcake to move one tile — or one tart token (a blocked space) — from its current cell to any other empty cell on your board. You can move at most one tile or tart per turn.</div>
          </div>

          <div class="ft-rules__step">
            <div class="ft-rules__step-title">4. Claim (Optional)</div>
            <div class="ft-rules__text">If tiles on your board match a card's colour pattern (in any rotation or reflection), you may claim it.</div>
            <div class="ft-rules__text">When claiming: remove 1 tile from the pattern, then place it on your cake stand or in your crumb tray. Each ingredient can only ever be placed on ONE stand row — the first tile you plate locks that ingredient to that row, and no other row can ever hold it. Once that row is full (or if you choose not to extend it), any further tiles of that ingredient must go to the crumb tray. The crumb tray always accepts any tile and is worth 1 point each.</div>
            <div class="ft-rules__text"><strong>Blocked Spaces:</strong> The cell where you removed the tile becomes a permanently blocked space, marked by a croissant icon. No new tiles can be placed on blocked spaces, and they break pattern matching.</div>
          </div>

          <div class="ft-rules__step">
            <div class="ft-rules__step-title">5. Refill Market</div>
            <div class="ft-rules__text">If 6 or fewer tiles remain on the market, refill from the bag.</div>
          </div>
        </div>

        <div class="ft-rules__section">
          <div class="ft-rules__section-title">Cupcakes</div>
          <div class="ft-rules__text">You start the game with 4 cupcakes. Once per turn (step 3), you may spend 1 cupcake to move one tile or tart token on your board to a different empty cell. At game end, each unspent cupcake is worth 1 point.</div>
        </div>

        <div class="ft-rules__section">
          <div class="ft-rules__section-title">Scoring</div>
          <div class="ft-rules__text">Your final score adds up four things:</div>
          <div class="ft-rules__text"><strong>Cake stand:</strong> each row scores by how many plates it fills — bottom row 3 / 6 / 10 / 15, and shorter rows top out sooner (their values are printed under the plates).</div>
          <div class="ft-rules__text"><strong>Crumb tray:</strong> 1 point per tile.</div>
          <div class="ft-rules__text"><strong>Card VP:</strong> the victory-point value shown on each claimed card.</div>
          <div class="ft-rules__text"><strong>Cupcakes:</strong> 1 point for each remaining cupcake.</div>
        </div>

        <div class="ft-rules__section">
          <div class="ft-rules__section-title">Game Ends When</div>
          <div class="ft-rules__text">• The last card is claimed from the card market, OR</div>
          <div class="ft-rules__text">• A player's board is completely full (tiles + tarts) at the start of their turn — the game ends immediately, OR</div>
          <div class="ft-rules__text">• A player sweeps more tiles than their board can hold (every other player then takes one final turn), OR</div>
          <div class="ft-rules__text">• All market tiles are gone and the bag is empty</div>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  const closeBtn = modal.querySelector('.ft-modal__close');
  closeBtn.addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });
};

export function renderSetupScreen(container, onStart) {
  container.innerHTML = `
    <div class="ft-setup">
      <div class="ft-setup__title">
        <h1>Fancy That!</h1>
        <p class="ft-setup__intro">Configure your game</p>
      </div>

      <div class="ft-setup__section">
        <label class="ft-setup__label">Number of Players</label>
        <select id="playerCount" class="ft-setup__select">
          <option value="2" selected>2 Players</option>
          <option value="3">3 Players</option>
          <option value="4">4 Players</option>
        </select>
      </div>

      <div id="playerSetup" class="ft-setup__section"></div>

      <div style="display: flex; gap: var(--spacing-sm); margin-bottom: var(--spacing-md);">
        <button id="rulesButton" class="ft-btn ft-btn--secondary" style="flex: 1;">📖 Rules</button>
        <button id="startButton" class="ft-btn ft-btn--primary" style="flex: 2; padding: 12px;">Start Game</button>
      </div>
    </div>
  `;

  const playerCount = document.getElementById('playerCount');
  const playerSetup = document.getElementById('playerSetup');
  const startButton = document.getElementById('startButton');
  const rulesButton = document.getElementById('rulesButton');

  function updatePlayerSetup() {
    const count = parseInt(playerCount.value);
    let html = '';
    for (let i = 0; i < count; i++) {
      const isPlayer1 = i === 0;
      html += `
        <div class="ft-setup__player-row">
          <span class="ft-setup__player-label">Player ${i + 1}</span>
          <div class="ft-setup__toggle-group">
            <button class="ft-setup__toggle-btn ${isPlayer1 ? '' : 'active'}" data-player="${i}" data-type="ai">AI</button>
            <button class="ft-setup__toggle-btn ${isPlayer1 ? 'active' : ''}" data-player="${i}" data-type="human">Human</button>
          </div>
          <div id="player${i}DifficultyWrap" class="ft-setup__difficulty-group" style="${isPlayer1 ? 'display: none;' : ''}">
            <button class="ft-setup__difficulty-btn" data-player="${i}" data-difficulty="basic">Basic</button>
            <button class="ft-setup__difficulty-btn" data-player="${i}" data-difficulty="mcts-1">Easy</button>
            <button class="ft-setup__difficulty-btn" data-player="${i}" data-difficulty="mcts-2">Medium</button>
            <button class="ft-setup__difficulty-btn ${i === 0 ? '' : 'active'}" data-player="${i}" data-difficulty="mcts-3">Hard</button>
            <button class="ft-setup__difficulty-btn" data-player="${i}" data-difficulty="mcts-4">Expert</button>
          </div>
        </div>
      `;
    }
    playerSetup.innerHTML = html;

    // Setup toggle buttons for Human/AI
    for (let i = 0; i < count; i++) {
      const toggleBtns = playerSetup.querySelectorAll(`[data-player="${i}"][data-type]`);
      const difficultyWrap = document.getElementById(`player${i}DifficultyWrap`);

      toggleBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          toggleBtns.forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          if (difficultyWrap) {
            difficultyWrap.style.display = btn.dataset.type === 'ai' ? '' : 'none';
          }
        });
      });
    }

    // Setup difficulty buttons
    for (let i = 0; i < count; i++) {
      const diffBtns = playerSetup.querySelectorAll(`[data-player="${i}"][data-difficulty]`);
      diffBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          diffBtns.forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
        });
      });
    }
  }

  playerCount.addEventListener('change', updatePlayerSetup);
  updatePlayerSetup();

  rulesButton.addEventListener('click', showRulesModal);

  startButton.addEventListener('click', () => {
    const count = parseInt(playerCount.value);
    const playerConfigs = [];
    for (let i = 0; i < count; i++) {
      const toggleBtns = playerSetup.querySelectorAll(`[data-player="${i}"][data-type]`);
      const diffBtns = playerSetup.querySelectorAll(`[data-player="${i}"][data-difficulty]`);

      const activeType = Array.from(toggleBtns).find(b => b.classList.contains('active'));
      const activeDiff = Array.from(diffBtns).find(b => b.classList.contains('active'));

      const type = activeType?.dataset.type || 'human';
      const difficulty = activeDiff?.dataset.difficulty || 'mcts-3';
      const isHuman = type === 'human';
      const typeSuffix = isHuman ? 'Human' : `AI ${getDifficultyLabel(difficulty)}`;

      playerConfigs.push({
        name: `Player ${i + 1} (${typeSuffix})`,
        isHuman,
        aiDifficulty: isHuman ? null : difficulty,
      });
    }
    onStart(playerConfigs);
  });
}

export function renderGameScreen(container, gameState, onMarketClick, onBonusTile, onPlacementSubmit, onClaimSubmit, onSkipClaim, onSkipMove, onMoveTile, onCupcakeClick) {
  const playerCount = gameState.players.length;

  container.innerHTML = `
    <div class="ft-game">
      <!-- Player 1 Panel (Active/Human) - Grid position: col 1, row 1 -->
      <div class="ft-panel ft-panel--player1" id="playerPanel1" style="grid-column: 1; grid-row: 1; display: flex; flex-direction: row; gap: var(--spacing-lg);">
        <div id="playerScore1" style="flex-shrink: 0; min-width: 200px; overflow-y: auto; max-height: 550px;"></div>
        <div style="display: flex; flex-direction: column; align-items: center; flex: 1;">
          <div class="ft-panel__header" style="width: 100%; padding: 0 0 var(--spacing-sm) 0; border-bottom: 1px solid var(--color-border); margin-bottom: var(--spacing-sm);">
            <h2 class="ft-panel__title" id="player1Header">🎮 Your Board</h2>
          </div>
          <div style="text-align: center; font-size: 12px; color: var(--color-text-secondary); margin: var(--spacing-sm) 0;">Swept Tiles</div>
          <div id="workingArea1" class="ft-working-area ft-hidden"></div>
          <div id="playerBoard1" class="ft-board-grid"></div>
          <div id="phaseControls" style="width: 100%; margin-top: var(--spacing-md);"></div>
        </div>
      </div>

      <!-- Market Panel - Grid position: col 2, row 1 -->
      <div class="ft-panel" style="grid-column: 2; grid-row: 1; display: grid; grid-template-columns: 1fr auto; gap: var(--spacing-lg);">
        <div style="display: flex; flex-direction: column; gap: var(--spacing-md);">
          <div class="ft-panel__header">
            <h2 class="ft-panel__title">Tile Market</h2>
          </div>
          <div id="marketContainer" style="display: grid; grid-template-columns: var(--tile-size) repeat(${gameState.marketSize}, var(--tile-size)); grid-template-rows: var(--tile-size) repeat(${gameState.marketSize}, var(--tile-size)); gap: 2px;">
            <div style="grid-column: 2 / span ${gameState.marketSize}; grid-row: 1; display: flex; gap: var(--tile-gap);" id="marketColButtons"></div>
            <div style="grid-column: 1; grid-row: 2 / span ${gameState.marketSize}; display: flex; flex-direction: column; gap: var(--tile-gap);" id="marketRowButtons"></div>
            <div id="market" class="ft-market-grid" style="grid-column: 2 / span ${gameState.marketSize}; grid-row: 2 / span ${gameState.marketSize}; display: grid; grid-template-columns: repeat(${gameState.marketSize}, var(--tile-size)); grid-template-rows: repeat(${gameState.marketSize}, var(--tile-size)); gap: 2px;"></div>
          </div>
        </div>
        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center;">
          <button id="gameRulesButton" class="ft-btn-rules" title="Show rules">
            <div style="font-size: 32px; margin-bottom: var(--spacing-sm);">📖</div>
            <div style="font-size: 12px; font-weight: 600;">Rules</div>
          </button>
        </div>
      </div>

      <!-- Player 3 Panel - Grid position: col 3, row 1 -->
      <div class="ft-panel ft-panel--player3" id="playerPanel3" style="grid-column: 3; grid-row: 1; display: ${playerCount >= 3 ? 'flex' : 'none'}; flex-direction: row; gap: var(--spacing-lg);">
        <div id="playerScore3" style="flex-shrink: 0; min-width: 200px; overflow-y: auto; max-height: 550px;"></div>
        <div style="display: flex; flex-direction: column; align-items: center; flex: 1;">
          <div class="ft-panel__header" style="width: 100%; padding: 0 0 var(--spacing-sm) 0; border-bottom: 1px solid var(--color-border); margin-bottom: var(--spacing-sm);">
            <h2 class="ft-panel__title">${gameState.players[2]?.isHuman ? '🧑' : '🤖'} Player 3</h2>
          </div>
          <div id="workingArea3" class="ft-working-area ft-hidden"></div>
          <div id="playerBoard3" class="ft-board-grid"></div>
        </div>
      </div>

      <!-- Player 2 Panel - Grid position: col 1, row 2 -->
      <div class="ft-panel ft-panel--player2" id="playerPanel2" style="grid-column: 1; grid-row: 2; display: ${playerCount >= 2 ? 'flex' : 'none'}; flex-direction: row; gap: var(--spacing-lg);">
        <div id="playerScore2" style="flex-shrink: 0; min-width: 200px; overflow-y: auto; max-height: 550px;"></div>
        <div style="display: flex; flex-direction: column; align-items: center; flex: 1;">
          <div class="ft-panel__header" style="width: 100%; padding: 0 0 var(--spacing-sm) 0; border-bottom: 1px solid var(--color-border); margin-bottom: var(--spacing-sm);">
            <h2 class="ft-panel__title">${gameState.players[1]?.isHuman ? '🧑' : '🤖'} Player 2</h2>
          </div>
          <div id="workingArea2" class="ft-working-area ft-hidden"></div>
          <div id="playerBoard2" class="ft-board-grid"></div>
        </div>
      </div>

      <!-- Info Panel - Grid position: col 2, row 2 -->
      <div class="ft-panel" style="grid-column: 2; grid-row: 2;">
        <div class="ft-panel__header">
          <h2 class="ft-panel__title" id="currentPlayer">Turn</h2>
          <div id="thinkingProgressContainer" style="display: none; margin-top: var(--spacing-sm); width: 100%;">
            <div style="height: 6px; background-color: #E0E7FF; border-radius: 3px; overflow: hidden;">
              <div id="thinkingProgressBar" style="height: 100%; background-color: #3B82F6; width: 0%; transition: width 0.2s ease;"></div>
            </div>
          </div>
        </div>
        <div id="cardProgress" style="padding: var(--spacing-md); background: #FAFAFA; border-radius: var(--radius-md);">
          <div style="font-size: 12px; color: var(--color-text-secondary); font-weight: 600; margin-bottom: var(--spacing-sm);">Cards Claimed</div>
          <div style="display: flex; align-items: center; gap: var(--spacing-sm);">
            <div style="flex: 1; height: 8px; background-color: var(--color-border); border-radius: 4px; overflow: hidden;">
              <div id="cardProgressBar" style="height: 100%; background-color: var(--color-accent); width: 0%; transition: width 0.3s ease;"></div>
            </div>
            <div id="cardProgressText" style="font-weight: 700; font-size: 14px; min-width: 50px; text-align: right; color: var(--color-accent);">0/0</div>
          </div>
        </div>
        <div id="cardMarket" class="ft-card-grid"></div>
        <div class="ft-info-block">
          <div class="ft-info-block__content" id="gameInfo">Phase: setup</div>
          <div class="ft-text-small" style="margin-top: var(--spacing-xs);">
            Turns: <span id="turnsDisplay">0</span> | Market: <span id="marketDisplay">36</span>
          </div>
        </div>
      </div>

      <!-- Player 4 Panel - Grid position: col 3, row 2 -->
      <div class="ft-panel ft-panel--player4" id="playerPanel4" style="grid-column: 3; grid-row: 2; display: ${playerCount >= 4 ? 'flex' : 'none'}; flex-direction: row; gap: var(--spacing-lg);">
        <div id="playerScore4" style="flex-shrink: 0; min-width: 200px; overflow-y: auto; max-height: 550px;"></div>
        <div style="display: flex; flex-direction: column; align-items: center; flex: 1;">
          <div class="ft-panel__header" style="width: 100%; padding: 0 0 var(--spacing-sm) 0; border-bottom: 1px solid var(--color-border); margin-bottom: var(--spacing-sm);">
            <h2 class="ft-panel__title">${gameState.players[3]?.isHuman ? '🧑' : '🤖'} Player 4</h2>
          </div>
          <div id="workingArea4" class="ft-working-area ft-hidden"></div>
          <div id="playerBoard4" class="ft-board-grid"></div>
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
    onSkipMove,
    onMoveTile,
    onCupcakeClick,
    gameState,
    selectedPlacements: [],
    placementMap: {},
    removableTiles: [],
    claimingCardId: null,
    removedBoardIndex: null,
    destinationChoices: null,
    dragSetupDone: false,
    cupcakeMode: false,
    lastPlayerIndex: -1,
  };

  const gameRulesButton = document.getElementById('gameRulesButton');
  if (gameRulesButton) {
    gameRulesButton.addEventListener('click', showRulesModal);
  }

  setupDragAndDrop(gameState);
}

export function renderEndScreen(container, gameState, onPlayAgain, onBackToSetup, gameStats) {
  const playerResults = gameState.players.map(player => {
    const breakdown = getScoreBreakdown(player);
    return { player, breakdown, totalScore: breakdown.total };
  });

  const winnerResult = playerResults.reduce((max, result) =>
    result.totalScore > max.totalScore ? result : max
  );

  let html = `
    <div class="ft-end-screen">
      <div class="ft-end-screen__panel">
        <div class="ft-end-screen__title">
          <h1>Game Over</h1>
        </div>

        <div class="ft-end-screen__winner">
          <div class="ft-end-screen__winner-name">${winnerResult.player.name}</div>
          <div style="font-size: 14px; color: var(--color-accent-gold); margin-top: var(--spacing-sm);">wins with ${winnerResult.totalScore} points!</div>
        </div>

        <div class="ft-end-screen__results">
          <table class="ft-end-screen__results-table">
            <thead>
              <tr>
                <th>Player</th>
                <th>Cards</th>
                <th>Cake Stand</th>
                <th>Crumbs</th>
                <th>Card VP</th>
                <th>Cupcakes</th>
                <th>Score</th>
              </tr>
            </thead>
            <tbody>
  `;

  for (const result of playerResults) {
    const isWinner = result === winnerResult ? 'winner' : '';
    const bd = result.breakdown;
    html += `
      <tr class="${isWinner}">
        <td style="font-weight: 600;">${result.player.name}</td>
        <td>${result.player.claimedCards.length}</td>
        <td>${bd.standTotal}</td>
        <td>${bd.crumbs}</td>
        <td>${bd.cardVP}</td>
        <td>${bd.cupcakes}</td>
        <td class="ft-end-screen__score ${result.totalScore === 0 ? 'zero' : ''}">${result.totalScore}</td>
      </tr>
    `;
  }

  html += `
            </tbody>
          </table>
        </div>

        <div class="ft-end-screen__stats">
          <h3>Game Statistics</h3>
          <div class="ft-end-screen__stats-grid">
            <div class="ft-stat-box">
              <div class="ft-stat-label">Turns Played</div>
              <div class="ft-stat-value">${gameState.stats.turnsPlayed}</div>
            </div>
            <div class="ft-stat-box">
              <div class="ft-stat-label">Market Refills</div>
              <div class="ft-stat-value">${gameStats?.marketFills || 0}</div>
            </div>
            <div class="ft-stat-box">
              <div class="ft-stat-label">Tiles Taken</div>
              <div class="ft-stat-value">${gameStats?.totalTilesTaken || 0} / 100</div>
            </div>
            <div class="ft-stat-box">
              <div class="ft-stat-label">Total Sweeps</div>
              <div class="ft-stat-value">${gameStats?.sweepCount || 0}</div>
            </div>
            <div class="ft-stat-box">
              <div class="ft-stat-label">Avg Sweep Size</div>
              <div class="ft-stat-value">${gameStats?.avgSweepSize || '0.0'}</div>
            </div>
            <div class="ft-stat-box">
              <div class="ft-stat-label">Max Sweep</div>
              <div class="ft-stat-value">${gameStats?.maxSweepSize || 0}</div>
            </div>
            <div class="ft-stat-box">
              <div class="ft-stat-label">Cards Claimed</div>
              <div class="ft-stat-value">${gameStats?.totalCardsClaimed || 0}</div>
            </div>
            <div class="ft-stat-box">
              <div class="ft-stat-label">Avg Card Market Life</div>
              <div class="ft-stat-value">${gameStats?.cardMarketAvgLifetime || '0'} turns</div>
            </div>
          </div>
        </div>

        <div class="ft-end-screen__buttons">
          <button id="playAgainBtn" class="ft-btn ft-btn--primary">Play Again</button>
          <button id="backToSetupBtn" class="ft-btn ft-btn--secondary">Back to Setup</button>
        </div>
      </div>
    </div>
  `;

  container.innerHTML = html;

  document.getElementById('playAgainBtn')?.addEventListener('click', onPlayAgain);
  document.getElementById('backToSetupBtn')?.addEventListener('click', onBackToSetup);
}

export function setThinkingState(playerName, isThinking) {
  const element = document.getElementById('currentPlayer');
  const containerElement = document.getElementById('thinkingProgressContainer');
  if (!element) return;

  if (isThinking) {
    element.textContent = `🤔 ${playerName} is thinking…`;
    if (containerElement) containerElement.style.display = 'block';
  } else {
    if (containerElement) containerElement.style.display = 'none';
    updateGameDisplay(window._gameUI?.gameState);
  }
}

export function setThinkingProgress(playerName, progress) {
  const textElement = document.getElementById('currentPlayer');
  const containerElement = document.getElementById('thinkingProgressContainer');
  const progressBar = document.getElementById('thinkingProgressBar');

  if (!textElement || !containerElement || !progressBar) return;

  if (progress !== null && progress !== undefined && progress > 0) {
    textElement.textContent = `🤔 ${playerName} is thinking… (${progress}%)`;
    containerElement.style.display = 'block';
    progressBar.style.width = `${progress}%`;
  } else {
    textElement.textContent = `🤔 ${playerName} is thinking…`;
    containerElement.style.display = 'block';
    progressBar.style.width = '0%';
  }
}

export function updateGameDisplay(gameState) {
  const ui = window._gameUI;
  if (!ui) return;

  ui.gameState = gameState;

  // Reset cupcake mode if player has changed
  if (ui.lastPlayerIndex !== gameState.currentPlayerIndex) {
    ui.cupcakeMode = false;
    ui.lastPlayerIndex = gameState.currentPlayerIndex;
  }

  const currentPlayer = gameState.players[gameState.currentPlayerIndex];
  document.getElementById('currentPlayer').textContent = `${currentPlayer.name}'s Turn (${gameState.gamePhase})`;

  // Update Player 1 header based on human/AI status
  const player1Header = document.getElementById('player1Header');
  if (player1Header) {
    const player1 = gameState.players[0];
    player1Header.textContent = player1.isHuman ? '🎮 Your Board' : '🤖 Player 1';
  }

  // Update active player indicator
  for (let i = 1; i <= 4; i++) {
    const panel = document.getElementById(`playerPanel${i}`);
    if (panel) {
      if (i - 1 === gameState.currentPlayerIndex) {
        panel.classList.add('ft-panel--active');
      } else {
        panel.classList.remove('ft-panel--active');
      }
    }
  }

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

  market.innerHTML = gameState.market.map((tile, idx) => {
    const isEmpty = !tile;
    const isBonusAvailable = tile && gameState.bonusTileAvailable;
    const tileClass = isEmpty ? 'ft-tile ft-tile--empty' : 'ft-tile ft-tile--placed';

    return `
      <div class="${tileClass} market-tile" data-index="${idx}" style="${isEmpty ? 'opacity: 0.3;' : ''} ${isBonusAvailable ? 'cursor: pointer;' : ''} background-color: ${tile ? getColourCSS(tile.colour) : 'white'};">
        ${tile ? `<img src="images/symbol_${tile.ingredient}.png" class="ft-tile__icon" alt="${tile.ingredient}">` : ''}
      </div>
    `;
  }).join('');

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

  const colLabels = ['A', 'B', 'C', 'D', 'E', 'F'].slice(0, gameState.marketSize);

  marketColButtons.innerHTML = colLabels.map((label, col) => `
    <button class="ft-btn ft-btn--sweep market-col-btn" data-col="${col}" style="width: var(--tile-size); height: var(--tile-size); display: flex; align-items: center; justify-content: center; gap: var(--spacing-xs); flex-shrink: 0;">
      <img src="images/arrow_down.png" style="width: 16px; height: 16px; object-fit: contain;">
      <span style="font-weight: 600;">${label}</span>
    </button>
  `).join('');

  marketRowButtons.innerHTML = Array.from({ length: gameState.marketSize }, (_, row) => `
    <button class="ft-btn ft-btn--sweep market-row-btn" data-row="${row}" style="width: var(--tile-size); height: var(--tile-size); display: flex; align-items: center; justify-content: center; gap: var(--spacing-xs); flex-shrink: 0;">
      <img src="images/arrow_left.png" style="width: 16px; height: 16px; object-fit: contain;">
      <span style="font-weight: 600;">${row + 1}</span>
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
  for (let c = 0; c < gameState.marketSize; c++) {
    tiles.push(gameState.market[row * gameState.marketSize + c]);
  }

  const colours = new Set();
  const ingredients = new Set();
  for (const tile of tiles) {
    if (tile) {
      colours.add(tile.colour);
      ingredients.add(tile.ingredient);
    }
  }

  let html = `
    <div class="ft-modal__title">
      <h2>Row ${row + 1}</h2>
      <p style="color: var(--color-text-secondary); margin: var(--spacing-sm) 0 0 0;">Select by colour or ingredient</p>
    </div>

    <div class="ft-modal__section">
      <div class="ft-modal__section-title">Colours</div>
      <div class="ft-modal__options">
  `;

  for (const colour of colours) {
    const count = tiles.filter(t => t && t.colour === colour).length;
    html += `
      <button class="ft-modal__option sweep-option-btn" data-row="${row}" data-col="-1" data-type="colour" data-val="${colour}">
        <div class="ft-modal__option-colour" style="background-color: ${getColourCSS(colour)};"></div>
        <span style="font-weight: 600;">${colour}</span>
        <span style="font-size: 11px; color: var(--color-text-secondary);">(${count})</span>
      </button>
    `;
  }

  html += `
      </div>
    </div>

    <div class="ft-modal__section">
      <div class="ft-modal__section-title">Ingredients</div>
      <div class="ft-modal__options">
  `;

  for (const ing of ingredients) {
    const count = tiles.filter(t => t && t.ingredient === ing).length;
    html += `
      <button class="ft-modal__option sweep-option-btn" data-row="${row}" data-col="-1" data-type="symbol" data-val="${ing}">
        <img src="images/symbol_${ing}.png" class="ft-modal__option-icon" alt="${ing}">
        <span style="font-size: 11px; color: var(--color-text-secondary);">(${count})</span>
      </button>
    `;
  }

  html += `
      </div>
    </div>
  `;

  const modal = document.createElement('div');
  modal.className = 'ft-modal';
  modal.innerHTML = `
    <div class="ft-modal__inner">
      <button class="ft-modal__close">×</button>
      ${html}
    </div>
  `;
  document.body.appendChild(modal);

  modal.querySelector('.ft-modal__close').addEventListener('click', () => modal.remove());

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
  for (let r = 0; r < gameState.marketSize; r++) {
    tiles.push(gameState.market[r * gameState.marketSize + col]);
  }

  const colours = new Set();
  const ingredients = new Set();
  for (const tile of tiles) {
    if (tile) {
      colours.add(tile.colour);
      ingredients.add(tile.ingredient);
    }
  }

  const colLabels = ['A', 'B', 'C', 'D', 'E', 'F'].slice(0, gameState.marketSize);
  let html = `
    <div class="ft-modal__title">
      <h2>Column ${colLabels[col]}</h2>
      <p style="color: var(--color-text-secondary); margin: var(--spacing-sm) 0 0 0;">Select by colour or ingredient</p>
    </div>

    <div class="ft-modal__section">
      <div class="ft-modal__section-title">Colours</div>
      <div class="ft-modal__options">
  `;

  for (const colour of colours) {
    const count = tiles.filter(t => t && t.colour === colour).length;
    html += `
      <button class="ft-modal__option sweep-option-btn" data-row="-1" data-col="${col}" data-type="colour" data-val="${colour}">
        <div class="ft-modal__option-colour" style="background-color: ${getColourCSS(colour)};"></div>
        <span style="font-weight: 600;">${colour}</span>
        <span style="font-size: 11px; color: var(--color-text-secondary);">(${count})</span>
      </button>
    `;
  }

  html += `
      </div>
    </div>

    <div class="ft-modal__section">
      <div class="ft-modal__section-title">Ingredients</div>
      <div class="ft-modal__options">
  `;

  for (const ing of ingredients) {
    const count = tiles.filter(t => t && t.ingredient === ing).length;
    html += `
      <button class="ft-modal__option sweep-option-btn" data-row="-1" data-col="${col}" data-type="symbol" data-val="${ing}">
        <img src="images/symbol_${ing}.png" class="ft-modal__option-icon" alt="${ing}">
        <span style="font-size: 11px; color: var(--color-text-secondary);">(${count})</span>
      </button>
    `;
  }

  html += `
      </div>
    </div>
  `;

  const modal = document.createElement('div');
  modal.className = 'ft-modal';
  modal.innerHTML = `
    <div class="ft-modal__inner">
      <button class="ft-modal__close">×</button>
      ${html}
    </div>
  `;
  document.body.appendChild(modal);

  modal.querySelector('.ft-modal__close').addEventListener('click', () => modal.remove());

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

  // reward_card_layout.png is a TTS-style 10×7 sheet; cards 1–50 fill the
  // first 5 rows, the last 2 rows are blank.
  const SPRITE_WIDTH = 7501;
  const SPRITE_HEIGHT = 7277;
  const CARDS_PER_ROW = 10;
  const CARDS_PER_COL = 7;
  const CARD_WIDTH = SPRITE_WIDTH / CARDS_PER_ROW;
  const CARD_HEIGHT = SPRITE_HEIGHT / CARDS_PER_COL;
  const DISPLAY_HEIGHT = 260;
  const DISPLAY_WIDTH = CARD_WIDTH * (DISPLAY_HEIGHT / CARD_HEIGHT);
  const SCALE = DISPLAY_HEIGHT / CARD_HEIGHT;

  const currentPlayer = gameState.players[gameState.currentPlayerIndex];
  const claimableCardIds = new Set();

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

    const spriteOffsetX = col * CARD_WIDTH;
    const spriteOffsetY = row * CARD_HEIGHT;

    const bgPosX = -(spriteOffsetX * SCALE);
    const bgPosY = -(spriteOffsetY * SCALE);
    const bgSizeW = SPRITE_WIDTH * SCALE;
    const bgSizeH = SPRITE_HEIGHT * SCALE;

    const cardClass = isClaimable ? 'ft-card ft-card--claimable' : 'ft-card';
    const clickable = isClaimable && gameState.gamePhase === 'claim' ? 'cursor: pointer;' : '';

    return `
      <div data-card-id="${cardId}" class="card-market-sprite ${cardClass}" style="position: relative; width: ${DISPLAY_WIDTH}px; height: ${DISPLAY_HEIGHT}px; background-image: url('images/reward_card_layout.png?v=2'); background-position: ${bgPosX}px ${bgPosY}px; background-size: ${bgSizeW}px ${bgSizeH}px; background-repeat: no-repeat; ${clickable}">
        <div class="ft-card__vp" title="${card.vp} victory point${card.vp === 1 ? '' : 's'}">${card.vp}</div>
      </div>
    `;
  }).join('');

  cardMarket.innerHTML = cardsHTML;

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
      const isBlockedCell = tile && typeof tile === 'object' && tile.type === 'blocked';
      const isDropTarget = isCurrentPlayer && isPlacingPhase && player.isHuman;
      const isRemovable = isCurrentPlayer && ui.removableTiles && ui.removableTiles.includes(idx);
      const isInCupcakeMode = isCurrentPlayer && player.isHuman && ui.cupcakeMode;
      // A cupcake may relocate either a tile OR a tart token (blocked cell) — any
      // non-empty cell is a valid move source. Only empty cells are move targets.
      const isMovableInCupcakeMode = isInCupcakeMode && tile !== null;
      const isMoveTarget = isInCupcakeMode && tile === null;

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
      let tileClass = 'ft-tile board-tile';
      if (isBlockedCell) {
        tileClass += ' ft-tile--blocked';
        if (isMovableInCupcakeMode) tileClass += ' ft-tile--movable';
      } else if (!displayTile) {
        tileClass += ' ft-tile--empty';
        if (isMoveTarget) tileClass += ' ft-tile--move-target';
      } else {
        tileClass += ' ft-tile--placed';
        if (pendingTile && !tile) tileClass += ' ft-tile--ghost';
        if (isRemovable) tileClass += ' ft-tile--removable';
        if (isMovableInCupcakeMode) tileClass += ' ft-tile--movable';
      }

      const bgColor = (displayTile && !isBlockedCell) ? `background-color: ${getColourCSS(displayTile.colour)};` : '';
      const imageHtml = isBlockedCell
        ? `<img src="images/blocked_space.png" class="ft-tile__icon" alt="blocked">`
        : (displayTile ? `<img src="images/symbol_${displayTile.ingredient}.png" class="ft-tile__icon" alt="${displayTile.ingredient}">` : '');
      const draggableAttr = isMovableInCupcakeMode ? 'draggable="true"' : '';
      const boardTileIndexAttr = isMovableInCupcakeMode ? `data-board-tile-index="${idx}"` : '';

      return `
        <div class="${tileClass}" style="${bgColor}" data-index="${idx}" data-player="${playerIdx}" ${draggableAttr} ${boardTileIndexAttr}>
          ${imageHtml}
        </div>
      `;
    }).join('');

    if (showWorkingArea) {
      workingAreaEl.classList.remove('ft-hidden');
      workingAreaEl.innerHTML = gameState.pendingSweepTiles.map((tile, idx) => {
        const isPlaced = ui.placementMap && ui.placementMap[idx] !== undefined;
        return !isPlaced ? `
          <div class="ft-tile working-tile" draggable="true" data-tile-index="${idx}" style="background-color: ${getColourCSS(tile.colour)}; cursor: grab; user-select: none; flex-shrink: 0;" title="${tile.ingredient}">
            <img src="images/symbol_${tile.ingredient}.png" class="ft-tile__icon" style="pointer-events: none;" alt="${tile.ingredient}">
          </div>
        ` : '';
      }).join('');
    } else {
      workingAreaEl.classList.add('ft-hidden');
      workingAreaEl.innerHTML = '';
    }

    if (isCurrentPlayer && ui.removableTiles && ui.removableTiles.length > 0) {
      ui.removableTiles.forEach(idx => {
        const tileEl = boardEl.querySelector(`[data-index="${idx}"]`);
        if (tileEl) {
          tileEl.addEventListener('click', () => {
            // Step 2 → 3: a tile is chosen for removal. Move to the destination
            // step rather than committing — the player must now pick where the
            // removed tile goes (a stand row or the crumb tray).
            const tile = player.board[idx];
            ui.removedBoardIndex = idx;
            ui.destinationChoices = getLegalDestinations(player, tile);
            ui.removableTiles = [];
            updateGameDisplay(gameState);
          });
        }
      });
    }
  });
}

function setupDragAndDrop(gameState) {
  const ui = window._gameUI;
  if (ui.dragSetupDone) return;

  const workingArea = document.getElementById('workingArea1');
  const playerBoard = document.getElementById('playerBoard1');

  if (!workingArea || !playerBoard) return;

  ui.dragSetupDone = true;

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

  // Setup drag on board tiles (cupcake mode)
  playerBoard.addEventListener('dragstart', (e) => {
    if (!ui.cupcakeMode) return;
    try {
      const tileEl = e.target.closest('[data-board-tile-index]');
      if (tileEl) {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('boardTileFrom', tileEl.dataset.boardTileIndex);
        tileEl.style.opacity = '0.5';
      }
    } catch (err) {
      console.error('Dragstart error:', err);
    }
  }, false);

  playerBoard.addEventListener('dragend', (e) => {
    try {
      const tileEl = e.target.closest('[data-board-tile-index]');
      if (tileEl) {
        tileEl.style.opacity = '1';
      }
    } catch (err) {
      console.error('Dragend error:', err);
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

    // Check for board-to-board tile move (cupcake mode)
    const boardTileFrom = e.dataTransfer.getData('boardTileFrom');
    if (boardTileFrom !== '') {
      const fromIndex = parseInt(boardTileFrom);
      const rect = playerBoard.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const TILE_SIZE = 60;
      const TILE_GAP = 2;
      const CELL_SIZE = TILE_SIZE + TILE_GAP;
      const BOARD_SIZE = 5;

      const col = Math.floor(x / CELL_SIZE);
      const row = Math.floor(y / CELL_SIZE);

      if (col >= 0 && col < BOARD_SIZE && row >= 0 && row < BOARD_SIZE) {
        const toIndex = row * BOARD_SIZE + col;
        if (ui.onMoveTile) {
          ui.onMoveTile(fromIndex, toIndex);
        }
      }
      return;
    }

    const tileIndex = parseInt(e.dataTransfer.getData('tileIndex'));

    if (isNaN(tileIndex)) {
      return;
    }

    const rect = playerBoard.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const TILE_SIZE = 60;
    const TILE_GAP = 2;
    const CELL_SIZE = TILE_SIZE + TILE_GAP;
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

    // Only allow drop on empty cells (not placeholders, not occupied, not blocked)
    const isBlockedCell = targetCell && typeof targetCell === 'object' && targetCell.type === 'blocked';
    if (targetCell === null && !isBlockedCell && tileIndex >= 0 && tileIndex < gameState.pendingSweepTiles.length) {
      if (!ui.placementMap) ui.placementMap = {};
      ui.placementMap[tileIndex] = boardIndex;
      // Delay display update to allow drop event to complete first
      requestAnimationFrame(() => {
        updateGameDisplay(gameState);
      });
    }
  }, false);

  const boardTiles = document.querySelectorAll('.board-tile[data-player="0"]');
  playerBoard.addEventListener('dragover', (e) => {
    const rect = playerBoard.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const TILE_SIZE = 60;
    const TILE_GAP = 2;
    const CELL_SIZE = TILE_SIZE + TILE_GAP;
    const BOARD_SIZE = 5;

    const col = Math.floor(x / CELL_SIZE);
    const row = Math.floor(y / CELL_SIZE);

    boardTiles.forEach(tile => {
      tile.classList.remove('drag-over');
    });

    if (col >= 0 && col < BOARD_SIZE && row >= 0 && row < BOARD_SIZE) {
      const boardIndex = row * BOARD_SIZE + col;
      const targetCell = gameState.players[gameState.currentPlayerIndex].board[boardIndex];
      // Only highlight empty cells (not placeholders, not blocked)
      const isBlockedCell = targetCell && typeof targetCell === 'object' && targetCell.type === 'blocked';
      if (targetCell === null && !isBlockedCell) {
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

// New-world scoring breakdown for a player: cake-stand rows (cumulative value
// by tile count), crumb tray (1/tile), claimed card VP, and unspent cupcakes.
function getScoreBreakdown(player) {
  let standTotal = 0;
  for (const row of player.stand) {
    if (row.tiles.length > 0) standTotal += ROW_VALUES[row.tiles.length - 1];
  }
  const crumbs = player.crumbTray.length;
  let cardVP = 0;
  for (const cardId of player.claimedCards) {
    const card = REWARD_CARDS.find(c => c.id === cardId);
    if (card) cardVP += card.vp;
  }
  const cupcakes = player.cupcakes;
  return { standTotal, crumbs, cardVP, cupcakes, total: standTotal + crumbs + cardVP + cupcakes };
}

// Render a player's tiered cake stand plus their crumb tray. Rows are drawn top
// (1 plate) to bottom (4 plates) so it reads as a widening tier. Cumulative row
// values are printed under each plate position. When `interactive` is set (the
// current human is choosing a claim destination), legal rows and the crumb tray
// are marked with data-attributes so click handlers can be attached.
function renderStand(player, opts = {}) {
  const { interactive = false, legalRows = null } = opts;

  let rowsHtml = '';
  for (let rowIndex = player.stand.length - 1; rowIndex >= 0; rowIndex--) {
    const row = player.stand[rowIndex];
    const isLegal = interactive && legalRows && legalRows.has(rowIndex);

    let slots = '';
    for (let k = 0; k < row.capacity; k++) {
      const tile = row.tiles[k];
      const filled = k < row.tiles.length;
      const plate = tile
        ? `<div class="ft-stand__plate ft-stand__plate--filled" style="background-color: ${getColourCSS(tile.colour)};"><img src="images/symbol_${tile.ingredient}.png" class="ft-stand__symbol" alt="${tile.ingredient}"></div>`
        : `<div class="ft-stand__plate ft-stand__plate--empty"></div>`;
      slots += `
        <div class="ft-stand__slot">
          ${plate}
          <div class="ft-stand__value ${filled ? 'ft-stand__value--earned' : ''}">${ROW_VALUES[k]}</div>
        </div>`;
    }

    const marker = row.ingredient
      ? `<img src="images/symbol_${row.ingredient}.png" class="ft-stand__lock" alt="${row.ingredient}" title="Row locked to ${row.ingredient}">`
      : `<div class="ft-stand__lock ft-stand__lock--empty" title="Row not yet locked"></div>`;

    rowsHtml += `
      <div class="ft-stand__row ${isLegal ? 'ft-stand__row--legal' : ''}" ${isLegal ? `data-dest-row="${rowIndex}"` : ''}>
        ${marker}
        <div class="ft-stand__plates">${slots}</div>
      </div>`;
  }

  // The crumb tray is always a legal destination during a claim.
  const crumbHtml = `
    <div class="ft-stand__crumbs ${interactive ? 'ft-stand__crumbs--legal' : ''}" ${interactive ? 'data-dest-crumb="1"' : ''}>
      <span class="ft-stand__crumbs-icon">🍪</span>
      <span>Crumb tray: <strong>${player.crumbTray.length}</strong></span>
      <span class="ft-stand__crumbs-note">1 pt each</span>
    </div>`;

  return `<div class="ft-stand">${rowsHtml}${crumbHtml}</div>`;
}

// Step 3 → commit: a destination was clicked, so submit the whole claim.
function commitClaimDestination(destination) {
  const ui = window._gameUI;
  if (!ui || ui.removedBoardIndex === null || ui.removedBoardIndex === undefined) return;
  const cardId = ui.claimingCardId;
  const removedBoardIndex = ui.removedBoardIndex;
  ui.claimingCardId = null;
  ui.removedBoardIndex = null;
  ui.destinationChoices = null;
  ui.removableTiles = [];
  ui.onClaimSubmit(cardId, removedBoardIndex, destination);
}

// Cancel path for the claim flow: abandon the in-progress card/tile/destination
// selection and return to the claim phase's card-choosing state.
function cancelClaim() {
  const ui = window._gameUI;
  if (!ui) return;
  ui.claimingCardId = null;
  ui.removedBoardIndex = null;
  ui.destinationChoices = null;
  ui.removableTiles = [];
  updateGameDisplay(ui.gameState);
}

function updateStats(gameState) {
  const ui = window._gameUI || {};

  gameState.players.forEach((p, playerIdx) => {
    const statsEl = document.getElementById(`playerScore${playerIdx + 1}`);
    if (!statsEl) return;

    const isCurrentPlayer = gameState.currentPlayerIndex === playerIdx;
    const bd = getScoreBreakdown(p);

    // The current human is picking a destination for a removed tile when
    // destinationChoices is set — make their own stand's legal spots clickable.
    const destinationMode = isCurrentPlayer && p.isHuman && Array.isArray(ui.destinationChoices);
    const legalRows = destinationMode
      ? new Set(ui.destinationChoices.filter(d => d.type === 'row').map(d => d.rowIndex))
      : null;

    let html = `
      <div class="ft-score-total">Total: ${bd.total}</div>
      <div class="ft-score-breakdown">
        <div class="ft-score-breakdown__item"><span>🎂 Cake stand</span><strong>${bd.standTotal}</strong></div>
        <div class="ft-score-breakdown__item"><span>🍪 Crumbs</span><strong>${bd.crumbs}</strong></div>
        <div class="ft-score-breakdown__item"><span>🍰 Card VP</span><strong>${bd.cardVP}</strong></div>
        <div class="ft-score-breakdown__item"><span>🧁 Cupcakes</span><strong>${bd.cupcakes}</strong></div>
      </div>
      ${destinationMode ? '<div class="ft-stand__prompt">Choose where this tile goes ↓</div>' : ''}
      ${renderStand(p, { interactive: destinationMode, legalRows })}
    `;

    const cupcakeCount = p.cupcakes;
    const canUseCupcakes = isCurrentPlayer && p.cupcakes > 0 && gameState.gamePhase === 'move' && !gameState.cupcakesUsedThisTurn;
    const cupcakeClass = ui.cupcakeMode ? 'ft-cupcake-supply--active' : '';

    html += `
      <div class="ft-cupcake-supply ${cupcakeClass}" id="cupcakeSupply${playerIdx + 1}">
        <div class="ft-cupcake-header">
          <span class="ft-cupcake-label">🧁 Cupcakes</span>
          <span class="ft-cupcake-help-text">Click to move tiles or tarts on your board</span>
        </div>
        <div class="ft-cupcake-icons">
          ${cupcakeCount > 0 ? Array(cupcakeCount).fill().map((_, i) => `
            <button class="ft-cupcake-btn ${!canUseCupcakes ? 'ft-cupcake-btn--disabled' : 'ft-cupcake-btn--active'}"
                    data-cupcake-index="${i}"
                    title="Click to move a tile or tart (${canUseCupcakes ? 'available' : 'unavailable'})"
                    ${!canUseCupcakes ? 'disabled' : ''}>
              <img src="images/cupcake.png" class="ft-cupcake-icon" alt="cupcake" />
            </button>
          `).join('') : '<span class="ft-cupcake-empty">You have no cupcakes left</span>'}
        </div>
        <span class="ft-cupcake-points">${cupcakeCount} ${cupcakeCount === 1 ? 'point' : 'points'} at end game</span>
      </div>
    `;

    statsEl.innerHTML = html;

    if (destinationMode) {
      statsEl.querySelectorAll('[data-dest-row]').forEach(el => {
        el.addEventListener('click', () => {
          commitClaimDestination({ type: 'row', rowIndex: parseInt(el.dataset.destRow) });
        });
      });
      const crumbEl = statsEl.querySelector('[data-dest-crumb]');
      if (crumbEl) {
        crumbEl.addEventListener('click', () => commitClaimDestination({ type: 'crumb' }));
      }
    }

    if (isCurrentPlayer && canUseCupcakes && ui.onCupcakeClick) {
      const cupcakeBtns = statsEl.querySelectorAll('.ft-cupcake-btn--active');
      cupcakeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          ui.onCupcakeClick();
        });
      });
    }
  });
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

  const cardProgressBar = document.getElementById('cardProgressBar');
  const cardProgressText = document.getElementById('cardProgressText');
  if (cardProgressBar && cardProgressText) {
    const totalClaimed = gameState.players.reduce((sum, p) => sum + p.claimedCards.length, 0);
    const needed = gameState.cardsNeededToEnd;
    const percentage = Math.min((totalClaimed / needed) * 100, 100);
    cardProgressBar.style.width = percentage + '%';
    cardProgressText.textContent = `${totalClaimed}/${needed}`;
  }
}

function updatePhaseControls(gameState) {
  const controls = document.getElementById('phaseControls');
  if (!controls) return;

  const player = gameState.players[gameState.currentPlayerIndex];
  if (!player.isHuman) {
    controls.classList.add('ft-hidden');
    return;
  }

  controls.classList.remove('ft-hidden');
  const hasCupcakes = player.cupcakes > 0 && gameState.gamePhase === 'move' && !gameState.cupcakesUsedThisTurn;
  const cupcakeHint = hasCupcakes ? `<div class="ft-phase-bar__cupcake-hint">💡 You have ${player.cupcakes} cupcake${player.cupcakes === 1 ? '' : 's'} available — click one to move one tile or tart on your board!</div>` : '';
  const ui = window._gameUI;
  const canUndo = ui?.canUndo === true;
  const undoBtn = canUndo ? `<button id="undoBtn" class="ft-btn ft-btn--secondary ft-btn--small">↩ Undo</button>` : '';
  let html = '';

  if (gameState.gamePhase === 'sweep' && gameState.bonusTileAvailable) {
    html = `
      <div class="ft-phase-bar">
        <div class="ft-phase-bar__instruction">Bonus tile available!</div>
        <div class="ft-phase-bar__status success">Click any market tile to claim it</div>
        ${cupcakeHint}
        <div class="ft-phase-bar__controls">
          ${undoBtn}
        </div>
      </div>
    `;
  } else if (gameState.gamePhase === 'place') {
    const placementCount = ui.placementMap ? Object.keys(ui.placementMap).length : 0;
    const allPlaced = placementCount === gameState.pendingSweepTiles.length;

    html = `
      <div class="ft-phase-bar">
        <div class="ft-phase-bar__instruction">Drag tiles onto your board</div>
        <div class="ft-phase-bar__status">Placed: <strong>${placementCount}/${gameState.pendingSweepTiles.length}</strong></div>
        ${cupcakeHint}
        <div class="ft-phase-bar__controls">
          ${undoBtn}
          <button id="placementDone" class="ft-btn ft-btn--primary ft-btn--small" ${!allPlaced ? 'disabled' : ''}>Done</button>
        </div>
      </div>
    `;
  } else if (gameState.gamePhase === 'move') {
    const moveOptions = gameState.cupcakesUsedThisTurn
      ? `<div class="ft-phase-bar__instruction">You've used your move for this turn</div><div class="ft-phase-bar__status">Click "Next" to continue</div>`
      : `<div class="ft-phase-bar__instruction">Move one tile or tart (optional)</div><div class="ft-phase-bar__status">Click a cupcake to move a tile or tart, or skip</div>`;

    html = `
      <div class="ft-phase-bar">
        ${moveOptions}
        ${cupcakeHint}
        <div class="ft-phase-bar__controls">
          ${undoBtn}
          <button id="movePhaseNext" class="ft-btn ft-btn--primary ft-btn--small">Next</button>
        </div>
      </div>
    `;
  } else if (gameState.gamePhase === 'claim') {
    const currentPlayer = gameState.players[gameState.currentPlayerIndex];

    if (Array.isArray(ui.destinationChoices)) {
      html = `
        <div class="ft-phase-bar">
          <div class="ft-phase-bar__instruction">Choose a destination for the removed tile</div>
          <div class="ft-phase-bar__status success">Click a highlighted stand row or your crumb tray</div>
          ${cupcakeHint}
          <div class="ft-phase-bar__controls">
            <button id="cancelClaim" class="ft-btn ft-btn--secondary ft-btn--small">Cancel</button>
          </div>
        </div>
      `;
    } else if (ui.removableTiles && ui.removableTiles.length > 0) {
      html = `
        <div class="ft-phase-bar">
          <div class="ft-phase-bar__instruction">Select a tile to remove</div>
          <div class="ft-phase-bar__status danger">Click a highlighted tile</div>
          ${cupcakeHint}
          <div class="ft-phase-bar__controls">
            <button id="cancelClaim" class="ft-btn ft-btn--secondary ft-btn--small">Cancel</button>
          </div>
        </div>
      `;
    } else {
      const claimableCards = [];
      for (const card of gameState.cardMarket) {
        const matches = getPatternMatches(currentPlayer.board, card.pattern);
        if (matches.length > 0) {
          claimableCards.push({ card, matches });
        }
      }

      if (claimableCards.length === 0) {
        html = `
          <div class="ft-phase-bar">
            <div class="ft-phase-bar__instruction">No patterns match</div>
            ${cupcakeHint}
            <div class="ft-phase-bar__controls">
              ${undoBtn}
              <button id="skipClaim" class="ft-btn ft-btn--secondary ft-btn--small">Skip Claim</button>
            </div>
          </div>
        `;
      } else {
        html = `
          <div class="ft-phase-bar">
            <div class="ft-phase-bar__instruction">Click a card to claim it</div>
            ${cupcakeHint}
            <div class="ft-phase-bar__controls">
              ${undoBtn}
              <button id="skipClaim" class="ft-btn ft-btn--secondary ft-btn--small">Skip Claim</button>
            </div>
          </div>
        `;
      }
    }
  } else if (gameState.gamePhase === 'refill') {
    html = `
      <div class="ft-phase-bar">
        <div class="ft-phase-bar__instruction">Turn complete</div>
        <div class="ft-phase-bar__controls">
          ${undoBtn}
          <button id="confirmTurn" class="ft-btn ft-btn--primary ft-btn--small">Confirm Turn →</button>
        </div>
      </div>
    `;
  }

  controls.innerHTML = html;

  const undoBtnEl = controls.querySelector('#undoBtn');
  if (undoBtnEl) {
    undoBtnEl.addEventListener('click', () => window._gameUI.onUndo?.());
  }

  const confirmBtn = controls.querySelector('#confirmTurn');
  if (confirmBtn && gameState.gamePhase === 'refill') {
    confirmBtn.addEventListener('click', () => window._gameUI.onConfirmTurn?.());
  }

  const placementDoneBtn = controls.querySelector('#placementDone');
  if (placementDoneBtn && gameState.gamePhase === 'place') {
    placementDoneBtn.addEventListener('click', handlePlacementDone);
  }

  const skipBtn = controls.querySelector('#skipClaim');
  if (skipBtn && gameState.gamePhase === 'claim') {
    skipBtn.addEventListener('click', () => window._gameUI.onSkipClaim());
  }

  const cancelClaimBtn = controls.querySelector('#cancelClaim');
  if (cancelClaimBtn && gameState.gamePhase === 'claim') {
    cancelClaimBtn.addEventListener('click', cancelClaim);
  }

  const movePhaseNextBtn = controls.querySelector('#movePhaseNext');
  if (movePhaseNextBtn && gameState.gamePhase === 'move') {
    movePhaseNextBtn.addEventListener('click', () => window._gameUI.onSkipMove?.());
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

  const allValidCells = new Set();
  for (const match of matches) {
    match.cells.forEach(cell => allValidCells.add(cell));
  }

  const ui = window._gameUI;
  // Fresh card pick (Step 1): restart the removal → destination sub-flow clean,
  // in case a prior in-progress claim left removed/destination state set.
  ui.removableTiles = Array.from(allValidCells);
  ui.claimingCardId = cardId;
  ui.removedBoardIndex = null;
  ui.destinationChoices = null;

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
    yellow: 'var(--tile-yellow)',
    pink: 'var(--tile-pink)',
    green: 'var(--tile-green)',
    blue: 'var(--tile-blue)',
    orange: 'var(--tile-orange)',
  };
  return colourMap[colour] || '#fff';
}

export function renderGameEnd(container, data) {
  const { winner, playerStats, gameStats, turnsPlayed, onPlayAgain } = data;

  const playerScoreRows = playerStats
    .sort((a, b) => b.score - a.score)
    .map((p, idx) => `
      <tr class="ft-stats__player-row ${idx === 0 ? 'ft-stats__player-row--winner' : ''}">
        <td class="ft-stats__player-name">${idx === 0 ? '🏆 ' : ''}${p.name}</td>
        <td class="ft-stats__player-score">${p.score} pts</td>
        <td class="ft-stats__player-detail">${p.cardsWon} cards</td>
        <td class="ft-stats__player-detail">${p.crumbs ?? 0} crumbs</td>
      </tr>
    `)
    .join('');

  container.innerHTML = `
    <div class="ft-game-end">
      <div class="ft-game-end__container">
        <div class="ft-game-end__header">
          <h1>Game Over!</h1>
          <p class="ft-game-end__winner">🎉 ${winner.name} wins with ${winner.score} points!</p>
        </div>

        <div class="ft-game-end__section">
          <h2>Final Scores</h2>
          <table class="ft-stats__table">
            <thead>
              <tr>
                <th>Player</th>
                <th>Score</th>
                <th>Cards</th>
                <th>Crumbs</th>
              </tr>
            </thead>
            <tbody>
              ${playerScoreRows}
            </tbody>
          </table>
        </div>

        <div class="ft-game-end__row">
          <div class="ft-game-end__stats-group">
            <h3>Game Duration</h3>
            <div class="ft-game-end__stat">
              <div class="ft-game-end__stat-label">Turns Played</div>
              <div class="ft-game-end__stat-value">${turnsPlayed}</div>
            </div>
          </div>

          <div class="ft-game-end__stats-group">
            <h3>Tile Market</h3>
            <div class="ft-game-end__stat">
              <div class="ft-game-end__stat-label">Market Refills</div>
              <div class="ft-game-end__stat-value">${gameStats.marketFills}</div>
            </div>
            <div class="ft-game-end__stat">
              <div class="ft-game-end__stat-label">Tiles Taken</div>
              <div class="ft-game-end__stat-value">${gameStats.totalTilesTaken} / 100</div>
            </div>
          </div>

          <div class="ft-game-end__stats-group">
            <h3>Sweep Stats</h3>
            <div class="ft-game-end__stat">
              <div class="ft-game-end__stat-label">Total Sweeps</div>
              <div class="ft-game-end__stat-value">${gameStats.sweepCount}</div>
            </div>
            <div class="ft-game-end__stat">
              <div class="ft-game-end__stat-label">Avg Sweep Size</div>
              <div class="ft-game-end__stat-value">${gameStats.avgSweepSize}</div>
            </div>
            <div class="ft-game-end__stat">
              <div class="ft-game-end__stat-label">Max Sweep Size</div>
              <div class="ft-game-end__stat-value">${gameStats.maxSweepSize}</div>
            </div>
          </div>

          <div class="ft-game-end__stats-group">
            <h3>Cards</h3>
            <div class="ft-game-end__stat">
              <div class="ft-game-end__stat-label">Total Cards Claimed</div>
              <div class="ft-game-end__stat-value">${gameStats.totalCardsClaimed}</div>
            </div>
          </div>
        </div>

        <div class="ft-game-end__actions">
          <button class="ft-btn ft-btn--primary" id="playAgainBtn">Play Again</button>
        </div>
      </div>
    </div>
  `;

  document.getElementById('playAgainBtn').addEventListener('click', onPlayAgain);
}
