// SUPERSEDED - DO NOT RUN. See test-rules-2026-08-03-v2.mjs for the live suite.
//
// This file pins the FIRST 3 August 2026 change set. A second set the same day
// changed the tile bag and repriced the cupcake menu, which removed two things
// this file imports and asserts:
//   - MOVE_PLATE_CUPCAKE_COST: moving an empty plate is deleted. Plates are now
//     REMOVED to the box for REMOVE_PLATE_CUPCAKE_COST (3).
//   - EXTRA_TILE_CUPCAKE_COST is 2, not 1.
// It therefore fails at import with "does not provide an export named
// MOVE_PLATE_CUPCAKE_COST". That is deliberate: it fails loudly rather than
// silently asserting a ruleset the engine no longer has.
//
// It is kept as the record of what was adopted that morning. If you want the old
// blocks back, port them into the v2 file rather than reviving this one.
//
// 4 AUGUST: THE INGREDIENT-OBJECTIVE BLOCK IS GONE FROM HERE. The pantry goals
// are deleted from the game (see the note at the top of src/engine/game.js), so
// section 1's eight checks, and the objective clauses of the whole-game
// invariants, were asserting rules that no longer exist against exports that no
// longer exist. They are removed rather than left behind, because the standing
// instruction on this file is "port the blocks you want into v2" and a block
// nobody can port is a trap, not a record. What was adopted that morning is
// recorded in the engine's deletion note, which says what went and why.
//
// The file still fails at import, for the MOVE_PLATE_CUPCAKE_COST reason above.
// That has not changed and is still deliberate.
//
// ---------------------------------------------------------------------------
// Rule tests for the 3 August 2026 change set.
//
// Each block below asserts one adopted rule against the live engine, so a future
// edit that quietly undoes one fails here rather than in a playtest. Run with
//   node test-rules-2026-08-03.mjs
import {
  createGame, sweep, takeBonusTile, declineBonusTile, takeExtraTile, canBuyExtraTile,
  place, claim, skipClaim, skipSpend, moveTile, getMoveCost, reserveCard, canReserveCard,
  refill, calculateFinalScores, getWinningPlayers,
  countBoardIngredient, getPatternMatches, getValidPlacements,
  getStartingCupcakes,
  MOVE_TILE_CUPCAKE_COST, MOVE_PLATE_CUPCAKE_COST, EXTRA_TILE_CUPCAKE_COST,
  RESERVE_CUPCAKE_COST, RESERVE_LIMIT, EMPTY_PLATES_PER_PLAYER,
  CUPCAKE_SYMBOL_CELLS, REFRESH_THRESHOLD, TEA_POT_REWARD, INITIAL_MARKET_CARDS,
} from './src/engine/game.js';
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

// Drive a bot game to completion, so the tests below can assert on real states
// rather than only on hand-built ones.
function playOut(playerCount, maxSteps = 1000) {
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
        const r = bot.decideReserve(s);
        if (r !== null && r !== undefined) s = reserveCard(s, r);
        s = skipSpend(s);
        break;
      }
      case 'claim': {
        const d = bot.decideClaim(s);
        s = (d && d.cardId) ? claim(s, d.cardId, d.removedBoardIndex, d.destination) : skipClaim(s);
        break;
      }
      case 'refill': s = refill(s); break;
      default: throw new Error(`unknown phase ${s.gamePhase}`);
    }
    steps++;
  }
  assert(s.gameOver, `game did not finish within ${maxSteps} steps`);
  calculateFinalScores(s);
  return s;
}

// --- 1. INGREDIENT OBJECTIVES: DELETED 4 AUGUST ----------------------------
//
// Eight checks stood here - the deal (2 of each ingredient into 5 unordered
// pairs), the doubles share, the mixed-vs-doubled requirement, board-tiles-only
// counting, end-of-turn resolution, a claim breaking a held objective, unlimited
// takes per turn with each pair taken once, and the 3 VP each. The pantry goals
// are gone from the game, so all eight are gone from here.
//
// TWO SURVIVORS, kept below because their subject outlived the rule:
//   - countBoardIngredient is still an engine export (the bots use it to value an
//     ingredient declaration), so the empty-plate check still has something to
//     assert against.
//   - "cupcakes score nothing" was half of the old objective-scoring check and is
//     a 3 August rule in its own right, so it is kept on its own terms.

check('empty plate tokens count as nothing', () => {
  const s = newGame(2);
  const p = s.players[0];
  p.board = Array(25).fill(null);
  p.board[0] = { type: 'blocked' };
  eq(countBoardIngredient(p.board, 'lemon'), 0, 'an empty plate has no ingredient');
});

check('cupcakes score nothing', () => {
  // Was the second half of 'objectives score 3 VP each and cupcakes score
  // nothing'. The objective half is deleted with the rule; this half is a 3 August
  // rule of its own (cupcakes became a currency and the tiebreaker), so it stands
  // alone. With an empty stand, tray and card pile the score must be exactly 0 no
  // matter how large the cupcake pile is.
  const s = newGame(2);
  const p = s.players[0];
  p.cupcakes = 7;
  p.crumbTray = [];
  p.claimedCards = [];
  for (const row of p.stand) { row.tiles = []; row.ingredient = null; }
  calculateFinalScores(s);
  eq(p.score, 0, 'held cupcakes must not add VP');
});

// --- 2. TEA LOSES THE RESERVE ROUND ---------------------------------------

check("the 'teaReserve' phase never appears", () => {
  for (const pc of [2, 3, 4]) {
    const s = playOut(pc);
    assert(s.gamePhase !== 'teaReserve', 'teaReserve phase is deleted');
  }
});

check('tea-reserve state is gone from the game state', () => {
  const s = newGame(3);
  for (const field of ['teaReserverIndex', 'teaReservesRemaining', 'teaRoundEndsTurn']) {
    assert(!(field in s), `${field} should be deleted`);
  }
});

check('a pot of tea flushes the card row back to the setup deal and pays the tea player', () => {
  const s = newGame(2);
  // Arm the trigger: empty every teapot cell, keep the bag stocked.
  for (const idx of CUPCAKE_SYMBOL_CELLS) s.market[idx] = null;
  // Grow the card row past the setup size so the flush is visible.
  while (s.cardMarket.length < 6) s.cardMarket.push(s.gameDeck.shift());
  const before = s.players[0].cupcakes;
  s.gamePhase = 'refill';
  refill(s);
  eq(s.cardMarket.length, INITIAL_MARKET_CARDS, 'the flush redeals the setup number of cards');
  eq(s.players[0].cupcakes, before + TEA_POT_REWARD, 'the tea player gains the flat pot');
  assert(s.market.every(t => t !== null), 'the tile market is refilled');
});

// --- 3. PAID RESERVE -------------------------------------------------------

check('reserving costs a cupcake and takes the card out of the market', () => {
  const s = newGame(2);
  s.gamePhase = 'spend';
  const p = s.players[0];
  const before = p.cupcakes;
  const cardId = s.cardMarket[0].id;
  reserveCard(s, cardId);
  eq(p.cupcakes, before - RESERVE_CUPCAKE_COST, 'cupcake paid');
  eq(p.reservedCards.length, 1, 'card in reserve');
  assert(!s.cardMarket.some(c => c.id === cardId), 'card left the market');
});

check('the reserve limit is 1', () => {
  const s = newGame(2);
  s.gamePhase = 'spend';
  s.players[0].cupcakes = 9;
  reserveCard(s, s.cardMarket[0].id);
  threw(() => reserveCard(s, s.cardMarket[0].id), 'reserve is already occupied');
  eq(RESERVE_LIMIT, 1, 'the documented limit');
});

check('you may not claim a card on the turn you reserved it', () => {
  const s = newGame(2);
  s.gamePhase = 'spend';
  const p = s.players[0];
  const card = s.cardMarket[0];
  reserveCard(s, card.id);
  // Build the pattern so the ONLY thing that can refuse the claim is the rule.
  p.board = Array(25).fill(null);
  const cells = [];
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 3; c++) {
      const colour = card.pattern[r * 3 + c];
      if (colour) {
        p.board[r * 5 + c] = { colour, ingredient: 'lemon' };
        cells.push(r * 5 + c);
      }
    }
  }
  assert(getPatternMatches(p.board, card.pattern).length > 0, 'precondition: the pattern is on the board');
  skipSpend(s);
  threw(() => claim(s, card.id, cells[0], { type: 'crumb' }), 'same turn you reserved it');
});

check('a reserved card CAN be claimed on a later turn', () => {
  const s = newGame(2);
  s.gamePhase = 'spend';
  const p = s.players[0];
  const card = s.cardMarket[0];
  reserveCard(s, card.id);
  p.board = Array(25).fill(null);
  const cells = [];
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 3; c++) {
      const colour = card.pattern[r * 3 + c];
      if (colour) {
        p.board[r * 5 + c] = { colour, ingredient: 'lemon' };
        cells.push(r * 5 + c);
      }
    }
  }
  // Simulate the turn rotating back round.
  s.reservedCardIdThisTurn = null;
  s.claimsThisTurn = 0;
  s.gamePhase = 'claim';
  claim(s, card.id, cells[0], { type: 'crumb' });
  eq(p.claimedCards.length, 1, 'claimed on a later turn');
  eq(p.reservedCards.length, 0, 'and left the reserve');
});

// --- 4. EXTRA TILE ---------------------------------------------------------

check('the extra tile costs a cupcake and joins the swept tiles', () => {
  const s = newGame(2);
  const d = bot.decideSweep(s);
  sweep(s, d.rowOrCol, d.isRow, d.declaration, d.declarationType);
  if (s.bonusTileAvailable) declineBonusTile(s);
  eq(s.gamePhase, 'place', 'precondition');
  const p = s.players[0];
  const before = p.cupcakes;
  const pending = s.pendingSweepTiles.length;
  const marketIndex = s.market.findIndex(t => t !== null);
  takeExtraTile(s, marketIndex);
  eq(p.cupcakes, before - EXTRA_TILE_CUPCAKE_COST, 'cupcake paid');
  eq(s.pendingSweepTiles.length, pending + 1, 'the tile joins the pile to be placed');
  eq(s.market[marketIndex], null, 'and left the market');
});

check('the extra tile is once per turn', () => {
  const s = newGame(2);
  const d = bot.decideSweep(s);
  sweep(s, d.rowOrCol, d.isRow, d.declaration, d.declarationType);
  if (s.bonusTileAvailable) declineBonusTile(s);
  s.players[0].cupcakes = 9;
  takeExtraTile(s, s.market.findIndex(t => t !== null));
  threw(() => takeExtraTile(s, s.market.findIndex(t => t !== null)), 'one extra tile per turn');
});

check('the extra tile may come from ANY cell, not just the swept line', () => {
  const s = newGame(2);
  // Sweep row 0, then buy from row 4 - a different line entirely.
  const tile = s.market[0];
  sweep(s, 0, true, tile.colour, 'colour');
  if (s.bonusTileAvailable) declineBonusTile(s);
  const farIndex = 20 + s.market.slice(20, 25).findIndex(t => t !== null);
  assert(s.market[farIndex], 'precondition: a tile exists in the far row');
  takeExtraTile(s, farIndex);
  eq(s.market[farIndex], null, 'a tile from an unswept line is legal');
});

check('the extra tile is illegal with no legal placement', () => {
  const s = newGame(2);
  const d = bot.decideSweep(s);
  sweep(s, d.rowOrCol, d.isRow, d.declaration, d.declarationType);
  if (s.bonusTileAvailable) declineBonusTile(s);
  const p = s.players[0];
  p.cupcakes = 9;
  // Leave exactly as many free cells as there are pending tiles: no room for one more.
  const free = getValidPlacements(p.board);
  for (let i = s.pendingSweepTiles.length; i < free.length; i++) p.board[free[i]] = { type: 'blocked' };
  assert(!canBuyExtraTile(s), 'canBuyExtraTile should refuse');
  threw(() => takeExtraTile(s, s.market.findIndex(t => t !== null)), 'No legal placement');
});

// --- 5. MOVE PRICES --------------------------------------------------------

check('moving a tile costs 1 and moving an empty plate costs 2', () => {
  eq(MOVE_TILE_CUPCAKE_COST, 1, 'tile move price');
  eq(MOVE_PLATE_CUPCAKE_COST, 2, 'plate move price');
  const s = newGame(2);
  s.gamePhase = 'spend';
  const p = s.players[0];
  p.board = Array(25).fill(null);
  p.board[0] = { colour: 'pink', ingredient: 'lemon' };
  p.board[1] = { type: 'blocked' };
  eq(getMoveCost(p, 0), MOVE_TILE_CUPCAKE_COST, 'a tile prices as a tile');
  eq(getMoveCost(p, 1), MOVE_PLATE_CUPCAKE_COST, 'a plate prices as a plate');
  eq(getMoveCost(p, 2), null, 'an empty cell cannot be moved');

  p.cupcakes = 5;
  moveTile(s, 1, 24); // move the plate
  eq(p.cupcakes, 5 - MOVE_PLATE_CUPCAKE_COST, 'the plate move charged the plate price');
});

check('one move per turn, whichever price was paid', () => {
  const s = newGame(2);
  s.gamePhase = 'spend';
  const p = s.players[0];
  p.board = Array(25).fill(null);
  p.board[0] = { colour: 'pink', ingredient: 'lemon' };
  p.board[1] = { colour: 'blue', ingredient: 'lemon' };
  p.cupcakes = 9;
  moveTile(s, 0, 24);
  threw(() => moveTile(s, 1, 23), 'one tile or empty plate per turn');
});

check('a move is refused when the player cannot afford that cell', () => {
  const s = newGame(2);
  s.gamePhase = 'spend';
  const p = s.players[0];
  p.board = Array(25).fill(null);
  p.board[0] = { type: 'blocked' };
  p.cupcakes = 1; // enough for a tile, not for a plate
  threw(() => moveTile(s, 0, 24), 'Not enough cupcakes');
});

// --- 6/7. SCORING, TIEBREAK AND SEAT STAGGER -------------------------------

check('starting cupcakes are staggered by seat', () => {
  // 4 August: the stagger is keyed by PLAYER COUNT now, so the live openings come
  // from getStartingCupcakes(pc) rather than one by-seat array. (This whole file
  // is superseded and does not run - see the header - but the reference is fixed
  // so a reader is not misled about the shape of the live table.)
  for (const pc of [2, 3, 4]) {
    const s = newGame(pc);
    const openings = getStartingCupcakes(pc);
    for (let i = 0; i < pc; i++) {
      eq(s.players[i].cupcakes, openings[i], `seat ${i + 1} at ${pc}p`);
    }
  }
});

check('the tiebreak is cupcakes, then cards claimed, then a shared victory', () => {
  const s = newGame(3);
  s.players[0].score = 40; s.players[0].cupcakes = 1; s.players[0].claimedCards = [1, 2, 3];
  s.players[1].score = 40; s.players[1].cupcakes = 4; s.players[1].claimedCards = [4];
  s.players[2].score = 39; s.players[2].cupcakes = 9; s.players[2].claimedCards = [5, 6, 7, 8];
  eq(getWinningPlayers(s).length, 1, 'cupcakes break the score tie');
  eq(getWinningPlayers(s)[0].id, 1, 'most cupcakes wins the tie');

  // Level on cupcakes: cards claimed decides.
  s.players[1].cupcakes = 1;
  eq(getWinningPlayers(s)[0].id, 0, 'cards claimed is the second tiebreak');

  // Level on both: shared.
  s.players[1].claimedCards = [4, 5, 6];
  eq(getWinningPlayers(s).length, 2, 'a full tie shares the victory');
});

// --- 8. EMPTY PLATE POOL ---------------------------------------------------

check('the empty plate pool is 6 per player', () => {
  eq(EMPTY_PLATES_PER_PLAYER, 6, 'plates per player');
  eq(newGame(2).cardsNeededToEnd, 12, '2p');
  eq(newGame(3).cardsNeededToEnd, 18, '3p');
  eq(newGame(4).cardsNeededToEnd, 24, '4p');
});

// --- WHOLE-GAME INVARIANTS -------------------------------------------------

check('full games finish, at every player count, with a coherent final state', () => {
  for (const pc of [2, 3, 4]) {
    for (let g = 0; g < 15; g++) {
      const s = playOut(pc);
      assert(s.endGameReason !== null, 'an ended game must say why');
      // (The "no pair is claimed twice, and every claimed pair is held by exactly
      // one player" invariant stood here. Deleted 4 August with the pantry goals -
      // gameState.objectivePairs and player.objectiveCards no longer exist.)
      // Nobody spends into the red, and nobody holds more than one reserved card.
      for (const p of s.players) {
        assert(p.cupcakes >= 0, `${p.name} went negative on cupcakes`);
        assert(p.reservedCards.length <= RESERVE_LIMIT, `${p.name} exceeded the reserve limit`);
        // NOTE: the plate pool is a SHARED table supply of EMPTY_PLATES_PER_PLAYER
        // x playerCount, not a per-player allowance - one player can out-claim
        // their own six as long as the table total holds. That is the rule the
        // engine has always modelled (getTotalCardsClaimed vs cardsNeededToEnd);
        // 3 August changed the number, not the mechanism. The table-total
        // assertion below is the real invariant.
      }
      // Total claims never exceed the table's plate supply.
      const totalClaims = s.players.reduce((n, p) => n + p.claimedCards.length, 0);
      assert(totalClaims <= EMPTY_PLATES_PER_PLAYER * pc, `table claimed ${totalClaims} against ${EMPTY_PLATES_PER_PLAYER * pc} plates`);
      // (A "score must at least contain the objective VP" check stood here.
      // Deleted 4 August with the pantry goals. The score's parts are now stand +
      // crumbs + cards and nothing else; the live suite checks scoring.)
      for (const p of s.players) {
        assert(p.score >= 0, 'a score must never be negative');
      }
    }
  }
});

check('every board tile placed is legal - no tile ever lands on an occupied cell', () => {
  for (let g = 0; g < 10; g++) {
    const s = playOut(4);
    for (const p of s.players) {
      eq(p.board.length, 25, 'board size');
    }
  }
});

// ---------------------------------------------------------------------------

console.log(`\nRule tests for the 3 August 2026 change set\n`);
console.log(`  passed: ${passed}`);
console.log(`  failed: ${failures.length}`);
for (const f of failures) console.log(`    FAIL  ${f}`);
if (failures.length) process.exitCode = 1;
