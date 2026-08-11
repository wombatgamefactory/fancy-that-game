import { BOARD_SIZE, REWARD_CARDS } from '../engine/tiles.js';
// THE PANTRY GOALS IMPORTS ARE GONE (4 August). getObjectiveRequirement,
// isObjectiveSatisfied, OBJECTIVE_VP and OBJECTIVE_TILE_COUNT no longer exist in
// the engine - the ingredient objectives are deleted from the game, so importing
// them is a hard error rather than a dead name. countBoardIngredient goes with
// them: it survives in the engine for the bots, but the only thing that ever
// asked it a question here was the objectives panel.
import { getPatternMatches, getLegalDestinations, getMoveCost, canDealCards, canBuyExtraTile, canRemovePlate, canClaimMore, getExtraClaimCupcakeCost, getMaxExtraTilesPerTurn, getWinningPlayers, REFRESH_THRESHOLD, TEA_POT_REWARD, INITIAL_MARKET_CARDS, MAX_MARKET_CARDS, STAND_ROW_VALUES, CUPCAKE_PLATES, TEAPOT_SYMBOL_CELLS, MOVE_TILE_CUPCAKE_COST, REMOVE_PLATE_CUPCAKE_COST, DEAL_CARDS_CUPCAKE_COST, CARDS_PER_DEAL, EXTRA_TILE_CUPCAKE_COST, getSweepPlacementCount, getVisibleTeapotSymbols, getStartingCupcakes, isTastingMenuInPlay, getAvailableMenus, getMenuDeficit, getMenuIngredients, satisfiesMenu, TASTING_MENU_VP, TASTING_MENUS, isFlavourInPlay, getFlavourCount, getFlavourLeaders, FLAVOUR_VP_PER_TILE, FLAVOUR_MAJORITY_VP } from '../engine/game.js';

// THE MOTION VOCABULARY AND THE SOUND WORLD (stage 8, plan sections 7 and 13).
// board.js owns exactly two of the seven movement sites - the settle, which fires
// when ui.placementMap gains a key rather than at the batch commit, and the
// sheet, which is a view transition because a transform on a fixed sheet would
// make it the containing block for its own fixed descendants. The other five sit
// in main.js, at the actions that cause them.
import {
  runTransition, flyClone, tileClone, boardCell, haptic, gatePassed, capRings,
  watchOpponent, paintLine, currentLine, timings, countShown, isHumanTurn,
  reduced,
} from './motion.js';
import { playCue, soundEnabled, setSoundEnabled } from './sound.js';

// Ingredient names as they appear in copy. The engine's INGREDIENTS are lowercase
// keys that double as image filenames (images/symbol-<ingredient>-v3.png), and a
// sentence should not be the place that discovers that.
//
// The -v2 files are the web-scale export (ticket 17, 9 August): 88px on the long
// side, which is 2x .ft-flavour__symbol at 44px, the largest box any of these is
// ever drawn in. The v1 files were 794 to 1200px and 531KB combined; these are
// 4.6KB. The originals stay in images/ under their old symbol_<ingredient>.png
// names, unreferenced, so the two can be compared.
const INGREDIENT_LABELS = {
  lemon: 'Lemon',
  chocolate: 'Chocolate',
  caramel: 'Caramel',
  strawberry: 'Strawberry',
  almond: 'Almond',
};

function ingredientLabel(ingredient) {
  return INGREDIENT_LABELS[ingredient] || ingredient || '';
}

// "an almond tile", "a lemon tile". Only one of the five ingredients starts with
// a vowel today, but an ingredient is dropped at random into a sentence, so the
// article has to be derived rather than written.
function ingredientPhrase(ingredient) {
  const word = ingredientLabel(ingredient).toLowerCase();
  return `${/^[aeiou]/.test(word) ? 'an' : 'a'} ${word}`;
}

// ---------------------------------------------------------------------------
// THE INTERFACE ICONS (stage 2, plan section 8.7)
// ---------------------------------------------------------------------------
//
// One inline <defs> sprite of thirteen drawings, emitted once at the top of
// <body> in index.html - OUTSIDE #app, because this module re-renders by
// assigning #app.innerHTML and a sprite inside it would be deleted by the first
// updateGameDisplay, taking every icon in the game with it. Same reason the
// toast below mounts on document.body.
//
// Every site is aria-hidden and the control keeps a real text label or an
// aria-label: NO ICON IN THIS SET IS EVER THE ACCESSIBLE NAME OF ANYTHING. The
// two that stand in for a word - person/bot on a seat header, crumb-tray on the
// fifth stand chip - are backed by a visually hidden word and by the same fact
// printed elsewhere on the screen.
//
// `size` is omitted only for the sweep arrows, whose 12-at-XL / 16-in-the-touch
// -band sizing has to come from CSS. Everywhere else the size is fixed and the
// attribute is the honest place for it.
// THE SPEND MENU'S CUPCAKE IS THE BIG ONE (10 August, Dean). Every other cupcake
// on the screen is a unit beside a count - 12 in the rail and on an opponent's
// row, 10 on a stand plate - and is read as "cupcakes" once and then ignored. In
// the spend menu it is the CURRENCY SYMBOL on a price list, the thing being
// compared down a column of six, and it was drawn at 14: smaller than the words
// beside it and, at that size, unidentifiable.
//
// 20 IS AS LARGE AS THE CHIP CAN HOLD. The chip is 24px tall - 1px of border and
// 4px of padding each side - so a 20px mark clears the border by 2px and needs
// the negative margin in .ft-spend-chip__price .ft-icon to stop it setting the
// chip's height. Anything larger reopens the page-height budget at 2181, which
// is the constraint that ended the first attempt at this.
// The size and the ART are one change: a monochrome glyph was tried at 18 and 20
// first and stayed unreadable, because what fails at this scale is the drawing
// and not the pixels. See cupcakeMark below.
const SPEND_CUPCAKE_ICON = 20;

function icon(name, size, extraClass = '') {
  const dims = size ? ` width="${size}" height="${size}"` : '';
  const cls = extraClass ? `ft-icon ${extraClass}` : 'ft-icon';
  return `<svg class="${cls}"${dims} aria-hidden="true" focusable="false"><use href="#i-${name}"/></svg>`;
}

// ---------------------------------------------------------------------------
// ONE CUPCAKE, EVERYWHERE (10 August, Dean's question, and it was the right one)
//
// There were two. The painted cupcake sat in the supply header - "Cupcakes [art]
// 2" - and a monochrome icon stood for the same object in five other places: the
// rail chip, an opponent's stat row, a stand plate marker, the phone's Cupcakes
// button and every price in the spend menu. Nothing distinguished the two roles.
// The nearest thing to a rationale was "art for the thing you have, a glyph for
// the unit you are counting", and no player has ever been told that; what they
// see is a game that draws its own currency two ways.
//
// THE ART WINS AND THE GLYPH IS DELETED, on three grounds:
//   - IT IS THE ONE ICON IN THE SET THAT IS AN OBJECT rather than a piece of
//     interface. A cupcake is a component players will hold in a prototype. Every
//     other glyph here (close, undo, arrows, book, person, bot) stands for an
//     action or a category and belongs to the line set; this one stands for a
//     thing on the table.
//   - COLOUR IDENTIFIES IT AT SIZES WHERE SHAPE CANNOT. At 10 and 12px neither
//     drawing is identifiable as a cupcake - the whole mark is a dozen pixels -
//     but the painted one is identifiable as ITSELF, by its purple case, which is
//     what a player is really doing when they read a price at that size.
//   - IT ALREADY COSTS NOTHING. The header loaded it on every screen already, so
//     the five new sites are the same file and no new request.
//
// It is `images/cupcake-v2.png`: the same art, trimmed of its transparent margin,
// squared, and exported at 64px - which covers the largest use (20px) at device
// pixel ratio 3, in 5.3KB against the original's 25KB at 512px. The original
// stays in images/ under its old name, unreferenced, per the -v2/-v3 convention
// the ingredient symbols already use.
//
// It carries `ft-icon` so it takes that class's baseline alignment and the spend
// chip's negative margin without a second set of rules, and it is aria-hidden
// with an empty alt, exactly like the glyphs: no icon in this build is ever the
// accessible name of anything, and every site that uses this one already says
// "cupcake" in words nearby or in its own aria-label.
function cupcakeMark(size) {
  return `<img src="images/cupcake-v2.png" class="ft-icon ft-cupcake-mark" width="${size}" height="${size}" alt="" aria-hidden="true">`;
}

// ---------------------------------------------------------------------------
// A SHEET'S CHROME (stage 6's shape, stage 7's fifth and sixth users)
//
// A grab handle, a title and Close, INSIDE the sheet rather than floating above
// it as a separate fixed bar - the 56px comes out of the same reserve either
// way, and this is what .ds-dialog already does, so the model has one shape
// rather than two and there is no second element to re-position on every render.
//
// Emitted unconditionally at every width and drawn at none of them except the
// phone band: `.pm-sheet-head { display: none }` at file scope, so no render
// path has to consult a media query. Labelled Close and not Done, because
// nothing has been done.
// ---------------------------------------------------------------------------
function sheetHeadHTML(title) {
  return `<div class="pm-sheet-head">
      <span class="pm-sheet-head__handle" aria-hidden="true"></span>
      <h2 class="pm-sheet-head__title">${title}</h2>
      <button class="pm-sheet-head__close" type="button" data-pm-close>Close</button>
    </div>`;
}

// ---------------------------------------------------------------------------
// THE TOAST (9 August, ticket 00 / finding 16)
// ---------------------------------------------------------------------------
//
// Every engine refusal used to arrive as an alert(). Three things were wrong
// with that and only the third is cosmetic:
//   - it BLOCKS. A modal dialog stops the page and the player's turn until it is
//     dismissed, for a message that is a sentence long.
//   - on iOS it is prefixed "wombatgamefactory.github.io says:", which reads as
//     a browser security warning rather than as the game talking.
//   - it is OS chrome in the middle of a hand-drawn tea room.
//
// The strings are unchanged - only the transport is. This is deliberately the
// plainest thing that works, on the existing tokens; the typography ticket may
// restyle it later.
//
// TWO ERRORS IN QUICK SUCCESSION MUST NOT STACK INTO A WALL, which is why there
// is exactly ONE toast element for the whole page and a second message REPLACES
// the first rather than queueing behind it. A player who taps a forbidden thing
// four times gets one line, not four; the repeat is still visible because the
// entrance animation is restarted by hand (the same reflow trick as the card-row
// notice above).
//
// It mounts on document.body, NOT inside #app: the game re-renders by assigning
// #app.innerHTML, which would delete a toast mid-message.
const TOAST_MS = 3000;
let toastEl = null;
let toastTimer = null;

function hideToast() {
  if (toastTimer) { clearTimeout(toastTimer); toastTimer = null; }
  if (toastEl) toastEl.classList.add('ft-hidden');
}

export function showToast(message) {
  const text = typeof message === 'string' ? message.trim() : '';
  if (!text) return;

  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.className = 'ft-toast ft-hidden';
    // role="alert" rather than "status": these are refusals, and a player who
    // cannot see the screen needs to hear one at the moment it happens.
    toastEl.setAttribute('role', 'alert');
    // Dismissible by tap, per the ticket. The whole toast is the target, so it
    // is far larger than the 44px floor and needs no close control of its own.
    toastEl.addEventListener('click', hideToast);
    document.body.appendChild(toastEl);
  }

  toastEl.textContent = text;
  toastEl.classList.remove('ft-hidden');
  toastEl.classList.remove('ft-toast--flash');
  void toastEl.offsetWidth; // force a reflow so a repeat message re-animates
  toastEl.classList.add('ft-toast--flash');

  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, TOAST_MS);
}

// IS THIS A FINGER OR A MOUSE? `(hover: none)` is the only honest test - it asks
// the PRIMARY pointer whether it can hover, which a touchscreen cannot and a
// trackpad or mouse can. Width is not a proxy for it (a narrow desktop window is
// still a mouse) and neither is a touch-events check (hybrid laptops report both).
//
// Queried live rather than cached, because the answer changes: a tablet with a
// keyboard case attached flips it mid-session, and every caller here runs inside
// a re-render, so a live read costs nothing and never goes stale.
function isTouchInput() {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(hover: none)').matches;
}

// "Tap" or "Click", capitalised, for the start of an instruction.
//
// 9 AUGUST, STAGE 1, DEFECT 14. Ticket 00 fixed the verb at ONE site - the
// placement line below - and eight more visible strings were missed, five of
// them in the phase bar and all three steps of the claim. A phone player was
// being told to click through the hardest part of the game to learn.
//
// A HELPER RATHER THAN EIGHT INLINE TERNARIES, because the ninth site is what
// the last one was: the point of a named function is that a grep for it finds
// every place the verb is decided. isTouchInput() is still read LIVE on every
// call - a tablet with a keyboard case flips the answer mid-session and every
// caller here runs inside a re-render, so caching it would be a stale string
// nobody would think to look for.
function clickVerb() {
  return isTouchInput() ? 'Tap' : 'Click';
}

// "1 cupcake" / "2 cupcakes". The three paid spends used to print their price as
// a bare number followed by the cupcake emoji; with the emoji gone (9 August,
// ticket 00 / finding 07) the price has to say what it is in words, and the
// plural has to be derived because every one of these prices is a tuning
// constant that has already changed more than once.
function cupcakePrice(n) {
  return `${n} cupcake${n === 1 ? '' : 's'}`;
}

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
  // THREE CORRECTIONS, 9 August, stage 1, defect 15. The one surface a
  // first-timer reads before playing was the one surface that was wrong, and
  // the game's own in-moment copy was right where the book was wrong:
  //
  //   - the extra tile was called "Once per turn" against
  //     MAX_EXTRA_TILES_PER_TURN = null. The button's own tooltip already said
  //     "as often as you can pay".
  //   - the claim was called "One card per turn" against an uncapped 1-cupcake
  //     further claim that the phase bar was already offering correctly. A
  //     player was being talked out of a legal move by the rules screen.
  //   - the spends were counted as five where six exist.
  //
  // ALL THREE ARE DERIVED FROM THE ENGINE rather than typed, in the same
  // spirit as the numbers already interpolated below. Both rules can still be
  // swung back by the A/B seams (setExtraClaimCupcakeCost,
  // setMaxExtraTilesPerTurn), and a modal that stated the dead rule is exactly
  // the defect being fixed - so the copy has to follow the live value, not the
  // value that was live on the day it was written.
  const extraClaimCost = getExtraClaimCupcakeCost();
  const extraTileCap = getMaxExtraTilesPerTurn();

  const extraTileRule = extraTileCap === null
    ? 'as often as you can pay'
    : `up to ${extraTileCap} time${extraTileCap === 1 ? '' : 's'} per turn`;

  const claimRule = extraClaimCost === null
    ? '<strong>One card per turn.</strong>'
    : `<strong>Your first claim is free. Each further one costs ${extraClaimCost} cupcake${extraClaimCost === 1 ? '' : 's'}.</strong>`;

  // FIVE spends live at step 3 since 10 August - the extra tile moved in from
  // step 1 - and only the further claim at step 4 sits outside it. Counted rather
  // than typed for the same reason the rules above are.
  const spendCount = extraClaimCost === null
    ? 'All five cupcake spends are here.'
    : 'One more spend sits outside this step: a further claim at step 4. Six in all.';

  const modal = document.createElement('div');
  modal.className = 'ft-modal';
  modal.innerHTML = `
    <div class="ft-modal__inner">
      <button class="ft-modal__close" aria-label="Close rules">${icon('close', 16)}</button>
      <div class="ft-modal__title">
        <h2>How to Play</h2>
      </div>
      <!-- REWRITTEN 7 August: STATEMENTS OF THE RULES, and nothing else.
           What came out, and the test each line now has to pass:
           - the reasons. "That is the trade, and it is deliberate", "the surplus is
             the point", "that is the price of the pot" - all design commentary. A
             player at the table wants to know what happens, not why it was chosen.
           - the second and third telling. Several rules were stated, then restated
             as a consequence, then again as advice. Each is said once now.
           - the flavour quotes at the head of three sections.
           A LINE EARNS ITS PLACE IF A PLAYER COULD GET THE GAME WRONG WITHOUT IT.
           That is why the lock-one-ingredient-to-one-row rule keeps its sentence
           and the empty plate keeps its two, while the pot of tea lost four.

           ONE RULE WAS ALSO WRONG, not merely wordy: the Tasting Menu section said
           the crumb tray does not count. It has counted since 6 August
           (MENU_COUNTS_CRUMB_TRAY in game.js) and the copy had never caught up.
           Every number below is interpolated from the engine rather than typed, so
           this cannot drift again the next time a constant moves. -->
      <div class="ft-rules">
        <div class="ft-rules__section ft-rules__section--boxed ft-rules__section--goal">
          <div class="ft-rules__section-title">Goal</div>
          <div class="ft-rules__text">Claim patisserie cards by making their colour patterns on your board. Cards score points, and every claim moves one tile onto your cake stand, where filled rows score most.</div>
        </div>

        <div class="ft-rules__section ft-rules__section--boxed ft-rules__section--turn">
          <div class="ft-rules__section-title">Your Turn (5 Steps)</div>

          <div class="ft-rules__step">
            <div class="ft-rules__step-title">1. Sweep</div>
            <div class="ft-rules__text">Pick a row or column of the market and declare a colour or an ingredient. Take every tile in that line matching your declaration.</div>
            <div class="ft-rules__text">Clear the whole line and take 1 free extra tile from anywhere on the market.</div>
          </div>

          <div class="ft-rules__step">
            <div class="ft-rules__step-title">2. Place Tiles</div>
            <div class="ft-rules__text">Put every swept tile into empty cells of your 5×5 board. Any cells - they need not touch.</div>
            <div class="ft-rules__text">If they will not all fit, place as many as you can and choose which of the rest go back into the bag.</div>
          </div>

          <div class="ft-rules__step">
            <div class="ft-rules__step-title">3. Spend Cupcakes (optional)</div>
            <div class="ft-rules__text"><strong>${EXTRA_TILE_CUPCAKE_COST}:</strong> take 1 extra tile from anywhere on the market and place it on your board, ${extraTileRule}.</div>
            <div class="ft-rules__text"><strong>${MOVE_TILE_CUPCAKE_COST}:</strong> move one of your tiles to an empty cell.</div>
            <div class="ft-rules__text"><strong>${REMOVE_PLATE_CUPCAKE_COST}:</strong> return one empty plate from your board to the box, freeing that cell.</div>
            <div class="ft-rules__text"><strong>${DEAL_CARDS_CUPCAKE_COST}:</strong> deal ${CARDS_PER_DEAL} new cards onto the card row. <strong>You may claim one of them this turn.</strong> Not available if the row has no room for both.</div>
            <div class="ft-rules__text">All of these are once per turn except the extra tile, which is ${extraTileRule}. ${spendCount}</div>
          </div>

          <div class="ft-rules__step">
            <div class="ft-rules__step-title">4. Claim (optional)</div>
            <div class="ft-rules__text">If tiles on your board make a card's colour pattern, in any rotation or reflection, claim it. ${claimRule}</div>
            <div class="ft-rules__text">Remove 1 tile from the pattern and put it on a cake stand row or in your crumb tray.</div>
            <div class="ft-rules__text">Each ingredient locks to <strong>one</strong> stand row: the first tile you plate fixes that row, and no other row may ever hold that ingredient. Once the row is full, further tiles of it go to the crumb tray.</div>
            <div class="ft-rules__text">An empty plate fills the cell the tile came from. Nothing can be placed there again and it breaks patterns. Plates are unlimited.</div>
          </div>

          <!-- Step 5 used to be "Check Objectives", the end-of-turn pantry goal
               check. The ingredient objectives are deleted (4 August), so the
               card deal moves up into the slot and the turn is genuinely five
               steps again, which is what the section heading always claimed. -->
          <div class="ft-rules__step">
            <div class="ft-rules__step-title">5. Deal a Card</div>
            <div class="ft-rules__text">1 new card joins the card row at the end of <strong>every</strong> turn, whether or not you claimed, and whether or not a pot of tea is brewed, up to ${MAX_MARKET_CARDS}. A claim does not refill the gap it leaves.</div>
            <div class="ft-rules__text">The tile market is never topped up. Swept tiles leave holes until a fresh pot of tea.</div>
          </div>
        </div>

        <div class="ft-rules__section ft-rules__section--boxed ft-rules__section--tea">
          <div class="ft-rules__section-title">A Fresh Pot of Tea</div>
          <div class="ft-rules__text">A teapot is showing when the space printed under it is empty. If ${REFRESH_THRESHOLD} are showing at the end of your turn, a pot is brewed automatically, on top of your usual card:</div>
          <div class="ft-rules__text">1. You gain ${TEA_POT_REWARD} cupcake${TEA_POT_REWARD === 1 ? '' : 's'}.</div>
          <div class="ft-rules__text">2. Fill every empty space on the tile market from the bag. Tiles already on the market stay exactly where they are.</div>
          <div class="ft-rules__text">The card row is not touched at all - no cards are discarded, and you still deal your end-of-turn card. If the bag runs short, deal out what is left and carry on. Play then passes to the left as usual.</div>
        </div>

        <!-- The PANTRY GOALS section stood here until the morning of 4 August:
             five face-up pairs of ingredient cards, 3 points to the first player
             holding the named tiles. The whole module is deleted from the game, so
             the rules do not mention it at all rather than explaining something no
             longer on the table. TODAY'S SPECIALITY replaced it that afternoon,
             THE FRESHNESS BONUS replaced that the same evening, and THE TASTING
             MENU, below, replaced the Freshness Bonus on 5 August - so none of the
             three dead versions is described here either. -->

        <!-- THE TASTING MENU (5 August), replacing the Freshness Bonus. It is NOT
             placed with the fresh pot of tea, and that is the rule rather than a
             layout choice: the pot does not touch the menus at all, and the whole
             point of the module is that its deadline is an opponent rather than a
             clock. Filing it under tea would teach exactly the wrong thing.
             STATELESS, like the cupcakes section below it: this modal opens from
             the SETUP screen as well as from a live game, so it cannot name which
             menus are on the table. The card value and the deck size are read off
             the engine rather than typed in. -->
        <div class="ft-rules__section ft-rules__section--boxed ft-rules__section--menus">
          <div class="ft-rules__section-title">Tasting Menus</div>
          <div class="ft-rules__text">At setup, deal one more than the number of players face up beside the market, from a deck of ${TASTING_MENUS.length}. They are never replaced.</div>
          <div class="ft-rules__text">Each asks for three tiles: one ingredient twice and a second once, or three different ingredients.</div>
          <div class="ft-rules__text">The moment your <strong>cake stand and crumb tray together</strong> show those ingredients, take the card. Free, automatic, and no part of your turn.</div>
          <div class="ft-rules__text">Ingredients are not spent - the same tiles can satisfy more than one menu.</div>
          <div class="ft-rules__text">Only one player can take a given menu. First to qualify keeps it, and it never returns.</div>
          <div class="ft-rules__text"><strong>${TASTING_MENU_VP} points</strong> each at the end of the game.</div>
        </div>

        <!-- THE FLAVOUR OF THE DAY (6 August). It sits directly after the Tasting
             Menu because that is where it sits on the table, and because the two
             have to be told apart in the same breath: both name ingredients, and
             everything else about them is opposite. A menu reads your CAKE STAND,
             is a race, and one player takes it. The Flavour reads your PLAYER
             BOARD, is not a race, and everybody scores it.
             The board-only line is the one that has to land - a player who assumes
             their cake stand counts spends the whole game sacrificing tiles they
             thought they were keeping. STATELESS like its neighbours: this modal
             opens from the setup screen too, so it cannot name today's ingredient. -->
        <div class="ft-rules__section ft-rules__section--boxed ft-rules__section--flavour">
          <div class="ft-rules__section-title">The Flavour of the Day</div>
          <div class="ft-rules__text">One ingredient is revealed at setup. It never changes.</div>
          <div class="ft-rules__text">At the end of the game, score <strong>${FLAVOUR_VP_PER_TILE} point per tile of that ingredient on your player board</strong>.</div>
          <div class="ft-rules__text">The player with the most scores <strong>${FLAVOUR_MAJORITY_VP} points more</strong>. Everybody tied for the most scores the full ${FLAVOUR_MAJORITY_VP}. There is no tiebreak.</div>
          <div class="ft-rules__text"><strong>Only your player board counts</strong> - not your cake stand, not your crumb tray. A claim that sacrifices one of these tiles costs you the point.</div>
        </div>

        <div class="ft-rules__section ft-rules__section--boxed ft-rules__section--cupcakes">
          <div class="ft-rules__section-title">Cupcakes</div>
          <!-- STATELESS ON PURPOSE. This modal opens from the SETUP screen as well
               as from a live game (see both listeners below), so there is no
               gameState to read a player count off. The two figures are still
               derived from the engine's table rather than typed in, so the copy
               cannot drift away from the rule. -->
          <!-- THE STARTING TABLE IS PRINTED AS A TABLE, not described. The prose it
               replaces ("everyone starts with 2; at 4 players the third and fourth
               start with 3") was WRONG at two players, where the second seat starts
               with 3 - a drift the interpolation now makes impossible. -->
          <div class="ft-rules__text">Starting cupcakes, by seat: <strong>2 players</strong> ${getStartingCupcakes(2).join(' / ')}, <strong>3 players</strong> ${getStartingCupcakes(3).join(' / ')}, <strong>4 players</strong> ${getStartingCupcakes(4).join(' / ')}.</div>
          <div class="ft-rules__text">Gain ${TEA_POT_REWARD} when a pot of tea is brewed on your turn, and 1 for plating a tile onto a cupcake plate.</div>
          <div class="ft-rules__text">Spend: <strong>${EXTRA_TILE_CUPCAKE_COST}</strong> extra tile · <strong>${DEAL_CARDS_CUPCAKE_COST}</strong> deal ${CARDS_PER_DEAL} new cards · <strong>${MOVE_TILE_CUPCAKE_COST}</strong> move a tile · <strong>${REMOVE_PLATE_CUPCAKE_COST}</strong> remove a plate.</div>
          <div class="ft-rules__text">Cupcakes score no points. They break ties.</div>
        </div>

        <div class="ft-rules__section ft-rules__section--boxed ft-rules__section--scoring">
          <div class="ft-rules__section-title">Scoring</div>
          <!-- The fourth line WAS "Ingredient objectives: 3 points per pair
               taken", deleted with the pantry goals on the morning of 4 August.
               Today's Speciality took the fourth slot back that afternoon, the
               Freshness Bonus took it off Today's Speciality the same evening, and
               the Tasting Menu took it from the Freshness Bonus on 5 August. -->
          <div class="ft-rules__text"><strong>Cake stand:</strong> each row by how many plates it fills. The bottom row climbs ${STAND_ROW_VALUES[0].join(' / ')}; shorter rows print their own totals.</div>
          <div class="ft-rules__text"><strong>Crumb tray:</strong> 1 per tile.</div>
          <div class="ft-rules__text"><strong>Cards:</strong> the points printed on each card you claimed.</div>
          <div class="ft-rules__text"><strong>Tasting Menus:</strong> ${TASTING_MENU_VP} each.</div>
          <div class="ft-rules__text"><strong>Flavour of the Day:</strong> ${FLAVOUR_VP_PER_TILE} per tile on your player board, and ${FLAVOUR_MAJORITY_VP} more to the player or players with the most.</div>
          <div class="ft-rules__text"><strong>Cupcakes:</strong> nothing.</div>
          <div class="ft-rules__text"><strong>Tiebreak:</strong> most cupcakes, then most cards claimed, then the victory is shared.</div>
        </div>

        <!-- REWRITTEN 4 AUGUST, and again on 6 August. Four bullets became two:
             the empty-plate pool is deleted outright (plates are unlimited), a
             pot of tea that cannot be poured no longer ends anything, and
             sweeping more than you can hold is now the placement rule in step 2
             rather than an ending. The trigger-then-finish-the-round shape is
             unchanged and still leads the section. -->
        <div class="ft-rules__section ft-rules__section--boxed ft-rules__section--end">
          <div class="ft-rules__section-title">Game Ends When</div>
          <div class="ft-rules__text">Either trigger fires:</div>
          <div class="ft-rules__text">• <strong>A player's board is full</strong> - all 25 cells hold a tile or an empty plate, or</div>
          <div class="ft-rules__text">• <strong>No tiles are left</strong> - the market and the bag are both empty.</div>
          <div class="ft-rules__text">Play then continues until the turn comes back round to the start player, so everyone has had the same number of turns. Then score.</div>
          <div class="ft-rules__text">Nothing else ends the game. If a pot of tea comes due with an empty bag, the pot simply does not happen and play continues.</div>
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

// THE RESUME CARD (stage 8, plan section 10, decision 4)
//
// ONE CONDITIONAL BLOCK inside .ft-landing, before .ft-landing__main, and its two
// handlers. Nothing else in renderSetupScreen changes, so THE LANDING PAGE IS
// BYTE-FOR-BYTE UNCHANGED WHEN THERE IS NO SAVE - a first-time visitor, a
// publisher opening the pitch link and a marketing arrival all see exactly the
// page they see today.
//
// ABOVE THE HERO rather than at the top of .ft-play, because style.css:339
// stacks the columns on a phone and the play column is a full screen below the
// fold, where a returning player would never find it.
//
// AUTOMATIC RESTORE IS REFUSED, and the reason has nothing to do with taste: THE
// GAME SCREEN HAS NO EXIT. Back to Setup exists only on the end screen, so an
// automatic restore would make the setup screen unreachable for anybody holding
// a save - and a publisher opening the pitch link on a shared device would land
// inside somebody else's half-played game with no way out but finishing it.
//
// It is a card in the flow rather than a modal, and a modal on arrival is the
// popup stage 6's model forbids twice over.
function resumeCardHTML(resume) {
  if (!resume) return '';
  return `
      <section class="ft-resume">
        <h2 class="ft-resume__title">You have a game in progress.</h2>
        <p class="ft-resume__position">${resume.position}</p>
        <p class="ft-resume__when">${resume.when}</p>
        <p class="ft-resume__note">A game resumes at the start of a turn, so a turn that was
           interrupted is played again from the beginning.</p>
        <div class="ft-resume__actions">
          <button id="discardSaveBtn" class="ft-btn ft-btn--secondary">Discard</button>
          <button id="resumeGameBtn" class="ft-btn ft-btn--primary">Resume game</button>
        </div>
      </section>`;
}

export function renderSetupScreen(container, onStart, resume = null) {
  container.innerHTML = `
    <div class="ft-landing">${resumeCardHTML(resume)}
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
            <button id="rulesButton" class="ft-btn ft-btn--secondary">${icon('book', 16)} Rules</button>
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

  // DISCARD TAKES TWO TAPS, IN PLACE. A mis-tap next to Resume would destroy a
  // game in progress with no undo, and the alternative - a confirm dialog on the
  // landing screen - is the popup the model forbids. One line of state, no new
  // component, and the label reverts after a few seconds.
  const resumeBtn = document.getElementById('resumeGameBtn');
  const discardBtn = document.getElementById('discardSaveBtn');
  if (resumeBtn && resume) resumeBtn.addEventListener('click', () => resume.onResume());
  if (discardBtn && resume) {
    let armed = false;
    let revert = null;
    discardBtn.addEventListener('click', () => {
      if (!armed) {
        armed = true;
        discardBtn.textContent = 'Tap again to discard';
        revert = window.setTimeout(() => {
          armed = false;
          discardBtn.textContent = 'Discard';
        }, 4000);
        return;
      }
      window.clearTimeout(revert);
      resume.onDiscard();
    });
  }
}

// THE SEAT MARKER: THE ICON ALONE, AT 12, WITH THE WORD DELETED (stage 2, plan
// section 8.7). It was an emoji pair, then ticket 00's "(Human)" / "(Bot)".
//
// THIS IS THE LINE THAT REFUNDS PAGE HEIGHT rather than costing it. An opponent
// seat's header column is 96px, so any word after "Player n" wraps to a second
// line at 24px a time; a 12px icon fits on the first line. Measured at -72px at
// 360, -48 at 390, -48 at 430 and -24 at 768 - before anything else in the phone
// band is spent.
//
// IT DOES NOT BREACH "no icon may be the only carrier of meaning". The engine
// builds every player's name as "Player 2 (AI Hard)" and prints that full name
// in the turn heading every single turn, in the "is thinking" line while a bot
// moves, stamped on any tasting menu a bot has taken, and in the end screen
// table. The seat header is the FOURTH place the same fact appears. The <svg>
// also carries a hover title and a visually hidden word for assistive tech.
//
// BOTH SEATS ARE MARKED, not just the bots: absence of a mark is not a mark, and
// a hotseat game with two humans and two bots has to tell four seats apart at a
// glance. A tint or a border on bot seats was refused - that is colour carrying
// meaning alone, and it would collide with .ft-panel--active, which is the one
// seat treatment already in use and already means something else.
function seatMarker(player) {
  const isBot = !player?.isHuman;
  const word = isBot ? 'Bot' : 'Human';
  return `<span class="ft-seat__marker" title="${word}">`
    + icon(isBot ? 'bot' : 'person', 12)
    + `<span class="ft-sr-only">${word}</span></span>`;
}

// ONE seat, rendered from its index. The four seats were four copy-pasted
// blocks of near-identical markup until 4 August, and every dimension in them -
// the grid position, the row direction, the column widths - was an INLINE STYLE.
//
// That is why this function exists, and it is a precondition for the whole
// responsive plan rather than a tidy-up: inline styles beat media queries, so
// while the grid positions lived in the markup NO breakpoint could reflow the
// seats. Everything positional is a class now, and the stylesheet decides where
// a seat goes at a given width.
//
// The seats differ in only four ways, all of them handled here:
//   - seat 1 is the viewing player's, so it is always shown, carries the swept
//     tiles row and the phase controls, and its header is "Your Board";
//   - seats 2-4 are opponents: display-only, gated on the player count, and
//     tagged .ft-seat--opp, which is the hook sections 5 and 6 of the plan both
//     hang off (shrunken tiles, hidden symbols, the single-column strip);
//   - an unoccupied seat is .ft-seat--absent rather than an inline display:none.
//     Since 10 August renderGameScreen does not ASK for one - the strip filters
//     the opponents by player count - so this branch is a guard rather than a
//     path anything takes. It stays because a seat that renders itself as
//     present when it has no player behind it is a worse failure than a class
//     nobody sets;
//   - the panel tint stays keyed to the seat number, not the player.
function seatHTML(playerIdx, gameState) {
  const n = playerIdx + 1;
  const isOwnSeat = playerIdx === 0;
  const present = playerIdx < gameState.players.length;
  const player = gameState.players[playerIdx];

  // updateGameDisplay rewrites seat 1's header text when player 1 is a bot (the
  // all-bot demo), so the id has to survive.
  const title = isOwnSeat
    ? `<h2 class="ft-panel__title" id="player1Header">Your Board</h2>`
    : `<h2 class="ft-panel__title">Player ${n} ${seatMarker(player)}</h2>`;

  // The "Swept Tiles" caption names a row of tiles that appears directly above
  // your own board during the one step where you are placing them, which is
  // self-evident. It costs a whole line of height, so at S it is hidden by
  // class rather than deleted outright.
  const sweptLabel = isOwnSeat
    ? `<div class="ft-seat__swept-label">Swept Tiles</div>`
    : '';

  const controls = isOwnSeat
    ? `<div id="phaseControls" class="ft-seat__controls"></div>`
    : '';

  const classes = [
    'ft-panel',
    `ft-panel--player${n}`,
    'ft-seat',
    `ft-seat--${n}`,
    isOwnSeat ? 'ft-seat--own' : 'ft-seat--opp',
    present ? '' : 'ft-seat--absent',
  ].filter(Boolean).join(' ');

  // THE SEAT RULE (plan section 8.9, carrier 1). 4px of the seat's own ink, the
  // full width of the board column, directly above the cloth, at every size and
  // on every seat. It costs ZERO width - it is a block that takes the width it
  // is given - which is the whole reason seat colour is a mark rather than a
  // wash: the opponent strip has no width to spend at all (see the note in the
  // M band about the strip's 2px of headroom).
  const seatRule = `<div class="ft-seat__rule" aria-hidden="true"></div>`;

  // THE CLOTH (plan section 8.6, "the board region and the cloth"). One element
  // per board area: the three-stop 163deg fall, the upper-left highlight, the
  // grain in its own background stack at full strength, one contact shadow.
  // The RECESS is .ft-board-grid itself, which already carries the 8px of
  // padding and the 1px border that --board-col-width is derived from, so
  // wrapping it moves no dimension the harness reads.
  // THE OPPONENT SHEET'S OWN CHROME (stage 7, plan section 4.5). A collapsed row
  // opens into a tall sheet, and stage 6's convention is that a sheet's chrome
  // sits INSIDE it rather than floating above it as a second fixed bar. So the
  // head is the panel's first child, emitted unconditionally and drawn only when
  // that seat is the one open - `.pm-sheet-head` is display:none at file scope
  // and this one is display:none again inside the collapsed strip.
  const oppSheetHead = isOwnSeat ? '' : `
        <div class="pm-sheet-head">
          <span class="pm-sheet-head__handle" aria-hidden="true"></span>
          <h2 class="pm-sheet-head__title">Player ${n} ${seatMarker(player)}</h2>
          <button class="pm-sheet-head__close" type="button" data-pm-opp-close>Close</button>
        </div>`;

  return `
      <div class="${classes}" id="playerPanel${n}">${oppSheetHead}
        <div id="playerScore${n}" class="ft-player-score ft-seat__score-col"></div>
        <div class="ft-seat__board-col">
          <div class="ft-panel__header ft-seat__header">
            <span class="ft-seat__dot" aria-hidden="true"></span>
            ${title}
          </div>
          ${sweptLabel}
          <div id="workingArea${n}" class="ft-working-area ft-hidden"></div>
          ${seatRule}
          <div class="ft-cloth">
            <div id="playerBoard${n}" class="ft-board-grid"></div>
          </div>
          ${controls}
        </div>
      </div>`;
}

// `spendHandlers` bundles the paid options - the extra tile with its toggle,
// plus the one-click 2-card deal and the plate removal - rather than growing
// this parameter list by more positional callbacks. (The paid reserve was one of
// them, with a toggle of its own, until it was deleted on 11 August.)
export function renderGameScreen(container, gameState, onMarketClick, onBonusTile, onPlacementSubmit, onClaimSubmit, onSkipClaim, onSkipMove, onMoveTile, onCupcakeClick, spendHandlers = {}) {

  container.innerHTML = `
    <div class="ft-game">
      ${summaryRailHTML()}
      <!-- The seats are emitted by seatHTML() and POSITIONED BY CLASS. The DOM
           order is seat 1, centre, then seats 3, 2, 4, which is the order the
           old markup used; where each one lands is .ft-seat--N's business, and
           at the narrow bands the CSS order property re-sequences them. -->
      ${seatHTML(0, gameState)}

      <!-- CENTRE TOP - Grid position: col 2, row 1.
           Reads top to bottom in the order a player needs it: WHOSE turn and
           which step, how close the game is to ending, then the board itself.
           The old "Tile Market" heading is gone - a 5x5 grid of tiles under a
           teapot gauge is not something anybody needed labelling, and the
           heading cost a whole row of height in a column that was overflowing
           the page. -->
      <div class="ft-panel ft-centre">
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
            <!-- THE LABEL IS HIDDEN BELOW 1149, where the button is a 44x44
                 icon target in a 48px turn bar (stage 6), so the accessible
                 name has to be stated rather than inferred from a span that is
                 not always rendered. The icon is never the name of anything. -->
            <!-- THE MUTE (plan section 13.6). 44px, at the RIGHT END OF THE TURN
                 BAR on a phone and beside How to Play on desktop, where there is
                 no dock. It cannot go on the rail: five 72px chips are exactly
                 360px at 360, and a scrolling rail is refused (decision 22).
                 The state is carried by SHAPE rather than by colour - two arcs
                 against a cross - and the accessible name says which way it
                 goes, because the icon is never the name of anything. -->
            <button id="soundToggle" class="ft-sound-btn" title="Sound"
                    aria-pressed="${soundEnabled() ? 'true' : 'false'}"
                    aria-label="${soundEnabled() ? 'Sound on' : 'Sound off'}">
              ${icon(soundEnabled() ? 'sound' : 'sound-off', 16)}
            </button>
            <button id="gameRulesButton" class="ft-btn-howto" title="How to play" aria-label="How to Play">
              ${icon('book', 16)}
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
          <!-- THE HEADING IS DELETED (plan section 8.5, the heading test): a 5x5
               grid of painted tiles under a teapot gauge is not a thing anybody
               needed labelling, and the words cost a row of height in the column
               that overflows. The tile count survives, because it is a number
               rather than a label. -->
          <div class="ft-section__head ft-section__head--metaonly">
            <span class="ft-section__meta"><strong id="marketDisplay">25</strong> tiles left</span>
          </div>
        <div class="ft-market-wrap">
          <!-- The two gutter tracks hold the sweep buttons, and used to be a
               FULL TILE each - 60px of height for a row of buttons that needs 26,
               and 60px of width for buttons that need 34. The tile tracks stay at
               --tile-size; only the gutters shrink, so the buttons still line up
               exactly with the rows and columns they sweep.

               THE CLOTH WRAPS THE WHOLE CONTAINER, buttons included, and it does
               it on a NEGATIVE MARGIN so the ring costs no layout at all - the
               grid tracks, and therefore the alignment of every sweep button
               with the line it sweeps, are exactly where they were. The ring
               bleeds outward into .ft-market-wrap's own padding. -->
          <div class="ft-cloth ft-cloth--market">
          <div id="marketContainer" style="display: grid; grid-template-columns: var(--market-gutter-w) repeat(${gameState.marketSize}, var(--tile-size)); grid-template-rows: var(--market-gutter-h) repeat(${gameState.marketSize}, var(--tile-size)); gap: 2px;">
            <div style="grid-column: 2 / span ${gameState.marketSize}; grid-row: 1; display: flex; gap: var(--tile-gap);" id="marketColButtons"></div>
            <div style="grid-column: 1; grid-row: 2 / span ${gameState.marketSize}; display: flex; flex-direction: column; gap: var(--tile-gap);" id="marketRowButtons"></div>
            <div id="market" class="ft-market-grid" style="grid-column: 2 / span ${gameState.marketSize}; grid-row: 2 / span ${gameState.marketSize}; display: grid; grid-template-columns: repeat(${gameState.marketSize}, var(--tile-size)); grid-template-rows: repeat(${gameState.marketSize}, var(--tile-size)); gap: 2px;"></div>
          </div>
          </div>
        </div>
        </section>

          <div class="ft-centre-meters">
            <!-- FULLEST BOARD, its own section. This is the game's clock and it
                 decides when the game ends, so it gets a heading, a bar and a
                 plain-language line saying what filling up means.
                 IT WAS "CARDS CLAIMED" UNTIL 6 AUGUST, reading total claims
                 against the table's shared plate pool. That pool is deleted, so
                 the meter was measuring a clock the game no longer has. The panel
                 keeps its id and its markup so the layout and the responsive bands
                 are untouched; only what it counts has changed. -->
            <section class="ft-section ft-section--claims" id="cardProgress">
              <!-- THE SHEET HEAD (stage 7). This panel is a bottom sheet below
                   1149, opened by the rail's Board fill chip, and stage 6's
                   convention is that a sheet's chrome sits inside it. Emitted
                   unconditionally and display:none above the band, so no render
                   path has to consult a media query. -->
              <div class="pm-sheet-head">
                <span class="pm-sheet-head__handle" aria-hidden="true"></span>
                <h2 class="pm-sheet-head__title">End of the game</h2>
                <button class="pm-sheet-head__close" type="button" data-pm-close>Close</button>
              </div>
              <!-- A FIGURE WITH A CAPTION, not a heading (plan section 8.5). The
                   heading test - cover it, and see whether a player can still name
                   what they are looking at - deletes "END OF GAME TRIGGER - FULL
                   BOARD" outright: the number, the bar and one sentence say all of
                   it, and the words were the two-line title that needed the
                   wrapping hack in the first place. That hack retires with them. -->
              <div class="ft-section__head ft-section__head--figure">
                <span class="ft-section__meta ft-section__meta--figure" id="cardProgressText">0/25</span>
              </div>
              <div class="ft-claim-meter__track">
                <div id="cardProgressBar" class="ft-claim-meter__bar"></div>
              </div>
              <p class="ft-section__note">Board filled. The game ends at 25.</p>
            </section>

            <!-- The fresh-pot affordance is PERSISTENT and sits beside the market
                 board, because that is where the trigger is printed on the
                 physical component. It is never removed and never hidden: a
                 player must be able to see, at any moment, how close the board is
                 to a refresh. updateTeaOption rewrites its contents every render
                 and supplies its own section heading. -->
            <div id="teaOption" class="ft-tea-option"></div>

            <!-- THESE TWO PANELS ARE IN THE ORDER A TILE TRAVELS (swapped 7 August).
                 The Flavour reads your PLAYER BOARD, which is where a swept tile
                 lands; a Tasting Menu reads your CAKE STAND, which is only ever
                 reached later, by a claim. So the rail now runs market -> Flavour ->
                 Menus -> your own board and stand, which is the order in which a
                 tile is obtained and then used. It was the other way round for a
                 day, on the weaker reasoning that the older module should sit
                 higher.
                 They are also OPPOSITES and have to be told apart: a menu is a race
                 one player wins outright and takes off the table; the Flavour is
                 scored by everybody at the end. Adjacency helps with that only
                 because each panel says plainly where its tiles have to be.

                 THE FLAVOUR OF THE DAY (6 August). The smallest panel on the rail,
                 and it holds no state at all: the ingredient is revealed at setup
                 and never changes, so nothing here is ever redrawn with different
                 content. The live half of the module - each player's count and who
                 leads - is on the score panels, next to the boards being counted.
                 updateFlavourOfTheDay fills it. -->
            <div id="flavourPanel" class="ft-flavour"></div>

            <!-- THE TASTING MENUS (5 August), REPLACING the Freshness panel in
                 the same slot rather than sitting beside it.
                 The two modules it replaced were docked here BECAUSE of the tea
                 gauge above - the pot was what reset them, so "how soon is the
                 next pot" and "what is still going" were one question. That reason
                 is gone: a pot of tea does nothing to a Tasting Menu. What keeps
                 the panel in this rail is the tile market above it, where the
                 ingredients a menu wants are found, and the player's own cake stand
                 below, which is the only thing a menu reads.
                 THIS PANEL IS A DIFFERENT SHAPE from the one it replaces - two to
                 four cards rather than five small tokens - so THE RESPONSIVE BANDS
                 NEED RE-MEASURING now that it has landed. See the responsive
                 plan's measurement harness.
                 updateTastingMenus supplies all of its contents. -->
            <div id="tastingMenuPanel" class="ft-menus"></div>
          </div>
        </div>

          <!-- BAND 3: the card row, FULL WIDTH of the centre panel.
               This band used to be a .ft-centre-split - a 260px Pantry Goals
               column on the left and the cards on the right - on the reasoning
               that the two scoring tracks (ingredients vs colour patterns) shared
               no vocabulary and could be read side by side. The pantry goals are
               deleted from the game (4 August), so there is nothing to sit beside
               and the split wrapper is gone with them. The cards get the whole
               width of the centre panel, and since A5 they no longer have to be
               sized against it by hand - the row wraps to whatever fits and a
               card is --card-height tall.

               The card row is variable-length (28 July rework, capped 30 July),
               so it gets its own framed strip: a header stating how many cards are
               on offer, an in-page notice line (used for the one-claim-per-turn
               rejection instead of an alert), and the card area itself, which
               grows in height rather than shrinking the cards. -->
          <section class="ft-section ft-section--cards">
            <!-- Sentence case, Fraunces 15, and it is DELETED below the L band
                 (plan section 8.5). Nothing is renamed: Dean's terms stand, and
                 only the case changes. -->
            <div class="ft-section__head">
              <span class="ft-section__title">Patisserie goals</span>
              <span class="ft-section__meta" id="cardRowCount">3 cards</span>
            </div>
            <p class="ft-section__note">Make these patterns in your player area. VP shown on each card.</p>
            <div id="cardRowNotice" class="ft-card-row__notice ft-hidden"></div>
            <!-- THE SCROLLER'S OWN EDGES (10 August). Below 1150 the row stops
                 wrapping and scrolls sideways instead - "scroll, do not shrink",
                 because the card art carries the pattern and must not be made
                 smaller. What that band never had was a way of SAYING SO. An
                 overflow scrollbar is a hairline that most desktop browsers hide
                 until you touch the strip and that iOS hides always, so three
                 cards on a 390px screen read as a complete row of three, and the
                 row's length is strategic information (it is the running cost of
                 nobody ordering a fresh pot).
                 This wrapper is the frame the cue hangs on, because the cue
                 cannot hang on the scroller itself: anything absolutely
                 positioned inside an overflow container either scrolls away with
                 the content or extends the scrollable area. It is inert until
                 syncCardScrollCue sets data-scroll-prev / data-scroll-next on it,
                 which it only ever does when the row genuinely overflows - so at
                 XL and L, where the row wraps and everything is on screen, this
                 is one div and nothing else. -->
            <div class="ft-card-scroll" id="cardScroll">
              <div id="cardMarket" class="ft-card-grid"></div>
              <button type="button" class="ft-card-scroll__nudge ft-card-scroll__nudge--prev" data-card-scroll="-1" aria-label="Show the cards to the left">${icon('arrow-left', 16)}</button>
              <button type="button" class="ft-card-scroll__nudge ft-card-scroll__nudge--next" data-card-scroll="1" aria-label="Show the cards to the right">${icon('arrow-right', 16)}</button>
            </div>
          </section>
      </div>

      <!-- THE OPPONENT STRIP. A wrapper that does nothing at all until the M
           band: it is display:contents, so its three seats are promoted straight
           back out to be grid items of .ft-game and take the positions
           .ft-seat--2/3/4 give them. XL and L are byte-identical with or without
           it.

           It exists because from M downwards the opponents stop being columns of
           the table and become a single row of small cards beneath everything
           else, and the order property cannot gather three siblings into a row
           when each is independently placed in the parent grid. A box that can
           BECOME a flex row is the cheapest way to have both, and it needs no
           re-render at the breakpoint - see plan sections 5.3 and 6.5.

           NOTE: no backticks in this comment. It sits inside a template literal,
           and a stray one closes the string - which is exactly how it broke the
           first time.

           DOM order stays 3, 2, 4, which is what the XL markup used.

           AN EMPTY SEAT IS NOT EMITTED AT ALL (10 August). It used to be: every
           game rendered four seats and the unoccupied ones carried
           .ft-seat--absent, which is display:none at file scope. That held for
           four bands and then failed in the fifth - the phone band's collapsed
           opponent row sets display:flex on .ft-seat--opp at a higher
           specificity, so in a two-player game on a phone Players 3 and 4 came
           back as two empty 44px rows, each one a tap target that opened a sheet
           about a player who is not in the game.
           A seat nothing ever writes to has no reason to be in the document, and
           leaving it there means every future rule that touches a seat has to
           remember it. The class survives as the belt to this braces - see
           .ft-seat--absent, which the phone band no longer overrides. -->
      <div class="ft-opp-strip">
        ${[2, 1, 3].filter(i => i < gameState.players.length).map(i => seatHTML(i, gameState)).join('')}
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
    onDealCards: spendHandlers.onDealCards,
    onExtraTile: spendHandlers.onExtraTile,
    onExtraTilePlace: spendHandlers.onExtraTilePlace,
    onExtraTileToggle: spendHandlers.onExtraTileToggle,
    onRemovePlate: spendHandlers.onRemovePlate,
    gameState,
    selectedPlacements: [],
    placementMap: {},
    removableTiles: [],
    claimingCardId: null,
    removedBoardIndex: null,
    destinationChoices: null,
    dragSetupDone: false,
    tapSetupDone: false,
    // The tap path's two pieces of selection state (plan B1). Null means nothing
    // is armed; both are cleared whenever the gesture they belong to completes.
    selectedTileIndex: null,
    cupcakeSource: null,
    cupcakeMode: false,
    // Spend-step "buy an extra tile" mode: the next market click lifts a tile
    // rather than declaring a sweep. (The paid 2-card deal has no mode of its
    // own - its button deals the cards itself. A "reserve a card" mode sat here
    // too until 11 August.)
    extraTileMode: false,
    // THE BOUGHT-BUT-NOT-YET-PLACED TILE (10 August). The extra tile is a spend-
    // step action now, so there is no pending pile for it to join and no
    // placement step to follow: the purchase is "this market tile, into that
    // cell" and it is not committed until both are named. This holds the market
    // index between the two taps. Null means nothing is in hand.
    extraTilePending: null,
    lastPlayerIndex: -1,
  };

  const gameRulesButton = document.getElementById('gameRulesButton');
  if (gameRulesButton) {
    gameRulesButton.addEventListener('click', showRulesModal);
  }

  bindSoundToggle();
  bindSummaryRail();
  bindOpponentStrip();
  setupDragAndDrop(gameState);
  setupTapToPlace(gameState);
}

// THE MUTE, bound once per game on an element renderGameScreen emits once and
// never rewrites. The preference lives in localStorage['ft-sound'] and is NEVER
// in the save blob: it is a preference rather than game state, so it is not
// discarded with a save and it survives a version bump. The tap is itself a
// gesture, which is what builds the audio graph if the player has just unmuted.
function bindSoundToggle() {
  const btn = document.getElementById('soundToggle');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const on = !soundEnabled();
    setSoundEnabled(on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.setAttribute('aria-label', on ? 'Sound on' : 'Sound off');
    btn.innerHTML = icon(on ? 'sound' : 'sound-off', 16);
  });
}

// WHY THE GAME ENDED, in one sentence, for the end screen. New on 4 August: the
// UI never named the reason before, which was survivable while an ending was
// instant and obvious ("the plates ran out, we stopped"). It is not survivable
// now that the trigger and the stop are separated by up to a full round - a
// player who watched three more turns go by after the last plate was placed
// deserves to be told which condition actually closed the game.
//
// Every clause therefore states the TRIGGER, and the shared line underneath
// states the rule that turned it into a stop. Reasons are the engine's own
// endGameReason strings; an unknown value falls through to the generic line
// rather than inventing a story about it.
//
// FIVE REASONS BECAME TWO ON 6 AUGUST. 'cardMarket' (the empty-plate pool is
// spent), 'bagEmpty' (a pot of tea due against an empty bag) and 'boardOverflow'
// (a sweep bigger than the board) are all deleted from the rules, so their copy
// goes with them rather than sitting here waiting for a value that can never
// arrive.
function endGameReasonText(gameState) {
  const reasons = {
    boardFull: 'A player filled their board completely.',
    marketTiles: 'The last tile left the market and the bag was empty.',
  };
  const reason = reasons[gameState.endGameReason];
  if (!reason) return '';
  return `${reason} Play then continued until everyone had taken the same number of turns.`;
}

export function renderEndScreen(container, gameState, onPlayAgain, onBackToSetup, gameStats, endOpts = {}) {
  const playerResults = gameState.players.map(player => {
    const breakdown = getScoreBreakdown(player, gameState);
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
          ${isTastingMenuInPlay(gameState) ? `<div style="font-size: 12px; color: var(--color-text-secondary); margin-top: var(--spacing-xs);">Tasting Menus taken: ${gameState.players.map(p => `${p.name} ${p.tastingMenus.length}`).join(', ')} - ${getAvailableMenus(gameState).length} of ${gameState.tastingMenus.length} went unclaimed.</div>` : ''}
          ${isFlavourInPlay(gameState) ? `<div style="font-size: 12px; color: var(--color-text-secondary); margin-top: var(--spacing-xs);">Flavour of the Day was ${ingredientLabel(gameState.flavourOfTheDay)}: ${gameState.players.map(p => `${p.name} ${getFlavourCount(gameState, p)}`).join(', ')} on their boards${(() => {
            // A SHARED MAJORITY IS NAMED AS SHARED. Ties are friendly and happen in
            // 11-18% of games, so this sentence gets said often enough that fudging
            // it into one name would teach the wrong rule.
            const leaderNames = getFlavourLeaders(gameState).map(id => gameState.players.find(p => p.id === id).name);
            if (leaderNames.length === 0) return ' - nobody held any, so the majority went unpaid';
            if (leaderNames.length === 1) return ` - ${leaderNames[0]} took the ${FLAVOUR_MAJORITY_VP} VP majority`;
            return ` - ${leaderNames.join(' & ')} tied for the most and each took the full ${FLAVOUR_MAJORITY_VP} VP`;
          })()}.</div>` : ''}
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
                <!-- The <th>Objectives</th> column was deleted with the pantry
                     goals on the morning of 4 August; the flavour module has held
                     the fourth scoring column ever since. It is rendered
                     unconditionally - a game played with the module switched off
                     (setTastingMenusEnabled) simply shows a column of zeroes, which
                     is a truer end screen than one whose shape changes. -->
                <th title="Tasting Menus - the first player whose cake stand shows the named ingredients takes the card, and nobody else can">Menus</th>
                <!-- The FLAVOUR OF THE DAY (6 August) is the game's FIFTH scoring
                     column and the first one not fed by the claim step. Like the
                     Menus column it is rendered unconditionally, so a game with the
                     module switched off shows zeroes rather than a different table. -->
                <th title="Flavour of the Day - 1 VP for every tile of the revealed ingredient on your PLAYER BOARD, and 3 more to the player or players with the most. The cake stand and crumb tray do not count.">Flavour</th>
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
        <td>${bd.menus}</td>
        <td title="${bd.flavourTiles} tile${bd.flavourTiles === 1 ? '' : 's'} on the board${bd.flavourLeading ? `, plus ${FLAVOUR_MAJORITY_VP} for the most` : ''}">${bd.flavour}</td>
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
          ${endOpts.resumed ? `<p class="ft-end-screen__stats-note">Turns Played covers the whole game.
             The other figures cover play since this game was resumed.</p>` : ''}
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
    element.textContent = `${playerName} is thinking…`;
    if (containerElement) containerElement.style.display = 'block';
  } else {
    if (containerElement) containerElement.style.display = 'none';
    setSeatThinkingHairline(null);
    updateGameDisplay(window._gameUI?.gameState);
  }
}

// AN OPPONENT'S TURN, ON THEIR OWN ROW (stage 7, plan section 4.6). Three
// carriers and all three cost ZERO layout width: the active ring is an `outline`,
// which sits outside the box model; the seat rule goes 4px to 6px and is a fill
// inside the row's own padding; and this, the thinking hairline, is absolutely
// positioned along the row's bottom edge in the seat's ink.
//
// It is the ENGINE'S OWN determinate progress rather than a decoration, which is
// why prefers-reduced-motion keeps it: it is a progress bar reporting a fact.
// Driven from setThinkingProgress, the same choke point that drives the turn
// bar's, so the two can never disagree.
//
// The chip does not say "thinking" in words - the turn bar names the player 48px
// above the rail - and there is no auto-scroll to the active seat, because that
// would move the canvas under a player reading their own board.
function setSeatThinkingHairline(percent) {
  const gs = window._gameUI?.gameState;
  document.querySelectorAll('.ft-opp-strip .ft-seat--opp').forEach(panel => {
    const m = (panel.id || '').match(/playerPanel(\d+)/);
    const idx = m ? Number(m[1]) - 1 : -1;
    const active = percent !== null && gs && gs.currentPlayerIndex === idx;
    let bar = panel.querySelector('.pm-seat-row__think');
    if (!active) { if (bar) bar.remove(); return; }
    if (!bar) {
      bar = document.createElement('span');
      bar.className = 'pm-seat-row__think';
      panel.appendChild(bar);
    }
    bar.style.transform = `scaleX(${Math.max(0.02, Math.min(1, percent / 100))})`;
  });
}

export function setThinkingProgress(playerName, progress) {
  const textElement = document.getElementById('currentPlayer');
  const containerElement = document.getElementById('thinkingProgressContainer');
  const progressBar = document.getElementById('thinkingProgressBar');

  if (!textElement || !containerElement || !progressBar) return;

  if (progress !== null && progress !== undefined && progress > 0) {
    textElement.textContent = `${playerName} is thinking… (${progress}%)`;
    containerElement.style.display = 'block';
    progressBar.style.width = `${progress}%`;
    setSeatThinkingHairline(progress);
  } else {
    textElement.textContent = `${playerName} is thinking…`;
    containerElement.style.display = 'block';
    progressBar.style.width = '0%';
    setSeatThinkingHairline(0);
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
    ui.extraTilePending = null;
    ui.selectedTileIndex = null;
    ui.cupcakeSource = null;
    ui.lastPlayerIndex = gameState.currentPlayerIndex;
  }
  // A spend mode can only be live in the phase that offers it, so drop it as soon
  // as the phase moves on rather than leaving a stale armed click behind.
  if (!canBuyExtraTile(gameState)) {
    ui.extraTileMode = false;
    // A tile in hand with no legal purchase left cannot be placed either - the
    // engine would refuse it - so the hand is emptied with the mode.
    ui.extraTilePending = null;
  }
  // The same rule for the tap path's selections. A tile index only means anything
  // during `place`, and an armed cupcake source only during cupcake mode.
  if (gameState.gamePhase !== 'place') ui.selectedTileIndex = null;
  if (!ui.cupcakeMode) ui.cupcakeSource = null;

  const currentPlayer = gameState.players[gameState.currentPlayerIndex];
  document.getElementById('currentPlayer').textContent = `${currentPlayer.name}'s Turn (${gameState.gamePhase})`;

  // Update Player 1 header based on human/AI status
  const player1Header = document.getElementById('player1Header');
  if (player1Header) {
    const player1 = gameState.players[0];
    // innerHTML rather than textContent: seat 1's bot form carries the same 12px
    // marker every other seat does (the all-bot demo has to read as four bots,
    // not as three bots and an unmarked one). "Your Board" needs no marker - it
    // is already the word.
    player1Header.innerHTML = player1.isHuman
      ? 'Your Board'
      : `Player 1 ${seatMarker(player1)}`;
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
  updateTastingMenus(gameState);
  updateFlavourOfTheDay(gameState);
  updateCardMarket(gameState);
  // renderObjectives(gameState, currentPlayer) was called here. Deleted 4 August
  // with the pantry goals - there is no objectives panel to redraw.
  updatePlayerBoards(gameState);
  updateStats(gameState);
  updateGameInfo(gameState);
  updatePhaseControls(gameState);
  // AFTER the four reading panels and updateStats, because three of the five
  // chips read the panel the chip opens rather than recomputing it.
  updateSummaryRail(gameState);
  // LAST, because it reads the phase bar it may have just added a button to and
  // the destination choices updateStats has just rendered targets for.
  applyPhoneSheets(gameState);
  // AFTER applyPhoneSheets, because a sheet that has just opened or closed is
  // part of what is standing over the market.
  keepMarketInView(gameState);

  // ---- STAGE 8: the three things a render owes the motion vocabulary --------
  // None of them STARTS a movement. capRings only decides which element carries
  // a breath that is already drawn; watchOpponent diffs the position and flies
  // CLONES, which cost no names and cannot truncate anything; paintLine re-asserts
  // the one-line log into a phase bar this render has just rebuilt underneath it.
  capRings();
  watchOpponent(gameState);
  paintLine();
}

function updateMarket(gameState) {
  const market = document.getElementById('market');
  if (!market) return;

  // THE SWEEP DIALOG AND ITS ROW RING COME DOWN ON EVERY MARKET RE-RENDER, and
  // this is the only place that can do it. The ring is appended to
  // #marketContainer while a re-render replaces #market's innerHTML, so it would
  // otherwise outlive the row it is drawn around; and the dialog is a question
  // about a line of tiles that has just been redealt. Both are removed together
  // because they are one object with two parts.
  closeSweepOptions();

  // Cells carrying a printed teapot symbol - one set for all player counts. The
  // symbol shows through only while the cell is EMPTY (uncovered) - it is what the
  // tea player collects into the cupcake pot. It is a printed-on-board marker, so
  // it renders dimmed/small under where a tile would sit.
  const symbolCells = new Set(TEAPOT_SYMBOL_CELLS);

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
  const visibleSymbols = getVisibleTeapotSymbols(gameState);
  const gateArmed = visibleSymbols >= REFRESH_THRESHOLD;
  const bagDead = gameState.bag.length === 0;
  const symbolCount = `Teapot symbol showing (${visibleSymbols} of ${TEAPOT_SYMBOL_CELLS.length})`;
  const symbolTitle = gateArmed
    ? (bagDead
      ? `${symbolCount} - a fresh pot is due and the bag is empty, so this ENDS the game at the end of this turn`
      : `${symbolCount} - a fresh pot of tea is ordered at the end of this turn, worth ${TEA_POT_REWARD} cupcake${TEA_POT_REWARD === 1 ? '' : 's'} to the player taking it`)
    : `${symbolCount} - ${REFRESH_THRESHOLD} showing at the end of a turn orders a fresh pot`;

  // Two ways a single market tile becomes clickable: the free line-clear bonus
  // tile, and the PAID extra tile, which is armed by the player from the cupcake
  // panel. They look and behave the same because they are the same operation -
  // lift one tile onto the pile about to be placed. (The paid half was deleted on
  // 8 August and restored on 9 August, along with the arming state and the
  // .ft-tile--buyable class.)
  const ui = window._gameUI;
  const buyingTile = ui && ui.extraTileMode && canBuyExtraTile(gameState);
  // The tile the player has LIFTED and not yet put down. It stays in the market
  // until the purchase completes - nothing is paid for until a cell is named -
  // so it has to be marked, or "choose where this tile goes" names a tile the
  // player cannot see.
  const heldTile = ui && ui.extraTilePending !== null && ui.extraTilePending !== undefined
    ? ui.extraTilePending : null;

  market.innerHTML = gameState.market.map((tile, idx) => {
    const isEmpty = !tile;
    const isBonusAvailable = tile && gameState.bonusTileAvailable;
    const isBuyable = tile && buyingTile;
    const isHeld = tile && heldTile === idx;
    let tileClass = isEmpty ? 'ft-tile ft-tile--empty' : 'ft-tile ft-tile--placed';
    if (isBuyable) tileClass += ' ft-tile--buyable';
    if (isHeld) tileClass += ' ft-tile--held';
    // A market tile is only ever clickable in two situations: the free
    // line-clear bonus tile, and the paid extra tile. Everywhere else you sweep
    // a whole LINE with the row/column buttons and an individual tile does
    // nothing. The class carries that fact into CSS so the hover lift is limited
    // to tiles that will actually respond - see .ft-tile--pickable.
    if (isBonusAvailable || isBuyable) tileClass += ' ft-tile--pickable';
    const showTeapotSymbol = isEmpty && symbolCells.has(idx);
    // STAGE 4. .ft-tile--symbol and .ft-tile--symbol-armed are GONE, and they
    // were never seen: the empty market cell's inline `background-color: white`
    // beat both of them for the whole life of the build, so the five teapot
    // cells have always rendered plain white. Plan section 8.6 settles what they
    // become - "the five teapot symbol cells stay DENTS with the teapot printed
    // into them", a printed marker in a dent rather than an object standing in a
    // place setting - so an armed cell now says so with a ring on the printed
    // marker (.ft-market-teapot-symbol--armed) and nothing repaints the cell.
    //
    // An empty cell also carries NO COLOUR CLASS. ft-colour-none was the literal
    // white the cell used to be handed inline and it is not a colour; it retires
    // with the dent.
    if (tile) tileClass += ` ${getColourClass(tile.colour)}`;

    // NOTHING IS DIMMED, at any width, in any state (plan section 8, decision 3).
    // The `opacity: 0.3` an empty market cell carried is what the dent replaces:
    // a faded tile said "there was something here"; a dent says "this is a place
    // you may still use", which is the true statement.
    return `
      <div class="${tileClass} market-tile" data-index="${idx}" style="${(isBonusAvailable || isBuyable) ? 'cursor: pointer;' : ''}">
        ${tile ? `<img src="images/symbol-${tile.ingredient}-v3.png" class="ft-tile__icon" alt="${tile.ingredient}">` : ''}
        ${showTeapotSymbol ? `<img src="images/teapot.png" class="ft-market-teapot-symbol${gateArmed ? ' ft-market-teapot-symbol--armed' : ''}" alt="teapot symbol" title="${symbolTitle}">` : ''}
      </div>
    `;
  }).join('');

  const player = gameState.players[gameState.currentPlayerIndex];
  if (gameState.bonusTileAvailable && player.isHuman) {
    setupBonusUI(gameState);
  } else if (buyingTile && player.isHuman) {
    // Extra-tile mode: any occupied cell TAKES the tile into hand. It is not
    // bought yet - the purchase completes when a board cell is named, because
    // since 10 August the tile is placed as it is bought. See onExtraTile in
    // main.js and the extraTilePending branch of the board's tap router.
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
// The count comes from getVisibleTeapotSymbols, the same function the engine's
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

  const potSize = getVisibleTeapotSymbols(gameState);
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
  // One short of the trigger. This warning used to live in the SWEEP PHASE BAR,
  // and it moved here on 4 August (plan section 5.4) for the reason all four
  // coaching lines moved: a sentence about the teapot count belongs beside the
  // teapot count, not in the status stack at the bottom of your own board. The
  // phase bar keeps only the command.
  const oneAway = potSize === REFRESH_THRESHOLD - 1;

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
    // 11 August: the pot no longer flushes the card row, so there is nothing
    // to save from it and nothing for the player to act on. What is left is the
    // fact - the market is about to be restocked, and the player on your left
    // gets to sweep it.
    note = 'Brewing at the end of this turn - the market fills up and the next player sweeps it.';
  } else if (refillDue) {
    // The trigger is armed and there is nothing left to pour. This is the END OF
    // THE GAME, so it takes the loud state rather than sitting greyed out: it is
    // the single most consequential thing the gauge ever has to say, and the old
    // "no more pots can be brewed" wording buried it as a footnote.
    state = 'ready';
    note = 'The bag is empty and a pot is due - this ENDS the game. Everyone finishes the round, then you score.';
  } else if (bagDead) {
    state = 'locked';
    // The one-away line takes precedence over the standing empty-bag notice: both
    // are about the same ending, and this one says how near it is.
    note = oneAway
      ? 'One teapot from the end of the game - the bag is empty, so the next pot cannot be poured'
      : shortMarket
        ? `The bag is empty, so the market was dealt short - ${tilesOnMarket} of ${marketCells} spaces. The next pot that comes due ends the game.`
        : 'The bag is empty. The next pot that comes due ends the game rather than refilling the market.';
  } else if (oneAway) {
    state = 'locked';
    note = 'One teapot from a fresh pot of tea';
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
    ${sheetHeadHTML('Fresh pot of tea')}
    <!-- THE TEAPOT RIDES IN THE HEAD, immediately before the count (7 August).
         It used to sit on its own line below the note, captioned "teapots visible",
         which was a whole row of panel to say what the figure beside it already
         said. The icon belongs next to the number it counts; the caption was the
         line that made it a separate thing. -->
    <div class="ft-section__head">
      <span class="ft-section__title">Fresh pot of tea</span>
      <span class="ft-section__meta ft-section__meta--figure">
        <img src="images/teapot.png" class="ft-tea-option__icon" alt="teapots visible">
        ${shown}/${REFRESH_THRESHOLD}
      </span>
    </div>
    <p class="ft-section__note">When ${REFRESH_THRESHOLD} teapots are visible, the tile market is reset and the cards refreshed.</p>
    ${note ? `<span class="ft-tea-option__note">${note}</span>` : ''}
  `;
}

// THE TASTING MENU (5 August).
//
// DRAWN IN HTML AND CSS, NOT AS PRINTED ART. The browser build wants live DOM so a
// menu can visibly go when somebody takes it and carry the name of whoever did.
//
// WHAT THIS PANEL HAS TO COMMUNICATE, in priority order, because it is a race and
// a race that cannot be seen is not a race:
//   1. WHAT each menu asks for - its ingredients and quantities, with no lookup;
//   2. whether it is STILL AVAILABLE;
//   3. WHO TOOK IT, if anybody. This is the part that makes it a race rather than
//      a puzzle, and it is the one thing the Freshness UI could not show, because
//      its tokens reset and the holder could not be reconstructed honestly.
// And one more, which is the decision the module exists to create:
//   4. any menu the ACTIVE player is ONE TILE SHORT of, called out. That is 44.3%
//      of players at game end, and surfacing it costs nothing because the engine
//      already computes the deficit (getMenuDeficit).
//
// A TAKEN MENU IS NOT DIMMED-AND-WAITING like a spent Freshness cup was. It is
// struck through and stamped with a name, because it is gone for good - the
// styling has to say "that one is decided", not "that one is resting".
// Would removing THIS tile and plating it complete a Tasting Menu for this player,
// and if so what is it worth? Returns 0 or TASTING_MENU_VP.
//
// TWO GATES, and the second is the one a reader skips. The obvious one is "does
// the stand meet a live menu once this ingredient is added". The other is that the
// tile must be able to REACH the stand at all: once a row has locked to an
// ingredient and filled, further tiles of it can only go to the crumb tray (see
// getLegalDestinations), and the crumb tray is invisible to menus. A badge on a
// tile that can only be crumbed would be a lie, and it would be shown to exactly
// the player who had committed to that flavour hardest.
function menuCompletionValue(gameState, player, tile) {
  if (!isTastingMenuInPlay(gameState) || !tile || !tile.ingredient) return 0;
  // The row-destination guard that stood here until 6 August is DELETED. It
  // existed because a crumbed tile could not complete a menu, so promising one to
  // a player whose only legal destination was the crumb tray would have been a
  // lie. The crumb tray counts now (MENU_COUNTS_CRUMB_TRAY), so every legal
  // destination can complete a menu and the guard would suppress a true hint.
  const counts = getMenuIngredients(player);
  counts[tile.ingredient] = (counts[tile.ingredient] || 0) + 1;
  for (const menu of getAvailableMenus(gameState)) {
    if (satisfiesMenu(counts, menu)) return TASTING_MENU_VP;
  }
  return 0;
}

function updateTastingMenus(gameState) {
  const el = document.getElementById('tastingMenuPanel');
  if (!el) return;

  // The module can be switched off wholesale (setTastingMenusEnabled), in which
  // case no menus are dealt and the panel is not a thing that exists.
  if (!isTastingMenuInPlay(gameState)) {
    el.className = 'ft-menus ft-hidden';
    el.innerHTML = '';
    return;
  }

  // WHOSE DECISION THE HIGHLIGHT IS FOR. The deficits shown are the CURRENT
  // player's, because they are the only person who can act on them right now.
  // Unlike the Freshness cups - which were worth the same to everybody at the same
  // instant - a menu's distance is personal, so the panel has to name whose
  // reading it is or it is simply wrong for three players out of four.
  const viewer = gameState.players[gameState.currentPlayerIndex];
  // How many are still on offer. It drives the panel's live/spent state and the
  // note; it is no longer PRINTED as an N/M figure - see the head below.
  const available = getAvailableMenus(gameState).length;
  let closest = Infinity;

  const cards = gameState.tastingMenus.map(menu => {
    const taken = menu.takenBy !== null;
    const holder = taken ? gameState.players.find(p => p.id === menu.takenBy) : null;
    const short = taken ? Infinity : getMenuDeficit(viewer, menu);
    if (short < closest) closest = short;

    // Ingredients in descending quantity, so the "2" always reads first - which is
    // how a player says the card out loud ("two lemon and a caramel").
    // The count is a CORNER BADGE rather than a digit sitting beside the symbol,
    // and it is drawn only for a 2. That is what pays for the bigger art: the chip
    // is exactly as wide as the symbol, which is what pays for art at 48px in a
    // 182px-wide box. See .ft-menu__symbol in style.css for the arithmetic.
    const needs = Object.entries(menu.need).sort((a, b) => b[1] - a[1]);
    const chips = needs.map(([ingredient, need]) => `
      <span class="ft-menu__need" title="${need} x ${ingredientLabel(ingredient)}">
        <img src="images/symbol-${ingredient}-v3.png" class="ft-menu__symbol" alt="${ingredient}">
        ${need > 1 ? `<span class="ft-menu__count">${need}</span>` : ''}
      </span>`).join('');

    const state = taken ? 'taken' : (short === 0 ? 'ready' : (short === 1 ? 'close' : 'open'));
    const title = taken
      ? `Taken${holder ? ` by ${holder.name}` : ''} - gone for the rest of the game`
      : short === 0
        ? `${viewer.name} qualifies for this now`
        : `${viewer.name} is ${short} tile${short === 1 ? '' : 's'} short of this - ${TASTING_MENU_VP} VP to whoever gets there first`;

    // ONLY a taken card carries a foot, and it carries a NAME. The deficit line
    // that used to sit here ("3 short") was removed 5 August: every menu wants
    // three tiles, so at the start of a game every card read "3 short" and the
    // panel looked like it was repeating itself. Distance is already said twice
    // over - by the border (green at one tile short, gold at qualified) and by
    // the hover title - and neither of those shouts a number at a player who has
    // not placed a tile yet.
    const foot = taken
      ? `<span class="ft-menu__holder">${holder ? holder.name : 'taken'}</span>`
      : '';

    return `
      <div class="ft-menu ft-menu--${state}" title="${title}">
        <div class="ft-menu__needs">${chips}</div>
        ${foot}
      </div>`;
  }).join('');

  // The note only speaks when it has something to say that the cards themselves
  // do not. "N of M still on offer" was exactly that kind of line - the N/M figure
  // in the head already says it, and the taken cards are struck through in front
  // of you - so the resting state is now SILENT and the note appears only for the
  // three readings that are genuinely news.
  const note = available === 0
    ? 'Every menu has gone. Nothing brings them back - a pot of tea does not touch them.'
    : closest === 0
      ? 'You qualify for a menu right now - it is yours the moment you plate onto your stand.'
      : closest === 1
        ? 'You are ONE TILE short of a menu. So might somebody else be.'
        : '';

  el.className = `ft-section ft-menus ft-menus--${available > 0 ? 'live' : 'spent'}`;
  el.innerHTML = `
    ${sheetHeadHTML('Tasting menus')}
    <!-- NO N/M FIGURE (dropped 7 August). Every other figure on this rail is a
         PROGRESSION - 5/25 cells filled, 2/4 teapots showing - and reads as "how
         far along are we". This one was a stock level, and the cards below already
         show it: a taken menu is struck through and stamped with the name of
         whoever took it, which says more than the count did and says it in the
         place a player is already looking. -->
    <!-- THE PRICE COMES OUT OF THE TITLE (stage 4). Plan section 8.5 deletes the
         words below the L band and keeps them at L and XL, and "${TASTING_MENU_VP} VP each" is not a
         heading - it is a per-decision number a player steers a sweep by. Moved
         into the meta slot, which survives at every band. -->
    <div class="ft-section__head">
      <span class="ft-section__title">Tasting menus</span>
      <span class="ft-section__meta ft-menus__vp">${TASTING_MENU_VP} VP each</span>
    </div>
    <div class="ft-menus__cards">${cards}</div>
    <!-- "ANYWHERE" IS THE WHOLE NOTE (7 August). The commonest misreading of this
         panel at the table is that a card's symbols have to be on ONE ROW of the
         stand, or in the order printed - neither is true, and a player who
         believes either will not go for a menu they already half hold.

         9 AUGUST, STAGE 1, DEFECT 16: the note now carries the two facts that
         were sitting in title attributes, WHERE A PHONE CANNOT REACH THEM -
         there is no hover on a touch device and a long press raises the context
         menu instead. This panel was the one rail panel that taught nothing:
         it rendered as three bare numbers while "5 VP to whoever gets there
         first" and the zones a menu reads were invisible to every phone player.

         MERGED INTO THE EXISTING LINE rather than added below it. The plan
         measured a separate foot line at 0px, but it measured it inside ticket
         07's rail, where a panel is position: fixed and out of the app's flow
         entirely. That rail is stage 7; today this panel is on the canvas and a
         second line would be real page height at every phone width. One line
         carries both facts and costs nothing.

         "not your board" is the trap worth the words: the menus read the cake
         stand and the crumb tray, which is the exact opposite of the flavour of
         the day sitting two panels along.

         EVERY WORD IS MEASURED, not judged, and the line below is the one that
         costs NOTHING. The note is display:none below 1150, so no phone or
         tablet width can see it either way. Above that it was probed against
         the line it replaces at 1150 / 1280 / 1399 / 1400 / 1700 / 1920 / 2180
         / 2400, on both the note's own height and the top of #cardMarket:
         45px / 45px / 45px / 30px / 30px / 30px / 30px / 30px and an identical
         card-row position at all eight. The obvious wordings do not: the
         natural "Anywhere on your cake stand or crumb tray, not your board.
         First to qualify keeps it." is a third line from 1400 to 2180 and
         pushes the whole card row down 15px, and a version that also repeats
         the VP figure takes the M band's page from 1618 to 1633.

         The VP figure is deliberately not repeated: the panel head two lines
         above already prints "5 VP each". -->
    <p class="ft-section__note">Stand or crumb tray, <strong>anywhere</strong> - not your board. First to qualify keeps it.</p>
    ${note ? `<span class="ft-menus__note">${note}</span>` : ''}
  `;
}

// THE FLAVOUR OF THE DAY (6 August).
//
// THE SMALLEST PANEL ON THE RAIL, and deliberately so. It says exactly two things:
//   1. WHICH INGREDIENT it is, as the symbol rather than as a word. It is public
//      from turn one and never changes, so this is the one panel on the rail that
//      is not tracking anything;
//   2. WHAT IT PAYS - both clauses, in the head, because a player who reads only
//      the per-tile one has missed the whole contest.
//
// WHAT IT USED TO CARRY AND NO LONGER DOES, trimmed 7 August: a row per player
// with their count and a leader chip, a three-line statement of the rule, and a
// note calling out an empty or shared lead. All three were REPEATS. Every player's
// count and their leader chip are on their own score panel, which is next to their
// board - which is where the tiles being counted are, and where a player looks to
// read their score anyway. The rule is in the rules modal and on the score panel's
// own tooltip. The panel was ten lines tall to say what two of them already said.
//
// SO WHERE IS THE CONTEST NOW? On the score panels, one per player, which is the
// honest place for it: the Flavour is a per-player count and this panel is a fact
// about the table. If the contest ever needs to be readable in ONE place, put it
// here - but put it here INSTEAD of on the score panels, not as well.
function updateFlavourOfTheDay(gameState) {
  const el = document.getElementById('flavourPanel');
  if (!el) return;

  // The module can be switched off wholesale (setFlavourEnabled), in which case
  // nothing was drawn and the panel is not a thing that exists.
  if (!isFlavourInPlay(gameState)) {
    el.className = 'ft-flavour ft-hidden';
    el.innerHTML = '';
    return;
  }

  const flavour = gameState.flavourOfTheDay;

  el.className = 'ft-section ft-flavour';
  el.innerHTML = `
    ${sheetHeadHTML('Flavour of the day')}
    <div class="ft-section__head">
      <!-- BOTH CLAUSES IN THE HEADING, and no figure beside it (7 August). The
           price was split across a title span and a "+3 most" figure, which read as
           a progression like the two gauges above and is not one - nothing here
           counts up. Said as one sentence it is also the whole rule of the module
           bar where the tiles have to be, which the card below says.
           The non-breaking spaces hold the NAME together so the wrap in the narrow
           rail falls between the name and its price rather than mid-name. -->
      <span class="ft-section__title">Flavour&nbsp;of&nbsp;the&nbsp;day: <span class="ft-flavour__vp">${FLAVOUR_VP_PER_TILE}VP&nbsp;per&nbsp;tile, +${FLAVOUR_MAJORITY_VP}&nbsp;for&nbsp;most</span></span>
    </div>
    <!-- SYMBOL LEFT, PLACE RIGHT (7 August). The card used to be the ingredient and
         nothing else, which answered "what" and left "where" to a tooltip nobody
         opens - and WHERE is the whole module. Every other scoring lane in the game
         is fed by the claim step and reads the cake stand; this one reads the
         PLAYER BOARD, and a player who assumes otherwise spends the game
         sacrificing tiles they thought they were banking.
         The negative half is not optional. "On your player board" alone is read as
         "somewhere in your player area" by anyone who has just learned that Tasting
         Menus read the stand; naming the stand and ruling it out is what stops it. -->
    <div class="ft-flavour__card" title="Today's flavour is ${ingredientLabel(flavour)}. Score ${FLAVOUR_VP_PER_TILE} VP for every ${ingredientLabel(flavour)} tile on your PLAYER BOARD at the end, and ${FLAVOUR_MAJORITY_VP} VP more for the most - ties are friendly. Your cake stand and crumb tray do not count. It was revealed at setup and does not change.">
      <img src="images/symbol-${flavour}-v3.png" class="ft-flavour__symbol" alt="${flavour}">
      <div class="ft-flavour__where">
        <span class="ft-flavour__label">${ingredientLabel(flavour)}</span>
        <span class="ft-flavour__place">tiles on your player board, <strong>not</strong> your cake stand</span>
      </div>
    </div>
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
      ${icon('arrow-down')}
      <span style="font-weight: 600;">${label}</span>
    </button>
  `).join('');

  // THE ARROW POINTS INTO THE MARKET, NOT AWAY FROM IT (10 August). These ten
  // buttons sit in the two gutters - the column buttons ALONG THE TOP and the row
  // buttons DOWN THE LEFT SIDE - and each arrow's job is to say which line of
  // tiles the button underneath your finger is about to gather. The column
  // buttons already do it: `arrow-down`, sitting above the grid, points down the
  // column it sweeps. The row buttons carried `arrow-left` while sitting to the
  // LEFT of the grid, so they pointed off the board at nothing, which reads as
  // "back" or "previous" rather than as this row. Right, from the left gutter, is
  // the same statement the column buttons make in the other axis.
  marketRowButtons.innerHTML = Array.from({ length: gameState.marketSize }, (_, row) => `
    <button class="ft-btn ft-btn--sweep market-row-btn${awaitingClass}" data-row="${row}" ${disabledAttr} style="width: var(--market-gutter-w); height: var(--tile-size); display: flex; align-items: center; justify-content: center; gap: 2px; flex-shrink: 0; padding: 0;">
      ${icon('arrow-right')}
      <span style="font-weight: 600;">${row + 1}</span>
    </button>
  `).join('');

  if (!enabled) return; // no listeners - the disabled buttons are inert visuals

  document.querySelectorAll('.market-row-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      showSweepOptions(gameState, parseInt(btn.dataset.row), true);
    });
  });

  document.querySelectorAll('.market-col-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      showSweepOptions(gameState, parseInt(btn.dataset.col), false);
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

// ---------------------------------------------------------------------------
// THE PHONE STEP MODEL - THE SHEETS (stage 6, plan section 3)
//
// ONE CANVAS BETWEEN TWO FIXED DOCKS, with standard bottom sheets in two sizes.
// Almost all of it is CSS, because of the one structural rule the whole model
// hangs on: NOTHING IS RE-PARENTED. A block leaves the canvas by going
// `position: fixed` where it already sits in the DOM, so every delegated
// listener board.js binds once - to #workingArea1, #playerBoard1 and
// #playerScore1 - keeps working untouched, and so does every innerHTML
// re-render path above them.
//
// What is left for JS is exactly three things:
//
//   1. ONE ATTRIBUTE, body[data-pm-sheet], which is the whole state machine.
//      Its value is the id of the open sheet, or absent. style.css turns that
//      into `visibility: visible` on the one panel it names. `visibility`, never
//      `display` or `transform`: display:none would drop the cake stand's
//      [data-dest-row] targets out of layout and break the claim's third step,
//      and a transform would make a fixed sheet the containing block for its own
//      fixed descendants - and #cupcakeSupply1 is a fixed descendant of
//      #playerScore1.
//   2. THE TWO RULES THAT KEEP THE MODEL COHERENT WHEN A STEP VANISHES:
//        (a) a sheet never opens by itself, unless the engine has entered a
//            state in which that sheet is the only legal action;
//        (b) a sheet is modal only under the same test.
//      Exactly one state passes: the claim's destination choice, where
//      ui.destinationChoices is set and nothing but a stand row or the crumb
//      tray is legal. So autoSkipEmptyClaim can fire with nothing on screen
//      opening, closing or moving - only the phase bar's own text changes.
//   3. Escape and swipe-down, the two ways out that are not a button.
//
// THE SHEET CHROME SITS INSIDE ITS SHEET, not above it as a separate fixed bar.
// The arithmetic is identical either way - the 56px comes out of the same
// budget - and it is what .ds-dialog already does, so the model has one shape
// rather than two and no chrome to re-position on every render.
//
// STAGE 7 OWNS THE RAIL. The top dock reserves its 48px slot here and the four
// reading panels (#cardProgress, #teaOption, #tastingMenuPanel, #flavourPanel)
// are already sheets, but nothing opens them until the rail's chips arrive.
// ---------------------------------------------------------------------------

const PHONE_BAND = '(max-width: 1149px)';
function isPhoneBand() {
  return window.matchMedia(PHONE_BAND).matches;
}

// THE SHEET'S OWN MOTION IS A VIEW TRANSITION, AND THE CONSTRAINT IS WHAT FORCES
// IT (plan section 7.7, item 1). With no scrim, the sheet's motion is the only
// thing that says a layer arrived - but the sheet is revealed by `visibility`
// precisely because a transform on a fixed sheet makes it the containing block
// for its own fixed descendants, and #cupcakeSupply1 inside #playerScore1 is one.
// A view transition NEVER TRANSFORMS THE REAL ELEMENT: it replaces it with a
// snapshot in the transition layer and moves that, so the constraint and the
// motion are compatible rather than in conflict. 220ms in, 160ms out, one name.
//
// EVERY SHEET RISES FROM THE BOTTOM EDGE and nothing else in the model moves
// vertically, so "up from the bottom" always means the same thing.
const SHEET_SELECTOR = {
  fill: '#cardProgress', tea: '#teaOption', menus: '#tastingMenuPanel',
  stand: '#playerScore1', flavour: '#flavourPanel', spend: '#cupcakeSupply1',
};
function sheetEl(id) {
  const sel = SHEET_SELECTOR[id];
  return sel ? document.querySelector(sel) : null;
}

// The one wrapper both ways round: opening has a NEW and no OLD, closing has an
// OLD and no NEW, and the runner claims the name either way.
function sheetMove(fromId, toId, mutate) {
  runTransition({
    kind: 'sheet',
    bar: false,
    travel: [{
      name: 'ft-sheet',
      old: () => (fromId ? sheetEl(fromId) : null),
      neu: () => (toId ? sheetEl(toId) : null),
    }],
    mutate,
  });
}

function openSheet(id) {
  document.body.setAttribute('data-pm-sheet', id);
  // THE SPEND SHEET IS THE ONE YOU ACT THROUGH, so the board is scrolled into
  // the space the sheet leaves above it. The cap guarantees the room - 272px of
  // canvas against a 246px board at every phone width - but it cannot guarantee
  // the SCROLL POSITION, and at rest the canvas opens on the market with the
  // board a screen further down. Measured without this, the sheet's first pixel
  // lands 97px inside the board at 360.
  //
  // #playerPanel1 rather than the grid: the panel is a child of .ft-game and
  // therefore carries the scroll-margin-top that clears the top dock.
  if (id === 'spend') {
    const seat = document.getElementById('playerPanel1');
    if (seat && seat.scrollIntoView) seat.scrollIntoView({ block: 'start', behavior: 'auto' });
  }
}

function closeSheetNow() {
  document.body.setAttribute('data-pm-sheet', '');
}

// ARMING A SPEND THAT REACHES OUTSIDE THE SHEET (10 August, Dean's report).
//
// The spend sheet is a HALF sheet so that the two board spends can be played
// through it - you arm "move a tile" and tap your own board in the space the cap
// leaves above (see the scroll in openSheet). That is the whole reason the cap is
// non-negotiable, and it is right for those two.
//
// THE EXTRA TILE ARMS SOMETHING THAT IS NOT YOUR BOARD - the tile market, which
// on a phone sits at the top of the canvas. That is not in the space the cap
// leaves, so the sheet was left standing over the very thing it had just asked
// the player to choose from. (The paid reserve armed the card row the same way
// and was the one Dean hit: measured at 390, four of five probes down the middle
// of the card row came back as sheet, so a player who tapped "Reserve a card"
// was looking at a two-millimetre sliver of the first card and nothing else. The
// reserve is deleted - 11 August - but the fix it forced is what the extra tile
// still uses.)
//
// So: close the sheet, then bring the target into view IF IT IS NOT ALREADY
// fully there. The test is deliberately "fully", not "at all" - a card row with
// its top eighth showing is exactly the state being fixed. `block: 'nearest'`
// then scrolls the least it can to finish the job, and the scroll margins on the
// target (style.css, beside .ft-game > *) keep it clear of the fixed docks.
// Instant, never smooth: this is not a movement to be read, it is the page
// arriving where the player has just been sent.
function revealSpendTarget(selector) {
  closeSheet();
  // THE SCROLL WAITS FOR THE RE-RENDER, and it has to. Every caller here closes
  // the sheet, arms the mode and re-renders, in that order and synchronously - so
  // a scroll measured before the arming reads geometry that is one paint out of
  // date, scrolls to where the target WAS, and the re-render then moves it. That
  // is not theory: measured at 390 the first version landed the card row under
  // the phase bar, having reported it clear a frame earlier. One frame later the
  // page is the page the player will actually see.
  requestAnimationFrame(() => revealIfHidden(selector));
}

// THE DOCK-AWARE VISIBILITY TEST, shared by the two things that have to put
// something in front of the player: the spend that arms a target outside its own
// sheet, and the sweep step, which asks for a row of a market the page may have
// been left scrolled away from. Factored out of revealSpendTarget on 10 August
// so there is ONE definition of "actually on screen" rather than two that can
// disagree about what the docks cover.
function revealIfHidden(selector) {
  const el = document.querySelector(selector);
  if (!el || !el.getBoundingClientRect) return;
  const r = el.getBoundingClientRect();
  // The fixed docks are part of the viewport as far as this is concerned: a
  // target under the phase bar is not visible, whatever its rect says.
  //
  // MEASURED OFF THE DOCKS THEMSELVES, not off --pm-dock-top. That property is
  // a calc() of two others, so getPropertyValue hands back the literal string
  // "calc(48px + 48px)" and parseFloat makes NaN of it - a silent zero, which
  // is exactly the bug this test exists to catch. The elements are there to be
  // measured, and above the touch band they simply are not fixed, so their
  // contribution is nought without a media query being consulted.
  const dockDepth = (sel, edge) => {
    const d = document.querySelector(sel);
    if (!d) return 0;
    if (getComputedStyle(d).position !== 'fixed') return 0;
    const dr = d.getBoundingClientRect();
    return edge === 'top' ? Math.max(0, dr.bottom) : Math.max(0, window.innerHeight - dr.top);
  };
  const top = Math.max(dockDepth('.ft-centre-head', 'top'), dockDepth('.pm-rail', 'top'));
  const bottom = dockDepth('.ft-seat__controls', 'bottom');
  const fullyVisible = r.top >= top && r.bottom <= window.innerHeight - bottom;
  if (!fullyVisible) el.scrollIntoView({ block: 'nearest', behavior: 'auto' });
}

// THE SWEEP STEP ASKS FOR A MARKET THAT MAY NOT BE ON SCREEN (10 August, Dean's
// iPhone report). The phase bar says "Sweep a row or column above" while the top
// dock stands over the market's gutter row and its first row of tiles - the two
// things the sentence is pointing at.
//
// The cause is that NOTHING RESETS THE SCROLL WHEN THE GAME SCREEN ARRIVES. The
// setup screen is taller than a phone, so reaching Start means scrolling to the
// bottom of it; the game then renders into that same offset and opens part-way
// down its own page. Measured at 430x932 with four players: the scroll survives
// as 313px and the market's top 272px sit under the dock on turn 0, which is the
// screenshot. mountGameScreen now scrolls to the top and that is the root fix.
//
// This is the guard that keeps it fixed for the rest of the game, because the
// scroll can drift afterwards too - openSheet('spend') deliberately scrolls to
// your seat, and a player who was reading the card row when their turn came
// round is parked below the market. It fires ONCE per entry into the human's
// sweep step, never mid-step, so it can never fight a scroll the player is
// making themselves, and it does nothing at all when the market is already
// wholly in view.
let lastSweepKey = null;
function keepMarketInView(gameState) {
  const human = gameState.currentPlayerIndex === 0 && gameState.players[0]?.isHuman;
  const key = human && gameState.gamePhase === 'sweep'
    ? `${gameState.stats?.turnsPlayed ?? 0}:${gameState.currentPlayerIndex}`
    : null;
  const entering = key !== null && key !== lastSweepKey;
  lastSweepKey = key;
  if (!entering || !isPhoneBand()) return;
  // One frame later, for the same reason revealSpendTarget waits: this runs at
  // the end of a render that has just rebuilt the market underneath it.
  requestAnimationFrame(() => revealIfHidden('.ft-market-wrap'));
}

// NOTHING IS EVER STARTED BY A RE-RENDER (plan section 7, the build rule).
// applyPhoneSheets runs at the end of every updateGameDisplay and opens or closes
// a sheet from the engine's own state, so it calls openSheet/closeSheetNow, which
// write the attribute and nothing else. The two functions below are the GESTURE
// paths - a chip, Close, Escape, a swipe - and those are the ones that move.
function closeSheet() {
  const open = document.body.getAttribute('data-pm-sheet');
  if (!open) { closeSheetNow(); return; }
  sheetMove(open, null, closeSheetNow);
}

function toggleSheet(id) {
  const open = document.body.getAttribute('data-pm-sheet');
  if (open === id) { closeSheet(); return; }
  sheetMove(open || null, id, () => openSheet(id));
}

// A vertical drag of more than 40px closes the sheet. Bound per sheet rather
// than delegated, because the sweep sheet is created and destroyed on every
// gutter tap and its listeners go with it.
function attachSheetSwipe(el, onClose) {
  let y0 = null;
  const down = e => { y0 = (e.touches ? e.touches[0] : e).clientY; };
  const up = e => {
    if (y0 === null) return;
    const y = (e.changedTouches ? e.changedTouches[0] : e).clientY;
    const travelled = y - y0;
    y0 = null;
    if (travelled > 40) onClose();
  };
  el.addEventListener('touchstart', down, { passive: true });
  el.addEventListener('touchend', up, { passive: true });
  el.addEventListener('mousedown', down);
  el.addEventListener('mouseup', up);
}

// STAGE 7 HAS SIX SHEET HEADS, NOT TWO, and four of them are inside panels that
// rewrite their own innerHTML on every render. Binding per head per render would
// re-attach four listener pairs 38 times a turn, so Close and swipe-down are
// delegated once here instead. The score panel keeps its own binding because it
// was already there and is bound once per render on an element that is replaced;
// this handler is idempotent with it, since closeSheet only clears an attribute.
document.addEventListener('click', e => {
  if (e.target.closest('[data-pm-close]')) closeSheet();
});
let sheetSwipeFrom = null;
const swipeStart = e => {
  const head = e.target.closest && e.target.closest('.pm-sheet-head');
  sheetSwipeFrom = head ? (e.touches ? e.touches[0] : e).clientY : null;
};
const swipeEnd = e => {
  if (sheetSwipeFrom === null) return;
  const y = (e.changedTouches ? e.changedTouches[0] : e).clientY;
  const travelled = y - sheetSwipeFrom;
  sheetSwipeFrom = null;
  if (travelled <= 40) return;
  if (document.body.getAttribute('data-pm-opp')) closeOppSheet();
  else closeSheet();
};
document.addEventListener('touchstart', swipeStart, { passive: true });
document.addEventListener('touchend', swipeEnd, { passive: true });

// Bound once, at module scope, so no render path has to remember it. Escape
// closes whichever sheet is open; the sweep sheet has its own Escape handler
// because it is a different object with a different close.
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && document.body.getAttribute('data-pm-sheet')) closeSheet();
});

// Called at the end of every updateGameDisplay. Everything here is derived from
// the engine's own state, so a resumed or rewound game needs no extra bookkeeping.
let lastSheetPhase = null;
function applyPhoneSheets(gameState) {
  const ui = window._gameUI;
  if (!ui) return;
  const phase = gameState.gamePhase;
  const human = gameState.currentPlayerIndex === 0 && gameState.players[0]?.isHuman;
  const open = document.body.getAttribute('data-pm-sheet') || '';

  if (!isPhoneBand()) {
    // Above the band every panel is on the canvas and no sheet exists. Clearing
    // the attribute rather than leaving it stale means a resize back down does
    // not re-open a sheet the player closed three widths ago. The opponent sheet
    // is stage 7's and goes the same way, for the same reason.
    if (open) closeSheetNow();
    if (document.body.getAttribute('data-pm-opp')) closeOppSheet();
    document.body.removeAttribute('data-pm-step');
    lastSheetPhase = phase;
    return;
  }

  // THE SWEEP STEP PINS THE MARKET (style.css, .ft-section--tiles in the third
  // phone block). One attribute, written from the engine's own state on every
  // render, exactly as data-pm-sheet is - so a resumed game needs no bookkeeping
  // and there is no second copy of "whose turn, which step" to keep in step.
  if (human && phase === 'sweep') document.body.setAttribute('data-pm-step', 'sweep');
  else document.body.removeAttribute('data-pm-step');

  // RULE (a)'s single exception, and the only auto-open in the model.
  const needsStand = human && phase === 'claim' && Array.isArray(ui.destinationChoices);
  if (needsStand && open !== 'stand') {
    openSheet('stand');
  } else if (!needsStand && open === 'stand' && lastSheetPhase === 'claim' && phase !== 'claim') {
    closeSheetNow();
  }

  // The spend sheet belongs to the step that offers it. When the step is skipped
  // the pair - button and sheet - simply never appears; nothing opens or closes.
  const spendable = human && (phase === 'spend' || canBuyExtraTile(gameState));
  if (open === 'spend' && !spendable) closeSheetNow();

  lastSheetPhase = phase;
}

// ---------------------------------------------------------------------------
// THE SUMMARY RAIL AND THE COLLAPSED OPPONENT STRIP (stage 7, plan section 4)
//
// Two things, and they answer each other. The rail is FIVE CHIPS in the top
// dock's reserved 48px slot; the strip is ONE FULL-WIDTH 44px ROW PER OPPONENT.
//
// THE RAIL IS ALSO THE HALF OF STAGE 6 THAT STAGE 6 COULD NOT BUILD. Stage 6
// took #cardProgress, #teaOption, #tastingMenuPanel and #flavourPanel off the
// canvas and made them sheets, which is most of the 1,520px it refunded - but
// the openers are these chips, so until they existed the end-of-game meter, the
// fresh-pot gauge, the tasting menus and the flavour of the day were not
// readable on a phone at all. A chip's id IS the sheet's id (stage 6's
// body[data-pm-sheet] is the whole state machine), which is what makes it
// impossible for a chip to be a second copy of a number: tapping Menus raises
// the tasting-menu panel itself.
//
// FIVE CHIPS, NOT SIX (decision 9). No bag-count chip - it answers the same
// question as board fill, and the rail cannot afford to say a thing twice. The
// You chip carries the score with cupcakes as a SUBORDINATE number (decision
// 33) rather than splitting into a sixth cell; the engine's worst case, a score
// of 95 with twelve cupcakes, fits 69 of the 72px a fifth of 360 gives.
//
// WHAT A CHANGE LOOKS LIKE - three grades, graded by CONSEQUENCE:
//   1. TICK        the number moved a step          a wash, about a second
//   2. THRESHOLD   what is legal has changed        A PERSISTENT 3px RAIL that
//                  or something has ended           stays until the chip is
//                                                   tapped (decision 32)
//   3. CATCH-UP    what the bots did while you      a delta badge for the first
//                  were not looking                 couple of seconds
//
// GRADE 2 CARRIES THE DESIGN CLAIM AND IT IS WHY THIS IS NOT A FLASH. A player
// looking at their own board cannot be assumed to have seen a transient, and
// news the player misses is the failure the rail exists to prevent. Tapping the
// chip both acknowledges the news and opens the sheet it came from, so the
// acknowledgement and the reading are one gesture. The lit state is held in
// module state rather than in the DOM, so it survives a full re-render and a
// bot turn.
//
// EVERY CARRIER IS A WASH, AN ABSOLUTELY POSITIONED MARK OR A COLOUR. Nothing
// may move a chip, change its width or reflow the dock - which is also why the
// two timed carriers are CSS ANIMATIONS rather than JS-driven opacity: an
// animation ends where it started, so the rail is a deterministic surface for
// the screenshot harness as well as a stable one for the player.
//
// THE STRIP IS WHERE THE 2px CLIFF STOPS EXISTING, and it stops existing rather
// than being avoided. A shipped seat is a `min-width: max-content` flex item in
// a WRAPPING row, so two pixels of extra chip width flips two seats per row to
// one and a whole seat row appears - measured at 220px of page height, with 13px
// of headroom left at 360. A COLLAPSED SEAT IS A FULL-WIDTH ROW: it is not sized
// by its content and there is no wrap decision to make, so the mechanism is gone.
// A session that reverts the strip to the shipped seat inherits the cliff again.
// ---------------------------------------------------------------------------

// Decision 9's five, in decision 9's order. `id` is stage 6's own sheet id.
const RAIL_CHIPS = [
  { id: 'fill',    label: 'Board fill', name: 'Board fill towards the end of the game' },
  { id: 'tea',     label: 'Teapots',    name: 'Teapots towards a fresh pot of tea' },
  { id: 'menus',   label: 'Menus',      name: 'Tasting menus still available' },
  { id: 'stand',   label: 'You',        name: 'Your score, your cupcakes and your cake stand' },
  { id: 'flavour', label: 'Flavour',    name: 'Flavour of the day, and how many you hold' },
];

function summaryRailHTML() {
  const chips = RAIL_CHIPS.map(c => `
        <button type="button" class="pm-chip" data-pm-chip="${c.id}"
                aria-expanded="false" aria-label="${c.name}">
          <span class="pm-chip__delta" aria-hidden="true"></span>
          <span class="pm-chip__line">
            <span class="pm-chip__mark" data-pm-mark></span>
            <span class="pm-chip__fig" data-pm-fig></span>
            <span class="pm-chip__fig2" data-pm-fig2 hidden></span>
          </span>
          <span class="pm-chip__label">${c.label}</span>
        </button>`).join('');
  // The live region rides INSIDE the rail, which is position: fixed, so a polite
  // announcement can never be page height. It carries threshold sentences only;
  // a screen reader that read every tick would be unusable.
  return `<div class="pm-rail" role="toolbar" aria-label="Game summary">${chips}
        <span class="pm-rail__live" role="status" aria-live="polite"></span>
      </div>`;
}

// The rail's memory, at module scope so it survives every re-render. `ord` is
// what a change is measured against; `lit` is the thresholds the player has not
// yet tapped through; `mark` is the ordinals as at the end of your last turn.
const railState = { ord: {}, lit: {}, said: {}, mark: {}, wasYours: null, first: true };

// ---------------------------------------------------------------------------
// THE TEN NUMBERS OF UI STATE THE SAVE CARRIES (stage 8, plan section 10)
//
// Five booleans and five integers, and they are the ONLY UI state in the blob,
// because a turn boundary leaves everything else at its default. They are saved
// rather than recomputed and the distinction matters: three of the five
// thresholds are standing conditions that could be re-evaluated from the state,
// but the flavour's is a TRANSITION and is not visible in a single state at all,
// and a rail the player already tapped would re-light, which turns an
// acknowledgement into a nag. ACKNOWLEDGEMENT IS NOT IN THE ENGINE STATE, so it
// has to be in the save. The ordinals are the PREVIOUS snapshot - the half that
// makes a delta, and the half that is not recomputable.
//
// Stage 7's Resolution reads these as session state that should stay out of the
// blob. The plan says the opposite, its reason is that a reload is the largest
// instance of looking away that exists, and the map's authority order puts the
// plan above a stage write-up. Recorded here rather than followed silently.
export function getRailSaveState() {
  const thresholds = {};
  const ordinals = {};
  for (const c of RAIL_CHIPS) {
    thresholds[c.id] = !!railState.lit[c.id];
    ordinals[c.id] = railState.ord[c.id] === undefined ? null : railState.ord[c.id];
  }
  return { thresholds, ordinals };
}

export function resetRailState() {
  railState.ord = {};
  railState.lit = {};
  railState.said = {};
  railState.mark = {};
  railState.wasYours = null;
  railState.first = true;
}

export function restoreRailSaveState(ui) {
  resetRailState();
  if (!ui) return;
  for (const c of RAIL_CHIPS) {
    railState.lit[c.id] = !!(ui.thresholds && ui.thresholds[c.id]);
    // `said` is set for every chip, acknowledged or not, so the first render
    // after a resume ANNOUNCES NOTHING: a threshold the player already tapped
    // must not re-light, and one they have not tapped is already lit and does not
    // need announcing a second time. The rail is painted in its static form.
    railState.said[c.id] = true;
    const ord = ui.ordinals ? ui.ordinals[c.id] : null;
    if (ord !== null && ord !== undefined) railState.mark[c.id] = ord;
  }
  // Not null: `false` is what makes the next render "arriving", so the catch-up
  // badges are diffed against the marks above rather than being thrown away.
  railState.wasYours = false;
}

// THE FIVE READINGS (plan section 4.7). Every reading has an ordinal and either
// has a threshold or does not - that is the whole of the shared content model,
// and it is what lets L and XL render the same five facts without a second
// definition.
//
// The numbers come from the ENGINE where the number is clean and from the
// PANEL'S OWN READOUT where the build already computes it, which is what stops a
// chip and the sheet it opens ever disagreeing.
function railReadings(gameState) {
  const me = gameState.players[0];
  const total = me.board.length;
  // THE FULLEST BOARD, NOT YOURS. The game ends when ANY board fills, so this is
  // a clock reading rather than a score. Same expression as updateGameInfo's.
  const fullest = Math.max(...gameState.players.map(
    p => total - p.board.filter(c => c === null).length,
  ));

  // Clamped to the trigger rather than printing 5/4, exactly as the gauge does.
  const potSize = getVisibleTeapotSymbols(gameState);
  const teaShown = Math.min(potSize, REFRESH_THRESHOLD);

  const menusInPlay = isTastingMenuInPlay(gameState);
  const menusLeft = menusInPlay ? getAvailableMenus(gameState).length : null;

  const flavourInPlay = isFlavourInPlay(gameState);
  const myFlavour = flavourInPlay ? getFlavourCount(gameState, me) : null;
  const leading = flavourInPlay && getFlavourLeaders(gameState).includes(me.id);

  const bd = getScoreBreakdown(me, gameState);

  return {
    fill: {
      fig: `${fullest}/${total}`, mark: icon('grid', 16), ord: fullest,
      state: fullest >= total,
      say: 'A board is full. The end of the game is triggered.',
    },
    tea: {
      fig: `${teaShown}/${REFRESH_THRESHOLD}`,
      mark: '<img src="images/teapot.png" width="16" height="16" alt="" aria-hidden="true">',
      ord: teaShown,
      state: potSize >= REFRESH_THRESHOLD,
      say: gameState.bag.length === 0
        ? 'A pot of tea is due and the bag is empty. This ends the game.'
        : 'A fresh pot of tea is brewing at the end of this turn.',
    },
    menus: {
      fig: menusLeft === null ? '-' : String(menusLeft), mark: icon('card', 16), ord: menusLeft,
      state: menusLeft === 0,
      say: 'The last tasting menu has gone.',
    },
    // A score crosses nothing, so the You chip has no threshold at all.
    stand: {
      fig: String(bd.total), fig2: String(me.cupcakes), mark: icon('cake-stand', 16),
      ord: bd.total, state: false,
    },
    // THE FLAVOUR IS A STANDING, NOT A CLOCK. board.js says so in terms - it is
    // revealed at setup and does not change - so the chip carries the CONTEST
    // around it: how many of the day's flavour you hold, and whether you lead.
    // The mark is drawn at 20px and not 16, and the size is derived rather than
    // chosen: in a 16px box the lemon's median ink run measures 1.64 against the
    // 2.00 CSS pixel floor, and at 20 it reaches 2.05.
    flavour: {
      fig: myFlavour === null ? '-' : String(myFlavour),
      mark: flavourInPlay
        ? `<img src="images/symbol-${gameState.flavourOfTheDay}-v3.png" width="20" height="20" alt="" aria-hidden="true">`
        : icon('card', 16),
      ord: myFlavour,
      // Taking or losing the majority is an EVENT rather than a state, so it is
      // latched on the change rather than tested every render.
      latch: flavourInPlay ? (leading ? 'lead' : 'behind') : null,
      say: leading
        ? `You hold the most ${ingredientLabel(gameState.flavourOfTheDay)} tiles.`
        : `You no longer hold the most ${ingredientLabel(gameState.flavourOfTheDay)} tiles.`,
    },
  };
}

function updateSummaryRail(gameState) {
  const rail = document.querySelector('.pm-rail');
  if (!rail) return;
  const live = rail.querySelector('.pm-rail__live');
  const readings = railReadings(gameState);
  const open = document.body.getAttribute('data-pm-sheet') || '';
  const yours = gameState.currentPlayerIndex === 0;
  const first = railState.first;

  // GRADE 3's bookkeeping. Snapshot every ordinal on the way OUT of your turn
  // and diff on the way back IN, because three bots play between your turns on a
  // phone you are not watching and a rail with no history is a snapshot.
  const leaving = railState.wasYours === true && !yours;
  const arriving = railState.wasYours === false && yours;
  if (leaving) for (const c of RAIL_CHIPS) railState.mark[c.id] = railState.ord[c.id];
  railState.wasYours = yours;

  for (const c of RAIL_CHIPS) {
    const r = readings[c.id];
    const btn = rail.querySelector(`[data-pm-chip="${c.id}"]`);
    if (!btn || !r) continue;

    const markEl = btn.querySelector('[data-pm-mark]');
    if (markEl.dataset.pmKey !== r.mark) {
      markEl.dataset.pmKey = r.mark;
      markEl.innerHTML = r.mark;
    }
    // THE YOU CHIP READS THE COUNT, NOT THE TRUTH (stage 8). Every other chip
    // prints its engine figure the instant it changes; the score is one of the
    // four movements and the chip is where the score is now read, so the chip
    // shows what the count has reached and the count's own rAF loop carries it
    // the rest of the way. Writing the true value here would snap it back on the
    // next of the 38 renders a turn.
    const figEl = btn.querySelector('[data-pm-fig]');
    const shownFig = c.id === 'stand' && countShown(0) !== undefined ? String(countShown(0)) : r.fig;
    if (figEl.textContent !== shownFig) figEl.textContent = shownFig;
    const fig2El = btn.querySelector('[data-pm-fig2]');
    if (r.fig2 == null) {
      fig2El.hidden = true;
    } else {
      fig2El.hidden = false;
      if (fig2El.dataset.pmKey !== r.fig2) {
        fig2El.dataset.pmKey = r.fig2;
        fig2El.innerHTML = `${cupcakeMark(12)}<span>${r.fig2}</span>`;
      }
    }
    btn.setAttribute('aria-expanded', String(c.id === open));

    // GRADE 2, and it outranks a tick. A state threshold lights while the state
    // holds; the flavour's is latched on a change of standing. Either way the
    // rail stays until the chip is tapped - see the click handler.
    let arrived = false;
    if (r.state !== undefined && r.state !== null) {
      if (r.state && !railState.said[c.id]) { railState.lit[c.id] = true; arrived = true; }
      if (!r.state) { railState.lit[c.id] = false; }
      railState.said[c.id] = !!r.state;
    } else if (r.latch !== undefined && r.latch !== null) {
      const was = railState.said[c.id];
      if (!first && was !== undefined && was !== r.latch) { railState.lit[c.id] = true; arrived = true; }
      railState.said[c.id] = r.latch;
    }
    if (railState.lit[c.id]) btn.setAttribute('data-pm-threshold', '1');
    else btn.removeAttribute('data-pm-threshold');

    // GRADE 1, the tick. Suppressed on the first render, because a value has to
    // have been seen before it can be seen to move - AND SUPPRESSED ON THE YOU
    // CHIP ALTOGETHER (stage 8). Stage 7 gave it a wash like the other four; the
    // score already counts at 25ms a point and one event may not be announced
    // twice, so on this chip the count IS the tick.
    const was = railState.ord[c.id];
    if (arrived) announceChip(btn, 'threshold', live, r.say);
    else if (!first && c.id !== 'stand' && was != null && r.ord != null && r.ord !== was) announceChip(btn, 'tick');

    // GRADE 3, the badge itself.
    if (arriving && railState.mark[c.id] != null && r.ord != null && r.ord !== railState.mark[c.id]) {
      const d = r.ord - railState.mark[c.id];
      btn.querySelector('.pm-chip__delta').textContent = (d > 0 ? '+' : '') + d;
      btn.setAttribute('data-pm-delta', '1');
    } else if (arriving) {
      btn.removeAttribute('data-pm-delta');
    }

    railState.ord[c.id] = r.ord;
  }
  railState.first = false;
}

// The attribute is what starts the CSS animation, and it has to be removed and
// re-set to restart one. Removing it again afterwards is what lets the NEXT
// change of the same grade play - the pixels are already back where they
// started, because every one of these keyframe sets ends transparent.
function announceChip(btn, grade, live, sentence) {
  btn.removeAttribute('data-pm-news');
  void btn.offsetWidth;
  btn.setAttribute('data-pm-news', grade);
  if (grade === 'threshold' && live && sentence) live.textContent = sentence;
  window.setTimeout(() => {
    if (btn.getAttribute('data-pm-news') === grade) btn.removeAttribute('data-pm-news');
  }, grade === 'threshold' ? 2000 : 1000);
}

// Bound once per game, by delegation on the rail, which is emitted once by
// renderGameScreen and never re-rendered - only its figures are rewritten.
function bindSummaryRail() {
  const rail = document.querySelector('.pm-rail');
  if (!rail) return;
  rail.addEventListener('click', e => {
    const btn = e.target.closest('[data-pm-chip]');
    if (!btn) return;
    const id = btn.dataset.pmChip;
    // TAPPING IS THE ACKNOWLEDGEMENT. It clears the threshold rail whether or
    // not the state has passed, which is the whole of decision 32 stated as a
    // mechanism: the news persists until it has been read, and reading it is
    // opening the sheet it came from.
    railState.lit[id] = false;
    btn.removeAttribute('data-pm-threshold');
    closeOppSheet();
    toggleSheet(id);
  });
}

// ---------------------------------------------------------------------------
// ONE OPPONENT, EXPANDED (plan section 4.5)
//
// Their 14px board comes off the strip entirely and comes back at 44px in a tall
// sheet (decision 31), which reverses the collapsed variant that kept the
// unreadable half. Three tickets measured the 14px board as failing - unreadable
// at all, green against blue at dE 7.8 for a tritanope with no ink to help, and
// a board ground only dE 1.6 from the wall - and removing it RETIRES both colour
// problems rather than mitigating them.
//
// Stage 6's structural trick, applied to a seat: NOTHING IS RE-PARENTED. The
// seat leaves the strip by going `position: fixed` where it already sits, so
// updateStats keeps rewriting it and every delegated listener survives.
// ---------------------------------------------------------------------------

function openOppSheet(panel) {
  closeSheet();
  closeOppSheet();
  panel.setAttribute('data-pm-open', '1');
  document.body.setAttribute('data-pm-opp', panel.id || '1');
}

function closeOppSheet() {
  document.querySelectorAll('.ft-seat--opp[data-pm-open]').forEach(el => el.removeAttribute('data-pm-open'));
  document.body.removeAttribute('data-pm-opp');
}

function bindOpponentStrip() {
  const strip = document.querySelector('.ft-opp-strip');
  if (!strip) return;
  strip.addEventListener('click', e => {
    if (!isPhoneBand()) return;
    const panel = e.target.closest('.ft-seat--opp');
    if (!panel) return;
    if (e.target.closest('[data-pm-opp-close]')) { closeOppSheet(); return; }
    if (panel.getAttribute('data-pm-open') === '1') return;   // taps inside the open sheet
    openOppSheet(panel);
  });
  // The row is a button in every sense except the tag, and the tag cannot change:
  // .ft-seat--opp is the hook four bands of layout hang off.
  strip.querySelectorAll('.ft-seat--opp').forEach(panel => {
    panel.setAttribute('role', 'button');
    panel.setAttribute('tabindex', '0');
    panel.addEventListener('keydown', e => {
      if (!isPhoneBand()) return;
      if (e.key !== 'Enter' && e.key !== ' ') return;
      if (panel.getAttribute('data-pm-open') === '1') return;
      e.preventDefault();
      openOppSheet(panel);
    });
  });
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && document.body.getAttribute('data-pm-opp')) closeOppSheet();
});

// ---------------------------------------------------------------------------
// THE SWEEP DIALOG (plan section 6.3, defects 3 and the sweep half of 15)
//
// ONE FUNCTION, NOT TWO. showSweepOptionsForRow and showSweepOptionsForCol were
// 86 lines apiece and differed in four things: how the line is read out of the
// market, what the title says, which data attribute the option carries, and
// which argument onMarketClick is given. All four are parameters, so the two
// functions are one function taking a line and a title. Everything below this
// comment was duplicated before stage 5, including the two bugs the duplication
// hid - two different close glyphs (fixed by stage 2) and two copies of a scrim
// that should never have been there at all.
//
// IT DOES NOT USE .ft-modal, AND THAT IS DEFECT 3. .ft-modal paints
// rgba(61, 43, 31, .5) across the whole viewport at z-index 1000. Measured with
// the sweep dialog open, that scrim covers THE WHOLE MARKET at every desktop
// width - 294x294 at 1280, 284x276 at 1440 and 1920, 344x336 at 2400 - so the
// dialog dimmed the exact thing it was asking a question about. The one ruling
// that holds at every band forbids it outright: emphasis is additive, and
// nothing is ever dimmed at any width to say that something else is the step.
//
// The scrim also ate the commonest way out. Backing out of a sweep is "wrong
// row, click a different chip", and it works only because there is nothing over
// the market to catch the click. With the scrim, the first click closed the
// dialog and the second opened the right row.
//
// .ft-modal IS UNTOUCHED AND STILL BELONGS TO THE RULES MODAL (board.js:136),
// which is genuinely modal: a document you read is the only thing on the screen
// while you read it.
//
// WHAT THE PLAYER SEES INSTEAD OF A SWATCH AND A COUNT: the actual tiles the
// sweep would take, with their colours and their ingredients, in a slice of the
// market's own recess (decision 10). The words survive as the accessible name
// and nowhere else.
//
// FOUR WAYS OUT, and they are the four desktop routes: Escape, Close, the same
// gutter chip again, and a different gutter chip. There is no swipe handler and
// no grab handle to drop - the build never had either; they are the phone
// sheet's, and stage 6 owns that.
// ---------------------------------------------------------------------------

const COLUMN_LABELS = ['A', 'B', 'C', 'D', 'E', 'F'];

// The one live dialog, its ring, and which line it is open on. Module scope
// rather than a closure, because closeSweepOptions is called from updateMarket,
// which knows nothing about the click that opened it.
let sweepDialog = null;
let sweepRing = null;
let sweepOpenOn = null;   // { index, isRow }
let sweepKeyHandler = null;
let sweepMoveHandler = null;

// THE ROW RING. One absolutely positioned element appended to #marketContainer
// and sized off the first and last tile's own offsets, so it needs no arithmetic
// about tile sizes or gaps and is correct at 44, 48 and 60 alike. An outline
// sits outside the box model, so it costs zero layout: the market grid measures
// the same with the ring up and with it down.
function drawSweepRing(gameState, index, isRow) {
  const container = document.getElementById('marketContainer');
  const market = document.getElementById('market');
  if (!container || !market) return;

  const n = gameState.marketSize;
  const first = market.querySelector(`.market-tile[data-index="${isRow ? index * n : index}"]`);
  const last = market.querySelector(`.market-tile[data-index="${isRow ? index * n + n - 1 : (n - 1) * n + index}"]`);
  if (!first || !last) return;

  // MEASURED WITH getBoundingClientRect AND DIFFERENCED AGAINST THE CONTAINER,
  // not with offsetLeft. offsetLeft is relative to the element's OFFSET PARENT,
  // and .ft-tile carries `position: relative` for its state washes, so a market
  // tile's offset parent is already #marketContainer once the container is made
  // relative - adding #market's own offset on top of that put the ring 36px
  // right and 28px down, hanging off the side of the market. Rects have no such
  // ambiguity: the difference of two client rects is the same number whatever
  // is positioned in between.
  if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
  const base = container.getBoundingClientRect();
  const a = first.getBoundingClientRect();
  const b = last.getBoundingClientRect();

  sweepRing = document.createElement('div');
  sweepRing.className = 'ds-rowring';
  sweepRing.style.left = `${Math.round(a.left - base.left)}px`;
  sweepRing.style.top = `${Math.round(a.top - base.top)}px`;
  sweepRing.style.width = `${Math.round(b.right - a.left)}px`;
  sweepRing.style.height = `${Math.round(b.bottom - a.top)}px`;
  container.appendChild(sweepRing);

  // The second carrier: the gutter chip you clicked keeps the accent-deep fill,
  // which is the only thing on the screen that says WHICH WAY you are reading
  // the market.
  const chip = document.querySelector(isRow
    ? `.market-row-btn[data-row="${index}"]`
    : `.market-col-btn[data-col="${index}"]`);
  if (chip) chip.classList.add('ds-chip-held');
}

// Called by updateMarket on EVERY market re-render. The ring lives in
// #marketContainer and #market's innerHTML is what a re-render replaces, so the
// ring would otherwise survive its own row being redealt.
function closeSweepOptions() {
  if (sweepRing && sweepRing.parentNode) sweepRing.parentNode.removeChild(sweepRing);
  sweepRing = null;
  document.querySelectorAll('.ds-chip-held').forEach(el => el.classList.remove('ds-chip-held'));
  if (sweepDialog && sweepDialog.parentNode) sweepDialog.parentNode.removeChild(sweepDialog);
  sweepDialog = null;
  sweepOpenOn = null;
  if (sweepKeyHandler) {
    document.removeEventListener('keydown', sweepKeyHandler);
    sweepKeyHandler = null;
  }
  if (sweepMoveHandler) {
    window.removeEventListener('resize', sweepMoveHandler);
    window.removeEventListener('scroll', sweepMoveHandler);
    sweepMoveHandler = null;
  }
}

// THE ANCHOR. Two lines of arithmetic against the market's own measured box:
//
//     top  = market.bottom + 12
//     left = market.centre - dialog.width / 2
//
// DOCUMENT coordinates rather than viewport ones, because the dialog belongs to
// the market: it has to travel with it under scroll and must not slide about
// when somebody resizes the window. The market cannot be covered by
// construction - the dialog's first pixel is twelve below the market's last.
//
// THE CLAMP IS A GUARD, NOT A BEHAVIOUR. It does not fire at any width from 1280
// to 2400; it exists so that a band nobody has measured cannot push the dialog
// off the page in silence.
//
// Below 1150 the dialog is `position: fixed` and centres itself in CSS, so this
// writes nothing: there is no anchor there yet, and stage 6's bottom sheet is
// what fills that band.
function placeSweepDialog() {
  if (!sweepDialog) return;
  if (!window.matchMedia('(min-width: 1150px)').matches) {
    // BELOW 1150 THE DIALOG IS A BOTTOM SHEET and CSS places it. Any inline
    // left/top written while the window was wider has to go, or a resize across
    // the boundary leaves the sheet anchored to a market that has moved.
    sweepDialog.style.left = '';
    sweepDialog.style.top = '';
    return;
  }
  const container = document.getElementById('marketContainer');
  if (!container) return;

  const gap = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--ds-gap')) || 12;
  const box = container.getBoundingClientRect();
  const width = sweepDialog.offsetWidth;
  const wanted = Math.round(box.left + window.scrollX + box.width / 2 - width / 2);
  const docWidth = document.documentElement.clientWidth;
  const left = Math.min(Math.max(wanted, 16), Math.max(16, docWidth - 16 - width));

  sweepDialog.style.left = `${left}px`;
  sweepDialog.style.top = `${Math.round(box.bottom + window.scrollY + gap)}px`;
}

// The two axes are PARTITIONS OF THE SAME LINE, which is the fact that makes
// decision 10 fit: however many options a line offers, the number of tiles drawn
// is at most twice the line length, and a line is at most five. Ten options
// means ten one-tile options, not ten five-tile ones.
//
// THE ORDER IS THE ORDER THE TILES SIT IN THE LINE, which is a Map's own
// insertion order and is exactly what the two Sets this replaced produced. It is
// kept rather than swapped for a fixed palette order because the chips are
// pictures of a specific row: reading them left to right in the dialog then
// walks the row left to right on the board, and a fixed palette order would make
// the fourth chip point at the first tile. (The prototype's builder sorts by
// palette; nothing in the plan or the ticket asks for it, and the shipped order
// is the one a player has already learned.)
function sweepOptionsFor(tiles) {
  const byColour = new Map();
  const byIngredient = new Map();
  for (const tile of tiles) {
    if (!tile) continue;
    if (!byColour.has(tile.colour)) byColour.set(tile.colour, []);
    if (!byIngredient.has(tile.ingredient)) byIngredient.set(tile.ingredient, []);
    byColour.get(tile.colour).push(tile);
    byIngredient.get(tile.ingredient).push(tile);
  }
  return {
    colour: [...byColour].map(([value, ts]) => ({ type: 'colour', value, tiles: ts })),
    symbol: [...byIngredient].map(([value, ts]) => ({ type: 'symbol', value, tiles: ts })),
  };
}

function sweepOptionHTML(option, index, isRow, freeCells) {
  const count = option.tiles.length;
  // THE OVERFLOW PREVIEW, ON THE OPTION, BEFORE THE TAP (plan section 5.4).
  // `freeCells` is the free-cell count read at the moment the sheet opened, so
  // `keep` is how many of this option's tiles the board could actually take and
  // everything past it goes back into the bag. The surplus is drawn FROM THE
  // RIGHT, which is the order the placement step will offer them in.
  const keep = Math.min(count, freeCells);
  const lost = count - keep;
  const inner = option.tiles.map((tile, i) => `
        <span class="ds-tile ${getColourClass(tile.colour)}${i >= keep ? ' ds-tile--tobag' : ''}">
          <img src="images/symbol-${tile.ingredient}-v3.png" class="ds-tile__icon" alt="">
        </span>`).join('');

  // THE ACCESSIBLE NAME IS WHERE THE WORDS WENT. No icon and no painted object
  // is ever the accessible name of anything, and the chip's face carries no
  // colour name, no ingredient name and no count because the tiles say all
  // three: a colour chip is monochrome, an ingredient chip is mono-silhouette,
  // and the count is how many tiles are in it. The strike is a shape and
  // survives desaturation; the name is what carries it to a screen reader.
  let label = `Take the ${count} ${option.value} tile${count === 1 ? '' : 's'}`;
  if (lost > 0) label += `, ${lost} ${lost === 1 ? 'goes' : 'go'} back to the bag`;

  return `
      <button class="ds-opt" type="button" data-type="${option.type}" data-val="${option.value}"
              data-index="${index}" data-isrow="${isRow ? 1 : 0}" aria-label="${label}">${inner}
      </button>`;
}

function showSweepOptions(gameState, index, isRow) {
  // Defence in depth: never offer sweep choices outside a live human sweep phase
  // (onMarketClick would silently drop them, which reads as a dead UI).
  if (gameState.gamePhase !== 'sweep' || gameState.bonusTileAvailable) return;

  // The same chip again closes it. One of the four ways out, and the one a
  // player finds without being told.
  const wasOpenOnThisLine = sweepOpenOn && sweepOpenOn.index === index && sweepOpenOn.isRow === isRow;
  closeSweepOptions();
  if (wasOpenOnThisLine) return;

  const n = gameState.marketSize;
  const tiles = [];
  for (let j = 0; j < n; j++) {
    tiles.push(isRow ? gameState.market[index * n + j] : gameState.market[j * n + index]);
  }

  const options = sweepOptionsFor(tiles);
  const title = isRow ? `Sweep row ${index + 1}` : `Sweep column ${COLUMN_LABELS[index]}`;

  // THE FREE-CELL COUNT, READ AT THE MOMENT THE SHEET OPENS (plan section 18,
  // stage 6). `board.filter(c => c === null).length` on the current player, and
  // NOT getSweepPlacementCount - that function is min(pendingSweepTiles.length,
  // free cells) and there is no pending sweep to measure against until the
  // declaration this sheet exists to take. A blocked cell is an object, not a
  // null, so an empty plate correctly counts as no room.
  const sweeper = gameState.players[gameState.currentPlayerIndex];
  const freeCells = sweeper.board.filter(c => c === null).length;
  const worstLost = Math.max(0, ...[...options.colour, ...options.symbol]
    .map(o => o.tiles.length - freeCells));

  // THE FOOT APPEARS RATHER THAN LIVING THERE (plan section 5.4). A line that is
  // always there says nothing; a line that appears says read me. It is silent on
  // 99.68% of sweeps - 20 overflows in 6,280 - and every one of those happened
  // with one or two spaces left, which is why it names the number rather than
  // the rule. TWO LINES AT 360 IS A HARD CONSTRAINT: the sheet is 173px before
  // it against a 240px cap, so the foot has 61px, which is 16 of chrome and two
  // 12px lines. A first draft of this string ran to four lines and pushed the
  // sheet past its own cap.
  const foot = freeCells === 0
    ? '<b>Your board is full.</b> Everything you sweep goes back to the bag.'
    : `<b>${freeCells} space${freeCells === 1 ? '' : 's'} left on your board.</b> `
      + 'The rest go back to the bag, and you choose which.';

  // COINCIDENT OPTIONS ARE BOTH SHOWN (decision 28). Nearly seven market lines in
  // ten carry a colour option that takes exactly the same tiles as an ingredient
  // option, so at the extreme the dialog shows the same five tiles twice. The
  // duplication is the teaching moment - it is where a player learns that either
  // declaration is legal and takes the same tiles - and deduplicating would also
  // stop the engine recording which axis the player meant.
  const dialog = document.createElement('div');
  dialog.className = 'ds-dialog';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-label', title);
  dialog.dataset.overflow = worstLost > 0 ? '1' : '0';
  dialog.innerHTML = `
    <div class="ds-dialog__chrome">
      <span class="ds-dialog__handle" aria-hidden="true"></span>
      <h2 class="ds-dialog__title">${title}</h2>
      <button class="ds-dialog__close" type="button">Close</button>
    </div>
    <div class="ds-dialog__body">
      <div class="ds-group">
        <div class="ds-group__label">By colour</div>
        <div class="ds-options">${options.colour.map(o => sweepOptionHTML(o, index, isRow, freeCells)).join('')}</div>
      </div>
      <div class="ds-group">
        <div class="ds-group__label">By ingredient</div>
        <div class="ds-options">${options.symbol.map(o => sweepOptionHTML(o, index, isRow, freeCells)).join('')}</div>
      </div>
      <div class="ds-foot">${foot}</div>
    </div>
  `;
  document.body.appendChild(dialog);

  sweepDialog = dialog;
  sweepOpenOn = { index, isRow };
  placeSweepDialog();
  drawSweepRing(gameState, index, isRow);

  dialog.querySelector('.ds-dialog__close').addEventListener('click', () => closeSweepOptions());

  dialog.querySelectorAll('.ds-opt').forEach(btn => {
    btn.addEventListener('click', () => {
      const line = parseInt(btn.dataset.index);
      const asRow = btn.dataset.isrow === '1';
      // The declaration path is the shipped one, unchanged: the option carries
      // its four attributes and calls onMarketClick with them.
      closeSweepOptions();
      window._gameUI.onMarketClick(line, asRow, btn.dataset.val, btn.dataset.type);
    });
  });

  sweepKeyHandler = e => { if (e.key === 'Escape') closeSweepOptions(); };
  document.addEventListener('keydown', sweepKeyHandler);

  // THE FOURTH WAY OUT, and it is the phone's (plan section 5.4). Apple: people
  // expect to swipe a sheet down to dismiss it, and the grab handle in the
  // chrome is what makes that discoverable. THE SHEET NEVER SCROLLS, which is
  // exactly what makes the gesture unambiguous - there is no scroll for a
  // vertical drag to compete with, at any width, on any deal.
  attachSheetSwipe(dialog, closeSweepOptions);

  // Re-anchored rather than re-rendered. The dialog is in document coordinates,
  // so a scroll moves nothing; a RESIZE does, because the market's column can
  // change width, and a band boundary crossed with the dialog open would leave
  // it hanging off nothing.
  sweepMoveHandler = () => placeSweepDialog();
  window.addEventListener('resize', sweepMoveHandler);
  window.addEventListener('scroll', sweepMoveHandler);
}

// Why a further claim is refused, in the exact words the player needs. Shared by
// the market cards and the tooltip so they cannot drift apart. (It was shared
// with the "on order" reserve card too, until the reserve was deleted on
// 11 August.)
//
// SINCE 9 AUGUST A FURTHER CLAIM IS FOR SALE, NOT FORBIDDEN (§6, 1 cupcake each,
// uncapped), so the usual reason a human lands in 'refill' with a claim already
// made is an empty purse - claim() closes the claim step the moment the player
// cannot pay for another. The old "one claim per turn" wording survives for the
// A/B control, because the engine can still be swung back to it and a UI that
// lied about which rule was live would be worse than no message at all.
function furtherClaimMessage() {
  const cost = getExtraClaimCupcakeCost();
  if (cost === null) {
    return `One claim per turn - you have already claimed. ${clickVerb()} "Confirm Turn" to end your turn.`;
  }
  return `Another card costs ${cost} cupcake${cost === 1 ? '' : 's'} and you cannot pay. ${clickVerb()} "Confirm Turn" to end your turn.`;
}

// True when a human is looking at cards they may no longer claim this turn. The
// engine's rule is enforced in claim(); this is only about explaining it.
function isFurtherClaimBlocked(gameState) {
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

// CARD_DISPLAY_HEIGHT AND cardDisplayHeight() STOOD HERE, and are deleted with
// the pixel sprite maths (plan A5). The card height is --card-height in the
// stylesheet now, one value per responsive band.
//
// What went with them is worth stating, because it was 40 lines of comment and a
// standing maintenance obligation: the 235px figure was hand-derived from the
// centre column's width, by subtracting the panel padding, the section padding
// and the card grid's padding to find how much room four cards and their gaps
// had - and that subtraction had to be redone by hand every time any of those
// moved. It had already been redone twice, once when the card row stopped
// shrinking with row length, and again on 4 August when the pantry goals were
// deleted and the row went full width.
//
// It does not need maintaining any more. The row is a flex-wrap container with
// no width floor, so it fits whatever number of cards the width allows and wraps
// the rest; a card is --card-height tall and takes its width from the sheet's
// aspect ratio. Nothing has to agree with anything by arithmetic.
//
// The rule that produced the figure still holds and is the reason --card-height
// is generous rather than convenient: the art carries the PATTERN a player has
// to match against their board, so the panel grows in height rather than the
// cards shrinking. A long row costs page height, never legibility.

// ---- THE CARD ROW'S OVERFLOW CUE ------------------------------------------
// Below 1150 the row scrolls sideways instead of wrapping (see #cardMarket in
// the touch band). Three things say so, and they are deliberately redundant
// because each one fails on a different device:
//
//   1. A FADE at whichever edge has more behind it. A hard-cut card edge reads
//      as a card that has been cropped by the panel; a card dissolving into the
//      panel ground reads as a card continuing past it. This is the only part of
//      the cue that works while a finger is mid-swipe.
//   2. A NUDGE BUTTON over that fade. The fade alone is honest but passive - it
//      says "there is more" without saying "and you can get at it", which is
//      exactly the gap a hidden scrollbar leaves. One tap moves the strip by one
//      card, so a player who never thinks to swipe still sees the whole row.
//   3. The COUNT already in the section head ("6 cards on offer"), which is the
//      only one of the three a screen reader gets, and is why the nudges carry
//      real labels rather than being decoration.
//
// EVERY PART OF IT IS DRIVEN OFF MEASUREMENT, not off a breakpoint. The two data
// attributes are set from scrollWidth against clientWidth, so the cue appears
// only when something is genuinely off-screen and disappears at each end of the
// travel - at XL and L, where the row wraps, neither attribute is ever set and
// the whole thing costs one div and two display:none buttons.
const CARD_SCROLL_EPS = 4;

// The window listener outlives the game screen - a new game replaces #app and
// with it the wrapper, so a flag on the wrapper would re-add it every time
// somebody played again. The element lookups inside the handler are by id, so
// the one listener always finds whichever row is current.
let cardCueResizeWired = false;

function syncCardScrollCue() {
  const grid = document.getElementById('cardMarket');
  const wrap = document.getElementById('cardScroll');
  if (!grid || !wrap) return;

  const max = grid.scrollWidth - grid.clientWidth;
  const scrollable = max > CARD_SCROLL_EPS;
  wrap.dataset.scrollPrev = scrollable && grid.scrollLeft > CARD_SCROLL_EPS ? '1' : '0';
  wrap.dataset.scrollNext = scrollable && grid.scrollLeft < max - CARD_SCROLL_EPS ? '1' : '0';

  // WIRED ONCE, AND NOT IN renderGameScreen. updateCardMarket runs on every
  // render and #cardMarket keeps its identity across all of them (only its
  // children are replaced), so a flag on the wrapper is enough to keep this to
  // one set of listeners for the life of the game screen.
  if (wrap.dataset.cueWired === '1') return;
  wrap.dataset.cueWired = '1';

  grid.addEventListener('scroll', syncCardScrollCue, { passive: true });
  if (!cardCueResizeWired) {
    cardCueResizeWired = true;
    window.addEventListener('resize', syncCardScrollCue);
  }

  wrap.querySelectorAll('[data-card-scroll]').forEach(btn => {
    btn.addEventListener('click', () => {
      // ONE CARD PER TAP, measured off a real card rather than off a constant:
      // the card is sized from --card-height and the sheet's aspect ratio, so no
      // number written here would stay true. Falling back to most of the strip
      // covers the empty row, where there is nothing to measure.
      const card = grid.querySelector('.card-market-sprite');
      const gap = parseFloat(getComputedStyle(grid).columnGap) || 0;
      const step = card ? card.getBoundingClientRect().width + gap : grid.clientWidth * 0.8;
      grid.scrollBy({
        left: Number(btn.dataset.cardScroll) * step,
        behavior: reduced() ? 'auto' : 'smooth',
      });
    });
  });
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
  // The sprite geometry that stood here is deleted: it was a second copy of the
  // maths in cardSpriteHTML, and neither copy exists any more. The sheet layout
  // and the card size are both the stylesheet's business now
  // (.card-market-sprite, --card-height).

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

  // canClaimMore is unconditionally true since 6 August - empty plates are
  // unlimited, so nothing gates the set but the pattern itself. The call is kept
  // because the engine keeps the function as the hook a future claim limit would
  // live in, and a UI that stopped asking would be the thing to find and fix if
  // one ever arrived.
  if (gameState.gamePhase === 'claim' && canClaimMore(gameState)) {
    // EVERY card on the row is claimable the moment it is there. The same-turn
    // lock that used to be checked here belonged to the paid reserve, which was
    // deleted on 11 August - there is no exception of any kind left.
    for (const card of gameState.cardMarket) {
      const matches = getPatternMatches(currentPlayer.board, card.pattern);
      if (matches.length > 0) {
        claimableCardIds.add(card.id);
      }
    }
  }

  const cardsHTML = gameState.cardMarket.map(card => {
    const isClaimable = claimableCardIds.has(card.id);
    return cardSpriteHTML(card, null, {
      extraClass: isClaimable ? 'ft-card--claimable' : '',
      clickable: isClaimable && gameState.gamePhase === 'claim',
    });
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

  // THE CLOSED CLAIM STEP, SAID OUT LOUD (design doc §6). When the claim step has
  // closed the turn sits in the 'refill' phase and the cards simply stop
  // responding, which reads as a broken interface to the many players who assume
  // another claim is allowed - and since 9 August they are RIGHT that it is
  // allowed, just not affordable, which makes an unexplained dead row worse than
  // it ever was. Wire the whole row to state the reason instead of doing nothing:
  // the engine refuses the claim either way, but a silent no-op teaches the player
  // nothing, and greying the cards out only says "no", never "why".
  // The message is in-page (the notice line above the row) rather than an
  // alert() - a modal dialog for a rule reminder is far too heavy a hammer, and
  // it is the only place in the game screen that would have used one.
  if (isFurtherClaimBlocked(gameState)) {
    cardMarket.querySelectorAll('.card-market-sprite').forEach(cardEl => {
      cardEl.style.cursor = 'not-allowed';
      cardEl.classList.add('ft-card--claim-used');
      const msg = furtherClaimMessage();
      cardEl.title = msg;
      cardEl.addEventListener('click', () => showCardRowNotice(msg));
    });
  }

  // (THE PAID RESERVE armed the card row here: with the option armed from the
  // cupcake panel, a click on a market card bought it into the player's reserve.
  // DELETED 11 AUGUST with the action. The card row now has exactly two click
  // meanings - claim it, or be told why you cannot.)

  // The row's length changes under the player - a card is added at the end of
  // every turn and taken by every claim - so the cue is re-measured after each
  // render rather than only on scroll and resize.
  syncCardScrollCue();
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
      // AN EMPTY CELL IS A TARGET FOR TWO GESTURES NOW, and they share the class
      // because to the player they are the same instruction: "put it here". One
      // is the cupcake move's destination, the other is the cell an extra tile
      // just lifted off the market is about to land in.
      const isHoldingExtraTile = isCurrentPlayer && player.isHuman
        && ui.extraTilePending !== null && ui.extraTilePending !== undefined;
      const isMoveTarget = (isInCupcakeMode || isHoldingExtraTile) && tile === null;
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

      // With a swept tile armed by tap (B1), every cell it could legally go in
      // says so. Without this the tap path is a guess: nothing on screen relates
      // the tile you just selected to the places it can land.
      const isTapTarget = isCurrentPlayer && player.isHuman && isPlacingPhase
        && ui.selectedTileIndex !== null && ui.selectedTileIndex !== undefined;

      const displayTile = tile || pendingTile;

      // THE TASTING MENU, on the one cell where it pays off. A menu is completed by
      // the tile a claim REMOVES and then PLATES, so the moment this is worth
      // saying is exactly the moment the player is choosing which matched-pattern
      // cell to sacrifice - and it is easy to miss on a busy board.
      //
      // ONLY COMPLETION IS BADGED, not partial progress. A badge on every tile that
      // moves some menu a little would be on most of the board and would say
      // nothing; a badge that means "removing this one and plating it takes an
      // whole menu card, right now" is worth looking at. menuCompletedBy is the shared
      // predicate - it also checks a stand row is legally open for the tile, since
      // a tile that can only be crumbed cannot complete anything.
      const menuPayout = isRemovable && !isBlockedCell && displayTile
        ? menuCompletionValue(gameState, player, displayTile)
        : 0;

      // THE FLAVOUR OF THE DAY, on EVERY board and at ALL times - unlike the menu
      // badge above, which speaks only at the claim step and only to the player
      // whose turn it is. The Flavour is a running count on a board, and a count
      // you cannot see at a glance is a count nobody plays for; it is also the
      // game's first reason to look at somebody else's board, which only works if
      // their tiles are marked too.
      //
      // A TINT AND A RING RATHER THAN A BADGE. There can be a dozen of these on one
      // board and a dozen badges would bury the board under numbers - the tile is
      // worth 1 VP, and the useful reading is "how many of these do I have", which
      // is a shape you count rather than a number you read.
      const isFlavourTile = !isBlockedCell && displayTile
        && gameState.flavourOfTheDay && displayTile.ingredient === gameState.flavourOfTheDay;

      // AND THE WARNING, at the one moment it costs something: this cell is a
      // candidate sacrifice and the tile on it is a Flavour tile, so claiming here
      // spends a point and possibly the lead. It should not be a surprise
      // discovered at scoring. The menu badge (a gain) and this (a cost) can both
      // be true of the same cell, which is a genuinely hard choice rather than a
      // rendering clash - the two marks are deliberately different shapes.
      const flavourWarning = isFlavourTile && isRemovable;

      let tileClass = 'ft-tile board-tile';
      if (isBlockedCell) {
        tileClass += ' ft-tile--blocked';
        if (isPlateRemovable) tileClass += ' ft-tile--removable';
      } else if (!displayTile) {
        tileClass += ' ft-tile--empty';
        if (isMoveTarget) tileClass += ' ft-tile--move-target';
        if (isTapTarget) tileClass += ' ft-tile--tap-target';
      } else {
        tileClass += ' ft-tile--placed';
        if (pendingTile && !tile) tileClass += ' ft-tile--ghost';
        if (isRemovable) tileClass += ' ft-tile--removable';
        if (isMovableInCupcakeMode) tileClass += ' ft-tile--movable';
        if (menuPayout > 0) tileClass += ' ft-tile--menu';
        if (isFlavourTile) tileClass += ' ft-tile--flavour';
        if (flavourWarning) tileClass += ' ft-tile--flavour-risk';
      }

      // Defect 8. A blocked cell keeps no colour class at all: .ft-tile--blocked
      // owns its own fill, and stage 4 turns it into the CSS empty plate.
      if (displayTile && !isBlockedCell) tileClass += ` ${getColourClass(displayTile.colour)}`;
      // THE EMPTY PLATE IS CSS NOW (decision 23, plan section 8.6). The painting
      // measured 95,269 bytes and drew its filigree at 0.39 / 0.32 / 0.29 CSS px
      // and its scallops at 1.11 / 0.89 / 0.81 - under the 2.00px floor at every
      // size the board ever draws it, four times further under it than the
      // almond. A plate on this board is a plain plate whatever it is made of,
      // so it is a disc, a rim band, a sunk well, one 10 o'clock highlight and a
      // contact shadow, at zero bytes.
      //
      // aria-label because the deleted <img> carried alt="blocked", which was the
      // only thing announcing an empty plate to a screen reader.
      const imageHtml = isBlockedCell
        ? `<div class="ft-plate" role="img" aria-label="empty plate"></div>`
        : (displayTile ? `<img src="images/symbol-${displayTile.ingredient}-v3.png" class="ft-tile__icon" alt="${displayTile.ingredient}">` : '');
      const menuBadge = menuPayout > 0
        ? `<span class="ft-tile__menu" title="Tasting Menu - remove this tile and plate it on your cake stand and you complete a menu, worth ${menuPayout} VP">+${menuPayout}</span>`
        : '';
      // The cost mark. It carries the MINUS explicitly - this is the only mark on
      // the board that says a move costs you something, and it has to read as the
      // opposite of the green +VP badge it may be sitting beside.
      const flavourBadge = flavourWarning
        ? `<span class="ft-tile__flavour" title="Flavour of the Day - sacrificing this tile takes it off your board, where it is worth ${FLAVOUR_VP_PER_TILE} VP, and it may cost you the ${FLAVOUR_MAJORITY_VP} VP majority. The cake stand and crumb tray do not count for the Flavour.">-${FLAVOUR_VP_PER_TILE}</span>`
        : '';
      const draggableAttr = isMovableInCupcakeMode ? 'draggable="true"' : '';
      const boardTileIndexAttr = isMovableInCupcakeMode ? `data-board-tile-index="${idx}"` : '';
      const plateRemoveAttr = isPlateRemovable
        ? `data-remove-plate-index="${idx}" title="Remove this empty plate to the box (${REMOVE_PLATE_CUPCAKE_COST} cupcakes)"`
        : '';

      return `
        <div class="${tileClass}" data-index="${idx}" data-player="${playerIdx}" ${draggableAttr} ${boardTileIndexAttr} ${plateRemoveAttr}>
          ${imageHtml}${menuBadge}${flavourBadge}
        </div>
      `;
    }).join('');

    if (showWorkingArea) {
      workingAreaEl.classList.remove('ft-hidden');
      // THE TRIM RULE (6 August). Once the tiles still in the tray are exactly the
      // ones that cannot fit, they ARE the tiles going back into the bag - the
      // player's choice is made simply by which ones they placed. Say so on the
      // tiles themselves rather than only in the phase bar: this is the moment the
      // decision is live, and a tile the player thinks they forgot is a tile they
      // have actually just given up.
      const placedSoFar = ui.placementMap ? Object.keys(ui.placementMap).length : 0;
      const stillToPlace = getSweepPlacementCount(gameState) - placedSoFar;
      const trayIsTheBag = isCurrentPlayer && player.isHuman && stillToPlace <= 0
        && gameState.pendingSweepTiles.length > placedSoFar;
      workingAreaEl.innerHTML = gameState.pendingSweepTiles.map((tile, idx) => {
        const isPlaced = ui.placementMap && ui.placementMap[idx] !== undefined;
        const isSelected = ui.selectedTileIndex === idx;
        const backToBag = trayIsTheBag
          ? ' working-tile--to-bag'
          : '';
        const title = trayIsTheBag
          ? `${tile.ingredient} - no room on your board, this one goes back into the bag`
          : tile.ingredient;
        return !isPlaced ? `
          <div class="ft-tile working-tile${isSelected ? ' working-tile--selected' : ''}${backToBag} ${getColourClass(tile.colour)}" draggable="true" data-tile-index="${idx}" style="cursor: grab; user-select: none; flex-shrink: 0;" title="${title}">
            <img src="images/symbol-${tile.ingredient}-v3.png" class="ft-tile__icon" style="pointer-events: none;" alt="${tile.ingredient}">
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
            // step rather than committing - the player must now pick where the
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

// (renderOnOrderSlot and the ON_ORDER_FANNED cap stood here: the "On order"
// slot that showed a player's face-up reserved cards beside their board, as an
// overlapped fan capped at one card's height. DELETED 11 AUGUST with the
// reserve. A player's cards are claimed cards and nothing else, so no seat has
// a card face outside the shared row any more - which also retires the one
// unbounded height term the desktop rail column ever had.)

// ---------------------------------------------------------------------------
// PLACEMENT: hit-testing and the one commit
//
// The drop target used to be worked out by ARITHMETIC, in three separate copies
// of the same block:
//
//     const TILE_SIZE = 60; const CELL_SIZE = TILE_SIZE + TILE_GAP;
//     const col = Math.floor(x / CELL_SIZE);
//
// That is wrong twice over. It hardcodes the tile size, so the moment
// --tile-size becomes responsive every drop silently lands in the wrong cell;
// and it measured from playerBoard.getBoundingClientRect() while .ft-board-grid
// carries 8px of padding, so cell 0 really spans x = 8..68 while the maths
// treated it as 0..62 - the last ~6px of every cell registered as the next cell
// along. That was a live bug at 60px, not a future one.
//
// Every cell already carries its own data-index. Reading it off the element the
// pointer actually hit is exact at any tile size and has no offset to get wrong.
// ---------------------------------------------------------------------------

// The own-board cell an event landed on, or null if it missed the board.
function boardIndexFromEvent(e) {
  const cell = e.target?.closest?.('.board-tile[data-player="0"]');
  if (!cell) return null;
  const idx = parseInt(cell.dataset.index, 10);
  return Number.isInteger(idx) ? idx : null;
}

// A cell is a legal destination if it is genuinely empty: not occupied, and not
// an empty plate planted by a claim.
function isEmptyCell(gameState, boardIndex) {
  const player = gameState.players[gameState.currentPlayerIndex];
  const cell = player.board[boardIndex];
  const isBlocked = cell && typeof cell === 'object' && cell.type === 'blocked';
  return cell === null && !isBlocked;
}

// ...and not already spoken for by another tile placed earlier this turn. The
// board itself is not written until the placement is submitted, so a cell
// holding a ghost still reads as null and needs asking about separately.
function isCellPending(boardIndex) {
  const map = window._gameUI?.placementMap || {};
  return Object.values(map).some(i => Number(i) === boardIndex);
}

// THE ONE PLACE a swept tile is committed to a cell, whatever put it there.
// The drag path calls it today and Phase B's tap path will call the same
// function, so the two input methods cannot drift apart in what they allow.
// Returns whether the placement was accepted, which the tap path needs in order
// to decide whether to clear its selection.
function commitPlacement(gameState, tileIndex, boardIndex) {
  const ui = window._gameUI;
  if (!ui) return false;
  if (!Number.isInteger(tileIndex) || tileIndex < 0
      || tileIndex >= gameState.pendingSweepTiles.length) return false;
  if (!Number.isInteger(boardIndex)) return false;
  if (!isEmptyCell(gameState, boardIndex) || isCellPending(boardIndex)) return false;

  if (!ui.placementMap) ui.placementMap = {};

  // MOVEMENT TWO, THE SETTLE (plan sections 7.1 and 13.1). It fires HERE, on the
  // provisional map gaining a key, and not at the batch commit: onPlacementSubmit
  // writes the engine's board seconds later and silently, and a cue that arrives
  // then is a cue that lies about what happened. Watching the provisional map is
  // also what MAKES THE TAP-BACK SILENT FOR FREE - unplaceTile deletes a key
  // rather than setting one, so there is nothing here to suppress.
  //
  // The source rect has to be read BEFORE the map is written, because the render
  // two frames from now removes the tray tile the flight starts from.
  const srcEl = document.querySelector(`#workingArea1 .working-tile[data-tile-index="${tileIndex}"]`);
  const srcRect = srcEl ? srcEl.getBoundingClientRect() : null;

  ui.placementMap[tileIndex] = boardIndex;
  // Deferred so the drop event finishes before the board is torn down and
  // rebuilt underneath it.
  requestAnimationFrame(() => updateGameDisplay(gameState));
  settle(gameState, tileIndex, boardIndex, srcRect);
  return true;
}

// FLIP, ZERO NAMES. The settle is the most finger-heavy movement in the game -
// up to five in a row, fast, with the finger still on the glass - and hit testing
// is redirected to the document element for the whole of a view transition. It is
// also the only one of the four movements with no exit: both ends are live nodes,
// which is the one case where FLIP is strictly cheaper.
//
// TWO CHANNELS, ONE EVENT. The buzz and the cue sit on the same two lines,
// through the same 120ms gate, because on Android haptic success cannot be
// detected and a build that suppressed one where it believed the other had fired
// would silently lose both.
function settle(gameState, tileIndex, boardIndex, srcRect) {
  if (!srcRect || !isHumanTurn(gameState)) return;
  const tile = gameState.pendingSweepTiles[tileIndex];
  if (!tile) return;
  const colourClass = getColourClass(tile.colour);
  // Two frames: commitPlacement queues its own render on the next one, so the
  // destination cell exists on the one after that.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const destEl = boardCell(0, boardIndex);
    if (!destEl) return;
    flyClone(srcRect, destEl.getBoundingClientRect(), {
      node: tileClone(tile, colourClass),
      duration: timings().settle,
    });
    // The destination fades up under the arriving clone. A CSS ANIMATION RATHER
    // THAN JS-DRIVEN OPACITY, which stage 7 established and which is load-bearing
    // twice over: an animation ends where the stylesheet says, so a re-render
    // mid-flight simply reveals the cell rather than leaving it stuck invisible;
    // and the screenshot harness freezes CSS animations to their END state, so a
    // timed carrier can never make a capture depend on when it was taken. It
    // reuses `fade-in` rather than adding a fifth keyframe set.
    destEl.classList.add('ft-tile--settling');
    if (gatePassed()) { haptic('land'); playCue('settle'); }
  }));
}

// The same idea for the cupcake move: one commit, shared by drag and (from
// Phase B) tap. The engine validates too, but it answers an illegal move with
// an alert(), so it is worth not asking.
function commitCupcakeMove(gameState, fromIndex, toIndex) {
  const ui = window._gameUI;
  if (!ui?.onMoveTile) return false;
  if (!Number.isInteger(fromIndex) || !Number.isInteger(toIndex)) return false;
  if (!isEmptyCell(gameState, toIndex)) return false;
  ui.onMoveTile(fromIndex, toIndex);
  return true;
}

// Remove a tile that has been placed this turn but not yet committed. There is
// no engine call here: the board is not written until handlePlacementDone runs,
// so un-placing is just forgetting the entry.
//
// This is worth having on the desktop too. Until now a misplaced tile could only
// be taken back with the whole-turn Undo, which also threw away the sweep.
function unplaceTile(gameState, boardIndex) {
  const ui = window._gameUI;
  if (!ui?.placementMap) return false;
  const entry = Object.entries(ui.placementMap).find(([, b]) => Number(b) === boardIndex);
  if (!entry) return false;
  delete ui.placementMap[entry[0]];
  requestAnimationFrame(() => updateGameDisplay(gameState));
  return true;
}

// ---------------------------------------------------------------------------
// THE TAP PATH (plan B1).
//
// Placement was drag-only, and HTML5 drag-and-drop does not exist on a touch
// screen. A tablet could sweep, could choose a colour, and then simply could not
// place the tiles - the game stopped at the placement step with no way forward.
// This is the reason the whole responsive plan needs a Phase B at all: every
// width below the desktop is unplayable without it.
//
// Select-then-place, which is the convention every touch board game uses:
//   tap a swept tile      -> select it
//   tap the same one      -> clear the selection
//   tap an empty cell     -> place the selected tile there
//   tap a ghost           -> take that tile back
// and in cupcake mode, tap a movable tile then tap where it should go.
//
// DRAG IS UNTOUCHED and both paths finish in commitPlacement/commitCupcakeMove,
// so the two can never diverge on what they permit. A mouse user can drag one
// tile and tap the next.
// ---------------------------------------------------------------------------
function setupTapToPlace(gameState) {
  const ui = window._gameUI;
  if (ui.tapSetupDone) return;

  const workingArea = document.getElementById('workingArea1');
  const playerBoard = document.getElementById('playerBoard1');
  if (!workingArea || !playerBoard) return;

  ui.tapSetupDone = true;

  const rerender = () => requestAnimationFrame(() => updateGameDisplay(ui.gameState || gameState));

  // Delegated, because updatePlayerBoards replaces the innerHTML of both of these
  // on every render - a listener bound to a tile would be pointing at a detached
  // node within one move.
  workingArea.addEventListener('click', (e) => {
    const tileEl = e.target.closest('.working-tile');
    if (!tileEl) return;
    const tileIndex = parseInt(tileEl.dataset.tileIndex, 10);
    if (!Number.isInteger(tileIndex)) return;
    ui.selectedTileIndex = ui.selectedTileIndex === tileIndex ? null : tileIndex;
    rerender();
  });

  playerBoard.addEventListener('click', (e) => {
    const state = ui.gameState || gameState;
    // An empty plate being removed is a different gesture with its own handler,
    // bound per-cell in updatePlayerBoards. Leave it alone or the removal fires
    // and then this tries to treat the same tap as a move destination.
    if (e.target.closest('[data-remove-plate-index]')) return;

    const boardIndex = boardIndexFromEvent(e);
    if (boardIndex === null) return;

    // A TILE IN HAND BEATS EVERY OTHER READING OF A BOARD TAP (10 August). The
    // player has bought nothing yet and the only thing they can do with it is put
    // it down, so this branch runs before the cupcake move and before the
    // placement path - and an occupied cell is simply not a destination, which
    // the highlighted empty cells already say.
    if (ui.extraTilePending !== null && ui.extraTilePending !== undefined) {
      ui.onExtraTilePlace?.(ui.extraTilePending, boardIndex);
      return;
    }

    if (ui.cupcakeMode) {
      // Source first, then destination. The source has to be a tile the engine
      // would actually let move, which is exactly what data-board-tile-index
      // marks - it is only emitted for a movable tile at an affordable price.
      const sourceEl = e.target.closest('[data-board-tile-index]');
      if (ui.cupcakeSource === null || ui.cupcakeSource === undefined) {
        if (!sourceEl) return;
        ui.cupcakeSource = parseInt(sourceEl.dataset.boardTileIndex, 10);
        rerender();
        return;
      }
      // Tapping the armed source again puts it down rather than moving it.
      if (sourceEl && parseInt(sourceEl.dataset.boardTileIndex, 10) === ui.cupcakeSource) {
        ui.cupcakeSource = null;
        rerender();
        return;
      }
      if (commitCupcakeMove(state, ui.cupcakeSource, boardIndex)) ui.cupcakeSource = null;
      else rerender();
      return;
    }

    if (state.gamePhase !== 'place') return;

    const armed = ui.selectedTileIndex !== null && ui.selectedTileIndex !== undefined;

    // A ghost is a tile placed this turn, and tapping it takes that tile back -
    // but ONLY when nothing is armed.
    //
    // Un-placing unconditionally is the obvious implementation and it is wrong:
    // with a tile in hand, one mis-aimed tap at an occupied cell both threw away
    // the tile you were holding AND lifted the one already sitting there, which
    // is two destructive surprises from a tap the player meant as a placement.
    // While a tile is armed the only cells marked as targets are the empty ones
    // (.ft-tile--tap-target), so a tap anywhere else should do exactly what the
    // board says it will do: nothing.
    if (!armed) {
      unplaceTile(state, boardIndex);
      return;
    }

    if (commitPlacement(state, ui.selectedTileIndex, boardIndex)) {
      ui.selectedTileIndex = null;
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

  const clearDropHighlight = () => {
    // Queried live, never cached. updatePlayerBoards replaces the board's
    // innerHTML on every render, so a NodeList captured at setup time points at
    // detached elements within a move or two and silently stops clearing
    // anything - which is how a stale highlight used to survive a re-render.
    playerBoard.querySelectorAll('.drag-over').forEach(t => t.classList.remove('drag-over'));
  };

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

  // ONE dragover listener doing both jobs. There used to be two - one calling
  // preventDefault to allow the drop, a second re-deriving the cell to paint the
  // highlight - which meant the hit-test ran twice per pointer move and could
  // disagree with the drop's own copy.
  playerBoard.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    clearDropHighlight();
    const boardIndex = boardIndexFromEvent(e);
    if (boardIndex === null) return;
    if (!isEmptyCell(gameState, boardIndex) || isCellPending(boardIndex)) return;
    e.target.closest('.board-tile').classList.add('drag-over');
  }, false);

  playerBoard.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    clearDropHighlight();

    const boardIndex = boardIndexFromEvent(e);
    if (boardIndex === null) return;

    // A board-to-board move (cupcake mode) rather than a placement.
    const boardTileFrom = e.dataTransfer.getData('boardTileFrom');
    if (boardTileFrom !== '') {
      commitCupcakeMove(gameState, parseInt(boardTileFrom, 10), boardIndex);
      return;
    }

    commitPlacement(gameState, parseInt(e.dataTransfer.getData('tileIndex'), 10), boardIndex);
  }, false);

  playerBoard.addEventListener('dragleave', (e) => {
    if (e.target === playerBoard) clearDropHighlight();
  }, false);
}

// Scoring breakdown for a player: cake-stand rows (cumulative value by tile
// count), crumb tray (1/tile), claimed card VP and the Tasting Menus. FOUR lines
// since 4 August - the ingredient objectives were deleted that morning and the
// flavour module has held the fourth slot ever since.
//
// A MENU IS A FLAT COUNT TIMES A FLAT VALUE, and that is only possible because
// both card shapes demand the same number of tiles - three since the deck was
// lightened on 5 August, four before it. It is a real simplification over the
// Teapot Track two modules back, which had to be accumulated as it was earned
// because what each removal paid depended on where the teapot stood at the time.
// Every menu is worth the same whenever it was taken, so this can multiply and be
// certain of agreeing with the engine.
//
// CUPCAKES ARE NOT IN THE TOTAL since 3 August - they score nothing and are the
// first tiebreaker instead. The count is still returned so the UI can show it,
// but it must not be added to `total`, which has to agree with the engine's
// calculateFinalScores exactly.
// IT TAKES THE GAME STATE AS WELL AS THE PLAYER since 6 August. The Flavour of the
// Day is scored off the board against an ingredient that lives on the state, so a
// player alone is no longer enough to mirror calculateFinalScores - and mirroring
// it exactly is this function's whole job. `gameState` is optional so a caller
// with only a player still gets every other lane rather than throwing.
function getScoreBreakdown(player, gameState = null) {
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
  const menus = (player.tastingMenus ? player.tastingMenus.length : 0) * TASTING_MENU_VP;

  // THE FLAVOUR OF THE DAY, split into its two clauses because the panel shows
  // them separately: a running per-tile total that is true at every moment of the
  // game, and a majority that is only provisional until the last turn. Both are
  // read LIVE off the board, so a player watching their own panel sees the count
  // move the moment they place a tile - and sees it drop the moment a claim
  // sacrifices one, which is exactly the feedback the module needs.
  const flavourTiles = (gameState && isFlavourInPlay(gameState)) ? getFlavourCount(gameState, player) : 0;
  const flavourLeading = (gameState && isFlavourInPlay(gameState))
    && getFlavourLeaders(gameState).includes(player.id);
  const flavour = flavourTiles * FLAVOUR_VP_PER_TILE + (flavourLeading ? FLAVOUR_MAJORITY_VP : 0);

  return {
    standTotal, crumbs, cardVP, cupcakes, menus,
    flavour, flavourTiles, flavourLeading,
    total: standTotal + crumbs + cardVP + menus + flavour,
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
  const { interactive = false, legalRows = null, own = false } = opts;

  let rowsHtml = '';
  for (let rowIndex = player.stand.length - 1; rowIndex >= 0; rowIndex--) {
    const row = player.stand[rowIndex];
    const isLegal = interactive && legalRows && legalRows.has(rowIndex);

    let slots = '';
    for (let k = 0; k < row.capacity; k++) {
      const tile = row.tiles[k];
      const filled = k < row.tiles.length;
      const plate = tile
        ? `<div class="ft-stand__plate ft-stand__plate--filled ${getColourClass(tile.colour)}"><img src="images/symbol-${tile.ingredient}-v3.png" class="ft-stand__symbol" alt="${tile.ingredient}"></div>`
        : `<div class="ft-stand__plate ft-stand__plate--empty"></div>`;
      // Cupcake plates (bottom[1], second[1], third[1], top[0]) grant a cupcake
      // when plated onto; mark them on the board whether empty or filled.
      const isCupcakePlate = CUPCAKE_PLATES.some(p => p.rowIndex === rowIndex && p.plateIndex === k);
      // "+" AND THE CUPCAKE ICON AT 10 (stage 2, plan section 8.7). This is the
      // one badge in the build that gets an icon while the two tile badges
      // (.ft-tile__menu's +N and .ft-tile__flavour's -1) deliberately do not,
      // and the difference is the unit. Those two are VICTORY points, like every
      // other number on the screen, so a signed number is already the right
      // glyph. "+1" here is the one number on the cake stand that is NOT victory
      // points, sitting directly above a column of numbers that are. The badge
      // is being disambiguated, not decorated, and the icon is the unit rather
      // than an ornament in front of it. 10px is the floor for the whole set,
      // and cupcake is the only drawing asked to go there: its wrapper flutes
      // are what identify it and they survive.
      const cupcakeMarker = isCupcakePlate
        ? `<span class="ft-stand__cupcake-plate" title="Cupcake plate - plating here gains 1 cupcake">+${cupcakeMark(10)}</span>`
        : '';
      slots += `
        <div class="ft-stand__slot">
          <div class="ft-stand__plate-wrap">${plate}${cupcakeMarker}</div>
          <div class="ft-stand__value ${filled ? 'ft-stand__value--earned' : ''}">${STAND_ROW_VALUES[rowIndex][k]}</div>
        </div>`;
    }

    const marker = row.ingredient
      ? `<img src="images/symbol-${row.ingredient}-v3.png" class="ft-stand__lock" alt="${row.ingredient}" title="Row locked to ${row.ingredient}">`
      : `<div class="ft-stand__lock ft-stand__lock--empty" title="Row not yet locked"></div>`;

    // NAMING THE COMPONENT. The rules, the Tasting Menus and the cards all say
    // "cake stand" and nothing on screen said it back. The label hangs off the
    // TOP row - one plate wide, so the widening tier leaves the most empty space
    // beside it - and is positioned out of flow, so it costs no vertical space
    // and does not shift the pyramid off centre. See .ft-stand__label.
    const label = rowIndex === player.stand.length - 1
      ? '<span class="ft-stand__label">Cake<br>stand</span>'
      : '';

    rowsHtml += `
      <div class="ft-stand__row ${isLegal ? 'ft-stand__row--legal' : ''}" ${isLegal ? `data-dest-row="${rowIndex}"` : ''}>
        ${label}${marker}
        <div class="ft-stand__plates">${slots}</div>
      </div>`;
  }

  // The crumb tray is always a legal destination during a claim.
  const crumbHtml = `
    <div class="ft-stand__crumbs ${interactive ? 'ft-stand__crumbs--legal' : ''}" ${interactive ? 'data-dest-crumb="1"' : ''}>
      <span>Crumb tray: <strong>${player.crumbTray.length}</strong></span>
      <span class="ft-stand__crumbs-note">1 pt each</span>
    </div>`;

  // THE ONE IRREVERSIBLE CHOICE IN THE GAME, SAID WHERE IT IS MADE (defect 17,
  // 9 August, stage 1). The first tile plated on a row locks that row to that
  // ingredient for the whole game, no other row may ever hold it, and four rows
  // against five ingredients means one ingredient can only ever reach the crumb
  // tray at a point each. The interface enforces it perfectly - only legal rows
  // highlight - and until now the only place that said so was the rules modal
  // and a `title` a phone cannot render.
  //
  // IT MOVES INTO THE STAND SHEET (stage 7). Stage 1 could only afford it in the
  // destination step, where it cost 33px of a canvas that had nowhere free to put
  // it; the plan's section 11.1 rule is that TEACHING GOES IN A SHEET, WHERE IT IS
  // FREE, AND NEVER ON THE CANVAS, WHERE IT IS NOT. Below 1149 this panel IS the
  // stand sheet - position: fixed, out of the page's flow entirely - so the line
  // is now permanent there and costs nothing at all, and the 33px comes back at
  // the destination step. Above the band it is display: none and the rules modal
  // carries it, which is the same rule applied to a screen that has no sheets.
  const lockNote = own
    ? `<p class="ft-stand__lock-note">Choosing an empty row locks it to that ingredient for the rest of the game.</p>`
    : '';

  return `<div class="ft-stand">${rowsHtml}${crumbHtml}${lockNote}</div>`;
}

// THE OPPONENT STAND, IN ONE LINE. Four lock symbols, each with a filled/capacity
// count, plus the crumb count (plan section 6.2, "Level 2").
//
// This exists to pay for something the colour-only opponent board takes away.
// Colour alone answers the main question you ask of another player - how close
// are they to claiming a card - because the reward cards ARE colour patterns. It
// cannot tell you what they could still PLATE, and that is genuinely strategic:
// each stand row locks to an ingredient, and an ingredient can only be plated
// once across the whole stand (game.js), so ingredient scarcity is real.
//
// The saving grace is that the lock is on the STAND, not the board - so the part
// worth acting on survives in the component it actually lives in, for about 24px
// of height, while the full stand costs ~170px of width and cannot shrink.
//
// Rendered for opponents at every width and hidden by CSS above the M band,
// where the full stand is still on show. No width logic in JavaScript, so no
// re-render on resize.
function renderStandSummary(player) {
  let rows = '';
  // Same top-to-bottom order as the stand itself, so a glance at the strip and a
  // glance at a full panel agree.
  for (let rowIndex = player.stand.length - 1; rowIndex >= 0; rowIndex--) {
    const row = player.stand[rowIndex];
    const full = row.tiles.length >= row.capacity;
    const marker = row.ingredient
      ? `<img src="images/symbol-${row.ingredient}-v3.png" class="ft-stand-mini__lock" alt="${row.ingredient}">`
      : `<span class="ft-stand-mini__lock ft-stand-mini__lock--empty"></span>`;
    const title = row.ingredient
      ? `Locked to ${row.ingredient} - ${row.tiles.length} of ${row.capacity} plated`
      : `Not yet locked - ${row.tiles.length} of ${row.capacity} plated`;
    rows += `
      <span class="ft-stand-mini__row ${full ? 'ft-stand-mini__row--full' : ''}" title="${title}">
        ${marker}<span class="ft-stand-mini__count">${row.tiles.length}/${row.capacity}</span>
      </span>`;
  }
  return `
    <div class="ft-stand-mini" aria-label="Cake stand summary">
      ${rows}
      ${/* THE CRUMB CHIP GETS ITS MARKER BACK, AND IT COSTS NOTHING (stage 2,
            plan section 8.7). Ticket 00 left this chip with no visible marker at
            all: four chips read 0/1 0/2 0/3 0/4 and the fifth read 0, told apart
            only by a tooltip a phone cannot show.

            It could not simply be given its label back. A "Crumbs n" text
            stand-in cost 245px of page height at 430, and this strip's
            max-content is what sizes an opponent seat: 26px of extra label takes
            two seats per row down to one and adds a whole seat row.

            What pays for the icon is the strip's column gutters, taken from 4px
            to 0 in style.css. Four gutters at 4px is 16px, and it existed only
            because the fifth chip had no leading graphic to separate it from the
            fourth. 12px of tray plus 2px of margin against 16px of gutter, and
            the strip comes out narrower than it was. Measured +0px at 360, 390,
            430 and 768. */ ''}
      <span class="ft-stand-mini__row" title="Crumb tray - 1 point each">
        ${icon('crumb-tray', 12, 'ft-stand-mini__tray')}<span class="ft-stand-mini__count">${player.crumbTray.length}</span>
      </span>
    </div>`;
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
    const bd = getScoreBreakdown(p, gameState);

    // The current human is picking a destination for a removed tile when
    // destinationChoices is set - make their own stand's legal spots clickable.
    const destinationMode = isCurrentPlayer && p.isHuman && Array.isArray(ui.destinationChoices);
    const legalRows = destinationMode
      ? new Set(ui.destinationChoices.filter(d => d.type === 'row').map(d => d.rowIndex))
      : null;

    // An opponent's panel loses its breakdown, its full stand and its cupcake
    // panel below 1400 - they cost width the strip does not have. These two are
    // what replace them, and both are hidden by CSS above the M band so the
    // wider layouts are untouched (plan 6.2).
    //
    // The cupcake count earns its place on the total line for one reason:
    // cupcakes score nothing, but they are the FIRST TIEBREAKER, so in a close
    // endgame the count is score-relevant. It is one number and the line is
    // already there.
    const isOpponentSeat = playerIdx !== 0;
    const oppCupcakes = isOpponentSeat
      ? `<span class="ft-score-total__cupcakes" title="Cupcakes held - they score nothing but break ties">Cupcakes ${bd.cupcakes}</span>`
      : '';

    // The Tasting Menu line appears ALWAYS, including on 0. A player who has not
    // taken a menu yet is exactly the player who needs reminding the race is
    // running - and unlike the module it replaced, a 0 here is not a temporary
    // state that the next pot of tea resets.
    //
    // IT SHOWS THE INGREDIENTS of each menu taken rather than only the total,
    // because "she took the two-lemon-two-chocolate one" is how players actually
    // talk about which cards have gone, and the number alone hides it.
    const menuLine = (p.tastingMenus && p.tastingMenus.length > 0)
      ? `<div class="ft-score-breakdown__item"><span>${p.tastingMenus.map(id => {
          const menu = TASTING_MENUS.find(m => m.id === id);
          if (!menu) return '';
          return Object.entries(menu.need).map(([ing, need]) =>
            `<img src="images/symbol-${ing}-v3.png" class="ft-score-breakdown__symbol" alt="${ing}" title="${need} x ${ingredientLabel(ing)}">`).join('');
        }).join(' ')} Tasting Menus</span><strong>${bd.menus}</strong></div>`
      : `<div class="ft-score-breakdown__item"><span>Tasting Menus</span><strong>0</strong></div>`;

    // THE FLAVOUR OF THE DAY line, on every panel including an opponent's - the
    // whole module is a contest and the only way to see where you stand in it is to
    // see everybody's number. It shows the SYMBOL, the TILE COUNT and, when this
    // player holds the most, the majority they are currently owed.
    //
    // The count is the honest figure to lead with rather than the VP: the tiles are
    // on the board in front of the player, and "you have four" is what they can
    // check. The majority chip is marked as provisional in its tooltip because it
    // is not settled until the game ends.
    const flavourLine = isFlavourInPlay(gameState)
      ? `<div class="ft-score-breakdown__item"><span><img src="images/symbol-${gameState.flavourOfTheDay}-v3.png" class="ft-score-breakdown__symbol" alt="${gameState.flavourOfTheDay}" title="Flavour of the Day: ${ingredientLabel(gameState.flavourOfTheDay)}"> Flavour${bd.flavourLeading ? ` <span class="ft-score-breakdown__lead" title="Currently holds the most - worth ${FLAVOUR_MAJORITY_VP} VP at the end, and shared if the lead is level">most +${FLAVOUR_MAJORITY_VP}</span>` : ''} <span class="ft-score-breakdown__sub">${bd.flavourTiles} on board</span></span><strong>${bd.flavour}</strong></div>`
      : '';

    // THE SHEET HEAD (stage 6, plan section 3.1). Your own score column and your
    // cupcake supply are the model's two sheets on this panel, and each carries
    // its own 56px chrome - a grab handle, a title and Close. Both are
    // `display: none` above 1149, so nothing on a desktop knows they exist; the
    // markup is emitted unconditionally so no render path has to consult a media
    // query. Labelled Close and not Done, because nothing has been done.
    const sheetHead = (title) => playerIdx !== 0 ? '' : sheetHeadHTML(title);

    // THE COLLAPSED OPPONENT ROW'S READOUTS (stage 7, plan section 4.4). Six
    // facts on one 44px full-width row, and the row is the tap target.
    //
    // THEIR BOARD FILL IS THE ONE THAT EARNS ITS PLACE. The rail's board-fill
    // chip says how full the FULLEST board is and says nothing about whose; this
    // is the complementary half, and it is the only opponent fact that is a
    // clock on everybody rather than a fact about that player's score.
    //
    // (A RESERVED-CARD COUNT sat in this row while a player held any. The
    // reserve is deleted - 11 August - so the row is one stat shorter and the
    // layout's one unbounded term is gone with it.)
    //
    // Every glyph is backed by a visually hidden word, because a `title` is not
    // reachable on a phone and no icon in this set is ever the accessible name of
    // anything.
    const seatRow = !isOpponentSeat ? '' : (() => {
      const filled = p.board.length - p.board.filter(c => c === null).length;
      return `
      <div class="pm-seat-row">
        <span class="pm-seat-row__stat pm-seat-row__stat--score"><span class="ft-sr-only">Score </span>${bd.total}</span>
        <span class="pm-seat-row__stat">${cupcakeMark(12)}<span class="ft-sr-only">cupcakes </span>${bd.cupcakes}</span>
        <span class="pm-seat-row__stat">${icon('grid', 12)}<span class="ft-sr-only">board filled </span>${filled}/${p.board.length}</span>
        <span class="pm-seat-row__more" aria-hidden="true">${icon('arrow-right', 12)}</span>
      </div>`;
    })();

    let html = `
      ${sheetHead('Your score and cake stand')}
      ${seatRow}
      <div class="ft-score-total">Total: ${bd.total}${oppCupcakes}</div>
      <div class="ft-score-breakdown">
        <div class="ft-score-breakdown__item"><span>Cake stand</span><strong>${bd.standTotal}</strong></div>
        <div class="ft-score-breakdown__item"><span>Crumbs</span><strong>${bd.crumbs}</strong></div>
        <div class="ft-score-breakdown__item"><span>Card VP</span><strong>${bd.cardVP}</strong></div>
        ${menuLine}
        ${flavourLine}
      </div>
      ${destinationMode ? `<div class="ft-stand__prompt">Choose where this tile goes ${icon('arrow-down', 16)}</div>` : ''}
      ${renderStand(p, { interactive: destinationMode, legalRows, own: !isOpponentSeat })}
      ${isOpponentSeat ? renderStandSummary(p) : ''}
    `;

    const cupcakeCount = p.cupcakes;
    // The two BOARD SPENDS - move a tile (MOVE_TILE_CUPCAKE_COST) or return an
    // empty plate to the box (REMOVE_PLATE_CUPCAKE_COST). Both open the same
    // board-spend mode and the engine prices and gates the actual cell on the
    // tap, which is why they share ui.cupcakeMode; they are two chips because
    // they are two prices and two allowances.
    const canMoveTile = p.cupcakes >= MOVE_TILE_CUPCAKE_COST && !gameState.moveUsedThisTurn;
    const canClearPlate = canRemovePlate(gameState);
    const canMoveTileNow = isCurrentPlayer && gameState.gamePhase === 'spend' && canMoveTile;
    const canClearPlateNow = isCurrentPlayer && canClearPlate;
    const canUseCupcakes = canMoveTileNow || canClearPlateNow;
    const cupcakeClass = ui.cupcakeMode ? 'ft-cupcake-supply--active' : '';
    // The other three paid options, so a player can see the whole menu in one
    // place rather than discovering them phase by phase.
    const canDeal = isCurrentPlayer && canDealCards(gameState);
    const canBuyTile = isCurrentPlayer && canBuyExtraTile(gameState);

    // -----------------------------------------------------------------------
    // THE SPEND MENU AS A GRID OF CHIPS - Dean's decision 1 of 10/08/2026, and
    // the settlement of plan defect 13.
    //
    // The defect: this panel measured 409px of content against a 280px
    // half-sheet cap at 360, and the cap is not negotiable because two of the
    // spends are played by tapping your own board THROUGH the open sheet. The
    // cap is right and the content did not fit it, so the panel is what gives.
    //
    // Three things went, and between them they are the 409:
    //   - THE THREE EXPLANATORY SENTENCES, about 120px of the panel at 360.
    //     They move to the rules modal, which already carries every one of them
    //     under "3. Spend Cupcakes" and "1. Sweep". What stays behind is STATE
    //     rather than explanation: how many extra tiles have been bought, and
    //     whether the deal has been taken.
    //   - THE ROW OF PER-CUPCAKE BUTTONS. They were the only way into
    //     board-spend mode, and at twelve cupcakes - the engine's own 1,500-game
    //     maximum - twelve 36px buttons wrap to three rows. The two board spends
    //     are chips of their own now, so the supply becomes what it always
    //     described: a count.
    //   - THE PRICES OUT OF THE NAMES. A price is a column, not a suffix.
    //
    // SIX CHIPS, THREE ROWS OF TWO, and the sixth is derived rather than typed:
    // a further claim is for sale at getExtraClaimCupcakeCost(), and the A/B
    // seam can still swing that back to "one claim per turn", at which point
    // there are five spends and five chips. The rules modal counts them the same
    // way, from the same call, so the two cannot drift.
    //
    // FIVE CHIPS ARE CONTROLS AND THE SIXTH IS NOT. A further claim is taken by
    // tapping a card during the claim step, so there is no button to press here
    // and a permanently disabled one would be a lie. It is a chip that states a
    // price, which is the one thing about it a player cannot see anywhere else.
    const extraClaimCost = getExtraClaimCupcakeCost();
    // A FURTHER CLAIM IS ONLY IN PLAY ONCE ONE CLAIM HAS BEEN MADE (10 August,
    // Dean). The chip states a price nobody is being asked to pay until then -
    // the first claim of every turn is free - and it was drawn at full strength
    // beside five chips that grey themselves out when they are unavailable, so
    // it read as the one live option in a menu where nothing was live.
    //
    // The engine's own two conditions, not a proxy for them: claim() leaves the
    // phase at 'claim' only while a further claim can still be BOUGHT, and drops
    // to 'refill' the moment the player cannot pay for one. So "claims made and
    // still in the claim step" is exactly "you may buy another right now", and
    // the chip lights for precisely as long as that is true.
    const extraClaimLive = isCurrentPlayer
      && gameState.claimsThisTurn > 0
      && gameState.gamePhase === 'claim';
    // The price is drawn as an aria-hidden cupcake and a numeral, so the
    // accessible name has to say it in words - no icon in this set is ever the
    // accessible name of anything, and "Clear an empty plate 3" is not a price.
    const spendChip = ({ id, name, price, live, armed, title }) => `
            <button class="ft-cupcake-spend-btn ft-spend-chip${armed && live ? ' ft-cupcake-spend-btn--active' : ''}"
                    ${id ? `id="${id}"` : ''} type="button" ${live ? '' : 'disabled'}
                    aria-label="${name} - ${cupcakePrice(price)}" title="${title}">
              <span class="ft-spend-chip__name">${name}</span>
              <span class="ft-spend-chip__price">${cupcakeMark(SPEND_CUPCAKE_ICON)}<span class="ft-spend-chip__n">${price}</span></span>
            </button>`;

    const extraTilesBought = gameState.extraTilesBoughtThisTurn || 0;
    // What is left of the notes: two statements of fact, each one line, each
    // present only while it is true. Neither explains a control.
    const spendStateLines = [
      extraTilesBought > 0
        ? `<span class="ft-cupcake-note">${extraTilesBought} extra tile${extraTilesBought === 1 ? '' : 's'} bought this turn</span>` : '',
      gameState.cardsDealtThisTurn ? `<span class="ft-cupcake-note">Cards dealt this turn</span>` : '',
    ].filter(Boolean);
    // One wrapper rather than three siblings, so three simultaneous statements
    // cost one gap instead of three inside a sheet with 76px of slack.
    const spendState = spendStateLines.length
      ? `<div class="ft-cupcake-state">${spendStateLines.join('')}</div>` : '';

    html += `
      <div class="ft-cupcake-supply ${cupcakeClass}" id="cupcakeSupply${playerIdx + 1}">
        ${sheetHead('Spend cupcakes')}
        <div class="ft-cupcake-header">
          <span class="ft-cupcake-label">Cupcakes</span>
          <span class="ft-cupcake-count">
            ${cupcakeMark(18)}
            <strong>${cupcakeCount}</strong>
          </span>
        </div>
        ${isCurrentPlayer && p.isHuman ? `
          <div class="ft-cupcake-spends">
            ${spendChip({ id: 'moveTileBtn', name: 'Move a tile', price: MOVE_TILE_CUPCAKE_COST,
                          live: canMoveTileNow, armed: ui.cupcakeMode,
                          title: 'At the spend step, once per turn: move one of your tiles to an empty cell on your board.' })}
            ${spendChip({ id: 'clearPlateBtn', name: 'Clear an empty plate', price: REMOVE_PLATE_CUPCAKE_COST,
                          live: canClearPlateNow, armed: ui.cupcakeMode,
                          title: 'At the spend step, once per turn: return one empty plate from your board to the box, freeing that cell.' })}
            ${spendChip({ id: 'buyExtraTileBtn', name: 'Extra market tile', price: EXTRA_TILE_CUPCAKE_COST,
                          live: canBuyTile, armed: ui.extraTileMode,
                          title: 'At the spend step, as often as you can pay: take any one tile from the market and place it on your board.' })}
            ${spendChip({ id: 'dealCardsBtn', name: `Deal ${CARDS_PER_DEAL} new cards`, price: DEAL_CARDS_CUPCAKE_COST,
                          live: canDeal, armed: false,
                          title: `At the spend step, once per turn: deal ${CARDS_PER_DEAL} new cards onto the card row. You may claim one of them this turn.` })}
            ${extraClaimCost === null ? '' : `
            <span class="ft-cupcake-spend-btn ft-spend-chip ft-spend-chip--note${extraClaimLive ? ' is-live' : ''}"
                  aria-label="Complete another card - ${cupcakePrice(extraClaimCost)}"
                  title="At the claim step: your first claim is free, and each further one costs ${cupcakePrice(extraClaimCost)}. Taken by tapping the card.">
              <span class="ft-spend-chip__name">Complete another card</span>
              <span class="ft-spend-chip__price">${cupcakeMark(SPEND_CUPCAKE_ICON)}<span class="ft-spend-chip__n">${extraClaimCost}</span></span>
            </span>`}
          </div>
          ${spendState}` : ''}
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

    // The sheet head's Close, on your own panel only. It is the same close for
    // both sheets on it, because only one is ever open.
    statsEl.querySelectorAll('[data-pm-close]').forEach(btn => {
      btn.addEventListener('click', () => closeSheet());
    });
    if (playerIdx === 0) {
      statsEl.querySelectorAll('.pm-sheet-head').forEach(head => attachSheetSwipe(head, closeSheet));
    }

    // BOTH BOARD-SPEND CHIPS OPEN THE SAME MODE, and that is the engine's shape
    // rather than a shortcut: cupcakeMode arms your board, and the cell you then
    // tap decides which of the two spends you are making and what it costs. The
    // chips are separate because the prices and the allowances are.
    if (isCurrentPlayer && canUseCupcakes && ui.onCupcakeClick) {
      ['#moveTileBtn', '#clearPlateBtn'].forEach(sel => {
        const btn = statsEl.querySelector(`${sel}:not([disabled])`);
        if (btn) btn.addEventListener('click', () => ui.onCupcakeClick());
      });
    }

    // The extra tile ARMS the market and waits for a second click (onExtraTile),
    // which is why it needs a toggle at all.
    //
    // AND IT GETS THE SHEET OUT OF THE WAY OF THE MARKET (10 August). On the
    // phone this panel IS a sheet and the tile market is at the top of the page,
    // underneath it. Leaving it open would recreate, one step later, exactly the
    // friction that moved this spend to the spend step in the first place: arm
    // the option, then work out for yourself that the menu is in the way.
    // See revealSpendTarget - it is a no-op above 1149, where the panel is a rail
    // and nothing is covering anything.
    if (canBuyTile && ui.onExtraTileToggle) {
      const btn = statsEl.querySelector('#buyExtraTileBtn');
      if (btn) btn.addEventListener('click', () => {
        revealSpendTarget('.ft-market-wrap');
        ui.onExtraTileToggle();
      });
    }
    // No toggle and no armed mode: unlike the other spend buttons here, this one
    // IS the action - there is nothing for the player to pick afterwards.
    if (canDeal && ui.onDealCards) {
      const btn = statsEl.querySelector('#dealCardsBtn');
      if (btn) btn.addEventListener('click', () => ui.onDealCards());
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

  // THE FULLEST BOARD - the game's clock since 6 August. Cells used on whichever
  // board is closest to full, out of 25; at 25 the ending is armed and the round
  // is played out. This read totalClaimed / cardsNeededToEnd until that day, which
  // was the deleted empty-plate pool - the meter had stopped tracking anything.
  const cardProgressBar = document.getElementById('cardProgressBar');
  const cardProgressText = document.getElementById('cardProgressText');
  if (cardProgressBar && cardProgressText) {
    const total = gameState.players[0].board.length;
    const fullest = Math.max(...gameState.players.map(
      p => total - p.board.filter(c => c === null).length
    ));
    cardProgressBar.style.width = Math.min((fullest / total) * 100, 100) + '%';
    cardProgressText.textContent = `${fullest}/${total}`;
  }
}

function updatePhaseControls(gameState) {
  const controls = document.getElementById('phaseControls');
  if (!controls) return;

  const player = gameState.players[gameState.currentPlayerIndex];
  if (!player.isHuman) {
    // THE ONE-LINE LOG TAKES THE BAR (stage 8, plan section 7.5). Motion cannot
    // say WHICH, and the single most important fact of an opponent's sweep is
    // the declaration - pink, or lemon - which no flight carries. The bar was
    // hidden outright on a bot's turn, so this is the slot the line was always
    // meant to have: it is addressed to a player who has nothing to do, it
    // carries no controls, and IT COSTS NO PAGE HEIGHT - below 1400 the bar is
    // position: fixed on its own dock reserve, and above it the column is
    // already sized for the bar it shows on your own turn. It persists until the
    // next action replaces it rather than timing out, so a player who looked
    // away can still read it, and it never speaks on your own turn.
    const line = currentLine();
    if (!line) {
      controls.classList.add('ft-hidden');
      return;
    }
    controls.classList.remove('ft-hidden');
    controls.innerHTML = `
      <div class="ft-phase-bar">
        <div class="ft-phase-bar__text">
          <div class="ft-phase-bar__instruction"></div>
        </div>
      </div>`;
    return;
  }

  controls.classList.remove('ft-hidden');
  // A `cupcakeHint` line stood here until 4 August. Two things were wrong with it
  // and the second is why it is deleted rather than relocated:
  //   - it described the cupcake panel's controls from the phase bar, which is
  //     what plan section 5.4 moves beside the control instead;
  //   - it was gated on `gamePhase === 'spend'`, yet the only places it was
  //     interpolated were the SWEEP and CLAIM branches. It has therefore rendered
  //     as an empty string in every one of them for as long as it has existed.
  // Its surviving content - the cupcake count and what a cupcake buys - is on the
  // panel, beside the buttons that spend them.
  const ui = window._gameUI;
  const canUndo = ui?.canUndo === true;
  const undoBtn = canUndo ? `<button id="undoBtn" class="ft-btn ft-btn--secondary ft-btn--small ft-btn--undo">${icon('undo', 16)} <span class="ft-btn__label">Undo</span></button>` : '';

  // THE BAR IS ONE ROW ON A PHONE (stage 6, plan section 3.5), compacted from
  // three, and this wrapper is what makes that a layout rather than a rewrite:
  // the instruction and the status figure become ONE column that shares the row
  // with the controls, instead of two rows above them. Above 1149 it is
  // `display: contents`, so the desktop bar renders exactly as it did - the two
  // children are still block-level siblings carrying their own margins.
  const barText = (instruction, status = '') =>
    `<div class="ft-phase-bar__text">
          <div class="ft-phase-bar__instruction">${instruction}</div>
          ${status}
        </div>`;

  // THE SHEET OPENER. The phase bar's own button is the way into the spend
  // sheet, so a step that has no sheet simply never shows the pair - which is
  // what makes a vanished step invisible. It is `display: none` above 1149,
  // where the panel is on the canvas and there is no sheet to open.
  //
  // ITS CONDITION IS NOT "the spend phase", AND THAT IS A PLAN DEFECT rather
  // than a liberty. Plan section 3.2 gives the place phase no sheet at all, and
  // section 3.1 counts FIVE spends - but the extra tile was restored on
  // 9 August and canBuyExtraTile gates on `gamePhase === 'place'`, so on a
  // phone the sixth spend would be unbuyable for the whole game. The button
  // follows the engine: it appears wherever a spend is legal.
  //
  // IT IS THE ICON ALONE, with the word as its accessible name. Measured at 360:
  // the bar's inner width is 320px, three buttons and their gaps take 234 of it,
  // and the instruction then has 86px - two lines of about fourteen characters,
  // which ellipsises "Tap a tile, then tap a space". The command line is what
  // the bar is FOR, so the word that costs it seventy pixels comes off the one
  // control whose glyph is the game's own currency - and in the spend step the
  // instruction beside it already reads "Spend cupcakes (optional)".
  const spendable = gameState.gamePhase === 'spend' || canBuyExtraTile(gameState);
  const spendSheetBtn = spendable
    ? `<button id="openSpendSheet" type="button" class="ft-btn ft-btn--secondary ft-btn--small ft-btn--sheet" aria-label="Spend cupcakes" title="Spend cupcakes">${cupcakeMark(16)}<span class="ft-btn__label"> Cupcakes</span></button>`
    : '';
  let html = '';

  if (gameState.gamePhase === 'sweep' && gameState.bonusTileAvailable) {
    html = `
      <div class="ft-phase-bar">
        ${barText('Bonus tile available!', `<div class="ft-phase-bar__status success">${clickVerb()} any market tile to claim it</div>`)}
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
    // THE ONE-TEAPOT-AWAY WARNING USED TO BE HERE. It moved to the tea gauge on
    // 4 August (plan section 5.4), which already carries the count it is talking
    // about - see updateTeaOption. The bar keeps the command and nothing else.
    html = `
      <div class="ft-phase-bar">
        ${barText('Sweep a row or column above')}
        <div class="ft-phase-bar__controls">
          ${undoBtn}
        </div>
      </div>
    `;
  } else if (gameState.gamePhase === 'place') {
    const placementCount = ui.placementMap ? Object.keys(ui.placementMap).length : 0;
    // THE TRIM RULE (6 August). "All placed" is not "all swept" any more - it is
    // as many as the board has room for. getSweepPlacementCount is the engine's
    // own answer, so the Done button and place() cannot disagree about it.
    const required = getSweepPlacementCount(gameState);
    const goingBack = gameState.pendingSweepTiles.length - required;
    const allPlaced = placementCount === required;

    // THE EXTRA-TILE OFFER USED TO BE HERE, and it is the single reason this bar
    // measured 200px during placement: at a 246px-wide column that one sentence
    // wrapped to four rows. It moved beside the "+1 tile from the market" button
    // on 4 August (plan section 5.4) - see updatePlayerScores.
    //
    // "Placed: n/m" stays, because it is part of the command rather than coaching:
    // it is the readout for the Done button sitting next to it.
    // The instruction changes when the board cannot take everything, because the
    // player then has a DECISION rather than a chore: which tiles to keep. The
    // ones they leave in the tray are the ones that go back into the bag, so the
    // bar has to say that before they press Done.
    //
    // 9 AUGUST (ticket 00 / finding 05): the verb branches on the input. "Drag"
    // named a gesture that does not exist on a touch device - HTML5 drag-and-drop
    // never fires there - while the tap path has been implemented in this file
    // since Phase B and was the only thing that worked. A player was being told
    // to do the one thing they could not do.
    //
    // 10 AUGUST (stage 6): the overflow line is SHORTER, because a one-row bar
    // is what it now has to fit into. It said "Not enough room - place 3, and
    // the other 2 go back into the bag" - sixty-two characters against a text
    // column of about 200px at 360, which is four lines and a bar half again as
    // tall as its dock. Plan section 16 licenses exactly this: the bar is
    // compacted rather than split, and "its long lines are largely deleted".
    // Nothing is lost - the count is in the status beside it and the
    // consequence is printed on the button that commits it.
    const placeInstruction = goingBack > 0
      ? `Place ${required}, the other ${goingBack} go back`
      : (isTouchInput() ? 'Tap a tile, then tap a space' : 'Drag tiles onto your board');
    html = `
      <div class="ft-phase-bar">
        ${barText(placeInstruction, `<div class="ft-phase-bar__status">Placed: <strong>${placementCount}/${required}</strong></div>`)}
        <div class="ft-phase-bar__controls">
          ${undoBtn}
          ${spendSheetBtn}
          <!-- ONE LABEL, NOT TWO. "Done - return the rest" measured 177px of a
               344px bar at 360 and left the instruction 83px, which ellipsised
               the command. It was also the same fact twice: the line beside it
               already names the number that goes back. -->
          <button id="placementDone" class="ft-btn ft-btn--primary ft-btn--small" ${!allPlaced ? 'disabled' : ''}>Done</button>
        </div>
      </div>
    `;
  } else if (gameState.gamePhase === 'spend') {
    // The 'move' phase became 'spend' on 3 August: it hosts four paid options
    // now (extra tile, deal 2 cards, move a tile, remove an empty plate), not
    // just the move. The paid reserve was a fifth until 11 August.
    // THREE lines used to stand here - the priced menu of options, the reserve
    // note, and a cupcake-count hint - and all three described controls that are
    // in the cupcake panel. They moved there on 4 August (plan section 5.4).
    //
    // The priced menu is not relocated but DELETED: it listed "move a tile (1🧁),
    // remove an empty plate (3🧁), reserve a card (1🧁)", and every one of those
    // prices is already printed on the button that charges it. It was a third
    // copy of the same text, after the phase bar's own cupcake hint and the
    // panel's help line.
    const moveOptions = gameState.moveUsedThisTurn
      ? `You've used your move for this turn`
      : `Spend cupcakes (optional)`;

    // A TILE IN HAND TAKES OVER THE BAR (10 August). The extra tile is bought and
    // placed in one action at this step, so between the two taps the player is
    // holding something, and the one thing the bar must say is where it goes. It
    // borrows the claim step's destination wording for the same situation, and
    // Cancel is offered because a market tile lifted by mistake must be
    // droppable - nothing has been paid for until the cell is named.
    const holdingExtraTile = ui.extraTilePending !== null && ui.extraTilePending !== undefined;

    html = holdingExtraTile ? `
      <div class="ft-phase-bar">
        ${barText('Choose where this tile goes', `<div class="ft-phase-bar__status success">${clickVerb()} a lit cell on your board</div>`)}
        <div class="ft-phase-bar__controls">
          <button id="cancelExtraTile" class="ft-btn ft-btn--secondary ft-btn--small">Cancel</button>
        </div>
      </div>
    ` : `
      <div class="ft-phase-bar">
        ${barText(moveOptions)}
        <div class="ft-phase-bar__controls">
          ${undoBtn}
          ${spendSheetBtn}
          <button id="movePhaseNext" class="ft-btn ft-btn--primary ft-btn--small">Next</button>
        </div>
      </div>
    `;
  } else if (gameState.gamePhase === 'claim') {
    const currentPlayer = gameState.players[gameState.currentPlayerIndex];

    if (Array.isArray(ui.destinationChoices)) {
      html = `
        <div class="ft-phase-bar">
          ${barText('Choose a destination for the removed tile', `<div class="ft-phase-bar__status success">${clickVerb()} a lit row or the crumb tray</div>`)}
          <div class="ft-phase-bar__controls">
            <button id="cancelClaim" class="ft-btn ft-btn--secondary ft-btn--small">Cancel</button>
          </div>
        </div>
      `;
    } else if (ui.removableTiles && ui.removableTiles.length > 0) {
      html = `
        <div class="ft-phase-bar">
          ${barText('Select a tile to remove', `<div class="ft-phase-bar__status danger">${clickVerb()} a highlighted tile</div>`)}
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
            ${barText('No patterns match')}
            <div class="ft-phase-bar__controls">
              ${undoBtn}
              <button id="skipClaim" class="ft-btn ft-btn--secondary ft-btn--small">Skip Claim</button>
            </div>
          </div>
        `;
      } else {
        // THE PRICE HAS TO BE ON THE BUTTON, NOT IN THE BOOK (§6, 9 August). A
        // player who has already claimed is being offered something the game has
        // spent every previous version refusing them, so the phase bar must say
        // both that a further card is available AND what it costs - a bar that
        // still reads "Click a card to claim it" would be read as the first claim
        // repeating itself, and the cupcake would come as a surprise.
        const extraCost = getExtraClaimCupcakeCost();
        const isFurther = gameState.claimsThisTurn > 0 && extraCost !== null;
        const instruction = isFurther
          ? `${clickVerb()} another card to claim it - ${extraCost} cupcake${extraCost === 1 ? '' : 's'}`
          : `${clickVerb()} a card to claim it`;
        // Their first claim was free; this names what the next one costs against
        // what they hold, which is the comparison the decision actually needs.
        // 10 AUGUST (stage 6): "- or skip and end your turn" comes off. The
        // Skip Claim button is the next thing in the bar and says it better; on
        // a one-row bar the sentence was ellipsised at 360 and the comparison
        // the decision actually needs - what you hold against what it costs -
        // is the half that was being cut.
        const status = isFurther
          ? `<div class="ft-phase-bar__status">You have ${currentPlayer.cupcakes} cupcake${currentPlayer.cupcakes === 1 ? '' : 's'}</div>`
          : '';
        html = `
          <div class="ft-phase-bar">
            ${barText(instruction, status)}
            <div class="ft-phase-bar__controls">
              ${undoBtn}
              <button id="skipClaim" class="ft-btn ft-btn--secondary ft-btn--small">Skip Claim</button>
            </div>
          </div>
        `;
      }
    }
  } else if (gameState.gamePhase === 'refill') {
    // Say WHY the claim step has closed, on the turn where it actually binds, so a
    // player looking for another card reads the rule rather than concluding the
    // cards have stopped working. Clicking a card says the same thing (see
    // updateCardMarket, which shares furtherClaimMessage with this).
    //
    // Reaching 'refill' with a claim already made means one of two things, and
    // since 9 August it is almost always the second: the control rule is live and
    // allows only one claim, or the player cannot afford another card.
    const claimUsed = gameState.claimsThisTurn > 0
      ? `<div class="ft-phase-bar__status">${
          getExtraClaimCupcakeCost() === null
            ? 'Only one claim per turn'
            : 'No cupcakes left'
        }</div>`
      : '';
    html = `
      <div class="ft-phase-bar">
        ${barText('Turn complete', claimUsed)}
        <div class="ft-phase-bar__controls">
          ${undoBtn}
          <button id="confirmTurn" class="ft-btn ft-btn--primary ft-btn--small">Confirm Turn ${icon('arrow-right', 16)}</button>
        </div>
      </div>
    `;
  }

  controls.innerHTML = html;

  // The sheet opener. It toggles, so the same button both shows and dismisses
  // the sheet - which is what a held control means, and the route a player finds
  // without being told.
  const spendSheetEl = controls.querySelector('#openSpendSheet');
  if (spendSheetEl) {
    spendSheetEl.addEventListener('click', () => toggleSheet('spend'));
  }

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

  // Putting the lifted tile back. Nothing has been paid for at this point - the
  // charge happens in takeExtraTile, which needs the cell - so cancelling is a
  // pure state reset and the market tile is still sitting where it was.
  const cancelExtraTileBtn = controls.querySelector('#cancelExtraTile');
  if (cancelExtraTileBtn && gameState.gamePhase === 'spend') {
    cancelExtraTileBtn.addEventListener('click', () => {
      window._gameUI.extraTilePending = null;
      updateGameDisplay(gameState);
    });
  }

}

// THE TRIM RULE (6 August) changes the shape of this array. place() pairs
// placements[i] with pendingSweepTiles[i] BY INDEX, and a NULL entry means "this
// tile goes back into the bag" - so the array is always one entry per swept tile
// and the unplaced ones are nulls rather than gaps. It used to be a dense list of
// the placed cells only, which was the same thing while every tile had to fit.
//
// The player's choice of WHICH tiles to give up is simply the ones they left in
// the working tray; nothing extra has to be collected here.
function handlePlacementDone(e) {
  const ui = window._gameUI;
  if (!ui) return;

  const gameState = ui.gameState;
  const placements = [];
  for (let i = 0; i < gameState.pendingSweepTiles.length; i++) {
    const cell = ui.placementMap ? ui.placementMap[i] : undefined;
    placements.push(cell === undefined ? null : cell);
  }
  // As many as the board can take - fewer is illegal, and place() would refuse it.
  const placed = placements.filter(p => p !== null).length;
  if (placed === getSweepPlacementCount(gameState)) {
    ui.onPlacementSubmit(placements);
    ui.placementMap = {};
    // The tap selection is scoped to this placement step. Leaving it set would
    // arm a tile index that no longer refers to anything.
    ui.selectedTileIndex = null;
  }
}

function showRemovalUI(gameState, cardId) {
  const player = gameState.players[gameState.currentPlayerIndex];
  // Card lookup mirrors claim(): the shared row and nothing else, since the
  // personal reserve was deleted on 11 August.
  const card = gameState.cardMarket.find(c => c.id === cardId) || null;
  if (!card) {
    showToast('Card not found');
    return;
  }
  const matches = getPatternMatches(player.board, card.pattern);

  if (matches.length === 0) {
    showToast('Pattern not found');
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

// THE ONE renderer for a reward card, wherever it appears - the card row today,
// anywhere later. (It also drew the "on order" reserve slot until 11 August.)
//
// It used to compute background-position and background-size in pixels from a
// display height, and updateCardMarket carried a second copy of the same maths
// for the market row. Both are gone (plan A5): all that is emitted now is the
// card's ADDRESS on the sprite sheet as two custom properties, and
// .card-market-sprite does the geometry in percentages. That is what lets a
// media query resize the cards - the old pixel values could not be overridden
// by CSS at any specificity, because they were already in a style attribute.
//
// `height` is normally left alone, so the card takes --card-height and follows
// the responsive bands. Pass a value only where a card is deliberately a fixed
// size regardless of band. (The reserve slot was the only such caller and it is
// deleted, so nothing passes one today - the parameter is kept for the next.)
// `badge` is gone with the teapot glyph it drew - see the note where the badge
// used to be emitted.
function cardSpriteHTML(card, height = null, { extraClass = '', clickable = false } = {}) {
  const CARDS_PER_ROW = 10;
  const col = (card.id - 1) % CARDS_PER_ROW;
  const row = Math.floor((card.id - 1) / CARDS_PER_ROW);

  const style = [
    `--sprite-col: ${col}`,
    `--sprite-row: ${row}`,
    height === null ? '' : `--card-height: ${typeof height === 'number' ? `${height}px` : height}`,
    clickable ? 'cursor: pointer' : '',
  ].filter(Boolean).join('; ');

  return `
    <div data-card-id="${card.id}" class="card-market-sprite ft-card ${extraClass}" style="${style}">
      <div class="ft-card__vp" title="${card.vp} victory point${card.vp === 1 ? '' : 's'}">${card.vp}</div>
      ${/* The teapot badge is DELETED rather than replaced (9 August, ticket 00 /
            finding 07). It only ever appeared inside the reserve slot, which
            carries an "On order" label directly above it, so the glyph was the
            second telling and nothing is lost with it gone. */ ''}
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

// DEFECT 8 (10 August). This used to be getColourCSS(), which returned a CSS
// colour that all six of its callers wrote straight into an inline
// style="background-color: ...". AN INLINE DECLARATION BEATS ANY STYLESHEET, so
// the per-colour light and dark stops the painted tile is built from could not
// be applied from CSS at all: the tile's field, the rim derived from its dark
// stop and all four state washes would have been overruled by six string
// templates in this file.
//
// It returns a CLASS PAIR now and style.css carries the colour - see "THE TILE
// COLOUR CLASSES" there, which also records why the alpha-layer alternative is
// refused and why the selector is at three classes. The rendered colour is
// unchanged: --mid is an alias of the same --tile-<colour> this map used to
// name.
//
// The bare ft-colour is the marker that buys the specificity; the second class
// carries the stops.
//
// STAGE 4 RETIRED ft-colour-none. It was the literal white an empty market cell
// used to be given inline, and an empty cell is not a colour - it is a DENT, and
// the dent is the whole cell rather than a fill sitting in one. An unrecognised
// colour now returns nothing at all, which leaves .ft-tile's own field showing
// with no --lt / --mid / --dk declared, rather than painting a white square that
// would beat every rule under it exactly as the inline declaration used to.
function getColourClass(colour) {
  const classMap = {
    yellow: 'ft-colour ft-colour-yellow',
    pink: 'ft-colour ft-colour-pink',
    green: 'ft-colour ft-colour-green',
    blue: 'ft-colour ft-colour-blue',
    orange: 'ft-colour ft-colour-orange',
  };
  return classMap[colour] || '';
}

export function renderGameEnd(container, data) {
  const { winner, playerStats, gameStats, turnsPlayed, onPlayAgain } = data;

  const playerScoreRows = playerStats
    .sort((a, b) => b.score - a.score)
    .map((p, idx) => `
      <tr class="ft-stats__player-row ${idx === 0 ? 'ft-stats__player-row--winner' : ''}">
        <td class="ft-stats__player-name">${p.name}</td>
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
          <p class="ft-game-end__winner">${winner.name} wins with ${winner.score} points!</p>
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
