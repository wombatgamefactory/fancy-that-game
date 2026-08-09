// Rule conformance test for the 9 August SECOND REVISION: the sweep-step extra
// tile is UNCAPPED. A player may buy as many as they can pay for, at a flat
// EXTRA_TILE_CUPCAKE_COST each, limited only by the purse and by the board having
// room for every tile bought ON TOP OF the ones already pending.
//
// The three things worth asserting, because each is a way the change could go
// wrong quietly:
//   1. repeated buying is legal, and the price does not escalate;
//   2. the purse and the free cells still stop it, so "unlimited" is not "free";
//   3. MAX_EXTRA_TILES_PER_TURN really does restore the old rule, because every
//      A/B run from here on rests on that seam being honest.
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

function sweepInto(gs) {
  const s = getValidSweeps(gs)[0];
  sweep(gs, s.rowOrCol, s.isRow, s.declaration, s.declarationType);
  if (gs.bonusTileAvailable) engine.declineBonusTile(gs);
  return gs;
}

const firstMarketIndex = (gs) => gs.market.findIndex(t => t !== null && t !== undefined);
const configs = [{ name: 'A', isHuman: false }, { name: 'B', isHuman: false }];

console.log('\n=== The adopted rule ===');
check('MAX_EXTRA_TILES_PER_TURN is null (unlimited)', MAX_EXTRA_TILES_PER_TURN === null);
check('the live value starts from the constant', getMaxExtraTilesPerTurn() === null);

console.log('\n=== Buying repeatedly, at a flat price ===');
let gs = createGame(configs, null);
sweepInto(gs);
const player = gs.players[gs.currentPlayerIndex];
// A purse big enough that the PURSE is not what stops the test - the board's
// free cells are the interesting limit and they are tested separately below.
player.cupcakes = 6;
const purseBefore = player.cupcakes;
const pendingBefore = gs.pendingSweepTiles.length;
let bought = 0;
while (canBuyExtraTile(gs) && bought < 4) {
  takeExtraTile(gs, firstMarketIndex(gs));
  bought++;
}
check('more than one extra tile was bought', bought > 1, `bought=${bought}`);
check('the counter matches', gs.extraTilesBoughtThisTurn === bought, `counter=${gs.extraTilesBoughtThisTurn}`);
check('every tile joined the pending sweep', gs.pendingSweepTiles.length === pendingBefore + bought);
check('a flat price each, no escalation', player.cupcakes === purseBefore - bought * EXTRA_TILE_CUPCAKE_COST,
  `${purseBefore} -> ${player.cupcakes} for ${bought} tiles`);
check('the legacy mirror is still set', gs.extraTileUsedThisTurn === true);

console.log('\n=== The purse still stops it ===');
player.cupcakes = 0;
check('not buyable when broke, however many are left on the market', !canBuyExtraTile(gs));
try {
  takeExtraTile(gs, firstMarketIndex(gs));
  check('takeExtraTile throws when broke', false);
} catch (e) { check('takeExtraTile throws when broke', true); }

console.log('\n=== The board still stops it ===');
// A rich player against a board with room for exactly one tile beyond the sweep:
// they may buy that one and no more. This is the gate that keeps "unlimited"
// from meaning "empty the market".
let gs2 = createGame(configs, null);
sweepInto(gs2);
const p2 = gs2.players[gs2.currentPlayerIndex];
p2.cupcakes = 20;
const free = getValidPlacements(p2.board);
for (let i = gs2.pendingSweepTiles.length + 1; i < free.length; i++) p2.board[free[i]] = { type: 'blocked' };
check('the one spare cell can be bought', canBuyExtraTile(gs2));
takeExtraTile(gs2, firstMarketIndex(gs2));
check('and then the board is full even with 19 cupcakes left', !canBuyExtraTile(gs2),
  `cupcakes=${p2.cupcakes} free=${getValidPlacements(p2.board).length} pending=${gs2.pendingSweepTiles.length}`);

console.log('\n=== The counter resets between turns ===');
place(gs2, getValidPlacements(p2.board).slice(0, gs2.pendingSweepTiles.length));
skipSpend(gs2);
skipClaim(gs2);
refill(gs2);
check('extraTilesBoughtThisTurn is back to 0', gs2.extraTilesBoughtThisTurn === 0);
check('and so is the legacy mirror', gs2.extraTileUsedThisTurn === false);

console.log('\n=== The A/B seam restores the old rule exactly ===');
setMaxExtraTilesPerTurn(1);
check('the live value took the cap', getMaxExtraTilesPerTurn() === 1);
let gs3 = createGame(configs, null);
sweepInto(gs3);
gs3.players[gs3.currentPlayerIndex].cupcakes = 6;
takeExtraTile(gs3, firstMarketIndex(gs3));
check('the first tile is legal under the cap', gs3.extraTilesBoughtThisTurn === 1);
check('and the second is refused', !canBuyExtraTile(gs3));
try {
  takeExtraTile(gs3, firstMarketIndex(gs3));
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
