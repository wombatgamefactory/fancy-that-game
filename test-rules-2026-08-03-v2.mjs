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
// live suite, so the day's changes were folded into it rather than starting a
// third file:
//   - the tile bag went BACK to 4 copies (section 1, which asserted 5 and 125);
//   - a bag that cannot fill the market no longer ends the game (section 7);
//   - the end is a TRIGGER, not a stop: play finishes the round so every player
//     has had the same number of turns (section 8).
// The ingredient objectives were deleted the same day. Nothing is removed from
// this file for that, because this file never tested them - their tests were in
// the superseded first file and went with it.
//
// SCOPE. This covers what the changes touched - the bag, the four prices, the
// removal action and the allowances around it, the tile-market end rule and the
// equal-turns rule - plus the invariants they could plausibly have broken (the
// end conditions, and the claim clock NOT moving when plates leave the board).
// Everything else the first file asserts is untouched and is not duplicated here.
import {
  createGame, sweep, takeBonusTile, declineBonusTile, takeExtraTile, canBuyExtraTile,
  place, claim, skipClaim, skipSpend, moveTile, removePlate, canRemovePlate,
  getMoveCost, reserveCard, canReserveCard, refill, calculateFinalScores,
  getTotalCardsClaimed, getValidPlacements, canClaimMore,
  MOVE_TILE_CUPCAKE_COST, EXTRA_TILE_CUPCAKE_COST, REMOVE_PLATE_CUPCAKE_COST,
  RESERVE_CUPCAKE_COST, EMPTY_PLATES_PER_PLAYER,
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

// --- 1. THE TILE BAG: 4 COPIES, 100 TILES ----------------------------------
//
// 4 AUGUST: back from 5 copies / 125 tiles. This block asserted the 125-tile bag
// from the 3 August set; a 4-player game played to completion on 3 August never
// came close to running out, so the extra 25 were buying nothing.
//
// THE LITERALS BELOW ARE DELIBERATE, AND THIS IS THE ONLY PLACE THEY BELONG. A
// conformance test's whole job is to fail when the constant moves, so pinning 4
// and 100 by hand is the point here. Everywhere else - report strings, skew
// baselines, UI copy - must read TILE_COPIES / TILE_BAG_SIZE, which is the rule
// that stopped being followed twice and left "125" printed under a 100-tile bag.

check('the bag holds 4 copies of each of the 25 colour/ingredient combinations', () => {
  eq(TILE_COPIES, 4, 'copies per combination');
  eq(COLOURS.length, 5, 'colours');
  eq(INGREDIENTS.length, 5, 'ingredients');
  eq(generateTileTypes().length, 25, 'distinct tile types');
  eq(TILE_BAG_SIZE, 100, 'derived bag size');

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

check('the cupcake menu is priced 1 / 1 / 2 / 3', () => {
  eq(MOVE_TILE_CUPCAKE_COST, 1, 'move a tile');
  eq(RESERVE_CUPCAKE_COST, 1, 'reserve a card');
  eq(EXTRA_TILE_CUPCAKE_COST, 2, 'take an extra tile');
  eq(REMOVE_PLATE_CUPCAKE_COST, 3, 'remove an empty plate');
});

check('an extra tile now charges 2 cupcakes, not 1', () => {
  const s = newGame(2);
  const p = s.players[0];
  s.currentPlayerIndex = 0;
  s.gamePhase = 'place';
  s.pendingSweepTiles = [];
  p.cupcakes = 4;
  const idx = s.market.findIndex(t => t !== null);
  assert(canBuyExtraTile(s), 'should be able to buy with 4 cupcakes');
  takeExtraTile(s, idx);
  eq(p.cupcakes, 4 - EXTRA_TILE_CUPCAKE_COST, 'charged the extra-tile price');
});

check('an extra tile is refused at 1 cupcake, which used to be enough', () => {
  const s = newGame(2);
  const p = s.players[0];
  s.currentPlayerIndex = 0;
  s.gamePhase = 'place';
  s.pendingSweepTiles = [];
  p.cupcakes = 1;
  assert(!canBuyExtraTile(s), 'canBuyExtraTile should refuse at 1 cupcake');
  threw(() => takeExtraTile(s, s.market.findIndex(t => t !== null)), 'Not enough cupcakes');
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

check('one tile move per turn', () => {
  const { s, p } = spendState();
  p.board[0] = { colour: 'pink', ingredient: 'lemon' };
  p.board[1] = { colour: 'blue', ingredient: 'lemon' };
  moveTile(s, 0, 24);
  eq(p.cupcakes, 9 - MOVE_TILE_CUPCAKE_COST, 'charged the tile price');
  threw(() => moveTile(s, 1, 23), 'one tile per turn');
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

check('removing a plate does NOT move the claim clock in either direction', () => {
  // The whole meaning of "it does not go back into circulation": the end
  // condition counts claims made, so retiring plates can neither buy an extra
  // claim nor shorten the game.
  const { s, p } = spendState();
  const clockBefore = s.cardsNeededToEnd;
  const claimedBefore = getTotalCardsClaimed(s);
  p.board[3] = { type: 'blocked' };
  p.board[4] = { type: 'blocked' };
  removePlate(s, 3);
  eq(s.cardsNeededToEnd, clockBefore, 'the target is unchanged');
  eq(getTotalCardsClaimed(s), claimedBefore, 'the claim count is unchanged');
  eq(s.cardsNeededToEnd, EMPTY_PLATES_PER_PLAYER * s.playerCount, 'still plates x players');
});

check('one plate removal per turn', () => {
  const { s, p } = spendState();
  p.board[3] = { type: 'blocked' };
  p.board[4] = { type: 'blocked' };
  removePlate(s, 3);
  threw(() => removePlate(s, 4), 'one empty plate per turn');
  assert(!canRemovePlate(s), 'canRemovePlate agrees the allowance is spent');
});

check('a removal is refused on a tile, an empty cell, and at 2 cupcakes', () => {
  const { s, p } = spendState(2, 2);
  p.board[0] = { colour: 'pink', ingredient: 'lemon' };
  p.board[1] = { type: 'blocked' };
  threw(() => removePlate(s, 0), 'No empty plate at that cell');
  threw(() => removePlate(s, 2), 'No empty plate at that cell');
  threw(() => removePlate(s, 1), 'Not enough cupcakes');
  assert(!canRemovePlate(s), 'canRemovePlate refuses at 2 cupcakes');
  eq(p.cupcakes, 2, 'nothing was charged');
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

// --- 5. THE ALLOWANCES ARE INDEPENDENT -------------------------------------

check('a move, a removal and a reserve can all happen on the same turn', () => {
  const { s, p } = spendState(2, 9);
  p.board[0] = { colour: 'pink', ingredient: 'lemon' };
  p.board[7] = { type: 'blocked' };
  const cardId = s.cardMarket[0].id;

  moveTile(s, 0, 24);
  removePlate(s, 7);
  assert(canReserveCard(s), 'the reserve is still available after the other two');
  reserveCard(s, cardId);

  eq(p.cupcakes, 9 - MOVE_TILE_CUPCAKE_COST - REMOVE_PLATE_CUPCAKE_COST - RESERVE_CUPCAKE_COST,
    'all three were charged');
  assert(s.moveUsedThisTurn, 'move allowance spent');
  assert(s.plateRemovedThisTurn, 'removal allowance spent');
});

check('both allowances reset on the next turn', () => {
  const { s, p } = spendState(2, 9);
  p.board[0] = { colour: 'pink', ingredient: 'lemon' };
  p.board[7] = { type: 'blocked' };
  moveTile(s, 0, 24);
  removePlate(s, 7);
  skipSpend(s);
  skipClaim(s);
  refill(s);
  eq(s.moveUsedThisTurn, false, 'the move allowance reset');
  eq(s.plateRemovedThisTurn, false, 'the removal allowance reset');
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
        const rc = bot.decideReserve(s);
        if (rc !== null && rc !== undefined) s = reserveCard(s, rc);
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

check('claims exceed the plate clock ONLY during the finish-out round', () => {
  // This assertion used to be the flat "claims never exceed the plate clock",
  // which was right when the pool was an inventory. Since the 4 August
  // correction the pool is only a clock: the final round claims on from an
  // unlimited supply, so an overrun is legal - but ONLY a final round's worth of
  // one. A game can play at most playerCount - 1 further turns after the pool
  // empties, and the one-claim-per-turn rule caps each of them at a single card,
  // so anything above that ceiling means the ending failed to arm when it should
  // have and the clock has stopped working.
  for (const pc of [2, 3, 4]) {
    for (let g = 0; g < 5; g++) {
      const s = playOut(pc);
      const overrun = getTotalCardsClaimed(s) - s.cardsNeededToEnd;
      assert(overrun <= pc - 1,
        `${pc}p: ${getTotalCardsClaimed(s)} claims is ${overrun} past a ${s.cardsNeededToEnd} clock, ` +
        `more than the ${pc - 1} turns a finish-out round can add (${s.endGameReason})`);
    }
  }
});

// --- 7. THE TILE-MARKET END RULE (4 August) --------------------------------
//
// THE RULE. A bag that cannot fill all 25 market cells does NOT end the game: the
// fresh pot deals out as many tiles as remain and play continues across a partly
// filled market. The end fires only when a refill is NEEDED and the bag is
// ALREADY empty - the pot of tea with nothing left to pour.
//
// 'bagEmpty' therefore MEANS THAT, and no longer means "the bag hit zero". The
// two halves are tested apart, because the old rule would pass a test that only
// checked the ending eventually happens.
//
// Every state here is hand-built and driven through refill(), which is where the
// rule lives (isTeaDue asks the question, endTurn resolves it against the bag).

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

check("a refill NEEDED against an already-empty bag ends the game as 'bagEmpty'", () => {
  const s = newGame(2);
  s.bag = [];
  armTeaTrigger(s);
  s.currentPlayerIndex = 0;

  s.gamePhase = 'refill';
  refill(s);
  eq(s.endTriggered, true, 'the ending is armed');
  eq(s.endGameReason, 'bagEmpty', 'and named for the tea that could not be poured');
  eq(s.gameOver, false, 'but play is NOT stopped on the spot - the round finishes');
  // NO POT IS POURED on that firing: no tiles are dealt, so the market is exactly
  // as the trigger found it.
  eq(s.market.filter(t => t !== null).length, 25 - TEAPOT_SYMBOL_CELLS.length,
    'no tiles were dealt - the refresh did not happen');

  // The second seat finishes the round, and the game is scored there.
  s.gamePhase = 'refill';
  refill(s);
  eq(s.gameOver, true, 'the round completed, so the game is over');
  eq(s.endGameReason, 'bagEmpty', 'and the reason is unchanged');
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
// rather than by rule. 'marketTiles' is not among them and cannot be: reaching an
// empty market with an empty bag necessarily passes through a due refill against
// that same empty bag one turn earlier, so 'bagEmpty' always arms first and
// triggerEndGame keeps the first reason. It is defence in depth, as the engine
// says, not a path.

// One ARMER per end reason: a mutation that makes that condition fire on the turn
// of whoever is the current player when it runs. Kept as mutations rather than as
// state builders on purpose - a builder that just assigns currentPlayerIndex would
// TELEPORT the game into the middle of a round, so the seats it skipped would show
// as a turn short and the test would fail on its own setup rather than on the rule.
const END_REASON_ARMERS = {
  // The table's empty plate pool is spent. Card ids are real ones so the final
  // scoring can look them up.
  cardMarket(s) {
    for (let i = 0; i < s.cardsNeededToEnd; i++) {
      s.players[i % s.playerCount].claimedCards.push((i % 50) + 1);
    }
  },
  // A refill is needed and the bag is already empty.
  bagEmpty(s) {
    s.bag = [];
    armTeaTrigger(s);
  },
  // The INCOMING player's board has no free cell, so this fires on the rotation
  // out of the current player's turn rather than during it.
  boardFull(s) {
    const incoming = s.players[(s.currentPlayerIndex + 1) % s.playerCount];
    incoming.board = Array(25).fill(null).map(() => ({ type: 'blocked' }));
  },
  // A board that cannot accept the tiles just swept. Armed by walking the state
  // through place(), which is where the overflow check lives; place() leaves the
  // turn in 'refill' with the turn itself still unplayed, so the driver below
  // still counts it as this seat's.
  boardOverflow(s) {
    const p = s.players[s.currentPlayerIndex];
    p.board = Array(25).fill(null).map((_, i) => (i === 0 ? null : { type: 'blocked' }));
    s.gamePhase = 'place';
    s.pendingSweepTiles = [
      { colour: 'pink', ingredient: 'lemon' },
      { colour: 'blue', ingredient: 'lemon' },
    ];
    place(s, []);
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
  // The specific behaviour that changed: 'cardMarket' used to end the game the
  // instant the pool ran out, mid-round. Armed on seat 2 of a 4-player game, seats
  // 3 and 4 must each still get the turn they were owed.
  const s = newGame(4);
  s.gamePhase = 'refill';
  refill(s);                       // seat 1 plays a plain turn
  eq(s.currentPlayerIndex, 1, 'the turn is now seat 2');

  END_REASON_ARMERS.cardMarket(s);
  s.gamePhase = 'refill';
  refill(s);
  eq(s.endTriggered, true, 'armed on seat 2');
  eq(s.endGameReason, 'cardMarket', 'and named the plate pool');
  eq(s.gameOver, false, 'but seats 3 and 4 have not played this round yet');
  eq(s.currentPlayerIndex, 2, 'and the turn passed on normally');

  s.gamePhase = 'refill'; refill(s);
  eq(s.gameOver, false, 'seat 4 is still owed a turn');
  s.gamePhase = 'refill'; refill(s);
  eq(s.gameOver, true, 'the round is complete, so the game is scored');
  eq(s.stats.turnsPlayed % 4, 0, 'a whole number of rounds was played');
});

check('the spent plate pool stops gating claims once the ending is armed', () => {
  // 4 AUGUST CORRECTION. The pool is the CLOCK, not an inventory: emptying it
  // triggers the ending, and during the round that is then finished out a player
  // may still complete a card, taking extra plates from an unlimited supply.
  //
  // WHY IT MATTERS, and why it is asserted rather than assumed: 'cardMarket' is
  // the commonest ending and it fires exactly when the pool empties, so the old
  // behaviour left the last round of roughly half of all games with no claims
  // possible - and only for the seats that had not yet played, which is the same
  // seat unfairness the finish-the-round rule exists to remove.
  const s = newGame(4);
  eq(canClaimMore(s), true, 'claims are open at the start of the game');

  END_REASON_ARMERS.cardMarket(s);
  eq(getTotalCardsClaimed(s), s.cardsNeededToEnd, 'the pool is exactly spent');
  eq(s.endTriggered, false, 'nothing is armed until the turn ends');
  eq(canClaimMore(s), false, 'and while unarmed, a spent pool DOES refuse a claim');

  s.gamePhase = 'refill';
  refill(s);
  eq(s.endTriggered, true, 'ending the turn arms it');
  eq(canClaimMore(s), true, 'and now the pool no longer gates claiming');

  // The gate must stay open for the WHOLE finish-out round, not just one turn,
  // and must not care how far past the pool the total has run.
  s.players[0].claimedCards.push(7, 8, 9);
  assert(getTotalCardsClaimed(s) > s.cardsNeededToEnd, 'the total has run past the pool');
  eq(canClaimMore(s), true, 'claiming past the pool stays legal during the final round');

  s.gamePhase = 'refill'; refill(s);
  eq(canClaimMore(s), true, 'still open on the next seat of the same round');
});

check('an ending armed by something OTHER than the pool also frees the plates', () => {
  // The unlimited supply is a property of the FINAL ROUND, not of the plate
  // ending. A game that armed on an empty bag can still empty its pool during the
  // round that follows, and must not lock claiming when it does.
  const s = newGame(4);
  END_REASON_ARMERS.bagEmpty(s);
  s.gamePhase = 'refill';
  refill(s);
  eq(s.endGameReason, 'bagEmpty', 'armed on the bag, not the pool');

  // Now spend the pool dry mid-finale.
  for (let i = 0; i < s.cardsNeededToEnd; i++) {
    s.players[i % s.playerCount].claimedCards.push((i % 50) + 1);
  }
  eq(canClaimMore(s), true, 'the pool being spent mid-finale does not close the gate');
  eq(s.endGameReason, 'bagEmpty', 'and it does not steal the end reason either');
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
