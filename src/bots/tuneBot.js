// CARRIED FORWARD 6 AUGUST, HEURISTICS UNTOUCHED. This is an ARCHIVED A/B arm,
// frozen against the rules of its own day, and it stays that way - but two things
// in it stopped being valid code rather than merely out of date, and both were
// repaired so `node arena.js` still runs it:
//   - the claims-remaining horizon read gameState.cardsNeededToEnd, the deleted
//     empty-plate pool. It now reads free cells on the fastest-filling board over
//     ~2.5 tiles a turn, exactly as basicBot does. Left alone it read undefined
//     and produced NaN, which is worse than a wrong estimate - it is a silent one.
//   - decidePlacements threw when the swept tiles outnumbered the free cells.
//     Sweeping more than you can place is legal now (the excess goes back into the
//     bag), so it returns a null-padded array like every other bot.
// DO NOT tune anything else here. If a heuristic needs to change, change basicBot.
// tuneBot: basicBot with its tuning constants exposed as environment
// variables, for arena.js sweeps. REGENERATED FROM basicBot.js - do not edit the
// heuristics here, edit basicBot and regenerate, or the comparison is meaningless.
//
// Knob names are prefixed '' so tuneBot and tuneBot2 can be swept
// against each other in one process without their environments colliding.
//
// Rebuilt 1 August for the end-of-turn tea trigger. The refresh-timing and
// symbol-avoidance knobs are gone with the decision they tuned;
// TEA_TRIGGER_PRIORITY_VALUE and TEA_TRIGGER_HANDOVER_COST replace them.
const K = (n, d) => (process.env[n] !== undefined ? parseFloat(process.env[n]) : d);
import { getValidSweeps, getPatternMatches, getPatternWindows, getValidPlacements, getTotalCardsClaimed, getVisibleTeapotSymbols, canClaimMore, STAND_ROW_VALUES, CUPCAKE_PLATES, TEAPOT_SYMBOL_CELLS, REFRESH_THRESHOLD, TEA_POT_REWARD, REWARD_CARDS, COLOURS, INGREDIENTS, BOARD_SIZE } from '../engine/game.js';

// The claims-remaining horizon, re-denominated in the 6 August clock (a full
// board) rather than the deleted plate pool. Copied from basicBot deliberately -
// an archived arm must not import a live bot's internals.
const TILES_DRAWN_PER_TURN = 2.5;
function turnsRemaining(gameState) {
  let minFree = Infinity;
  for (const p of gameState.players) {
    minFree = Math.min(minFree, getValidPlacements(p.board).length);
  }
  return Math.max(1, Math.ceil(minFree / TILES_DRAWN_PER_TURN));
}

// Approximate value of a completed claim beyond the card's printed VP: the
// sacrificed tile is banked on the stand or crumb tray. A conservative floor —
// a crumb is 1 VP, a shallow plate 2-3 — kept low so the sweep/placement demand
// weighting below stays a relative ranking, not an absolute score. (Realized
// plate marginals under the escalating table average higher, ~4-5, but bumping
// this would need TEA_WEAK_SWEEP_MAX and the pruning cutoffs re-tuned in lockstep,
// so it is deliberately left as a stable floor.)
const CLAIM_EXTRA = 2;

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
//   + first pick in the reserve round, which the tea player leads
//   - the freshly dealt 25-tile market, which we do NOT get to sweep (we have
//     already swept by the time the pot resolves) and the next seat does
//
// That last term is the counterweight the rule deliberately builds in, and it is
// why this comes out a near-wash rather than a magnet. Deliberately so:
// uncovering the fourth teapot should be a tiebreak between otherwise similar
// sweeps, not a reason to take a bad one.
//
// TEA_CUPCAKE_VALUE: one cupcake expressed in scoreSweeps points. A cupcake is
//   1 VP kept and rather more when spent on a move that completes a card.
const TEA_CUPCAKE_VALUE = K('TEA_CUPCAKE_VALUE', 6);
// TEA_TRIGGER_PRIORITY_VALUE: leading the reserve round. Worth well under a full
//   cupcake: we get first refusal on the card row, but every opponent still gets
//   a pick behind us, so the edge is priority rather than exclusivity.
const TEA_TRIGGER_PRIORITY_VALUE = K('TEA_TRIGGER_PRIORITY_VALUE', 4);
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
const TEA_TRIGGER_HANDOVER_COST = K('TEA_TRIGGER_HANDOVER_COST', 0);

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
const RESERVE_MAX_MISSING = K('RESERVE_MAX_MISSING', 2);
// RESERVE_LATE_MAX_MISSING / RESERVE_LATE_CLAIMS: near the end there is no time
//   to build a window, and the probe measured last-quarter reserves completing
//   6% (4p). With this few claims left in the game the bot only reserves what is
//   already all but finished.
const RESERVE_LATE_MAX_MISSING = K('RESERVE_LATE_MAX_MISSING', 1);
const RESERVE_LATE_CLAIMS = K('RESERVE_LATE_CLAIMS', 2);
// RESERVE_MIN_VALUE: expected payout (in VP) below which the slot is better left
//   empty for the next refresh - a reserve is limited to one card and a dud
//   blocks the slot for the rest of the game.
const RESERVE_MIN_VALUE = K('RESERVE_MIN_VALUE', 1.5);

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
const CLAIM_DEST_WEIGHT = K('CLAIM_DEST_WEIGHT', 0.6);
// CLAIM_PROTECT_OTHER: penalty for sacrificing a tile that another card we can
//   ALSO claim needs. Under the old refill-on-claim rule that card was about to
//   be replaced anyway; now it sits in the row waiting for us.
const CLAIM_PROTECT_OTHER = K('CLAIM_PROTECT_OTHER', 4);
// CLAIM_RESERVE_BONUS: prefer finishing a reserved card when values are close.
//   An unclaimed reserve scores 0 at the end AND blocks the one reserve slot,
//   and it is the one card a refresh flush cannot take away.
const CLAIM_RESERVE_BONUS = K('CLAIM_RESERVE_BONUS', 1.5);
// CLAIM_FLUSH_RISK_BONUS: ...unless a refresh is armed right now, in which case
//   the ROW is the perishable place to be claiming from - the next player can
//   flush the whole row to the discard before our next turn, and cannot touch
//   our reserve.
const CLAIM_FLUSH_RISK_BONUS = K('CLAIM_FLUSH_RISK_BONUS', 2);
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

function countBoardIngredient(board, ingredient) {
  let count = 0;
  for (const cell of board) {
    if (cell && cell.ingredient === ingredient) count++;
  }
  return count;
}

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
      const myRemainingClaims = turnsRemaining(gameState);
      futureSacrifices = Math.min(futureSacrifices, myRemainingClaims);
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

    // Opening a row banks at least its entry value (>= 2), which clears the
    // guaranteed 1-VP crumb; the check keeps the crumb fallback meaningful if
    // the value table is ever retuned downward.
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
function sweepContext(player, cardMarket) {
  const wantedIngredients = new Set();
  for (const row of player.stand) {
    if (row.ingredient !== null && row.tiles.length < row.capacity) {
      wantedIngredients.add(row.ingredient);
    }
  }
  return { colourValue: buildColourDemand(player.board, cardMarket), wantedIngredients };
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
  for (const tile of sweptTiles) {
    const copies = colourSeen[tile.colour] = (colourSeen[tile.colour] || 0) + 1;
    const decay = copies === 1 ? 1 : 0.4;
    score += (ctx.colourValue[tile.colour] || 0) * decay;
    // Tiles whose ingredient feeds a locked row keep future sacrifices useful.
    if (ctx.wantedIngredients.has(tile.ingredient)) score += 1;
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
  const ctx = sweepContext(currentPlayer, gameState.cardMarket);

  const visibleNow = getVisibleTeapotSymbols(gameState);

  const scored = validSweeps.map(sweep => {
    const score = rawSweepScore(gameState.market, sweep, marketSize, ctx)
      + symbolTriggerValue(visibleNow, symbolsExposedBySweep(gameState.market, sweep, marketSize));
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
// 4 August isTeaDue is a pure symbol count with no bag check in it, a short bag
// deals what it has and play continues over the thinner market, and it is the
// NEXT needed refill against an empty bag that ends the game ('bagEmpty'). Either
// way nothing here is load-bearing for termination.
//
// NOTHING USES IT AS A VETO SINCE 1 AUGUST, because there is no longer a decision
// to veto - tea fires automatically at the end of a turn. Kept as a small public
// predicate: "would a flush right now actually restock the board, or just
// reshuffle what is left?" is still a real question about a position, and it is
// how a caller can spot the flush that will drain the bag and end the game.
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

// Which market card players[reserverIndex] should reserve during a tea round
// (returns a cardId), or null to pass.
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
// (decideReserve / decideTeaReserve stood here. DELETED 11 AUGUST with the paid
// reserve itself - see the engine. The scoring constants above it are left in
// place as the record of what was measured; nothing calls them any more.)


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
export function decidePlacements(gameState) {
  const currentPlayer = gameState.players[gameState.currentPlayerIndex];
  const tilesToPlace = gameState.pendingSweepTiles;
  const board = [...currentPlayer.board]; // scratch copy, updated as we commit

  const placements = new Array(tilesToPlace.length).fill(null); // null = back into the bag
  const remaining = tilesToPlace.map((tile, index) => ({ tile, index }));

  // Commit one (tile, position) pair at a time, always the globally best one,
  // recomputing window demand after each commit so a tile that opens up a
  // near-complete window is immediately followed up on.
  while (remaining.length > 0) {
    const demand = buildPlacementDemand(board, gameState.cardMarket);
    const positions = getValidPlacements(board);
    // Out of cells: whatever is left keeps its null and goes back into the bag.
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

// Cupcake move: spend 1 cupcake (1 VP) to relocate a board tile when that
// single move completes a market card we could not otherwise claim this turn.
// Only fires when the unlocked card strictly beats the best already-claimable
// card (max one claim per turn). Returns { fromIndex, toIndex } or null.
export function decideMove(gameState) {
  const player = gameState.players[gameState.currentPlayerIndex];
  if (gameState.moveUsedThisTurn || player.cupcakes <= 0) return null;

  // Claimable candidates are the market cards PLUS this player's reserved cards
  // (which complete as normal claims). A cupcake move that finishes any of them
  // is fair game.
  const candidateCards = [...gameState.cardMarket];

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

  let best = null;
  for (const card of candidateCards) {
    if (matchedNow.has(card.id)) continue;
    const vp = card.vp || 0;
    // Card vp + banked sacrifice tile (~CLAIM_EXTRA) must beat the spent
    // cupcake (1 VP) AND the best claim already available without moving.
    if (vp + CLAIM_EXTRA - 1 <= bestNowVp) continue;

    for (const win of windowsByCard.get(card.id)) {
      if (win.missing.length !== 1) continue;
      const { index: toIndex, colour } = win.missing[0];

      // Source: a same-colour tile outside this window, ideally one that is
      // not itself part of another near-complete window.
      let source = -1;
      let sourceProtected = true;
      for (let i = 0; i < player.board.length; i++) {
        const cell = player.board[i];
        if (!cell || cell.colour !== colour) continue; // skips tarts (no colour)
        if (win.cells.includes(i)) continue;
        const isProtected = protectedCells.has(i);
        if (source === -1 || (sourceProtected && !isProtected)) {
          source = i;
          sourceProtected = isProtected;
        }
      }
      if (source === -1) continue;

      // Safety: verify the move really completes the card.
      const trial = [...player.board];
      trial[toIndex] = trial[source];
      trial[source] = null;
      if (getPatternMatches(trial, card.pattern).length === 0) continue;

      if (!best || vp > best.vp || (vp === best.vp && best.sourceProtected && !sourceProtected)) {
        best = { fromIndex: source, toIndex, vp, sourceProtected };
      }
    }
  }

  return best ? { fromIndex: best.fromIndex, toIndex: best.toIndex } : null;
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
  // ADDED 4 AUGUST, and it is a LEGALITY fix rather than a re-tune. The end of
  // the game used to stop play the moment the table's empty plates ran out, so
  // this bot could never be asked to claim without one; now the ending is a
  // trigger and the round plays on, so a claim past the supply is offered,
  // refused by claim() and throws. See canClaimMore.
  if (!canClaimMore(gameState)) return null;
  const currentPlayer = gameState.players[gameState.currentPlayerIndex];

  // Candidates are the market cards PLUS this player's reserved cards, which
  // complete as normal claims (claim() resolves a reserved id transparently).
  const candidateCards = [...gameState.cardMarket];

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

  const reservedIds = new Set(); // the reserve is deleted (11 August) - always empty
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
    let bestDestination = null;

    for (const cellIndex of patternCells) {
      const tile = currentPlayer.board[cellIndex];
      if (!tile) continue;

      const { destination, value } = destinationValue(currentPlayer, tile, gameState);
      let score = value * CLAIM_DEST_WEIGHT;

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

      if (score > bestRemoveScore) {
        bestRemoveScore = score;
        bestRemoveIndex = cellIndex;
        bestRemoveValue = value;
        bestDestination = destination;
      }
    }

    // Card value = printed VP + what the sacrifice banks, plus perishability.
    let cardScore = (candidate.card.vp || 0) + bestRemoveValue * CLAIM_DEST_WEIGHT;
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

// ── 3 AUGUST COMPATIBILITY SHIM ────────────────────────────────────────────
// This bot predates the cupcake spend menu. It is kept as a fixed BASELINE for
// arena.js, so its own heuristics are deliberately left alone - but a baseline
// that simply never spends a cupcake would lose to anything for the wrong reason.
// The paid decisions therefore delegate to the current basicBot, which keeps the
// comparison about the heuristics this file exists to test.
// decideExtraTile came off this list on 8 August, when the rule it served was
// deleted, and goes back on it on 9 August with the restoration. decideDealCards
// stays: it took the extra tile's slot on the menu for a day and now sits beside
// it, and it was never a rename of it.
export { decideDealCards, decideExtraTile } from './basicBot.js';
