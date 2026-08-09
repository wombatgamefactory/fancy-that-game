// Rule conformance test for the 9 August change: the sweep-step extra tile is
// RESTORED at 1 cupcake, and the 8 August paid 2-card deal stays. Both are on
// the menu, and the point of most of this file is that they do not interfere -
// the two allowances are independent and live at different steps.
//
// Run: node test-rules-2026-08-09-extratile.mjs
import * as engine from './src/engine/game.js';
import { createGame, sweep, place, takeExtraTile, canBuyExtraTile, dealCards, canDealCards,
  skipSpend, skipClaim, refill, EXTRA_TILE_CUPCAKE_COST, DEAL_CARDS_CUPCAKE_COST,
  getValidSweeps, getValidPlacements } from './src/engine/game.js';

let pass = 0, fail = 0;
function check(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ' - ' + detail : ''}`); }
}

// Sweep the first legal line and clear any line-clear bonus tile offer, leaving
// the game in 'place' with tiles pending - the state the extra tile is bought in.
function sweepInto(gs) {
  const sweeps = getValidSweeps(gs);
  const s = sweeps[0];
  sweep(gs, s.rowOrCol, s.isRow, s.declaration, s.declarationType);
  if (gs.bonusTileAvailable) engine.declineBonusTile(gs);
  return gs;
}

function firstMarketIndex(gs) {
  return gs.market.findIndex(t => t !== null && t !== undefined);
}

console.log('\n=== The restored rule ===');
check('EXTRA_TILE_CUPCAKE_COST is 1', EXTRA_TILE_CUPCAKE_COST === 1);
check('takeExtraTile is exported', typeof takeExtraTile === 'function');
check('canBuyExtraTile is exported', typeof canBuyExtraTile === 'function');

console.log('\n=== The menu has BOTH spends (the whole point of 9 August) ===');
check('the deal survives the restoration', typeof dealCards === 'function' && DEAL_CARDS_CUPCAKE_COST === 1);

const configs = [{ name: 'A', isHuman: false }, { name: 'B', isHuman: false }];
let gs = createGame(configs, null);

console.log('\n=== The step gate ===');
check('not buyable at the sweep step itself', !canBuyExtraTile(gs), `phase=${gs.gamePhase}`);
try {
  takeExtraTile(gs, firstMarketIndex(gs));
  check('takeExtraTile throws outside the place phase', false);
} catch (e) { check('takeExtraTile throws outside the place phase', true); }

sweepInto(gs);
check('buyable at the place step, before placing', canBuyExtraTile(gs), `phase=${gs.gamePhase}`);

console.log('\n=== The purchase ===');
const p = gs.players[gs.currentPlayerIndex];
const cupcakesBefore = p.cupcakes;
const pendingBefore = gs.pendingSweepTiles.length;
const idx = firstMarketIndex(gs);
const boughtTile = gs.market[idx];
takeExtraTile(gs, idx);
check('1 cupcake paid', p.cupcakes === cupcakesBefore - EXTRA_TILE_CUPCAKE_COST, `${cupcakesBefore} -> ${p.cupcakes}`);
check('the tile joins the pending sweep', gs.pendingSweepTiles.length === pendingBefore + 1);
check('the bought tile is the one taken', gs.pendingSweepTiles[gs.pendingSweepTiles.length - 1] === boughtTile);
check('the market cell is now empty', gs.market[idx] === null);
check('the legacy mirror is set', gs.extraTileUsedThisTurn === true);
check('the counter reads 1', gs.extraTilesBoughtThisTurn === 1);
// REWRITTEN 9 AUGUST (second revision): these two assertions used to read "no
// longer buyable this turn" and "a second extra tile throws". The per-turn
// allowance is gone - see MAX_EXTRA_TILES_PER_TURN - so they now assert the
// opposite, and the full uncapped rule has its own file
// (test-rules-2026-08-09-uncapped-tiles.mjs).
check('STILL buyable this turn - the cap is gone', canBuyExtraTile(gs));
const secondIdx = firstMarketIndex(gs);
takeExtraTile(gs, secondIdx);
check('a second extra tile is legal', gs.extraTilesBoughtThisTurn === 2);
// Both purchases came out of a 2-cupcake opening purse, so top it back up for
// the deal section below - which is about the two SPENDS being independent, not
// about what the tiles cost.
gs.players[gs.currentPlayerIndex].cupcakes += 2;

console.log('\n=== The two allowances are INDEPENDENT ===');
// Place, reach the spend step, and check the deal is still available on a turn
// that already bought a tile. This is the assertion the 8 August design note
// says was never tested, because the two rules never coexisted.
place(gs, getValidPlacements(gs.players[gs.currentPlayerIndex].board).slice(0, gs.pendingSweepTiles.length));
check('the spend step is reached', gs.gamePhase === 'spend', `phase=${gs.gamePhase}`);
check('the deal is still available after buying a tile', canDealCards(gs),
  `cupcakes=${gs.players[gs.currentPlayerIndex].cupcakes} row=${gs.cardMarket.length}`);
const beforeDeal = gs.players[gs.currentPlayerIndex].cupcakes;
dealCards(gs);
check('both spends land on the same turn', gs.extraTileUsedThisTurn && gs.cardsDealtThisTurn);
check('and cost 1 cupcake each', gs.players[gs.currentPlayerIndex].cupcakes === beforeDeal - DEAL_CARDS_CUPCAKE_COST);

console.log('\n=== The allowance resets ===');
skipSpend(gs);
skipClaim(gs);
refill(gs);
check('extraTileUsedThisTurn resets on the next turn', gs.extraTileUsedThisTurn === false);
check('cardsDealtThisTurn resets too', gs.cardsDealtThisTurn === false);

console.log('\n=== The purse gate ===');
let gs2 = createGame(configs, null);
sweepInto(gs2);
gs2.players[gs2.currentPlayerIndex].cupcakes = 0;
check('not buyable with an empty purse', !canBuyExtraTile(gs2));

console.log('\n=== The placement gate ===');
// A board with no more room than the sweep already needs must refuse the sale -
// the tile would go straight back into the bag at the placement step.
let gs3 = createGame(configs, null);
sweepInto(gs3);
const p3 = gs3.players[gs3.currentPlayerIndex];
const free = getValidPlacements(p3.board);
// Block every free cell except exactly as many as the pending sweep needs.
for (let i = gs3.pendingSweepTiles.length; i < free.length; i++) {
  p3.board[free[i]] = { type: 'blocked' };
}
check('not buyable with no room beyond the pending tiles', !canBuyExtraTile(gs3),
  `free=${getValidPlacements(p3.board).length} pending=${gs3.pendingSweepTiles.length}`);
try {
  takeExtraTile(gs3, firstMarketIndex(gs3));
  check('takeExtraTile throws with no legal placement', false);
} catch (e) { check('takeExtraTile throws with no legal placement', true); }

console.log('\n=== The empty-cell gate ===');
let gs4 = createGame(configs, null);
sweepInto(gs4);
const emptyIdx = gs4.market.findIndex(t => t === null || t === undefined);
if (emptyIdx === -1) {
  check('(no empty market cell to test - skipped)', true);
} else {
  try {
    takeExtraTile(gs4, emptyIdx);
    check('buying an empty market cell throws', false);
  } catch (e) { check('buying an empty market cell throws', true); }
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
