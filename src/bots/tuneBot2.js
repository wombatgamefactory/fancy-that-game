const K = (n, d) => (process.env[n] !== undefined ? parseFloat(process.env[n]) : d);
import { getValidSweeps, getPatternMatches, getPatternWindows, getValidPlacements, getTotalCardsClaimed, getVisibleCupcakeSymbols, canOrderTea, STAND_ROW_VALUES, CUPCAKE_PLATES, CUPCAKE_SYMBOL_CELLS, REFRESH_THRESHOLD, TEA_POT_REWARD, REWARD_CARDS, COLOURS, INGREDIENTS, BOARD_SIZE } from '../engine/game.js';

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

// ── Refresh ("fresh pot of tea") tuning constants ──────────────────────────
// Ordering a fresh pot NO LONGER costs the sweep (the player takes their full
// turn afterwards) and, since 28 July, is no longer a once-per-game card either:
// it is a repeatable board option gated on visible teapot symbols
// (canOrderTea). What remains is a genuine timing call, and the design doc calls
// it "the AI's biggest new decision". decideOrderTea below weighs the four
// inputs the doc names: how well the current tile market suits us, the reward
// (visible symbols), denial (the flush wipes the market the NEXT player was
// about to sweep, and we sweep the fresh one first), and the race.
//
// THE MEASUREMENT THAT SET THESE. The step-2 placeholder that lived here refused
// a modest pot unless the current market scored <= 2.5 by scoreSweeps. Probing
// 120 real games showed the best-sweep score at a turn start actually runs
// mean 39, median 30, p10 3.9 - so that clause fired on well under a tenth of
// chances and the "modest pot" branch was effectively dead code. Worse, the same
// probe showed that at the moment a refresh first becomes LEGAL the tile market
// is already down to a mean of 11-13 tiles of 25, so a flush IMPROVES the firing
// player's own best sweep 93-95% of the time, by a mean of ~22 score points.
// The refresh is destructive in the rules, but in practice it is a restock: the
// gate cannot open until the board has been swept well down. So the bot's old
// reluctance was simply wrong, and the constants below are set to fire unless
// the evaluation actively says no.
//
// TEA_CUPCAKE_VALUE: one cupcake of the pot expressed in scoreSweeps points, so
//   the reward and the market swap can be added together. A cupcake is 1 VP kept
//   and rather more when spent on a move that completes a card; 6 points puts a
//   minimum 2-cupcake pot (12) just over half the mean swap value (~22), which
//   is the balance the arena runs below settled on.
const TEA_CUPCAKE_VALUE = K('B_TEA_CUPCAKE_VALUE', 6);
// TEA_DENIAL_SHARE: how much of the NEXT player's gain from the flush we charge
//   against our own. The flush restocks the board for everybody, so a refresh
//   that helps them more than us is a gift even though we sweep first; equally,
//   when their current market is strong and ours is not, this term goes NEGATIVE
//   and becomes the denial value the design doc asks for. Half-weight because we
//   move first on the fresh market and they do not, and because at 3-4 players
//   the next seat is only one of several rivals.
const TEA_DENIAL_SHARE = K('B_TEA_DENIAL_SHARE', 0.5);
// TEA_FRESH_SAMPLES: synthetic fresh markets averaged per decision. The estimate
//   is noisy per draw and the decision is only a sign test, so three is plenty;
//   this runs once per turn (never inside an MCTS rollout), so the cost is small.
const TEA_FRESH_SAMPLES = 3;
// TEA_ENDGAME_LEAD_MARGIN: a refresh whose redeal cannot fill the board drains
//   the bag to zero, which ends the game at the next turn boundary - the firing
//   player takes their full turn and NOBODY else gets another one. That is a
//   tempo weapon when ahead and a self-inflicted loss when behind, so the bot
//   requires this much of a committed-score lead (pot included) before pulling
//   it. See worthEndingTheGame.
const TEA_ENDGAME_LEAD_MARGIN = K('B_TEA_ENDGAME_LEAD_MARGIN', 0);

// ── Symbol-steering constants ──────────────────────────────────────────────
// A sweep can only ever UNCOVER teapot symbols, and a player may only order a
// refresh at the START of their own turn - so a symbol we expose during our turn
// is never ours to use. It is handed to whoever moves next, who at 2 players is
// our only opponent. There is no "expose it for myself" case: any player may
// fire once the gate is open, and the next seat gets first refusal. So symbol
// exposure is priced purely as a gift.
//
// SYMBOL_ARM_COST: charged when our sweep takes the visible count from below
//   REFRESH_THRESHOLD to at or above it - i.e. we hand the next player the whole
//   refresh option, which the probe above shows is worth a lot.
const SYMBOL_ARM_COST = K('B_SYMBOL_ARM_COST', 8);
// SYMBOL_GIFT_COST: charged per extra symbol exposed once the gate is already
//   open (or beyond the threshold), because each one adds a cupcake to the pot
//   the next player collects.
const SYMBOL_GIFT_COST = K('B_SYMBOL_GIFT_COST', 3);
// SYMBOL_COST_FLOOR: the share of the above still charged on a nearly-empty
//   market. A board that is almost swept out is heading for the mandatory
//   empty-market refresh anyway, and everyone's sweeps there are poor, so
//   holding the gate shut buys much less; the cost tapers with how many tiles
//   are left rather than switching off.
const SYMBOL_COST_FLOOR = K('B_SYMBOL_COST_FLOOR', 0.25);

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
const RESERVE_MAX_MISSING = K('B_RESERVE_MAX_MISSING', 2);
// RESERVE_LATE_MAX_MISSING / RESERVE_LATE_CLAIMS: near the end there is no time
//   to build a window, and the probe measured last-quarter reserves completing
//   6% (4p). With this few claims left in the game the bot only reserves what is
//   already all but finished.
const RESERVE_LATE_MAX_MISSING = K('B_RESERVE_LATE_MAX_MISSING', 1);
const RESERVE_LATE_CLAIMS = K('B_RESERVE_LATE_CLAIMS', 2);
// RESERVE_MIN_VALUE: expected payout (in VP) below which the slot is better left
//   empty for the next refresh - a reserve is limited to one card and a dud
//   blocks the slot for the rest of the game.
const RESERVE_MIN_VALUE = K('B_RESERVE_MIN_VALUE', 1.5);

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
const CLAIM_DEST_WEIGHT = K('B_CLAIM_DEST_WEIGHT', 0.6);
// CLAIM_PROTECT_OTHER: penalty for sacrificing a tile that another card we can
//   ALSO claim needs. Under the old refill-on-claim rule that card was about to
//   be replaced anyway; now it sits in the row waiting for us.
const CLAIM_PROTECT_OTHER = K('B_CLAIM_PROTECT_OTHER', 4);
// CLAIM_RESERVE_BONUS: prefer finishing a reserved card when values are close.
//   An unclaimed reserve scores 0 at the end AND blocks the one reserve slot,
//   and it is the one card a refresh flush cannot take away.
const CLAIM_RESERVE_BONUS = K('B_CLAIM_RESERVE_BONUS', 1.5);
// CLAIM_FLUSH_RISK_BONUS: ...unless a refresh is armed right now, in which case
//   the ROW is the perishable place to be claiming from - the next player can
//   flush the whole row to the discard before our next turn, and cannot touch
//   our reserve.
const CLAIM_FLUSH_RISK_BONUS = K('B_CLAIM_FLUSH_RISK_BONUS', 2);
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
      const claimed = getTotalCardsClaimed(gameState);
      const myRemainingClaims = Math.ceil(
        Math.max(0, gameState.cardsNeededToEnd - claimed) / gameState.playerCount
      );
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
// can ever extend. Built once and reused across however many markets we score -
// this is the expensive half of sweep scoring, so decideOrderTea below scores a
// live market and several hypothetical fresh ones off a single context.
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

// Best raw sweep score available to `ctx` on an arbitrary market array. Used to
// compare the live market against hypothetical fresh ones (and to compare our
// market with the next player's view of the same market), so it deliberately
// takes a bare market rather than a game state. getValidSweeps only reads
// .market and .marketSize, so a two-field stand-in is a legitimate argument.
function bestSweepScoreOn(market, marketSize, ctx) {
  let best = 0;
  for (const sweep of getValidSweeps({ market, marketSize })) {
    const score = rawSweepScore(market, sweep, marketSize, ctx);
    if (score > best) best = score;
  }
  return best;
}

// How many currently-COVERED teapot symbols this sweep would uncover. Symbol
// cells are config (CUPCAKE_SYMBOL_CELLS), and the 30 July inner-ring placement
// puts two of them in row 2, two in row 4, two in column 2 and two in column 4 -
// so one sweep really can open the gate on its own, which is exactly why this
// has to be priced. Four cell reads; safe to call inside sweep ranking.
function symbolsExposedBySweep(market, sweep, marketSize) {
  let exposed = 0;
  for (const cell of CUPCAKE_SYMBOL_CELLS) {
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

// What uncovering `exposed` symbols costs us, given `visibleNow` already show
// and `onBoard` of `cells` market cells still hold a tile.
//
// SYMBOL STEERING, AND WHY IT IS ONE-DIRECTIONAL. A player may only order a
// refresh at the START of their own turn, and sweeps only ever uncover symbols
// (nothing but a refresh covers them again). So a symbol we uncover during our
// turn is available to every opponent before it is available to us, and the next
// seat gets first refusal - at 2 players, our only opponent. There is no
// "advance the unlock for myself" case to balance against the gift; the way to
// unlock it for yourself is to leave the gate shut and let somebody else blink.
// Hence a cost, never a bonus. The taper handles the one honest counterweight:
// on a nearly-empty board the mandatory empty-market refresh is coming whatever
// we do, so withholding buys much less.
function symbolExposureCost(visibleNow, exposed, onBoard, cells) {
  if (exposed === 0) return 0;
  const after = visibleNow + exposed;
  if (after < REFRESH_THRESHOLD) return 0; // gate still shut - nothing handed over

  let cost = 0;
  if (visibleNow < REFRESH_THRESHOLD) {
    // We opened the gate: the whole option changes hands, plus a cupcake for
    // each symbol past the threshold.
    cost = SYMBOL_ARM_COST + (after - REFRESH_THRESHOLD) * SYMBOL_GIFT_COST;
  } else {
    // Already open - each extra symbol is one more cupcake in someone's pot.
    cost = exposed * SYMBOL_GIFT_COST;
  }

  const taper = SYMBOL_COST_FLOOR + (1 - SYMBOL_COST_FLOOR) * (cells > 0 ? onBoard / cells : 1);
  return cost * taper;
}

// All valid sweeps on the LIVE market scored best-first for the active player.
// Score = raw tile value minus the symbol-exposure cost. Shared by rankSweeps
// (which drops the scores) and decideSweep.
function scoreSweeps(gameState) {
  const validSweeps = getValidSweeps(gameState);
  if (validSweeps.length === 0) return [];

  const currentPlayer = gameState.players[gameState.currentPlayerIndex];
  const marketSize = gameState.marketSize;
  const ctx = sweepContext(currentPlayer, gameState.cardMarket);

  const cells = gameState.market.length;
  let onBoard = 0;
  for (const tile of gameState.market) if (tile) onBoard++;
  const visibleNow = getVisibleCupcakeSymbols(gameState);

  const scored = validSweeps.map(sweep => {
    const score = rawSweepScore(gameState.market, sweep, marketSize, ctx)
      - symbolExposureCost(visibleNow, symbolsExposedBySweep(gameState.market, sweep, marketSize), onBoard, cells);
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
// redeal left cells empty - including teapot-symbol cells - so the gate stayed
// OPEN and a bot that only checked canOrderTea would order tea again, on the same
// turn, for another pot, forever (~200 refreshes, games that never ended). That
// hole is CLOSED in the rules now: canOrderTea requires a non-empty bag, and the
// game ends on an empty bag ('bagEmpty'), so nothing here is load-bearing for
// termination any more.
//
// basicBot NO LONGER USES IT AS A VETO (step 6). It was deliberately stricter
// than the rule, and measurement showed the strictness was costing real games:
// at 4 players it blocked three quarters of the 4-symbol chances and two thirds
// of the 3-symbol ones, which is most of where the design doc's "bad market
// sitting unflushed" failure mode came from, and it also threw away the strongest
// tempo play in the game (drain the bag, take the last turn, end it while
// ahead). Both halves of its judgement are now folded into decideOrderTea:
// "a flush that cannot refill the whole board is mostly just a reshuffle" falls
// out for free, because the fresh-market estimate is sized to bag + board and so
// scores barely better than the market we already have; and "it hands the game
// its ending" becomes worthEndingTheGame, which asks whether we WANT the ending.
// The export stays for randomBot, which uses it as its own crude gate.
export function refreshWouldRestockBoard(gameState) {
  let onBoard = 0;
  for (const tile of gameState.market) if (tile) onBoard++;
  return gameState.bag.length + onBoard >= gameState.market.length;
}

// Score already banked by a player: stand rows + crumbs + claimed card VP +
// unspent cupcakes. Mirrors calculateFinalScores on a live state (everything it
// reads is public at the table). Used only by worthEndingTheGame.
function committedScore(player) {
  let score = 0;
  for (let i = 0; i < player.stand.length; i++) {
    const row = player.stand[i];
    if (row.tiles.length > 0) score += STAND_ROW_VALUES[i][row.tiles.length - 1];
  }
  score += player.crumbTray.length;
  for (const cardId of player.claimedCards) {
    const card = REWARD_CARDS.find(c => c.id === cardId);
    if (card) score += card.vp;
  }
  score += player.cupcakes || 0;
  return score;
}

// A refresh whose redeal cannot fill all 25 cells drains the bag to exactly zero
// (the redeal takes everything), and an empty bag ends the game at the next turn
// boundary - AFTER we finish the turn we are about to take, and BEFORE anyone
// else gets another one. Firing it is therefore a deliberate "and that's time,
// thank you": worth it holding a lead, a straight loss trailing. Committed score
// only, deliberately: board potential is exactly what everyone is about to lose.
function worthEndingTheGame(gameState, potSize) {
  const me = gameState.players[gameState.currentPlayerIndex];
  const mine = committedScore(me) + potSize;
  let bestOpponent = 0;
  for (const player of gameState.players) {
    if (player === me) continue;
    const score = committedScore(player);
    if (score > bestOpponent) bestOpponent = score;
  }
  return mine >= bestOpponent + TEA_ENDGAME_LEAD_MARGIN;
}

// A hypothetical fresh tile market holding `tileCount` tiles scattered over
// `cells` cells, for judging what a flush would deal us.
//
// PUBLIC INFORMATION ONLY. The composition sampled is the printed bag - 5
// colours x 5 ingredients, 4 copies each - not gameState.bag, which the bot must
// never look inside. Only the bag's LENGTH is read (by the caller, to size the
// deal), which every player can see well enough and which the engine's own end
// condition uses. Sampling with replacement from a flat distribution slightly
// understates how much a 100-tile bag depletes, which is immaterial to a
// comparison of two markets scored the same way.
function drawSyntheticMarket(tileCount, cells) {
  const market = new Array(cells).fill(null);
  // WHERE the tiles land matters: sweeps are lines, so a fresh deal has to be
  // scattered rather than packed into the first cells.
  const order = [];
  for (let i = 0; i < cells; i++) order.push(i);
  for (let i = cells - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  for (let i = 0; i < tileCount && i < cells; i++) {
    market[order[i]] = {
      colour: COLOURS[Math.floor(Math.random() * COLOURS.length)],
      ingredient: INGREDIENTS[Math.floor(Math.random() * INGREDIENTS.length)],
    };
  }
  return market;
}

// Whether to order a fresh pot of tea at the start of this turn - the design
// doc's "AI's biggest new decision". canOrderTea is the ONLY legality gate (right
// phase, no pending bonus tile, non-empty bag, enough visible symbols); the bot
// never re-derives it and there is no once-per-game check any more. Everything
// below is judgement, in scoreSweeps points, and weighs the four inputs the doc
// names:
//
//   REWARD - potSize cupcakes (2-4, sized by the gate), priced at
//     TEA_CUPCAKE_VALUE each. Ours alone; only the active player is paid.
//   HOW WELL THE MARKET SUITS US - our best sweep on a fresh deal minus our best
//     sweep on the market in front of us. This is where the flush's destructive
//     half is priced, and it also silently handles a short bag: when the bag can
//     only part-fill the board, the "fresh" market is barely bigger than the one
//     we already have and the term goes to nothing on its own.
//   DENIAL - the same difference computed for the NEXT player, subtracted at
//     TEA_DENIAL_SHARE. A flush restocks the board for everyone, so when they
//     gain more than we do it is a gift however good it looks in isolation; when
//     they are sitting on a market built for their board and we are not, the
//     term flips sign and pays us to wipe it. We sweep the fresh board first,
//     which is why it is a share and not the whole of their gain. Their personal
//     board and the card row are both face up, so this reads nothing hidden -
//     their RESERVED card is hidden and is deliberately not consulted.
//   THE RACE - handled by there being no "wait for a bigger pot" clause at all.
//     Every player can fire the moment the gate is open and the next seat gets
//     first refusal, so a pot left on the table is usually somebody else's. The
//     bot banks a positive evaluation rather than holding out for a better one.
//
// The one hard veto left is the endgame one: see worthEndingTheGame.
export function decideOrderTea(gameState) {
  if (!canOrderTea(gameState)) return false;

  const cells = gameState.market.length;
  const marketSize = gameState.marketSize;
  let onBoard = 0;
  for (const tile of gameState.market) if (tile) onBoard++;

  // The redeal draws from bag + everything the flush returns, so this is how big
  // the fresh market can be; short of `cells` it also means the bag ends empty.
  const freshTiles = Math.min(cells, gameState.bag.length + onBoard);
  if (K('B_TEA_ENDGAME_GUARD', 1) && freshTiles < cells && !worthEndingTheGame(gameState, TEA_POT_REWARD)) return false;

  const meIndex = gameState.currentPlayerIndex;
  const myCtx = sweepContext(gameState.players[meIndex], gameState.cardMarket);
  const nextIndex = (meIndex + 1) % gameState.playerCount;
  const nextCtx = nextIndex === meIndex
    ? null
    : sweepContext(gameState.players[nextIndex], gameState.cardMarket);

  const myNow = bestSweepScoreOn(gameState.market, marketSize, myCtx);
  const nextNow = nextCtx ? bestSweepScoreOn(gameState.market, marketSize, nextCtx) : 0;

  // Both players are scored on the SAME synthetic draws, so the difference of
  // the two gains is a paired comparison and needs far fewer samples than two
  // independent estimates would.
  let myFresh = 0;
  let nextFresh = 0;
  for (let s = 0; s < TEA_FRESH_SAMPLES; s++) {
    const synthetic = drawSyntheticMarket(freshTiles, cells);
    myFresh += bestSweepScoreOn(synthetic, marketSize, myCtx);
    if (nextCtx) nextFresh += bestSweepScoreOn(synthetic, marketSize, nextCtx);
  }
  myFresh /= TEA_FRESH_SAMPLES;
  nextFresh /= TEA_FRESH_SAMPLES;

  // The pot is a flat TEA_POT_REWARD (30 July rule), so the reward term does
  // not scale with the visible symbols.
  const value = TEA_POT_REWARD * TEA_CUPCAKE_VALUE
    + (myFresh - myNow)
    - TEA_DENIAL_SHARE * (nextFresh - nextNow);

  return value > K('B_TEA_FIRE_MARGIN', 0);
}

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
// times the measured odds of ever completing it. A reserve slot holds one card
// for the rest of the game, so a card that will not finish is not free - it
// blocks the next refresh's reserve too, which is why there is a floor
// (RESERVE_MIN_VALUE) below which passing is correct, and why the bar rises
// again once the game is nearly over.
export function decideTeaReserve(gameState, reserverIndex) {
  const player = gameState.players[reserverIndex];
  if (player.reservedCard !== null) return null;

  // Roughly how many more claims this player gets before the card-count end
  // condition fires. The same public estimate decideDestination uses.
  const claimed = getTotalCardsClaimed(gameState);
  const myRemainingClaims = Math.ceil(
    Math.max(0, gameState.cardsNeededToEnd - claimed) / gameState.playerCount
  );
  const maxMissing = myRemainingClaims <= RESERVE_LATE_CLAIMS
    ? RESERVE_LATE_MAX_MISSING
    : RESERVE_MAX_MISSING;

  let bestId = null;
  let bestValue = RESERVE_MIN_VALUE;
  for (const card of gameState.cardMarket) {
    const mm = minMissingForCard(player.board, card);
    if (mm === Infinity || mm > maxMissing) continue; // no viable window, or hopeless
    const odds = RESERVE_COMPLETION_ODDS[mm] ?? 0;
    const value = ((card.vp || 0) + CLAIM_EXTRA) * odds;
    if (value > bestValue) {
      bestValue = value;
      bestId = card.id;
    }
  }
  return bestId;
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
  // symbol for the next player exactly as a sweep would.
  const cells = gameState.market.length;
  let onBoard = 0;
  for (const tile of gameState.market) if (tile) onBoard++;
  const visibleNow = getVisibleCupcakeSymbols(gameState);

  const scored = availableTiles.map(({ tile, index }) => {
    let score = colourValue[tile.colour] || 0;

    // Prefer tiles matching ingredients we're already picking up this turn.
    const ingredientCount = gameState.pendingSweepTiles.filter(
      t => t.ingredient === tile.ingredient
    ).length;
    score += ingredientCount * 0.5;

    if (CUPCAKE_SYMBOL_CELLS.includes(index)) {
      score -= symbolExposureCost(visibleNow, 1, onBoard, cells);
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

  if (getValidPlacements(board).length < tilesToPlace.length) {
    throw new Error('Not enough valid positions to place tiles');
  }

  const placements = new Array(tilesToPlace.length).fill(-1);
  const remaining = tilesToPlace.map((tile, index) => ({ tile, index }));

  // Commit one (tile, position) pair at a time, always the globally best one,
  // recomputing window demand after each commit so a tile that opens up a
  // near-complete window is immediately followed up on.
  while (remaining.length > 0) {
    const demand = buildPlacementDemand(board, gameState.cardMarket);
    const positions = getValidPlacements(board);

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
  if (gameState.cupcakesUsedThisTurn || player.cupcakes <= 0) return null;

  // Claimable candidates are the market cards PLUS this player's reserved card
  // (which completes as a normal claim). A cupcake move that finishes either is
  // fair game.
  const candidateCards = [...gameState.cardMarket];
  if (player.reservedCard) candidateCards.push(player.reservedCard);

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
  const currentPlayer = gameState.players[gameState.currentPlayerIndex];

  // Candidates are the market cards PLUS this player's reserved card, which
  // completes as a normal claim (claim() resolves a reserved id transparently).
  const candidateCards = [...gameState.cardMarket];
  if (currentPlayer.reservedCard) candidateCards.push(currentPlayer.reservedCard);

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

  const reservedId = currentPlayer.reservedCard ? currentPlayer.reservedCard.id : null;
  // Is the card row itself at risk before our next turn? The refresh gate is
  // open (visible symbols at or over the threshold) and the bag can still
  // refill, so any player from here to our next turn can flush the whole row.
  const rowAtRisk = gameState.bag.length > 0
    && getVisibleCupcakeSymbols(gameState) >= REFRESH_THRESHOLD;

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
    const fromReserve = candidate.card.id === reservedId;
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
