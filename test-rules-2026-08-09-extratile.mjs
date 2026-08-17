// Rule conformance test for the paid EXTRA TILE: 1 cupcake, one tile from
// anywhere on the market, placed as it is bought, at the SPEND step. Restored
// 9 August after a day deleted; MOVED FROM THE SWEEP STEP TO THE SPEND STEP on
// 10 August. The 8 August paid 2-card deal stays, and a good part of this file is
// that the two do not interfere.
//
// REWRITTEN 17 AUGUST. Every assertion below the first section used to be written
// around the 9 August shape - buy during the 'place' phase, tile joins
// pendingSweepTiles, gated on the board having room for one MORE than is already
// pending - and it had been red since 10 August, when the action moved. The
// rewrite is mechanical; the rule it tests is the one the engine has enforced for
// a week.
//
// THREE THINGS THE MOVE CHANGED, and each has its own section here because each
// is a way the old file was testing the wrong game:
//   1. THE STEP. 'spend', not 'place'. The old file's "buyable at the place step"
//      is now an assertion that it is NOT.
//   2. THE SIGNATURE. takeExtraTile(gs, marketIndex, boardIndex) - the
//      destination is part of the purchase, because at the spend step there is no
//      pending pile for a bought tile to queue behind.
//   3. THE BOARD GATE. "One empty cell" replaces "room for one more than is
//      pending". The tile is placed as it is bought, so it can no longer be
//      bought and then trimmed back into the bag, and the old gate's whole reason
//      to exist is gone.
//
// Run: node test-rules-2026-08-09-extratile.mjs
import * as engine from './src/engine/game.js';
import { createGame, sweep, place, takeExtraTile, canBuyExtraTile, dealCards, canDealCards,
  skipSpend, skipClaim, refill, EXTRA_TILE_CUPCAKE_COST, DEAL_CARDS_CUPCAKE_COST,
  getValidSweeps, getValidPlacements, BOARD_SIZE } from './src/engine/game.js';

let pass = 0, fail = 0;
function check(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ' - ' + detail : ''}`); }
}

// Sweep the first legal line, clear any line-clear bonus tile offer, then place
// everything the board can take - which leaves the game in 'spend', the state the
// extra tile is bought in. The old file stopped one step earlier, at 'place'.
function spendStep(gs) {
  const s = getValidSweeps(gs)[0];
  sweep(gs, s.rowOrCol, s.isRow, s.declaration, s.declarationType);
  if (gs.bonusTileAvailable) engine.declineBonusTile(gs);
  place(gs, getValidPlacements(gs.players[gs.currentPlayerIndex].board)
    .slice(0, gs.pendingSweepTiles.length));
  return gs;
}

const firstMarketIndex = (gs) => gs.market.findIndex(t => t !== null && t !== undefined);
const firstFreeCell = (gs) => getValidPlacements(gs.players[gs.currentPlayerIndex].board)[0];

const configs = [{ name: 'A', isHuman: false }, { name: 'B', isHuman: false }];

console.log('\n=== The rule ===');
check('EXTRA_TILE_CUPCAKE_COST is 1', EXTRA_TILE_CUPCAKE_COST === 1);
check('takeExtraTile is exported', typeof takeExtraTile === 'function');
check('canBuyExtraTile is exported', typeof canBuyExtraTile === 'function');

console.log('\n=== The menu has BOTH spends (the whole point of 9 August) ===');
check('the deal survives the restoration', typeof dealCards === 'function' && DEAL_CARDS_CUPCAKE_COST === 1);

console.log('\n=== The step gate: SPEND, and only spend (10 August) ===');
let gs = createGame(configs, null);
check('not buyable at the sweep step', !canBuyExtraTile(gs), `phase=${gs.gamePhase}`);
try {
  takeExtraTile(gs, firstMarketIndex(gs), firstFreeCell(gs));
  check('takeExtraTile throws at the sweep step', false);
} catch (e) { check('takeExtraTile throws at the sweep step', true); }

{
  // The PLACE step, which is where this action lived until 10 August. It is the
  // seam the old version of this file was written against, so it is asserted
  // explicitly rather than left to the general "only in spend" rule.
  const s = getValidSweeps(gs)[0];
  sweep(gs, s.rowOrCol, s.isRow, s.declaration, s.declarationType);
  if (gs.bonusTileAvailable) engine.declineBonusTile(gs);
  check('the place step is reached', gs.gamePhase === 'place', `phase=${gs.gamePhase}`);
  check('NOT buyable at the place step - it moved off it', !canBuyExtraTile(gs));
  try {
    takeExtraTile(gs, firstMarketIndex(gs), firstFreeCell(gs));
    check('takeExtraTile throws at the place step', false);
  } catch (e) { check('takeExtraTile throws at the place step', true); }
  place(gs, getValidPlacements(gs.players[gs.currentPlayerIndex].board)
    .slice(0, gs.pendingSweepTiles.length));
}
check('buyable at the spend step', canBuyExtraTile(gs), `phase=${gs.gamePhase}`);

console.log('\n=== The purchase: lift, pay, place, in one call ===');
const p = gs.players[gs.currentPlayerIndex];
const cupcakesBefore = p.cupcakes;
const idx = firstMarketIndex(gs);
const cell = firstFreeCell(gs);
const boughtTile = gs.market[idx];
takeExtraTile(gs, idx, cell);
check('1 cupcake paid', p.cupcakes === cupcakesBefore - EXTRA_TILE_CUPCAKE_COST, `${cupcakesBefore} -> ${p.cupcakes}`);
check('the tile is ON THE BOARD, not in a pending pile', p.board[cell] === boughtTile);
check('nothing is left pending', gs.pendingSweepTiles.length === 0);
check('the market cell is now empty', gs.market[idx] === null);
check('the legacy mirror is set', gs.extraTileUsedThisTurn === true);
check('the counter reads 1', gs.extraTilesBoughtThisTurn === 1);
// The per-turn allowance is gone - see MAX_EXTRA_TILES_PER_TURN - and the full
// uncapped rule has its own file (test-rules-2026-08-09-uncapped-tiles.mjs).
check('STILL buyable this turn - the cap is gone', canBuyExtraTile(gs));
takeExtraTile(gs, firstMarketIndex(gs), firstFreeCell(gs));
check('a second extra tile is legal', gs.extraTilesBoughtThisTurn === 2);

console.log('\n=== The destination is part of the purchase (10 August) ===');
{
  // A bought tile with nowhere to go is the one outcome this spend must never
  // produce, so the engine refuses the call rather than parking the tile.
  let gsD = createGame(configs, null);
  spendStep(gsD);
  gsD.players[gsD.currentPlayerIndex].cupcakes = 5;
  try {
    takeExtraTile(gsD, firstMarketIndex(gsD));
    check('a purchase with no destination throws', false);
  } catch (e) { check('a purchase with no destination throws', true); }
  try {
    takeExtraTile(gsD, firstMarketIndex(gsD), BOARD_SIZE * BOARD_SIZE);
    check('an off-board destination throws', false);
  } catch (e) { check('an off-board destination throws', true); }
  const taken = firstFreeCell(gsD);
  takeExtraTile(gsD, firstMarketIndex(gsD), taken);
  try {
    takeExtraTile(gsD, firstMarketIndex(gsD), taken);
    check('an occupied destination throws', false);
  } catch (e) { check('an occupied destination throws', true); }
  check('and the refused calls cost nothing', gsD.extraTilesBoughtThisTurn === 1,
    `counter=${gsD.extraTilesBoughtThisTurn}`);
}

console.log('\n=== The two allowances are INDEPENDENT ===');
// Both purchases above came out of a 2-cupcake opening purse, so top it back up:
// this section is about the two SPENDS coexisting, not about what tiles cost.
// This is the assertion the 8 August design note says was never tested, because
// the two rules never coexisted - and since 10 August both live at the same step,
// which is a stronger form of the same question.
gs.players[gs.currentPlayerIndex].cupcakes += 2;
check('still the spend step', gs.gamePhase === 'spend', `phase=${gs.gamePhase}`);
check('the deal is available on a turn that already bought tiles', canDealCards(gs),
  `cupcakes=${gs.players[gs.currentPlayerIndex].cupcakes} row=${gs.cardMarket.length}`);
const beforeDeal = gs.players[gs.currentPlayerIndex].cupcakes;
dealCards(gs);
check('both spends land on the same turn', gs.extraTileUsedThisTurn && gs.cardsDealtThisTurn);
check('and cost 1 cupcake each', gs.players[gs.currentPlayerIndex].cupcakes === beforeDeal - DEAL_CARDS_CUPCAKE_COST);
check('buying tiles did not close the deal, or the reverse', canBuyExtraTile(gs) || gs.players[gs.currentPlayerIndex].cupcakes === 0);

console.log('\n=== The allowance resets ===');
skipSpend(gs);
skipClaim(gs);
refill(gs);
check('extraTileUsedThisTurn resets on the next turn', gs.extraTileUsedThisTurn === false);
check('extraTilesBoughtThisTurn resets too', gs.extraTilesBoughtThisTurn === 0);
check('cardsDealtThisTurn resets too', gs.cardsDealtThisTurn === false);

console.log('\n=== The purse gate ===');
let gs2 = createGame(configs, null);
spendStep(gs2);
gs2.players[gs2.currentPlayerIndex].cupcakes = 0;
check('not buyable with an empty purse', !canBuyExtraTile(gs2));
try {
  takeExtraTile(gs2, firstMarketIndex(gs2), firstFreeCell(gs2));
  check('takeExtraTile throws with an empty purse', false);
} catch (e) { check('takeExtraTile throws with an empty purse', true); }

console.log('\n=== The board gate: ONE EMPTY CELL, and that is the whole of it ===');
// The 9 August gate was "room for one more than the pending sweep". There is no
// pending sweep at the spend step, so the requirement collapsed to "somewhere to
// put it" when the action moved.
let gs3 = createGame(configs, null);
spendStep(gs3);
const p3 = gs3.players[gs3.currentPlayerIndex];
p3.cupcakes = 20;
const free3 = getValidPlacements(p3.board);
for (let i = 1; i < free3.length; i++) p3.board[free3[i]] = { type: 'blocked' };
check('one free cell is enough, however rich', canBuyExtraTile(gs3),
  `free=${getValidPlacements(p3.board).length}`);
takeExtraTile(gs3, firstMarketIndex(gs3), free3[0]);
check('and with the board full it stops, with 19 cupcakes left', !canBuyExtraTile(gs3),
  `cupcakes=${p3.cupcakes} free=${getValidPlacements(p3.board).length}`);
try {
  takeExtraTile(gs3, firstMarketIndex(gs3), free3[0]);
  check('takeExtraTile throws with no free cell', false);
} catch (e) { check('takeExtraTile throws with no free cell', true); }

console.log('\n=== The empty-cell gate ===');
let gs4 = createGame(configs, null);
spendStep(gs4);
const emptyIdx = gs4.market.findIndex(t => t === null || t === undefined);
if (emptyIdx === -1) {
  check('(no empty market cell to test - skipped)', true);
} else {
  try {
    takeExtraTile(gs4, emptyIdx, firstFreeCell(gs4));
    check('buying an empty market cell throws', false);
  } catch (e) { check('buying an empty market cell throws', true); }
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
