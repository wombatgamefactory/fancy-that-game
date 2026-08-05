import { BOARD_SIZE, INITIAL_MARKET_CARDS, MAX_MARKET_CARDS, EMPTY_PLATES_PER_PLAYER, CARDS_TO_END_2P, REWARD_CARDS, COLOURS, INGREDIENTS, createTileBag } from './tiles.js';
import { TASTING_MENUS, satisfies, deficit } from './tastingMenus.js';

// Side length of the TILE MARKET board: 5×5 = 25 cells at EVERY player count.
// (28 July: the market was 6×6 for 3-4 players and 5×5 for 2; the per-player-count
// sizing and the 2-player inner-area restrictions are gone.) Sweep geometry
// therefore is always 10 lines - 5 rows plus 5 columns - of 5 cells each.
// NOTE: this is NOT tiles.js's BOARD_SIZE, which is the player's personal board.
// Both happen to be 5; they are unrelated dimensions.
export const MARKET_SIZE = 5;

// Cake-stand row scoring: each row has its OWN cumulative value table, indexed to
// match the stand array (0 = bottom/4 plates, 3 = top/1 plate). A row holding N
// tiles scores STAND_ROW_VALUES[rowIndex][N-1] (0 when empty). Per-tile values
// escalate within the bottom row (1/3/8/14) but row entry falls with row length
// (bottom 1, top 5): short rows are safe, the bottom row is a deep gamble. Max
// stand score is 50 (26 + 12 + 7 + 5).
//
// REVALUED 5 AUGUST (was 22 + 14 + 9 + 5, bottom 1/4/12/22). Under the old
// table the full bottom row (4 tiles of ONE ingredient, the hardest structure
// in the game and the one Freshness argues against) paid 22 VP + 1 cupcake
// while the top three rows together (6 tiles across THREE ingredients) paid
// 28 VP + 3 cupcakes - the deep commitment was strictly the worse deal, and
// basicBot completed the bottom row in only 14-20% of stands. This table flips
// the comparison (bottom 26 vs top-three 24) and back-loads the row so the
// reward is completion-shaped: three deep pays 12, the same as a FULL middle
// row, and the fourth tile pays +14, the biggest single placement in the game.
// Measured over 400 games/cell at 2/3/4p (ab-stand-2026-08-05.mjs, all six
// candidate cells recorded there): bottom-row completion ~33% of stands, total
// stand VP unchanged at ~24/player. Known cost, common to EVERY candidate that
// made the bottom row worth feeding: the 3-plate middle row's completion rate
// falls to 10-16% (tile-budget substitution - tiles sent deep cannot also go
// wide), which is why its table got fatter increments (2/4/6) rather than the
// old 2/5/7-shaped middle. The optional completion cupcake on bottom plate 4
// (cell C) measured clean but was NOT adopted - CUPCAKE_PLATES is unchanged.
export const STAND_ROW_VALUES = [[1, 4, 12, 26], [2, 6, 12], [3, 7], [5]];

// Teapot symbols printed on the tile-market board. FIVE cells carry a printed
// teapot symbol; a symbol is "visible" when its cell is currently empty (no
// tile sitting on it). Visible symbols TRIGGER the fresh pot of tea
// (REFRESH_THRESHOLD of them must show - see isTeaDue). Since 30 July they no
// longer size its reward — the pot pays a flat TEA_POT_REWARD at the cupcake-pot
// step (see finishTeaRound). There is NO cupcake cap any more — every gain
// always pays.
//
// ONE set of 4 cells for all player counts (28 July: the per-player-count sets
// keyed by market size are void, along with the 2-player inner area they existed
// to serve). Values are flat market-array indices on the 5-wide grid
// (index = row*MARKET_SIZE + col).
//
// Positions (adopted 30 July - five symbols): 1-indexed (row, column) (1,4),
// (2,1), (3,3), (4,5), (5,2), matching the printed board art convention.
// Zero-indexed and flattened those are (0,3)=3, (1,0)=5, (2,2)=12, (3,4)=19,
// (4,1)=21.
//
// The 30 July change adds the CENTRE cell (3,3) as a fifth symbol. The set
// keeps the property that matters mechanically - every symbol in its own row AND
// its own column, so no single sweep can ever uncover two at once. Reaching
// REFRESH_THRESHOLD therefore always takes at least REFRESH_THRESHOLD separate
// sweeps, each uncovering one symbol. (The briefly-used inner ring
// (2,2)/(2,4)/(4,2)/(4,4) broke that; it is void.)
//
// They live here as config, not as hardcoded logic, precisely so the art team can
// move them without touching any code that reads them.
//
// RENAMED 4 AUGUST, from CUPCAKE_SYMBOL_CELLS (and getVisibleCupcakeSymbols to
// getVisibleTeapotSymbols). The name predated the symbols becoming teapots, and
// the Teapot Track arriving the same day would have left two unrelated things
// called teapot in the rules and cupcake in the code. Pure rename, no behaviour
// change. CUPCAKE_PLATES is deliberately untouched - those really are cupcakes.
export const TEAPOT_SYMBOL_CELLS = [3, 5, 12, 19, 21];

// Visible teapot symbols that force a fresh pot of tea at the END of a turn.
// This is the designated tuning knob for refresh frequency - never additional
// rules. Read by isTeaDue, which is the one trigger the engine, the bots and the
// UI all share.
//
// Adopted 30 July: 4 of the 5 symbols must be visible. Since no two symbols share
// a row or column (see TEAPOT_SYMBOL_CELLS), uncovering each one costs a
// separate sweep, so the trigger demands four symbol-clearing sweeps. Simulation
// (200 games/config, 30 July) put the flush at ~6.5-7.3 tiles left on the board
// against a 5-7 design target; the previous 3-of-4 gate flushed at ~9 and a
// 4-of-4 gate overshot to ~3.5 while making forced empty-board refreshes common.
//
// 1 AUGUST RE-TUNE NOTE. Those figures were measured under the old START-OF-TURN
// rule, where the flush landed one turn AFTER the fourth symbol appeared. The
// end-of-turn trigger fires on the same turn, so the board carries roughly one
// tile more at the flush. Re-measure before moving this knob.
export const REFRESH_THRESHOLD = 4;

// Adopted 30 July: the cupcake pot is a FLAT reward - the tea player gains
// exactly this many cupcakes, regardless of how many symbols are showing. Under
// the previous rule the pot paid 1 cupcake per visible symbol; the flat pot
// removes that variability (and most of the refresh's cupcake inflation) so the
// flush is ordered for the board state, not farmed for the payout.
export const TEA_POT_REWARD = 1;

// ---------------------------------------------------------------------------
// THE TASTING MENU - a race for a fixed set of public cards that never come back.
// Adopted 5 August, REPLACING the Freshness Bonus outright, which had replaced
// Today's Speciality the previous afternoon.
//
// THE RULE, in full. Deal PLAYERS + 1 Tasting Menus face up beside the market at
// setup - 3 / 4 / 5 at 2 / 3 / 4 players, so there is always one more menu on the
// table than there are people to take them, and none of them is anybody's by
// default. They are public from turn one and are never replaced. Each names
// either two ingredients at 2 each or one at 2 and two at 1, so every card
// demands exactly FOUR TILES. The moment your CAKE STAND shows those ingredients
// you take the card - immediately, free, automatic; it costs no action, no
// cupcake and no part of your turn, and it is not a decision. Each menu can only
// ever be taken by ONE player: first to qualify wins it and it is out of the game.
// Ingredients are NOT consumed, so the same tiles can satisfy more than one menu.
// Only the cake stand counts - tiles in the crumb tray are invisible. Worth
// TASTING_MENU_VP each at the end.
//
// THAT IS THE WHOLE RULE. There is no reset, no per-period timing, and NO
// INTERACTION WITH THE POT OF TEA - which is the entire point. Both previous
// attempts built urgency out of something that came back, and a reward on a reset
// cycle is by construction never your last chance at it. The device here is
// borrowed from outside the game (Splendor's nobles, and the same shape in
// Century and Patchwork): the thing you are racing for will be GONE, taken by a
// NAMED OPPONENT, and will not return. If this module ever grows a line that
// touches brewFreshPot, something has gone wrong.
//
// WHY THE TWO IT REPLACED FAILED, kept written down so neither is re-proposed:
//   - TODAY'S SPECIALITY plus the Teapot Track was a decaying reward on a clock
//     nobody controlled. It handed seat 1 up to +4.3 points of win share and did
//     not move claims-by-game-third by a single point.
//   - THE FRESHNESS BONUS was first-to-claim each ingredient, reset every pot. It
//     fixed the seat bias and delivered the game's first anti-runaway, but 77.6%
//     of claims won a token: it added points without adding a decision, and at
//     9.0 VP per player (18.5% of score) it was measured too high.
//
// The deck itself is src/engine/tastingMenus.js - generated from a ring
// construction rather than typed out, so it stays balanced if the ingredient list
// changes. Do not hand-retype it.
//
// A Tasting Menu is worth this at game end. IT WAS 8 UNTIL 5 AUGUST 2026 and is
// now 5 - Dean's call, taking the measured answer below.
//
// WHY IT STARTED AT 8: rather than the Splendor-equivalent 10 (a noble is ~20% of
// a winning Splendor score; 10/49.2 was 20.5% here) because the first build should
// under-dose - raising this after playtesting is trivial, discovering the module
// has eaten the game is not. The floor was about 6: below that the card is worth
// less than the 2-4 VP of stand and card value a player gives up by redirecting a
// claim, and nobody chases it, which is exactly how the Freshness Bonus ended up
// doing nothing.
//
// THEN THE DECK CHANGED UNDER THAT NUMBER ON 5 AUGUST. Both halves lost a tile -
// 2/2 + 2/1/1 became 2/1 + 1/1/1 - because the four-tile deck failed its own
// reachability test (57.9% dead cardboard against a menu-aware bot, where over 50%
// was the stated condemnation). Three tiles fixed that decisively (21.9%), and the
// cost landed here: menus per player went 0.56 -> 1.04, so at 8 VP the module was
// dosing 8.33 VP/player. For scale, this section was built to aim at 4.4, and the
// Freshness Bonus was condemned as too heavy at 9.0.
//
// SO 8 WAS TOO HIGH FOR THE THREE-TILE DECK, AND 5 IS THE MEASURED ANSWER - 2,000
// games, 3p, basicBot: dose 4.52 VP/player against the 4.4 target, dead cardboard
// 32.2% (still nowhere near the 50% line), contested menus 0.446 (still 3.4x the
// four-tile deck's 0.131). The old floor of 6 was reasoned from what a player
// gives up by redirecting a claim on a FOUR-tile card; a three-tile card redirects
// less, so the floor moves down with it and 5 sits above it.
//
// 5 ALSO HALVES A SEAT PROBLEM THIS MODULE CREATES. Metric 12 at 3p: the base game
// is +1.7 for seat 1 (inside target), the four-tile menu +4.2, the three-tile menu
// at 8 VP +7.5, and at 5 VP +4.4. A race to be first to a reachable target favours
// the seat that acts first, and lighter cards make the races shorter, so turn order
// decides more of them. For scale, the Teapot Track was deleted for +4.3. Dropping
// to 5 gets back to the four-tile deck's cost but NOT inside the target - that part
// is structural and needs a different device, not a different number.
//
// REVISE IT IF: the steered rate comes in below 0.4 menus per player (raise) or
// above 0.8 (drop). If DEAD CARDBOARD goes back above 50% with a menu-aware bot,
// revise the DECK instead, not this. See simulate.js metric 13.
export const TASTING_MENU_VP = 5;

// PLAYERS PLUS ONE - so 3 / 4 / 5 menus dealt at 2 / 3 / 4 players. Adopted
// 5 August, changed from a flat one per player.
//
// THE SURPLUS IS THE POINT, and it is the standard fix for the shape of race this
// module runs: with exactly one card per player, a player who loses every race
// still had a card's worth of the deal notionally "theirs", and the arithmetic
// quietly promises everyone one. A surplus of one breaks that promise honestly -
// there are more menus than players, so no menu is anybody's by default, and the
// question is which of them you can actually reach. It is the same reason
// Splendor deals nobles at players + 1.
//
// WHAT IT COSTS, measured before the change: dealing MORE barely moves dead
// cardboard. At 3p, going from 3 dealt to 7 lifted the share of players
// qualifying for at least one from 18.8% to 33.5% while dead cardboard stayed
// flat at 80-81% unsteered, because the extra cards are unreachable in the same
// proportion as the rest. So expect this to raise the DOSE and the qualifying
// share while leaving the dead-cardboard percentage roughly where it was - and
// read the dead-card COUNT alongside the percentage, because the denominator has
// just grown.
export const TASTING_MENU_SURPLUS = 1;

// How many menus a game of `playerCount` deals. The single place the rule is
// expressed - createGame, the metrics header and the test suite all call it, so
// none of them can drift from the others.
export function getTastingMenuCount(playerCount) {
  return playerCount + TASTING_MENU_SURPLUS;
}

// Dean's original statement of the rule capped a player at one Tasting Menu per
// turn. Measured incidence of qualifying for two at once was 0.7% UNSTEERED, but a
// steering player can deliberately build an overlapping pair (t1 and t6 share a
// lemon and need only five tiles between them), so the cap matters more once bots
// chase menus - and on the three-tile deck they do: 27.2% of players now finish
// with two or more menus. Still shipped OFF, behind this flag, so it can be A/B'd
// rather than argued about, but it is a live question now rather than a remote
// one.
export const TASTING_MENU_ONE_PER_TURN = false;

// THE A/B SEAM for the whole module, following the pattern the Freshness Bonus
// used because the probes depend on it: one call switches the Tasting Menu off,
// so a single simulation run can measure with and without it. When disabled no
// menus are dealt and every hook is a no-op - see isTastingMenuInPlay, which is
// the one predicate engine, bots and UI all read. PRODUCTION CODE MUST NEVER CALL
// THE SETTER; the game always starts from the constant.
export const TASTING_MENU_ENABLED = true;
let tastingMenusEnabled = TASTING_MENU_ENABLED;
export function getTastingMenusEnabled() { return tastingMenusEnabled; }
export function setTastingMenusEnabled(on) { tastingMenusEnabled = !!on; }   // tests and harnesses only

// Deal `count` menus at random without replacement from the ten. Each dealt entry
// is a FRESH object carrying its own `takenBy`, so the shared TASTING_MENUS
// constant is never written to - the deck is read-only for the life of the
// process and a game cannot poison the next one.
//
// Fisher-Yates over a copy, matching createTileBag and initGameDeck.
function dealTastingMenus(count) {
  const pool = [...TASTING_MENUS];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, Math.min(count, pool.length)).map(menu => ({
    id: menu.id,
    shape: menu.shape,
    need: { ...menu.need },
    // null until somebody qualifies, then the player id - and it NEVER reverts.
    // This module has no reset of any kind.
    takenBy: null,
  }));
}

// A pinned deal from the harness: anything naming a real menu id is used
// verbatim, so a probe or a test can force a known setup. Same normalisation as
// the random deal, so a pinned entry cannot smuggle a shared `need` object or a
// pre-set takenBy onto the table.
function normaliseTastingMenus(pinned) {
  const out = [];
  for (const entry of pinned) {
    const id = typeof entry === 'string' ? entry : entry && entry.id;
    const menu = TASTING_MENUS.find(m => m.id === id);
    if (!menu) continue;
    out.push({ id: menu.id, shape: menu.shape, need: { ...menu.need }, takenBy: null });
  }
  return out;
}

// Cupcake cost of each claim BEYOND the first in a turn (design doc §6).
//
// THE ADOPTED RULE IS ONE CLAIM PER TURN, AND THIS SHIPS DISABLED. Do not flip it
// casually - it is not a tuning knob, it is a whole different game. Values:
//   null (the shipped default) - extra claims are DISALLOWED. A second claim in a
//        turn is rejected outright, with the plain-language message the players
//        actually need to hear (see claim()); a successful claim ends the claim
//        step exactly as it always has.
//   a number n - the PRE-AGREED VARIANT: claims beyond the first are permitted and
//        each costs n cupcakes out of the claiming player's own supply. A claim no
//        longer closes the claim step, so the player may keep going for as long as
//        they can pay and find matches.
//
// WHY IT EXISTS AT ALL: players persistently assume they may claim more than once,
// and the design session pre-agreed this as the escalation IF playtests show that
// frustration is real. It is wired up now, ahead of any decision, purely so
// simulation can A/B it - one constant flip, no other code change. Adopting it is
// a design decision, not an implementation one.
export const EXTRA_CLAIM_CUPCAKE_COST = null;

// The LIVE value of the variant flag, plus the seam that lets a simulation or a
// test harness swing it without editing (and accidentally committing) the shipped
// constant above. Everything in the engine reads getExtraClaimCupcakeCost() rather
// than the constant, so an A/B run is setExtraClaimCupcakeCost(1) ... run ...
// setExtraClaimCupcakeCost(EXTRA_CLAIM_CUPCAKE_COST) to put it back. Production
// code must never call the setter; the game always starts from the constant.
let extraClaimCupcakeCost = EXTRA_CLAIM_CUPCAKE_COST;

export function getExtraClaimCupcakeCost() {
  return extraClaimCupcakeCost;
}

// Test/simulation seam only - see above. Accepts null (rule as adopted) or a
// non-negative integer cupcake cost.
export function setExtraClaimCupcakeCost(cost) {
  if (cost !== null && (!Number.isInteger(cost) || cost < 0)) {
    throw new Error('extraClaimCupcakeCost must be null or a non-negative integer');
  }
  extraClaimCupcakeCost = cost;
}

// Count the teapot symbols currently VISIBLE (i.e. whose market cell is empty).
// Shared by the engine (the tea pot), the bots (tea timing), and the UI
// (rendering + pot preview) so all three read visibility the same way: purely
// from cell emptiness, with no separate symbol state.
export function getVisibleTeapotSymbols(gameState) {
  const cells = TEAPOT_SYMBOL_CELLS;
  let visible = 0;
  for (const idx of cells) {
    if (gameState.market[idx] === null || gameState.market[idx] === undefined) visible++;
  }
  return visible;
}

// Cupcake plates: the (rowIndex, plateIndex) stand positions that grant a
// cupcake the moment a tile is plated onto them. Indices are 0-based into the
// stand array (rowIndex 0 = bottom/4-plate row … rowIndex 3 = top/1-plate row;
// plateIndex counts plates left→right from the row's locking plate). These are
// the SECOND plate of every multi-plate row plus the top row's single plate —
// bottom[1], second[1], third[1], top[0] — plus, since 5 August, the bottom
// row's FOURTH plate. That completion cupcake rode in with the same day's
// STAND_ROW_VALUES revaluation (see that comment): the bottom row was
// cupcake-poor per tile (1 per 4 tiles against 3 per 6 across the upper rows),
// and putting the second one on the LAST plate keeps it completion-shaped —
// measured clean as cell C of ab-stand-2026-08-05.mjs. Plating onto one grants
// 1 cupcake from the supply — always (there is no cupcake cap; see
// plateTileOntoRow). The opening-plate variant was rejected in playtesting, so
// no row's first plate (plateIndex 0, except the top) appears.
export const CUPCAKE_PLATES = [
  { rowIndex: 0, plateIndex: 1 },
  { rowIndex: 0, plateIndex: 3 },
  { rowIndex: 1, plateIndex: 1 },
  { rowIndex: 2, plateIndex: 1 },
  { rowIndex: 3, plateIndex: 0 },
];

function isCupcakePlate(rowIndex, plateIndex) {
  return CUPCAKE_PLATES.some(p => p.rowIndex === rowIndex && p.plateIndex === plateIndex);
}

// ---------------------------------------------------------------------------
// INGREDIENT OBJECTIVES ("PANTRY GOALS") ARE DELETED - 4 AUGUST.
//
// They were a 10-card ingredient deck dealt into five face-up pairs, each worth
// 3 VP to the first player holding the named tiles on their player board, taken
// free at the end of a turn. The whole module is gone: the deck, the pairs, the
// doubles rule, the end-of-turn check (which was step 5 of the turn), and the
// central board area they were printed in. The card row (Patisserie Goals) now
// runs full width in its place.
//
// WHY. Playtested to completion at 4 players on 3 August. Players were focused
// on the main puzzle - tiles, patterns, the cake stand - and the pantry goals
// read as a distraction that was not wired into it. They were the newest module
// in the game and the only one nobody was thinking about.
//
// WHAT GOES WITH THEM, and is deliberately NOT patched over here: they were the
// game's only source of between-game SETUP VARIANCE (73 distinct objective sets),
// and roughly 3-6 VP per player of scoring. Both are open questions now, not
// solved ones. Do not reintroduce a scoring module to close the VP gap without
// deciding first whether the gap is a problem.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// THE CUPCAKE SPEND MENU. Cupcakes stopped scoring VP on 3 August (see
// calculateFinalScores) and became a real currency. The prices live here because
// "what is a cupcake worth" is the open question all of them rest on - see the
// metrics note on statsCollector.cupcakeSpend.
//
// REPRICED 3 AUGUST (second revision), alongside the 100 -> 125 tile bag. The
// menu is now a ladder at 1 / 2 / 3 plus the unchanged reserve:
//
//   1  move a tile               MOVE_TILE_CUPCAKE_COST
//   1  reserve a card            RESERVE_CUPCAKE_COST
//   2  take an extra tile        EXTRA_TILE_CUPCAKE_COST      (was 1)
//   3  remove an empty plate     REMOVE_PLATE_CUPCAKE_COST    (new)
//
// MOVING an empty plate is DELETED. It cost 2 and shuffled the obstruction from
// one cell to another; removing the plate outright supersedes it, so the two are
// not offered side by side.
// ---------------------------------------------------------------------------
// Relocate one TILE on your own board. Unchanged price, and now the ONLY thing
// the move action can relocate - see moveTile and getMoveCost.
export const MOVE_TILE_CUPCAKE_COST = 1;
// Take 1 extra tile from ANYWHERE on the market at the sweep step. WAS 1: the
// load-bearing change of the first 3 August set, where card-locked claim steps
// ran at 28.5 / 27.6 / 29.2% and one extra tile from anywhere unlocked a claim in
// 37.9 / 39.0 / 39.4% of them, taking the lock rate to 17.7 / 16.9 / 17.7%.
// "FROM ANYWHERE" is what produces that figure - restricting it to the swept
// line does not.
//
// THE MEASURED FIGURES ABOVE WERE TAKEN AT A PRICE OF 1. Doubling the price does
// not change how often the tile CURES a lock, but it does change how often the
// bot can afford to try, so the lock rate is expected to drift back up. That
// drift is the thing this repricing has to be judged on.
export const EXTRA_TILE_CUPCAKE_COST = 2;
// Take 1 card from the card market into your personal reserve, on your own turn.
export const RESERVE_CUPCAKE_COST = 1;
// Remove one EMPTY PLATE token from your own board and RETURN IT TO THE BOX.
//
// The plate is gone from the game: it does NOT go back into the supply, so this
// buys board space and nothing else. In particular it does NOT buy extra claims -
// the end condition counts CLAIMS MADE against cardsNeededToEnd (see
// isCardEndConditionMet), not plates remaining, so removing plates cannot extend
// the game's clock. That is the whole point of "return it to the box", and it is
// structural here rather than a rule anyone has to remember.
//
// PRICED AT 3, the top of the ladder, because it is strictly better than the
// 2-cupcake plate move it replaces: a moved plate still sterilised some cell
// somewhere, a removed one sterilises nothing ever again.
export const REMOVE_PLATE_CUPCAKE_COST = 3;

// Cards a player may hold in their personal reserve at once. The free tea-round
// reserve (deleted 3 August) briefly ran uncapped; a PAID reserve is capped at 1
// again, so a reserve is a forward commitment rather than a hand.
export const RESERVE_LIMIT = 1;

// ---------------------------------------------------------------------------
// STARTING CUPCAKES BY SEAT, KEYED BY PLAYER COUNT (4 August, FINAL).
//
//   2 players   2 / 2          total influx 4
//   3 players   2 / 2 / 2      total influx 6
//   4 players   2 / 2 / 3 / 3  total influx 10
//
// SAY IT AS: everyone starts with 2. AT FOUR PLAYERS ONLY, the third and fourth
// seats start with 3. There is no compensation at 2 or 3 players at all.
//
// WHY IT IS KEYED BY PLAYER COUNT, which is the part to preserve even if the
// numbers move again. The old form was a single by-seat array, [2,3,4,5], so seat
// 3 got 4 cupcakes whether there were three players or four. That scales the
// compensation with SEAT NUMBER, when the thing being compensated scales with
// POSITION IN THE ROUND: the tile market only refills at tea, so it is more
// picked-over by the time it reaches a later seat. "Third of three" and "third of
// four" are different positions, and one array cannot say so.
//
// WHY 4 PLAYERS IS THE ONLY TABLE SIZE THAT NEEDS IT. Measured, not assumed: at
// 2 and 3 players the market does not degrade far enough within a round for a
// positional advantage to survive, so a compensating cupcake does not correct a
// bias, it CREATES one in the other direction. Worst seat deviation from an even
// win share, 3,000 games per configuration, compensated versus flat:
//   2 players   2/3     -4.4      2/2     +1.4   <- flat wins
//   3 players   2/2/3   +4.8      2/2/2   -3.1   <- flat wins
//   4 players   2/2/3/3 +2.0      2/2/2/2 +3.4   <- compensation wins
// At 4 players it also takes the score gradient first-to-last from -2.90 VP to
// -0.60. 2/2/2/3 (one extra to the last seat only) was tested there and is worse
// at -2.9, so it is the back-HALF split doing the work, not merely a smaller dose.
//
// THE HISTORY, because the sign has flipped once already. On 3 August a measured
// FIRST-player advantage (seat 1 winning 55.8 / 39.8 / 40.3% against an even
// 50 / 33.3 / 25%, on a 6.26 VP gradient at 4p) was compensated with an escalating
// 2/3/4/5. Two 4 August changes then removed the causes of it - the finished-out
// round equalised turn COUNTS, which the old turn-boundary checks never actually
// did, and the unlimited final-round plate supply stopped the last round being
// dead for the seats that had not yet played. Re-measured against the settled
// rules, 2/3/4/5 had over-corrected into a LAST-seat advantage (seat 1 at -6.3
// win share at 4p, gradient -2.90 VP). Do not reinstate a per-seat escalation
// without re-running the measurement first: the advantage it was built for is
// mostly gone.
//
// AT 3 PLAYERS THE TARGET IS UNREACHABLE WITH WHOLE CUPCAKES, and that is why the
// flat row is not a failure to tune. One cupcake is worth roughly 8 points of win
// share at that table size, so flat undershoots at -3.1 and 2/2/3 oversteps to
// +4.8. Nothing in between exists. Closing that gap needs a finer-grained
// compensation than a starting cupcake, not a different arrangement of whole ones.
//
// WHAT A CUPCAKE IS WORTH IS STILL A GUESS, AND MUST BE VERIFIED RATHER THAN
// ASSUMED. Re-run probe-seat.js (or simulate.js metric 12) and check every seat
// lands within ±2 points of even. Two cautions learned on 4 August: run at least
// 3,000 games per configuration, and note that two INDEPENDENT runs of an
// identical configuration were observed 2.2 points apart, so the ±1.8 band the
// harness prints is the band for ONE measurement, not for the difference between
// two. Treat anything within about 3 points of even as indistinguishable from
// fair rather than as a number to chase.
export const STARTING_CUPCAKES_BY_SEAT = {
  2: [2, 2],
  3: [2, 2, 2],
  4: [2, 2, 3, 3],
};

// The starting cupcakes for a given table size, as an array indexed by seat.
// Exported so the harnesses and tests can report and assert the live values
// without reaching into the table's shape - the shape has changed once already.
// An unlisted player count falls back to the smallest table's opening 2, which is
// the value every seat-1 in every configuration starts on.
export function getStartingCupcakes(playerCount) {
  return STARTING_CUPCAKES_BY_SEAT[playerCount] ?? new Array(playerCount).fill(2);
}

function startingCupcakesForSeat(seatIndex, playerCount) {
  const table = getStartingCupcakes(playerCount);
  return table[seatIndex] ?? table[table.length - 1];
}

// Tiles of `ingredient` sitting on the PLAYER BOARD. Empty plate tokens are
// objects with no ingredient and are skipped; the stand and the crumb tray are
// not this array and so do not count.
//
// KEPT after the pantry goals were deleted (4 August) because it is a plain
// board query the bots use to value an ingredient declaration, not part of the
// deleted scoring module.
export function countBoardIngredient(board, ingredient) {
  let count = 0;
  for (const cell of board) {
    if (cell && cell.ingredient === ingredient) count++;
  }
  return count;
}

// THE ONLY WAY THE ENGINE MAY TOUCH THE STATS COLLECTOR. Use metrics(gameState)?.
// recordX(...) at every call site — never gameState.statsCollector directly.
//
// A collector is bound to exactly one game state (createGame calls bindTo), and
// this returns null for any other object. Search bots run their playouts on
// CLONES of the live state, and a clone is a different object, so a rollout can
// never write to the real game's metrics even if a future clone helper copies
// the collector reference across. It used to rely on mctsBot's cloneState
// remembering to null the field; when that slipped, hundreds of imaginary
// rollout turns per real turn were logged as real, and the end screen showed
// 61,689 sweeps and 48,076 cards claimed for a 21-turn two-player game.
function metrics(gameState) {
  const collector = gameState.statsCollector;
  if (!collector || collector.owner !== gameState) return null;
  return collector;
}

// ---------------------------------------------------------------------------
// METRIC SAMPLERS (design doc, "Metrics to log per simulated/real game").
//
// Three measurements the collector cannot take for itself, because they are
// questions about the whole game state rather than about a single event. All
// three return IMMEDIATELY when there is no collector, and none of them touches
// the state, so a game played without metrics behaves identically and pays
// nothing for these hooks.
// ---------------------------------------------------------------------------

// METRIC 3 (card row size) and, since 1 August, the TRIGGER INVARIANT. One
// sample at the very start of each real turn: the length of the CARD row
// (gameState.cardMarket — not the 5x5 tile market, not the personal board), the
// visible teapot symbols, and whether tea is still due. Called from exactly two
// places, createGame for the opening turn and advanceToNextTurn for every
// rotation that actually hands somebody a turn, so there is precisely one sample
// per turn played. Sampling at the START matters: a refresh cuts the row back to
// INITIAL_MARKET_CARDS, and metric 3 is about the row the player was faced with.
//
// THE INVARIANT. Under the end-of-turn trigger, isTeaDue must be FALSE at the
// start of every turn: the previous turn either flushed the board or never
// reached the threshold. A non-zero count here means a tea round was skipped or
// failed to cover the symbols, so the sample is worth keeping even though it is
// no longer the "did anyone take the free refresh?" measurement it used to be
// (it could not be - tea is not a choice any more).
function sampleTurnStart(gameState) {
  const collector = metrics(gameState);
  if (!collector) return;
  collector.recordTurnStart(
    gameState.stats.turnsPlayed,
    gameState.currentPlayerIndex,
    gameState.cardMarket.length,
    getVisibleTeapotSymbols(gameState),
    isTeaDue(gameState),
  );
}

// METRICS 4 (card lock) and 5 (multi-match). How many cards the active player
// could LEGALLY claim as their claim step opens. Sampled from skipMove, the sole
// entry into the claim phase, so it reads the board AFTER any cupcake move — a
// move can create the match, and a player who moved into one was never locked.
//
// A completed pattern is the whole test: the crumb tray is always a legal
// destination for the removed tile (see getLegalDestinations), and the first
// claim of a turn is always free (§6), so nothing else can refuse a claim the
// pattern allows. The reserve is counted separately from the row because the
// 27 July lock the design doc asks us to verify was a property of the ROW.
//
// This is the one genuinely expensive hook (a pattern scan per card in the row),
// which is exactly why it sits behind the collector check.
function sampleClaimOpportunity(gameState) {
  const collector = metrics(gameState);
  if (!collector) return;
  const player = gameState.players[gameState.currentPlayerIndex];
  let rowClaimable = 0;
  for (const card of gameState.cardMarket) {
    if (getPatternMatches(player.board, card.pattern).length > 0) rowClaimable++;
  }
  let reserveClaimable = 0;
  for (const reserved of player.reservedCards) {
    if (getPatternMatches(player.board, reserved.pattern).length > 0) reserveClaimable++;
  }
  collector.recordClaimOpportunity(gameState.stats.turnsPlayed, player.id, rowClaimable, reserveClaimable);
}

// METRIC 8, the physical-supply half. Total cupcakes held simultaneously across
// every player, sampled after each influx (a spend only ever lowers the total, so
// the peak always follows a gain). The rules have had NO cupcake cap since
// 24 July; this measures whether the 16 tokens in the box would ever run out, and
// deliberately enforces nothing.
function noteCupcakeSupply(gameState) {
  const collector = metrics(gameState);
  if (!collector) return;
  let held = 0;
  for (const player of gameState.players) held += player.cupcakes;
  collector.recordCupcakeSupply(held);
}

// Plate a tile onto a stand row. This is the SINGLE code path that adds a tile
// to a stand row's `tiles` array (claim's 'row' destination is its only caller),
// so the cupcake-plate trigger lives here in one place. The plate the tile lands
// on is the row's length BEFORE the push. On the first tile the row locks to the
// tile's ingredient. If the landing plate is a cupcake plate, the player gains 1
// cupcake from the supply — always; there is no cap, so the gain never forfeits.
function plateTileOntoRow(gameState, player, rowIndex, tile) {
  const row = player.stand[rowIndex];
  const plateIndex = row.tiles.length;
  if (row.ingredient === null) row.ingredient = tile.ingredient; // permanent lock
  row.tiles.push(tile);

  // Metric: record which row each player opened their stand on (first plating).
  metrics(gameState)?.recordPlating(player.id, rowIndex);

  if (!isCupcakePlate(rowIndex, plateIndex)) return;
  player.cupcakes++;
  metrics(gameState)?.recordCupcakePlateGain(player.id);
  noteCupcakeSupply(gameState);
}

// The third argument is an OPTIONS BAG, added 4 August so a harness can pin the
// setup deal without reaching into the state after the fact.
// `tastingMenus` names which Tasting Menus are dealt this game - an array of menu
// ids (or of menu objects), used VERBATIM so a probe can pin a deal. Omit it and
// the deal is random, exactly as the physical setup works.
export function createGame(playerConfigs, statsCollector = null, { tastingMenus = null } = {}) {
  const bag = createTileBag();
  const playerCount = playerConfigs.length;
  // The market is MARKET_SIZE square at every player count. It is still copied
  // onto the game state because engine, bots and UI all read gameState.marketSize
  // rather than importing the constant.
  const marketSize = MARKET_SIZE;

  // THE TASTING MENU: which menus are on the table this game. An EMPTY array when
  // the module is switched off, so the shape on the state never changes and no
  // consumer has to test for two different things.
  const dealtMenus = !tastingMenusEnabled
    ? []
    : (Array.isArray(tastingMenus)
      ? normaliseTastingMenus(tastingMenus)
      : dealTastingMenus(getTastingMenuCount(playerCount)));

  const players = playerConfigs.map((config, index) => ({
    id: index,
    name: config.name || `Player ${index + 1}`,
    isHuman: config.isHuman || false,
    aiDifficulty: config.aiDifficulty || null,
    board: Array(BOARD_SIZE * BOARD_SIZE).fill(null),
    stand: [
      { capacity: 4, ingredient: null, tiles: [] },  // bottom row
      { capacity: 3, ingredient: null, tiles: [] },
      { capacity: 2, ingredient: null, tiles: [] },
      { capacity: 1, ingredient: null, tiles: [] },  // top row
    ],
    crumbTray: [],
    claimedCards: [],
    // STAGGERED BY SEAT AND KEYED BY PLAYER COUNT (4 August) - see
    // STARTING_CUPCAKES_BY_SEAT for the positional advantage this compensates for
    // and for why the player count has to be part of the lookup.
    cupcakes: startingCupcakesForSeat(index, playerCount),
    // NOTE (28 July): there is no per-player tea state any more. The Fresh Pot of
    // Tea CARD is deleted, and with it the once-per-game "tea spent" flag — the
    // refresh is a standing board option with no per-game or per-player limit,
    // gated purely on visible teapot symbols (see isTeaDue).
    // Personal reserve: face-up card objects. Since 3 August it is filled ONLY by
    // the PAID reserve (reserveCard, RESERVE_CUPCAKE_COST) — the free tea-round
    // reserve is deleted — and is capped at RESERVE_LIMIT (1). Emptied by claim
    // (completing one), or left to score 0.
    reservedCards: [],
    // TASTING MENUS taken, as card ids in the order they were taken. A menu can
    // only ever be taken once by one player, so this is short - 0 or 1 entries in
    // most games - and every id in it appears on exactly one player's list.
    //
    // The COUNT is what scores (calculateFinalScores multiplies by
    // TASTING_MENU_VP); the ids are kept because they cost nothing and they are
    // what the UI and the metrics read to say WHICH menu went to whom, which is
    // the half of the race that makes it feel personal.
    tastingMenus: [],
    score: 0,
  }));

  const market = [];
  for (let i = 0; i < marketSize * marketSize; i++) {
    market.push(bag.shift());
  }
  // NOTE: the opening deal is NOT recorded as a market refill. "Market Refills"
  // counts refreshes of a market that was already in play (finishTeaRound), so
  // counting setup here made every game report one refill it never had.

  const { gameDeck, cardMarket } = initGameDeck();
  // cardsNeededToEnd = EMPTY_PLATES_PER_PLAYER × player count. This encodes the
  // tabletop end condition "the game ends when the last empty plate is placed"
  // per player, and is the primary live playtime-tuning lever. 3 August: the pool
  // dropped from 8 to 6 per player, so 12 / 18 / 24 rather than 16 / 24 / 32 —
  // see EMPTY_PLATES_PER_PLAYER in tiles.js for the measured reason and for why
  // 4 players must NOT be pre-corrected to 5.
  const cardsNeededToEnd = EMPTY_PLATES_PER_PLAYER * playerCount;

  const gameState = {
    players,
    market,
    bag,
    gameDeck,
    cardMarket,
    // Flushed cards accumulate here and are reshuffled back into an empty
    // gameDeck by drawCard. Its ONLY source is the tea round's card flush
    // (finishTeaRound step b) - claimed cards go to the claiming player, and
    // since the 28 July rework a claim draws no replacement, so nothing else
    // discards. The discard therefore sits empty until the first refresh and
    // then fills a whole row at a time.
    cardDiscard: [],
    currentPlayerIndex: 0,
    // THE START PLAYER, and the seat the equal-turns rule closes the game on.
    // Always 0 today; named rather than written as a literal 0 because the whole
    // of the 4 August end rule is "play until the turn comes back round to this
    // seat", and a future first-player marker would move it.
    startPlayerIndex: 0,
    gamePhase: 'sweep',
    pendingSweepTiles: [],
    bonusTileAvailable: false,
    // NOTE (3 August): all tea-reserve state is DELETED — teaReserverIndex,
    // teaReservesRemaining, teaRoundEndsTurn and the 'teaReserve' phase itself.
    // The refresh is mechanical and single-player now; see brewFreshPot. Free
    // reserves were completed only 47.7 / 46.2 / 35.8% of the time at 2/3/4
    // players (nobody declines something free), and at 4 players the round cost
    // roughly 20 table-wide decisions per game to produce about 4.6 completed
    // reserves. Reserving is a PAID, own-turn action now (reserveCard).
    gameOver: false,
    // THE END IS A TRIGGER, NOT A STOP (4 August rule change). Every condition
    // below sets endTriggered and names itself in endGameReason; NONE of them
    // ends play on the spot. The game keeps going until the turn returns to
    // startPlayerIndex, so every player has had exactly the same number of turns,
    // and is scored there (see triggerEndGame and advanceToNextTurn).
    //
    // This replaces two different old behaviours: 'cardMarket' used to stop play
    // dead mid-round, and the turn-boundary checks used to claim they gave equal
    // turns but did not - a boundary check firing at seat 3 of 4 left seats 1-3
    // a turn ahead of seat 4.
    endTriggered: false,
    // endGameReason - every value the engine can set:
    //   'cardMarket'    - the card end condition: cardsNeededToEnd cards have been
    //                     claimed, i.e. the table's empty plate pool is spent.
    //   'bagEmpty'      - a REFILL WAS NEEDED AND THE BAG WAS ALREADY EMPTY
    //                     (4 August rule). NOT simply "the bag hit zero": a bag
    //                     that cannot cover the 25 cells now deals what it has and
    //                     play continues across the thinning market (see
    //                     brewFreshPot step c). It is the NEXT pot of tea, with
    //                     nothing left to pour, that triggers this.
    //   'boardFull'     - the incoming player's personal board has no free cell.
    //   'marketTiles'   - the empty-market deadlock valve (see
    //                     applyEmptyMarketRule). Defence in depth, not an expected
    //                     path: an empty market shows all five teapot symbols, so
    //                     'bagEmpty' fires a turn earlier.
    //   'boardOverflow' - a board that cannot accept the tiles just swept. Since
    //                     4 August this is an ordinary trigger like the others
    //                     rather than a separate countdown.
    endGameReason: null,
    // Turns since the last card was claimed by anybody (reset in claim). This was
    // the deadlock safety valve for the empty-market rule: with market and bag
    // both dry no sweep is possible, so a run of turns could pass with nobody
    // able to claim, and the game ended once the run reached playerCount.
    //
    // NO LONGER LOAD-BEARING as of 4 August: an empty market arms the ending
    // outright (applyEmptyMarketRule), and the equal-turns stop closes the game at
    // the end of that round, so a deadlock cannot outlive one round of turns.
    // Kept because it is a cheap and genuinely useful diagnostic - a game whose
    // last turns claim nothing is a game whose final round is doing no work - and
    // deleting it would remove the only record of that.
    turnsSinceLastClaim: 0,
    cardsNeededToEnd,
    playerCount,
    marketSize,
    // --- THE TASTING MENU (5 August) -----------------------------------------
    // The dealt cards, in deal order. Each entry is { id, shape, need, takenBy },
    // and takenBy goes from null to a player id exactly once and NEVER back. This
    // is the whole of the module's table state: there is no second container, no
    // per-period map and nothing a pot of tea touches.
    //
    // Empty when the module is off, which is the one thing isTastingMenuInPlay
    // tests, so nothing has to go looking through the players to find out.
    //
    // MUTABLE ENTRIES - see mctsBot's cloneState. A shallow copy of this array
    // shares the entry objects, so a rollout that sets takenBy would take a real
    // card off the real table. It must be mapped, not spread.
    tastingMenus: dealtMenus,
    // --- PER-TURN CUPCAKE ALLOWANCES (3 August) -----------------------------
    // Four outlets, four allowances. They are INDEPENDENT: buying an extra tile
    // at the sweep step does not stop you moving a tile at the spend step, nor
    // removing a plate, nor paying to reserve. What each one forbids is doing
    // that SAME thing twice. All four reset in advanceToNextTurn alongside
    // claimsThisTurn.
    //
    // moveUsedThisTurn covers the TILE move only. It used to cover the
    // empty-plate move too - one allowance at two prices - but plates are no
    // longer movable at all (see moveTile / removePlate), so the two allowances
    // are now genuinely separate things rather than a shared budget.
    moveUsedThisTurn: false,
    extraTileUsedThisTurn: false,
    // One empty plate removed to the box per turn - see removePlate.
    plateRemovedThisTurn: false,
    // The card id reserved on THIS turn, or null. A reserve is a forward
    // commitment: you may not claim a card in the same turn you reserved it (see
    // claim). Reset with the other allowances.
    reservedCardIdThisTurn: null,
    // Claims made by the current player during THIS turn. The one-claim-per-turn
    // rule (§6) is expressed in terms of this counter rather than being left as a
    // side effect of the phase transition, so the engine can say WHY a second
    // claim was refused instead of muttering "not in claim phase". Counts every
    // kind of claim - market or reserve - because the rule is about claims, and a
    // reserved card is claimed. Reset in advanceToNextTurn.
    claimsThisTurn: 0,
    // Empty plates bought off the board and returned to the BOX over the whole
    // game (see removePlate). Physical-component context, not a rule: it is what
    // says whether the 24 plates in the box are still enough once players can
    // retire them, and it deliberately does NOT feed any end condition.
    platesReturnedToBox: 0,
    stats: {
      turnsPlayed: 0,
    },
    statsCollector,
  };

  // Bind the collector to THIS state before any metric is logged: every record
  // below (and everywhere else in the engine) goes through metrics(), which only
  // logs for the state the collector was bound to. See metrics() for why.
  statsCollector?.bindTo(gameState);

  // Metric: opening cupcakes, which since 3 August differ by seat — log them as
  // each player's opening influx so the per-source cupcake accounting
  // (start / pot / plates) is complete and the seat stagger is visible in it.
  for (const player of players) {
    metrics(gameState)?.recordCupcakeGain(player.id, 'start', player.cupcakes);
  }
  noteCupcakeSupply(gameState);

  // Metric: which menus were dealt this game. Over a long run all ten must come
  // up evenly - anything else is a bug in the deal, not a design finding - and
  // the deal is also the DENOMINATOR for dead cardboard, the number this module
  // lives or dies by (see simulate.js metric 13).
  metrics(gameState)?.recordTastingMenuDeal(dealtMenus.map(m => m.id));

  for (const card of cardMarket) {
    metrics(gameState)?.recordCardMarketEntry(card.id, 0);
  }

  // Metric: the FIRST turn's start sample. Every later turn is sampled by
  // advanceToNextTurn; turn 0 has no rotation to hang off, so it is taken here.
  sampleTurnStart(gameState);

  return gameState;
}

// Deal the reward deck for a new game: shuffle all 50 cards, seed the face-up
// card row, and put EVERY remaining card (50 − INITIAL_MARKET_CARDS = 47) into
// the draw deck. The whole deck must be reachable so the card-count end
// condition (cardsNeededToEnd up to 32 at 4p) can actually fire — an earlier
// version capped the deck at 16, which made 3p/4p games unable to end that way.
//
// INITIAL_MARKET_CARDS is the row's STARTING length only, not its size. From the
// 28 July rework the row is variable-length: it grows by one at the end of every
// turn and shrinks by one per market claim, up to a ceiling of MAX_MARKET_CARDS
// (30 July rule change — see dealEndOfTurnCard).
export function initGameDeck() {
  const shuffledCards = [...REWARD_CARDS];
  // Fisher-Yates (matches createTileBag in tiles.js), replacing the weaker
  // sort(() => Math.random() - 0.5) shuffle used previously.
  for (let i = shuffledCards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffledCards[i], shuffledCards[j]] = [shuffledCards[j], shuffledCards[i]];
  }

  const cardMarket = shuffledCards.splice(0, INITIAL_MARKET_CARDS);
  const gameDeck = shuffledCards; // all remaining cards form the draw deck

  return { gameDeck, cardMarket };
}

// Draw the next reward card from the deck. When the deck is empty but cards have
// been discarded, the discard pile is Fisher-Yates shuffled into a fresh deck
// and emptied (the tabletop "reshuffle when the deck runs out" rule). Returns
// the drawn card, or null when both deck and discard are exhausted so callers
// can simply skip whatever they were dealing (the row then stands still for a
// turn). Its two callers are the end-of-turn deal (dealEndOfTurnCard) and the
// tea round's redeal (finishTeaRound step b) - a claim no longer draws anything.
// Tea flushes feed the discard, and each one burns a whole row, so reshuffles are
// expected rather than a corner case.
export function drawCard(gameState) {
  if (gameState.gameDeck.length === 0 && gameState.cardDiscard.length > 0) {
    const reshuffled = gameState.cardDiscard;
    for (let i = reshuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [reshuffled[i], reshuffled[j]] = [reshuffled[j], reshuffled[i]];
    }
    gameState.gameDeck = reshuffled;
    gameState.cardDiscard = [];
    metrics(gameState)?.recordDeckReshuffle();
  }
  return gameState.gameDeck.shift() ?? null;
}

function getRowTiles(market, rowIndex, marketSize) {
  const tiles = [];
  for (let col = 0; col < marketSize; col++) {
    tiles.push(market[rowIndex * marketSize + col]);
  }
  return tiles;
}

function getColumnTiles(market, colIndex, marketSize) {
  const tiles = [];
  for (let row = 0; row < marketSize; row++) {
    tiles.push(market[row * marketSize + colIndex]);
  }
  return tiles;
}

function getTileIndex(rowOrCol, isRow, marketSize) {
  if (isRow) {
    return (rowOrCol) * marketSize;
  } else {
    return rowOrCol;
  }
}

export function sweep(gameState, rowOrCol, isRow, declaration, declarationType) {
  if (gameState.gamePhase !== 'sweep') throw new Error('Not in sweep phase');

  const tiles = isRow ? getRowTiles(gameState.market, rowOrCol, gameState.marketSize) : getColumnTiles(gameState.market, rowOrCol, gameState.marketSize);

  const sweptTiles = [];
  const sweptIndices = [];

  for (let i = 0; i < tiles.length; i++) {
    const tile = tiles[i];
    if (!tile) continue;

    const matches = declarationType === 'colour' ? tile.colour === declaration : tile.ingredient === declaration;
    if (matches) {
      sweptTiles.push(tile);
      sweptIndices.push(getTileIndex(rowOrCol, isRow, gameState.marketSize) + (isRow ? i : i * gameState.marketSize));
    }
  }

  if (sweptTiles.length === 0) throw new Error('No tiles match declaration');

  gameState.pendingSweepTiles = sweptTiles;

  for (const idx of sweptIndices) {
    gameState.market[idx] = null;
  }

  const isLineClear = isRow
    ? getRowTiles(gameState.market, rowOrCol, gameState.marketSize).every(t => t === null)
    : getColumnTiles(gameState.market, rowOrCol, gameState.marketSize).every(t => t === null);

  gameState.bonusTileAvailable = isLineClear;

  // The declaration TYPE is passed since 4 August: any ingredient-scoring module
  // should pull sweeps away from colour and toward ingredient, and the
  // colour/symbol split is how far that moved is read. Baselines to compare
  // against: 43.8 / 43.4 / 44.4% colour at 2/3/4p with no such module at all, and
  // 42.8 / 42.9 / 43.4% under Today's Speciality - which moved it about one point
  // and was one of the two readings that condemned it. Nothing in play reads it
  // back.
  metrics(gameState)?.recordSweep(sweptTiles.length, declarationType);

  // A line-clearing sweep pauses in the sweep phase to resolve the bonus tile
  // (see takeBonusTile / declineBonusTile), each of which then transitions into
  // placement and runs the overflow check itself. A non-clearing sweep goes
  // straight to placement, so we check overflow here.
  if (!isLineClear) {
    gameState.gamePhase = 'place';
    checkBoardOverflowOnPlace(gameState);
  }

  return gameState;
}

// TRIGGER THE END OF THE GAME (4 August). Records the reason and arms the
// finish-the-round rule. It deliberately does NOT set gameOver and does NOT
// score: play continues from here until the turn returns to startPlayerIndex, so
// that every player has had the same number of turns. advanceToNextTurn owns the
// actual stop.
//
// FIRST REASON WINS. A game can arm several conditions during its final round
// (the plate pool running out and then the bag running dry, say), and the reason
// a player is told is the one that actually ended the game, not the last thing
// that happened to be true when the round closed.
function triggerEndGame(gameState, reason) {
  if (gameState.endTriggered) return;
  gameState.endTriggered = true;
  gameState.endGameReason = reason;
}

// Board-overflow end condition. Runs at every transition INTO the place phase:
// if the current player cannot fit all their pending swept tiles on their board
// (empty cells < swept tiles), the end is triggered, the pending tiles are
// discarded, and the turn skips straight to refill. Returns true when the
// overflow end fired. Centralised so the check is identical whether placement is
// reached from a plain sweep, a taken bonus tile, a declined bonus tile, or a
// directly-constructed state calling place().
//
// 4 AUGUST: this used to seed its own final-turn countdown
// (remainingTurnsInEndGame), which was the only end condition that granted extra
// turns and granted the wrong ones - one more turn each to the OTHER players,
// which leaves the triggering seat a turn short. It is an ordinary trigger now
// and gets the same finish-the-round treatment as every other ending.
//
// A player whose board is full still takes their remaining turns: they may sweep
// and claim as normal, and this check simply discards whatever they swept.
function checkBoardOverflowOnPlace(gameState) {
  const player = gameState.players[gameState.currentPlayerIndex];
  const emptyCount = getValidPlacements(player.board).length;
  if (gameState.pendingSweepTiles.length > emptyCount) {
    triggerEndGame(gameState, 'boardOverflow');
    gameState.pendingSweepTiles = [];
    gameState.gamePhase = 'refill'; // Skip directly to refill to move to next player
    return true;
  }
  return false;
}

export function takeBonusTile(gameState, marketIndex) {
  if (!gameState.bonusTileAvailable) throw new Error('Bonus tile not available');
  if (gameState.market[marketIndex] === null) throw new Error('No tile at selected position');

  gameState.pendingSweepTiles.push(gameState.market[marketIndex]);
  gameState.market[marketIndex] = null;
  gameState.bonusTileAvailable = false;
  gameState.gamePhase = 'place';
  checkBoardOverflowOnPlace(gameState);

  return gameState;
}

// Decline the offered bonus tile after a line-clearing sweep. Replaces the
// inlined "bonusTileAvailable = false; gamePhase = 'place'" that drivers used
// to run, so the overflow check fires on this transition too (a base sweep can
// already exceed the board's remaining space).
export function declineBonusTile(gameState) {
  if (!gameState.bonusTileAvailable) throw new Error('Bonus tile not available');
  gameState.bonusTileAvailable = false;
  gameState.gamePhase = 'place';
  checkBoardOverflowOnPlace(gameState);
  return gameState;
}

// SPEND 1 CUPCAKE: TAKE 1 EXTRA TILE (3 August). The load-bearing change of the
// set - see EXTRA_TILE_CUPCAKE_COST for the measured effect on card lock.
//
// WHEN: at the SWEEP STEP, after the sweep (and any line-clear bonus tile) has
// resolved but before the swept tiles are placed - i.e. the 'place' phase, with
// pendingSweepTiles still in hand. It belongs here rather than at the spend step
// precisely because it changes WHAT YOU PLACE.
//
// WHAT: 1 tile from ANYWHERE on the market board - any colour, any ingredient,
// any cell, regardless of what was swept or declared. "From anywhere" is what
// produces the measured 37.9-39.4% unlock rate; restricting it to the swept line
// does not. It is the same operation as the line-clear bonus tile, so it reuses
// that code path: lift the tile and add it to pendingSweepTiles.
//
// ONCE PER TURN, not repeatable, and illegal if you have no legal placement -
// which here means the board must have room for this tile ON TOP OF everything
// already pending, or the placement step would overflow. Only 0.4-3.8% of card
// locks are structurally unbuyable this way (board full).
//
// NOTE: taking the tile CAN uncover a teapot symbol, exactly as a sweep can, so
// it can be what fires this turn's pot of tea. That is intended.
export function takeExtraTile(gameState, marketIndex) {
  if (gameState.gamePhase !== 'place') {
    throw new Error('An extra tile can only be bought at the sweep step, before placing');
  }
  if (gameState.bonusTileAvailable) {
    throw new Error('Resolve the line-clear bonus tile first');
  }
  if (gameState.extraTileUsedThisTurn) throw new Error('Only one extra tile per turn');

  const player = gameState.players[gameState.currentPlayerIndex];
  if (player.cupcakes < EXTRA_TILE_CUPCAKE_COST) {
    throw new Error(`Not enough cupcakes for an extra tile (costs ${EXTRA_TILE_CUPCAKE_COST}, you have ${player.cupcakes})`);
  }
  if (gameState.market[marketIndex] === null || gameState.market[marketIndex] === undefined) {
    throw new Error('No tile at selected position');
  }
  // Room for one MORE tile than is already pending, else the extra tile would
  // simply overflow the board and end the game.
  if (getValidPlacements(player.board).length <= gameState.pendingSweepTiles.length) {
    throw new Error('No legal placement for an extra tile');
  }

  gameState.pendingSweepTiles.push(gameState.market[marketIndex]);
  gameState.market[marketIndex] = null;
  player.cupcakes -= EXTRA_TILE_CUPCAKE_COST;
  gameState.extraTileUsedThisTurn = true;
  metrics(gameState)?.recordCupcakeSpend(player.id, 'extraTile', EXTRA_TILE_CUPCAKE_COST);

  return gameState;
}

// True when the active player could legally buy an extra tile right now. The
// shared predicate for drivers, bots and the UI, so none of the three
// re-implements takeExtraTile's gate and then disagrees with it.
export function canBuyExtraTile(gameState) {
  if (gameState.gamePhase !== 'place' || gameState.bonusTileAvailable) return false;
  if (gameState.extraTileUsedThisTurn) return false;
  const player = gameState.players[gameState.currentPlayerIndex];
  if (player.cupcakes < EXTRA_TILE_CUPCAKE_COST) return false;
  if (getValidPlacements(player.board).length <= gameState.pendingSweepTiles.length) return false;
  return gameState.market.some(t => t !== null && t !== undefined);
}

// Is a fresh pot of tea DUE? Checked at the END of a turn, once the player has
// finished sweeping, placing, moving and claiming. The single trigger shared by
// the engine (endTurn), the bots (sweep scoring) and the UI (the gauge), so none
// of the three re-implements it: at least REFRESH_THRESHOLD teapot symbols are
// VISIBLE on the market board.
//
// READ IT AS "THE MARKET NEEDS REFILLING", NOT "A POT WILL BE POURED". Since
// 4 August the bag is no longer part of this predicate (see the empty-bag note
// below), so a true answer with an empty bag is exactly the state that ENDS the
// game. Callers that care about the difference must check the bag themselves;
// endTurn does, and it is the only place the distinction is resolved.
//
// THE 1 AUGUST RULE CHANGE. Tea used to be a voluntary action taken at the START
// of a turn, which meant the player whose sweep uncovered the fourth teapot was
// the one player who could never use it - the trigger armed for their left-hand
// neighbour instead. Every player therefore had a standing incentive to AVOID
// uncovering the fourth symbol, and dodging was nearly free (with three showing
// only four of the ten lines are dangerous, and only for a matching declaration).
// Moving the trigger to the end of the turn hands the pot to the player who
// caused it, so uncovering a teapot is something you can aim at rather than
// something you quietly duck. See the top of brewFreshPot for what the tea
// player gives up in exchange.
//
// There is deliberately NO per-game or per-player limit: tea fires every time the
// board reaches the threshold, and the trigger resets itself because the tile
// flush (brewFreshPot step c) covers every symbol again.
//
// THE EMPTY-BAG CLAUSE MOVED OUT, 4 AUGUST. This used to open with
// `if (bag.length === 0) return false`, because under the 28 July ruling an empty
// bag was itself an end-game trigger and the game was already over by the time
// the question could be asked.
//
// THE NEW RULE, from the 3 August playtest: a bag that cannot fill all 25 cells
// does NOT end the game. The pot deals out as many tiles as remain and play
// continues across a partly filled market (brewFreshPot step c already did the
// partial fill). The game ends when a refill is NEEDED and the bag is ALREADY
// empty - the tea that has nothing left to pour.
//
// SO THE RUNAWAY THAT CLAUSE GUARDED AGAINST IS BACK IN SCOPE, and is handled in
// endTurn instead. Under the old rule, a redeal short of 25 left cells bare -
// often symbol cells - so the trigger stayed ARMED and tea fired again and again,
// each time collecting a pot (~200 refreshes and games that never ended). It
// cannot recur here because the partial deal always drains the bag to exactly 0,
// and the very next time this returns true endTurn finds an empty bag and
// triggers the end instead of brewing. That is one firing, not a loop - but it is
// a rule, not an accident, so do not reinstate a bag check here without moving
// that responsibility somewhere else first.
//
// The consequence to expect at the table: a partly filled market shows more bare
// cells, so it reaches REFRESH_THRESHOLD faster. The last lap is deliberately a
// short one.
export function isTeaDue(gameState) {
  return getVisibleTeapotSymbols(gameState) >= REFRESH_THRESHOLD;
}

// ---------------------------------------------------------------------------
// THE TASTING MENU ACCESSORS. The bot, the UI and the engine must ALL go through
// these - none of the three may re-derive the rule and then disagree with it. The
// Freshness Bonus build got this right and it is why the module was cheap to
// remove; this one has the same shape for the same reason.
// ---------------------------------------------------------------------------

// Is the module in play at all? False only when it has been switched off at the
// seam. Kept distinct from "are any menus left" because the UI needs to know
// whether to draw the panel, and a game in which every menu has been taken is
// still a game the module ran in.
export function isTastingMenuInPlay(gameState) {
  return !!gameState.tastingMenus && gameState.tastingMenus.length > 0;
}

// Ingredient multiset of a player's CAKE STAND only - { lemon: 2, almond: 1 }.
// THE CRUMB TRAY IS INVISIBLE TO TASTING MENUS, and this function is the single
// place that rule is expressed.
export function getStandIngredients(player) {
  const counts = {};
  for (const row of player.stand) {
    for (const tile of row.tiles) {
      counts[tile.ingredient] = (counts[tile.ingredient] || 0) + 1;
    }
  }
  return counts;
}

// Does this player's stand meet this menu right now? Ingredients are NOT
// consumed, so this is a pure read: a menu the player has already taken still
// reads true, and two overlapping menus can both be satisfied by tiles that
// overlap.
export function qualifiesForMenu(player, menu) {
  return satisfies(getStandIngredients(player), menu);
}

// How many tiles short of `menu` this player's stand is - 0 when they qualify.
// The natural heuristic, and what the "one tile short" highlight in the UI and
// the bots' deficit terms are both reading.
export function getMenuDeficit(player, menu) {
  return deficit(getStandIngredients(player), menu);
}

// Every menu STILL ON THE TABLE that this player now qualifies for. The engine's
// award loop and the UI both iterate exactly this.
export function getClaimableMenus(gameState, player) {
  if (!isTastingMenuInPlay(gameState)) return [];
  const counts = getStandIngredients(player);
  return gameState.tastingMenus.filter(menu => menu.takenBy === null && satisfies(counts, menu));
}

// The menus nobody has taken yet, in deal order. For the UI panel and for the
// bots' "what is still worth racing for" read.
export function getAvailableMenus(gameState) {
  if (!isTastingMenuInPlay(gameState)) return [];
  return gameState.tastingMenus.filter(menu => menu.takenBy === null);
}

// THE FRESH POT OF TEA, in full. It happens INSTEAD OF the end-of-turn card deal
// (see refill), not in addition to it. Since 3 August it is MECHANICAL and
// SINGLE-PLAYER - it takes no decision from anybody, so it runs start to finish
// inside this one synchronous call:
//   (a) card flush - the ENTIRE card row goes to the discard and exactly
//       INITIAL_MARKET_CARDS fresh cards are dealt.
//   (b) cupcake pot - the TEA PLAYER gains a flat TEA_POT_REWARD cupcakes.
//   (c) FULL tile flush - every tile still on the market returns to the bag, the
//       bag is shuffled, and all cells are dealt afresh. Destructive, not
//       additive: the survivors do not survive.
//
// THE RESERVE ROUND IS DELETED (3 August). Step (a) used to be preceded by a
// clockwise round in which every player could reserve one card from the row for
// free. Free reserves were COMPLETED only 47.7 / 46.2 / 35.8% of the time at
// 2/3/4 players - nobody declines something free, so it was not a decision, it
// was a tax on the clock: roughly 20 table-wide decisions per 4-player game to
// produce about 4.6 completed reserves. Reserving is now a PAID action a player
// takes on their OWN turn (reserveCard, RESERVE_CUPCAKE_COST).
//
// THE CARD FLUSH IS RETAINED DELIBERATELY. It is still the only thing that
// shrinks the card row against MAX_MARKET_CARDS, and now that reserving costs a
// cupcake, a looming flush becomes a real decision: tea is predictable, so a
// player can see the fourth teapot coming and choose whether a card is worth
// paying to protect.
//
// WHAT THE TEA PLAYER GIVES UP (1 August). Because tea fires at the END of a
// turn, the tea player has ALREADY swept - so the freshly dealt 25-tile market
// goes to the player on their left, not to them. That is the deliberate
// counterweight to their pot: ordering tea is a trade, not a pure gain, which is
// what stops the trigger from being something players either farm or dodge.
//
// Step by step:
//   (a) Card flush + redeal: every market card goes to the discard and a fresh
//       INITIAL_MARKET_CARDS cards are dealt (fewer only when deck + discard are
//       exhausted). The row is flushed BY LENGTH, not by assuming a size: it
//       grows a card a turn up to MAX_MARKET_CARDS, and this flush is the ONLY
//       thing that ever cuts it back. A card in a player's personal RESERVE is
//       not in this row and so survives - that is what the reserve buys.
//   (b) Cupcake pot: the TEA player - currentPlayerIndex - gains a flat
//       TEA_POT_REWARD cupcakes. The visible-symbol count is still read BEFORE
//       the tile flush, since (c) covers the symbols again, but it now only feeds
//       the metrics.
//   (c) FULL tile flush: every tile still on the market goes BACK INTO THE BAG,
//       the bag is Fisher-Yates shuffled, and all cells are dealt afresh (a
//       partial fill only if the bag cannot cover the board). This is
//       destructive, not additive — a tile market a player has been building
//       toward does not survive someone else's refresh, which is the whole
//       point of the 28 July change.
//
// `isBackstop` marks the empty-market route (applyEmptyMarketRule) rather than
// the normal end-of-turn teapot trigger. It is what metric 2 counts, and it
// should always be zero in a real game.
//
// `turn` is the turn number the pot is ATTRIBUTED to, and the two routes have to
// pass it in rather than read it here, because they sit on opposite sides of
// refill's stats.turnsPlayed++ - the end-of-turn route fires after the counter
// has already moved on to the next turn, the backstop before. Getting this wrong
// silently shifts the whole refresh-cadence histogram by one turn.
//
// The caller owns what happens NEXT: endTurn rotates the turn on, the backstop
// hands the incoming player their sweep. This function never touches gamePhase.
function brewFreshPot(gameState, { isBackstop, turn }) {
  // (a) Flush the card row, then redeal a fresh market.
  while (gameState.cardMarket.length > 0) {
    const discarded = gameState.cardMarket.shift();
    gameState.cardDiscard.push(discarded);
    metrics(gameState)?.recordCardMarketExit(discarded.id, gameState.stats.turnsPlayed);
  }

  // The row is EMPTY at this point (the loop above emptied it whatever its
  // length), so this deals exactly INITIAL_MARKET_CARDS (3). It is a redeal, NOT
  // a "top the row back up" invariant — nothing anywhere else may assume a
  // fixed row length.
  while (gameState.cardMarket.length < INITIAL_MARKET_CARDS) {
    const newCard = drawCard(gameState);
    if (!newCard) break; // deck + discard exhausted — market simply stays short
    gameState.cardMarket.push(newCard);
    metrics(gameState)?.recordCardMarketEntry(newCard.id, gameState.stats.turnsPlayed);
  }

  const activePlayer = gameState.players[gameState.currentPlayerIndex];

  // (b) Cupcake pot — a FLAT TEA_POT_REWARD, not 1 per symbol (30 July rule).
  // Visible symbols still gate the pot and are still counted here (BEFORE the
  // tile flush covers them again) because the metrics log symbols and reward as
  // separate fields precisely so a payout change like this one cannot rewrite
  // the cadence history.
  const potSize = getVisibleTeapotSymbols(gameState);
  activePlayer.cupcakes += TEA_POT_REWARD;
  metrics(gameState)?.recordCupcakeGain(activePlayer.id, 'pot', TEA_POT_REWARD);
  noteCupcakeSupply(gameState);

  // METRIC 9 (bag skew) is measured across step (c) below: which colours go back
  // into the bag, which colours come out again, and how many of the returned
  // tiles reappear immediately. `returned` exists only when a collector does, so
  // an unmetered game allocates nothing extra.
  const collector = metrics(gameState);
  const returned = collector ? [] : null;

  // (c) FULL tile flush: market -> bag, shuffle, then deal every cell afresh.
  // Return the survivors first so they are genuinely mixed back in and can come
  // straight back out (colour recirculation is a logged metric, not a bug).
  for (let i = 0; i < gameState.market.length; i++) {
    if (gameState.market[i] !== null && gameState.market[i] !== undefined) {
      if (returned) returned.push(gameState.market[i]);
      gameState.bag.push(gameState.market[i]);
      gameState.market[i] = null;
    }
  }
  // Fisher-Yates (matches createTileBag in tiles.js and the deck reshuffle in
  // drawCard) — without it the returned tiles would sit in a predictable block
  // at the end of the bag.
  const bag = gameState.bag;
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
  let filledAny = false;
  for (let i = 0; i < gameState.market.length; i++) {
    if (bag.length === 0) break; // bag ran dry — fill what we can, as the rules say
    gameState.market[i] = bag.shift();
    filledAny = true;
  }
  if (filledAny) {
    metrics(gameState)?.recordMarketFill();
  }

  // METRICS 1, 2 and 9, all of which need the flush to be over before they can be
  // written. The refresh row carries everything the design doc asks for about this
  // firing: when, who, how many symbols were showing, what it paid, and whether it
  // was the normal end-of-turn trigger or the empty-board backstop.
  if (collector) {
    // `returned` holds every tile the flush swept off the market, so its length
    // IS the tile count on the board when the pot was called.
    collector.recordRefresh(
      // The turn the pot was TRIGGERED on, passed in by the caller - not
      // stats.turnsPlayed, which the end-of-turn route has already advanced past.
      turn,
      activePlayer.id,
      potSize,
      TEA_POT_REWARD,
      isBackstop,
      returned.length,
    );
    // Bag skew: the colours that went back in, the colours dealt out, and how many
    // of the tiles just returned came straight back onto the board.
    const returnedSet = new Set(returned);
    const dealtColours = [];
    let immediateReturns = 0;
    for (const tile of gameState.market) {
      if (!tile) continue;
      dealtColours.push(tile.colour);
      if (returnedSet.has(tile)) immediateReturns++;
    }
    collector.recordBagFlush(returned.map(t => t.colour), dealtColours, immediateReturns);
  }

  // (d) THE POT TOUCHES THE TASTING MENUS NOT AT ALL, and that absence is the
  // rule rather than an omission. The Freshness Bonus put every token back here;
  // the Tasting Menu has no reset of any kind, because a reward on a reset cycle
  // is by construction never your last chance at it. If a line reappears below
  // this comment, the module has lost the one property it was built for.
}

export function place(gameState, placements) {
  if (gameState.gamePhase !== 'place') throw new Error('Not in place phase');

  // Defence in depth: the transition helpers above normally fire overflow
  // before place() is ever reached, but a driver that constructs a place-phase
  // state directly could still arrive here with an over-full board.
  if (checkBoardOverflowOnPlace(gameState)) return gameState;

  if (placements.length !== gameState.pendingSweepTiles.length) {
    throw new Error('Must place all swept tiles');
  }

  const player = gameState.players[gameState.currentPlayerIndex];

  for (let i = 0; i < placements.length; i++) {
    const boardIndex = placements[i];
    const tile = gameState.pendingSweepTiles[i];

    if (boardIndex < 0 || boardIndex >= BOARD_SIZE * BOARD_SIZE) throw new Error('Invalid board position');
    const cell = player.board[boardIndex];
    if (cell !== null) throw new Error('Cell already occupied or blocked');

    player.board[boardIndex] = tile;
  }

  gameState.pendingSweepTiles = [];
  // The 'move' phase was renamed 'spend' on 3 August: it now hosts three paid
  // options (move a tile, move an empty plate, reserve a card), not just the one.
  gameState.gamePhase = 'spend';

  return gameState;
}

// Destinations a removed tile may go when a card is claimed. The crumb tray is
// ALWAYS a legal choice (a real strategic option, never a mere fallback).
//
// ONE-ROW-PER-INGREDIENT RULE: an ingredient may only ever appear on a single
// stand row. A row is a legal destination for this tile when it has spare
// capacity AND either
//   - it is already locked to this tile's ingredient (extend its own row), or
//   - it is unlocked (ingredient === null) AND no other row is already locked
//     to this ingredient (opening a fresh row is only legal the first time an
//     ingredient is plated).
// Consequence: once an ingredient's row is full, every future tile of that
// ingredient can only go to the crumb tray.
export function getLegalDestinations(player, tile) {
  const destinations = [{ type: 'crumb' }];
  const ingredientAlreadyPlated = player.stand.some(row => row.ingredient === tile.ingredient);
  for (let rowIndex = 0; rowIndex < player.stand.length; rowIndex++) {
    const row = player.stand[rowIndex];
    if (row.tiles.length >= row.capacity) continue;
    const extendsOwnRow = row.ingredient === tile.ingredient;
    const opensFreshRow = row.ingredient === null && !ingredientAlreadyPlated;
    if (extendsOwnRow || opensFreshRow) {
      destinations.push({ type: 'row', rowIndex });
    }
  }
  return destinations;
}

// Claim a reward card: complete its pattern on the board, plant a tart token on
// one of the matched cells, and send the tile that was there to a stand row or
// the crumb tray.
//
// CARD-ROW EFFECT (28 July rework, §5): a claim only ever REMOVES a card. The
// old "draw the top card of the deck to return the market to 4" rule is DELETED,
// so the row is one card shorter for the rest of the turn. The single
// replenishment point is the end-of-turn deal in refill(), which runs on every
// turn whether or not anything was claimed. A claim from the RESERVE touches the
// row not at all (the card left it when it was reserved) but still gets that
// end-of-turn deal, so a reserve claim actually GROWS the row by one.
export function claim(gameState, cardId, removedBoardIndex, destination) {
  const player = gameState.players[gameState.currentPlayerIndex];
  const extraClaimCost = getExtraClaimCupcakeCost();

  // ONE CLAIM PER TURN (§6), checked BEFORE the phase gate and deliberately so.
  // Under the adopted rule a successful claim leaves the turn in the 'refill'
  // phase, so a second attempt would otherwise trip the phase check and come back
  // as "Not in claim phase" - true, useless, and the single most common thing
  // players get wrong about this game. The counter is the rule; the phase gate
  // below stays as structural defence. These messages are rule EXPLANATIONS and
  // the UI is expected to surface them to the player as such.
  if (gameState.claimsThisTurn > 0) {
    if (extraClaimCost === null) {
      throw new Error('Only one claim per turn');
    }
    // Variant enabled: extra claims are for sale, but only to a player who can
    // actually pay for this one.
    if (player.cupcakes < extraClaimCost) {
      throw new Error(`Not enough cupcakes for an extra claim (costs ${extraClaimCost}, you have ${player.cupcakes})`);
    }
  }

  if (gameState.gamePhase !== 'claim') throw new Error('Not in claim phase');

  // No empty plates left in the table's supply, no claim - see canClaimMore,
  // which since 4 August stops binding once the ending is armed (the final
  // round's plates come from an unlimited supply). So this can only fire on the
  // turn that spends the last plate, which is the turn that arms the ending.
  if (!canClaimMore(gameState)) {
    throw new Error('No empty plates left - the supply is exhausted');
  }
  // Card lookup order: the shared market first, then this player's personal
  // reserve. A reserved card completes exactly like a market card except the row
  // is not spliced (see the fromReserve branches below), since the card left the
  // row when it was reserved.
  const cardIndex = gameState.cardMarket.findIndex(c => c.id === cardId);
  const reserveIndex = cardIndex === -1
    ? player.reservedCards.findIndex(c => c.id === cardId)
    : -1;
  const fromReserve = reserveIndex !== -1;
  if (cardIndex === -1 && !fromReserve) throw new Error('Card not in market');

  // A RESERVE IS A FORWARD COMMITMENT (3 August): you may not claim a card in the
  // same turn you paid to reserve it. Without this, the paid reserve would just be
  // a 1-cupcake way to reach past the row on the turn you needed it.
  if (gameState.reservedCardIdThisTurn === cardId) {
    throw new Error('You cannot claim a card on the same turn you reserved it');
  }

  const card = fromReserve ? player.reservedCards[reserveIndex] : gameState.cardMarket[cardIndex];
  const matches = getPatternMatches(player.board, card.pattern);

  if (matches.length === 0) throw new Error('Pattern not found on board');

  const allValidCells = new Set();
  for (const match of matches) {
    match.cells.forEach(cell => allValidCells.add(cell));
  }

  if (!allValidCells.has(removedBoardIndex)) {
    throw new Error('Removed tile not in any valid matching pattern');
  }

  const removedTile = player.board[removedBoardIndex];
  if (!removedTile || removedTile.type === 'blocked') {
    throw new Error('Cannot remove blocked or empty cell');
  }

  // Validate the destination before mutating any state. getLegalDestinations is
  // the single source of truth for the one-row-per-ingredient rule (see there),
  // so the requested destination must appear among its results.
  if (!destination || typeof destination !== 'object' || (destination.type !== 'row' && destination.type !== 'crumb')) {
    throw new Error('Invalid or missing destination');
  }
  if (destination.type === 'row') {
    const { rowIndex } = destination;
    if (!Number.isInteger(rowIndex) || rowIndex < 0 || rowIndex >= player.stand.length) {
      throw new Error('Invalid stand row index');
    }
  }
  const legal = getLegalDestinations(player, removedTile);
  const isLegal = legal.some(d =>
    d.type === destination.type && (d.type !== 'row' || d.rowIndex === destination.rowIndex)
  );
  if (!isLegal) {
    // Distinguish the common row-rejection reasons for a clearer message.
    if (destination.type === 'row') {
      const row = player.stand[destination.rowIndex];
      if (row.tiles.length >= row.capacity) throw new Error('Stand row is full');
      if (row.ingredient !== null && row.ingredient !== removedTile.ingredient) {
        throw new Error('Stand row is locked to a different ingredient');
      }
      throw new Error('Ingredient is already plated on another row');
    }
    throw new Error('Illegal claim destination');
  }

  if (destination.type === 'row') {
    plateTileOntoRow(gameState, player, destination.rowIndex, removedTile);
  } else {
    player.crumbTray.push(removedTile);
  }

  // THE TASTING MENU. The trigger is the STAND, not the removal: a menu reads the
  // ingredients on your cake stand, so only a 'row' destination can change
  // qualification and a tile sent to the crumb tray can never complete one.
  //
  // IT SITS AFTER THE DESTINATION BRANCH, and therefore after every validation has
  // passed, for two reasons that both matter: a rejected claim must never score,
  // and the stand must ALREADY CONTAIN the new tile when the check runs.
  //
  // VERIFIED 5 AUGUST: claim's 'row' branch is the only caller of plateTileOntoRow
  // and plateTileOntoRow is the only code path that pushes onto a stand row's
  // tiles array, so this is genuinely the only route by which a tile can enter a
  // cake stand. If a spend-step effect, a bonus tile or an end-of-game placement
  // ever gains one, the check must fire there too - a player who qualifies
  // silently and is never awarded looks like bad luck, not like a crash.
  //
  // FIRST TO QUALIFY WINS IT, AND IT NEVER COMES BACK. takenBy goes null -> id
  // exactly once. A second player meeting the same menu scores nothing; the loop
  // below cannot even see the card, because getClaimableMenus filters on takenBy.
  //
  // INGREDIENTS ARE NOT CONSUMED, so the loop takes EVERY menu the stand now meets
  // rather than stopping at the first - unless TASTING_MENU_ONE_PER_TURN is on.
  if (tastingMenusEnabled && destination.type === 'row') {
    for (const menu of getClaimableMenus(gameState, player)) {
      menu.takenBy = player.id;
      player.tastingMenus.push(menu.id);
      metrics(gameState)?.recordTastingMenuTaken(player.id, menu.id, gameState.stats.turnsPlayed);
      if (TASTING_MENU_ONE_PER_TURN) break;
    }
  }

  player.board[removedBoardIndex] = { type: 'blocked' };
  player.claimedCards.push(cardId);
  // A claim breaks the empty-market deadlock watch (see the backstop).
  gameState.turnsSinceLastClaim = 0;

  // fromReserve feeds the claims-from-reserve fraction metric (6). The row length
  // is passed for metric 3's "row size when the FIRST claim occurs" - read here,
  // before the splice below, so a market claim counts the card it is taking.
  //
  // The fifth argument was the TEA PERIOD, added for the Freshness Bonus so its
  // per-period race had a denominator. The Tasting Menu has no periods - it has no
  // reset at all - so the argument is gone with the module that wanted it. Claims
  // are still counted; they are simply not bucketed by anything.
  metrics(gameState)?.recordCardClaimed(
    cardId, gameState.stats.turnsPlayed, fromReserve, gameState.cardMarket.length,
  );
  // A reserved card already recorded its market exit when it was reserved.
  if (!fromReserve) {
    metrics(gameState)?.recordCardMarketExit(cardId, gameState.stats.turnsPlayed);
  }

  if (fromReserve) {
    // Completing a reserved card: remove just that card from the reserve (the
    // rest stay on order). The market is untouched — the card left it when it
    // was reserved.
    player.reservedCards.splice(reserveIndex, 1);
  } else {
    // The card simply LEAVES the row. No replacement is drawn here (28 July: the
    // claim-refill rule is deleted). The row is replenished once per turn, at the
    // end of the turn, by refill() — see the end-of-turn deal there.
    gameState.cardMarket.splice(cardIndex, 1);
  }

  // Pay for the claim if it was an EXTRA one under the variant (the first claim
  // of a turn is always free). Charged here, after every validation has passed,
  // so a rejected claim never costs a player anything.
  if (gameState.claimsThisTurn > 0 && extraClaimCost !== null) {
    player.cupcakes -= extraClaimCost;
    // Metric 8: the only cupcake spend other than the move. Normally 0 for a whole
    // simulation run, since the variant ships disabled.
    metrics(gameState)?.recordCupcakeSpend(player.id, 'extraClaim', extraClaimCost);
  }
  gameState.claimsThisTurn++;

  // Under the ADOPTED rule the claim step ends the instant a claim lands - one
  // claim, then on to the end of the turn. Under the variant the player may go
  // again, so the phase must stay 'claim' or the variant would be unplayable
  // (this is the whole of the "single constant flip" promise). The exception is a
  // player who can no longer pay for another: there is nothing left for them to
  // decide, so close the step rather than making every driver poll a dead phase.
  if (extraClaimCost === null || player.cupcakes < extraClaimCost) {
    gameState.gamePhase = 'refill';
  }
  return gameState;
}

// What relocating the cell at `index` costs, or null when nothing there can be
// moved. ONE PRICE NOW: only a TILE can be moved, at MOVE_TILE_CUPCAKE_COST.
//
// AN EMPTY PLATE RETURNS null, exactly as an empty cell does. Moving a plate was
// deleted when removing one was introduced (see REMOVE_PLATE_CUPCAKE_COST), and
// null is what makes every existing caller - UI affordance checks, bot move
// search - skip plates without any of them being taught the new rule separately.
// Public so the UI can price the option before the player commits to it, and so
// bots do not hardcode the number.
export function getMoveCost(player, index) {
  const cell = player.board[index];
  if (cell === null || cell === undefined) return null;
  if (isBlockedSpace(cell)) return null; // plates are removed, never moved
  return MOVE_TILE_CUPCAKE_COST;
}

// Relocate one tile on your own board, at the spend step. ONE MOVE PER TURN.
//
// PLATES ARE NO LONGER MOVABLE (3 August, second revision). This used to accept
// either a tile or an empty plate at two different prices; the plate half is now
// removePlate, which takes the plate off the board entirely for
// REMOVE_PLATE_CUPCAKE_COST. Passing a plate index here throws.
export function moveTile(gameState, fromIndex, toIndex) {
  if (gameState.gamePhase !== 'spend') {
    throw new Error('Can only move tiles in the spend phase');
  }
  if (gameState.moveUsedThisTurn) {
    throw new Error('Can only move one tile per turn');
  }
  const player = gameState.players[gameState.currentPlayerIndex];
  // Reject the plate case with its own message: "no tile at source cell" would
  // be actively misleading for a caller written against the old two-price rule.
  if (isBlockedSpace(player.board[fromIndex])) {
    throw new Error('Empty plates cannot be moved - remove it instead (removePlate)');
  }
  const cost = getMoveCost(player, fromIndex);
  if (cost === null) throw new Error('No tile at source cell');
  if (player.cupcakes < cost) {
    throw new Error(`Not enough cupcakes to move a tile (costs ${cost}, you have ${player.cupcakes})`);
  }
  if (player.board[toIndex] !== null) throw new Error('Target cell is occupied or blocked');

  player.board[toIndex] = player.board[fromIndex];
  player.board[fromIndex] = null;
  player.cupcakes -= cost;
  gameState.moveUsedThisTurn = true;
  metrics(gameState)?.recordCupcakeSpend(player.id, 'moveTile', cost);
  return gameState;
}

// SPEND 3 CUPCAKES: REMOVE AN EMPTY PLATE FROM YOUR BOARD, TO THE BOX.
//
// Every claim plants an empty plate on the cell the sacrificed tile came from -
// by construction in the middle of good territory - and a plate is the one
// obstruction that cannot be built around, because no tile may be placed on it.
// This is the outlet that undoes that, permanently.
//
// THE PLATE LEAVES THE GAME. It is not returned to any supply, and there is no
// supply for it to be returned to: the engine has never tracked plates as
// per-player inventory, it counts CLAIMS MADE against gameState.cardsNeededToEnd
// (isCardEndConditionMet). So removing a plate cannot buy an extra claim or move
// the game's clock in either direction - it buys one cell of board space. See
// REMOVE_PLATE_CUPCAKE_COST for why that is worth 3.
//
// ONE PER TURN, mirroring the move allowance. At 3 cupcakes against a measured
// income of about 5 per player per GAME a second one is nearly unaffordable
// anyway, so this bounds a degenerate state rather than shaping normal play.
export function removePlate(gameState, index) {
  if (gameState.gamePhase !== 'spend') {
    throw new Error('Can only remove a plate in the spend phase');
  }
  if (gameState.plateRemovedThisTurn) {
    throw new Error('Can only remove one empty plate per turn');
  }
  const player = gameState.players[gameState.currentPlayerIndex];
  if (!isBlockedSpace(player.board[index])) {
    throw new Error('No empty plate at that cell');
  }
  if (player.cupcakes < REMOVE_PLATE_CUPCAKE_COST) {
    throw new Error(`Not enough cupcakes to remove a plate (costs ${REMOVE_PLATE_CUPCAKE_COST}, you have ${player.cupcakes})`);
  }

  player.board[index] = null;
  player.cupcakes -= REMOVE_PLATE_CUPCAKE_COST;
  gameState.plateRemovedThisTurn = true;
  gameState.platesReturnedToBox++;
  metrics(gameState)?.recordCupcakeSpend(player.id, 'removePlate', REMOVE_PLATE_CUPCAKE_COST);
  return gameState;
}

// True when the active player could legally pay to remove a plate right now.
// Shared by drivers, bots and UI so none of them re-derives removePlate's gate.
export function canRemovePlate(gameState) {
  if (gameState.gamePhase !== 'spend') return false;
  if (gameState.plateRemovedThisTurn) return false;
  const player = gameState.players[gameState.currentPlayerIndex];
  if (player.cupcakes < REMOVE_PLATE_CUPCAKE_COST) return false;
  return player.board.some(cell => isBlockedSpace(cell));
}

// SPEND 1 CUPCAKE: RESERVE A CARD FROM THE MARKET (3 August). The card-side
// outlet, replacing the free tea-round reserve (see brewFreshPot).
//
//   - available on your OWN turn, at the spend step;
//   - takes 1 card from the card market into your personal reserve;
//   - RESERVE LIMIT IS 1 - illegal if your reserve is already occupied;
//   - you may NOT claim a card in the same turn you reserved it. A reserve is a
//     forward commitment, not a way to reach past the row for this turn's claim.
// Reserved cards are face-up, as before, and an uncompleted reserve still scores
// 0. Claiming from reserve is unchanged in every other respect.
//
// WHY IT IS NOT REDUNDANT WITH THE EXTRA TILE. 60% of card-locked turns cannot be
// cured by an extra tile at all, so a card-side outlet is complementary rather
// than a second door to the same room. And paying for a reserve means you only
// take cards you intend to finish - the free version was completed barely a third
// of the time at 4 players.
export function reserveCard(gameState, cardId) {
  if (gameState.gamePhase !== 'spend') {
    throw new Error('Can only reserve a card in the spend phase');
  }
  const player = gameState.players[gameState.currentPlayerIndex];
  if (player.reservedCards.length >= RESERVE_LIMIT) {
    throw new Error('Your reserve is already occupied');
  }
  if (player.cupcakes < RESERVE_CUPCAKE_COST) {
    throw new Error(`Not enough cupcakes to reserve a card (costs ${RESERVE_CUPCAKE_COST}, you have ${player.cupcakes})`);
  }
  const marketIndex = gameState.cardMarket.findIndex(c => c.id === cardId);
  if (marketIndex === -1) throw new Error('Card not in market');

  const [card] = gameState.cardMarket.splice(marketIndex, 1);
  player.reservedCards.push(card);
  player.cupcakes -= RESERVE_CUPCAKE_COST;
  // The card is off-limits for THIS turn's claim - see the rule note above.
  gameState.reservedCardIdThisTurn = card.id;

  // The card leaves the market here (when reserved), so a later claim from the
  // reserve must NOT record another market exit for it.
  metrics(gameState)?.recordCardMarketExit(card.id, gameState.stats.turnsPlayed);
  metrics(gameState)?.recordReserve(player.id, card.id, gameState.stats.turnsPlayed);
  metrics(gameState)?.recordCupcakeSpend(player.id, 'reserve', RESERVE_CUPCAKE_COST);

  return gameState;
}

// True when the active player could legally pay to reserve a card right now.
// Shared by drivers, bots and UI so none of them re-derives reserveCard's gate.
export function canReserveCard(gameState) {
  if (gameState.gamePhase !== 'spend') return false;
  const player = gameState.players[gameState.currentPlayerIndex];
  if (player.reservedCards.length >= RESERVE_LIMIT) return false;
  if (player.cupcakes < RESERVE_CUPCAKE_COST) return false;
  return gameState.cardMarket.length > 0;
}

// The single entry into the claim phase, which is why the card-lock and
// multi-match sample is taken here: it runs once per turn, on every turn that
// reaches a claim decision, and after any spend that might have created a match.
// (A turn cut short by the board-overflow finale never reaches this and so
// contributes no sample — the report carries the sample count for that reason.)
export function skipSpend(gameState) {
  if (gameState.gamePhase !== 'spend') throw new Error('Not in spend phase');
  gameState.gamePhase = 'claim';
  sampleClaimOpportunity(gameState);
  return gameState;
}

// Pre-3-August name for skipSpend, kept so an older driver still runs. New code
// should call skipSpend - the phase is 'spend' and it closes three options, not
// just the move.
export const skipMove = skipSpend;

export function skipClaim(gameState) {
  if (gameState.gamePhase !== 'claim') throw new Error('Not in claim phase');
  gameState.gamePhase = 'refill';
  return gameState;
}

// THE END-OF-TURN DEAL (28 July rework, §5; capped 30 July). ONE card goes from
// the deck onto the card row at the end of EVERY turn - claim or no claim, market
// claim or reserve claim - with TWO exceptions: the row already holds
// MAX_MARKET_CARDS, or a fresh pot of tea is due. Either way the deal is skipped
// and the row stands still. It is not a decision any player or bot makes.
//
// THE TEA EXCEPTION (1 August clarification). A FRESH POT REPLACES THE DEAL: it
// does not happen on top of it. See refill() for why.
//
// THE CAP (30 July rule change). The 28 July design deliberately had no cap,
// arguing an uncapped row was the staleness valve: a row nobody can claim from
// grows until somebody can, whereas a full capped row stops changing and can
// freeze. The designer overrode that on 30 July: the row starts at
// INITIAL_MARKET_CARDS (now 3) and never exceeds MAX_MARKET_CARDS (8). The
// tea-flush escape hatch is what makes the cap safe where the old frozen-market
// failure wasn't: a stale row at the cap can always be flushed and redealt by
// ordering a fresh pot of tea (finishTeaRound step b cuts it back to
// INITIAL_MARKET_CARDS), so a deadlock now has a player-driven exit.
//
// WHY EVERY TURN, RATHER THAN ONLY WHEN THE PLAYER DID NOT CLAIM. Dealing only
// on claimless turns would let a table of claiming opponents starve a player who
// cannot claim: every card revealed for them would be taken before their next
// turn and the row would never grow. Dealing every turn (cap permitting)
// guarantees that a player who cannot claim sees at least one new card by their
// next turn whenever the row has room.
//
// PLACEMENT: this runs at the TOP of refill(), i.e. before the end-condition
// checks and before advanceToNextTurn's rotation. Two reasons.
//   1. It is a step of the turn that is ENDING, not of the next one. Rotating
//      first would attribute the card to the incoming player.
//   2. Running it ahead of the end checks keeps it a single straight-line
//      statement instead of something that has to be repeated down each of
//      endTurn's branches, where a future edit could quietly drop one.
//      Dealing on the final turn costs nothing - the row is not scored.
// drawCard reshuffles the discard pile when the deck runs out and returns null
// only when deck AND discard are both empty, in which case the row simply does
// not grow this turn.
function dealEndOfTurnCard(gameState) {
  if (gameState.cardMarket.length >= MAX_MARKET_CARDS) return; // row at the cap - no deal
  const newCard = drawCard(gameState);
  if (!newCard) return; // deck + discard exhausted - the row stands still
  gameState.cardMarket.push(newCard);
  metrics(gameState)?.recordCardMarketEntry(newCard.id, gameState.stats.turnsPlayed);
}

export function refill(gameState) {
  if (gameState.gamePhase !== 'refill') throw new Error('Not in refill phase');

  // (The end-of-turn ingredient-objective check used to run here, first. The
  // pantry goals are deleted - see the note at the top of this file.)

  // The TILE market never refills a cell at a time. It is refreshed ONLY by a
  // fresh pot of tea (finishTeaRound step d) - normally by the end-of-turn
  // teapot trigger, or by the empty-market backstop. The CARD row is the
  // opposite: it is topped up here and nowhere else.
  //
  // A FRESH POT REPLACES THE END-OF-TURN DEAL (1 August clarification). The two
  // are alternatives, not a sequence: a turn either adds one card to the row, or
  // brews a pot, never both.
  //
  // WHY. A card dealt at the very end of the turn would be flushed to the discard
  // moments later without anybody having had a turn in which to want it - it
  // would burn a card off the deck to no effect. Skipping the deal costs the deck
  // one card less per refresh. (Under the deleted reserve round this also kept
  // fresh information out of the draft; that reason is gone, the deck one is not.)
  //
  // The trigger is evaluated ONCE, here, and handed to endTurn. Nothing between
  // the two touches the market or the bag so a second isTeaDue call would agree,
  // but one evaluation means the deal and the pot can never disagree about
  // whether this is a tea turn.
  //
  // 4 AUGUST: `teaDue` now means "the market needs refilling", which is not the
  // same as "a pot gets brewed" - with an empty bag it ends the game instead (see
  // endTurn). The card deal is skipped either way. A game whose last act is to
  // trigger the end has no use for one more card in a row nobody will claim from,
  // and skipping it keeps this a single flag rather than two.
  const teaDue = isTeaDue(gameState);
  if (!teaDue) dealEndOfTurnCard(gameState);

  // The turn just PLAYED is counted here, at the one point every turn passes
  // through, rather than in advanceToNextTurn. Two of endTurn's branches end
  // the game without rotating, so counting on rotation dropped the final turn:
  // a game the collector saw 22 sweeps in reported "Turns Played 21". Counted
  // after dealEndOfTurnCard so the turn stamps on card-market entries are
  // unchanged.
  gameState.stats.turnsPlayed++;

  endTurn(gameState, teaDue);

  return gameState;
}

// Close the turn that has just been played: resolve the end conditions that stop
// a rotation, then either order the end-of-turn fresh pot of tea or rotate.
//
// SPLIT OUT OF refill (1 August) because the tea round used to be INTERACTIVE.
// Since 3 August the pot is mechanical (brewFreshPot runs start to finish in one
// call), so this no longer parks the game mid-turn and drivers no longer need a
// tea case at all. They must still dispatch on gamePhase after refill(), because
// the rotation can end the game outright.
//
// teaDue is passed in rather than re-derived: refill needed the same answer to
// decide whether to skip the end-of-turn card deal, and the pot replaces that
// deal, so both must come from one evaluation.
function endTurn(gameState, teaDue) {
  // THE CARD END CONDITION: the table's empty plate pool is spent. Since
  // 4 August this ARMS the ending rather than stopping play, so the branch that
  // used to return here does not exist any more - the turn runs on through the
  // pot and the rotation exactly as a normal one does, and advanceToNextTurn
  // closes the game when the round completes.
  //
  // Checked every turn, including during the final round - but it can only ARM
  // the ending, never re-arm it, so the extra claims the final round now permits
  // (canClaimMore stops binding once armed, 4 August) cannot restate the reason
  // or extend anything. The condition simply stays true once it is true.
  if (isGameOver(gameState)) triggerEndGame(gameState, 'cardMarket');

  // THE END-OF-TURN FRESH POT OF TEA (1 August rule change). Resolved here, after
  // the end conditions that would stop the game outright - there is no point
  // brewing for a game that is already over - and before the rotation, so the pot
  // goes to the player whose turn this was. See isTeaDue for why the trigger moved
  // here from the start of a turn, and brewFreshPot for what the tea player
  // trades away.
  //
  // NOT a decision: there is no "may" left in the rule. The choice sits upstream,
  // in whether the player's sweep uncovers that fourth teapot at all.
  //
  // refill() has already skipped this turn's card deal on the strength of the
  // same flag - the pot replaces it.
  //
  // THE TILE END CONDITION LIVES HERE (4 August). "You need to refill the tile
  // market and the bag is already empty" is precisely this line: teaDue is the
  // need, an empty bag is the inability, and the two together trigger the end.
  // Neither alone does - a due pot with tiles left brews normally, and a bag that
  // has quietly hit zero is not an ending until something asks it for tiles.
  //
  // NO POT IS POURED on that firing: no card flush, no cupcake, no tile deal. The
  // refresh did not happen, so nothing that a refresh pays for happens either.
  if (teaDue) {
    if (gameState.bag.length === 0) {
      triggerEndGame(gameState, 'bagEmpty');
    } else {
      // refill() has already counted the turn that just played, so the pot belongs
      // to turnsPlayed - 1, not to the turn about to start.
      brewFreshPot(gameState, { isBackstop: false, turn: gameState.stats.turnsPlayed - 1 });
    }
  }

  advanceToNextTurn(gameState);
}

// Rotate to the next player's turn, then resolve everything that is settled at a
// turn boundary.
//
// THE EQUAL-TURNS STOP (4 August rule change) is the first thing checked after
// the rotation, and it is the ONLY place the game is ever declared over. Once any
// condition has armed endTriggered, play continues until the turn comes back
// round to startPlayerIndex, so every player has had exactly the same number of
// turns; the game is scored at that boundary.
//
// This replaced a pair of turn-boundary end checks whose stated justification was
// "so every player has had an equal number of turns" and which did not deliver
// it: ending at the boundary in FRONT of seat 3 leaves seats 1-2 a turn up on
// seats 3-4. Finishing the round is what actually delivers it.
//
//   BOARD-FULL TRIGGER: the incoming player's personal board is completely full
//     (tiles + tart tokens), so they cannot place anything they sweep. It arms
//     the ending; the player still takes their remaining turns, and
//     checkBoardOverflowOnPlace discards whatever they sweep.
//
// THE EMPTY-BAG CHECK IS GONE FROM HERE. An empty bag is no longer an ending in
// itself (4 August) - see endTurn, where a needed refill against an empty bag is.
//
// NOTE: this does not always leave the game in the 'sweep' phase. The
// empty-market rule below can leave the incoming player in 'spend' via its
// deadlock branch, and the stop above can end the game - drivers must dispatch on
// gamePhase (and check gameOver) after every turn rotation rather than assuming a
// sweep is next.
function advanceToNextTurn(gameState) {
  // stats.turnsPlayed is NOT incremented here — refill() counts the turn that
  // just played, so turns that end the game without rotating still count.
  gameState.currentPlayerIndex = (gameState.currentPlayerIndex + 1) % gameState.players.length;
  // EVERY per-turn allowance resets here, in one place, so they cannot drift
  // apart: the one-claim-per-turn allowance, the one tile move, the one extra
  // tile, the one plate removal, and the same-turn reserve lock.
  gameState.claimsThisTurn = 0;
  gameState.moveUsedThisTurn = false;
  gameState.extraTileUsedThisTurn = false;
  gameState.plateRemovedThisTurn = false;
  gameState.reservedCardIdThisTurn = null;
  gameState.gamePhase = 'sweep';
  // Count this turn toward the empty-market deadlock watch (reset by any claim).
  gameState.turnsSinceLastClaim++;

  // THE EQUAL-TURNS STOP. The turn has come back round to the start player, so
  // every seat has had the same number of turns and an armed ending can be
  // honoured. This is the one and only exit.
  if (gameState.endTriggered && gameState.currentPlayerIndex === gameState.startPlayerIndex) {
    gameState.gameOver = true;
    calculateFinalScores(gameState);
    return;
  }

  const nextPlayer = gameState.players[gameState.currentPlayerIndex];
  if (getValidPlacements(nextPlayer.board).length === 0) {
    triggerEndGame(gameState, 'boardFull');
  }

  // Metric: the incoming turn is definitely going to be played (the stop above
  // did not fire), so sample its opening state. Deliberately BEFORE
  // applyEmptyMarketRule: a backstop refresh would otherwise have already moved
  // brewed a backstop pot and flushed the row, and metric 3 wants the row the
  // player was handed, while the trigger invariant wants isTeaDue's honest answer
  // about the board this player was actually handed.
  sampleTurnStart(gameState);

  applyEmptyMarketRule(gameState);
}

// EMPTY-MARKET RULE (the backstop). A sweep is legal whenever any tile sits on
// the market, so the only unplayable sweep is a COMPLETELY EMPTY tile market.
// Checked at the start of every new turn's sweep phase:
//   - Market empty, bag has tiles: a fresh pot of tea is forced. It is a normal
//     one in every way — reserve round, card flush, and the same flat
//     TEA_POT_REWARD — except that it fires at the START of a turn, so the
//     incoming player collects the pot AND sweeps the board they just refilled.
//
//     UNREACHABLE SINCE 1 AUGUST, and kept only as defence in depth. An empty
//     market shows all five teapot symbols, which is above REFRESH_THRESHOLD, so
//     the player who swept the board bare now triggers the end-of-turn pot
//     themselves and refills it before the turn passes on. A turn can therefore
//     never BEGIN on an empty market. Metric 2 counts firings of this branch and
//     should read zero for every real game; a non-zero count means the
//     end-of-turn trigger has a hole in it.
//
//     (This branch also carried the old "whoever emptied the board gifts the next
//     player the maximum reward" tension. That was deliberate as a rare deterrent
//     against stripping the board bare, but it was the same shape as the
//     start-of-turn tea rule the 1 August change removed - see isTeaDue - and it
//     is now simply dead code rather than a live incentive.)
//   - Market AND bag empty: a flush cannot produce a single tile. The player
//     skips the sweep and place steps and goes straight to the spend phase, so
//     they can still move a tile and claim - a turn with no tiles to take is not
//     a turn with nothing to do. The ending is armed as 'marketTiles' if nothing
//     has armed one already.
//
//     REACHABLE AGAIN SINCE 4 AUGUST, in the final round only. An empty bag
//     stopped being an ending in itself, so a game CAN now run its last turns
//     with the bag at zero, and a player who strips the last tiles off the market
//     hands their neighbour exactly this state. It cannot spin: endTriggered is
//     already set by the time it happens (an empty market shows five teapot
//     symbols, so the previous turn's isTeaDue found a dry bag and triggered), and
//     the equal-turns stop closes the game at the end of the round regardless. The
//     old turnsSinceLastClaim countdown that used to guard this is therefore
//     redundant and is gone - the round boundary is the guard.
// Called from advanceToNextTurn, the normal turn rotation, and from there only.
// Since 3 August a pot is mechanical, so this branch brews one and hands the
// incoming player their sweep in the same call - there is no interactive round
// for a caller to drive and no route flag to tell apart.
function applyEmptyMarketRule(gameState) {
  if (!gameState.market.every(t => t === null)) return; // tiles present — normal sweep

  // The bag check comes first, so a refresh is never forced on a state that could
  // not satisfy it. An empty bag falls through to the valve below.
  if (gameState.bag.length > 0) {
    // Log it as a backstop firing: the metric means "a turn began on a tile
    // market that ran dry", which the end-of-turn trigger is supposed to make
    // impossible. Should be zero.
    metrics(gameState)?.recordBackstopFiring(gameState.stats.turnsPlayed);
    // The backstop fires at the START of a turn, so turnsPlayed already names
    // that turn - no adjustment, unlike the end-of-turn route. The incoming
    // player is still owed their whole turn, and step (c) has just filled every
    // cell, so hand them their sweep on the board they just refilled.
    brewFreshPot(gameState, { isBackstop: true, turn: gameState.stats.turnsPlayed });
    gameState.gamePhase = 'sweep';
    return;
  }

  // Market and bag both empty. Arm the ending if nothing else has (triggerEndGame
  // keeps the first reason, so in the expected case this is a no-op and the
  // player is still told it was the tea that could not be poured), then jump to
  // the spend phase so the player can still move a tile and claim this turn.
  triggerEndGame(gameState, 'marketTiles');
  gameState.gamePhase = 'spend';
}

export function getValidSweeps(gameState) {
  const sweeps = [];

  for (let rowOrCol = 0; rowOrCol < gameState.marketSize; rowOrCol++) {
    for (const isRow of [true, false]) {
      const tiles = isRow ? getRowTiles(gameState.market, rowOrCol, gameState.marketSize) : getColumnTiles(gameState.market, rowOrCol, gameState.marketSize);
      const colours = new Set();
      const ingredients = new Set();

      for (const tile of tiles) {
        if (tile) {
          colours.add(tile.colour);
          ingredients.add(tile.ingredient);
        }
      }

      for (const colour of colours) {
        sweeps.push({ rowOrCol, isRow, declaration: colour, declarationType: 'colour' });
      }
      for (const ingredient of ingredients) {
        sweeps.push({ rowOrCol, isRow, declaration: ingredient, declarationType: 'symbol' });
      }
    }
  }

  return sweeps;
}

// Pattern matching for 3×2 grid patterns (also handles 2×3 via rotation)
// Pattern grid representation:
// 3×2: [0, 1, 2,  (top row)
//       3, 4, 5]  (bottom row)
// 2×3: [0, 1,
//       2, 3,
//       4, 5]

// Convert a 6-cell card pattern (3 wide × 2 tall, indices 0-2 top row,
// 3-5 bottom row) to its tight bounding-box matrix: a 2D array of colour
// strings (or null for don't-care cells) trimmed to the smallest rectangle
// that contains every coloured cell. Returns { matrix, height, width }.
function patternToBoundingBox(cardPattern) {
  const PW = 3; // source grid width
  const PH = 2; // source grid height
  let minR = PH, maxR = -1, minC = PW, maxC = -1;
  for (let r = 0; r < PH; r++) {
    for (let c = 0; c < PW; c++) {
      if (cardPattern[r * PW + c]) {
        if (r < minR) minR = r;
        if (r > maxR) maxR = r;
        if (c < minC) minC = c;
        if (c > maxC) maxC = c;
      }
    }
  }
  const height = maxR - minR + 1;
  const width = maxC - minC + 1;
  const matrix = [];
  for (let r = 0; r < height; r++) {
    const rowArr = [];
    for (let c = 0; c < width; c++) {
      rowArr.push(cardPattern[(minR + r) * PW + (minC + c)] || null);
    }
    matrix.push(rowArr);
  }
  return { matrix, height, width };
}

// Rotate a matrix 90° clockwise.
function rotateMatrixCW(matrix) {
  const h = matrix.length;
  const w = matrix[0].length;
  const out = [];
  for (let c = 0; c < w; c++) {
    const rowArr = [];
    for (let r = h - 1; r >= 0; r--) {
      rowArr.push(matrix[r][c]);
    }
    out.push(rowArr);
  }
  return out;
}

// Mirror a matrix horizontally (reverse each row).
function mirrorMatrix(matrix) {
  return matrix.map(row => [...row].reverse());
}

function serialiseMatrix(matrix) {
  return matrix.map(row => row.map(c => c || '.').join(',')).join('|');
}

// Generate all 8 dihedral orientations (4 rotations × optional mirror) of the
// pattern's bounding-box matrix, deduplicating identical orientations that
// arise from symmetry. Each entry carries informational rotation/isFlipped
// metadata alongside the matrix.
function getPatternOrientations(cardPattern) {
  const base = patternToBoundingBox(cardPattern).matrix;
  const orientations = [];
  const seen = new Set();
  for (const flipped of [false, true]) {
    let m = flipped ? mirrorMatrix(base) : base;
    for (let rotation = 0; rotation < 4; rotation++) {
      const key = serialiseMatrix(m);
      if (!seen.has(key)) {
        seen.add(key);
        orientations.push({ matrix: m, rotation, isFlipped: flipped });
      }
      m = rotateMatrixCW(m);
    }
  }
  return orientations;
}

export function getPatternMatches(board, cardPattern) {
  const matches = [];
  const seenCells = new Set();
  const orientations = getPatternOrientations(cardPattern);

  for (const { matrix, rotation, isFlipped } of orientations) {
    const h = matrix.length;
    const w = matrix[0].length;
    for (let row = 0; row <= BOARD_SIZE - h; row++) {
      for (let col = 0; col <= BOARD_SIZE - w; col++) {
        const cells = [];
        let matched = true;
        for (let r = 0; r < h && matched; r++) {
          for (let c = 0; c < w; c++) {
            const colour = matrix[r][c];
            if (!colour) continue; // don't-care cell
            const boardIndex = (row + r) * BOARD_SIZE + (col + c);
            const cell = board[boardIndex];
            if (!cell || isBlockedSpace(cell) || cell.colour !== colour) {
              matched = false;
              break;
            }
            cells.push(boardIndex);
          }
        }
        if (!matched) continue;
        const dedupeKey = [...cells].sort((a, b) => a - b).join(',');
        if (seenCells.has(dedupeKey)) continue;
        seenCells.add(dedupeKey);
        matches.push({ row, col, rotation, isFlipped, cells });
      }
    }
  }

  return matches;
}

// Enumerate every viable "window" for a card pattern: a placement of one of
// its orientations on the board where no pattern cell sits on a wrong-coloured
// tile or a tart token. Each window reports the matched cells (correct tile
// already in place) and the missing cells (currently empty, with the colour
// each needs), so bots can measure partial progress toward a claim. Complete
// matches appear with missing.length === 0. Windows that make identical
// demands (pattern symmetry) are deduplicated.
//
// EMPTY PLATES AND `allowBlocked` (3 August). By default a pattern cell sitting
// on an empty plate kills the window outright, same as a wrong-coloured tile -
// which is correct for "can I finish this by placing tiles", because no tile may
// be placed on a plate. But a plate is NOT permanent: the spend step can remove
// one for REMOVE_PLATE_CUPCAKE_COST. Callers weighing that purchase need to SEE the
// windows a plate is standing in, so `allowBlocked: true` keeps them and reports
// the offending cells in `blocked` instead of discarding the window.
//
// Every window returned with allowBlocked still has blocked.length === 0 unless
// asked for, so existing callers (reserve odds, sweep demand, claim ranking) are
// untouched. A window with blocked.length > 0 is NOT claimable now and not
// claimable next turn either - each plate costs a move, and there is one move per
// turn - so treat `blocked` as a multi-turn cost, never as free progress.
export function getPatternWindows(board, cardPattern, { allowBlocked = false } = {}) {
  const windows = [];
  const seen = new Set();
  const orientations = getPatternOrientations(cardPattern);

  for (const { matrix } of orientations) {
    const h = matrix.length;
    const w = matrix[0].length;
    for (let row = 0; row <= BOARD_SIZE - h; row++) {
      for (let col = 0; col <= BOARD_SIZE - w; col++) {
        const cells = [];
        const missing = [];
        const blocked = [];
        let viable = true;
        for (let r = 0; r < h && viable; r++) {
          for (let c = 0; c < w; c++) {
            const colour = matrix[r][c];
            if (!colour) continue; // don't-care cell
            const boardIndex = (row + r) * BOARD_SIZE + (col + c);
            const cell = board[boardIndex];
            if (cell === null) {
              missing.push({ index: boardIndex, colour });
            } else if (isBlockedSpace(cell)) {
              // Movable obstruction - fatal only if the caller cannot pay to
              // clear it.
              if (!allowBlocked) {
                viable = false;
                break;
              }
              blocked.push({ index: boardIndex, colour });
            } else if (cell.colour !== colour) {
              viable = false;
              break;
            } else {
              cells.push(boardIndex);
            }
          }
        }
        if (!viable) continue;
        const key = cells.slice().sort((a, b) => a - b).join(',') + '#' +
          missing.map(m => m.index + ':' + m.colour).sort().join(',') + '#' +
          blocked.map(b => b.index + ':' + b.colour).sort().join(',');
        if (seen.has(key)) continue;
        seen.add(key);
        windows.push({
          matched: cells.length,
          need: cells.length + missing.length + blocked.length,
          cells,
          missing,
          blocked,
        });
      }
    }
  }

  return windows;
}

export function getValidPlacements(board) {
  const valid = [];
  for (let i = 0; i < board.length; i++) {
    if (board[i] === null) {
      valid.push(i);
    }
  }
  return valid;
}

function isBlockedSpace(cell) {
  return cell && typeof cell === 'object' && cell.type === 'blocked';
}

export function getTotalCardsClaimed(gameState) {
  return gameState.players.reduce((sum, p) => sum + p.claimedCards.length, 0);
}

export function isGameOver(gameState) {
  const totalCardsClaimed = getTotalCardsClaimed(gameState);
  return totalCardsClaimed >= gameState.cardsNeededToEnd;
}

// May the current player still claim? A claim plants an empty plate on the board
// cell the sacrificed tile came from, so before the ending is armed this asks
// whether the table's plate supply can pay for one.
//
// THE POOL IS A SHARED TABLE SUPPLY of EMPTY_PLATES_PER_PLAYER × playerCount
// (cardsNeededToEnd), NOT a per-player allowance. One player can out-claim their
// own six as long as the table total holds; the engine has always counted it this
// way and 3 August changed the number, not the mechanism.
//
// ONCE THE ENDING IS ARMED THE POOL STOPS BINDING (4 August ruling). Play
// continues to the end of the round, and during that round a player may still
// complete a card: the extra plates come from an UNLIMITED supply.
//
// WHY THAT IS THE RIGHT RULE, and not a fudge. The plate pool is a CLOCK, not a
// resource - its whole job is to say when the game ends, and it has already done
// that job by the time this matters. Letting it also switch claiming off for the
// last round would make it do a second, different job, and a bad one: the players
// who had not yet taken their turn in the triggering round would be the only ones
// who could not use it. That is exactly the seat unfairness the finish-the-round
// rule exists to remove, so leaving it in would have handed it straight back.
//
// The measured version of the same point: before this ruling, the last round of
// roughly half of all games contained no claims at all, because 'cardMarket' is
// the commonest ending and it fires precisely when the pool empties.
//
// COMPONENT CONSEQUENCE, and the reason the harness now reports it: the box needs
// more plates than the pool, because a game can finish having placed more than
// cardsNeededToEnd of them. How many more is a measurement, not a guess - see
// simulate.js metric 10, which reports the overrun so the punchboard can be sized
// off it rather than off the 24-plate pool.
export function canClaimMore(gameState) {
  if (gameState.endTriggered) return true;
  return getTotalCardsClaimed(gameState) < gameState.cardsNeededToEnd;
}

export function calculateFinalScores(gameState) {
  for (const player of gameState.players) {
    let score = 0;

    // Cake-stand rows: per-row cumulative value by tile count.
    for (let i = 0; i < player.stand.length; i++) {
      const row = player.stand[i];
      if (row.tiles.length > 0) {
        score += STAND_ROW_VALUES[i][row.tiles.length - 1];
      }
    }

    // Crumb tray: 1 VP per tile.
    score += player.crumbTray.length;

    // Claimed cards: flat card VP.
    for (const cardId of player.claimedCards) {
      const card = REWARD_CARDS.find(c => c.id === cardId);
      if (card) score += card.vp;
    }

    // The Tasting Menu (5 August). Every menu is worth the same flat
    // TASTING_MENU_VP whenever it was taken - both card shapes demand exactly four
    // tiles, which is what lets one value cover the deck - so the count is the
    // whole record and there is no accumulate-as-you-earn term to keep in step.
    // Zero for the whole game when the module is off.
    score += player.tastingMenus.length * TASTING_MENU_VP;

    // (Ingredient objectives scored 3 VP per pair here until 4 August. The pantry
    // goals are deleted - see the note at the top of this file. Expect mean
    // scores roughly 3-6 VP per player lower than the 3 August figures purely
    // because of this line's removal, before anything else is read into them.)

    // CUPCAKES NO LONGER SCORE (3 August). The kept-cupcake line used to add 1 VP
    // each, worth 2.7-3.2 VP per player, and utilisation sat at 47-51% precisely
    // because hoarding was safe and paid. Removing the VP also stops the
    // claim-coupled cupcake-plate income leaking guaranteed points to whoever is
    // already claiming most. Cupcakes are the TIEBREAKER now - see
    // getWinningPlayers. Expect mean scores about 3 VP per player lower than they
    // were before that change - and lower again since 4 August, which took the
    // objectives out on top of it.

    player.score = score;
  }
}

// WHO WON. Score first; then, since 3 August, cupcakes are the tiebreaker:
//   1. highest score
//   2. most cupcakes remaining
//   3. most reward cards claimed (the pre-3-August tiebreaker)
//   4. share the victory
// Returns every player still tied after all three, so a shared win is a real
// outcome the caller must be able to render rather than an edge case to round
// away. Ties on raw score occur in 3.3 / 4.1 / 5.8% of games at 2/3/4 players.
//
// CUPCAKES FIRST, deliberately: it gives a cupcake a floor, so the last one a
// player is holding is never worthless now that it scores nothing on its own.
export function getWinningPlayers(gameState) {
  const rank = (p) => [p.score, p.cupcakes, p.claimedCards.length];
  let best = null;
  let winners = [];
  for (const player of gameState.players) {
    const key = rank(player);
    if (best === null) {
      best = key;
      winners = [player];
      continue;
    }
    let comparison = 0;
    for (let i = 0; i < key.length && comparison === 0; i++) {
      comparison = key[i] - best[i];
    }
    if (comparison > 0) {
      best = key;
      winners = [player];
    } else if (comparison === 0) {
      winners.push(player);
    }
  }
  return winners;
}

export { BOARD_SIZE, COLOURS, INGREDIENTS, REWARD_CARDS, INITIAL_MARKET_CARDS, MAX_MARKET_CARDS, EMPTY_PLATES_PER_PLAYER };
// The Tasting Menu deck and its two pure predicates, re-exported so every
// consumer reads the module through game.js exactly as it reads the rest of the
// rules, rather than half of it from a second file.
export { TASTING_MENUS, satisfies as satisfiesMenu, deficit as menuDeficit };
