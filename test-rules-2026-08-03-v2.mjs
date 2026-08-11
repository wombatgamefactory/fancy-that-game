// Rule tests for the SECOND 3 August 2026 change set - the bag size and the
// repriced cupcake menu - CARRIED FORWARD to the 4 August set. Run with
//   node test-rules-2026-08-03-v2.mjs
//
// WHY A SECOND FILE. test-rules-2026-08-03.mjs pins the FIRST 3 August set, in
// which an empty plate could be moved for 2 cupcakes and an extra tile cost 1.
// Both of those are now false, so that file's move-price block asserts rules the
// engine no longer has. It is left standing as the record of what was adopted
// that morning; this file is the live suite.
//
// 4 AUGUST, AND WHY THE FILENAME NO LONGER TELLS THE WHOLE STORY. This is the
// live suite, so each day's changes are folded into it rather than starting a
// new file:
//   - the tile bag went BACK to 4 copies (section 1, which asserted 5 and 125);
//   - a bag that cannot fill the market no longer ends the game (section 7);
//   - the end is a TRIGGER, not a stop: play finishes the round so every player
//     has had the same number of turns (section 8).
// The ingredient objectives were deleted the same day. Nothing is removed from
// this file for that, because this file never tested them - their tests were in
// the superseded first file and went with it.
//
// 6 AUGUST - THE NEW END CONDITION. Sections 7 and 8 are rewritten and section 9
// is new, because the file's whole account of how the game ends is superseded:
//   - THE EMPTY-PLATE POOL IS DELETED. Plates are unlimited, a claim is never
//     refused, and 'cardMarket' is not an end reason any more.
//   - THE GAME ENDS ON TWO CONDITIONS AND NO OTHERS: a player's board is
//     completely full ('boardFull'), or the market and the bag are both empty
//     ('marketTiles'). 'bagEmpty' and 'boardOverflow' are gone.
//   - A BOARD FILLING ARMS THE ENDING IMMEDIATELY, at the end of the turn it
//     happened on, and across EVERY player - not when its owner next begins a turn.
//   - SWEEPING MORE THAN YOU CAN PLACE IS NOT AN ENDING. Place all you can, the
//     excess goes back into the BAG, and you keep your spend and your claim.
// About a dozen assertions in this file tested the pool directly and every one of
// them failed by design; they are rewritten below as the new rule rather than
// deleted, so what changed is on the record next to what replaced it.
//
// SCOPE. This covers what the changes touched - the bag, the four prices, the
// removal action and the allowances around it, the end conditions and the
// equal-turns rule - plus the invariants they could plausibly have broken.
// Everything else the first file asserts is untouched and is not duplicated here.
import {
  createGame, sweep, takeBonusTile, declineBonusTile, takeExtraTile, canBuyExtraTile,
  place, claim, skipClaim, skipSpend, moveTile, removePlate, canRemovePlate,
  getMoveCost, refill, calculateFinalScores,
  getTotalCardsClaimed, getValidPlacements, canClaimMore, getSweepPlacementCount,
  MOVE_TILE_CUPCAKE_COST, EXTRA_TILE_CUPCAKE_COST, REMOVE_PLATE_CUPCAKE_COST,
  // 4 August: the tile-market and equal-turns blocks arm the tea trigger by hand,
  // which means uncovering the printed teapot cells rather than assuming indices.
  TEAPOT_SYMBOL_CELLS,
} from './src/engine/game.js';
import { createTileBag, generateTileTypes, TILE_COPIES, TILE_BAG_SIZE, COLOURS, INGREDIENTS } from './src/engine/tiles.js';
import * as bot from './src/bots/basicBot.js';

let passed = 0;
const failures = [];

function check(name, fn) {
  try {
    fn();
    passed++;
  } catch (e) {
    failures.push(`${name}: ${e.message}`);
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}
function eq(a, b, msg) {
  if (a !== b) throw new Error(`${msg || 'expected equal'} - got ${a}, want ${b}`);
}
function threw(fn, fragment) {
  try {
    fn();
  } catch (e) {
    if (fragment && !e.message.includes(fragment)) {
      throw new Error(`threw the wrong error: "${e.message}" (wanted "${fragment}")`);
    }
    return;
  }
  throw new Error('expected a throw, got none');
}

function newGame(n = 3) {
  return createGame(Array.from({ length: n }, (_, i) => ({ name: `P${i + 1}` })), null);
}

// A game parked in the spend phase with a known board, so the paid actions can be
// asserted without playing to get there.
function spendState(playerCount = 2, cupcakes = 9) {
  const s = newGame(playerCount);
  s.gamePhase = 'spend';
  const p = s.players[0];
  s.currentPlayerIndex = 0;
  p.board = Array(25).fill(null);
  p.cupcakes = cupcakes;
  return { s, p };
}

// --- 1. THE TILE BAG: 5 COPIES, 125 TILES ----------------------------------
//
// 4 AUGUST: back from 5 copies / 125 tiles. This block asserted the 125-tile bag
// from the 3 August set; a 4-player game played to completion on 3 August never
// came close to running out, so the extra 25 were buying nothing.
//
// 7 AUGUST: BACK TO 5 AND 125, and the pins below moved with it. The 4 August
// reasoning was superseded by the board-full clock on 6 August, which made games
// longer: four players then ran 327 turns per 3,000 games with a pot of tea due
// and an empty bag to refill it from. See TILE_COPIES in tiles.js.
//
// THE LITERALS BELOW ARE DELIBERATE, AND THIS IS THE ONLY PLACE THEY BELONG. A
// conformance test's whole job is to fail when the constant moves, so pinning 5
// and 125 by hand is the point here. Everywhere else - report strings, skew
// baselines, UI copy - must read TILE_COPIES / TILE_BAG_SIZE, which is the rule
// that stopped being followed twice and left "125" printed under a 100-tile bag.

check('the bag holds 5 copies of each of the 25 colour/ingredient combinations', () => {
  eq(TILE_COPIES, 5, 'copies per combination');
  eq(COLOURS.length, 5, 'colours');
  eq(INGREDIENTS.length, 5, 'ingredients');
  eq(generateTileTypes().length, 25, 'distinct tile types');
  eq(TILE_BAG_SIZE, 125, 'derived bag size');

  const bag = createTileBag();
  eq(bag.length, TILE_BAG_SIZE, 'actual bag length matches the derived size');

  // Every combination appears exactly TILE_COPIES times - not just the right
  // total, but the right DISTRIBUTION. A loop bound edited to the wrong variable
  // could still produce the right number of tiles of the wrong shape.
  const counts = new Map();
  for (const t of bag) {
    const key = `${t.colour}/${t.ingredient}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  eq(counts.size, 25, 'distinct combinations present in the bag');
  for (const [key, n] of counts) eq(n, TILE_COPIES, `copies of ${key}`);
});

check('every colour and every ingredient holds an equal share of the bag', () => {
  const bag = createTileBag();
  const byColour = new Map();
  const byIngredient = new Map();
  for (const t of bag) {
    byColour.set(t.colour, (byColour.get(t.colour) || 0) + 1);
    byIngredient.set(t.ingredient, (byIngredient.get(t.ingredient) || 0) + 1);
  }
  // Derived, not typed: an equal share is TILE_BAG_SIZE / 5 either way, and
  // deriving it keeps this check meaningful if TILE_COPIES moves again.
  for (const c of COLOURS) eq(byColour.get(c), TILE_BAG_SIZE / COLOURS.length, `${c} tiles`);
  for (const i of INGREDIENTS) eq(byIngredient.get(i), TILE_BAG_SIZE / INGREDIENTS.length, `${i} tiles`);
});

check('a new game deals 25 tiles to the market and leaves the rest in the bag', () => {
  for (const pc of [2, 3, 4]) {
    const s = newGame(pc);
    const onBoard = s.market.filter(t => t !== null).length;
    eq(onBoard + s.bag.length, TILE_BAG_SIZE, `${pc}p: market + bag accounts for every tile`);
    eq(onBoard, 25, `${pc}p: a full 25-cell market`);
    eq(s.bag.length, TILE_BAG_SIZE - 25, `${pc}p: the remainder is in the bag`);
  }
});

// --- 2. THE PRICE LADDER ---------------------------------------------------

// REPRICED AGAIN 7 AUGUST: the extra tile back to 1 and the plate removal to 2,
// so the ladder is 1 / 1 / 1 / 2. Both came DOWN, for opposite reasons - the
// extra tile is the release valve and was priced out of reach, the plate removal
// took charge of the game's clock on 6 August and nobody could afford it.
check('the cupcake menu is priced 1 / 1 / 1 / 2', () => {
  eq(MOVE_TILE_CUPCAKE_COST, 1, 'move a tile');
  eq(EXTRA_TILE_CUPCAKE_COST, 1, 'take an extra tile');
  eq(REMOVE_PLATE_CUPCAKE_COST, 2, 'remove an empty plate');
});

check('an extra tile charges 1 cupcake again', () => {
  const s = newGame(2);
  const p = s.players[0];
  s.currentPlayerIndex = 0;
  // AT THE SPEND STEP since 10 August, and the tile is placed as it is bought,
  // so the call names a board cell as well. (This block said 'place' and passed
  // no cell until 11 August, and had been failing since the move.)
  s.gamePhase = 'spend';
  s.pendingSweepTiles = [];
  p.cupcakes = 4;
  const idx = s.market.findIndex(t => t !== null);
  assert(canBuyExtraTile(s), 'should be able to buy with 4 cupcakes');
  takeExtraTile(s, idx, getValidPlacements(p.board)[0]);
  eq(p.cupcakes, 4 - EXTRA_TILE_CUPCAKE_COST, 'charged the extra-tile price');
});

check('an extra tile is refused at 0 cupcakes, and 1 is now enough', () => {
  const s = newGame(2);
  const p = s.players[0];
  s.currentPlayerIndex = 0;
  s.gamePhase = 'spend';   // the spend step since 10 August - see the block above
  s.pendingSweepTiles = [];
  p.cupcakes = 0;
  assert(!canBuyExtraTile(s), 'canBuyExtraTile should refuse at 0 cupcakes');
  threw(() => takeExtraTile(s, s.market.findIndex(t => t !== null), getValidPlacements(p.board)[0]),
    'Not enough cupcakes');
  // The 7 August repricing, asserted from the other side: what used to be one
  // cupcake short is now exactly the price.
  p.cupcakes = 1;
  assert(canBuyExtraTile(s), 'canBuyExtraTile should allow at 1 cupcake');
});

// --- 3. MOVING: TILES ONLY -------------------------------------------------

check('a tile prices at 1; an empty plate and an empty cell both price as null', () => {
  const { s, p } = spendState();
  p.board[0] = { colour: 'pink', ingredient: 'lemon' };
  p.board[1] = { type: 'blocked' };
  eq(getMoveCost(p, 0), MOVE_TILE_CUPCAKE_COST, 'a tile prices as a tile');
  eq(getMoveCost(p, 1), null, 'an empty plate is not movable at any price');
  eq(getMoveCost(p, 2), null, 'an empty cell cannot be moved');
  void s;
});

check('moving an empty plate is refused, and says to remove it instead', () => {
  const { s, p } = spendState();
  p.board[0] = { type: 'blocked' };
  threw(() => moveTile(s, 0, 24), 'Empty plates cannot be moved');
  eq(p.cupcakes, 9, 'the refused move charged nothing');
  eq(s.moveUsedThisTurn, false, 'the refused move did not burn the allowance');
});

// THIS CHECK IS THE REVERSE OF THE ONE IT REPLACES (11 August, second revision).
// It pinned "one tile move per turn"; the allowance is deleted, so what has to be
// pinned now is that a second cupcake really does buy a second move. The full
// uncapping - all four spends, the caps' A/B seam, the counters - is covered by
// test-rules-2026-08-11-uncapped-spends.mjs.
check('a second cupcake buys a second tile move', () => {
  const { s, p } = spendState();
  p.board[0] = { colour: 'pink', ingredient: 'lemon' };
  p.board[1] = { colour: 'blue', ingredient: 'lemon' };
  moveTile(s, 0, 24);
  eq(p.cupcakes, 9 - MOVE_TILE_CUPCAKE_COST, 'charged the tile price');
  moveTile(s, 1, 23);
  eq(p.cupcakes, 9 - 2 * MOVE_TILE_CUPCAKE_COST, 'charged the second move too');
  eq(s.tilesMovedThisTurn, 2, 'both moves counted');
});

// --- 4. REMOVING A PLATE ---------------------------------------------------

check('removing a plate clears the cell and charges 3', () => {
  const { s, p } = spendState();
  p.board[7] = { type: 'blocked' };
  assert(canRemovePlate(s), 'the removal should be available');
  removePlate(s, 7);
  eq(p.board[7], null, 'the cell is now genuinely empty');
  eq(p.cupcakes, 9 - REMOVE_PLATE_CUPCAKE_COST, 'charged the removal price');
  assert(getValidPlacements(p.board).includes(7), 'the freed cell is placeable again');
});

check('the removed plate is counted as returned to the box', () => {
  const { s, p } = spendState();
  eq(s.platesReturnedToBox, 0, 'nothing retired yet');
  p.board[3] = { type: 'blocked' };
  removePlate(s, 3);
  eq(s.platesReturnedToBox, 1, 'the retired plate is counted');
});

check('removing a plate buys a cell back, and so pushes the ending AWAY', () => {
  // 6 AUGUST, AND THIS ASSERTION IS THE REVERSE OF THE ONE IT REPLACES. The old
  // test pinned "retiring a plate does not move the claim clock in either
  // direction", which was the point of returning it to the box while the clock
  // was the plate pool. The clock is a FULL BOARD now, so a retired plate is the
  // one thing in the game that buys the table more playing time.
  const { s, p } = spendState();
  const claimedBefore = getTotalCardsClaimed(s);
  p.board = Array(25).fill(null).map(() => ({ type: 'blocked' }));
  eq(getValidPlacements(p.board).length, 0, 'the board starts completely full');

  removePlate(s, 3);
  eq(getValidPlacements(p.board).length, 1, 'the retired plate freed a cell');
  eq(getTotalCardsClaimed(s), claimedBefore, 'and did not touch the claim count');
  assert(!('cardsNeededToEnd' in s), 'the deleted plate pool must not be back on the state');
});

// Also reversed on 11 August (second revision) - see the tile-move check above.
check('a full purse clears two plates in one turn', () => {
  const { s, p } = spendState();
  p.board[3] = { type: 'blocked' };
  p.board[4] = { type: 'blocked' };
  removePlate(s, 3);
  assert(canRemovePlate(s), 'canRemovePlate agrees a second removal is on');
  removePlate(s, 4);
  eq(p.cupcakes, 9 - 2 * REMOVE_PLATE_CUPCAKE_COST, 'charged for both');
  eq(s.platesRemovedThisTurn, 2, 'both removals counted');
  eq(s.platesReturnedToBox, 2, 'and both plates left the game');
});

// The cupcake figure here tracks REMOVE_PLATE_CUPCAKE_COST and must stay one
// short of it: 2 was a refusal at the old price of 3 and is now the price itself.
check('a removal is refused on a tile, an empty cell, and at 1 cupcake', () => {
  const { s, p } = spendState(2, 1);
  p.board[0] = { colour: 'pink', ingredient: 'lemon' };
  p.board[1] = { type: 'blocked' };
  threw(() => removePlate(s, 0), 'No empty plate at that cell');
  threw(() => removePlate(s, 2), 'No empty plate at that cell');
  threw(() => removePlate(s, 1), 'Not enough cupcakes');
  assert(!canRemovePlate(s), 'canRemovePlate refuses at 1 cupcake');
  eq(p.cupcakes, 1, 'nothing was charged');
});

check('canRemovePlate is false when the board holds no plate', () => {
  const { s, p } = spendState();
  p.board[0] = { colour: 'pink', ingredient: 'lemon' };
  assert(!canRemovePlate(s), 'no plate, no removal');
});

check('a removal is refused outside the spend phase', () => {
  const { s, p } = spendState();
  p.board[3] = { type: 'blocked' };
  s.gamePhase = 'claim';
  assert(!canRemovePlate(s), 'canRemovePlate respects the phase');
  threw(() => removePlate(s, 3), 'Can only remove a plate in the spend phase');
});

// --- 5. THE SPENDS ARE INDEPENDENT -----------------------------------------

// (This used to be "a move, a removal AND A RESERVE can all happen on the same
// turn". The reserve is deleted - 11 August - so the independence claim is over
// the two board spends that are left. The allowances they used to hold are
// deleted too, on the same day; what the section still pins is that paying for
// one does not close the other.)
check('a move and a removal can both happen on the same turn', () => {
  const { s, p } = spendState(2, 9);
  p.board[0] = { colour: 'pink', ingredient: 'lemon' };
  p.board[7] = { type: 'blocked' };

  moveTile(s, 0, 24);
  removePlate(s, 7);

  eq(p.cupcakes, 9 - MOVE_TILE_CUPCAKE_COST - REMOVE_PLATE_CUPCAKE_COST,
    'both were charged');
  eq(s.tilesMovedThisTurn, 1, 'the move was counted');
  eq(s.platesRemovedThisTurn, 1, 'the removal was counted');
});

check('both counters reset on the next turn', () => {
  const { s, p } = spendState(2, 9);
  p.board[0] = { colour: 'pink', ingredient: 'lemon' };
  p.board[7] = { type: 'blocked' };
  moveTile(s, 0, 24);
  removePlate(s, 7);
  skipSpend(s);
  skipClaim(s);
  refill(s);
  eq(s.tilesMovedThisTurn, 0, 'the move count reset');
  eq(s.platesRemovedThisTurn, 0, 'the removal count reset');
  // The legacy mirrors have to reset with them, or the older bots that still
  // read them would sit out every turn after their first move of the game.
  eq(s.moveUsedThisTurn, false, 'the move mirror reset');
  eq(s.plateRemovedThisTurn, false, 'the removal mirror reset');
});

// --- 6. NOTHING BROKE IN A REAL GAME ---------------------------------------

function playOut(playerCount, maxSteps = 2000) {
  let s = newGame(playerCount);
  let steps = 0;
  while (!s.gameOver && steps < maxSteps) {
    switch (s.gamePhase) {
      case 'sweep': {
        if (s.bonusTileAvailable) {
          const b = bot.decideBonusTile(s);
          s = (b !== null && b !== undefined && s.market[b]) ? takeBonusTile(s, b) : declineBonusTile(s);
          break;
        }
        const d = bot.decideSweep(s);
        if (d) s = sweep(s, d.rowOrCol, d.isRow, d.declaration, d.declarationType);
        else s.gamePhase = 'place';
        break;
      }
      case 'place': {
        const x = bot.decideExtraTile(s);
        if (x !== null && x !== undefined) s = takeExtraTile(s, x);
        s = place(s, bot.decidePlacements(s));
        break;
      }
      case 'spend': {
        const m = bot.decideMove(s);
        if (m) s = moveTile(s, m.fromIndex, m.toIndex);
        const rp = bot.decideRemovePlate(s);
        if (rp !== null && rp !== undefined) s = removePlate(s, rp);
        s = skipSpend(s);
        break;
      }
      case 'claim': {
        const d = bot.decideClaim(s);
        s = (d && d.cardId) ? claim(s, d.cardId, d.removedBoardIndex, d.destination) : skipClaim(s);
        break;
      }
      case 'refill': s = refill(s); break;
    }
    steps++;
  }
  assert(s.gameOver, `the game reached an end condition within ${maxSteps} steps`);
  calculateFinalScores(s);
  return s;
}

check('full games still terminate at every player count', () => {
  for (const pc of [2, 3, 4]) {
    for (let g = 0; g < 5; g++) {
      const s = playOut(pc);
      assert(s.endGameReason, `${pc}p: an end reason was recorded`);
      for (const p of s.players) eq(p.board.length, 25, `${pc}p: board size`);
    }
  }
});

check('no game ever draws more tiles than the bag holds', () => {
  // The bag is a hard supply, and since 4 August the thing that ends the game is
  // being ASKED for tiles it has not got - so an over-draw would show up here
  // rather than as a mysteriously long game.
  for (const pc of [2, 4]) {
    for (let g = 0; g < 5; g++) {
      const s = playOut(pc);
      const onBoard = s.market.filter(t => t !== null).length;
      assert(s.bag.length >= 0, `${pc}p: the bag never goes negative`);
      assert(onBoard + s.bag.length <= TILE_BAG_SIZE,
        `${pc}p: tiles in play (${onBoard + s.bag.length}) exceed the bag (${TILE_BAG_SIZE})`);
    }
  }
});

check('nothing caps claiming, and no claim is ever refused for want of a plate', () => {
  // THIS REPLACES "claims exceed the plate clock ONLY during the finish-out
  // round", which pinned the pool overrun to at most playerCount - 1. There is no
  // pool and no overrun. What remains true, and is worth pinning in its place, is
  // the one structural cap that survives: ONE CLAIM PER TURN. Total claims can
  // therefore never exceed turns played, whatever else changes.
  for (const pc of [2, 3, 4]) {
    for (let g = 0; g < 5; g++) {
      const s = playOut(pc);
      assert(getTotalCardsClaimed(s) <= s.stats.turnsPlayed,
        `${pc}p: ${getTotalCardsClaimed(s)} claims over ${s.stats.turnsPlayed} turns breaks one-claim-per-turn`);
      eq(canClaimMore(s), true, `${pc}p: claiming is never closed off`);
    }
  }
});

check('a full board ends the game, and it is the ending that fires in real play', () => {
  // The headline of the 6 August change, asserted against real bot games rather
  // than a constructed state: the board fill is the clock, and it is expected to
  // end essentially every game (100% of 3,000 in simulation). Five games apiece is
  // not a rate measurement - it is a check that the OTHER conditions have not
  // quietly taken the job back.
  for (const pc of [2, 3, 4]) {
    for (let g = 0; g < 5; g++) {
      const s = playOut(pc);
      assert(s.endGameReason === 'boardFull' || s.endGameReason === 'marketTiles',
        `${pc}p: ended on '${s.endGameReason}', which is not one of the two live conditions`);
      if (s.endGameReason === 'boardFull') {
        assert(s.players.some(p => getValidPlacements(p.board).length === 0),
          `${pc}p: 'boardFull' was reported but no board is actually full`);
      }
    }
  }
});

// --- 7. THE TWO END CONDITIONS (6 August) ----------------------------------
//
// THE RULE, in full. The game ends when EITHER
//   1. a player's board is completely full - all 25 cells hold a tile or an empty
//      plate ('boardFull'), or
//   2. no tiles remain in the supply - the tile market is empty AND the bag is
//      empty ('marketTiles').
// Nothing else ends the game. As before, a trigger only ARMS the ending and play
// continues until the turn returns to the start player.
//
// WHAT THIS SECTION USED TO SAY, and why it is worth writing down rather than
// simply deleting: it pinned the 4 August tile-market rule, in which a pot of tea
// coming due against an already-empty bag ended the game as 'bagEmpty'. That
// ending is deleted. The pot now simply does not arrive - no flush, no cupcake,
// no card redeal, no ending - and play continues over a market that only thins
// from there. The half of the old rule that survives is the short deal: a bag
// that cannot fill 25 cells deals what it has and play carries on.
//
// Every state here is hand-built and driven through refill(), which is where the
// turn boundary lives (isTeaDue asks the question, endTurn resolves it against
// the bag, advanceToNextTurn owns both end conditions).

// Uncover every teapot cell, which is what arms isTeaDue - no two symbols share a
// row or column, so this is the only cheap way to reach the threshold by hand.
function armTeaTrigger(s) {
  for (const idx of TEAPOT_SYMBOL_CELLS) s.market[idx] = null;
}

check('a short bag deals what it has and the game does NOT end', () => {
  const s = newGame(2);
  // Empty the market so nothing is flushed back into the bag, then leave the bag
  // holding fewer tiles than the market has cells. Tea is due (an empty market
  // shows all five symbols), so the pot must brew across a market it cannot fill.
  const SHORT = 10;
  s.market = s.market.map(() => null);
  s.bag = s.bag.slice(0, SHORT);

  s.gamePhase = 'refill';
  refill(s);

  eq(s.market.filter(t => t !== null).length, SHORT, 'the pot dealt every tile the bag had');
  eq(s.bag.length, 0, 'and drained the bag doing it');
  eq(s.endTriggered, false, 'a short deal must NOT arm the ending');
  eq(s.endGameReason, null, 'and must not name a reason');
  eq(s.gameOver, false, 'play continues across the thinner market');
});

check('an empty bag alone is not an ending - nothing has asked it for tiles', () => {
  const s = newGame(2);
  s.bag = [];
  // Market untouched and full, so no teapot symbol shows and no refill is due.
  s.gamePhase = 'refill';
  refill(s);
  eq(s.endTriggered, false, 'a bag at zero is not itself an ending');
  eq(s.endGameReason, null, 'and names no reason');
});

check('a pot due against an empty bag is a NO-OP, not an ending', () => {
  // THE 6 AUGUST DELETION, asserted directly. This exact state used to arm
  // 'bagEmpty' and close the game out over the following round. Now: nothing
  // happens at all. No tiles dealt, no cupcake paid, no card row flushed, no
  // ending armed - and the turn passes on as an ordinary one.
  const s = newGame(2);
  s.bag = [];
  armTeaTrigger(s);
  s.currentPlayerIndex = 0;
  const cupcakesBefore = s.players[0].cupcakes;
  const rowBefore = s.cardMarket.map(c => c.id);

  s.gamePhase = 'refill';
  refill(s);

  eq(s.endTriggered, false, 'a pot that cannot be poured arms NOTHING');
  eq(s.endGameReason, null, 'and names no reason');
  eq(s.gameOver, false, 'and certainly does not end the game');
  eq(s.market.filter(t => t !== null).length, 25 - TEAPOT_SYMBOL_CELLS.length,
    'no tiles were dealt - the pot did not happen');
  eq(s.players[0].cupcakes, cupcakesBefore, 'no cupcake was paid');
  // THE END-OF-TURN CARD IS STILL DEALT (11 August): the deal used to be skipped
  // on any turn tea was due, because the pot flushed the row. No flush, no
  // exception - the row grows by one on this turn like any other, and the cards
  // that were on it are all still on it.
  eq(JSON.stringify(s.cardMarket.map(c => c.id).slice(0, rowBefore.length)), JSON.stringify(rowBefore),
    'and nothing was taken off the card row');
  eq(s.cardMarket.length, rowBefore.length + 1, 'the ordinary end-of-turn card was dealt on top');
  eq(s.currentPlayerIndex, 1, 'the turn simply passed on');

  // And it stays a no-op - a second dry turn does not accumulate into an ending.
  s.gamePhase = 'refill';
  refill(s);
  eq(s.gameOver, false, 'still running a turn later');
  eq(s.endTriggered, false, 'and still nothing armed');
});

check("END CONDITION 2: market and bag both empty arms 'marketTiles'", () => {
  const s = newGame(2);
  s.market = s.market.map(() => null);
  s.bag = [];
  s.currentPlayerIndex = 0;

  s.gamePhase = 'refill';
  refill(s);
  eq(s.endTriggered, true, 'the ending is armed');
  eq(s.endGameReason, 'marketTiles', 'and named for the supply, not the tea');
  eq(s.gameOver, false, 'but play is NOT stopped on the spot - the round finishes');
  // The incoming player has nothing to sweep, so they are dropped straight into
  // the spend phase: a turn with no tiles to take is not a turn with nothing to do.
  eq(s.gamePhase, 'spend', 'and the player can still spend and claim');

  s.gamePhase = 'refill';
  refill(s);
  eq(s.gameOver, true, 'the round completed, so the game is over');
  eq(s.endGameReason, 'marketTiles', 'and the reason is unchanged');
});

check("END CONDITION 1: a board filling arms 'boardFull' at once, not a lap later", () => {
  // THE CHANGE THAT MATTERS MOST TO GAME LENGTH. The old check asked only whether
  // the player ABOUT TO START had a full board, so a board that filled on its
  // owner's own turn went unnoticed until the turn came back round to them - a
  // whole extra lap of the table. Here seat 1 fills their own board and the
  // ending must be armed on the rotation out of that same turn.
  const s = newGame(3);
  s.currentPlayerIndex = 0;
  s.players[0].board = Array(25).fill(null).map(() => ({ type: 'blocked' }));

  s.gamePhase = 'refill';
  refill(s);
  eq(s.endTriggered, true, "the fill armed the ending on the turn it happened");
  eq(s.endGameReason, 'boardFull', 'and named the board');
  eq(s.currentPlayerIndex, 1, 'play passed on to seat 2');
  eq(s.gameOver, false, 'seats 2 and 3 are still owed their turns');

  s.gamePhase = 'refill'; refill(s);
  eq(s.gameOver, false, 'seat 3 is still owed a turn');
  s.gamePhase = 'refill'; refill(s);
  eq(s.gameOver, true, 'the round is complete, so the game is scored');
  eq(s.stats.turnsPlayed % 3, 0, 'a whole number of rounds was played');
});

check('a board that fills on the LAST seat of a round ends it there, with no extra lap', () => {
  // The ordering case the board-full check exists to get right: the fill happens
  // on the last seat's turn, so by the time it is noticed the turn has already
  // come back round to the start player and every seat has had the same number of
  // turns. Arming AFTER the equal-turns stop would cost this game a whole round.
  const s = newGame(3);
  s.gamePhase = 'refill'; refill(s);   // seat 1
  s.gamePhase = 'refill'; refill(s);   // seat 2
  eq(s.currentPlayerIndex, 2, 'seat 3 is up');

  s.players[2].board = Array(25).fill(null).map(() => ({ type: 'blocked' }));
  s.gamePhase = 'refill'; refill(s);
  eq(s.gameOver, true, 'the game closed on the same rotation');
  eq(s.endGameReason, 'boardFull', 'for the right reason');
  eq(s.stats.turnsPlayed, 3, 'exactly one round was played, not two');
});

// --- 7b. THE TRIM RULE (6 August) ------------------------------------------
//
// SWEEPING MORE THAN YOU CAN PLACE IS NO LONGER AN ENDING. Place all the tiles
// you sweep if you can; any you cannot place go back into the BAG, and the player
// keeps the rest of their turn - spend step and claim both. Which tiles are given
// up is the PLAYER'S choice: place() pairs placements[i] with pendingSweepTiles[i]
// and a null entry means "this one goes back".

// A place-phase state with `free` empty cells and `swept` tiles in hand.
function placeState(free, swept) {
  const s = newGame(2);
  s.currentPlayerIndex = 0;
  const p = s.players[0];
  p.board = Array(25).fill(null).map((_, i) => (i < free ? null : { type: 'blocked' }));
  s.gamePhase = 'place';
  s.pendingSweepTiles = Array.from({ length: swept }, (_, i) => ({
    colour: COLOURS[i % COLOURS.length], ingredient: 'lemon',
  }));
  return { s, p };
}

check('a sweep bigger than the board trims: the excess goes back into the BAG', () => {
  const { s, p } = placeState(1, 3);
  const bagBefore = s.bag.length;
  const keep = s.pendingSweepTiles[1];         // the player's choice, not the engine's
  const lost = [s.pendingSweepTiles[0], s.pendingSweepTiles[2]];

  eq(getSweepPlacementCount(s), 1, 'one cell means one tile placed');
  place(s, [null, 0, null]);

  eq(p.board[0], keep, 'the tile the PLAYER chose is the one on the board');
  eq(s.bag.length, bagBefore + 2, 'the other two went back into the bag');
  assert(lost.every(t => s.bag.includes(t)), 'and they are those two tiles, not copies');
  eq(s.endTriggered, false, 'trimming arms NO ending');
  eq(s.endGameReason, null, 'and names no reason');
  eq(s.gamePhase, 'spend', 'and the player keeps their spend and their claim');
  eq(s.trimmedSweeps, 1, 'the turn is counted as a trimmed one');
  eq(s.tilesReturnedToBag, 2, 'and the returned tiles are counted');
});

check('you must place all you can - placing fewer is illegal', () => {
  const { s } = placeState(2, 3);
  eq(getSweepPlacementCount(s), 2, 'two cells means two tiles placed');
  threw(() => place(s, [0, null, null]), 'Must place 2 of the 3 swept tiles');
  eq(s.gamePhase, 'place', 'and the refused placement committed nothing');
});

check('a full board sweeps, places nothing, and bins the lot without throwing', () => {
  // The zero-cell corner. Nearly unreachable in real play - a fill arms the
  // ending at once, so the player who filled does not get another turn on a full
  // board - but it must be legal rather than an exception.
  const { s, p } = placeState(0, 2);
  const bagBefore = s.bag.length;
  eq(getSweepPlacementCount(s), 0, 'no cells, no placements');
  place(s, [null, null]);
  eq(s.bag.length, bagBefore + 2, 'both tiles went back into the bag');
  eq(s.gamePhase, 'spend', 'and the turn continues to the spend step');
  eq(getValidPlacements(p.board).length, 0, 'the board is still full');
});

check('a sweep that fits is unaffected - no nulls, nothing returned', () => {
  const { s, p } = placeState(25, 3);
  const bagBefore = s.bag.length;
  eq(getSweepPlacementCount(s), 3, 'room for all three');
  place(s, [0, 1, 2]);
  eq(s.bag.length, bagBefore, 'nothing went back into the bag');
  eq(s.trimmedSweeps, 0, 'and the turn is not counted as trimmed');
  assert(p.board[0] && p.board[1] && p.board[2], 'all three landed');
});

check('a sweep is legal however full the board is', () => {
  // The other half of the deletion: the overflow check used to fire on the
  // transition INTO the place phase and end the game there. A sweep must now
  // simply leave the tiles in hand for the placement step to resolve.
  const s = newGame(2);
  s.currentPlayerIndex = 0;
  s.players[0].board = Array(25).fill(null).map(() => ({ type: 'blocked' }));
  const first = s.market.findIndex(t => t !== null);
  const tile = s.market[first];
  sweep(s, Math.floor(first / s.marketSize), true, tile.colour, 'colour');
  // A sweep that happens to clear its line pauses for the bonus tile; decline it
  // so the assertion below is about the placement transition either way.
  if (s.bonusTileAvailable) declineBonusTile(s);
  eq(s.gamePhase, 'place', 'the sweep landed in the place phase as normal');
  eq(s.endTriggered, false, 'and armed nothing');
  assert(s.pendingSweepTiles.length > 0, 'with the swept tiles still in hand to choose from');
});

// --- 8. THE EQUAL-TURNS RULE (4 August) ------------------------------------
//
// THE RULE. Every end condition ARMS the ending (endTriggered + endGameReason)
// and none of them stops play. The game runs on until the turn returns to
// startPlayerIndex, so when gameOver is finally set EVERY PLAYER HAS HAD EXACTLY
// THE SAME NUMBER OF TURNS, and only then are scores calculated.
//
// This replaced a pair of turn-boundary checks whose stated justification was
// equal turns and which did not deliver it (a boundary check firing in front of
// seat 3 of 4 left seats 1-2 a turn up), plus 'cardMarket', which used to stop
// play dead mid-round, plus board overflow, which ran its own countdown and gave
// the extra turns to everyone EXCEPT the triggering seat.
//
// So the assertion is made for EVERY reason that can be armed, each one armed on
// a NON-START seat - arming on seat 1 would make equal turns true by accident
// rather than by rule.
//
// 6 AUGUST: THERE ARE TWO REASONS NOW, and both are exercised here. The three
// that went - 'cardMarket', 'bagEmpty' and 'boardOverflow' - had an armer each in
// this table and all three are deleted with them. 'marketTiles' used to be
// excluded on the grounds that 'bagEmpty' always armed a turn ahead of it; with
// 'bagEmpty' gone it is genuinely reachable and is armed here like any other.

// One ARMER per end reason: a mutation that makes that condition fire on the turn
// of whoever is the current player when it runs. Kept as mutations rather than as
// state builders on purpose - a builder that just assigns currentPlayerIndex would
// TELEPORT the game into the middle of a round, so the seats it skipped would show
// as a turn short and the test would fail on its own setup rather than on the rule.
const END_REASON_ARMERS = {
  // END CONDITION 1. THE CURRENT player's own board is full, which is the case the
  // 6 August change exists for: it must arm on the rotation out of THIS turn
  // rather than waiting for the turn to come back round to them.
  boardFull(s) {
    s.players[s.currentPlayerIndex].board = Array(25).fill(null).map(() => ({ type: 'blocked' }));
  },
  // END CONDITION 2. No tiles anywhere: the market is bare and the bag is empty.
  // Armed by applyEmptyMarketRule at the start of the NEXT player's turn.
  marketTiles(s) {
    s.market = s.market.map(() => null);
    s.bag = [];
  },
};

// Play a game one turn at a time from its real opening seat, running `arm` the
// first time the turn reaches `seat`, and count whose turn each one was.
//
// refill() is the whole of a turn as far as this rule is concerned - the rotation
// and the only stop both live behind it - so nothing is lost by skipping the
// sweep, spend and claim steps. The counts come from observing currentPlayerIndex
// turn by turn rather than from dividing turnsPlayed by anything, so they are an
// independent reading rather than a restatement of the thing being checked.
function closeOutArmingAt(s, seat, arm, maxTurns = 40) {
  const turnsBySeat = Array(s.players.length).fill(0);
  let armed = false;
  let guard = 0;
  while (!s.gameOver && guard < maxTurns) {
    if (!armed && s.currentPlayerIndex === seat) {
      arm(s);
      armed = true;
    }
    turnsBySeat[s.currentPlayerIndex]++;
    s.gamePhase = 'refill';
    refill(s);
    guard++;
  }
  assert(armed, 'the end condition was never armed');
  assert(s.gameOver, `the game did not close out within ${maxTurns} turns`);
  return turnsBySeat;
}

for (const [reason, arm] of Object.entries(END_REASON_ARMERS)) {
  check(`'${reason}': every player has had the same number of turns when the game ends`, () => {
    for (const pc of [2, 3, 4]) {
      // Arm on every seat that is NOT the start player, since that is the case
      // the rule exists for - arming on seat 1 would come out level by accident.
      for (let seat = 1; seat < pc; seat++) {
        const where = `${pc}p armed on seat ${seat + 1}`;
        const s = newGame(pc);
        const turnsBySeat = closeOutArmingAt(s, seat, arm);
        eq(s.endGameReason, reason, `${where}: ended for the expected reason`);
        eq(s.gameOver, true, `${where}: the game is over`);
        eq(s.currentPlayerIndex, s.startPlayerIndex, `${where}: closed on the start player`);
        eq(Math.min(...turnsBySeat), Math.max(...turnsBySeat),
          `${where}: turns per seat ${JSON.stringify(turnsBySeat)}`);
        eq(s.stats.turnsPlayed % pc, 0,
          `${where}: ${s.stats.turnsPlayed} turns is not a whole number of rounds`);
      }
    }
  });
}

check('the end is a TRIGGER, not a stop - armed turns still get played', () => {
  // The specific behaviour that changed on 4 August: an ending used to stop play
  // the instant it fired, mid-round. Armed on seat 2 of a 4-player game, seats 3
  // and 4 must each still get the turn they were owed.
  const s = newGame(4);
  s.gamePhase = 'refill';
  refill(s);                       // seat 1 plays a plain turn
  eq(s.currentPlayerIndex, 1, 'the turn is now seat 2');

  END_REASON_ARMERS.boardFull(s);
  s.gamePhase = 'refill';
  refill(s);
  eq(s.endTriggered, true, 'armed on seat 2');
  eq(s.endGameReason, 'boardFull', 'and named the full board');
  eq(s.gameOver, false, 'but seats 3 and 4 have not played this round yet');
  eq(s.currentPlayerIndex, 2, 'and the turn passed on normally');

  s.gamePhase = 'refill'; refill(s);
  eq(s.gameOver, false, 'seat 4 is still owed a turn');
  s.gamePhase = 'refill'; refill(s);
  eq(s.gameOver, true, 'the round is complete, so the game is scored');
  eq(s.stats.turnsPlayed % 4, 0, 'a whole number of rounds was played');
});

check('claiming is never refused - empty plates are unlimited', () => {
  // 6 AUGUST. This block replaces two tests that pinned the plate pool: that a
  // spent pool refused a claim while the ending was unarmed, and that it stopped
  // refusing once the ending was armed. There is no pool. canClaimMore survives
  // as a hook for a future claim limit and is unconditionally true - before the
  // ending is armed, after it is armed, and however many cards have been taken.
  const s = newGame(4);
  eq(canClaimMore(s), true, 'open at the start of the game');

  // Far more claims than the deleted pool would ever have allowed (it was 6 per
  // player, so 24 at this count).
  for (let i = 0; i < 40; i++) {
    s.players[i % s.playerCount].claimedCards.push((i % 50) + 1);
  }
  eq(canClaimMore(s), true, 'still open after 40 claims');

  END_REASON_ARMERS.boardFull(s);
  s.gamePhase = 'refill';
  refill(s);
  eq(s.endTriggered, true, 'the ending is armed');
  eq(canClaimMore(s), true, 'and claiming is open through the finish-out round too');
});

check('a real claim goes through with no plate supply behind it', () => {
  // canClaimMore returning true is not the same as claim() accepting - the guard
  // that read it lived inside claim() and had its own error message. Drive an
  // actual claim to be sure the refusal is genuinely gone.
  const s = newGame(2);
  s.currentPlayerIndex = 0;
  const p = s.players[0];
  // Pretend the whole table has claimed a great many cards already.
  for (let i = 0; i < 40; i++) s.players[i % 2].claimedCards.push((i % 50) + 1);

  const card = s.cardMarket[0];
  // Lay the card's pattern out on the top-left of an otherwise empty board.
  p.board = Array(25).fill(null);
  const cells = [];
  for (let i = 0; i < card.pattern.length; i++) {
    if (card.pattern[i] === null) continue;
    const idx = Math.floor(i / 3) * 5 + (i % 3);
    p.board[idx] = { colour: card.pattern[i], ingredient: 'lemon' };
    cells.push(idx);
  }

  s.gamePhase = 'claim';
  claim(s, card.id, cells[0], { type: 'crumb' });
  assert(p.claimedCards.includes(card.id), 'the card was claimed');
  assert(p.board[cells[0]] && p.board[cells[0]].type === 'blocked',
    'and an empty plate landed on the cell, from an unlimited supply');
});

check('real bot games also finish on a whole number of rounds', () => {
  // The hand-built states above arm one condition each; a real game can arm
  // several in its final round and reaches them through the actual turn structure,
  // so the invariant is worth re-checking against play rather than construction.
  for (const pc of [2, 3, 4]) {
    for (let g = 0; g < 5; g++) {
      const s = playOut(pc);
      assert(s.endTriggered, `${pc}p: a finished game must have armed an ending`);
      eq(s.stats.turnsPlayed % pc, 0,
        `${pc}p: ${s.stats.turnsPlayed} turns is not a whole number of rounds (${s.endGameReason})`);
      eq(s.currentPlayerIndex, s.startPlayerIndex, `${pc}p: closed on the start player`);
    }
  }
});

// ---------------------------------------------------------------------------

console.log(`\nRule tests for the 3 August change set v2, carried forward to 4 August\n`);
console.log(`  passed: ${passed}`);
console.log(`  failed: ${failures.length}`);
for (const f of failures) console.log(`    FAIL  ${f}`);
if (failures.length) process.exitCode = 1;
