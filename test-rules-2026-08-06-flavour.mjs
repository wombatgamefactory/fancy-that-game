// Rule tests for THE FLAVOUR OF THE DAY - the 6 August 2026 change set, which
// ADDS A FOURTH SCORING LANE and deletes nothing. Run with
//   node test-rules-2026-08-06-flavour.mjs
//
// THE RULE. At setup, reveal ONE ingredient card drawn at random from five. It is
// public from turn one and never changes. At the end of the game, score
// FLAVOUR_VP_PER_TILE for every tile of that ingredient ON YOUR PLAYER BOARD, and
// FLAVOUR_MAJORITY_VP more to the player OR PLAYERS holding the most. Ties are
// friendly and there is deliberately no tiebreak.
//
// WHAT THE INTERESTING TESTS ARE ACTUALLY GUARDING. Four things, and every one of
// them is a way this module could silently stop being what it is:
//   - THE BOARD-ONLY RULE (§2, §4). Sections 4b and 4c are the whole module: a
//     tile on the cake stand or in the crumb tray must count for NOTHING. Tiles
//     reach the stand only by CLAIMING, so the day one of them counts is the day
//     this lane is fed by the claim step again - which is the single thing it was
//     built to avoid. It would still pass every other test in this file.
//   - THE FRIENDLY TIE, AND THE ZERO RULE (§5). Everyone tied at the top takes the
//     full bonus; a top count of zero pays nobody at all.
//   - THE TWO-PASS SCORING CHANGE (§6). calculateFinalScores was one loop over
//     players and cannot be: the majority needs every count before anybody is
//     paid. That edit is the kind that accidentally accumulates, so idempotence is
//     asserted rather than assumed.
//   - NOTHING CHANGES IT MID-GAME (§7). Not a pot of tea, not a claim, not a turn
//     rotation. A reward on a reset cycle is never your last chance at it, which
//     is exactly why Today's Speciality and the Freshness Bonus were both deleted.
import {
  createGame, sweep, takeBonusTile, declineBonusTile, place, claim, skipClaim, skipSpend, refill,
  calculateFinalScores, getPatternMatches,
  isFlavourInPlay, getFlavourCount, getFlavourLeaders, countBoardIngredient,
  getFlavourEnabled, setFlavourEnabled,
  FLAVOUR_ENABLED, FLAVOUR_VP_PER_TILE, FLAVOUR_MAJORITY_VP,
  TEAPOT_SYMBOL_CELLS, STAND_ROW_VALUES, REWARD_CARDS, INGREDIENTS,
} from './src/engine/game.js';
import { createStatsCollector } from './src/engine/statsCollector.js';
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

function newGame(n = 3, options = {}) {
  return createGame(Array.from({ length: n }, (_, i) => ({ name: `P${i + 1}` })), null, options);
}

// Uncover every printed teapot cell, which is what arms isTeaDue. Same helper as
// the 3 and 5 August suites, deliberately the same shape.
function armTeaTrigger(s) {
  for (const idx of TEAPOT_SYMBOL_CELLS) s.market[idx] = null;
}

// Put `count` tiles of `ingredient` on a player's BOARD, from cell 0 up. The
// colour is irrelevant to this module - it reads ingredients only - so everything
// here is yellow and the tests stay about the one thing under test.
function stockBoard(player, ingredient, count, from = 0) {
  for (let i = 0; i < count; i++) {
    player.board[from + i] = { colour: 'yellow', ingredient };
  }
}

// Put `count` tiles of `ingredient` straight onto a cake-stand row, bypassing the
// claim. Used by the tests that prove the stand does NOT count.
function stockStand(player, rowIndex, ingredient, count) {
  const row = player.stand[rowIndex];
  row.ingredient = ingredient;
  for (let i = 0; i < count; i++) row.tiles.push({ colour: 'yellow', ingredient });
}

// A state parked in the claim phase with a KNOWN board and a KNOWN claimable card.
// Card 1 (Lemon madeleine) is two adjacent yellows - the smallest pattern in the
// deck - so the constructed board is two cells and nothing else about the position
// is interesting, which is the point.
//
// The tile at cell 0 is the one the tests sacrifice.
function claimState({ tileIngredient = 'lemon', playerCount = 2, seat = 0, flavour = 'lemon' } = {}) {
  const s = newGame(playerCount, { flavour });
  s.gamePhase = 'claim';
  s.currentPlayerIndex = seat;
  s.claimsThisTurn = 0;
  const p = s.players[seat];
  p.board = Array(25).fill(null);
  p.board[0] = { colour: 'yellow', ingredient: tileIngredient };
  p.board[1] = { colour: 'yellow', ingredient: 'almond' };
  const card = REWARD_CARDS.find(c => c.id === 1);
  s.cardMarket = [card];
  assert(getPatternMatches(p.board, card.pattern).length > 0, 'setup: the pattern must match');
  return { s, p, card };
}

// ---------------------------------------------------------------------------
// 1. The setup draw
// ---------------------------------------------------------------------------

check('1a: setup reveals exactly one Flavour, and it is a real ingredient', () => {
  for (const n of [2, 3, 4]) {
    const s = newGame(n);
    eq(typeof s.flavourOfTheDay, 'string', `${n} players: one ingredient, as a string`);
    assert(INGREDIENTS.includes(s.flavourOfTheDay), `${n} players: ${s.flavourOfTheDay} is a real ingredient`);
    assert(isFlavourInPlay(s), `${n} players: and the module is in play`);
  }
});

check('1a2: the draw is uniform over all five ingredients', () => {
  // Not a distribution test - it is a WIRING test. A draw hardcoded to one
  // ingredient, or one that indexed the list wrongly and could never reach the
  // last entry, would still pass 1a every time. Five distinct openings is the only
  // between-game setup variance the game has carried since the pantry goals were
  // deleted on 4 August, so "all five can actually come up" is the property.
  const seen = new Set();
  for (let i = 0; i < 400; i++) seen.add(newGame(2).flavourOfTheDay);
  eq(seen.size, INGREDIENTS.length, `all ${INGREDIENTS.length} ingredients come up over 400 games`);
});

check('1b: a pinned flavour is used verbatim, and a bad pin falls back to a real draw', () => {
  const s = newGame(3, { flavour: 'lemon' });
  eq(s.flavourOfTheDay, 'lemon', 'the pin is honoured');

  // An invalid pin is DROPPED in favour of a random valid draw rather than
  // throwing or being taken at face value - the same way normaliseTastingMenus
  // drops an unknown menu id. A harness typo must never put an ingredient no tile
  // carries onto the table, where it would score exactly zero for everybody and
  // look like the module doing nothing.
  for (const bad of ['marzipan', '', null, 42, {}]) {
    const t = newGame(2, { flavour: bad });
    assert(INGREDIENTS.includes(t.flavourOfTheDay),
      `a bad pin (${JSON.stringify(bad)}) falls back to a valid ingredient, got ${t.flavourOfTheDay}`);
  }
});

check('1c: no player state is added - the count is a pure read of the board', () => {
  // Deliberately asserted. A player.flavourTiles running total would be a second
  // thing that could disagree with the first, which is the bug class the engine
  // comments warn about elsewhere.
  const s = newGame(2, { flavour: 'lemon' });
  for (const p of s.players) {
    assert(p.flavourTiles === undefined, `${p.name} carries no flavour total`);
    eq(getFlavourCount(s, p), 0, `${p.name} starts on zero, read off an empty board`);
  }
});

check('1d: the collector records which flavour was revealed', () => {
  const collector = createStatsCollector();
  const s = createGame([{ name: 'A' }, { name: 'B' }], collector, { flavour: 'caramel' });
  eq(s.flavourOfTheDay, 'caramel', 'setup');
  eq(collector.getReport().flavourOfTheDay, 'caramel', 'and the report says so');
});

// ---------------------------------------------------------------------------
// 2. getFlavourCount - THE BOARD-ONLY RULE, which is the whole module
// ---------------------------------------------------------------------------

check('2a: getFlavourCount counts board tiles of the Flavour and nothing else', () => {
  const s = newGame(2, { flavour: 'lemon' });
  const p = s.players[0];
  stockBoard(p, 'lemon', 4);
  stockBoard(p, 'chocolate', 3, 10);
  eq(getFlavourCount(s, p), 4, 'four lemon; the chocolate is another ingredient');
  eq(countBoardIngredient(p.board, 'chocolate'), 3, 'and the chocolate is really there');
});

check('2b: IT DOES NOT COUNT CAKE-STAND TILES', () => {
  // THE MOST IMPORTANT TEST IN THIS FILE. Tiles reach the stand only by CLAIMING,
  // so a stand that counted would route this lane straight back through the claim
  // step - and the whole reason the module exists is that the claim is refused to
  // the trailing player on 37.7 / 42.5 / 44.2% of the claim steps they reach.
  const s = newGame(2, { flavour: 'lemon' });
  const p = s.players[0];
  stockStand(p, 0, 'lemon', 3);
  eq(p.stand[0].tiles.length, 3, 'setup: three lemon really are on the stand');
  eq(getFlavourCount(s, p), 0, 'AND THE COUNT IS ZERO - the board is empty');
});

check('2c: IT DOES NOT COUNT CRUMB-TRAY TILES', () => {
  const s = newGame(2, { flavour: 'lemon' });
  const p = s.players[0];
  for (let i = 0; i < 3; i++) p.crumbTray.push({ colour: 'yellow', ingredient: 'lemon' });
  eq(p.crumbTray.length, 3, 'setup: three lemon really are in the tray');
  eq(getFlavourCount(s, p), 0, 'AND THE COUNT IS ZERO');
});

check('2c2: IT DOES NOT COUNT RESERVED CARDS OR ANYTHING ELSE OFF THE BOARD', () => {
  // The rule names the player board, so the enumeration is board vs everything.
  // The reserve holds CARDS rather than tiles, so it cannot contribute even in
  // principle - asserted anyway, because "not the reserve" is in the stated rule
  // and a future container would land in the same gap.
  const s = newGame(2, { flavour: 'lemon' });
  const p = s.players[0];
  stockStand(p, 0, 'lemon', 2);
  p.crumbTray.push({ colour: 'yellow', ingredient: 'lemon' });
  p.reservedCards.push(REWARD_CARDS.find(c => c.id === 1));
  stockBoard(p, 'lemon', 1);
  eq(getFlavourCount(s, p), 1, 'exactly the ONE tile on the board');
});

check('2d: empty plates and empty cells count for nothing', () => {
  // An empty plate is an object with no `ingredient`; an empty cell is null.
  // countBoardIngredient skips both, which is why it survived the deletion of the
  // pantry goals it was written for.
  const s = newGame(2, { flavour: 'lemon' });
  const p = s.players[0];
  p.board = Array(25).fill(null);
  p.board[0] = { type: 'blocked' };
  p.board[1] = { type: 'blocked' };
  eq(getFlavourCount(s, p), 0, 'a board of plates and holes holds no lemon');
  stockBoard(p, 'lemon', 2, 5);
  eq(getFlavourCount(s, p), 2, 'and the two real tiles still read correctly');
});

check('2e: when the module is off every accessor is a no-op', () => {
  const s = newGame(2, { flavour: 'lemon' });
  s.flavourOfTheDay = null;
  const p = s.players[0];
  stockBoard(p, 'lemon', 5);
  assert(!isFlavourInPlay(s), 'not in play');
  eq(getFlavourCount(s, p), 0, 'the count is zero however full the board is');
  eq(getFlavourLeaders(s).length, 0, 'and nobody leads');
});

// ---------------------------------------------------------------------------
// 3. getFlavourLeaders
// ---------------------------------------------------------------------------

check('3a: getFlavourLeaders returns the sole leader, as a player id', () => {
  const s = newGame(3, { flavour: 'lemon' });
  stockBoard(s.players[0], 'lemon', 2);
  stockBoard(s.players[1], 'lemon', 5);
  stockBoard(s.players[2], 'lemon', 4);
  const leaders = getFlavourLeaders(s);
  eq(leaders.length, 1, 'one leader');
  eq(leaders[0], s.players[1].id, 'and it is the player id, not the seat object');
});

check('3b: ON A TIE IT RETURNS THEM ALL', () => {
  const s = newGame(4, { flavour: 'lemon' });
  stockBoard(s.players[0], 'lemon', 4);
  stockBoard(s.players[1], 'lemon', 4);
  stockBoard(s.players[2], 'lemon', 1);
  stockBoard(s.players[3], 'lemon', 4);
  const leaders = getFlavourLeaders(s).slice().sort();
  eq(leaders.join(','), '0,1,3', 'every player tied at the top');
});

check('3c: A TOP COUNT OF ZERO LEADS NOBODY', () => {
  // Nobody holds a single Flavour tile, so there is nothing to hold the most of.
  // Measured incidence is negligible, but a 3 VP bonus paid to a whole table for
  // having none of the thing is exactly what reads as a bug when it fires.
  const s = newGame(3, { flavour: 'lemon' });
  for (const p of s.players) stockBoard(p, 'chocolate', 3);
  eq(getFlavourLeaders(s).length, 0, 'nobody leads a race nobody entered');
});

// ---------------------------------------------------------------------------
// 4. Scoring
// ---------------------------------------------------------------------------

check('4a: a board with 4 Flavour tiles and no majority scores exactly 4', () => {
  const s = newGame(2, { flavour: 'lemon' });
  const [p, rival] = s.players;
  stockBoard(p, 'lemon', 4);
  stockBoard(rival, 'lemon', 9);          // the rival takes the majority
  calculateFinalScores(s);
  eq(p.score, 4 * FLAVOUR_VP_PER_TILE, 'per-tile only - no bonus, no other lane in play');
});

check('4b: the sole leader scores count + the majority bonus', () => {
  const s = newGame(2, { flavour: 'lemon' });
  const [p, rival] = s.players;
  stockBoard(p, 'lemon', 6);
  stockBoard(rival, 'lemon', 2);
  calculateFinalScores(s);
  eq(p.score, 6 * FLAVOUR_VP_PER_TILE + FLAVOUR_MAJORITY_VP, 'leader: count + bonus');
  eq(rival.score, 2 * FLAVOUR_VP_PER_TILE, 'and the trailing player takes the per-tile clause only');
});

check('4c: FRIENDLY TIES - two players tied at the top BOTH score count + bonus', () => {
  // The tie is friendly BY DESIGN and there must never be a tiebreak rule: ties
  // occur in 11.3 / 13.8 / 18.0% of games at 2/3/4 players, so a tiebreaker would
  // fire about one game in five at a gateway weight.
  const s = newGame(3, { flavour: 'lemon' });
  const [a, b, c] = s.players;
  stockBoard(a, 'lemon', 5);
  stockBoard(b, 'lemon', 5);
  stockBoard(c, 'lemon', 4);
  calculateFinalScores(s);
  eq(a.score, 5 + FLAVOUR_MAJORITY_VP, 'first tied player takes the FULL bonus');
  eq(b.score, 5 + FLAVOUR_MAJORITY_VP, 'so does the second - it is not split, and not withheld');
  eq(c.score, 4, 'and one tile behind pays nothing extra');
});

check('4d: A TOP COUNT OF ZERO PAYS NOBODY THE BONUS', () => {
  const s = newGame(3, { flavour: 'lemon' });
  for (const p of s.players) stockBoard(p, 'chocolate', 4);
  calculateFinalScores(s);
  for (const p of s.players) eq(p.score, 0, `${p.name} scores nothing at all`);
});

check('4e: the stand and the crumb tray score their OWN lanes and not this one', () => {
  // The board-only rule stated as arithmetic. The stand row and the crumb tile
  // still pay what they always paid; what they must not do is pay again here.
  const s = newGame(2, { flavour: 'lemon' });
  const [p, rival] = s.players;
  stockStand(p, 0, 'lemon', 2);
  p.crumbTray.push({ colour: 'yellow', ingredient: 'lemon' });
  stockBoard(p, 'lemon', 1);
  stockBoard(rival, 'lemon', 9);
  calculateFinalScores(s);
  eq(p.score, STAND_ROW_VALUES[0][1] + 1 + 1 * FLAVOUR_VP_PER_TILE,
    'stand row + one crumb + ONE board lemon');
});

check('4f: calculateFinalScores is IDEMPOTENT', () => {
  // The two-pass change in the 6 August handoff §5.3 is exactly the kind of edit
  // that accidentally accumulates - a leaders Set computed inside the loop, or a
  // score that starts from player.score instead of 0.
  const s = newGame(3, { flavour: 'lemon' });
  stockBoard(s.players[0], 'lemon', 4);
  stockBoard(s.players[1], 'lemon', 4);
  stockBoard(s.players[2], 'lemon', 2);
  stockStand(s.players[0], 0, 'chocolate', 3);
  s.players[1].crumbTray.push({ colour: 'brown', ingredient: 'chocolate' });
  calculateFinalScores(s);
  const first = s.players.map(p => p.score);
  calculateFinalScores(s);
  calculateFinalScores(s);
  eq(s.players.map(p => p.score).join(','), first.join(','), 'three calls, one answer');
});

check('4g: THE MAJORITY IS RESOLVED BEFORE ANYBODY IS PAID', () => {
  // The failure mode the two-pass change exists to stop: a single loop pays the
  // FIRST player against an incomplete picture. Seat 0 is the one that would be
  // scored wrongly, so it is seat 0 that must NOT lead here.
  const s = newGame(3, { flavour: 'lemon' });
  stockBoard(s.players[0], 'lemon', 3);
  stockBoard(s.players[1], 'lemon', 8);
  stockBoard(s.players[2], 'lemon', 1);
  calculateFinalScores(s);
  eq(s.players[0].score, 3, 'seat 0 is scored against everybody, including seats it precedes');
  eq(s.players[1].score, 8 + FLAVOUR_MAJORITY_VP, 'the real leader takes the bonus');
});

// ---------------------------------------------------------------------------
// 5. The claim - the first opposed gradient the claim step has ever had
// ---------------------------------------------------------------------------

check('5a: a claim that sacrifices a Flavour tile reduces that count by exactly 1', () => {
  // The consequence the whole module hangs on. The sacrificed tile goes to the
  // stand, where it stops counting for this lane, so the claim costs 1 VP and
  // possibly the majority. It is a FEATURE: the claim was a purely positive act
  // until 6 August.
  const { s, p } = claimState({ tileIngredient: 'lemon', flavour: 'lemon' });
  eq(getFlavourCount(s, p), 1, 'setup: one lemon on the board');
  claim(s, 1, 0, { type: 'row', rowIndex: 0 });
  eq(getFlavourCount(s, p), 0, 'the sacrificed tile is off the board and stops counting');
  eq(p.stand[0].tiles.length, 1, 'it really is on the stand - it did not vanish');
});

check('5b: a claim that sacrifices a NON-Flavour tile leaves the count alone', () => {
  const { s, p } = claimState({ tileIngredient: 'chocolate', flavour: 'lemon' });
  stockBoard(p, 'lemon', 3, 10);
  eq(getFlavourCount(s, p), 3, 'setup');
  claim(s, 1, 0, { type: 'row', rowIndex: 0 });
  eq(getFlavourCount(s, p), 3, 'still three - the chocolate was the one given up');
});

check('5c: crumbing a Flavour tile costs the same as plating it', () => {
  // Both destinations are off the board, so both cost the point. The lane cannot
  // be dodged by choosing the tray.
  const { s, p } = claimState({ tileIngredient: 'lemon', flavour: 'lemon' });
  claim(s, 1, 0, { type: 'crumb' });
  eq(getFlavourCount(s, p), 0, 'the crumb tray is not the board either');
  eq(p.crumbTray.length, 1, 'and the tile is really in the tray');
});

check('5d: basicBot prefers to sacrifice a tile that is NOT the Flavour', () => {
  // THE TERM THAT DECIDES WHETHER ANY MEASUREMENT OF THIS MODULE MEANS ANYTHING.
  // Without it the bot cheerfully gives up its own Flavour tiles and the lane
  // measures as pure noise - see §6 of the handoff.
  //
  // The two pattern cells hold one lemon (the Flavour) and one almond, and the
  // card matches either way round, so the ONLY thing separating the two removals
  // is this term.
  const s = newGame(2, { flavour: 'lemon' });
  s.gamePhase = 'claim';
  s.currentPlayerIndex = 0;
  s.claimsThisTurn = 0;
  const p = s.players[0];
  p.board = Array(25).fill(null);
  p.board[0] = { colour: 'yellow', ingredient: 'lemon' };
  p.board[1] = { colour: 'yellow', ingredient: 'almond' };
  s.cardMarket = [REWARD_CARDS.find(c => c.id === 1)];

  const decision = bot.decideClaim(s);
  assert(decision, 'the bot still claims - the term is a preference, not a veto');
  eq(decision.removedBoardIndex, 1, 'it gives up the ALMOND and keeps the lemon');
});

// ---------------------------------------------------------------------------
// 6. NOTHING CHANGES THE FLAVOUR MID-GAME
// ---------------------------------------------------------------------------

check('6a: a pot of tea does not touch it', () => {
  // The structural claim. Today's Speciality and the Freshness Bonus were both
  // deleted because a reward on a reset cycle is never your last chance at it, and
  // a Flavour that could change would be the same mistake a third time.
  const s = newGame(2, { flavour: 'lemon' });
  armTeaTrigger(s);
  s.gamePhase = 'refill';
  refill(s);
  eq(s.flavourOfTheDay, 'lemon', 'the same ingredient after a full pot of tea');
});

check('6b: a claim and a turn rotation do not touch it', () => {
  const { s } = claimState({ tileIngredient: 'lemon', flavour: 'lemon' });
  claim(s, 1, 0, { type: 'row', rowIndex: 0 });
  eq(s.flavourOfTheDay, 'lemon', 'unchanged by the claim');
  refill(s);
  eq(s.flavourOfTheDay, 'lemon', 'and unchanged by the rotation that follows it');
});

check('6c: it survives a whole played-out game, at every player count', () => {
  // The construction tests above prove one pot and one claim. This proves it
  // against real play, where sweeps, trims, tea flushes and both end conditions
  // fire in their natural order and any of them could have grown a write.
  for (const pc of [2, 3, 4]) {
    let s = createGame(Array.from({ length: pc }, (_, i) => ({ name: `P${i + 1}` })), null, { flavour: 'lemon' });
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
      // Checked after EVERY phase step rather than once a turn, because a write
      // could be hiding in any of them - a tea flush inside refill being the
      // obvious candidate.
      eq(s.flavourOfTheDay, 'lemon', `${pc}p: the Flavour changed at step ${steps} (${s.gamePhase})`);
      steps++;
    }
    assert(s.gameOver, `${pc}p: the game finished (${steps} steps)`);

    // And the scores the engine produced really do contain this lane: recompute
    // the module by hand off the finished boards and check every player against it.
    const counts = s.players.map(p => countBoardIngredient(p.board, 'lemon'));
    const top = Math.max(...counts);
    const leaders = new Set(getFlavourLeaders(s));
    for (let i = 0; i < s.players.length; i++) {
      const expected = counts[i] * FLAVOUR_VP_PER_TILE + (top > 0 && counts[i] === top ? FLAVOUR_MAJORITY_VP : 0);
      eq(getFlavourCount(s, s.players[i]), counts[i], `${pc}p: seat ${i} count agrees with a hand read`);
      eq(leaders.has(s.players[i].id), top > 0 && counts[i] === top, `${pc}p: seat ${i} leadership agrees`);
      assert(s.players[i].score >= expected,
        `${pc}p: seat ${i} scored ${s.players[i].score}, which is less than the ${expected} this lane alone owes them`);
    }
  }
});

// ---------------------------------------------------------------------------
// 7. The A/B seam
// ---------------------------------------------------------------------------

check('7a: setFlavourEnabled(false) deals no Flavour and scores nothing', () => {
  // PRODUCTION CODE MUST NEVER CALL THE SETTER - this test restores it in a
  // finally, because the flag is module-level and a leak would silently disable
  // the module for every later test in the process.
  eq(getFlavourEnabled(), true, 'the module starts from the constant');
  try {
    setFlavourEnabled(false);
    const s = newGame(3);
    eq(s.flavourOfTheDay, null, 'no Flavour is drawn');
    assert(!isFlavourInPlay(s), 'and the module is not in play');

    // Even a pinned flavour is refused while the module is off - the seam wins.
    eq(newGame(2, { flavour: 'lemon' }).flavourOfTheDay, null, 'a pin cannot switch it back on');

    // A board stacked with every ingredient scores exactly its other lanes: an
    // empty stand, an empty tray and no cards is zero.
    for (const p of s.players) {
      for (const ingredient of INGREDIENTS) stockBoard(p, ingredient, 3, INGREDIENTS.indexOf(ingredient) * 3);
    }
    calculateFinalScores(s);
    for (const p of s.players) eq(p.score, 0, `${p.name} scores nothing from a full board`);
    eq(getFlavourLeaders(s).length, 0, 'and nobody leads');
  } finally {
    setFlavourEnabled(FLAVOUR_ENABLED);
  }
  eq(getFlavourEnabled(), true, 'the seam is restored for everything after this');
});

check('7b: the constants are the adopted values', () => {
  // Cheap, and it is the one place a re-dose would have to come through. 1 + 3 was
  // calibrated against the Tasting Menu at 5 VP: this module decides 12.9 / 17.9 /
  // 20.4% of games against the menu's 12.1 / 22.5 / 26.5%, consistently below it.
  // At 1 + 5 it reads 16.6 / 21.6 / 26.3% - a second Tasting Menu.
  eq(FLAVOUR_VP_PER_TILE, 1, 'one point a tile');
  eq(FLAVOUR_MAJORITY_VP, 3, 'three for the most - raise to 5 if it measures thin, never lower');
  eq(FLAVOUR_ENABLED, true, 'shipped on');
});

console.log(`\nRule tests for THE FLAVOUR OF THE DAY (6 August change set)\n`);
console.log(`  passed: ${passed}`);
console.log(`  failed: ${failures.length}`);
for (const f of failures) console.log(`    FAIL  ${f}`);
if (failures.length) process.exitCode = 1;
