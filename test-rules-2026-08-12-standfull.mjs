// Rule conformance test for the 12 August change: A FULL CAKE STAND ENDS THE
// GAME. End condition 3, alongside 'boardFull' (condition 1) and 'marketTiles'
// (condition 2).
//
// THE RULE. When any player's cake stand is completely full - all four rows at
// capacity, 4 + 3 + 2 + 1 = 10 tiles - the ending is ARMED. That player has
// nothing left to buy: every future claim can only reach the crumb tray, at a
// flat 1 VP against the 3-14 a plating pays. Play then continues to the end of the
// round under the equal-turns rule, exactly as it does for the other two.
//
// The clauses this file exists to protect, because each is easy to get subtly
// wrong or to "tidy" away later:
//
//   IT ARMS, IT DOES NOT STOP. Nothing about this ending is instant. gameOver
//   stays false until the turn comes back round to the start player. A future
//   edit that ends play on the spot would hand the filling player a free lap over
//   everybody who had not had their turn yet.
//
//   THE STAND MUST BE FULL, NOT MERELY DEEP. Nine tiles is not ten, and four rows
//   at capacity is the test - not a tile count, which a future variant with
//   different row capacities would break.
//
//   IT IS NAMED AHEAD OF 'boardFull'. triggerEndGame keeps the FIRST reason, and
//   the two are checked in one pass, so the order in that pass is what a player
//   sees on the end screen. 'boardFull' ends ~99% of games and says nothing;
//   'standFull' is the rare one and is the one worth reporting.
//
//   FIRST REASON STILL WINS ACROSS TURNS. A stand filling in a round that is
//   already armed does NOT rename the ending.
//
//   A FULL STAND IS STILL PLAYABLE. The player keeps taking turns until the round
//   closes, and a claim in those turns must still work - to the crumb tray, which
//   is by then the only legal destination.
//
// Run: node test-rules-2026-08-12-standfull.mjs
import { createGame, refill, isStandFull, getLegalDestinations,
  getValidPlacements, STAND_ROW_VALUES } from './src/engine/game.js';

let pass = 0, fail = 0;
function check(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ' - ' + detail : ''}`); }
}

const tile = (ingredient, colour = 'pink') => ({ colour, ingredient });

// The four ingredients a full stand needs, one per row. There are five in the
// game and a stand has four rows, so one ingredient is always left out - which is
// itself part of why this ending is rare.
const ROW_INGREDIENTS = ['lemon', 'chocolate', 'caramel', 'strawberry'];

// Fill `count` rows of a player's stand to capacity, one ingredient per row,
// obeying the one-row-per-ingredient rule. Writes the rows directly rather than
// claiming ten times: the arrival route is claim()'s business and is covered
// elsewhere, and what is under test here is what the engine does once the stand
// is in this shape.
function fillStand(player, rowCount) {
  for (let i = 0; i < rowCount; i++) {
    const row = player.stand[i];
    row.ingredient = ROW_INGREDIENTS[i];
    row.tiles = Array.from({ length: row.capacity }, () => tile(ROW_INGREDIENTS[i]));
  }
}

// A game parked at the refill step, ready for the turn to rotate. Boards are
// wiped so nothing accidentally arms 'boardFull' and steals the reason under a
// test that is not about that.
function refillState({ playerCount = 2, currentPlayerIndex = 0 } = {}) {
  const s = createGame(Array.from({ length: playerCount }, (_, i) => ({ name: `P${i}` })), null);
  s.gamePhase = 'refill';
  s.currentPlayerIndex = currentPlayerIndex;
  for (const p of s.players) p.board = Array(25).fill(null);
  return s;
}

console.log('\n=== isStandFull: the predicate itself ===');
{
  const s = refillState();
  const p = s.players[0];
  check('an untouched stand is not full', isStandFull(p) === false);
  check('the stand holds ten tiles across four rows',
    p.stand.reduce((n, r) => n + r.capacity, 0) === 10, 'row capacities have moved');
  check('capacities are 4/3/2/1 bottom to top',
    p.stand.map(r => r.capacity).join('/') === '4/3/2/1');
  check('the scoring table has an entry per plate of every row',
    p.stand.every((r, i) => STAND_ROW_VALUES[i].length === r.capacity),
    'STAND_ROW_VALUES and the row capacities have come apart');

  fillStand(p, 3);
  check('three rows full is NOT a full stand', isStandFull(p) === false,
    `nine tiles read as full: ${p.stand.map(r => r.tiles.length).join('/')}`);

  // One short on the LAST row, which is the case a naive tile count gets right by
  // accident and a capacity test gets right on purpose.
  fillStand(p, 4);
  p.stand[0].tiles.pop();
  check('nine of ten tiles is NOT a full stand', isStandFull(p) === false);

  fillStand(p, 4);
  check('four rows at capacity IS a full stand', isStandFull(p) === true);
}

console.log('\n=== A full stand can only reach the crumb tray ===');
{
  const s = refillState();
  const p = s.players[0];
  fillStand(p, 4);
  for (const ingredient of [...ROW_INGREDIENTS, 'almond']) {
    const dests = getLegalDestinations(p, tile(ingredient));
    check(`${ingredient}: the tray and nothing else`,
      dests.length === 1 && dests[0].type === 'crumb',
      `got ${JSON.stringify(dests)}`);
  }
}

console.log('\n=== The ending arms on the turn the stand fills ===');
{
  const s = refillState({ playerCount: 3, currentPlayerIndex: 0 });
  fillStand(s.players[0], 4);
  check('nothing is armed before the turn rotates', s.endTriggered === false);
  refill(s);
  check('the ending is armed', s.endTriggered === true);
  check("the reason is 'standFull'", s.endGameReason === 'standFull', `got ${s.endGameReason}`);
  check('play has NOT stopped - the round finishes first', s.gameOver === false);
  check('and the turn passed to the next seat', s.currentPlayerIndex === 1);
}

console.log('\n=== Somebody ELSE filling their stand arms it too ===');
{
  const s = refillState({ playerCount: 3, currentPlayerIndex: 0 });
  fillStand(s.players[2], 4);
  refill(s);
  check("a stand two seats away still arms 'standFull'", s.endGameReason === 'standFull');
}

console.log('\n=== The equal-turns stop still owns the actual ending ===');
{
  const s = refillState({ playerCount: 2, currentPlayerIndex: 0 });
  fillStand(s.players[0], 4);
  refill(s);
  check('armed but running, seat 1 to play', s.endTriggered && !s.gameOver && s.currentPlayerIndex === 1);
  s.gamePhase = 'refill';
  refill(s);
  check('the turn returns to the start player and the game stops', s.gameOver === true);
  check('the reason survives to the end screen', s.endGameReason === 'standFull');
  check('and scores were calculated', s.players.every(p => typeof p.score === 'number'));
}

console.log("\n=== 'standFull' is named ahead of 'boardFull' when one turn arms both ===");
{
  const s = refillState({ playerCount: 3, currentPlayerIndex: 0 });
  fillStand(s.players[0], 4);
  // Seat 1's board is full at the same moment. Both conditions are true when the
  // single pass in advanceToNextTurn runs.
  s.players[1].board = Array(25).fill({ type: 'blocked' });
  check('the board really is unplayable', getValidPlacements(s.players[1].board).length === 0);
  refill(s);
  check("the rarer, more informative reason wins the name",
    s.endGameReason === 'standFull', `got ${s.endGameReason}`);
}

console.log('\n=== But first reason still wins ACROSS turns ===');
{
  const s = refillState({ playerCount: 3, currentPlayerIndex: 0 });
  s.players[1].board = Array(25).fill({ type: 'blocked' });
  refill(s);
  check("turn one arms 'boardFull'", s.endGameReason === 'boardFull');
  // Now a stand fills during the final round. It must not rename the ending.
  fillStand(s.players[0], 4);
  s.gamePhase = 'refill';
  refill(s);
  check("a stand filling mid-round does not steal the reason",
    s.endGameReason === 'boardFull', `got ${s.endGameReason}`);
}

console.log('\n=== A player with a full stand keeps playing until the round closes ===');
{
  const s = refillState({ playerCount: 4, currentPlayerIndex: 1 });
  fillStand(s.players[1], 4);
  refill(s);
  check('armed on seat 1, seats 2 and 3 still owed a turn',
    s.endTriggered && !s.gameOver && s.currentPlayerIndex === 2);
  s.gamePhase = 'refill';
  refill(s);
  check('seat 2 still gets its turn', !s.gameOver && s.currentPlayerIndex === 3,
    'the game stopped early');
  s.gamePhase = 'refill';
  refill(s);
  check('and the game stops when the turn returns to the start player',
    s.gameOver === true && s.currentPlayerIndex === 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
