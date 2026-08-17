// Rule conformance test for the 9 August SECOND REVISION: the paid extra tile is
// UNCAPPED. A player may buy as many as they can pay for, at a flat
// EXTRA_TILE_CUPCAKE_COST each, limited only by the purse and by the board having
// an empty cell for each one.
//
// The three things worth asserting, because each is a way the change could go
// wrong quietly:
//   1. repeated buying is legal, and the price does not escalate;
//   2. the purse and the free cells still stop it, so "unlimited" is not "free";
//   3. MAX_EXTRA_TILES_PER_TURN really does restore the old rule, because every
//      A/B run from here on rests on that seam being honest.
//
// REWRITTEN 17 AUGUST, for the same reason as its sibling
// (test-rules-2026-08-09-extratile.mjs): this file was written on 9 August
// against a sweep-step purchase that joined pendingSweepTiles, and the action
// moved to the SPEND step on 10 August. It had been red ever since.
//
// THE MOVE MADE ONE OF THESE ASSERTIONS SHARPER AND ONE OF THEM SIMPLER.
// Sharper: buying repeatedly used to mean stacking tiles into a pile that the
// placement step then had to have room for, so "unlimited" was bounded by a
// projection. Each tile is now placed as it is bought, so the board's free cells
// are consumed one at a time and the ceiling is exact - a board with n free cells
// sells exactly n tiles, which is what the section below asserts by emptying one.
// Simpler: the gate is "is there an empty cell", with no pending pile in it.
//
// Run: node test-rules-2026-08-09-uncapped-tiles.mjs
import * as engine from './src/engine/game.js';
import { createGame, sweep, place, takeExtraTile, canBuyExtraTile, skipSpend, skipClaim,
  refill, EXTRA_TILE_CUPCAKE_COST, MAX_EXTRA_TILES_PER_TURN,
  getMaxExtraTilesPerTurn, setMaxExtraTilesPerTurn,
  getValidSweeps, getValidPlacements } from './src/engine/game.js';

let pass = 0, fail = 0;
function check(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ' - ' + detail : ''}`); }
}

// Sweep, clear any bonus offer, place everything the board can take: the game is
// then in 'spend', which is where this action lives.
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

console.log('\n=== The adopted rule ===');
check('MAX_EXTRA_TILES_PER_TURN is null (unlimited)', MAX_EXTRA_TILES_PER_TURN === null);
check('the live value starts from the constant', getMaxExtraTilesPerTurn() === null);

console.log('\n=== Buying repeatedly, at a flat price ===');
let gs = createGame(configs, null);
spendStep(gs);
const player = gs.players[gs.currentPlayerIndex];
// A purse big enough that the PURSE is not what stops the test - the board's free
// cells are the interesting limit and they are tested separately below.
player.cupcakes = 6;
const purseBefore = player.cupcakes;
const filledBefore = player.board.filter(c => c !== null).length;
let bought = 0;
while (canBuyExtraTile(gs) && bought < 4) {
  takeExtraTile(gs, firstMarketIndex(gs), firstFreeCell(gs));
  bought++;
}
check('more than one extra tile was bought', bought > 1, `bought=${bought}`);
check('the counter matches', gs.extraTilesBoughtThisTurn === bought, `counter=${gs.extraTilesBoughtThisTurn}`);
check('every tile went straight onto the board',
  player.board.filter(c => c !== null).length === filledBefore + bought);
check('and none of them is left pending', gs.pendingSweepTiles.length === 0);
check('a flat price each, no escalation', player.cupcakes === purseBefore - bought * EXTRA_TILE_CUPCAKE_COST,
  `${purseBefore} -> ${player.cupcakes} for ${bought} tiles`);
check('the legacy mirror is still set', gs.extraTileUsedThisTurn === true);

console.log('\n=== The purse still stops it ===');
player.cupcakes = 0;
check('not buyable when broke, however many are left on the market', !canBuyExtraTile(gs));
try {
  takeExtraTile(gs, firstMarketIndex(gs), firstFreeCell(gs));
  check('takeExtraTile throws when broke', false);
} catch (e) { check('takeExtraTile throws when broke', true); }

console.log('\n=== The board still stops it, cell by cell ===');
// A rich player against a board with room for exactly TWO tiles: they may buy
// both and no more, and the ceiling has to be reached one cell at a time rather
// than refused up front. This is the gate that keeps "unlimited" from meaning
// "empty the market".
let gs2 = createGame(configs, null);
spendStep(gs2);
const p2 = gs2.players[gs2.currentPlayerIndex];
p2.cupcakes = 20;
const free = getValidPlacements(p2.board);
for (let i = 2; i < free.length; i++) p2.board[free[i]] = { type: 'blocked' };
check('two spare cells: buyable', canBuyExtraTile(gs2), `free=${getValidPlacements(p2.board).length}`);
takeExtraTile(gs2, firstMarketIndex(gs2), free[0]);
check('one spare cell left: STILL buyable', canBuyExtraTile(gs2), `free=${getValidPlacements(p2.board).length}`);
takeExtraTile(gs2, firstMarketIndex(gs2), free[1]);
check('and then the board is full, even with 18 cupcakes left', !canBuyExtraTile(gs2),
  `cupcakes=${p2.cupcakes} free=${getValidPlacements(p2.board).length}`);
check('exactly as many tiles as there were cells', gs2.extraTilesBoughtThisTurn === 2);

console.log('\n=== The counter resets between turns ===');
skipSpend(gs2);
skipClaim(gs2);
refill(gs2);
check('extraTilesBoughtThisTurn is back to 0', gs2.extraTilesBoughtThisTurn === 0);
check('and so is the legacy mirror', gs2.extraTileUsedThisTurn === false);

console.log('\n=== The A/B seam restores the old rule exactly ===');
setMaxExtraTilesPerTurn(1);
check('the live value took the cap', getMaxExtraTilesPerTurn() === 1);
let gs3 = createGame(configs, null);
spendStep(gs3);
gs3.players[gs3.currentPlayerIndex].cupcakes = 6;
takeExtraTile(gs3, firstMarketIndex(gs3), firstFreeCell(gs3));
check('the first tile is legal under the cap', gs3.extraTilesBoughtThisTurn === 1);
check('and the second is refused', !canBuyExtraTile(gs3));
try {
  takeExtraTile(gs3, firstMarketIndex(gs3), firstFreeCell(gs3));
  check('a second extra tile throws under the cap', false);
} catch (e) { check('a second extra tile throws under the cap', true); }
setMaxExtraTilesPerTurn(MAX_EXTRA_TILES_PER_TURN);
check('the seam puts the shipped rule back', getMaxExtraTilesPerTurn() === null);

console.log('\n=== The setter validates ===');
try { setMaxExtraTilesPerTurn(1.5); check('a fractional cap throws', false); }
catch (e) { check('a fractional cap throws', true); }
try { setMaxExtraTilesPerTurn(-1); check('a negative cap throws', false); }
catch (e) { check('a negative cap throws', true); }
check('a rejected setter left the rule alone', getMaxExtraTilesPerTurn() === null);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
