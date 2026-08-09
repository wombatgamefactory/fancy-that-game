// Rule conformance test for the 8 August change: spending 1 cupcake deals 2 new
// cards onto the row, claimable this same turn.
//
// 9 AUGUST: the three assertions that the extra tile was DELETED are inverted -
// the rule is back and both spends are on the menu. The extra tile's own gates
// are covered by test-rules-2026-08-09-extratile.mjs; what is checked here is
// only that the two spends coexist and stay independent.
//
// Run: node test-rules-2026-08-08-dealcards.mjs
import * as engine from './src/engine/game.js';
import { createGame, sweep, place, dealCards, canDealCards, skipSpend, skipClaim, refill,
  DEAL_CARDS_CUPCAKE_COST, CARDS_PER_DEAL, MAX_MARKET_CARDS, getValidSweeps, getValidPlacements } from './src/engine/game.js';

let pass = 0, fail = 0;
function check(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ' - ' + detail : ''}`); }
}

console.log('\n=== The restored rule (9 August) ===');
check('takeExtraTile is back in the engine', typeof engine.takeExtraTile === 'function');
check('canBuyExtraTile is back in the engine', typeof engine.canBuyExtraTile === 'function');
check('EXTRA_TILE_CUPCAKE_COST is 1', engine.EXTRA_TILE_CUPCAKE_COST === 1);

console.log('\n=== The new rule ===');
check('DEAL_CARDS_CUPCAKE_COST is 1', DEAL_CARDS_CUPCAKE_COST === 1);
check('CARDS_PER_DEAL is 2', CARDS_PER_DEAL === 2);

// Walk one turn to the spend step.
const configs = [{ name: 'A', isHuman: false }, { name: 'B', isHuman: false }];
let gs = createGame(configs, null);
const player = gs.players[0];

check('not dealable before the spend step', !canDealCards(gs), `phase=${gs.gamePhase}`);
try {
  dealCards(gs);
  check('dealCards throws outside the spend phase', false);
} catch (e) { check('dealCards throws outside the spend phase', true); }

const sweeps = getValidSweeps(gs);
gs = sweep(gs, sweeps[0].rowOrCol, sweeps[0].isRow, sweeps[0].declaration, sweeps[0].declarationType);
if (gs.bonusTileAvailable) gs = engine.declineBonusTile(gs);
const spots = getValidPlacements(gs.players[0].board);
gs = place(gs, gs.pendingSweepTiles.map((_, i) => spots[i]));
check('reached the spend phase', gs.gamePhase === 'spend');

const cupcakesBefore = gs.players[0].cupcakes;
const rowBefore = gs.cardMarket.length;
const deckBefore = gs.gameDeck.length;
check('dealable at the spend step', canDealCards(gs));

gs = dealCards(gs);
check(`row grew by ${CARDS_PER_DEAL}`, gs.cardMarket.length === rowBefore + CARDS_PER_DEAL, `${rowBefore} -> ${gs.cardMarket.length}`);
check('deck shrank by the same', gs.gameDeck.length === deckBefore - CARDS_PER_DEAL);
check('cost 1 cupcake', gs.players[0].cupcakes === cupcakesBefore - DEAL_CARDS_CUPCAKE_COST);
check('nothing was discarded', gs.cardDiscard.length === 0);
check('the allowance is spent', gs.cardsDealtThisTurn === true);
check('no longer dealable this turn', !canDealCards(gs));
try {
  dealCards(gs);
  check('a second deal throws', false);
} catch (e) { check('a second deal throws', true); }

// THE POINT OF THE RULE: the dealt cards are live for this turn's claim. The
// reserve lock must NOT have been set by the deal.
check('a dealt card is not blocked from this turn\'s claim', gs.reservedCardIdThisTurn === null);
const dealt = gs.cardMarket.slice(rowBefore);
check(`${CARDS_PER_DEAL} dealt cards are face up on the row`, dealt.length === CARDS_PER_DEAL && dealt.every(c => c && c.id));

// The allowance resets on the next turn.
gs = skipSpend(gs);
gs = skipClaim(gs);
gs = refill(gs);
check('the allowance resets on the next turn', gs.cardsDealtThisTurn === false);

// The row cap: both cards or neither.
console.log('\n=== The row cap gate ===');
let gs2 = createGame(configs, null);
gs2.gamePhase = 'spend';
gs2.players[0].cupcakes = 5;
while (gs2.cardMarket.length < MAX_MARKET_CARDS - 1) gs2.cardMarket.push(engine.drawCard(gs2));
check(`not dealable with room for only 1 (row ${gs2.cardMarket.length} of ${MAX_MARKET_CARDS})`, !canDealCards(gs2));
gs2.cardMarket.pop();
check(`dealable with room for ${CARDS_PER_DEAL} (row ${gs2.cardMarket.length} of ${MAX_MARKET_CARDS})`, canDealCards(gs2));

// No cupcake, no deal.
console.log('\n=== The purse gate ===');
let gs3 = createGame(configs, null);
gs3.gamePhase = 'spend';
gs3.players[0].cupcakes = 0;
check('not dealable with an empty purse', !canDealCards(gs3));

// Deck exhaustion.
console.log('\n=== The deck gate ===');
let gs4 = createGame(configs, null);
gs4.gamePhase = 'spend';
gs4.players[0].cupcakes = 5;
gs4.gameDeck = [gs4.gameDeck[0]];
gs4.cardDiscard = [];
check('not dealable with 1 card left between deck and discard', !canDealCards(gs4));

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
