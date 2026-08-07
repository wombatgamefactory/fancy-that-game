// Rule tests for THE TASTING MENU - the 5 August 2026 change set, which REPLACED
// the Freshness Bonus outright. Run with
//   node test-rules-2026-08-05-tasting-menu.mjs
//
// WHY ITS OWN FILE. test-rules-2026-08-03-v2.mjs is the live suite for the bag,
// the cupcake menu, the tile-market end rule and the equal-turns rule, and it is
// already carrying two days of changes under a filename that no longer describes
// it. This module is self-contained - one deck, one scoring hook, no reset - so it
// gets a file rather than a fourth layer on that.
//
// THIS FILE SUPERSEDES test-rules-2026-08-04-freshness.mjs, which is deleted along
// with the rule it tested.
//
// THE RULE. Deal one Tasting Menu per player face up at setup, from a deck of ten.
// The moment a player's CAKE STAND OR CRUMB TRAY shows the named ingredients they
// take the card, free and automatic (the crumb tray was added 6 August; it read the
// stand alone as shipped). Each menu can only ever be taken by one player and never
// comes back. Ingredients are not consumed. Worth TASTING_MENU_VP each.
//
// WHAT THE INTERESTING TESTS ARE ACTUALLY GUARDING. Four things, and every one of
// them is a way the module could silently stop being what it is:
//   - FIRST TO QUALIFY WINS IT, ONCE (§3). A second player meeting the same menu
//     must score NOTHING. If that ever silently passes, the module has become a
//     public objective everybody scores and the race is gone.
//   - THE CRUMB TRAY COUNTS, THE STAND READ STAYS NARROW (§4). Two accessors that
//     must not collapse into one another: getMenuIngredients is stand + crumbs,
//     getStandIngredients is stand only and the stand metrics depend on it.
//   - NOTHING RELEASES A MENU (§5). No pot of tea, no refill, no end condition.
//     The whole design claim is that the deadline is an opponent rather than a
//     clock, and a reset anywhere would hand that back.
//   - THE CLONE HAZARD (§7). state.tastingMenus is an array of objects the engine
//     writes to. A rollout that shared them would take real cards off the real
//     table permanently. This is the single most likely bug in the build.
import {
  createGame, sweep, takeBonusTile, declineBonusTile, place, claim, skipClaim, skipSpend, refill,
  calculateFinalScores, getPatternMatches, getValidSweeps, getValidPlacements,
  isTastingMenuInPlay, getStandIngredients, getMenuIngredients, qualifiesForMenu, getMenuDeficit,
  getClaimableMenus, getAvailableMenus,
  getTastingMenusEnabled, setTastingMenusEnabled,
  // The Flavour of the Day's seam (6 August). Used by 8c only, which asserts an
  // exact total and therefore has to silence every lane except the one under test.
  getFlavourEnabled, setFlavourEnabled, FLAVOUR_ENABLED,
  TASTING_MENU_ENABLED, TASTING_MENU_VP, TASTING_MENU_SURPLUS, getTastingMenuCount,
  TASTING_MENU_ONE_PER_TURN, TASTING_MENUS,
  TEAPOT_SYMBOL_CELLS, STAND_ROW_VALUES, REWARD_CARDS, INGREDIENTS,
} from './src/engine/game.js';
import { createStatsCollector } from './src/engine/statsCollector.js';
import * as bot from './src/bots/basicBot.js';
import * as mcts from './src/bots/mctsBot.js';

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

function newGame(n = 3, options = {}) {
  return createGame(Array.from({ length: n }, (_, i) => ({ name: `P${i + 1}` })), null, options);
}

// Uncover every printed teapot cell, which is what arms isTeaDue. No two symbols
// share a row or column, so this is the only cheap way to reach the threshold by
// hand. Same helper as the 3 August suite, and deliberately the same shape.
function armTeaTrigger(s) {
  for (const idx of TEAPOT_SYMBOL_CELLS) s.market[idx] = null;
}

// A state parked in the claim phase with a KNOWN board and a KNOWN claimable card,
// so the scoring hook can be asserted without playing to get there.
//
// Card 1 (Lemon madeleine) is two adjacent yellows - the smallest pattern in the
// deck, which keeps the constructed board to two cells and leaves everything else
// about the position uninteresting on purpose.
function claimState({ tileIngredient = 'lemon', playerCount = 2, seat = 0, menus = null } = {}) {
  const s = newGame(playerCount, menus ? { tastingMenus: menus } : {});
  s.gamePhase = 'claim';
  s.currentPlayerIndex = seat;
  s.claimsThisTurn = 0;
  const p = s.players[seat];
  p.board = Array(25).fill(null);
  // Cells 0 and 1: the tile at 0 is the one the tests remove.
  p.board[0] = { colour: 'yellow', ingredient: tileIngredient };
  p.board[1] = { colour: 'yellow', ingredient: 'almond' };
  const card = REWARD_CARDS.find(c => c.id === 1);
  s.cardMarket = [card];
  assert(getPatternMatches(p.board, card.pattern).length > 0, 'setup: the pattern must match');
  return { s, p, card };
}

// Put `count` tiles of `ingredient` straight onto a stand row, bypassing claim.
// Used to build a stand ONE TILE SHORT of a known menu so the completing claim can
// be the only thing under test.
function stock(player, rowIndex, ingredient, count) {
  const row = player.stand[rowIndex];
  row.ingredient = ingredient;
  for (let i = 0; i < count; i++) row.tiles.push({ colour: 'yellow', ingredient });
}

// The two menus the tests pin. t1 is 2 lemon + 2 chocolate; t6 is 2 lemon +
// caramel + strawberry. They OVERLAP on their two lemon, which is what makes them
// the right pair for the ingredients-are-not-consumed test.
const MENU_T1 = TASTING_MENUS.find(m => m.id === 't1');
const MENU_T6 = TASTING_MENUS.find(m => m.id === 't6');

// ---------------------------------------------------------------------------
// 1. Setup and the deal
// ---------------------------------------------------------------------------

check('1a: setup deals exactly PLAYERS + 1 menus, all distinct and untaken', () => {
  eq(TASTING_MENU_SURPLUS, 1, 'the adopted rule is players + 1');
  for (const n of [2, 3, 4]) {
    const s = newGame(n);
    eq(s.tastingMenus.length, n + 1, `${n} players deals ${n + 1}`);
    eq(s.tastingMenus.length, getTastingMenuCount(n), `${n} players: and the accessor agrees`);
    eq(new Set(s.tastingMenus.map(m => m.id)).size, s.tastingMenus.length, `${n} players: all distinct`);
    for (const menu of s.tastingMenus) {
      eq(menu.takenBy, null, `${n} players: every menu starts untaken`);
      assert(TASTING_MENUS.some(m => m.id === menu.id), `${menu.id} is a real menu`);
    }
  }
});

check('1a2: THE SURPLUS - there are always more menus than players', () => {
  // The whole point of the change from a flat one-per-player. With one each, the
  // arithmetic quietly promises everybody a card; with a surplus, no menu is
  // anybody's by default. Also: the deal must never outrun the deck.
  for (const n of [2, 3, 4]) {
    assert(getTastingMenuCount(n) > n, `${n} players: more menus than players`);
    assert(getTastingMenuCount(n) <= TASTING_MENUS.length,
      `${n} players: the deal fits inside the ${TASTING_MENUS.length}-card deck`);
  }
});

check('1b: every dealt menu demands exactly three tiles', () => {
  // The one property that lets both card shapes carry a single flat value. If this
  // ever fails, TASTING_MENU_VP has stopped being a fair price for half the deck.
  //
  // THE NUMBER CHANGED FROM FOUR TO THREE on 5 August when the deck was lightened
  // from 2/2 + 2/1/1 to 2/1 + 1/1/1. What matters is not the number but that it is
  // the SAME number for every card, so this reads it off card one and holds the
  // rest to it rather than naming it.
  const expected = Object.values(TASTING_MENUS[0].need).reduce((a, b) => a + b, 0);
  eq(expected, 3, 'the three-tile deck, adopted 5 August');
  for (const menu of TASTING_MENUS) {
    let tiles = 0;
    for (const need of Object.values(menu.need)) tiles += need;
    eq(tiles, expected, `${menu.id} (${menu.shape})`);
  }
});

check('1c: a supplied tastingMenus option is used verbatim', () => {
  const s = newGame(4, { tastingMenus: ['t1', 't6'] });
  eq(s.tastingMenus.length, 2, 'pinned deal is honoured verbatim, not padded to the player count');
  eq(s.tastingMenus[0].id, 't1', 'in the order given');
  eq(s.tastingMenus[1].id, 't6', 'in the order given');
  for (const menu of s.tastingMenus) eq(menu.takenBy, null, 'and untaken');
});

check('1d: a dealt menu never aliases the deck constant', () => {
  // createGame maps fresh objects with their own `need`. If it ever spreads the
  // deck array instead, one game setting takenBy would poison every later game in
  // the process - and a simulation run is thousands of games in one process.
  const s = newGame(2, { tastingMenus: ['t1'] });
  s.tastingMenus[0].takenBy = 99;
  s.tastingMenus[0].need.lemon = 99;
  const fresh = newGame(2, { tastingMenus: ['t1'] });
  eq(fresh.tastingMenus[0].takenBy, null, 'the deck constant was not written to');
  eq(fresh.tastingMenus[0].need.lemon, MENU_T1.need.lemon, 'nor was its need map');
});

check('1e: players start holding nothing', () => {
  const s = newGame(3);
  for (const p of s.players) eq(p.tastingMenus.length, 0, `${p.name}`);
  assert(isTastingMenuInPlay(s), 'the module is in play at setup');
});

// ---------------------------------------------------------------------------
// 2. The accessors, which everything else reads through
// ---------------------------------------------------------------------------

check('2a: getStandIngredients counts the STAND and nothing else', () => {
  const s = newGame(2);
  const p = s.players[0];
  stock(p, 0, 'lemon', 2);
  stock(p, 1, 'chocolate', 1);
  p.crumbTray.push({ colour: 'brown', ingredient: 'chocolate' });
  p.board[0] = { colour: 'brown', ingredient: 'chocolate' };
  const counts = getStandIngredients(p);
  eq(counts.lemon, 2, 'two lemon on the stand');
  eq(counts.chocolate, 1, 'ONE chocolate - the crumb tray and the board are invisible');
});

check('2b: qualifiesForMenu and getMenuDeficit agree', () => {
  const s = newGame(2, { tastingMenus: ['t1'] });
  const p = s.players[0];
  // t1 is 2 lemon + 1 chocolate since the deck was lightened to three tiles.
  eq(getMenuDeficit(p, MENU_T1), 3, 'an empty stand is three tiles short');
  assert(!qualifiesForMenu(p, MENU_T1), 'and does not qualify');
  stock(p, 0, 'lemon', 1);
  eq(getMenuDeficit(p, MENU_T1), 2, 'one lemon leaves a lemon and the chocolate');
  p.stand[0].tiles.push({ colour: 'yellow', ingredient: 'lemon' });
  eq(getMenuDeficit(p, MENU_T1), 1, 'one chocolate short');
  assert(!qualifiesForMenu(p, MENU_T1), 'one short is not qualified');
  stock(p, 1, 'chocolate', 1);
  eq(getMenuDeficit(p, MENU_T1), 0, 'and now nothing is missing');
  assert(qualifiesForMenu(p, MENU_T1), 'so it qualifies');
});

check('2c: getClaimableMenus never returns a menu already taken', () => {
  const s = newGame(2, { tastingMenus: ['t1', 't6'] });
  const p = s.players[0];
  stock(p, 0, 'lemon', 2);
  stock(p, 1, 'chocolate', 2);
  eq(getClaimableMenus(s, p).length, 1, 't1 is met, t6 is not');
  s.tastingMenus[0].takenBy = 1;
  eq(getClaimableMenus(s, p).length, 0, 'a taken menu is not claimable by anybody');
  eq(getAvailableMenus(s).length, 1, 'and is gone from the available list');
});

// ---------------------------------------------------------------------------
// 3. The scoring hook, and first-come-first-served
// ---------------------------------------------------------------------------

check('3a: a player takes the menu on the claim that completes it, in the same call', () => {
  const { s, p } = claimState({ tileIngredient: 'chocolate', menus: ['t1'] });
  stock(p, 0, 'lemon', 2);
  eq(getMenuDeficit(p, s.tastingMenus[0]), 1, 'setup: exactly one tile short');
  eq(p.tastingMenus.length, 0, 'setup: holding nothing yet');

  claim(s, 1, 0, { type: 'row', rowIndex: 1 });

  eq(p.tastingMenus.length, 1, 'the menu is taken by the claim itself - no second call');
  eq(p.tastingMenus[0], 't1', 'and it is the right card');
  eq(s.tastingMenus[0].takenBy, p.id, 'takenBy names the player');
});

check('3b: a claim that does NOT complete a menu takes nothing', () => {
  const { s, p } = claimState({ tileIngredient: 'chocolate', menus: ['t1'] });
  stock(p, 0, 'lemon', 1);
  claim(s, 1, 0, { type: 'row', rowIndex: 1 });
  eq(p.tastingMenus.length, 0, 'still a lemon short after plating the chocolate');
  eq(s.tastingMenus[0].takenBy, null, 'so the card is still on the table');
});

check('3c: A SECOND PLAYER MEETING THE SAME MENU SCORES NOTHING', () => {
  // The whole mechanism. If this ever silently passes, the module has become a
  // public objective everybody scores and there is no race left in it.
  const { s, p } = claimState({ tileIngredient: 'chocolate', playerCount: 2, menus: ['t1'] });
  stock(p, 0, 'lemon', 2);
  claim(s, 1, 0, { type: 'row', rowIndex: 1 });
  eq(p.tastingMenus.length, 1, 'first player takes it');

  // Second player, same menu, already qualifying on the stand.
  const p2 = s.players[1];
  stock(p2, 0, 'lemon', 2);
  stock(p2, 1, 'chocolate', 1);
  p2.board = Array(25).fill(null);
  p2.board[0] = { colour: 'yellow', ingredient: 'chocolate' };
  p2.board[1] = { colour: 'yellow', ingredient: 'almond' };
  s.cardMarket = [REWARD_CARDS.find(c => c.id === 1)];
  s.currentPlayerIndex = 1;
  s.gamePhase = 'claim';
  s.claimsThisTurn = 0;
  claim(s, 1, 0, { type: 'row', rowIndex: 1 });

  assert(qualifiesForMenu(p2, MENU_T1), 'the second player really does meet it');
  eq(p2.tastingMenus.length, 0, 'AND SCORES NOTHING FOR IT');
  eq(s.tastingMenus[0].takenBy, p.id, 'the card stays with the first player');

  calculateFinalScores(s);
  eq(s.players[1].tastingMenus.length, 0, 'and it is not awarded at scoring either');
});

check('3d: a rejected claim takes no menu', () => {
  // The hook sits after every validation for exactly this reason. rowIndex 1 is
  // locked to chocolate below, so plating a lemon there is illegal.
  const { s, p } = claimState({ tileIngredient: 'lemon', menus: ['t1'] });
  stock(p, 0, 'lemon', 1);
  stock(p, 1, 'chocolate', 2);
  // One more lemon on the stand would complete t1 - but the destination is illegal.
  let threw = false;
  try {
    claim(s, 1, 0, { type: 'row', rowIndex: 1 });
  } catch (e) {
    threw = true;
  }
  assert(threw, 'the illegal destination is rejected');
  eq(p.tastingMenus.length, 0, 'and no menu is awarded on the way out');
  eq(s.tastingMenus[0].takenBy, null, 'the card is untouched');
});

// ---------------------------------------------------------------------------
// 4. The crumb tray counts too (6 August - INVERTED from the shipped 5 August
//    rule, which read the cake stand alone)
// ---------------------------------------------------------------------------

check('4a: A TILE SENT TO THE CRUMB TRAY DOES COMPLETE A MENU', () => {
  // This assertion was the exact opposite until 6 August. The stand-only reading
  // was never a decision anybody took, and it made the module multiply the cake
  // stand's convex reward: menus read the stand, so the player with the deepest
  // stand won 2.5x as many of them. Reading the crumb tray decouples the two.
  const { s, p } = claimState({ tileIngredient: 'chocolate', menus: ['t1'] });
  stock(p, 0, 'lemon', 2);
  eq(getMenuDeficit(p, s.tastingMenus[0]), 1, 'setup: one chocolate short');

  claim(s, 1, 0, { type: 'crumb' });

  eq(p.crumbTray.length, 1, 'the tile really did go to the crumb tray');
  eq(p.crumbTray[0].ingredient, 'chocolate', 'and it is the exact ingredient needed');
  eq(p.tastingMenus.length, 1, 'AND IT COMPLETES THE MENU');
  eq(s.tastingMenus[0].takenBy, p.id, 'the card is taken, by this player');
  eq(getMenuDeficit(p, s.tastingMenus[0]), 0, 'and the deficit has closed');
});

check('4b: getStandIngredients still reads the STAND ALONE', () => {
  // The two accessors must not collapse into each other: the stand-shape metrics
  // and the UI's stand panel depend on the narrow one staying narrow.
  const { s, p } = claimState({ tileIngredient: 'chocolate', menus: ['t1'] });
  stock(p, 0, 'lemon', 2);
  claim(s, 1, 0, { type: 'crumb' });

  eq(getStandIngredients(p).chocolate || 0, 0, 'the crumbed tile is NOT on the stand');
  eq(getStandIngredients(p).lemon, 2, 'the stand read is otherwise intact');
  eq(getMenuIngredients(p).chocolate, 1, 'but the MENU read sees it');
});

// ---------------------------------------------------------------------------
// 5. Ingredients are not consumed, and the per-turn cap
// ---------------------------------------------------------------------------

check('5a: a stand meeting two overlapping menus takes BOTH, undiminished', () => {
  // t1 (2 lemon + chocolate) and t6 (lemon + caramel + strawberry) share a lemon.
  // Five tiles satisfy both; if ingredients were consumed it would take six.
  const { s, p } = claimState({ tileIngredient: 'strawberry', menus: ['t1', 't6'] });
  stock(p, 0, 'lemon', 2);
  stock(p, 1, 'chocolate', 1);
  stock(p, 2, 'caramel', 1);
  eq(getMenuDeficit(p, MENU_T1), 0, 'setup: t1 would already be met');
  eq(getMenuDeficit(p, MENU_T6), 1, 'setup: t6 is one strawberry short');

  claim(s, 1, 0, { type: 'row', rowIndex: 3 });

  if (TASTING_MENU_ONE_PER_TURN) {
    eq(p.tastingMenus.length, 1, 'cap on: exactly one taken this turn');
    const taken = s.tastingMenus.filter(m => m.takenBy !== null);
    const left = s.tastingMenus.filter(m => m.takenBy === null);
    eq(taken.length, 1, 'one card leaves the table');
    eq(left.length, 1, 'AND THE OTHER REMAINS AVAILABLE');
  } else {
    eq(p.tastingMenus.length, 2, 'cap off: both are taken in the one claim');
    for (const menu of s.tastingMenus) eq(menu.takenBy, p.id, `${menu.id} went to this player`);
    // And neither is diminished by the other: the stand still meets both.
    assert(qualifiesForMenu(p, MENU_T1), 't1 is still met after t6 was taken');
    assert(qualifiesForMenu(p, MENU_T6), 't6 is still met after t1 was taken');
    eq(p.stand[0].tiles.length, 2, 'and no tile was spent - both lemon are still there');
  }
});

check('5b: TASTING_MENU_ONE_PER_TURN ships OFF', () => {
  // Not a rule test - a shipped-configuration test. The flag exists so the cap can
  // be A/B'd rather than argued about, and the adopted setting is off.
  eq(TASTING_MENU_ONE_PER_TURN, false, 'shipped off, behind the flag');
  eq(TASTING_MENU_ENABLED, true, 'and the module itself is on');
});

// ---------------------------------------------------------------------------
// 6. Nothing ever releases a menu
// ---------------------------------------------------------------------------

check('6a: a pot of tea does not release a taken menu, or deal a new one', () => {
  // THE STRUCTURAL CLAIM OF THE WHOLE MODULE. Both predecessors handed value back
  // on the tea cycle, and a reward on a reset cycle is never your last chance at
  // it. If this test ever fails, the module has lost the only thing it was built
  // for.
  const { s, p } = claimState({ tileIngredient: 'chocolate', menus: ['t1', 't6'] });
  stock(p, 0, 'lemon', 2);
  claim(s, 1, 0, { type: 'row', rowIndex: 1 });
  eq(s.tastingMenus[0].takenBy, p.id, 'setup: t1 has been taken');

  const before = s.tastingMenus.map(m => `${m.id}:${m.takenBy}`).join(',');
  armTeaTrigger(s);
  s.gamePhase = 'refill';
  refill(s);

  eq(s.tastingMenus.length, 2, 'the pot deals no new menus');
  eq(s.tastingMenus.map(m => `${m.id}:${m.takenBy}`).join(','), before, 'and releases none');
  eq(p.tastingMenus.length, 1, 'the player still holds it');
});

check('6b: no menu is ever released over a whole played-out game', () => {
  // The construction test above proves one pot. This proves it against real play,
  // where refills, tea flushes and the end conditions all fire in their natural
  // order and any of them could have grown a reset.
  for (const pc of [2, 3, 4]) {
    let s = createGame(Array.from({ length: pc }, (_, i) => ({ name: `P${i + 1}` })), null);
    // menuId -> the player who took it. Once written it must never change and
    // never be erased, for the rest of the game.
    const heldBy = {};
    let steps = 0;
    while (!s.gameOver && steps < 5000) {
      switch (s.gamePhase) {
        case 'sweep': {
          if (s.bonusTileAvailable) {
            const bonusIdx = bot.decideBonusTile(s);
            s = (bonusIdx !== null && bonusIdx !== undefined && s.market[bonusIdx])
              ? takeBonusTile(s, bonusIdx)
              : declineBonusTile(s);
            break;
          }
          const d = bot.decideSweep(s);
          if (d) s = sweep(s, d.rowOrCol, d.isRow, d.declaration, d.declarationType);
          else s.gamePhase = 'place';
          break;
        }
        case 'place': s = place(s, bot.decidePlacements(s)); break;
        case 'spend': s = skipSpend(s); break;
        case 'claim': {
          const d = bot.decideClaim(s);
          s = d && d.cardId ? claim(s, d.cardId, d.removedBoardIndex, d.destination) : skipClaim(s);
          break;
        }
        case 'refill': s = refill(s); break;
        default: throw new Error(`${pc}p: unexpected phase ${s.gamePhase}`);
      }
      // Checked after EVERY phase step, not once a turn, because a reset could be
      // hiding in any of them - a tea flush inside refill being the obvious one.
      for (const menu of s.tastingMenus) {
        if (menu.takenBy !== null) {
          if (menu.id in heldBy) {
            assert(heldBy[menu.id] === menu.takenBy,
              `${pc}p: ${menu.id} changed hands from ${heldBy[menu.id]} to ${menu.takenBy}`);
          }
          heldBy[menu.id] = menu.takenBy;
          const holder = s.players[menu.takenBy];
          assert(holder.tastingMenus.includes(menu.id),
            `${pc}p: ${menu.id} says it went to ${holder.name}, who is not holding it`);
        } else {
          assert(!(menu.id in heldBy), `${pc}p: ${menu.id} was RELEASED after being taken`);
        }
      }
      steps++;
    }
    assert(s.gameOver, `${pc}p: the game finished (${steps} steps)`);
    // And the two halves of the record agree at the end: every id on a player's
    // list is a menu on the table naming that player, and no id appears twice.
    const claimed = new Set();
    for (const p of s.players) {
      for (const id of p.tastingMenus) {
        assert(!claimed.has(id), `${pc}p: ${id} is held by two players`);
        claimed.add(id);
        const menu = s.tastingMenus.find(m => m.id === id);
        assert(menu && menu.takenBy === p.id, `${pc}p: ${id} does not name ${p.name} back`);
      }
    }
  }
});

// ---------------------------------------------------------------------------
// 7. THE CLONE HAZARD - the single most likely bug in this build
// ---------------------------------------------------------------------------

// THE SEARCH IS ENTERED THROUGH decideSweep, NOT decideClaim. mctsBot.decideClaim
// delegates straight to the greedy policy and runs no rollouts at all, so a clone
// test written against it passes whatever cloneState does - which is exactly the
// false negative this note exists to stop somebody re-introducing. decideSweep is
// the only entry that calls mctsSearch, and it is async.
async function checkCloneHazard() {
  // state.tastingMenus is an array of OBJECTS the engine writes to. A spread of the
  // array copies the array and SHARES every entry, so a rollout that qualified
  // would set takenBy on the real card - permanently, for every player, with no
  // reset in this module to heal it. mctsBot maps each entry; this is the guard
  // that says why.
  //
  // The position is built so rollouts CANNOT avoid completing the menu: every
  // player is one tile from t1 and the market is full of chocolate, so 60 playouts
  // of real turns will plate one many times over.
  const s = createGame([{ name: 'A' }, { name: 'B' }], null, { tastingMenus: ['t1'] });
  for (const p of s.players) {
    // Two lemon is one chocolate short of t1 on the three-tile deck.
    stock(p, 0, 'lemon', 2);
  }
  s.gamePhase = 'sweep';
  s.currentPlayerIndex = 0;

  await mcts.decideSweep(s, 'mcts-1');

  eq(s.tastingMenus[0].takenBy, null, 'THE REAL CARD IS STILL ON THE REAL TABLE');
  for (const player of s.players) {
    eq(player.tastingMenus.length, 0, `${player.name} scored nothing from an imaginary game`);
  }
}

check('7b: a hand-written shallow clone demonstrates the hazard', () => {
  // The failing case, written out, so the test above cannot pass for the wrong
  // reason. A spread SHARES the entries; a map does not.
  const s = newGame(2, { tastingMenus: ['t1'] });
  const shared = { ...s, tastingMenus: [...s.tastingMenus] };
  shared.tastingMenus[0].takenBy = 1;
  eq(s.tastingMenus[0].takenBy, 1, 'a spread of the array shares the entry - this is the bug');

  const s2 = newGame(2, { tastingMenus: ['t1'] });
  const copied = { ...s2, tastingMenus: s2.tastingMenus.map(m => ({ ...m })) };
  copied.tastingMenus[0].takenBy = 1;
  eq(s2.tastingMenus[0].takenBy, null, 'a map of spreads does not - this is the fix');
});

// ---------------------------------------------------------------------------
// 8. Scoring, metrics and the A/B seam
// ---------------------------------------------------------------------------

check('8a: calculateFinalScores adds exactly TASTING_MENU_VP per held menu', () => {
  const s = newGame(2, { tastingMenus: ['t1', 't6'] });
  const p = s.players[0];
  // A bare stand of known value, so the menu term can be isolated by subtraction.
  stock(p, 0, 'lemon', 2);
  const standOnly = STAND_ROW_VALUES[0][1];
  calculateFinalScores(s);
  eq(p.score, standOnly, 'baseline: stand only');

  p.tastingMenus.push('t1');
  calculateFinalScores(s);
  eq(p.score, standOnly + TASTING_MENU_VP, 'one menu');

  p.tastingMenus.push('t6');
  calculateFinalScores(s);
  eq(p.score, standOnly + 2 * TASTING_MENU_VP, 'two menus, flat value each');
});

check('8b: the collector records the deal and every take', () => {
  const collector = createStatsCollector();
  const s = createGame([{ name: 'A' }, { name: 'B' }], collector, { tastingMenus: ['t1', 't6'] });
  s.gamePhase = 'claim';
  s.currentPlayerIndex = 0;
  s.claimsThisTurn = 0;
  const p = s.players[0];
  stock(p, 0, 'lemon', 2);
  p.board = Array(25).fill(null);
  p.board[0] = { colour: 'yellow', ingredient: 'chocolate' };
  p.board[1] = { colour: 'yellow', ingredient: 'almond' };
  s.cardMarket = [REWARD_CARDS.find(c => c.id === 1)];
  claim(s, 1, 0, { type: 'row', rowIndex: 1 });

  const r = collector.getReport();
  eq(r.menusDealt, 2, 'the deal is the DEAD CARDBOARD denominator and must be recorded');
  eq(r.tastingMenusTaken.length, 1, 'one menu taken');
  eq(r.tastingMenusTaken[0].menuId, 't1', 'the right one');
  eq(r.tastingMenusTaken[0].playerId, 0, 'attributed to the right player');
  eq(r.tastingMenusByPlayer[0], 1, 'and counted per player');
  eq(r.menusDead, 1, 't6 is dead cardboard so far');
  assert(!r.tastingMenusByPlayer[1], 'the other player took none');
});

check('8c: setTastingMenusEnabled(false) awards nothing and scores nothing', () => {
  // The A/B control arm. PRODUCTION CODE MUST NEVER CALL THE SETTER - this test
  // restores it in a finally, because the flag is module-level and a leak would
  // silently disable the module for every later test in the process.
  eq(getTastingMenusEnabled(), true, 'the module starts from the constant');
  try {
    setTastingMenusEnabled(false);
    // AND THE FLAVOUR OF THE DAY GOES OFF WITH IT (6 August). This test asserts an
    // EXACT total, so every lane that is not under test has to be held at zero -
    // otherwise it is asserting the whole scoring function rather than the absence
    // of one term. It also made the test FLAKY rather than merely wrong: the
    // Flavour is drawn at random from five, so it collided with the almond left on
    // the board about one run in five and the suite passed four times out of five.
    setFlavourEnabled(false);
    const s = newGame(3);
    eq(s.tastingMenus.length, 0, 'no menus are dealt');
    assert(!isTastingMenuInPlay(s), 'and the module is not in play');

    s.gamePhase = 'claim';
    s.currentPlayerIndex = 0;
    s.claimsThisTurn = 0;
    const p = s.players[0];
    stock(p, 0, 'lemon', 2);
    stock(p, 1, 'chocolate', 1);
    p.board = Array(25).fill(null);
    p.board[0] = { colour: 'yellow', ingredient: 'chocolate' };
    p.board[1] = { colour: 'yellow', ingredient: 'almond' };
    s.cardMarket = [REWARD_CARDS.find(c => c.id === 1)];
    claim(s, 1, 0, { type: 'row', rowIndex: 1 });
    eq(p.tastingMenus.length, 0, 'a qualifying stand awards nothing');

    // The whole score, term by term, with no menu term anywhere in it: two lemon
    // on the bottom row, two chocolate on the second (the claim plated one), and
    // the claimed card's printed VP.
    const cardVp = REWARD_CARDS.find(c => c.id === 1).vp;
    calculateFinalScores(s);
    eq(p.score, STAND_ROW_VALUES[0][1] + STAND_ROW_VALUES[1][1] + cardVp,
      'and scores nothing for it - stand + card VP and no more');
  } finally {
    setTastingMenusEnabled(TASTING_MENU_ENABLED);
    setFlavourEnabled(FLAVOUR_ENABLED);
  }
  eq(getTastingMenusEnabled(), true, 'the seam is restored for everything after this');
  eq(getFlavourEnabled(), true, 'both seams are restored');
});

// ---------------------------------------------------------------------------
// 9. The deck, which is the balance proof this build is measured against
// ---------------------------------------------------------------------------

check('9a: the deck in the engine is the one the probe verifies', () => {
  // probe-goaldeck-2026-08-05.js imports GOAL_DECK from goal-deck-2026-08-05.mjs,
  // which is now a re-export shim pointing at src/engine/tastingMenus.js. So the
  // eight balance checks verify the deck the game actually deals rather than a
  // copy of it, and this asserts the two really are the same array.
  eq(TASTING_MENUS.length, 10, 'ten cards - the only size that can be half-and-half and balanced');
  eq(TASTING_MENUS.filter(m => m.shape === '2/1').length, 5, 'five 2/1');
  eq(TASTING_MENUS.filter(m => m.shape === '1/1/1').length, 5, 'five 1/1/1');
  // Every ingredient on the same number of cards, and worth the same tiles.
  const cards = {}, tiles = {};
  for (const menu of TASTING_MENUS) {
    for (const [ingredient, need] of Object.entries(menu.need)) {
      cards[ingredient] = (cards[ingredient] || 0) + 1;
      tiles[ingredient] = (tiles[ingredient] || 0) + need;
    }
  }
  for (const ingredient of INGREDIENTS) {
    eq(cards[ingredient], 5, `${ingredient} appears on half the deck`);
    eq(tiles[ingredient], 6, `${ingredient} is worth the same tiles across the deck`);
  }
});

// ---------------------------------------------------------------------------
// The one asynchronous check runs last, then everything is reported together.

try {
  await checkCloneHazard();
  passed++;
} catch (e) {
  failures.push(`7a: an MCTS rollout cannot take a real menu off the real table: ${e.message}`);
}

console.log(`\nRule tests for THE TASTING MENU (5 August change set)\n`);
console.log(`  passed: ${passed}`);
console.log(`  failed: ${failures.length}`);
for (const f of failures) console.log(`    FAIL  ${f}`);
if (failures.length) process.exitCode = 1;
