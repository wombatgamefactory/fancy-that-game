// Rule conformance test for the 11 August change (second revision): EVERY
// PER-TURN CUPCAKE ALLOWANCE IS DELETED. Dean's rule - "you can spend unlimited
// cupcakes in a turn, there is no limit" - so two cupcakes move two tiles.
//
// The extra tile went uncapped on 9 August and has its own file
// (test-rules-2026-08-09-uncapped-tiles.mjs). This one covers the three that
// followed it: the tile move, the plate removal and the paid 2-card deal.
//
// The four clauses this file exists to protect, because each is easy to "tidy"
// back into the rule it replaced:
//
//   THE PRICE IS FLAT. A second move costs MOVE_TILE_CUPCAKE_COST, not a ladder.
//   Nothing in the engine may make the second purchase of a turn dearer.
//
//   EACH PURCHASE RE-READS THE BOARD, so the second move may use the cell the
//   first one emptied. That is what makes two moves a manoeuvre rather than two
//   independent moves.
//
//   THE REAL GATES SURVIVE. "No limit" is not "no gate" - the purse, an empty
//   cell, a plate to clear and MAX_MARKET_CARDS all still refuse.
//
//   THE COUNTERS RESET, and so do the legacy booleans that mirror them. The
//   older bots read the mirrors, and a mirror that never clears would sit them
//   out for the rest of the game.
//
// Run: node test-rules-2026-08-11-uncapped-spends.mjs
import { createGame, moveTile, canMoveTile, removePlate, canRemovePlate,
  dealCards, canDealCards, skipSpend, skipClaim, refill,
  getPerTurnSpendCap, setPerTurnSpendCap, getValidPlacements,
  MAX_TILE_MOVES_PER_TURN, MAX_PLATE_REMOVALS_PER_TURN, MAX_CARD_DEALS_PER_TURN,
  MOVE_TILE_CUPCAKE_COST, REMOVE_PLATE_CUPCAKE_COST, DEAL_CARDS_CUPCAKE_COST,
  CARDS_PER_DEAL, MAX_MARKET_CARDS } from './src/engine/game.js';

let pass = 0, fail = 0;
function check(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ' - ' + detail : ''}`); }
}
function threw(name, fn, fragment) {
  try { fn(); check(name, false, 'no error thrown'); }
  catch (e) { check(name, e.message.includes(fragment), `got "${e.message}"`); }
}

// A player parked at the spend step with a purse and an empty board. Every test
// below builds its own board on top of this, so nothing here assumes a shape.
function spendState({ cupcakes = 9, playerCount = 2 } = {}) {
  const s = createGame(Array.from({ length: playerCount }, (_, i) => ({ name: `P${i}` })), null);
  s.gamePhase = 'spend';
  s.currentPlayerIndex = 0;
  const p = s.players[0];
  p.cupcakes = cupcakes;
  p.board = Array(25).fill(null);
  return { s, p };
}
const tile = (colour, ingredient = 'citrus') => ({ colour, ingredient });

console.log('\n=== The adopted rule: no cap on any of the three ===');
check('MAX_TILE_MOVES_PER_TURN is null', MAX_TILE_MOVES_PER_TURN === null);
check('MAX_PLATE_REMOVALS_PER_TURN is null', MAX_PLATE_REMOVALS_PER_TURN === null);
check('MAX_CARD_DEALS_PER_TURN is null', MAX_CARD_DEALS_PER_TURN === null);
check('the live caps start from the constants',
  getPerTurnSpendCap('moveTile') === null
  && getPerTurnSpendCap('removePlate') === null
  && getPerTurnSpendCap('dealCards') === null);
threw('an unknown cap name is refused rather than silently ignored',
  () => getPerTurnSpendCap('reserveCard'), 'Unknown per-turn spend cap');

console.log('\n=== Two cupcakes move two tiles (the rule as Dean stated it) ===');
{
  const { s, p } = spendState({ cupcakes: 2 });
  p.board[0] = tile('pink');
  p.board[1] = tile('blue');
  moveTile(s, 0, 24);
  moveTile(s, 1, 23);
  check('both tiles arrived', p.board[24] && p.board[23], 'one of the two did not land');
  check('both sources are empty', p.board[0] === null && p.board[1] === null);
  check('charged the flat price twice, not a ladder',
    p.cupcakes === 2 - 2 * MOVE_TILE_CUPCAKE_COST, `got ${p.cupcakes}`);
  check('the counter agrees', s.tilesMovedThisTurn === 2, `got ${s.tilesMovedThisTurn}`);
}

console.log('\n=== The purse is the limit, and it really does refuse ===');
{
  const { s, p } = spendState({ cupcakes: 1 });
  p.board[0] = tile('pink');
  p.board[1] = tile('blue');
  moveTile(s, 0, 24);
  check('broke after one move', p.cupcakes === 0);
  check('canMoveTile says no', !canMoveTile(s));
  threw('and the engine says why', () => moveTile(s, 1, 23), 'Not enough cupcakes');
}

console.log('\n=== The second move sees the board the first one left ===');
{
  // 24 is the ONLY empty cell, and it is where the first tile is going. The
  // second move is only legal if the engine re-reads the board and notices that
  // cell 0 is now free - which is the manoeuvre the uncapping is really for.
  const { s, p } = spendState({ cupcakes: 4 });
  p.board = Array(25).fill(null).map(() => tile('pink'));
  p.board[24] = null;
  moveTile(s, 0, 24);
  check('cell 0 is the new hole', p.board[0] === null);
  moveTile(s, 1, 0);
  check('the second move used the cell the first one emptied', p.board[0] !== null && p.board[1] === null);
  check('both were charged', p.cupcakes === 4 - 2 * MOVE_TILE_CUPCAKE_COST);
}

console.log('\n=== canMoveTile carries the board conditions, not just the purse ===');
{
  const { s, p } = spendState({ cupcakes: 9 });
  check('no tile to move: refused', !canMoveTile(s));
  p.board = Array(25).fill(null).map(() => tile('pink'));
  check('no empty cell: refused', !canMoveTile(s));
  p.board[24] = null;
  check('a tile and a hole: allowed', canMoveTile(s));
  p.board = Array(25).fill(null).map(() => ({ type: 'blocked' }));
  p.board[24] = null;
  check('empty plates are not movable tiles', !canMoveTile(s));
  s.gamePhase = 'claim';
  check('and it respects the phase', !canMoveTile(s));
}

console.log('\n=== Plate removals stack too, at the flat price ===');
{
  const { s, p } = spendState({ cupcakes: 3 * REMOVE_PLATE_CUPCAKE_COST });
  p.board[3] = { type: 'blocked' };
  p.board[4] = { type: 'blocked' };
  p.board[5] = { type: 'blocked' };
  removePlate(s, 3);
  removePlate(s, 4);
  removePlate(s, 5);
  check('all three cells are placeable again',
    [3, 4, 5].every(i => getValidPlacements(p.board).includes(i)));
  check('charged three times at the flat price', p.cupcakes === 0, `got ${p.cupcakes}`);
  check('the turn counter agrees', s.platesRemovedThisTurn === 3);
  check('and the whole-game total agrees', s.platesReturnedToBox === 3);
  check('canRemovePlate is false with no plate left', !canRemovePlate(s));
}

console.log('\n=== Paid deals stack until the ROW says no, not an allowance ===');
{
  const { s } = spendState({ cupcakes: 9 });
  let deals = 0;
  while (canDealCards(s) && deals < 20) { dealCards(s); deals++; }
  check('more than one deal was possible', deals > 1, `got ${deals}`);
  check('the counter agrees', s.cardDealsThisTurn === deals);
  check('the row never exceeded its cap', s.cardMarket.length <= MAX_MARKET_CARDS,
    `row=${s.cardMarket.length} cap=${MAX_MARKET_CARDS}`);
  check('and the next deal would not fit both cards',
    s.cardMarket.length + CARDS_PER_DEAL > MAX_MARKET_CARDS || s.players[0].cupcakes < DEAL_CARDS_CUPCAKE_COST);
}

console.log('\n=== All four spends on one turn, each repeated ===');
{
  const { s, p } = spendState({ cupcakes: 12 });
  p.board[0] = tile('pink');
  p.board[1] = tile('blue');
  p.board[10] = { type: 'blocked' };
  p.board[11] = { type: 'blocked' };
  const before = p.cupcakes;
  moveTile(s, 0, 24);
  moveTile(s, 1, 23);
  removePlate(s, 10);
  removePlate(s, 11);
  dealCards(s);
  dealCards(s);
  const expected = before
    - 2 * MOVE_TILE_CUPCAKE_COST
    - 2 * REMOVE_PLATE_CUPCAKE_COST
    - 2 * DEAL_CARDS_CUPCAKE_COST;
  check('every purchase was charged exactly once', p.cupcakes === expected,
    `got ${p.cupcakes}, expected ${expected}`);
  check('no spend closed another', s.tilesMovedThisTurn === 2
    && s.platesRemovedThisTurn === 2 && s.cardDealsThisTurn === 2);
}

console.log('\n=== The counters and their legacy mirrors reset ===');
{
  const { s, p } = spendState({ cupcakes: 9 });
  p.board[0] = tile('pink');
  p.board[10] = { type: 'blocked' };
  moveTile(s, 0, 24);
  removePlate(s, 10);
  dealCards(s);
  check('mirrors set while the turn runs',
    s.moveUsedThisTurn && s.plateRemovedThisTurn && s.cardsDealtThisTurn);
  skipSpend(s);
  skipClaim(s);
  refill(s);
  check('counters cleared', s.tilesMovedThisTurn === 0
    && s.platesRemovedThisTurn === 0 && s.cardDealsThisTurn === 0);
  check('mirrors cleared with them', !s.moveUsedThisTurn
    && !s.plateRemovedThisTurn && !s.cardsDealtThisTurn);
}

console.log('\n=== The A/B seam restores the old allowances exactly ===');
{
  setPerTurnSpendCap('moveTile', 1);
  setPerTurnSpendCap('removePlate', 1);
  setPerTurnSpendCap('dealCards', 1);
  try {
    const { s, p } = spendState({ cupcakes: 9 });
    p.board[0] = tile('pink');
    p.board[1] = tile('blue');
    p.board[10] = { type: 'blocked' };
    p.board[11] = { type: 'blocked' };
    moveTile(s, 0, 24);
    check('the capped rule refuses the second move', !canMoveTile(s));
    threw('and throws with the live cap in the message',
      () => moveTile(s, 1, 23), 'Can only move 1 tile(s) per turn');
    removePlate(s, 10);
    check('the capped rule refuses the second removal', !canRemovePlate(s));
    dealCards(s);
    check('the capped rule refuses the second deal', !canDealCards(s));
  } finally {
    setPerTurnSpendCap('moveTile', MAX_TILE_MOVES_PER_TURN);
    setPerTurnSpendCap('removePlate', MAX_PLATE_REMOVALS_PER_TURN);
    setPerTurnSpendCap('dealCards', MAX_CARD_DEALS_PER_TURN);
  }
  check('the seam restores the shipped rule',
    getPerTurnSpendCap('moveTile') === null
    && getPerTurnSpendCap('removePlate') === null
    && getPerTurnSpendCap('dealCards') === null);
  threw('a bad cap value is refused', () => setPerTurnSpendCap('moveTile', 1.5),
    'must be null or a non-negative integer');
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
