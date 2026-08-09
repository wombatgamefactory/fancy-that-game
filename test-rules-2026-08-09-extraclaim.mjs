// Rule conformance test for the 9 August change: A FURTHER PATISSERIE GOAL IS FOR
// SALE. The first claim of a turn is free as it always was; every further one
// costs EXTRA_CLAIM_CUPCAKE_COST (1) cupcake, and there is no per-turn cap - a
// player may keep buying while they can pay and still find patterns.
//
// The two clauses this file exists to protect, because both are easy to "tidy"
// into something that looks equivalent and is not:
//
//   PAID ON COMPLETION, NEVER IN ADVANCE. The cupcake is deducted after every
//   validation has passed, so a claim the engine refuses costs the player nothing.
//   Charging earlier would turn a mis-ordered claim step into a wasted cupcake.
//
//   THE STEP CLOSES ON AFFORDABILITY, NOT ON A COUNT. After a claim the phase
//   stays 'claim' if the player could pay for another and drops to 'refill' if
//   they could not, so no driver has to poll a dead phase.
//
// Run: node test-rules-2026-08-09-extraclaim.mjs
import { createGame, claim, skipClaim, getPatternMatches, getExtraClaimCupcakeCost,
  setExtraClaimCupcakeCost, EXTRA_CLAIM_CUPCAKE_COST } from './src/engine/game.js';
import { REWARD_CARDS } from './src/engine/tiles.js';

let pass = 0, fail = 0;
function check(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ' - ' + detail : ''}`); }
}

// Two two-yellow cards and a board of four yellows in two separate pairs, so the
// second claim is genuinely independent of the first - the tile sacrificed for one
// is not in the other's pattern. Order-dependence is a real property of the claim
// step (see the 9 August analysis) but it is not what this file is testing.
function twoClaimState({ cupcakes = 3 } = {}) {
  const s = createGame([{ name: 'A' }, { name: 'B' }], null);
  s.gamePhase = 'claim';
  s.currentPlayerIndex = 0;
  s.claimsThisTurn = 0;
  const p = s.players[0];
  p.cupcakes = cupcakes;
  p.board = Array(25).fill(null);
  // Cells 0-1 and 3-4: two adjacent yellow pairs with a gap between them.
  p.board[0] = { colour: 'yellow', ingredient: 'lemon' };
  p.board[1] = { colour: 'yellow', ingredient: 'lemon' };
  p.board[3] = { colour: 'yellow', ingredient: 'almond' };
  p.board[4] = { colour: 'yellow', ingredient: 'almond' };
  // Two copies of card 1 (Lemon madeleine, two adjacent yellows), given distinct
  // ids because claim() resolves cards by id.
  const base = REWARD_CARDS.find(c => c.id === 1);
  s.cardMarket = [{ ...base, id: 9001 }, { ...base, id: 9002 }];
  return { s, p };
}

console.log('\n=== The adopted rule ===');
check('EXTRA_CLAIM_CUPCAKE_COST is 1', EXTRA_CLAIM_CUPCAKE_COST === 1,
  `got ${EXTRA_CLAIM_CUPCAKE_COST}`);
check('the live value starts from the constant', getExtraClaimCupcakeCost() === EXTRA_CLAIM_CUPCAKE_COST);

console.log('\n=== The first claim of a turn is free ===');
{
  const { s, p } = twoClaimState({ cupcakes: 3 });
  claim(s, 9001, 0, { type: 'crumb' });
  check('no cupcake charged for the first claim', p.cupcakes === 3, `got ${p.cupcakes}`);
  check('claimsThisTurn incremented', s.claimsThisTurn === 1);
  check('the step stays open when another is affordable', s.gamePhase === 'claim', `phase=${s.gamePhase}`);
}

console.log('\n=== The second claim costs 1, paid on completion ===');
{
  const { s, p } = twoClaimState({ cupcakes: 3 });
  claim(s, 9001, 0, { type: 'crumb' });
  claim(s, 9002, 3, { type: 'crumb' });
  check('1 cupcake charged for the second claim', p.cupcakes === 2, `got ${p.cupcakes}`);
  check('both cards are held', p.claimedCards.length === 2, `got ${p.claimedCards.length}`);
  check('both cards left the row', s.cardMarket.length === 0, `got ${s.cardMarket.length}`);
}

console.log('\n=== A REFUSED claim costs nothing (the charge sits after validation) ===');
{
  const { s, p } = twoClaimState({ cupcakes: 3 });
  claim(s, 9001, 0, { type: 'crumb' });
  const before = p.cupcakes;
  // Cell 2 is empty, so it is in no matching pattern - the claim must be rejected.
  try {
    claim(s, 9002, 2, { type: 'crumb' });
    check('an invalid removal cell is rejected', false);
  } catch (e) {
    check('an invalid removal cell is rejected', true);
  }
  check('the rejected claim charged nothing', p.cupcakes === before, `${before} -> ${p.cupcakes}`);
  check('the rejected claim did not count', s.claimsThisTurn === 1, `got ${s.claimsThisTurn}`);
  check('the card is still on the row', s.cardMarket.some(c => c.id === 9002));
}

console.log('\n=== A player who cannot pay has the step closed for them ===');
{
  const { s, p } = twoClaimState({ cupcakes: 0 });
  claim(s, 9001, 0, { type: 'crumb' });
  check('first claim still lands with an empty purse', p.claimedCards.length === 1);
  check('the step closes rather than offering an unaffordable claim', s.gamePhase === 'refill',
    `phase=${s.gamePhase}`);
  // The engine must still refuse it if a driver asks anyway.
  s.gamePhase = 'claim';
  try {
    claim(s, 9002, 3, { type: 'crumb' });
    check('an unaffordable claim throws', false);
  } catch (e) {
    check('an unaffordable claim throws', /cupcake/i.test(e.message), `message was "${e.message}"`);
  }
  check('the unaffordable attempt charged nothing', p.cupcakes === 0, `got ${p.cupcakes}`);
}

console.log('\n=== There is no per-turn cap - the PRICE is the cap ===');
{
  const s = createGame([{ name: 'A' }, { name: 'B' }], null);
  s.gamePhase = 'claim';
  s.currentPlayerIndex = 0;
  s.claimsThisTurn = 0;
  const p = s.players[0];
  p.cupcakes = 5;
  p.board = Array(25).fill(null);
  // Three separated yellow pairs: cells 0-1, 3-4, 10-11.
  for (const i of [0, 1, 3, 4, 10, 11]) p.board[i] = { colour: 'yellow', ingredient: 'lemon' };
  const base = REWARD_CARDS.find(c => c.id === 1);
  s.cardMarket = [{ ...base, id: 9001 }, { ...base, id: 9002 }, { ...base, id: 9003 }];
  claim(s, 9001, 0, { type: 'crumb' });
  claim(s, 9002, 3, { type: 'crumb' });
  claim(s, 9003, 10, { type: 'crumb' });
  check('a third card is legal', p.claimedCards.length === 3, `got ${p.claimedCards.length}`);
  check('two cupcakes paid for two extra claims', p.cupcakes === 3, `got ${p.cupcakes}`);
  check('claimsThisTurn counts all three', s.claimsThisTurn === 3, `got ${s.claimsThisTurn}`);
}

console.log('\n=== skipClaim still ends the step at any point ===');
{
  const { s } = twoClaimState({ cupcakes: 3 });
  claim(s, 9001, 0, { type: 'crumb' });
  check('the step is still open', s.gamePhase === 'claim');
  skipClaim(s);
  check('skipping a further claim moves to refill', s.gamePhase === 'refill', `phase=${s.gamePhase}`);
}

console.log('\n=== The A/B control still works (setExtraClaimCupcakeCost(null)) ===');
{
  setExtraClaimCupcakeCost(null);
  const { s, p } = twoClaimState({ cupcakes: 3 });
  claim(s, 9001, 0, { type: 'crumb' });
  check('control: the step closes after one claim', s.gamePhase === 'refill', `phase=${s.gamePhase}`);
  s.gamePhase = 'claim';
  try {
    claim(s, 9002, 3, { type: 'crumb' });
    check('control: a second claim throws', false);
  } catch (e) {
    check('control: a second claim throws', /one claim per turn/i.test(e.message),
      `message was "${e.message}"`);
  }
  check('control: nothing was charged', p.cupcakes === 3, `got ${p.cupcakes}`);
  setExtraClaimCupcakeCost(EXTRA_CLAIM_CUPCAKE_COST);
  check('the seam restores the shipped rule', getExtraClaimCupcakeCost() === 1);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail > 0 ? 1 : 0);
