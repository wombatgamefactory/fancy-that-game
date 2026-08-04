import { BOARD_SIZE, REWARD_CARDS } from '../engine/tiles.js';
// THE PANTRY GOALS IMPORTS ARE GONE (4 August). getObjectiveRequirement,
// isObjectiveSatisfied, OBJECTIVE_VP and OBJECTIVE_TILE_COUNT no longer exist in
// the engine - the ingredient objectives are deleted from the game, so importing
// them is a hard error rather than a dead name. countBoardIngredient goes with
// them: it survives in the engine for the bots, but the only thing that ever
// asked it a question here was the objectives panel.
import { getPatternMatches, getLegalDestinations, getMoveCost, canBuyExtraTile, canReserveCard, canRemovePlate, canClaimMore, getWinningPlayers, REFRESH_THRESHOLD, TEA_POT_REWARD, INITIAL_MARKET_CARDS, MAX_MARKET_CARDS, STAND_ROW_VALUES, CUPCAKE_PLATES, CUPCAKE_SYMBOL_CELLS, MOVE_TILE_CUPCAKE_COST, REMOVE_PLATE_CUPCAKE_COST, EXTRA_TILE_CUPCAKE_COST, RESERVE_CUPCAKE_COST, RESERVE_LIMIT, EMPTY_PLATES_PER_PLAYER, getVisibleCupcakeSymbols, getStartingCupcakes } from '../engine/game.js';

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
        <div class="ft-rules__section ft-rules__section--boxed ft-rules__section--goal">
          <div class="ft-rules__section-title">Goal</div>
          <div class="ft-rules__text">Collect patisserie reward cards by building colour patterns on your board. Each card is worth victory points, and every card you claim lets you move one tile onto your tiered cake stand, where filling a row scores escalating points.</div>
        </div>

        <div class="ft-rules__section ft-rules__section--boxed ft-rules__section--turn">
          <div class="ft-rules__section-title">Your Turn (5 Steps)</div>

          <div class="ft-rules__step">
            <div class="ft-rules__step-title">1. Sweep</div>
            <div class="ft-rules__text">Choose a row or column from the market. Declare either a colour or an ingredient symbol. Take all tiles matching your declaration.</div>
            <div class="ft-rules__text"><strong>Bonus:</strong> If you clear a row/column completely, take 1 extra tile from anywhere on the market.</div>
            <div class="ft-rules__text"><strong>Buy a tile:</strong> after your sweep resolves you may spend ${EXTRA_TILE_CUPCAKE_COST} cupcake to take 1 more tile from <strong>anywhere</strong> on the market - any colour, any ingredient. Once per turn. Place it with the rest of your swept tiles.</div>
          </div>

          <div class="ft-rules__step">
            <div class="ft-rules__step-title">2. Place Tiles</div>
            <div class="ft-rules__text">Place all swept tiles anywhere on your 5×5 board. No adjacency required - tiles can go in any empty cells.</div>
          </div>

          <div class="ft-rules__step">
            <div class="ft-rules__step-title">3. Spend Cupcakes (Optional)</div>
            <div class="ft-rules__text"><strong>Move:</strong> spend ${MOVE_TILE_CUPCAKE_COST} cupcake to move one tile from its cell to any other empty cell on your board. At most one move per turn.</div>
            <div class="ft-rules__text"><strong>Remove a plate:</strong> spend ${REMOVE_PLATE_CUPCAKE_COST} cupcakes to take one empty plate off your board and <strong>return it to the box</strong>. It does not go back into circulation, so this frees the cell but does not buy you another claim. At most one plate per turn.</div>
            <div class="ft-rules__text"><strong>Reserve:</strong> spend ${RESERVE_CUPCAKE_COST} cupcake to take 1 card from the card market into your personal reserve. Your reserve holds ${RESERVE_LIMIT} card, and <strong>you may not claim a card on the turn you reserved it</strong> - a reserve is a forward commitment. A reserved card is safe from the tea flush, and there is no penalty for never completing one (it simply scores nothing).</div>
          </div>

          <div class="ft-rules__step">
            <div class="ft-rules__step-title">4. Claim (Optional)</div>
            <div class="ft-rules__text">If tiles on your board match a card's colour pattern (in any rotation or reflection), you may claim it. <strong>You may claim at most one card per turn</strong> - claiming ends the claim step, even if a second card also matches.</div>
            <div class="ft-rules__text">When claiming: remove 1 tile from the pattern, then place it on your cake stand or in your crumb tray. Each ingredient can only ever be placed on ONE stand row - the first tile you plate locks that ingredient to that row, and no other row can ever hold it. Once that row is full (or if you choose not to extend it), any further tiles of that ingredient must go to the crumb tray. The crumb tray always accepts any tile and is worth 1 point each.</div>
            <div class="ft-rules__text"><strong>Empty Plates:</strong> The cell where you removed the tile takes an empty plate token. No new tiles can be placed on it, and it breaks pattern matching. The table starts with ${EMPTY_PLATES_PER_PLAYER} per player, and running out is what <em>triggers</em> the end of the game - it does not stop you serving. During the final round you take extra plates from the box.</div>
          </div>

          <!-- Step 5 used to be "Check Objectives", the end-of-turn pantry goal
               check. The ingredient objectives are deleted (4 August), so the
               card deal moves up into the slot and the turn is genuinely five
               steps again, which is what the section heading always claimed. -->
          <div class="ft-rules__step">
            <div class="ft-rules__step-title">5. Deal a Card</div>
            <div class="ft-rules__text">At the end of every turn, <strong>1 new card is dealt to the card market</strong> - whether or not you claimed - up to a maximum of ${MAX_MARKET_CARDS}. Claiming does not refill the gap it left, so the row grows steadily; only a fresh pot of tea cuts it back (see below).</div>
            <div class="ft-rules__text">The tile market is <strong>never</strong> topped up. Tiles you sweep leave holes that stay open until a fresh pot of tea.</div>
          </div>
        </div>

        <div class="ft-rules__section ft-rules__section--boxed ft-rules__section--tea">
          <div class="ft-rules__section-title">🫖 A Fresh Pot of Tea</div>
          <div class="ft-rules__quote">"${REFRESH_THRESHOLD} teapots showing? Order a fresh pot of tea"</div>
          <div class="ft-rules__text">A teapot is <strong>showing</strong> when the space it is printed under is empty. At the end of your turn, if ${REFRESH_THRESHOLD} are showing, a fresh pot is brewed instead of dealing a card. It is <strong>not</strong> a choice - it happens automatically:</div>
          <div class="ft-rules__text">1. Discard the <strong>whole</strong> card row and deal ${INITIAL_MARKET_CARDS} new cards. Cards in a personal reserve are safe.</div>
          <div class="ft-rules__text">2. You gain ${TEA_POT_REWARD} cupcake${TEA_POT_REWARD === 1 ? '' : 's'}.</div>
          <div class="ft-rules__text">3. <strong>Flush the tile market.</strong> Every tile still on the market goes <strong>back into the bag</strong>, the bag is shuffled, and all 25 spaces are dealt afresh.</div>
          <div class="ft-rules__text"><strong>If the bag cannot fill all 25 spaces, deal out whatever is left and carry on.</strong> A short market is a legal market - it simply has bare spaces from the start, which means more teapots showing, which means the next pot comes round sooner. The last lap of the game is a quick one.</div>
          <div class="ft-rules__text">Then play passes to the left as usual. You do not get to sweep the fresh board - the player on your left does. That is the price of the pot.</div>
          <div class="ft-rules__text">Tea is predictable: watch the gauge under the market, and if a card in the row matters to you, reserving it (step 3 of your turn) is how you keep it.</div>
        </div>

        <!-- The PANTRY GOALS section stood here until 4 August: five face-up pairs
             of ingredient cards, 3 points to the first player holding the named
             tiles. The whole module is deleted from the game, so the rules do not
             mention it at all rather than explaining something no longer on the
             table. -->

        <div class="ft-rules__section ft-rules__section--boxed ft-rules__section--cupcakes">
          <div class="ft-rules__section-title">Cupcakes</div>
          <!-- STATELESS ON PURPOSE. This modal opens from the SETUP screen as well
               as from a live game (see both listeners below), so there is no
               gameState to read a player count off. The two figures are still
               derived from the engine's table rather than typed in, so the copy
               cannot drift away from the rule. -->
          <div class="ft-rules__text">Everyone starts with ${getStartingCupcakes(2)[0]} cupcakes. In a 4-player game the third and fourth players start with ${getStartingCupcakes(4)[3]} instead - a small head start for going last. You gain more when a fresh pot of tea is brewed on your turn, and by plating a tile onto a cupcake plate.</div>
          <div class="ft-rules__text">Cupcakes buy four things:</div>
          <div class="ft-rules__text">- <strong>${EXTRA_TILE_CUPCAKE_COST}</strong> take 1 extra tile from anywhere on the market, at the sweep step (once per turn)</div>
          <div class="ft-rules__text">- <strong>${MOVE_TILE_CUPCAKE_COST}</strong> move one tile on your board</div>
          <div class="ft-rules__text">- <strong>${REMOVE_PLATE_CUPCAKE_COST}</strong> remove one empty plate from your board, to the box</div>
          <div class="ft-rules__text">- <strong>${RESERVE_CUPCAKE_COST}</strong> reserve a card from the market</div>
          <div class="ft-rules__text"><strong>Cupcakes are worth no points at all.</strong> Spend them. They only break a tie on the final score.</div>
        </div>

        <div class="ft-rules__section ft-rules__section--boxed ft-rules__section--scoring">
          <div class="ft-rules__section-title">Scoring</div>
          <!-- The fourth line was "Ingredient objectives: 3 points per pair
               taken". Deleted with the pantry goals, 4 August. -->
          <div class="ft-rules__text">Your final score adds up three things:</div>
          <div class="ft-rules__text"><strong>Cake stand:</strong> each row scores by how many plates it fills - the bottom row climbs ${STAND_ROW_VALUES[0].join(' / ')}, and shorter rows have their own (lower) totals printed under the plates.</div>
          <div class="ft-rules__text"><strong>Crumb tray:</strong> 1 point per tile.</div>
          <div class="ft-rules__text"><strong>Card VP:</strong> the victory-point value shown on each claimed card.</div>
          <div class="ft-rules__text"><strong>Tiebreak:</strong> most cupcakes remaining, then most cards claimed, then the victory is shared.</div>
        </div>

        <!-- REWRITTEN 4 AUGUST. Every line here used to describe its own ending:
             one stopped play dead, one gave the OTHER players a final turn, one
             waited for a turn boundary. There is one rule now - the trigger, then
             finish the round - so the section leads with it and the conditions
             below are simply a list of what can arm it. -->
        <div class="ft-rules__section ft-rules__section--boxed ft-rules__section--end">
          <div class="ft-rules__section-title">Game Ends When</div>
          <div class="ft-rules__text"><strong>The end is a trigger, not a stop.</strong> When one of the conditions below fires, play carries on until the turn comes back round to the start player, so <strong>everyone has had exactly the same number of turns</strong>. Then you score.</div>
          <div class="ft-rules__text">• The table has run out of empty plates - ${EMPTY_PLATES_PER_PLAYER} per player (the counter above the card market tracks it), OR</div>
          <div class="ft-rules__text">• A player's board is completely full (tiles + empty plates) at the start of their turn, OR</div>
          <div class="ft-rules__text">• A player sweeps more tiles than their board can hold, OR</div>
          <div class="ft-rules__text">• <strong>A fresh pot of tea is due and the bag is empty.</strong> An empty bag is not an ending on its own - a short deal is perfectly playable, and play continues over a thinning market. It is the next pot, with nothing left to pour, that triggers the end.</div>
          <div class="ft-rules__text"><strong>You can still serve during that last round.</strong> If the plates run out, take more from the box - the supply is unlimited once the end has been triggered. The plate pool is the game's clock, not a limit on how many cards get claimed, and nobody loses their last turn to it.</div>
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
    <div class="ft-landing">
      <div class="ft-landing__main">
        <div class="ft-landing__col">
          <header class="ft-hero">
            <img class="ft-hero__art" src="images/landing/hero.jpg"
                 alt="Fancy That! - an illustrated afternoon tea table laden with cakes, tarts, sandwiches and a cup of tea">
            <p class="ft-hero__tagline">A spot of strategy with your afternoon tea.</p>
          </header>

          <section class="ft-about">
            <h2 class="ft-landing__heading">About the Game</h2>
            <p>At this tea party you fancy everything - but your eyes are bigger than your board.
               You truly can't have your cake and eat it: every treat you serve leaves behind an
               empty plate that never clears away. Serve shrewdly, though, and you'll be the one
               who takes the cake.</p>
            <p>In this spatial puzzle game, every tile leads a double life - a colour and an
               ingredient etched on top. The colour builds the patterns that earn your patisseries;
               the ingredient decides how they score. Juggle both to have the grandest high tea!</p>
          </section>
        </div>

        <div class="ft-landing__col">
        <section class="ft-play">
          <h2 class="ft-play__title">Take Your Seat</h2>

          <div class="ft-setup__section">
            <label class="ft-setup__label" for="playerCount">Number of Players</label>
            <select id="playerCount" class="ft-setup__select">
              <option value="2" selected>2 Players</option>
              <option value="3">3 Players</option>
              <option value="4">4 Players</option>
            </select>
          </div>

          <div id="playerSetup" class="ft-setup__section"></div>

          <div class="ft-play__actions">
            <button id="rulesButton" class="ft-btn ft-btn--secondary">📖 Rules</button>
            <button id="startButton" class="ft-btn ft-btn--primary">Start Game</button>
          </div>
        </section>

          <ul class="ft-stats">
            <li class="ft-stat">
              <img src="images/landing/icon-players.jpg" alt="">
              <span><strong>2-4</strong> players</span>
            </li>
            <li class="ft-stat">
              <img src="images/landing/icon-time.jpg" alt="">
              <span><strong>30</strong> minutes</span>
            </li>
            <li class="ft-stat">
              <img src="images/landing/icon-weight.jpg" alt="">
              <span><strong>1.8</strong> weight</span>
            </li>
            <li class="ft-stat">
              <img src="images/landing/icon-age.jpg" alt="">
              <span><strong>10+</strong> age</span>
            </li>
          </ul>
        </div>
      </div>

      <footer class="ft-landing__footer">
        <p>Designed by Dean Morris · <a href="https://www.wombatgamefactory.com" target="_blank" rel="noopener">Wombat Game Factory</a></p>
        <p class="ft-landing__fineprint">Prototype art - a tabletop game in development.</p>
      </footer>
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

// `spendHandlers` bundles the three 3-August paid options - the extra tile and
// the paid reserve, each with a toggle - rather than growing this parameter list
// by four more positional callbacks.
export function renderGameScreen(container, gameState, onMarketClick, onBonusTile, onPlacementSubmit, onClaimSubmit, onSkipClaim, onSkipMove, onMoveTile, onCupcakeClick, spendHandlers = {}) {
  const playerCount = gameState.players.length;

  container.innerHTML = `
    <div class="ft-game">
      <!-- Player 1 Panel (Active/Human) - Grid position: col 1, row 1 -->
      <div class="ft-panel ft-panel--player1" id="playerPanel1" style="grid-column: 1; grid-row: 1; display: flex; flex-direction: row; gap: var(--spacing-lg);">
        <div id="playerScore1" class="ft-player-score"></div>
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

      <!-- CENTRE TOP - Grid position: col 2, row 1.
           Reads top to bottom in the order a player needs it: WHOSE turn and
           which step, how close the game is to ending, then the board itself.
           The old "Tile Market" heading is gone - a 5x5 grid of tiles under a
           teapot gauge is not something anybody needed labelling, and the
           heading cost a whole row of height in a column that was overflowing
           the page. -->
      <div class="ft-panel ft-centre" style="grid-column: 2; grid-row: 1 / span 2;">
        <!-- BAND 1: the title bar. Dark, so the centre column opens on something
             with weight instead of a line of grey text, and so "whose turn is it"
             is answerable from across the table. -->
        <header class="ft-centre-head">
          <div class="ft-centre-head__turn">
            <h2 class="ft-centre-head__player" id="currentPlayer">Turn</h2>
            <div id="thinkingProgressContainer" class="ft-centre-head__thinking">
              <div class="ft-centre-head__thinking-track">
                <div id="thinkingProgressBar" class="ft-centre-head__thinking-bar"></div>
              </div>
            </div>
          </div>
          <div class="ft-centre-head__right">
            <span class="ft-centre-head__stat">Turn <strong id="turnsDisplay">0</strong></span>
            <!-- The rules are the one control in this column, so it is a FILLED
                 button rather than an outline, and it says what it does. -->
            <button id="gameRulesButton" class="ft-btn-howto" title="How to play">
              <span class="ft-btn-howto__icon">&#128214;</span>
              <span class="ft-btn-howto__label">How to Play</span>
            </button>
          </div>
        </header>

        <!-- BAND 2: the shared table. The market on the left, the two things
             that measure the game's state on the right - how many cards are left
             to claim, and how close a fresh pot is. Both are clocks, so they are
             grouped, and they fill the ~400px of dead width beside the fixed-size
             market grid instead of adding height below it. -->
        <div class="ft-centre-table">
        <section class="ft-section ft-section--tiles">
          <div class="ft-section__head">
            <span class="ft-section__title">Tile Market</span>
            <span class="ft-section__meta"><strong id="marketDisplay">25</strong> tiles left</span>
          </div>
        <div class="ft-market-wrap">
          <!-- The two gutter tracks hold the sweep buttons, and used to be a
               FULL TILE each - 60px of height for a row of buttons that needs 26,
               and 60px of width for buttons that need 34. The tile tracks stay at
               --tile-size; only the gutters shrink, so the buttons still line up
               exactly with the rows and columns they sweep. -->
          <div id="marketContainer" style="display: grid; grid-template-columns: var(--market-gutter-w) repeat(${gameState.marketSize}, var(--tile-size)); grid-template-rows: var(--market-gutter-h) repeat(${gameState.marketSize}, var(--tile-size)); gap: 2px;">
            <div style="grid-column: 2 / span ${gameState.marketSize}; grid-row: 1; display: flex; gap: var(--tile-gap);" id="marketColButtons"></div>
            <div style="grid-column: 1; grid-row: 2 / span ${gameState.marketSize}; display: flex; flex-direction: column; gap: var(--tile-gap);" id="marketRowButtons"></div>
            <div id="market" class="ft-market-grid" style="grid-column: 2 / span ${gameState.marketSize}; grid-row: 2 / span ${gameState.marketSize}; display: grid; grid-template-columns: repeat(${gameState.marketSize}, var(--tile-size)); grid-template-rows: repeat(${gameState.marketSize}, var(--tile-size)); gap: 2px;"></div>
          </div>
        </div>
        </section>

          <div class="ft-centre-meters">
            <!-- CARDS CLAIMED, its own section. This is the game's clock - the
                 table's shared supply of empty plates - and it decides when the
                 game ends, so it gets a heading, a bar and a plain-language line
                 saying what running out means. -->
            <section class="ft-section ft-section--claims" id="cardProgress">
              <div class="ft-section__head">
                <span class="ft-section__title">Cards Claimed</span>
                <span class="ft-section__meta ft-section__meta--figure" id="cardProgressText">0/0</span>
              </div>
              <div class="ft-claim-meter__track">
                <div id="cardProgressBar" class="ft-claim-meter__bar"></div>
              </div>
              <p class="ft-section__note">Every claim spends an empty plate. Running out triggers the end - you then finish the round, taking spare plates from the box.</p>
            </section>

            <!-- The fresh-pot affordance is PERSISTENT and sits beside the market
                 board, because that is where the trigger is printed on the
                 physical component. It is never removed and never hidden: a
                 player must be able to see, at any moment, how close the board is
                 to a refresh. updateTeaOption rewrites its contents every render
                 and supplies its own section heading. -->
            <div id="teaOption" class="ft-tea-option"></div>
          </div>
        </div>

          <!-- BAND 3: the card row, FULL WIDTH of the centre panel.
               This band used to be a .ft-centre-split - a 260px Pantry Goals
               column on the left and the cards on the right - on the reasoning
               that the two scoring tracks (ingredients vs colour patterns) shared
               no vocabulary and could be read side by side. The pantry goals are
               deleted from the game (4 August), so there is nothing to sit beside
               and the split wrapper is gone with them. The cards get the whole
               782px, which is what re-derived cardDisplayHeight() below is sized
               against.

               The card row is variable-length (28 July rework, capped 30 July),
               so it gets its own framed strip: a header stating how many cards are
               on offer, an in-page notice line (used for the one-claim-per-turn
               rejection instead of an alert), and the card area itself, which
               grows in height rather than shrinking the cards. -->
          <section class="ft-section ft-section--cards">
            <div class="ft-section__head">
              <span class="ft-section__title">Patisserie Goals</span>
              <span class="ft-section__meta" id="cardRowCount">3 cards</span>
            </div>
            <p class="ft-section__note">Make these patterns in your player area. VP shown on each card.</p>
            <div id="cardRowNotice" class="ft-card-row__notice ft-hidden"></div>
            <div id="cardMarket" class="ft-card-grid"></div>
          </section>
      </div>

      <!-- Player 3 Panel - Grid position: col 3, row 1 -->
      <div class="ft-panel ft-panel--player3" id="playerPanel3" style="grid-column: 3; grid-row: 1; display: ${playerCount >= 3 ? 'flex' : 'none'}; flex-direction: row; gap: var(--spacing-lg);">
        <div id="playerScore3" class="ft-player-score"></div>
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
        <div id="playerScore2" class="ft-player-score"></div>
        <div style="display: flex; flex-direction: column; align-items: center; flex: 1;">
          <div class="ft-panel__header" style="width: 100%; padding: 0 0 var(--spacing-sm) 0; border-bottom: 1px solid var(--color-border); margin-bottom: var(--spacing-sm);">
            <h2 class="ft-panel__title">${gameState.players[1]?.isHuman ? '🧑' : '🤖'} Player 2</h2>
          </div>
          <div id="workingArea2" class="ft-working-area ft-hidden"></div>
          <div id="playerBoard2" class="ft-board-grid"></div>
        </div>
      </div>

      <!-- Player 4 Panel - Grid position: col 3, row 2 -->
      <div class="ft-panel ft-panel--player4" id="playerPanel4" style="grid-column: 3; grid-row: 2; display: ${playerCount >= 4 ? 'flex' : 'none'}; flex-direction: row; gap: var(--spacing-lg);">
        <div id="playerScore4" class="ft-player-score"></div>
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
    onExtraTile: spendHandlers.onExtraTile,
    onExtraTileToggle: spendHandlers.onExtraTileToggle,
    onReserveCard: spendHandlers.onReserveCard,
    onRemovePlate: spendHandlers.onRemovePlate,
    onReserveToggle: spendHandlers.onReserveToggle,
    gameState,
    selectedPlacements: [],
    placementMap: {},
    removableTiles: [],
    claimingCardId: null,
    removedBoardIndex: null,
    destinationChoices: null,
    dragSetupDone: false,
    cupcakeMode: false,
    // Sweep-step "buy an extra tile" mode: the next market click lifts a tile
    // rather than declaring a sweep. Spend-step "reserve a card" mode: the next
    // card click reserves rather than claims.
    extraTileMode: false,
    reserveMode: false,
    lastPlayerIndex: -1,
  };

  const gameRulesButton = document.getElementById('gameRulesButton');
  if (gameRulesButton) {
    gameRulesButton.addEventListener('click', showRulesModal);
  }

  setupDragAndDrop(gameState);
}

// WHY THE GAME ENDED, in one sentence, for the end screen. New on 4 August: the
// UI never named the reason before, which was survivable while an ending was
// instant and obvious ("the plates ran out, we stopped"). It is not survivable
// now that the trigger and the stop are separated by up to a full round - a
// player who watched three more turns go by after the last plate was placed
// deserves to be told which of the five conditions actually closed the game.
//
// Every clause therefore states the TRIGGER, and the shared line underneath
// states the rule that turned it into a stop. Reasons are the engine's own
// endGameReason strings; an unknown value falls through to the generic line
// rather than inventing a story about it.
function endGameReasonText(gameState) {
  const reasons = {
    // The table's empty plate pool is spent. Note what this does NOT say: claims
    // did not stop. Since 4 August the pool is purely the clock, and the final
    // round serves on from an unlimited supply of spare plates.
    cardMarket: 'The table ran out of empty plates.',
    // 4 August: this is NOT "the bag hit zero". A short bag deals what it has and
    // play continues - it is the NEXT pot, with nothing left to pour, that ends it.
    bagEmpty: 'A fresh pot of tea came due with an empty bag - there were no tiles left to deal.',
    boardFull: 'A player began their turn with a completely full board.',
    boardOverflow: 'A player swept more tiles than their board could hold.',
    marketTiles: 'The tile market and the bag were both empty, so there was nothing left to sweep.',
  };
  const reason = reasons[gameState.endGameReason];
  if (!reason) return '';
  return `${reason} Play then continued until everyone had taken the same number of turns.`;
}

export function renderEndScreen(container, gameState, onPlayAgain, onBackToSetup, gameStats) {
  const playerResults = gameState.players.map(player => {
    const breakdown = getScoreBreakdown(player);
    return { player, breakdown, totalScore: breakdown.total };
  });

  // WHO WON is the engine's call since 3 August: cupcakes no longer score, so a
  // score tie is broken by cupcakes held, then by cards claimed, and can still end
  // in a shared victory. Comparing totals here would report every cupcake-broken
  // tie as a draw.
  const winners = getWinningPlayers(gameState);
  const winnerIds = new Set(winners.map(p => p.id));
  const winnerResult = playerResults.find(r => winnerIds.has(r.player.id)) || playerResults[0];
  const sharedWin = winners.length > 1;
  const winnerNames = winners.map(p => p.name).join(' & ');
  const endReason = endGameReasonText(gameState);

  let html = `
    <div class="ft-end-screen">
      <div class="ft-end-screen__panel">
        <div class="ft-end-screen__title">
          <h1>Game Over</h1>
        </div>

        <div class="ft-end-screen__winner">
          <div class="ft-end-screen__winner-name">${winnerNames}</div>
          <div style="font-size: 14px; color: var(--color-accent-gold); margin-top: var(--spacing-sm);">${sharedWin ? 'share the victory on' : 'wins with'} ${winnerResult.totalScore} points!</div>
          ${sharedWin ? '' : `<div style="font-size: 12px; color: var(--color-text-secondary); margin-top: var(--spacing-xs);">Ties are broken by cupcakes remaining, then by cards claimed.</div>`}
          ${endReason ? `<div style="font-size: 12px; color: var(--color-text-secondary); margin-top: var(--spacing-sm);">${endReason}</div>` : ''}
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
                <!-- The <th>Objectives</th> column is deleted with the pantry
                     goals (4 August). Three scoring columns now, plus the
                     non-scoring cupcake tiebreaker. -->
                <th title="Cupcakes score nothing since 3 August - they are the first tiebreaker">Cupcakes*</th>
                <th>Score</th>
              </tr>
            </thead>
            <tbody>
  `;

  for (const result of playerResults) {
    const isWinner = winnerIds.has(result.player.id) ? 'winner' : '';
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
              <!-- No denominator: since the 28 July full-flush refresh, tiles go
                   back into the bag and can be swept again, so this is a running
                   total of tiles swept, not a fraction of the 100-tile bag (125
                   until 4 August). It can legitimately exceed 100 in a long
                   game. -->
              <div class="ft-stat-label">Tiles Swept</div>
              <div class="ft-stat-value">${gameStats?.totalTilesTaken || 0}</div>
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
            <!-- The "Objectives Taken" tile is deleted with the pantry goals
                 (4 August). The stats collector no longer reports
                 objectivesClaimedCount, and gameState.objectivePairs no longer
                 exists - reading either was a hard error, not a zero. -->
            <div class="ft-stat-box">
              <div class="ft-stat-label">Cards Reserved</div>
              <div class="ft-stat-value">${gameStats?.reservesTaken || 0}</div>
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

  // Reset every spend mode if the player has changed
  if (ui.lastPlayerIndex !== gameState.currentPlayerIndex) {
    ui.cupcakeMode = false;
    ui.extraTileMode = false;
    ui.reserveMode = false;
    ui.lastPlayerIndex = gameState.currentPlayerIndex;
  }
  // A spend mode can only be live in the phase that offers it, so drop it as soon
  // as the phase moves on rather than leaving a stale armed click behind.
  if (!canBuyExtraTile(gameState)) ui.extraTileMode = false;
  if (!canReserveCard(gameState)) ui.reserveMode = false;

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
  updateTeaOption(gameState);
  updateCardMarket(gameState);
  // renderObjectives(gameState, currentPlayer) was called here. Deleted 4 August
  // with the pantry goals - there is no objectives panel to redraw.
  updatePlayerBoards(gameState);
  updateStats(gameState);
  updateGameInfo(gameState);
  updatePhaseControls(gameState);
}

function updateMarket(gameState) {
  const market = document.getElementById('market');
  if (!market) return;

  // Cells carrying a printed teapot symbol - one set for all player counts. The
  // symbol shows through only while the cell is EMPTY (uncovered) — it is what the
  // tea player collects into the cupcake pot. It is a printed-on-board marker, so
  // it renders dimmed/small under where a tile would sit.
  const symbolCells = new Set(CUPCAKE_SYMBOL_CELLS);

  // The trigger itself, made visible. Once REFRESH_THRESHOLD symbols are showing,
  // a fresh pot is ORDERED AT THE END OF THIS TURN (1 August rule) - so at that
  // moment every showing symbol switches from a dim printed marker to a lit
  // "armed" one. Same count the engine's isTeaDue uses, so the board and the
  // gauge below it can never disagree.
  //
  // 4 AUGUST: the armed state has TWO meanings now, because isTeaDue means "the
  // market needs refilling" rather than "a pot will be poured". With tiles in the
  // bag it is still a refresh; with an empty bag it is the end of the game, and
  // the tooltip must say so rather than promise a pot that cannot be brewed.
  const visibleSymbols = getVisibleCupcakeSymbols(gameState);
  const gateArmed = visibleSymbols >= REFRESH_THRESHOLD;
  const bagDead = gameState.bag.length === 0;
  const symbolCount = `Teapot symbol showing (${visibleSymbols} of ${CUPCAKE_SYMBOL_CELLS.length})`;
  const symbolTitle = gateArmed
    ? (bagDead
      ? `${symbolCount} - a fresh pot is due and the bag is empty, so this ENDS the game at the end of this turn`
      : `${symbolCount} - a fresh pot of tea is ordered at the end of this turn, worth ${TEA_POT_REWARD} cupcake${TEA_POT_REWARD === 1 ? '' : 's'} to the player taking it`)
    : `${symbolCount} - ${REFRESH_THRESHOLD} showing at the end of a turn orders a fresh pot`;

  // Two ways a single market tile becomes clickable: the free line-clear bonus
  // tile, and the PAID extra tile (3 August), which is armed by the player from
  // the cupcake panel. They look and behave the same because they are the same
  // operation - lift one tile onto the pile about to be placed.
  const ui = window._gameUI;
  const buyingTile = ui && ui.extraTileMode && canBuyExtraTile(gameState);

  market.innerHTML = gameState.market.map((tile, idx) => {
    const isEmpty = !tile;
    const isBonusAvailable = tile && gameState.bonusTileAvailable;
    const isBuyable = tile && buyingTile;
    let tileClass = isEmpty ? 'ft-tile ft-tile--empty' : 'ft-tile ft-tile--placed';
    if (isBuyable) tileClass += ' ft-tile--buyable';
    // A market tile is only ever clickable in two situations: the free
    // line-clear bonus tile, and the paid extra tile. Everywhere else you sweep
    // a whole LINE with the row/column buttons and an individual tile does
    // nothing. The class carries that fact into CSS so the hover lift can be
    // limited to the tiles that will actually respond - see .ft-tile--pickable.
    if (isBonusAvailable || isBuyable) tileClass += ' ft-tile--pickable';
    const showCupcakeSymbol = isEmpty && symbolCells.has(idx);
    if (showCupcakeSymbol) tileClass += gateArmed ? ' ft-tile--symbol-armed' : ' ft-tile--symbol';

    return `
      <div class="${tileClass} market-tile" data-index="${idx}" style="${isEmpty && !showCupcakeSymbol ? 'opacity: 0.3;' : ''} ${(isBonusAvailable || isBuyable) ? 'cursor: pointer;' : ''} background-color: ${tile ? getColourCSS(tile.colour) : 'white'};">
        ${tile ? `<img src="images/symbol_${tile.ingredient}.png" class="ft-tile__icon" alt="${tile.ingredient}">` : ''}
        ${showCupcakeSymbol ? `<img src="images/teapot.png" class="ft-market-teapot-symbol${gateArmed ? ' ft-market-teapot-symbol--armed' : ''}" alt="teapot symbol" title="${symbolTitle}">` : ''}
      </div>
    `;
  }).join('');

  const player = gameState.players[gameState.currentPlayerIndex];
  if (gameState.bonusTileAvailable && player.isHuman) {
    setupBonusUI(gameState);
  } else if (buyingTile && player.isHuman) {
    // Extra-tile mode: any occupied cell buys. Handlers are attached to the
    // freshly-rendered nodes above, so there is nothing stale to remove.
    market.querySelectorAll('.market-tile').forEach(el => {
      const idx = parseInt(el.dataset.index);
      if (!gameState.market[idx]) return;
      el.addEventListener('click', () => ui.onExtraTile?.(idx));
    });
  }
  // The row/column select buttons are ALWAYS re-rendered, enabled only while a
  // human may actually sweep. They must be actively disabled outside that
  // window: once rendered enabled they would otherwise linger clickable for the
  // rest of the turn, letting a player "sweep" during the move/claim phases or
  // mid tea round, with the choice then silently discarded by onMarketClick's
  // phase guard.
  const canSweep = gameState.gamePhase === 'sweep' && !gameState.bonusTileAvailable && player.isHuman;
  setupMarketSelectButtons(gameState, canSweep);
}

// The "fresh pot of tea" gauge, drawn under the tile market.
//
// NO BUTTON SINCE 1 AUGUST. This used to end in "🫖 Order a fresh pot of tea",
// which opened a confirm dialog and started the round. Tea is not an action any
// more - it fires by itself at the END of any turn that leaves REFRESH_THRESHOLD
// teapots showing - so the panel is now purely a readout. That is the important
// thing for it to communicate: the player is not being offered a choice, they are
// being shown how close the current turn is to triggering the flush, because the
// real decision is which line they sweep.
//
// The count comes from getVisibleCupcakeSymbols, the same function the engine's
// isTeaDue reads, so the gauge and the trigger can never disagree.
//
// WHAT THE GAUGE MEANS CHANGED ON 4 AUGUST. isTeaDue lost its bag check: it now
// says "the market needs refilling", and whether that pours a pot or ENDS THE
// GAME depends on whether the bag has anything left in it. So this reads the two
// halves separately - the symbol count for the trigger, the bag for what the
// trigger does - and it must never promise a fresh pot it cannot deliver. The
// empty-bag state is no longer "no more pots can be brewed", which sounded like
// a mild inconvenience; it is the ending, and it says so.
function updateTeaOption(gameState) {
  const el = document.getElementById('teaOption');
  if (!el) return;

  const potSize = getVisibleCupcakeSymbols(gameState);
  const bagDead = gameState.bag.length === 0;
  // "The market needs refilling", exactly as the engine's isTeaDue reads it -
  // which is NOT the same as "a pot will be poured", see below. Deliberately
  // re-derived here rather than imported, because this must describe what will
  // happen at the END of the turn, which is a statement about the board rather
  // than about the phase.
  const refillDue = potSize >= REFRESH_THRESHOLD;
  const teaDue = refillDue && !bagDead;
  // A market dealt short because the bag ran out. The cells were never filled, so
  // they are not holes a player swept - and it matters, because bare cells count
  // toward the trigger and the last lap therefore runs faster than the gauge's
  // usual pace would suggest.
  const marketCells = gameState.market.length;
  const tilesOnMarket = gameState.market.filter(t => t !== null && t !== undefined).length;
  const shortMarket = bagDead && tilesOnMarket < marketCells;

  // The gauge reads against the TRIGGER (REFRESH_THRESHOLD), not against the
  // number of printed symbols, because the trigger is the only thing a player is
  // tracking here. Surplus symbols carry no value now that the pot is a flat
  // TEA_POT_REWARD, so the count is clamped rather than reading "5/4".
  const shown = Math.min(potSize, REFRESH_THRESHOLD);

  // TWO different lines, and the difference matters. The section note states the
  // RULE and is always there, exactly like the one under Patisserie Goals (and,
  // until 4 August, Pantry Goals) - a player should never have to wait for the
  // trigger to arm before the game will tell them what it does. `note` below is the
  // live STATE: what is about to happen on this turn.
  let state, note;
  if (teaDue) {
    state = 'ready';
    // 3 August: the pot is mechanical, so this is a WARNING as much as a readout.
    // It no longer restates the mechanic (the section note above it does that);
    // it says the one thing a player can still act on.
    note = 'Brewing at the end of this turn - reserve a card now if you want to keep one.';
  } else if (refillDue) {
    // The trigger is armed and there is nothing left to pour. This is the END OF
    // THE GAME, so it takes the loud state rather than sitting greyed out: it is
    // the single most consequential thing the gauge ever has to say, and the old
    // "no more pots can be brewed" wording buried it as a footnote.
    state = 'ready';
    note = 'The bag is empty and a pot is due - this ENDS the game. Everyone finishes the round, then you score.';
  } else if (bagDead) {
    state = 'locked';
    note = shortMarket
      ? `The bag is empty, so the market was dealt short - ${tilesOnMarket} of ${marketCells} spaces. The next pot that comes due ends the game.`
      : 'The bag is empty. The next pot that comes due ends the game rather than refilling the market.';
  } else {
    state = 'locked';
    note = null;
  }

  // The gauge IS a section: it carries the shared .ft-section chrome and supplies
  // its own heading, rather than being wrapped in a second box. Its state
  // modifier still tints it, which is the one thing it must keep - a gauge that
  // cannot go loud when the pot is due is not a gauge.
  el.className = `ft-section ft-section--tea ft-tea-option ft-tea-option--${state}`;
  el.innerHTML = `
    <div class="ft-section__head">
      <span class="ft-section__title">Fresh Pot of Tea</span>
      <span class="ft-section__meta ft-section__meta--figure">${shown}/${REFRESH_THRESHOLD}</span>
    </div>
    <p class="ft-section__note">When ${REFRESH_THRESHOLD} teapots are visible, the tile market is reset and the cards refreshed.</p>
    <span class="ft-tea-option__count">
      <img src="images/teapot.png" class="ft-tea-option__icon" alt="">
      teapots visible
    </span>
    ${note ? `<span class="ft-tea-option__note">${note}</span>` : ''}
  `;
}

function setupMarketSelectButtons(gameState, enabled) {
  const marketRowButtons = document.getElementById('marketRowButtons');
  const marketColButtons = document.getElementById('marketColButtons');
  if (!marketRowButtons || !marketColButtons) return;

  const colLabels = ['A', 'B', 'C', 'D', 'E', 'F'].slice(0, gameState.marketSize);

  const disabledAttr = enabled ? '' : 'disabled';
  // `enabled` already means exactly "a human is in the sweep step and owes a
  // sweep right now", which is precisely when a new player needs telling that
  // these ten buttons are the move. Tag them so CSS can pulse them; the class
  // disappears the moment the sweep lands, so it teaches once per turn rather
  // than becoming wallpaper. See .ft-btn--sweep.is-awaiting.
  const awaitingClass = enabled ? ' is-awaiting' : '';

  marketColButtons.innerHTML = colLabels.map((label, col) => `
    <button class="ft-btn ft-btn--sweep market-col-btn${awaitingClass}" data-col="${col}" ${disabledAttr} style="width: var(--tile-size); height: var(--market-gutter-h); display: flex; align-items: center; justify-content: center; gap: 2px; flex-shrink: 0; padding: 0;">
      <img src="images/arrow_down.png" style="width: 12px; height: 12px; object-fit: contain;">
      <span style="font-weight: 600;">${label}</span>
    </button>
  `).join('');

  marketRowButtons.innerHTML = Array.from({ length: gameState.marketSize }, (_, row) => `
    <button class="ft-btn ft-btn--sweep market-row-btn${awaitingClass}" data-row="${row}" ${disabledAttr} style="width: var(--market-gutter-w); height: var(--tile-size); display: flex; align-items: center; justify-content: center; gap: 2px; flex-shrink: 0; padding: 0;">
      <img src="images/arrow_left.png" style="width: 12px; height: 12px; object-fit: contain;">
      <span style="font-weight: 600;">${row + 1}</span>
    </button>
  `).join('');

  if (!enabled) return; // no listeners — the disabled buttons are inert visuals

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
  // Defence in depth: never offer sweep choices outside a live human sweep
  // phase (onMarketClick would silently drop them, which reads as a dead UI).
  if (gameState.gamePhase !== 'sweep' || gameState.bonusTileAvailable) return;
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
  // Defence in depth: mirrors showSweepOptionsForRow's phase guard.
  if (gameState.gamePhase !== 'sweep' || gameState.bonusTileAvailable) return;
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

// One claim per turn, in the exact words the player needs. Shared by the market
// cards, the "on order" reserve card and the tooltip so they cannot drift apart.
const SECOND_CLAIM_MESSAGE = 'One claim per turn - you have already claimed. Click "Confirm Turn →" to end your turn.';

// True when a human is looking at cards they may no longer claim this turn. The
// engine's rule is enforced in claim(); this is only about explaining it.
function isSecondClaimBlocked(gameState) {
  const player = gameState.players[gameState.currentPlayerIndex];
  return gameState.gamePhase === 'refill' && gameState.claimsThisTurn > 0 && player.isHuman;
}

// In-page notice above the card row - the alert()-free way to answer a click the
// rules forbid. Self-clearing so it never becomes permanent furniture, and it
// re-triggers its own animation on a repeat click (a player who clicks a second
// card must see something happen, not a message that was already sitting there).
let cardRowNoticeTimer = null;
function showCardRowNotice(text) {
  const notice = document.getElementById('cardRowNotice');
  if (!notice) return;
  notice.textContent = text;
  notice.classList.remove('ft-hidden');
  notice.classList.remove('ft-card-row__notice--flash');
  void notice.offsetWidth; // force a reflow so the animation restarts
  notice.classList.add('ft-card-row__notice--flash');
  if (cardRowNoticeTimer) clearTimeout(cardRowNoticeTimer);
  cardRowNoticeTimer = setTimeout(() => {
    notice.classList.add('ft-hidden');
    notice.textContent = '';
  }, 5000);
}

// ONE card size, always. The area grows; the cards do not shrink.
//
// This used to step down as the row filled (200px for a short row, 145px once it
// passed four) so the strip could stay inside a fixed height. That is the wrong
// trade: the card art carries the PATTERN a player has to match against their
// board, and a pattern you have to squint at is worse than a taller panel. The
// card section simply takes the height it needs, which is what it should do.
//
// RE-DERIVED 4 AUGUST, because the width this is tuned against changed. The old
// figure was 200px, "the largest size that still fits THREE cards per row in the
// ~472px the .ft-centre-split leaves". The split is deleted with the pantry
// goals, so the card section is now the sole occupant of the centre panel's
// bottom band and the arithmetic runs:
//
//   800px   .ft-game centre grid column (fixed)
//   -18     .ft-centre padding (--spacing-sm each side) + 1px panel border each
//   = 782   the band's width
//   -28     .ft-section padding (--spacing-md each side) + 1px right border and
//           the 3px coloured left rule
//   = 754   inside the card section
//   -20     .ft-card-grid padding (10px each side, which exists to stop the
//           .ft-card--claimable glow ring being clipped)
//   = 734   usable for cards and the gaps between them
//
// Cards are 750.1 x 1039.6 on the sprite sheet, so width = height x 0.7216, and
// the flex gap is --spacing-md (12px). At FOUR per row the budget is
// 4w + 36 <= 734, i.e. w <= 174.5, i.e. height <= 241px.
//
// 235px is that ceiling with a margin. It buys, against the old 200px:
//   - a 17% larger pattern to read, which is the whole point of the panel;
//   - a SHORTER panel, not a taller one. A full 8-card row (MAX_MARKET_CARDS) is
//     exactly two rows of four - 502px including gap and padding - where 200px in
//     the old split gave three rows of three at 644px.
// Five per row would need a height of 190px, which is smaller than what we had.
// Four is the right count for this width.
//
// The ~20px of slack left at 4 x 169.6 + 36 = 714.2 is deliberate: browsers round
// fractional flex-item widths, and there is nothing to catch it if a row silently
// drops to three. If the centre column, the section padding or the card gap ever
// move, redo the subtraction above - it is the whole derivation.
const CARD_DISPLAY_HEIGHT = 235;

function cardDisplayHeight() {
  return CARD_DISPLAY_HEIGHT;
}

function updateCardMarket(gameState) {
  const cardMarket = document.getElementById('cardMarket');
  if (!cardMarket) return;

  // updateTeaReserveBanner is DELETED (3 August) along with the tea reserve round
  // it announced. A pot of tea is mechanical now - it resolves inside refill()
  // with nothing for anyone to decide - so there is no banner to raise and no
  // pending reserver to name. The imminent flush is signalled by the tea gauge
  // under the tile market instead (updateTeaOption), which is where the trigger
  // is printed on the physical board.

  // The row is VARIABLE-LENGTH (28 July rework, capped 30 July): 3 at setup, +1
  // at the end of every turn up to a hard cap of 8 (MAX_MARKET_CARDS), -1 per
  // market claim, cut back to 3 by a fresh pot of tea. Nothing here assumes a
  // length - the row is mapped over as-is.
  //
  // A long row grows the PANEL, not the cards: cardDisplayHeight is a constant
  // now and .ft-card-grid neither caps nor scrolls. The card art carries the
  // pattern a player has to match against their board, so it is the one thing
  // here that must never shrink. The row is capped at MAX_MARKET_CARDS (8), and
  // since the 4 August resize the band is full width and fits four per row, so
  // the worst case is TWO rows (three before, in the narrower split).
  //
  // reward_card_layout.png is a TTS-style 10×7 sheet; cards 1–50 fill the
  // first 5 rows, the last 2 rows are blank.
  const SPRITE_WIDTH = 7501;
  const SPRITE_HEIGHT = 7277;
  const CARDS_PER_ROW = 10;
  const CARDS_PER_COL = 7;
  const CARD_WIDTH = SPRITE_WIDTH / CARDS_PER_ROW;
  const CARD_HEIGHT = SPRITE_HEIGHT / CARDS_PER_COL;
  const DISPLAY_HEIGHT = cardDisplayHeight(gameState.cardMarket.length);
  const DISPLAY_WIDTH = CARD_WIDTH * (DISPLAY_HEIGHT / CARD_HEIGHT);
  const SCALE = DISPLAY_HEIGHT / CARD_HEIGHT;

  // Say how long the row is. Players cannot count a wrapped, scrolling strip at a
  // glance, and the length is strategic information: it is the running cost of
  // nobody ordering a fresh pot.
  const cardRowCount = document.getElementById('cardRowCount');
  if (cardRowCount) {
    const n = gameState.cardMarket.length;
    cardRowCount.textContent = `${n} card${n === 1 ? '' : 's'} on offer`;
    cardRowCount.classList.toggle('ft-card-row__count--long', n >= 8);
  }

  const currentPlayer = gameState.players[gameState.currentPlayerIndex];
  const claimableCardIds = new Set();

  // canClaimMore gates the whole set: with the table's empty-plate supply spent
  // there is no plate to plant, so nothing is claimable however well it matches.
  // Since 4 August that gate OPENS again for the final round - the ending is
  // armed by then and spare plates come from an unlimited supply - so the last
  // round highlights claimable cards exactly like any other.
  if (gameState.gamePhase === 'claim' && canClaimMore(gameState)) {
    for (const card of gameState.cardMarket) {
      // A card reserved THIS turn cannot be claimed this turn (3 August) - it is
      // not in the market row any more either, but the guard is cheap and states
      // the rule where a reader will look for it.
      if (card.id === gameState.reservedCardIdThisTurn) continue;
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
      <div data-card-id="${cardId}" class="card-market-sprite ${cardClass}" style="position: relative; width: ${DISPLAY_WIDTH}px; height: ${DISPLAY_HEIGHT}px; background-image: url('images/reward_card_layout.png?v=3'); background-position: ${bgPosX}px ${bgPosY}px; background-size: ${bgSizeW}px ${bgSizeH}px; background-repeat: no-repeat; ${clickable}">
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

  // ONE CLAIM PER TURN, SAID OUT LOUD (design doc §6). After a claim the turn
  // sits in the 'refill' phase and the cards simply stop responding, which reads
  // as a broken interface to the many players who assume a second claim is
  // allowed. Wire the whole row to state the rule instead of doing nothing: the
  // engine rejects the second claim either way, but a silent no-op teaches the
  // player nothing, and greying the cards out only says "no", never "why".
  // The message is in-page (the notice line above the row) rather than an
  // alert() - a modal dialog for a rule reminder is far too heavy a hammer, and
  // it is the only place in the game screen that would have used one.
  if (isSecondClaimBlocked(gameState)) {
    cardMarket.querySelectorAll('.card-market-sprite').forEach(cardEl => {
      cardEl.style.cursor = 'not-allowed';
      cardEl.classList.add('ft-card--claim-used');
      cardEl.title = SECOND_CLAIM_MESSAGE;
      cardEl.addEventListener('click', () => showCardRowNotice(SECOND_CLAIM_MESSAGE));
    });
  }

  // PAID RESERVE (3 August). The player whose turn it is may click a market card
  // to pay RESERVE_CUPCAKE_COST and take it into their reserve, once they have
  // armed the option from the cupcake panel. Two rules the UI has to make plain,
  // because the engine will otherwise refuse the click with a message:
  //   - the reserve holds RESERVE_LIMIT card, and
  //   - a card reserved this turn CANNOT be claimed this turn.
  //
  // This replaces the deleted tea-round reserve, in which a separately-tracked
  // reserver (NOT necessarily the current player) picked a card for free after
  // every pot. There is no round any more, so there is no banner and no
  // reserver index - it is simply an option on your own turn.
  const ui = window._gameUI || {};
  if (ui.reserveMode && canReserveCard(gameState)) {
    const actor = gameState.players[gameState.currentPlayerIndex];
    if (actor.isHuman) {
      // Scope to the card market only — the "On order" reserve slots in player
      // panels also carry the .card-market-sprite class and must NOT be treated
      // as reservable market cards.
      cardMarket.querySelectorAll('.card-market-sprite').forEach(cardEl => {
        cardEl.classList.add('ft-card--reservable');
        cardEl.style.cursor = 'pointer';
        cardEl.title = `Pay ${RESERVE_CUPCAKE_COST} cupcake to reserve this card. You may not claim it this turn.`;
        const cardId = parseInt(cardEl.dataset.cardId);
        cardEl.addEventListener('click', () => ui.onReserveCard?.(cardId));
      });
    }
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
      // A cupcake may relocate either a tile OR an empty plate token (blocked
      // cell) - any non-empty cell is a valid move source, and only empty cells
      // are move targets. The two cost DIFFERENT amounts since 3 August
      // (getMoveCost returns null for an empty plate now), so a cell is only
      // offered as a source if this player can actually afford to move it.
      const isMovableInCupcakeMode = isInCupcakeMode && tile !== null
        && player.cupcakes >= (getMoveCost(player, idx) ?? Infinity);
      const isMoveTarget = isInCupcakeMode && tile === null;
      // An empty plate is no longer a MOVE source (getMoveCost returns null for
      // one); it is a REMOVAL target, clicked rather than dragged. canRemovePlate
      // covers price, phase and the once-per-turn allowance in one call.
      const isPlateRemovable = isInCupcakeMode && isBlockedCell && canRemovePlate(gameState);

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
        if (isPlateRemovable) tileClass += ' ft-tile--removable';
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
        ? `<img src="images/empty_plate.png" class="ft-tile__icon" alt="blocked">`
        : (displayTile ? `<img src="images/symbol_${displayTile.ingredient}.png" class="ft-tile__icon" alt="${displayTile.ingredient}">` : '');
      const draggableAttr = isMovableInCupcakeMode ? 'draggable="true"' : '';
      const boardTileIndexAttr = isMovableInCupcakeMode ? `data-board-tile-index="${idx}"` : '';
      const plateRemoveAttr = isPlateRemovable
        ? `data-remove-plate-index="${idx}" title="Remove this empty plate to the box (${REMOVE_PLATE_CUPCAKE_COST} cupcakes)"`
        : '';

      return `
        <div class="${tileClass}" style="${bgColor}" data-index="${idx}" data-player="${playerIdx}" ${draggableAttr} ${boardTileIndexAttr} ${plateRemoveAttr}>
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

    // Empty-plate removal: one click, no destination step - the plate goes to the
    // box. Bound here rather than in the drag handlers because a removal has no
    // target cell to drop onto.
    if (isCurrentPlayer && player.isHuman && ui.cupcakeMode) {
      boardEl.querySelectorAll('[data-remove-plate-index]').forEach(el => {
        el.addEventListener('click', () => {
          ui.onRemovePlate?.(parseInt(el.dataset.removePlateIndex, 10));
        });
      });
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

    renderOnOrderSlot(gameState, player, playerIdx, boardEl);
  });
}

// The "On order" slot shows a player's face-up reserved cards beside their
// board, each tagged with a teacup badge so they read as ordered-not-yet-served.
// There is no cap on how many a player may hold (1 Aug rule change), so this
// renders a row of cards, oldest first, that wraps.
// During the OWNER's claim phase, any reserved card whose pattern is on their
// board becomes claimable exactly like a market card (click → showRemovalUI,
// which claim() then resolves from the reserve). The container is created lazily
// so it costs nothing until a card is actually reserved.
function renderOnOrderSlot(gameState, player, playerIdx, boardEl) {
  let slotEl = document.getElementById(`onOrder${playerIdx + 1}`);

  if (player.reservedCards.length === 0) {
    if (slotEl) slotEl.innerHTML = '';
    return;
  }

  if (!slotEl) {
    slotEl = document.createElement('div');
    slotEl.id = `onOrder${playerIdx + 1}`;
    slotEl.className = 'ft-on-order';
    boardEl.insertAdjacentElement('afterend', slotEl);
  }

  const isCurrentPlayer = playerIdx === gameState.currentPlayerIndex;
  const count = player.reservedCards.length;

  const cardsHTML = player.reservedCards.map(card => {
    const isClaimable = isCurrentPlayer && player.isHuman && gameState.gamePhase === 'claim'
      && getPatternMatches(player.board, card.pattern).length > 0;
    return cardSpriteHTML(card, 150, {
      extraClass: isClaimable ? 'ft-card--claimable' : '',
      clickable: isClaimable,
      badge: true,
    });
  }).join('');

  slotEl.innerHTML = `
    <div class="ft-on-order__label">🫖 On order${count > 1 ? ` (${count})` : ''}</div>
    <div class="ft-on-order__cards">${cardsHTML}</div>
  `;

  // Wire each card by position — cardSpriteHTML emits them in reserve order.
  const cardEls = slotEl.querySelectorAll('.card-market-sprite');
  player.reservedCards.forEach((card, i) => {
    const cardEl = cardEls[i];
    if (!cardEl) return;
    const isClaimable = isCurrentPlayer && player.isHuman && gameState.gamePhase === 'claim'
      && getPatternMatches(player.board, card.pattern).length > 0;
    if (isClaimable) {
      cardEl.addEventListener('click', () => showRemovalUI(gameState, card.id));
    } else if (isCurrentPlayer && isSecondClaimBlocked(gameState)) {
      // A reserved card is claimed through the SAME one-claim-per-turn budget as
      // a market card, and it is the card a player is most likely to reach for
      // second ("but it is mine, surely that one is free"). It must therefore say
      // the same thing the market cards say rather than sit there inert.
      cardEl.style.cursor = 'not-allowed';
      cardEl.classList.add('ft-card--claim-used');
      cardEl.title = SECOND_CLAIM_MESSAGE;
      cardEl.addEventListener('click', () => showCardRowNotice(SECOND_CLAIM_MESSAGE));
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

// Scoring breakdown for a player: cake-stand rows (cumulative value by tile
// count), crumb tray (1/tile) and claimed card VP. THREE lines since 4 August -
// the ingredient objectives were the fourth and are deleted from the game.
//
// CUPCAKES ARE NOT IN THE TOTAL since 3 August - they score nothing and are the
// first tiebreaker instead. The count is still returned so the UI can show it,
// but it must not be added to `total`, which has to agree with the engine's
// calculateFinalScores exactly.
function getScoreBreakdown(player) {
  let standTotal = 0;
  for (let i = 0; i < player.stand.length; i++) {
    const row = player.stand[i];
    if (row.tiles.length > 0) standTotal += STAND_ROW_VALUES[i][row.tiles.length - 1];
  }
  const crumbs = player.crumbTray.length;
  let cardVP = 0;
  for (const cardId of player.claimedCards) {
    const card = REWARD_CARDS.find(c => c.id === cardId);
    if (card) cardVP += card.vp;
  }
  const cupcakes = player.cupcakes;
  return {
    standTotal, crumbs, cardVP, cupcakes,
    total: standTotal + crumbs + cardVP,
  };
}

// renderObjectives() STOOD HERE, and is deleted (4 August).
//
// It drew the five public ingredient objectives as rows of symbol chips with a
// held/needed count read off the viewing player's board, lighting a row gold
// when it was ready to take and striking it through once somebody had. The
// pantry goals are gone from the game, so the panel, its markup, its CSS and
// this renderer all go with them; the card row (Patisserie Goals) now runs the
// full width of the centre panel in the space the split left behind.

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
      // Cupcake plates (bottom[1], second[1], third[1], top[0]) grant a cupcake
      // when plated onto; mark them on the board whether empty or filled.
      const isCupcakePlate = CUPCAKE_PLATES.some(p => p.rowIndex === rowIndex && p.plateIndex === k);
      const cupcakeMarker = isCupcakePlate
        ? `<span class="ft-stand__cupcake-plate" title="Cupcake plate - plating here gains a cupcake">🧁</span>`
        : '';
      slots += `
        <div class="ft-stand__slot">
          <div class="ft-stand__plate-wrap">${plate}${cupcakeMarker}</div>
          <div class="ft-stand__value ${filled ? 'ft-stand__value--earned' : ''}">${STAND_ROW_VALUES[rowIndex][k]}</div>
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
      </div>
      ${destinationMode ? '<div class="ft-stand__prompt">Choose where this tile goes ↓</div>' : ''}
      ${renderStand(p, { interactive: destinationMode, legalRows })}
    `;

    const cupcakeCount = p.cupcakes;
    // The cupcake button opens BOARD-SPEND mode, which covers two actions with
    // separate prices and separate per-turn allowances: move a tile
    // (MOVE_TILE_CUPCAKE_COST) or remove an empty plate to the box
    // (REMOVE_PLATE_CUPCAKE_COST). The button is live if EITHER is still payable
    // and unused - the engine prices and gates the actual cell on the click.
    const canMoveTile = p.cupcakes >= MOVE_TILE_CUPCAKE_COST && !gameState.moveUsedThisTurn;
    const canClearPlate = canRemovePlate(gameState);
    const canUseCupcakes = isCurrentPlayer && gameState.gamePhase === 'spend'
      && (canMoveTile || canClearPlate);
    const cupcakeClass = ui.cupcakeMode ? 'ft-cupcake-supply--active' : '';
    // The other two paid options, so a player can see the whole menu in one place
    // rather than discovering them phase by phase.
    const canBuyTile = isCurrentPlayer && canBuyExtraTile(gameState);
    const canReserve = isCurrentPlayer && canReserveCard(gameState);

    html += `
      <div class="ft-cupcake-supply ${cupcakeClass}" id="cupcakeSupply${playerIdx + 1}">
        <div class="ft-cupcake-header">
          <span class="ft-cupcake-label">🧁 Cupcakes</span>
          <span class="ft-cupcake-help-text">Click to move a tile (${MOVE_TILE_CUPCAKE_COST}) or remove an empty plate (${REMOVE_PLATE_CUPCAKE_COST})</span>
        </div>
        <div class="ft-cupcake-icons">
          ${cupcakeCount > 0 ? Array(cupcakeCount).fill().map((_, i) => `
            <button class="ft-cupcake-btn ${!canUseCupcakes ? 'ft-cupcake-btn--disabled' : 'ft-cupcake-btn--active'}"
                    data-cupcake-index="${i}"
                    title="Click to move a tile or remove an empty plate (${canUseCupcakes ? 'available' : 'unavailable'})"
                    ${!canUseCupcakes ? 'disabled' : ''}>
              <img src="images/cupcake.png" class="ft-cupcake-icon" alt="cupcake" />
            </button>
          `).join('') : '<span class="ft-cupcake-empty">You have no cupcakes left</span>'}
        </div>
        ${isCurrentPlayer && p.isHuman ? `
          <div class="ft-cupcake-spends">
            <button class="ft-cupcake-spend-btn ${ui.extraTileMode ? 'ft-cupcake-spend-btn--active' : ''}"
                    id="buyExtraTileBtn" ${canBuyTile ? '' : 'disabled'}
                    title="At the sweep step only, once per turn: take any one tile from the market and place it with your swept tiles">
              +1 tile from the market (${EXTRA_TILE_CUPCAKE_COST}🧁)
            </button>
            <button class="ft-cupcake-spend-btn ${ui.reserveMode ? 'ft-cupcake-spend-btn--active' : ''}"
                    id="reserveCardBtn" ${canReserve ? '' : 'disabled'}
                    title="Take one card from the market into your reserve. You may not claim it this turn, and your reserve holds ${RESERVE_LIMIT} card.">
              Reserve a card (${RESERVE_CUPCAKE_COST}🧁)
            </button>
          </div>` : ''}
        <span class="ft-cupcake-points">Cupcakes score no points - they break ties</span>
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

    if (canBuyTile && ui.onExtraTileToggle) {
      const btn = statsEl.querySelector('#buyExtraTileBtn');
      if (btn) btn.addEventListener('click', () => ui.onExtraTileToggle());
    }
    if (canReserve && ui.onReserveToggle) {
      const btn = statsEl.querySelector('#reserveCardBtn');
      if (btn) btn.addEventListener('click', () => ui.onReserveToggle());
    }
  });
}

function updateGameInfo(gameState) {
  // The old "Phase: sweep" info block is deleted. The status bar's turn heading
  // already reads "<name>'s Turn (sweep)", so it was the same fact twice, and it
  // cost a whole block of height in a column that was running off the page.

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
  const hasCupcakes = player.cupcakes > 0 && gameState.gamePhase === 'spend' && !gameState.moveUsedThisTurn;
  const cupcakeHint = hasCupcakes ? `<div class="ft-phase-bar__cupcake-hint">💡 You have ${player.cupcakes} cupcake${player.cupcakes === 1 ? '' : 's'} - spend one to move a tile, ${REMOVE_PLATE_CUPCAKE_COST} to remove an empty plate, or one to reserve a card.</div>` : '';
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
  } else if (gameState.gamePhase === 'sweep') {
    // Plain sweep: the market row/column buttons drive the sweep itself. There is
    // no tea control to put here - since 1 August a fresh pot is not ordered by
    // anybody, it fires automatically at the end of any turn that leaves
    // REFRESH_THRESHOLD teapots showing.
    //
    // What the bar DOES do is warn, at the moment it matters most, that the sweep
    // about to be chosen is the one that decides it. The gauge under the market
    // (updateTeaOption) carries the count; this is the nudge to look at it while
    // picking a line.
    //
    // 4 AUGUST: with an empty bag the same board state is one teapot from the END
    // OF THE GAME, not from a fresh pot. It used to be suppressed entirely in
    // that case (`bag.length > 0`), which hid the warning exactly when it was
    // worth the most - the sweep that uncovers that fourth teapot is now the
    // sweep that closes the game.
    const oneAway = getVisibleCupcakeSymbols(gameState) === REFRESH_THRESHOLD - 1;
    const teaPointer = oneAway
      ? (gameState.bag.length === 0
        ? `<div class="ft-phase-bar__status warning">🫖 One teapot from the end of the game - the bag is empty, so the next pot cannot be poured</div>`
        : `<div class="ft-phase-bar__status success">🫖 One teapot from a fresh pot of tea</div>`)
      : '';
    html = `
      <div class="ft-phase-bar">
        <div class="ft-phase-bar__instruction">Sweep a row or column above</div>
        ${teaPointer}
        <div class="ft-phase-bar__controls">
          ${undoBtn}
        </div>
      </div>
    `;
  } else if (gameState.gamePhase === 'place') {
    const placementCount = ui.placementMap ? Object.keys(ui.placementMap).length : 0;
    const allPlaced = placementCount === gameState.pendingSweepTiles.length;

    // THE EXTRA TILE IS OFFERED HERE and only here (3 August): it is a sweep-step
    // option, so it has to be taken before the swept tiles are committed.
    const extraTileHint = canBuyExtraTile(gameState)
      ? `<div class="ft-phase-bar__status success">🧁 You may spend ${EXTRA_TILE_CUPCAKE_COST} cupcake for ONE more tile from anywhere on the market - use the button in your cupcake panel, then click the tile.</div>`
      : (gameState.extraTileUsedThisTurn ? `<div class="ft-phase-bar__status">Extra tile bought this turn</div>` : '');

    html = `
      <div class="ft-phase-bar">
        <div class="ft-phase-bar__instruction">Drag tiles onto your board</div>
        <div class="ft-phase-bar__status">Placed: <strong>${placementCount}/${gameState.pendingSweepTiles.length}</strong></div>
        ${extraTileHint}
        <div class="ft-phase-bar__controls">
          ${undoBtn}
          <button id="placementDone" class="ft-btn ft-btn--primary ft-btn--small" ${!allPlaced ? 'disabled' : ''}>Done</button>
        </div>
      </div>
    `;
  } else if (gameState.gamePhase === 'spend') {
    // The 'move' phase became 'spend' on 3 August: it hosts three paid options
    // now (move a tile, move an empty plate, reserve a card), not just the move.
    const moveOptions = gameState.moveUsedThisTurn
      ? `<div class="ft-phase-bar__instruction">You've used your move for this turn</div>`
      : `<div class="ft-phase-bar__instruction">Spend cupcakes (optional)</div><div class="ft-phase-bar__status">Move a tile (${MOVE_TILE_CUPCAKE_COST}🧁), remove an empty plate (${REMOVE_PLATE_CUPCAKE_COST}🧁), and/or reserve a card (${RESERVE_CUPCAKE_COST}🧁)</div>`;
    const reserveNote = canReserveCard(gameState)
      ? `<div class="ft-phase-bar__status">A reserved card is safe from the tea flush - but you cannot claim it until your next turn.</div>`
      : (player.reservedCards.length >= RESERVE_LIMIT ? `<div class="ft-phase-bar__status">Your reserve is full (${RESERVE_LIMIT} card).</div>` : '');

    html = `
      <div class="ft-phase-bar">
        ${moveOptions}
        ${reserveNote}
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
      // The player's own reserved "on order" cards are claimable the same way.
      for (const card of currentPlayer.reservedCards) {
        const rMatches = getPatternMatches(currentPlayer.board, card.pattern);
        if (rMatches.length > 0) {
          claimableCards.push({ card, matches: rMatches });
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
    // State the one-claim-per-turn rule (§6) on the turn where it actually binds,
    // so a player looking for a second claim reads the rule rather than concluding
    // the cards have stopped working. Clicking a card says the same thing (see
    // updateCardMarket).
    const claimUsed = gameState.claimsThisTurn > 0
      ? `<div class="ft-phase-bar__status">You have claimed this turn - only one claim per turn</div>`
      : '';
    html = `
      <div class="ft-phase-bar">
        <div class="ft-phase-bar__instruction">Turn complete</div>
        ${claimUsed}
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

  // No tea button is wired here any more: the order control lives in the
  // persistent board affordance under the tile market (updateTeaOption).

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
  if (movePhaseNextBtn && gameState.gamePhase === 'spend') {
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
  // Card lookup mirrors claim(): market first, then this player's reserve. A
  // reserved "on order" card is claimed through exactly this path.
  const card = gameState.cardMarket.find(c => c.id === cardId)
    || player.reservedCards.find(c => c.id === cardId)
    || null;
  if (!card) {
    alert('Card not found');
    return;
  }
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

// Render one reward card from the shared sprite sheet at an arbitrary display
// height (the tile-market uses 260px inline; the "on order" reserve slot reuses
// this at a smaller size). Mirrors the sprite maths in updateCardMarket and the
// same cache-bust query-string (?v=3) used for reward_card_layout.png.
function cardSpriteHTML(card, displayHeight, { extraClass = '', clickable = false, badge = false } = {}) {
  const SPRITE_WIDTH = 7501;
  const SPRITE_HEIGHT = 7277;
  const CARDS_PER_ROW = 10;
  const CARDS_PER_COL = 7;
  const CARD_WIDTH = SPRITE_WIDTH / CARDS_PER_ROW;
  const CARD_HEIGHT = SPRITE_HEIGHT / CARDS_PER_COL;
  const SCALE = displayHeight / CARD_HEIGHT;
  const DISPLAY_WIDTH = CARD_WIDTH * SCALE;
  const col = (card.id - 1) % CARDS_PER_ROW;
  const row = Math.floor((card.id - 1) / CARDS_PER_ROW);
  const bgPosX = -(col * CARD_WIDTH * SCALE);
  const bgPosY = -(row * CARD_HEIGHT * SCALE);
  const bgSizeW = SPRITE_WIDTH * SCALE;
  const bgSizeH = SPRITE_HEIGHT * SCALE;

  return `
    <div data-card-id="${card.id}" class="card-market-sprite ft-card ${extraClass}" style="position: relative; width: ${DISPLAY_WIDTH}px; height: ${displayHeight}px; background-image: url('images/reward_card_layout.png?v=3'); background-position: ${bgPosX}px ${bgPosY}px; background-size: ${bgSizeW}px ${bgSizeH}px; background-repeat: no-repeat; ${clickable ? 'cursor: pointer;' : ''}">
      <div class="ft-card__vp" title="${card.vp} victory point${card.vp === 1 ? '' : 's'}">${card.vp}</div>
      ${badge ? '<div class="ft-card__teacup" title="On order - not yet served">🫖</div>' : ''}
    </div>
  `;
}

// showTeaConfirm DELETED 1 AUGUST. It was the "Order a fresh pot of tea?" overlay
// with its Cancel / Order the pot buttons, opened from the tea button under the
// market. Its real job was to put the DESTRUCTIVE tile flush somewhere it could
// not be skimmed past before the player committed to it.
//
// There is nothing left to confirm - tea fires from the engine at the end of any
// turn that leaves REFRESH_THRESHOLD teapots showing, and a dialog cannot cancel
// it. The warning it carried has moved to where it can still change a decision:
// the rules panel, and the phase-bar line shown while a player is one teapot away
// and choosing which line to sweep.

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
