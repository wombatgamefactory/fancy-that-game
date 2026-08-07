import { getValidSweeps, getPatternMatches, getPatternWindows, getValidPlacements, getVisibleTeapotSymbols, getMenuIngredients, getAvailableMenus, isTastingMenuInPlay, isFlavourInPlay, getFlavourCount, getMoveCost, canReserveCard, canBuyExtraTile, canRemovePlate, canClaimMore, countBoardIngredient, STAND_ROW_VALUES, CUPCAKE_PLATES, TEAPOT_SYMBOL_CELLS, REFRESH_THRESHOLD, TEA_POT_REWARD, REWARD_CARDS, COLOURS, INGREDIENTS, BOARD_SIZE, EXTRA_TILE_CUPCAKE_COST, REMOVE_PLATE_CUPCAKE_COST, TASTING_MENU_VP, FLAVOUR_VP_PER_TILE, FLAVOUR_MAJORITY_VP } from '../engine/game.js';

// Approximate value of a completed claim beyond the card's printed VP: the
// sacrificed tile is banked on the stand or crumb tray. A conservative floor —
// a crumb is 1 VP, a shallow plate 2-3 — kept low so the sweep/placement demand
// weighting below stays a relative ranking, not an absolute score. (Realized
// plate marginals under the escalating table average higher, ~4-5, but bumping
// this would need TEA_WEAK_SWEEP_MAX and the pruning cutoffs re-tuned in lockstep,
// so it is deliberately left as a stable floor.)
const CLAIM_EXTRA = 2;

// ── THE CLAIMS-REMAINING HORIZON (rewritten 6 August) ──────────────────────
// Two decisions need to know roughly how much game is left: decideDestination,
// which will not open a deep cake-stand row it cannot realistically fill (the
// 26-point bottom row needs four claims), and decideReserve, which loosens its
// standards once there is little time to complete anything.
//
// BOTH USED TO READ gameState.cardsNeededToEnd - the shared empty-plate pool -
// as `ceil((pool - claimed) / playerCount)`. The pool is deleted, so the estimate
// is re-denominated in the new clock: FREE CELLS ON THE FASTEST-FILLING BOARD,
// over the measured tile draw. A player claims at most once per turn, so turns
// remaining IS claims remaining.
//
// 2.5 TILES A TURN is the measured draw (22.3 tiles per player over 8.9 turns,
// 6 August). It is an estimate feeding a heuristic, not a rule - nothing in the
// engine depends on it, and being a turn out simply makes the bot slightly more
// or less willing to open a deep row.
//
// THIS IS EXACTLY WHAT THE PROBE THAT MEASURED THE RULE DID
// (probe-fillboard-end-2026-08-06.js, setClaimHorizon), so the simulated figures
// the change was adopted on are the figures this bot produces.
const TILES_DRAWN_PER_TURN = 2.5;

function turnsRemaining(gameState) {
  let minFree = Infinity;
  for (const p of gameState.players) {
    minFree = Math.min(minFree, getValidPlacements(p.board).length);
  }
  return Math.max(1, Math.ceil(minFree / TILES_DRAWN_PER_TURN));
}

// Value of gaining a cupcake by plating onto a cupcake plate. There is no cap,
// so this gain always pays. A cupcake is worth at least 1 VP if simply kept, and
// more in practice: it fuels a tile/tart move or a mid-claim re-ice. +1.5 credits
// that upside without letting the bonus dominate a whole row's marginal value.
const CUPCAKE_PLATE_BONUS = 1.5;

// Does plating onto (rowIndex, plateIndex) land on one of the stand's cupcake
// plates? Mirrors the engine's isCupcakePlate (not exported) off the shared
// CUPCAKE_PLATES table so the destination heuristic can price the cupcake.
function isCupcakePlate(rowIndex, plateIndex) {
  return CUPCAKE_PLATES.some(p => p.rowIndex === rowIndex && p.plateIndex === plateIndex);
}

// ── Teapot-trigger tuning constants (rewritten 1 August) ───────────────────
// THE RULE CHANGED UNDER THIS HEURISTIC, AND IT CHANGED SIGN.
//
// Tea used to be a voluntary action taken at the START of a turn. A sweep can
// only ever UNCOVER teapot symbols, so a symbol we exposed during our turn was
// never ours to use - it armed the option for the player on our left, who at 2
// players is our only opponent. Symbol exposure was therefore priced purely as a
// gift (SYMBOL_ARM_COST / SYMBOL_GIFT_COST / SYMBOL_COST_FLOOR, all deleted), and
// the bot played to keep the gate shut. There was also a whole separate decision,
// decideOrderTea, weighing whether to spend a turn-start on the flush; it is gone
// too, along with its helpers.
//
// Since 1 August the pot fires at the END of the turn that uncovers the fourth
// teapot, and it belongs to whoever pulls the trigger. Uncovering it now pays US:
//
//   + the pot, a flat TEA_POT_REWARD cupcakes at TEA_CUPCAKE_VALUE each
//   + the card flush, which wipes the row every opponent was working toward
//   - the freshly dealt 25-tile market, which we do NOT get to sweep (we have
//     already swept by the time the pot resolves) and the next seat does
//
// That last term is the counterweight the rule deliberately builds in, and it is
// why this comes out a near-wash rather than a magnet. Deliberately so:
// uncovering the fourth teapot should be a tiebreak between otherwise similar
// sweeps, not a reason to take a bad one.
//
// TEA_CUPCAKE_VALUE: one cupcake expressed in scoreSweeps points.
//
//   3 AUGUST: A CUPCAKE NO LONGER SCORES A VP. The old reading - "1 VP kept and
//   rather more when spent" - had a floor under it that is gone. What a cupcake
//   is worth now is entirely what it buys: an extra tile at the sweep step
//   (EXTRA_TILE_CUPCAKE_COST), a move, or a reserve. The value is LEFT AT 6
//   deliberately rather than guessed downward: the extra tile alone converts a
//   card-locked turn into a claim about 39% of the time, and a claim is worth
//   card VP plus a banked tile, so 6 is if anything conservative. This is one of
//   the numbers the "what is a cupcake worth" measurement is meant to settle -
//   see the metrics note in the handoff.
const TEA_CUPCAKE_VALUE = 6;
// TEA_TRIGGER_PRIORITY_VALUE: was 4, for leading the tea round's reserve draft.
//   THE RESERVE ROUND IS DELETED (3 August), so there is no priority left to
//   value - reserving is a paid action on your own turn now. Zero, kept as a
//   named term so the trigger's three components stay legible.
const TEA_TRIGGER_PRIORITY_VALUE = 0;
// TEA_TRIGGER_HANDOVER_COST: what we charge ourselves for the fresh board the
//   next seat gets to sweep.
//
//   MEASURED AT ZERO, against expectation. This started at 11, from the step-6
//   probe's finding that a fresh 25-tile market is worth roughly +22 scoreSweeps
//   points to whoever sweeps it, charged at the old TEA_DENIAL_SHARE half weight.
//   That value made the whole trigger worth 6 + 4 - 11 = -1, i.e. a near-wash,
//   which is what the RULE is designed to be.
//
//   The bot does not agree. Swept over 200-game 2p arena runs (tuneBot vs
//   basicBot, with a same-value control landing on exactly 50.0% to check the
//   harness): 0 beat 11 twice independently, at 59.1% and 56.6%. Charging MORE
//   got monotonically worse (18 -> 51.0%, 25 -> 47.9%). At 11 the heuristic was
//   worse than useless - it lost to oldBasicBot, which ignores teapots entirely,
//   at 47.4%; at 0 it beats that same baseline at 56.6%.
//
//   Everything from about -20 to 0 is indistinguishable at 300 games (45-53%, and
//   a self-match reads 46.9%, so the noise floor is about +/-3pp). 0 is the point
//   in that flat region closest to the theory, so that is where it sits rather
//   than at a spuriously precise negative number.
//
//   WHY IT IS PROBABLY ZERO. Charging for the handover double-counts: rawSweepScore
//   is already computed on the live market, so a board worth handing over is a
//   board we were already scoring poorly. The term as written taxed the trigger a
//   second time for the same fact.
//
//   THIS IS A DESIGN SIGNAL, NOT JUST A BOT ONE. At 0 the trigger is worth +10 to
//   the bot, so it actively CHASES the fourth teapot rather than treating it as a
//   coin-flip. The rule successfully inverted the old avoidance, but the fresh
//   board is not currently a strong enough counterweight to make the trade neutral.
//   If it should be neutral, the pot is the knob - see TEA_POT_REWARD.
const TEA_TRIGGER_HANDOVER_COST = 0;

// ── Reserve-selection constants ────────────────────────────────────────────
// RESERVE_COMPLETION_ODDS[m]: measured probability that a card reserved while m
//   tiles short of its best window on that player's board is ever claimed.
//   From 120 probe games (2p and 4p pooled): m=0 55%, m=1 55%, m=2 33%, m=3 20%,
//   m=4 4%. The step-5 finding that only 29-36% of reserves ever score is almost
//   entirely the m>=2 tail, which was 63-78% of all reserves under the old
//   vp/(1+missing) ranking. Scoring by (vp + CLAIM_EXTRA) x these odds prices a
//   reserve by what it is actually expected to pay.
const RESERVE_COMPLETION_ODDS = [0.55, 0.55, 0.33, 0.20, 0.04, 0.0];
// RESERVE_MAX_MISSING: hard cut. Was 4, which is most of a six-cell pattern and
//   completed 4% of the time.
const RESERVE_MAX_MISSING = 2;
// RESERVE_LATE_MAX_MISSING / RESERVE_LATE_CLAIMS: near the end there is no time
//   to build a window, and the probe measured last-quarter reserves completing
//   6% (4p). With this few claims left in the game the bot only reserves what is
//   already all but finished.
const RESERVE_LATE_MAX_MISSING = 1;
const RESERVE_LATE_CLAIMS = 2;
// RESERVE_MIN_VALUE: expected payout (in VP) below which the slot is better left
//   empty - a reserve is limited to one card and a dud blocks the slot for the
//   rest of the game.
const RESERVE_MIN_VALUE = 1.5;

// ── Cupcake budgeting constants (3 August) ─────────────────────────────────
// With four outlets, no VP and a finite supply, "how much to spend and on what"
// is the first genuine budgeting decision in the game. These are the prices the
// bot puts on the alternatives.
//
// RESERVE_CUPCAKE_VALUE: what one cupcake is worth in VP terms - the OPPORTUNITY
//   COST any spend has to clear. A cupcake's best alternative use is the extra
//   tile, which unlocks a claim on about 39% of card-locked turns; a claim is
//   worth roughly a 3 VP card plus a ~2 VP banked tile, so ~0.39 x 5 ~= 2.
//   This is a first estimate standing in for a measurement that has not been
//   taken yet - the handoff's "what is a cupcake worth" metric is what settles
//   it, and three live design decisions rest on the same unknown.
const RESERVE_CUPCAKE_VALUE = 2;
// RESERVE_FLUSH_RESCUE_VALUE: extra credit for reserving when a pot of tea will
//   flush the whole card row at the end of this turn. This is the decision the
//   retained card flush exists to create - the card is gone otherwise, so the
//   reserve is buying the card rather than merely booking it early.
const RESERVE_FLUSH_RESCUE_VALUE = 3;

// ── Ingredient-objective constants: DELETED 4 AUGUST ───────────────────────
// OBJECTIVE_STEP_VALUE, OBJECTIVE_CLOSE_BONUS and OBJECTIVE_BREAK_COST are gone
// with the pantry goals themselves (see the note at the top of the engine). They
// scaled off OBJECTIVE_VP, which no longer exists, and every heuristic they fed -
// the ingredient term in sweep scoring and the sacrifice penalty in claim scoring
// - has gone with them. Nothing replaces them: an ingredient is now worth exactly
// what the stand rows and the crumb tray pay for it, which is what the rest of
// this file already prices.

// ── Tasting Menu constants (5 August) ──────────────────────────────────────
// THIS BLOCK DECIDES WHETHER THE MEASUREMENT MEANS ANYTHING, and that is the
// lesson from the Freshness build stated again because it cost a day: A BOT THAT
// CANNOT SEE THE MODULE PRODUCES A FLOOR, NOT A RESULT. Every unsteered figure in
// the 5 August handoff - 19.1% of players qualifying, 0.19 menus each, 81% dead
// cardboard - came from a bot that had never heard of Tasting Menus, and they are
// all dramatically pessimistic.
//
// WHAT A MENU IS WORTH IS NOT WHAT A CUP WAS WORTH, and the difference drives
// every constant here. A Freshness cup was a certain 2 VP the instant you removed
// the right tile. A menu is TASTING_MENU_VP - four times as much - but only when
// FOUR named tiles are on your cake stand, only if no opponent gets there first,
// and only if the tiles land on the STAND rather than in the crumb tray. So the
// heuristic is a DEFICIT one: how many tiles short of the nearest live menu am I,
// and does this action close that gap.
//
// Every term below reads the engine's accessors (getMenuIngredients,
// getAvailableMenus) rather than re-deriving the rule, and a menu whose takenBy is
// set disappears from getAvailableMenus - so the bot stops chasing a card the
// instant a rival takes it, which is the behaviour the race is supposed to produce
// and the one thing the Freshness build got right.
//
// These are STARTING VALUES TO BE TUNED, not trusted. Retune them against metric
// 13's DEAD CARDBOARD, not against intuition: a high dead-cardboard figure can be
// a bot problem (nobody is steering) or a design one (the cards are simply too
// steep), and the two have opposite fixes - the first is these numbers, the second
// is the deck. Both readings have now happened: wiring these terms up took dead
// cardboard from 81% to 57.9% on the four-tile deck, and lightening the deck to
// three tiles took it from 57.9% to 21.9%.
//
// MENU_CLAIM_SHARE: weight on deficit reduction at the CLAIM step, as a share of
//   TASTING_MENU_VP. The claim step is where the module is won or lost - it is the
//   only step that puts a tile on the stand - so partial progress is priced here
//   and completion is priced at full value below.
const MENU_CLAIM_SHARE = 0.35;
// MENU_PLACEMENT_SHARE: weight on stocking / positioning an ingredient a live menu
//   still wants, at the sweep and placement steps. Much weaker, because a tile on
//   the board is two steps away from the stand - but a bot that never stocks what
//   it needs never reaches deficit 1 in the first place.
const MENU_PLACEMENT_SHARE = 0.15;
// MENU_ABANDON_DEFICIT: stop chasing a menu this far out of reach.
//
//   INERT SINCE 5 AUGUST AND DELIBERATELY LEFT THAT WAY. It was measured against
//   the four-tile deck, where only 4.4% of finished stands landed 3+ tiles short
//   of their nearest dealt menu, so a bot still 3 short was chasing something it
//   would not reach. On the three-tile deck the maximum possible deficit IS 3 - an
//   empty stand - so nothing is ever dropped and every live menu gets priced.
//
//   Tightening it to 2 was measured rather than argued: dead cardboard 22.7% vs
//   21.9%, menus per player 1.03 vs 1.04, and contested menus 0.493 vs 0.545. All
//   three are slightly worse, and the contested line is the one that matters, so
//   the threshold stays where it is. It becomes live again the moment any card in
//   the deck asks for a fourth tile, which is the reason to keep it rather than
//   delete it.
const MENU_ABANDON_DEFICIT = 3;

// Live menus this player could still plausibly reach, each with the DEFICIT their
// CAKE STAND leaves against it and which ingredients are still wanted, in what
// quantity. Menus already taken are absent (getAvailableMenus filters them), and
// menus further than MENU_ABANDON_DEFICIT away are dropped here rather than being
// priced at a whisker - a bot that spreads a little weight over five unreachable
// cards steers worse than one that ignores them.
//
// A deficit of 0 on a LIVE menu is normally impossible: the engine awards a menu
// the instant the stand meets it, and claim's row destination is the only way a
// tile reaches the stand. It can survive one claim under TASTING_MENU_ONE_PER_TURN,
// so it is kept in the list and priced at full value - the next plating banks it.
function liveMenuTargets(gameState, player) {
  if (!gameState || !isTastingMenuInPlay(gameState)) return [];
  const counts = getMenuIngredients(player);
  const targets = [];
  for (const menu of getAvailableMenus(gameState)) {
    const wants = {};
    let short = 0;
    for (const [ingredient, need] of Object.entries(menu.need)) {
      const have = counts[ingredient] || 0;
      if (have >= need) continue;
      wants[ingredient] = need - have;
      short += need - have;
    }
    if (short > MENU_ABANDON_DEFICIT) continue;
    targets.push({ menu, deficit: short, wants });
  }
  return targets;
}

// What ONE more tile of `ingredient`, PLATED ONTO THE STAND, is worth in Tasting
// Menu terms. The claim step's term, and the only one priced at full value.
//
// Completion is worth TASTING_MENU_VP OUTRIGHT and undiscounted, which is the one
// place this differs from the handoff's sketch: the award is immediate and
// automatic inside the same claim() call, so there is no window in which an
// opponent can get there first and nothing to discount for. The risk of being
// beaten to a menu is entirely in the PARTIAL terms, which is where the 1/deficit
// taper sits.
//
// The MAX across menus, not the sum: ingredients are not consumed, so two menus
// wanting the same tile really are both advanced by it - but summing would let a
// bot talk itself into a tile that leaves it 2 short of three different cards.
function menuValueOfPlating(gameState, player, ingredient) {
  let best = 0;
  for (const target of liveMenuTargets(gameState, player)) {
    if (target.deficit === 0) {
      best = Math.max(best, TASTING_MENU_VP);
      continue;
    }
    if (!target.wants[ingredient]) continue;
    const after = target.deficit - 1;
    const value = after === 0
      ? TASTING_MENU_VP
      : TASTING_MENU_VP * MENU_CLAIM_SHARE / after;
    if (value > best) best = value;
  }
  return best;
}

// ingredient -> what HOLDING one more of it on the board is worth, for the sweep
// and placement steps. Much weaker than the claim term and deliberately so: a tile
// on the board is two steps from the stand (it has to sit inside a completed
// pattern AND be the tile chosen for removal), so this is a tiebreak between
// similar sweeps rather than a magnet.
//
// `wanted` is how many more of that ingredient the nearest live menu still needs,
// which is what the sweep taper counts against - a fourth lemon does nothing for a
// menu that wants two.
function menuIngredientDemand(gameState, player) {
  const demand = {};
  for (const target of liveMenuTargets(gameState, player)) {
    if (target.deficit === 0) continue;
    for (const [ingredient, wanted] of Object.entries(target.wants)) {
      const value = TASTING_MENU_VP * MENU_PLACEMENT_SHARE / target.deficit;
      const current = demand[ingredient];
      if (!current || value > current.value) demand[ingredient] = { value, wanted };
      else if (wanted > current.wanted) current.wanted = wanted;
    }
  }
  return demand;
}

// ── The Flavour of the Day (6 August) ──────────────────────────────────────
// THE SAME WARNING AS THE BLOCK ABOVE, and it applies harder here: every baseline
// in the 6 August handoff was measured POST-HOC on games played by a bot that had
// never heard of this module, so every one of them is a FLOOR. Until these terms
// are wired up, no A/B of the Flavour is worth reading.
//
// WHAT IS DIFFERENT FROM THE TASTING MENU, and it is why this block is a fifth of
// the size: a menu is a race to a named target that a rival can end for you, so it
// needs deficits, taper and abandonment. The Flavour is a plain running count on
// your own board. One tile is worth FLAVOUR_VP_PER_TILE, always, to everybody -
// there is nothing to model but the majority and whether you are in it.
//
// AND THE ONE PLACE IT REALLY BITES IS THE CLAIM. This is the first opposed
// gradient the claim step has ever had: a claim moves the sacrificed tile to the
// stand or the crumb tray, where it stops counting for this lane. A bot without
// the term below will cheerfully sacrifice its own Flavour tiles and the lane will
// measure as pure noise.
//
// FLAVOUR_CONTEST_SHARE: how much of FLAVOUR_MAJORITY_VP one tile is credited with
//   while this player is IN CONTENTION for the majority. Deliberately crude - "am
//   I within one tile of the top" is the whole test, as the handoff asks - because
//   the bonus is a single 3 VP lump and any attempt to amortise it exactly over an
//   unknown number of remaining turns is false precision. At 0.4 a contested tile
//   is worth about 2.2 VP against an uncontested 1, which keeps it below a stand
//   plate (up to 14 for one placement) and well below a menu. Raising it is how a
//   bot starts hoarding tiles it cannot use, which would misreport the dose upward.
const FLAVOUR_CONTEST_SHARE = 0.4;
// How far off the lead still counts as being in the race. ONE TILE, per the
// handoff: the measured lead margin is about 2 tiles, so a player two or more back
// is not one sweep from taking it and should be playing the colour puzzle instead.
const FLAVOUR_CONTEST_GAP = 1;

// What ONE MORE Flavour tile on this player's board is worth, and equally what one
// LOST off it costs. The single number both the sweep term and the claim's
// sacrifice penalty read, so the two cannot disagree about the lane's value.
//
// Returns 0 when the module is off, which makes every call site a no-op without
// any of them having to test for it.
function flavourTileValue(gameState, player) {
  if (!gameState || !isFlavourInPlay(gameState)) return 0;
  const mine = getFlavourCount(gameState, player);
  let top = 0;
  for (const other of gameState.players) {
    const count = getFlavourCount(gameState, other);
    if (count > top) top = count;
  }
  // In contention when level with the leader or within one tile of them - which
  // includes BEING the leader, since holding a lead of one is exactly the position
  // where one more tile is worth most.
  const contending = mine + FLAVOUR_CONTEST_GAP >= top;
  return FLAVOUR_VP_PER_TILE + (contending ? FLAVOUR_MAJORITY_VP * FLAVOUR_CONTEST_SHARE : 0);
}

// ── Claim-selection constants ──────────────────────────────────────────────
// Two incentives changed on 28 July: the card row GROWS on every claimless turn
// (so leaving a card is cheaper than it was) and a claimed card is NOT replaced
// (so the row we leave behind is the row we will still be looking at next turn).
// Both push the same way - which card we take matters more than whether we take
// one, and the second-best claimable card is now a real asset to protect.
//
// CLAIM_DEST_WEIGHT: how much the banked sacrifice tile's destination counts
//   against the card's printed VP when choosing between claimable cards. The
//   plate value is real VP, but it is realised at the end of the game and the
//   one-row-per-ingredient rule can strand it, so it is discounted.
const CLAIM_DEST_WEIGHT = 0.6;
// CLAIM_PROTECT_OTHER: penalty for sacrificing a tile that another card we can
//   ALSO claim needs. Under the old refill-on-claim rule that card was about to
//   be replaced anyway; now it sits in the row waiting for us.
const CLAIM_PROTECT_OTHER = 4;
// CLAIM_RESERVE_BONUS: prefer finishing a reserved card when values are close.
//   An unclaimed reserve scores 0 at the end AND blocks the one reserve slot,
//   and it is the one card a refresh flush cannot take away.
const CLAIM_RESERVE_BONUS = 1.5;
// CLAIM_FLUSH_RISK_BONUS: ...unless a refresh is armed right now, in which case
//   the ROW is the perishable place to be claiming from - the next player can
//   flush the whole row to the discard before our next turn, and cannot touch
//   our reserve.
const CLAIM_FLUSH_RISK_BONUS = 2;
// ───────────────────────────────────────────────────────────────────────────

// Per-colour demand derived from viable pattern windows on this player's
// board: how much claim progress one more tile of each colour buys. Windows
// close to completion dominate (quadratic progress).
function buildColourDemand(board, cardMarket) {
  const demand = {};
  for (const card of cardMarket) {
    const weight = (card.vp || 0) + CLAIM_EXTRA;
    for (const win of getPatternWindows(board, card.pattern)) {
      if (win.missing.length === 0) continue;
      const progress = (win.matched + 1) / win.need;
      const value = (weight * progress * progress) / win.missing.length;
      for (const miss of win.missing) {
        demand[miss.colour] = (demand[miss.colour] || 0) + value;
      }
    }
  }
  return demand;
}

// Per-cell demand map: boardIndex -> Map(colour -> gain), where gain is the
// claim progress bought by placing that colour on that cell across all viable
// windows. Filling a window's final cell earns a completion bonus.
function buildPlacementDemand(board, cardMarket) {
  const demand = new Map();
  for (const card of cardMarket) {
    const weight = (card.vp || 0) + CLAIM_EXTRA;
    for (const win of getPatternWindows(board, card.pattern)) {
      if (win.missing.length === 0) continue;
      const before = win.matched / win.need;
      const after = (win.matched + 1) / win.need;
      let gain = weight * (after * after - before * before);
      if (win.missing.length === 1) gain += weight * 2; // completes the pattern
      for (const miss of win.missing) {
        let colourMap = demand.get(miss.index);
        if (!colourMap) {
          colourMap = new Map();
          demand.set(miss.index, colourMap);
        }
        colourMap.set(miss.colour, (colourMap.get(miss.colour) || 0) + gain);
      }
    }
  }
  return demand;
}

function emptyNeighbourCount(board, pos) {
  const row = Math.floor(pos / BOARD_SIZE);
  const col = pos % BOARD_SIZE;
  let count = 0;
  if (row > 0 && board[pos - BOARD_SIZE] === null) count++;
  if (row < BOARD_SIZE - 1 && board[pos + BOARD_SIZE] === null) count++;
  if (col > 0 && board[pos - 1] === null) count++;
  if (col < BOARD_SIZE - 1 && board[pos + 1] === null) count++;
  return count;
}

function getSweptTiles(market, sweep, marketSize) {
  const tiles = [];
  if (sweep.isRow) {
    const startIdx = sweep.rowOrCol * marketSize;
    const endIdx = startIdx + marketSize;
    for (let i = startIdx; i < endIdx; i++) {
      const tile = market[i];
      if (tile) {
        const matches = sweep.declarationType === 'colour'
          ? tile.colour === sweep.declaration
          : tile.ingredient === sweep.declaration;
        if (matches) {
          tiles.push(tile);
        }
      }
    }
  } else {
    // Column
    for (let r = 0; r < marketSize; r++) {
      const i = r * marketSize + sweep.rowOrCol;
      const tile = market[i];
      if (tile) {
        const matches = sweep.declarationType === 'colour'
          ? tile.colour === sweep.declaration
          : tile.ingredient === sweep.declaration;
        if (matches) {
          tiles.push(tile);
        }
      }
    }
  }
  return tiles;
}

// Marginal value of adding one more tile to stand row `rowIndex` that currently
// holds `len` tiles: each row has its own cumulative table, so the gain is
// STAND_ROW_VALUES[rowIndex][len] - STAND_ROW_VALUES[rowIndex][len-1] (opening a
// row is worth STAND_ROW_VALUES[rowIndex][0], e.g. bottom 1, top 5).
function rowMarginalValue(rowIndex, len) {
  const values = STAND_ROW_VALUES[rowIndex];
  return values[len] - (len > 0 ? values[len - 1] : 0);
}

// countBoardIngredient lives in the engine and is imported at the top of this
// file rather than duplicated here. It outlived the pantry goals deliberately
// (see the engine's note on it): the bot still asks "how many of this ingredient
// are on my board" to judge whether a fresh stand row has the supply to fill it.

// DELETED 4 AUGUST: buildObjectiveDemand and objectiveBreakCost, the whole of the
// bot's ingredient-objective awareness. They read gameState.objectivePairs, which
// no longer exists, and they priced two things the game no longer pays for -
// pulling a count of one ingredient onto the board, and protecting a satisfied
// pair from a claim sacrifice. Both call sites (rawSweepScore, decideClaim) lose
// the term outright rather than having it replaced.

// Baseline destination policy for a tile removed while claiming a card.
// Concentration pays a row's per-tile marginal (the bottom row escalates
// 1/3/8/10, short rows enter higher but cap out), so this favours extending an
// existing locked row, then opens rows sized to how much
// supply of that ingredient is still on the board (the source of future
// sacrifices), and crumbs when committing a big row would be a blind gamble.
//
// ONE-ROW-PER-INGREDIENT RULE: an ingredient may only ever occupy one stand
// row. Extending that row (step a) is the ONLY way to plate an already-locked
// ingredient; once its row is full the tile must go to the crumb tray.
//
// `gameState` is optional: when supplied it lets the empty-row choice (step b)
// read how many claims remain, discounting the deep bottom row late in the game
// when it can no longer be filled.
export function decideDestination(player, tile, gameState = null) {
  const stand = player.stand;

  // a. A locked row already matching this ingredient with spare capacity:
  //    extend the one closest to completion (highest marginal value). This is
  //    now the only legal way to plate an already-plated ingredient.
  let bestRow = -1;
  let bestMarginal = -Infinity;
  for (let i = 0; i < stand.length; i++) {
    const row = stand[i];
    if (row.ingredient === tile.ingredient && row.tiles.length < row.capacity) {
      const marginal = rowMarginalValue(i, row.tiles.length);
      if (marginal > bestMarginal) {
        bestMarginal = marginal;
        bestRow = i;
      }
    }
  }
  if (bestRow !== -1) return { type: 'row', rowIndex: bestRow };

  // If this ingredient is already locked to a row (necessarily a FULL one, or
  // step a would have extended it), opening a second row is illegal — crumb.
  if (stand.some(row => row.ingredient === tile.ingredient)) {
    return { type: 'crumb' };
  }

  // b. Ingredient never plated: consider opening an empty row with supply
  //    confidence based on how many tiles of this ingredient are on the board.
  const emptyRows = [];
  for (let i = 0; i < stand.length; i++) {
    if (stand[i].ingredient === null && stand[i].tiles.length === 0) emptyRows.push(i);
  }

  if (emptyRows.length > 0) {
    const boardCount = countBoardIngredient(player.board, tile.ingredient);

    // How many more tiles of this ingredient we can plausibly plate into a
    // freshly-opened row after the tile in hand. boardCount still includes the
    // tile being plated (the board isn't mutated until after this call), so the
    // remaining same-ingredient supply is boardCount - 1. It is further bounded
    // by how many claims this player has left before the game ends: late-game,
    // even ample board supply can't be converted, so the deep bottom row (which
    // only pays off deep: 2/6/14/26) stops being worth opening and short high-
    // entry rows (top 5, third 4) win — the redesign's "focus beats spread" intent.
    let futureSacrifices = Math.max(0, boardCount - 1);
    if (gameState) {
      // One claim per turn, so remaining turns IS remaining claims. See
      // turnsRemaining for why this is denominated in board space since 6 August.
      futureSacrifices = Math.min(futureSacrifices, turnsRemaining(gameState));
    }

    // Score each empty row by the cumulative value it can realistically reach
    // (rows print cumulative totals, scored at the last filled plate), plus a
    // bonus for any cupcake plate passed on the way (always paid now — no cap).
    // This is value-sensitive where the old flat table left it near-neutral: with
    // little support a short row's high entry (top 5) beats a deep row opened
    // shallow (bottom 2); with real support the bottom row's escalating tail wins.
    let bestPick = -1;
    let bestValue = -Infinity;
    for (const i of emptyRows) {
      const cap = stand[i].capacity;
      const depth = Math.min(cap, 1 + futureSacrifices); // plates we can reach
      let value = STAND_ROW_VALUES[i][depth - 1];
      for (let d = 0; d < depth; d++) {
        if (isCupcakePlate(i, d)) value += CUPCAKE_PLATE_BONUS;
      }
      if (value > bestValue) {
        bestValue = value;
        bestPick = i;
      }
    }

    // THE TASTING MENU. REWRITTEN 6 AUGUST, when the crumb tray started counting
    // toward menus (MENU_COUNTS_CRUMB_TRAY). It used to be the one place in this
    // function the module could change the answer, because a menu read the stand
    // alone and so a menu-advancing tile HAD to be plated.
    //
    // That is no longer true: both destinations advance a menu equally, so the
    // menu value is now the SAME on both sides of the crumb comparison and
    // therefore cancels out of it entirely. Leaving it added to the row side only
    // would be a thumb on the scale for plating that the rules no longer justify -
    // exactly the bug that makes a bot measure a floor instead of a result.
    //
    // It is still computed, because it belongs in the value the CALLER sees (a
    // tile that completes a menu really is worth more to remove than one that does
    // not, whichever destination it goes to), and destinationValue returns it.
    const menuValue = gameState ? menuValueOfPlating(gameState, player, tile.ingredient) : 0;

    // Opening a row banks at least its entry value (>= 1), which clears the
    // guaranteed 1-VP crumb; the check keeps the crumb fallback meaningful if the
    // value table is ever retuned downward. menuValue is deliberately NOT added
    // here any more - see above: it is equal on both sides now, so adding it to
    // one would bias the choice toward plating for a reason the rules deleted.
    if (bestValue > 1) return { type: 'row', rowIndex: bestPick };
  }

  // c. No room anywhere: crumb.
  return { type: 'crumb' };
}

// What one player wants out of the tile market: per-colour claim demand from
// their board's viable windows against the (public) card row, plus the
// ingredients of their locked, unfilled stand rows, which only that ingredient
// can ever extend. Built once and reused across every sweep candidate - this is
// the expensive half of sweep scoring, so scoreSweeps builds one context and
// scores the whole market against it.
//
// The third parameter went out with the pantry goals - it was there only to build
// the objective demand map - and came back on 4 August for the flavour bonus,
// which is the one thing in the context that is a fact about the shared table
// rather than about this player's board. It stays optional so a caller scoring a
// hypothetical market without a game state still works.
function sweepContext(player, cardMarket, gameState = null) {
  const wantedIngredients = new Set();
  for (const row of player.stand) {
    if (row.ingredient !== null && row.tiles.length < row.capacity) {
      wantedIngredients.add(row.ingredient);
    }
  }
  // THE TASTING MENU, priced per ingredient at what one more of it is worth
  // toward the nearest LIVE menu this player can still reach. Unlike the Freshness
  // cups this replaced, it is a fact about THIS PLAYER as much as about the table:
  // the same menu is worth a lot to a stand one tile short of it and nothing to a
  // stand that cannot reach it, so the context is genuinely per player now.
  //
  // A menu somebody else has taken is absent from getAvailableMenus, so the bot
  // stops steering toward it the instant it goes - and it never comes back, which
  // is the whole difference from the module this replaced.
  const menuDemand = menuIngredientDemand(gameState, player);
  const menuHeld = {};
  for (const ingredient in menuDemand) {
    // countBoardIngredient survived the pantry goals precisely for valuing an
    // ingredient declaration, which is this.
    menuHeld[ingredient] = countBoardIngredient(player.board, ingredient);
  }
  // THE FLAVOUR OF THE DAY. One ingredient and one flat per-tile value, computed
  // once for the whole sweep ranking - it is a fact about the table and this
  // player's standing in the majority, and no candidate sweep changes either.
  //
  // THIS IS THE STEP THE MODULE WAS BUILT FOR. Sweeping is the action no card lock
  // can refuse, so this is the term that turns a locked claim step into a turn that
  // still scores something.
  const flavourIngredient = (gameState && isFlavourInPlay(gameState)) ? gameState.flavourOfTheDay : null;
  return {
    colourValue: buildColourDemand(player.board, cardMarket),
    wantedIngredients,
    menuDemand,
    menuHeld,
    flavourIngredient,
    flavourValue: flavourIngredient ? flavourTileValue(gameState, player) : 0,
  };
}

// WHAT A TILE THROWN BACK INTO THE BAG COSTS (6 August).
//
// scoreSweeps ranked purely on pattern value and knew nothing about board space,
// which was harmless while an oversized sweep ENDED THE GAME - the bot simply
// never met the situation. Under the trim rule it is legal, so a near-full board
// would happily rank a 3-tile sweep top with one cell free and hand two tiles
// straight back. That is legal play and it cost only about a tile a game in
// simulation (a 1-tile sweep is nearly always available, so the bot got lucky),
// but it is not correct play.
//
// PRICED, NOT FORBIDDEN. A tile that will not fit is not a disaster - the rest of
// the sweep still lands and the turn is otherwise untouched - so this is a
// deduction rather than a filter. Deliberately modest: a heavy penalty would push
// the bot onto tiny sweeps late on, which fills its board more slowly and drags
// the game out, and the length figure is the thing this change must not move.
// Half a turn is the tolerance; measured at 3.0 the change is well inside it.
const SWEEP_WASTED_TILE_COST = 3.0;

// Free cells on the active player's board, minus anything already in hand. The
// budget a candidate sweep is measured against.
function sweepCapacity(gameState) {
  const player = gameState.players[gameState.currentPlayerIndex];
  return Math.max(0, getValidPlacements(player.board).length - gameState.pendingSweepTiles.length);
}

// Raw tile value of one sweep to the player whose context this is. No symbol
// steering here: this is what the tiles are worth, and the gift/deny adjustment
// (which depends on whose turn it is, not on whose board it is) is applied by
// scoreSweeps for the live market only.
function rawSweepScore(market, sweep, marketSize, ctx) {
  const sweptTiles = getSweptTiles(market, sweep, marketSize);
  let score = 0;

  // Diminishing returns per colour within one sweep: a window missing one
  // pink needs ONE pink, so the second copy of a colour is worth less.
  const colourSeen = {};
  // Menu-wanted tiles taken so far in THIS sweep, per ingredient, added to the
  // board holding so the taper counts what we would end the sweep with rather than
  // what we started it on.
  const menuTaken = {};
  for (const tile of sweptTiles) {
    const copies = colourSeen[tile.colour] = (colourSeen[tile.colour] || 0) + 1;
    const decay = copies === 1 ? 1 : 0.4;
    score += (ctx.colourValue[tile.colour] || 0) * decay;
    // Tiles whose ingredient feeds a locked row keep future sacrifices useful.
    if (ctx.wantedIngredients.has(tile.ingredient)) score += 1;
    // THE TASTING MENU. This is the one place a bare COUNT of an ingredient is
    // worth chasing again - the slot the deleted pantry-goal term used to occupy,
    // but priced off a card a rival can take first rather than off a fixed demand,
    // which is the entire point of the mechanism. ctx.menuDemand only holds
    // ingredients wanted by a menu that is STILL ON THE TABLE and still reachable,
    // so a card already taken contributes nothing from that moment on - and it
    // never comes back, so the bot never returns to it.
    const demand = ctx.menuDemand[tile.ingredient];
    if (demand) {
      const already = menuTaken[tile.ingredient] || 0;
      const held = (ctx.menuHeld[tile.ingredient] || 0) + already;
      menuTaken[tile.ingredient] = already + 1;
      // SUPPLY PAST WHAT THE MENU WANTS BUYS LITTLE. A menu short two lemons is
      // not helped by a sixth lemon on the board - but the taper is a taper rather
      // than a cliff, because a tile in the wrong PLACE is not removable, so spare
      // copies genuinely do help a little.
      score += demand.value * (held >= demand.wanted ? 0.4 : 1);
    }
    // THE FLAVOUR OF THE DAY. Flat, undiscounted and with NO taper - unlike the
    // menu term above there is no "enough" here: the tenth Flavour tile scores
    // exactly as much as the first, and holding more of them than anybody else is
    // the majority. The value already carries the contention half (see
    // flavourTileValue), so this line stays one addition.
    if (ctx.flavourIngredient && tile.ingredient === ctx.flavourIngredient) {
      score += ctx.flavourValue;
    }
  }

  // Mild bonus for more tiles = more options.
  score += sweptTiles.length * 0.1;
  return score;
}

// (bestSweepScoreOn, which scored an arbitrary market array for a given player,
// was deleted on 1 August with decideOrderTea - its only caller. It existed to
// compare the live market against synthetic fresh ones when weighing whether to
// order tea, and there is no such decision any more.)

// How many currently-COVERED teapot symbols this sweep would uncover. Symbol
// cells are config (TEAPOT_SYMBOL_CELLS), and the 30 July inner-ring placement
// puts two of them in row 2, two in row 4, two in column 2 and two in column 4 -
// so one sweep really can open the gate on its own, which is exactly why this
// has to be priced. Four cell reads; safe to call inside sweep ranking.
function symbolsExposedBySweep(market, sweep, marketSize) {
  let exposed = 0;
  for (const cell of TEAPOT_SYMBOL_CELLS) {
    const tile = market[cell];
    if (!tile) continue; // already visible
    const inLine = sweep.isRow
      ? Math.floor(cell / marketSize) === sweep.rowOrCol
      : cell % marketSize === sweep.rowOrCol;
    if (!inLine) continue;
    const matches = sweep.declarationType === 'colour'
      ? tile.colour === sweep.declaration
      : tile.ingredient === sweep.declaration;
    if (matches) exposed++;
  }
  return exposed;
}

// What uncovering `exposed` teapot symbols is WORTH to us, given `visibleNow`
// already show. SIGNED: positive means the exposure is good for us.
//
// Exactly one thing matters - whether this is the move that takes the visible
// count across REFRESH_THRESHOLD, and so fires the pot at the end of OUR turn.
//   - Symbols beyond the threshold are worth nothing extra. The pot has been flat
//     since 30 July, and the flush re-covers every cell regardless.
//   - Falling short of the threshold is worth nothing either. Uncovering the
//     third teapot does not arm anything for anyone: the next player cannot use
//     it (there is no start-of-turn option any more), and by our next turn the
//     board will have moved on.
//   - visibleNow is always BELOW the threshold when this runs, because tea fires
//     at the end of the turn that reaches it - no turn can begin with the trigger
//     armed. The >= branch is defence in depth for a constructed state.
//
// No taper. The old one existed because a nearly-empty board was heading for the
// mandatory empty-market refresh anyway, so withholding bought less. That
// backstop is unreachable now: the end-of-turn trigger always fires first.
function symbolTriggerValue(visibleNow, exposed) {
  if (exposed === 0) return 0;
  if (visibleNow >= REFRESH_THRESHOLD) return 0;              // already fired
  if (visibleNow + exposed < REFRESH_THRESHOLD) return 0;     // still short

  return TEA_POT_REWARD * TEA_CUPCAKE_VALUE
    + TEA_TRIGGER_PRIORITY_VALUE
    - TEA_TRIGGER_HANDOVER_COST;
}

// All valid sweeps on the LIVE market scored best-first for the active player.
// Score = raw tile value PLUS the (signed, usually slightly negative) value of
// any teapot trigger the sweep pulls. Shared by rankSweeps (which drops the
// scores) and decideSweep.
function scoreSweeps(gameState) {
  const validSweeps = getValidSweeps(gameState);
  if (validSweeps.length === 0) return [];

  const currentPlayer = gameState.players[gameState.currentPlayerIndex];
  const marketSize = gameState.marketSize;
  const ctx = sweepContext(currentPlayer, gameState.cardMarket, gameState);

  const visibleNow = getVisibleTeapotSymbols(gameState);
  // How many tiles this player can actually place this turn - see
  // SWEEP_WASTED_TILE_COST. Computed once: nothing in the loop touches the board.
  const capacity = sweepCapacity(gameState);

  const scored = validSweeps.map(sweep => {
    const taken = getSweptTiles(gameState.market, sweep, marketSize).length;
    const wasted = Math.max(0, taken - capacity);
    const score = rawSweepScore(gameState.market, sweep, marketSize, ctx)
      + symbolTriggerValue(visibleNow, symbolsExposedBySweep(gameState.market, sweep, marketSize))
      - wasted * SWEEP_WASTED_TILE_COST;
    return { sweep, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored;
}

// All valid sweeps ranked best-first by the window-aware heuristic. Exported
// so the MCTS bot can prune its search to the most promising candidates.
export function rankSweeps(gameState) {
  return scoreSweeps(gameState).map(s => s.sweep);
}

export function decideSweep(gameState) {
  const ranked = rankSweeps(gameState);
  return ranked.length > 0 ? ranked[0] : null;
}

// Fewest tiles missing across every viable window of `card` on `board`, or
// Infinity when the card has no viable window at all (every placement collides
// with a wrong-coloured tile or tart). A complete pattern reports 0.
function minMissingForCard(board, card) {
  let best = Infinity;
  for (const win of getPatternWindows(board, card.pattern)) {
    if (win.missing.length < best) best = win.missing.length;
  }
  return best;
}

// Would a refresh right now actually RESTOCK the tile market, i.e. does the bag
// (plus the tiles the flush returns to it) hold enough to fill every cell?
//
// This began life as a workaround for a rules hole: once the bag was short, the
// redeal left cells empty - including teapot-symbol cells - so the trigger stayed
// armed and a bot that only checked legality would order tea again, on the same
// turn, for another pot, forever (~200 refreshes, games that never ended). That
// hole is CLOSED in the rules, though not the way it was on 1 August: since
// 4 August isTeaDue is a pure symbol count with no bag check in it, and a short
// bag deals what it has while play continues over the thinner market. Since
// 6 August a pot due against an EMPTY bag is simply a pot that does not happen -
// it ends nothing at all. Either way nothing here is load-bearing for termination,
// which is now a board filling up.
//
// NOTHING USES IT AS A VETO SINCE 1 AUGUST, because there is no longer a decision
// to veto - tea fires automatically at the end of a turn. Kept as a small public
// predicate: "would a flush right now actually restock the board, or just
// reshuffle what is left?" is still a real question about a position, and it is
// how a caller can spot the last flush a game will ever get.
export function refreshWouldRestockBoard(gameState) {
  let onBoard = 0;
  for (const tile of gameState.market) if (tile) onBoard++;
  return gameState.bag.length + onBoard >= gameState.market.length;
}

// DELETED 1 AUGUST: decideOrderTea, and the three helpers that existed only to
// serve it - committedScore, worthEndingTheGame and drawSyntheticMarket.
//
// The design doc used to call ordering tea "the AI biggest new decision": a
// voluntary start-of-turn flush weighed on how well the current market suited
// us, the pot, denial of the next player, and the race to fire first. The rule
// change removes the decision entirely - tea now fires by itself at the end of
// the turn that uncovers the fourth teapot. What survives of that judgement is
// symbolTriggerValue above, which prices the trigger inside the sweep choice
// where the decision now actually lives.
//
// Drivers no longer call decideOrderTea. It is gone rather than stubbed so that
// a driver still calling it fails loudly instead of silently never firing.

// Which market card to PAY to reserve on our own turn (returns a cardId), or
// null to pass. Called at the spend step; reserveCard charges
// RESERVE_CUPCAKE_COST and the reserve holds RESERVE_LIMIT (1) card.
//
// WHAT THE 3 AUGUST RULE CHANGE DID TO THIS. It used to be a FREE decision in a
// clockwise round after every pot of tea, which is why the floor below was set
// where it was: a dud cost nothing but a slot. Now the take costs a cupcake, and
// a cupcake buys an extra tile that unlocks a claim about 39% of the time - so
// the bar a reserve must clear is that alternative use, not zero. Hence
// RESERVE_CUPCAKE_VALUE below the floor, and hence a bot that reserves only what
// it means to finish, which is exactly the behaviour the paid rule is for.
//
// It is also a DIFFERENT KIND OF DECISION now: on our own turn, against a row we
// can see the tea trigger coming for. A card worth protecting from an imminent
// flush is worth more than the same card on a quiet turn - see FLUSH_IMMINENT
// below.
//
// WHY THIS IS NOT vp / (1 + missing) ANY MORE. Step 5 measured that only 29-36%
// of reserved cards were ever claimed - two thirds of every reserve round scored
// nothing. Probing where those reserves went (120 games) showed it is a real bot
// weakness rather than a rule problem: completion tracks the number of tiles the
// card was short of at the moment of reserving almost perfectly (55% at 0-1
// missing, 33% at 2, 20% at 3, 4% at 4), and the old ranking put 63-78% of
// reserves in the 2+ band because dividing by (1 + missing) never fell fast
// enough to stop a 5-VP card three tiles short outbidding a 2-VP card that was
// nearly done.
//
// So the score is now an EXPECTED PAYOUT: (card VP + the banked sacrifice tile)
// times the measured odds of ever completing it. The RESERVE_MIN_VALUE floor
// below which passing is correct dates from the one-card slot (a dud blocked
// every future refresh's reserve too). Since 1 Aug the reserve is UNCAPPED, so a
// dud costs nothing but the take - the floor is kept as a "not worth it" bar and
// still rises once the game is nearly over, but it is now the obvious knob to
// re-tune if bots look too shy about reserving.
export function decideReserve(gameState) {
  if (!canReserveCard(gameState)) return null;
  const player = gameState.players[gameState.currentPlayerIndex];

  // Roughly how many more claims this player gets before a board fills and ends
  // the game. The same public estimate decideDestination uses - see turnsRemaining.
  const myRemainingClaims = turnsRemaining(gameState);
  const maxMissing = myRemainingClaims <= RESERVE_LATE_CLAIMS
    ? RESERVE_LATE_MAX_MISSING
    : RESERVE_MAX_MISSING;

  // A card we could simply CLAIM this turn is never worth reserving - the rule
  // forbids claiming it on the turn it was reserved, so paying to reserve it
  // would cost a cupcake to delay a claim we already had.
  const claimableNow = new Set();
  for (const card of gameState.cardMarket) {
    if (getPatternMatches(player.board, card.pattern).length > 0) claimableNow.add(card.id);
  }

  // Is the row about to be flushed? The symbol half is the engine's isTeaDue,
  // deliberately; the bag half is what turns "the market needs refilling" into "a
  // pot is actually poured". Since 4 August isTeaDue no longer looks at the bag,
  // and a due pot with an EMPTY bag brews nothing at all - it triggers the end of
  // the game instead, with no card flush - so a reserve bought to rescue a card
  // from that firing would be a wasted cupcake. If a pot does brew, everything in
  // the row is gone before our next turn and the reserve is the only thing that
  // can save one, which is the whole reason the card flush was kept when the
  // reserve round was deleted.
  const flushImminent = gameState.bag.length > 0
    && getVisibleTeapotSymbols(gameState) >= REFRESH_THRESHOLD;

  let bestId = null;
  // The bar is the HIGHER of the two floors, not their sum. RESERVE_MIN_VALUE is
  // the old "not worth the slot" bar from the free era and RESERVE_CUPCAKE_VALUE
  // is what the cupcake buys elsewhere; adding them charged the reserve twice and
  // left the bot reserving almost nothing.
  let bestValue = Math.max(RESERVE_MIN_VALUE, RESERVE_CUPCAKE_VALUE);
  for (const card of gameState.cardMarket) {
    if (claimableNow.has(card.id)) continue;
    const mm = minMissingForCard(player.board, card);
    if (mm === Infinity || mm > maxMissing) continue; // no viable window, or hopeless
    const odds = RESERVE_COMPLETION_ODDS[mm] ?? 0;
    let value = ((card.vp || 0) + CLAIM_EXTRA) * odds;
    if (flushImminent) value += RESERVE_FLUSH_RESCUE_VALUE * odds;
    if (value > bestValue) {
      bestValue = value;
      bestId = card.id;
    }
  }
  return bestId;
}

// Pre-3-August name, when reserving was a free step of the tea round driven by a
// separate reserverIndex. Kept so an old driver fails soft rather than silently
// never reserving; it ignores the index because there is only one reserver now -
// the player whose turn it is.
export function decideTeaReserve(gameState) {
  return decideReserve(gameState);
}

// SPEND 1 CUPCAKE: TAKE 1 EXTRA TILE. The highest-value new decision of the
// 3 August set, and the one the change is load-bearing on.
//
// THE TRIGGER CONDITION IS DELIBERATELY NARROW: buy only when we are CARD-LOCKED
// (nothing claimable from the row or our reserve as things stand) and some tile
// on the market, dropped into some legal cell, would unlock a claim. That is
// exactly the population probe-cupcake-spends.js measured - 37.9-39.4% of locked
// turns are curable this way - so the bot buys where the evidence says the tile
// pays and nowhere else. Buying to improve an already-claimable turn is a
// different, unmeasured question and is deliberately left alone.
//
// Returns a market index to buy, or null. Cards carry COLOUR patterns only, so
// the search is over the DISTINCT COLOURS on the market rather than all 25 cells;
// the chosen index is then the best-placed tile of the winning colour, preferring
// one sitting on a teapot cell (taking it uncovers a symbol, exactly as a sweep
// would, and can fire our own end-of-turn pot).
export function decideExtraTile(gameState) {
  if (!canBuyExtraTile(gameState)) return null;
  const player = gameState.players[gameState.currentPlayerIndex];

  // The board as it WILL BE once this turn's swept tiles are placed. Buying
  // happens before placement, so testing against the bare board would miss every
  // unlock the sweep itself is about to create - and claim double-count them.
  const projected = [...player.board];
  const freeCells = getValidPlacements(projected);
  const candidateCards = [...gameState.cardMarket, ...player.reservedCards]
    .filter(c => c.id !== gameState.reservedCardIdThisTurn);

  // Already claimable once the sweep lands? Then we are not locked and there is
  // nothing here to buy. Simulate the placements decidePlacements would make.
  const plan = gameState.pendingSweepTiles.length > 0 ? decidePlacements(gameState) : [];
  for (let i = 0; i < plan.length; i++) {
    // NULL means "back into the bag" under the 6 August trim rule, and it must be
    // tested for explicitly: `null >= 0` is TRUE in JavaScript, so the old
    // `plan[i] >= 0` guard would write the tile to projected['null'] and quietly
    // stop projecting the board at all.
    if (plan[i] === null || plan[i] === undefined) continue;
    projected[plan[i]] = gameState.pendingSweepTiles[i];
  }
  for (const card of candidateCards) {
    if (getPatternMatches(projected, card.pattern).length > 0) return null; // not locked
  }

  const spots = getValidPlacements(projected);
  if (spots.length === 0) return null;

  const marketColours = new Map(); // colour -> market indices holding it
  for (let i = 0; i < gameState.market.length; i++) {
    const tile = gameState.market[i];
    if (!tile) continue;
    if (!marketColours.has(tile.colour)) marketColours.set(tile.colour, []);
    marketColours.get(tile.colour).push(i);
  }

  let bestColour = null;
  let bestVp = -Infinity;
  for (const [colour] of marketColours) {
    for (const cellIndex of spots) {
      const trial = [...projected];
      trial[cellIndex] = { colour, ingredient: null };
      for (const card of candidateCards) {
        if (getPatternMatches(trial, card.pattern).length === 0) continue;
        const vp = (card.vp || 0) + CLAIM_EXTRA;
        if (vp > bestVp) {
          bestVp = vp;
          bestColour = colour;
        }
      }
    }
  }
  if (bestColour === null) return null;
  // Worth the cupcakes at all? The unlocked claim must beat what else they buy,
  // priced the same way the reserve decision prices them.
  //
  // MULTIPLIED BY THE PRICE, which it was not before: this read
  // `bestVp < RESERVE_CUPCAKE_VALUE` back when an extra tile cost exactly 1
  // cupcake, so the two happened to coincide. At a price of 2 that form would let
  // the bot pay two cupcakes for a one-cupcake payoff and the price rise would
  // show up in the report as no behaviour change at all. The price went back to 1
  // on 7 August, so the two coincide again - KEEP THE MULTIPLICATION ANYWAY, since
  // that coincidence is exactly what hid the bug the first time.
  if (bestVp < EXTRA_TILE_CUPCAKE_COST * RESERVE_CUPCAKE_VALUE) return null;

  // Among tiles of the winning colour, prefer one on a teapot cell, then one
  // whose ingredient we already hold. The ingredient half used to be about the
  // pantry goals; with those deleted it survives on the concentration argument
  // alone - a tile whose ingredient we already have is a tile that can extend a
  // stand row when it is sacrificed, rather than opening a second one.
  const indices = marketColours.get(bestColour);
  const ingredientHeld = (idx) => {
    const tile = gameState.market[idx];
    return tile ? countBoardIngredient(player.board, tile.ingredient) : 0;
  };
  let bestIndex = indices[0];
  let bestRank = -Infinity;
  for (const idx of indices) {
    const rank = (TEAPOT_SYMBOL_CELLS.includes(idx) ? 2 : 0) + Math.min(1, ingredientHeld(idx));
    if (rank > bestRank) {
      bestRank = rank;
      bestIndex = idx;
    }
  }
  return bestIndex;
}

// Market indices ranked best-first as bonus-tile picks. Exported so the MCTS
// bot can prune its search to the most promising candidates.
export function rankBonusTiles(gameState) {
  const availableTiles = gameState.market
    .map((t, i) => ({ tile: t, index: i }))
    .filter(({ tile }) => tile !== null);

  if (availableTiles.length === 0) return [];

  const currentPlayer = gameState.players[gameState.currentPlayerIndex];

  // Value each market tile by the claim progress its colour buys on OUR board
  // (window-aware), not by raw colour frequency across the card market.
  const colourValue = buildColourDemand(currentPlayer.board, gameState.cardMarket);

  // Symbol steering applies here too: the bonus tile is lifted straight off the
  // market, so taking the one sitting on a teapot-symbol cell uncovers that
  // symbol exactly as a sweep would - and, since 1 August, can be what fires our
  // own end-of-turn pot.
  const visibleNow = getVisibleTeapotSymbols(gameState);

  const scored = availableTiles.map(({ tile, index }) => {
    let score = colourValue[tile.colour] || 0;

    // Prefer tiles matching ingredients we're already picking up this turn.
    const ingredientCount = gameState.pendingSweepTiles.filter(
      t => t.ingredient === tile.ingredient
    ).length;
    score += ingredientCount * 0.5;

    if (TEAPOT_SYMBOL_CELLS.includes(index)) {
      score += symbolTriggerValue(visibleNow, 1);
    }

    return { index, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.map(s => s.index);
}

export function decideBonusTile(gameState) {
  const ranked = rankBonusTiles(gameState);
  return ranked.length > 0 ? ranked[0] : null;
}

// NOTE: place() pairs placements[i] with pendingSweepTiles[i] BY INDEX, so
// the returned array must be aligned to the original tile order.
//
// THE TRIM RULE (6 August). A sweep may be bigger than the board's free space.
// The array is still one entry per swept tile, but an entry may be NULL, meaning
// "this tile goes back into the bag". Exactly getSweepPlacementCount(gameState)
// of them must be non-null - fewer is illegal and more is impossible - and this
// falls out of the loop below: it commits one best (tile, cell) pair at a time
// and stops when the cells run out, leaving the tiles it never reached as nulls.
// So the tiles GIVEN UP are the ones the placement heuristic wanted least, which
// is the right answer without a second decision.
//
// It used to throw here when the tiles outnumbered the cells, because that state
// ended the game and the bot was never meant to see it.
export function decidePlacements(gameState) {
  const currentPlayer = gameState.players[gameState.currentPlayerIndex];
  const tilesToPlace = gameState.pendingSweepTiles;
  const board = [...currentPlayer.board]; // scratch copy, updated as we commit

  const placements = new Array(tilesToPlace.length).fill(null);
  const remaining = tilesToPlace.map((tile, index) => ({ tile, index }));

  // THE TASTING MENU. A menu-wanted tile only ever reaches the cake stand if it is
  // the tile REMOVED by a claim, and only a tile inside a completed pattern can be
  // removed - so where such a tile goes matters as much as whether we took it. The
  // demand map below already answers "does this cell advance a live window for this
  // colour"; a non-zero gain IS that test, so the bonus rides on it rather than
  // re-walking getPatternWindows.
  //
  // Built ONCE for the whole placement, not per candidate: nothing in this loop
  // plates a tile, so the stand - and therefore every menu deficit - is unchanged
  // throughout. Zero for an ingredient no live reachable menu wants, so there is no
  // point steering a placement toward a prize that is not there any more.
  const menuDemand = menuIngredientDemand(gameState, currentPlayer);

  // THE FLAVOUR OF THE DAY IS DELIBERATELY ABSENT FROM THIS FUNCTION, and that is
  // a decision rather than an omission. The Flavour scores off the board wherever
  // the tile sits, so by the time a swept tile reaches this step the point is
  // already banked - the placement question is purely "which cell", and this
  // heuristic answers it for pattern position. The only thing a Flavour term could
  // steer here is keeping such tiles OUT of completed patterns so a claim never
  // sacrifices them, and that is a hoarding term of exactly the kind the module's
  // handoff rules out: it would fight the claim step, which pays several times
  // more. The sweep decides whether we get the tile; the claim decides whether we
  // keep it. Neither of them is here.

  // Commit one (tile, position) pair at a time, always the globally best one,
  // recomputing window demand after each commit so a tile that opens up a
  // near-complete window is immediately followed up on.
  while (remaining.length > 0) {
    const demand = buildPlacementDemand(board, gameState.cardMarket);
    const positions = getValidPlacements(board);
    // Out of cells: everything still in `remaining` keeps its null and goes back
    // into the bag. See the trim-rule note above.
    if (positions.length === 0) break;

    let bestEntry = remaining[0];
    let bestPos = positions[0];
    let bestScore = -Infinity;

    for (const entry of remaining) {
      for (const pos of positions) {
        const colourMap = demand.get(pos);
        const gain = colourMap ? colourMap.get(entry.tile.colour) || 0 : 0;

        // Occupying a cell that windows want for a DIFFERENT colour kills
        // those windows — charge most of the best forgone gain.
        let forgone = 0;
        if (colourMap) {
          for (const [colour, value] of colourMap) {
            if (colour !== entry.tile.colour && value > forgone) forgone = value;
          }
        }

        let score = gain - forgone * 0.9;

        // Put a menu-wanted tile where it can be cashed. Deliberately gated on
        // gain > 0: such a tile parked outside every window can never be removed,
        // so it can never reach the stand, and paying for it there would just
        // scatter them.
        if (gain > 0) {
          const demand = menuDemand[entry.tile.ingredient];
          if (demand) score += demand.value;
        }

        if (gain === 0) {
          // Dead tile: tuck it against existing tiles/edges so contiguous
          // open space (future pattern room) is preserved.
          score -= emptyNeighbourCount(board, pos) * 0.05;
        }

        score += Math.random() * 0.001; // tie-break

        if (score > bestScore) {
          bestScore = score;
          bestEntry = entry;
          bestPos = pos;
        }
      }
    }

    board[bestPos] = bestEntry.tile;
    placements[bestEntry.index] = bestPos;
    remaining.splice(remaining.indexOf(bestEntry), 1);
  }

  return placements;
}

// ── Empty-plate removal constants ──────────────────────────────────────────
// These were written for the 2-cupcake plate MOVE. That action is deleted; the
// plate is now REMOVED to the box for REMOVE_PLATE_CUPCAKE_COST, and the same
// valuation applies with one term dropped and one term raised.
//
// AND THE VALUATION IS NOW KNOWN TO BE WRONG, 7 AUGUST. It predates 6 August,
// when a removed plate stopped being board repair and became the only action
// that pushes the game's ending away - so this heuristic prices a reclaimed cell
// at its board value and ignores its value as TIME. The price came down to 2 on
// 7 August and purchases rose about 33-fold even under this undervaluation, so
// the true rate under competent play is higher than the harness reports. Teach
// decideRemovePlate that a cell is worth a fraction of a turn before reading any
// A/B of this price as settled.
//
// PLATE_REMOVE_MAX_GAP: how many cells a window may still need AFTER the plate is
//   cleared before the bot stops caring. The freed cell always counts as one of
//   them, so 2 means "the plate, plus at most one more tile". Beyond that the
//   measured completion odds collapse (see RESERVE_COMPLETION_ODDS) and the
//   spend is a lottery ticket.
const PLATE_REMOVE_MAX_GAP = 3;
// PLATE_REMOVE_SECONDARY_SHARE: a plate sits in the middle of the board and
//   sterilises EVERY window running through its cell, not just the best one, so
//   pricing the purchase off a single card badly undercounts it. The value is the
//   best card's gain in full plus this share of every other card's gain. It is
//   below 1 because only one card can be claimed per turn and the cards revived
//   compete with each other for the same freed cell.
//
//   RAISED 0.35 -> 0.5 WITH THE RULE CHANGE, and this is the one judgement call
//   in porting the heuristic. Under the old move the freed cell came at the price
//   of a NEW sterilised cell somewhere else, so the secondary windows were only
//   partly bought; a removal sterilises nothing, so more of that secondary value
//   is really collected. It remains below 1 for the one-claim-per-turn reason.
const PLATE_REMOVE_SECONDARY_SHARE = 0.5;

// DELETED WITH THE MOVE: PLATE_MOVE_DUMP_TRIES, and rankDumpCells below it. Both
// existed to answer "where do we put the plate we picked up", which a removal
// does not ask - the plate goes back in the box. This is why the removal is worth
// more than the move it replaces even at a higher price: the old option always
// had to spend a good cell somewhere to free a good cell here.

// Probability a window `missing` tiles short is ever completed. Reuses the
// measured RESERVE_COMPLETION_ODDS table - it answers exactly this question for
// reserved cards, and a market card's board-side arithmetic is the same. A
// window already complete is claimable now, so it is certainty rather than the
// table's 0.55 (which is measured on cards that cannot be claimed the turn they
// are taken). An unreachable window is 0.
function windowCompletionOdds(missing) {
  if (missing === 0) return 1;
  if (!Number.isFinite(missing) || missing < 0) return 0;
  const i = Math.min(missing, RESERVE_COMPLETION_ODDS.length - 1);
  return RESERVE_COMPLETION_ODDS[i];
}

// How close this card is to done on `board`, counting only windows a tile can
// actually be placed into. Infinity when a plate or a wrong-coloured tile has
// killed every window - which is precisely the state a plate move can undo.
function bestOpenGap(board, pattern) {
  let best = Infinity;
  for (const win of getPatternWindows(board, pattern)) {
    if (win.missing.length < best) best = win.missing.length;
  }
  return best;
}

// Cupcake TILE move at the spend step. ONE move per turn: relocate a tile
// (MOVE_TILE_CUPCAKE_COST) to complete a card we could not otherwise claim this
// turn. Immediate, certain, and only worth it if the unlocked card beats the best
// card already claimable, because a turn allows one claim either way.
//
// Returns { fromIndex, toIndex } or null.
//
// THE PLATE HALF OF THIS FUNCTION HAS MOVED OUT to decideRemovePlate. It used to
// be branch B here because a plate move and a tile move shared one per-turn
// allowance and so had to be compared against each other. They are separate
// actions with separate allowances now, and a turn can buy both, so comparing
// them would only stop the bot doing something legal.
export function decideMove(gameState) {
  const player = gameState.players[gameState.currentPlayerIndex];
  if (gameState.moveUsedThisTurn || player.cupcakes <= 0) return null;

  // Claimable candidates are the market cards PLUS this player's reserved cards
  // (which complete as normal claims). A cupcake move that helps any of them is
  // fair game.
  const candidateCards = [...gameState.cardMarket, ...player.reservedCards];

  let bestNowVp = 0;
  const matchedNow = new Set();
  for (const card of candidateCards) {
    if (getPatternMatches(player.board, card.pattern).length > 0) {
      matchedNow.add(card.id);
      bestNowVp = Math.max(bestNowVp, card.vp || 0);
    }
  }

  // Cells inside near-complete windows: avoid pulling a tile out of a pattern
  // we are one tile away from finishing.
  const protectedCells = new Set();
  const windowsByCard = new Map();
  for (const card of candidateCards) {
    const windows = getPatternWindows(player.board, card.pattern);
    windowsByCard.set(card.id, windows);
    for (const win of windows) {
      if (win.missing.length <= 1) for (const c of win.cells) protectedCells.add(c);
    }
  }

  // Complete a card this turn by relocating one tile.
  let bestTile = null;
  for (const card of candidateCards) {
    if (matchedNow.has(card.id)) continue;
    const vp = card.vp || 0;

    for (const win of windowsByCard.get(card.id)) {
      if (win.missing.length !== 1) continue;
      const { index: toIndex, colour } = win.missing[0];

      // Source: a same-colour tile outside this window, ideally one that is
      // not itself part of another near-complete window.
      let source = -1;
      let sourceProtected = true;
      for (let i = 0; i < player.board.length; i++) {
        const cell = player.board[i];
        if (!cell || cell.colour !== colour) continue; // skips empty plates (no colour)
        if (win.cells.includes(i)) continue;
        const isProtected = protectedCells.has(i);
        if (source === -1 || (sourceProtected && !isProtected)) {
          source = i;
          sourceProtected = isProtected;
        }
      }
      if (source === -1) continue;
      // Can we actually pay for THIS move? A tile move is 1, but read it from
      // the engine rather than assuming.
      const moveCost = getMoveCost(player, source);
      if (moveCost === null || player.cupcakes < moveCost) continue;

      // Card vp + banked sacrifice tile (~CLAIM_EXTRA) must beat what the
      // cupcakes are worth spent elsewhere AND the best claim already available
      // without moving.
      const net = vp + CLAIM_EXTRA - moveCost * RESERVE_CUPCAKE_VALUE - bestNowVp;
      if (net <= 0) continue;

      // Safety: verify the move really completes the card.
      const trial = [...player.board];
      trial[toIndex] = trial[source];
      trial[source] = null;
      if (getPatternMatches(trial, card.pattern).length === 0) continue;

      if (!bestTile || net > bestTile.net ||
          (net === bestTile.net && bestTile.sourceProtected && !sourceProtected)) {
        bestTile = { fromIndex: source, toIndex, net, sourceProtected };
      }
    }
  }

  return bestTile ? { fromIndex: bestTile.fromIndex, toIndex: bestTile.toIndex } : null;
}

// SPEND CUPCAKES (REMOVE_PLATE_CUPCAKE_COST): REMOVE AN EMPTY PLATE, reviving the windows it was killing.
// Returns a board index to remove, or null.
//
// Every claim leaves a plate behind on the sacrificed tile's cell - by
// construction in the middle of good territory - and a plate is the one
// obstruction that cannot be built around, because no tile may be placed on it.
//
// VALUED ON EXPECTED FUTURE VP, not on this turn. Clearing a cell can never
// complete a card the same turn: the spend step runs AFTER the place step, so the
// freed cell stays empty until next turn's placements. An earlier version of this
// tested "does this complete a card THIS TURN" and therefore scored the option at
// zero by construction, at every price - which is why it never once fired in a
// full simulation run. The value is instead each revived card's worth times the
// measured odds of ever filling the cells it still needs
// (windowCompletionOdds / RESERVE_COMPLETION_ODDS), net of the cupcakes spent at
// RESERVE_CUPCAKE_VALUE each.
//
// IT DOES NOT COMPETE WITH THE TILE MOVE. Removing a plate does not touch the
// claim step, so a turn can buy this AND a tile move AND still claim whatever was
// already claimable; the two have separate per-turn allowances in the engine.
export function decideRemovePlate(gameState) {
  if (!canRemovePlate(gameState)) return null;
  const player = gameState.players[gameState.currentPlayerIndex];

  const candidateCards = [...gameState.cardMarket, ...player.reservedCards];
  const matchedNow = new Set();
  for (const card of candidateCards) {
    if (getPatternMatches(player.board, card.pattern).length > 0) matchedNow.add(card.id);
  }

  // Which plates are even worth considering, and how close each card is today.
  const gapBefore = new Map();
  const platesWorthClearing = new Set();
  for (const card of candidateCards) {
    gapBefore.set(card.id, bestOpenGap(player.board, card.pattern));
    if (matchedNow.has(card.id)) continue; // claimable already - nothing to unblock
    for (const win of getPatternWindows(player.board, card.pattern, { allowBlocked: true })) {
      // Only a SINGLE plate is actionable: one removal per turn, and a window
      // needing two cleared is two turns and six cupcakes away.
      if (win.blocked.length !== 1) continue;
      if (win.missing.length + 1 > PLATE_REMOVE_MAX_GAP) continue;
      platesWorthClearing.add(win.blocked[0].index);
    }
  }
  if (platesWorthClearing.size === 0) return null;

  let best = null;
  for (const plateIndex of platesWorthClearing) {
    // The board as it WOULD BE with the plate gone. No dump cell to pick and no
    // collateral to weigh - that whole search belonged to the move, not this.
    const trial = [...player.board];
    trial[plateIndex] = null;

    const gains = [];
    for (const card of candidateCards) {
      const before = gapBefore.get(card.id);
      const after = bestOpenGap(trial, card.pattern);
      if (!(after < before)) continue;
      const weight = (card.vp || 0) + CLAIM_EXTRA;
      const gain = weight * (windowCompletionOdds(after) - windowCompletionOdds(before));
      if (gain > 0) gains.push(gain);
    }
    if (gains.length === 0) continue;

    gains.sort((a, b) => b - a);
    let value = gains[0];
    for (let i = 1; i < gains.length; i++) value += gains[i] * PLATE_REMOVE_SECONDARY_SHARE;

    const net = value - REMOVE_PLATE_CUPCAKE_COST * RESERVE_CUPCAKE_VALUE;
    if (net <= 0) continue;
    if (!best || net > best.net) best = { index: plateIndex, net };
  }

  return best ? best.index : null;
}

// VP actually banked by sending `tile` to the destination decideDestination
// would pick for it: the stand row's marginal value (plus the cupcake if that
// plate carries one), or 1 for the crumb tray.
function destinationValue(player, tile, gameState) {
  const destination = decideDestination(player, tile, gameState);
  if (destination.type !== 'row') return { destination, value: 1 };
  const filled = player.stand[destination.rowIndex].tiles.length;
  let value = rowMarginalValue(destination.rowIndex, filled);
  if (isCupcakePlate(destination.rowIndex, filled)) value += CUPCAKE_PLATE_BONUS;
  return { destination, value };
}

// Which card to claim, which tile to sacrifice for it, and where that tile goes.
//
// WHAT THE 28 JULY CARD-ROW REWORK CHANGED HERE. Claiming no longer draws a
// replacement card, and the row grows by one on every turn nobody claims. So:
//   - the cards we DON'T take stay put. The second-best claimable card used to be
//     about to be replaced by the refill; now it will still be sitting there on
//     our next turn, which makes the sacrifice tile's collateral damage a real
//     cost (CLAIM_PROTECT_OTHER) rather than a rounding error.
//   - waiting is cheaper than it was, but claiming is still close to free: the
//     card costs one board tile, that tile banks VP on the stand or crumb tray,
//     and the freed cell is space we need. So the bot still claims whenever it
//     can; what changed is WHICH card, not WHETHER.
//   - the perishable card is now the one somebody else can take or flush. A
//     reserved card is safe from the flush and scores 0 if never claimed, so it
//     is normally the one to finish (CLAIM_RESERVE_BONUS) - unless a refresh is
//     armed right now, in which case the whole row can be discarded before our
//     next turn and the row card is the one to bank (CLAIM_FLUSH_RISK_BONUS).
export function decideClaim(gameState) {
  // canClaimMore is unconditionally true since 6 August - empty plates are
  // unlimited and nothing caps claiming. The call stays because the engine keeps
  // the function as the hook a future claim limit would live in, and a bot that
  // stopped asking would be the thing that had to be found and fixed if one ever
  // arrived. It does NOT mean there is a supply to check.
  if (!canClaimMore(gameState)) return null;
  const currentPlayer = gameState.players[gameState.currentPlayerIndex];

  // Candidates are the market cards PLUS this player's reserved cards, which
  // complete as normal claims (claim() resolves a reserved id transparently).
  const candidateCards = [...gameState.cardMarket, ...currentPlayer.reservedCards];

  // Find all claimable cards.
  const claimableCards = [];
  for (const card of candidateCards) {
    const matches = getPatternMatches(currentPlayer.board, card.pattern);
    if (matches.length > 0) {
      claimableCards.push({ card, matches });
    }
  }

  if (claimableCards.length === 0) {
    return null; // Skip claim
  }

  const reservedIds = new Set(currentPlayer.reservedCards.map(c => c.id));
  // Is the card row itself about to be flushed? Since 1 August this is a
  // CERTAINTY rather than a risk: if the threshold is met and the bag can still
  // refill, tea fires at the end of this very turn and the whole row goes to the
  // discard. Anything we do not claim (or reserve) now is gone. The symbol half
  // is the engine's isTeaDue, deliberately - claim scoring must not disagree with
  // the trigger - and the bag half is the 4 August rule that isTeaDue no longer
  // carries: a needed refill against an empty bag ends the game rather than
  // brewing, so no flush happens and the row is not perishable after all.
  const rowAtRisk = gameState.bag.length > 0
    && getVisibleTeapotSymbols(gameState) >= REFRESH_THRESHOLD;

  // Colours still wanted by any market card.
  const coloursNeeded = new Set();
  for (const c of gameState.cardMarket) {
    for (const colour of c.pattern) {
      if (colour) coloursNeeded.add(colour);
    }
  }

  // Ingredients of locked, unfilled stand rows — a removed tile of one of
  // these extends an existing row (better than opening a new one).
  const lockedUnfilled = new Set();
  for (const row of currentPlayer.stand) {
    if (row.ingredient !== null && row.tiles.length < row.capacity) {
      lockedUnfilled.add(row.ingredient);
    }
  }

  // THE TASTING MENU: what this claim does to the player's deficit against the
  // nearest live menu. THIS IS THE STEP WHERE THE MODULE IS WON OR LOST, because
  // claim's row destination is the only way a tile reaches the cake stand, and the
  // stand is the only thing a menu reads.
  //
  // It goes in at FULL weight rather than through CLAIM_DEST_WEIGHT: a completed
  // menu is certain, immediate, banked-this-instant VP, where a stand plate is
  // realised at the end of the game and can be stranded. Completion is worth
  // TASTING_MENU_VP outright - larger than any other term in this
  // function, and it is meant to be: converting the 44.3% of players who finish
  // one tile short is the entire behavioural change this build is testing.
  //
  // The value is 0 for any menu somebody else has already taken, and unlike the
  // Freshness cups it never comes back, so a bot that loses a race abandons it
  // permanently and re-targets. That is the module working as designed.

  // THE FLAVOUR OF THE DAY: what one board tile of the Flavour is worth to this
  // player right now, which is exactly what sacrificing one COSTS them. Computed
  // once per decision - it does not change between candidate cards - and 0 when the
  // module is off, so the term below disappears without a guard.
  //
  // THIS IS THE OPPOSED GRADIENT. Until 6 August every part of a claim was
  // positive; a claim that eats a Flavour tile now costs a point and possibly the
  // majority, and this is the only place in the bot that can see it.
  const flavourCost = flavourTileValue(gameState, currentPlayer);

  let best = null;
  for (const candidate of claimableCards) {
    const patternCells = candidate.matches[0].cells;

    // Cells the OTHER claimable cards are standing on. Those cards are not
    // going anywhere now that claims do not refill the row, so a sacrifice that
    // breaks one costs us next turn's claim.
    const otherCells = new Set();
    for (const other of claimableCards) {
      if (other === candidate) continue;
      for (const cell of other.matches[0].cells) otherCells.add(cell);
    }

    let bestRemoveIndex = patternCells[0];
    let bestRemoveScore = -Infinity;
    let bestRemoveValue = 1;
    let bestRemoveMenu = 0;
    let bestRemoveFlavour = 0;
    let bestDestination = null;

    for (const cellIndex of patternCells) {
      const tile = currentPlayer.board[cellIndex];
      if (!tile) continue;

      const { destination, value } = destinationValue(currentPlayer, tile, gameState);
      let score = value * CLAIM_DEST_WEIGHT;

      // THE TASTING MENU. The destination gate that stood here until 6 August is
      // GONE. It read: score the menu only when the tile is being plated, because
      // a crumbed tile is invisible to every menu. The crumb tray counts now
      // (MENU_COUNTS_CRUMB_TRAY), so the gate would suppress the term on precisely
      // the removals a trailing player can actually make - which is the opposite
      // of what the rule change is for, and would have measured as "the change did
      // nothing".
      //
      // The term is now about the REMOVAL: this tile's ingredient advances a menu
      // wherever it lands, so it is worth more to take off the board than a tile
      // that does not.
      const menu = menuValueOfPlating(gameState, currentPlayer, tile.ingredient);
      score += menu;

      // THE FLAVOUR OF THE DAY - THE SACRIFICE PENALTY, and the term this whole
      // module turns on. Only the PLAYER BOARD counts for the Flavour, so a
      // sacrificed Flavour tile stops scoring the moment it reaches the stand or
      // the crumb tray: prefer to give up a tile that is not the Flavour, all else
      // being equal.
      //
      // A PREFERENCE, NOT A VETO. It is priced against the other terms rather than
      // filtering the cell out, because a card worth 5 VP is still worth a 1 VP
      // tile - the bot should feel the cost, not refuse the claim over it.
      const flavourLoss = (gameState.flavourOfTheDay && tile.ingredient === gameState.flavourOfTheDay)
        ? flavourCost
        : 0;
      score -= flavourLoss;

      // Prefer removing a tile that extends a locked stand row.
      if (lockedUnfilled.has(tile.ingredient)) score += 5;

      // Do not knock out a card we could claim next turn.
      if (otherCells.has(cellIndex)) score -= CLAIM_PROTECT_OTHER;

      // Avoid breaking a colour still needed if this is the only tile of it.
      if (coloursNeeded.has(tile.colour)) {
        const otherTilesOfColour = currentPlayer.board.filter(
          (t, i) => i !== cellIndex && t && t.colour === tile.colour
        );
        if (otherTilesOfColour.length === 0) {
          score -= 10;
        }
      }

      // (An objectiveBreakCost penalty stood here until 4 August, refusing to
      // sacrifice a tile a satisfied pantry goal was standing on. The pantry
      // goals are deleted, so a board tile's ingredient now matters only for
      // where the sacrifice lands - which destinationValue above already prices.)

      if (score > bestRemoveScore) {
        bestRemoveScore = score;
        bestRemoveIndex = cellIndex;
        bestRemoveValue = value;
        bestRemoveMenu = menu;
        bestRemoveFlavour = flavourLoss;
        bestDestination = destination;
      }
    }

    // Card value = printed VP + what the sacrifice banks, plus perishability.
    // The Tasting Menu is part of WHICH CARD is worth claiming, not only of which
    // tile to sacrifice: a card whose pattern happens to sit on the tile that
    // completes a menu is worth TASTING_MENU_VP more than an identical one that
    // does not, and that is a bigger swing than any card's printed VP.
    // The Flavour comes off the same way, and for the same reason as the menu term
    // rides on: WHICH card to claim is partly a question of what its pattern is
    // standing on. A card whose only sacrifice is a Flavour tile is worth strictly
    // less than an identical one that leaves the Flavour alone.
    let cardScore = (candidate.card.vp || 0) + bestRemoveValue * CLAIM_DEST_WEIGHT + bestRemoveMenu - bestRemoveFlavour;
    const fromReserve = reservedIds.has(candidate.card.id);
    if (fromReserve) cardScore += CLAIM_RESERVE_BONUS;
    else if (rowAtRisk) cardScore += CLAIM_FLUSH_RISK_BONUS;
    // Tie-break toward the smaller pattern (fewer tiles committed to one shape).
    cardScore -= candidate.card.pattern.filter(c => c).length * 0.01;

    if (!best || cardScore > best.cardScore) {
      best = {
        cardScore,
        cardId: candidate.card.id,
        removedBoardIndex: bestRemoveIndex,
        destination: bestDestination,
      };
    }
  }

  // Fallback: every matched cell was somehow empty (cannot happen for a real
  // match, but decideDestination must not be called on undefined).
  if (!best.destination) {
    const tile = currentPlayer.board[best.removedBoardIndex];
    best.destination = decideDestination(currentPlayer, tile, gameState);
  }

  return {
    cardId: best.cardId,
    removedBoardIndex: best.removedBoardIndex,
    destination: best.destination,
  };
}
