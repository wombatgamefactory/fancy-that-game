// PROBE: how big is a cake stand really, and how often would a GOAL CARD complete?
//
// Two questions, and the first one decides the second.
//
// (1) Dean's recollection from the table is that players finish with 6-8 tiles in
//     the cake stand. Metric 10 of simulate.js reports 3.65 claims per player at
//     3p, and roughly one tile reaches the stand per claim, so the harness says
//     about half that. Both can be true at once if the DISTRIBUTION is wide and
//     the memorable games are the big ones - so this probe reports the whole
//     distribution and separates WINNERS from the field, rather than a mean.
//
// (2) Given whatever the real stand size is, how often can a goal card of each
//     shape actually be met? This is measured EMPIRICALLY rather than modelled,
//     which matters: a binomial over five uniform ingredients ignores both the
//     player's steering and the correlation the sweep imposes on what reaches the
//     stand. The model said 45% / 21% / 14% for 1-1-1 / 2-1-1 / 2-2 at seven
//     tiles; treat those as the null this probe tests.
//
//     Rates are averaged over EVERY ingredient combination of the shape, weighted
//     evenly, which is what "draw a goal card at random from a deck of that shape"
//     means. NOTE the rate below is the chance a player could satisfy a goal at
//     GAME END with no steering toward it whatsoever - a floor, not a forecast,
//     because a real player who can see the card plays toward it.
//
// Read-only: the engine is not touched, only inspected after the game ends.
import {
  createGame, sweep, takeBonusTile, declineBonusTile, takeExtraTile, place, claim,
  skipClaim, skipSpend, moveTile, removePlate, reserveCard, refill,
  calculateFinalScores, getWinningPlayers, INGREDIENTS, STAND_ROW_VALUES,
} from './src/engine/game.js';
import { createStatsCollector } from './src/engine/statsCollector.js';
import * as basicBot from './src/bots/basicBot.js';
import { GOAL_DECK, satisfies } from './goal-deck-2026-08-05.mjs';

function runGame(playerConfigs) {
  const strategy = basicBot;
  let gameState = createGame(playerConfigs, createStatsCollector());
  let steps = 0;
  while (!gameState.gameOver && steps < 1000) {
    switch (gameState.gamePhase) {
      case 'sweep': {
        if (gameState.bonusTileAvailable) {
          const b = strategy.decideBonusTile ? strategy.decideBonusTile(gameState) : null;
          gameState = (b !== null && b !== undefined && gameState.market[b])
            ? takeBonusTile(gameState, b) : declineBonusTile(gameState);
          break;
        }
        const d = strategy.decideSweep(gameState);
        if (d) gameState = sweep(gameState, d.rowOrCol, d.isRow, d.declaration, d.declarationType);
        else gameState.gamePhase = 'place';
        break;
      }
      case 'place': {
        const extra = strategy.decideExtraTile ? strategy.decideExtraTile(gameState) : null;
        if (extra !== null && extra !== undefined) gameState = takeExtraTile(gameState, extra);
        gameState = place(gameState, strategy.decidePlacements(gameState));
        break;
      }
      case 'spend': {
        const m = strategy.decideMove ? strategy.decideMove(gameState) : null;
        if (m) gameState = moveTile(gameState, m.fromIndex, m.toIndex);
        const rp = strategy.decideRemovePlate ? strategy.decideRemovePlate(gameState) : null;
        if (rp !== null && rp !== undefined) gameState = removePlate(gameState, rp);
        const rc = strategy.decideReserve ? strategy.decideReserve(gameState) : null;
        if (rc !== null && rc !== undefined) gameState = reserveCard(gameState, rc);
        gameState = skipSpend(gameState);
        break;
      }
      case 'claim': {
        const d = strategy.decideClaim(gameState);
        if (d && d.cardId) gameState = claim(gameState, d.cardId, d.removedBoardIndex, d.destination);
        else gameState = skipClaim(gameState);
        break;
      }
      case 'refill':
        gameState = refill(gameState);
        break;
    }
    steps++;
  }
  if (gameState.gameOver) calculateFinalScores(gameState);
  const winners = getWinningPlayers(gameState);
  return gameState.players.map(p => ({
    won: winners.some(w => w.id === p.id),
    score: p.score,
    claims: p.claimedCards.length,
    turns: gameState.stats.turnsPlayed,
    // The ingredient multiset of the cake stand is the ONLY thing a goal card
    // reads, so that is what is recorded. Row shape is recorded separately
    // because "breaking the pyramid" is a claim about rows, not ingredients.
    counts: countIngredients(p.stand),
    total: p.stand.reduce((n, r) => n + r.tiles.length, 0),
    rowFill: p.stand.map(r => r.tiles.length),
    // Recomputed here from the same table calculateFinalScores uses, PURELY as a
    // cross-check: it must land on metric 10's stand VP. If it does not, this
    // probe is reading a different structure from the one that scores.
    standVp: p.stand.reduce((v, r, i) => v + (r.tiles.length ? STAND_ROW_VALUES[i][r.tiles.length - 1] : 0), 0),
  }));
}

function countIngredients(stand) {
  const c = {};
  for (const ing of INGREDIENTS) c[ing] = 0;
  for (const row of stand) for (const t of row.tiles) if (t && t.ingredient) c[t.ingredient]++;
  return c;
}

// Every unordered ingredient selection of a given shape. A shape is a list of
// REQUIRED COUNTS, e.g. [2,1,1] means one ingredient twice and two others once.
// Ingredients with equal requirements are interchangeable, so combinations are
// generated over distinct ingredient sets and each distinct assignment counted once.
function goalsOfShape(shape) {
  // Enumerate every injective ingredient->requirement assignment, then dedupe by
  // the canonical (ingredient:need) map so that equal requirements are treated as
  // interchangeable: [2,1,1] over {a,b,c} is the three distinct cards
  // (2a+b+c, 2b+a+c, 2c+a+b), not six orderings. Cheap at n=5.
  const out = [];
  const n = INGREDIENTS.length;
  const seen = new Set();
  const rec = (chosen, used) => {
    if (chosen.length === shape.length) {
      const key = chosen.map(c => `${c.ing}:${c.need}`).sort().join('|');
      if (!seen.has(key)) { seen.add(key); out.push([...chosen]); }
      return;
    }
    for (let i = 0; i < n; i++) {
      if (used.has(i)) continue;
      used.add(i);
      chosen.push({ ing: INGREDIENTS[i], need: shape[chosen.length] });
      rec(chosen, used);
      chosen.pop();
      used.delete(i);
    }
  };
  out.length = 0; seen.clear();
  rec([], new Set());
  return out;
}

const SHAPES = [
  { name: '1/1/1  (3 different)', shape: [1, 1, 1] },
  { name: '2/1/1  (a pair + 2)  ', shape: [2, 1, 1] },
  { name: '2/2    (2 pairs)     ', shape: [2, 2] },
  { name: '1/1    (2 different) ', shape: [1, 1] },
  { name: '2/1    (a pair + 1)  ', shape: [2, 1] },
  { name: '3/2    (a triple+pair)', shape: [3, 2] },
];

const GAMES = parseInt(process.argv[2]) || 2000;
const PLAYERS = parseInt(process.argv[3]) || 3;

const cfg = Array.from({ length: PLAYERS }, (_, i) => ({ id: i, name: `P${i}`, type: 'ai' }));
const all = [];
for (let g = 0; g < GAMES; g++) all.push(...runGame(cfg));

const winners = all.filter(r => r.won);
const totals = all.map(r => r.total).sort((a, b) => a - b);
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const pct = (xs, p) => xs[Math.min(xs.length - 1, Math.floor(p * xs.length))];

console.log(`\nGOAL-CARD FEASIBILITY - ${GAMES} games at ${PLAYERS}p, basic bot (${all.length} player-results)\n`);

console.log('=== 1. HOW BIG IS A CAKE STAND? ===\n');
console.log(`Tiles in stand, all players: mean=${mean(all.map(r => r.total)).toFixed(2)}  median=${pct(totals, 0.5)}  p90=${pct(totals, 0.9)}  max=${totals[totals.length - 1]}`);
console.log(`Tiles in stand, WINNERS ONLY: mean=${mean(winners.map(r => r.total)).toFixed(2)}  max=${Math.max(...winners.map(r => r.total))}`);
console.log(`CROSS-CHECK vs simulate.js metric 10: standVp=${mean(all.map(r => r.standVp)).toFixed(2)} (expect 10.3)  score=${mean(all.map(r => r.score)).toFixed(1)} (expect 24.3)  claims=${mean(all.map(r => r.claims)).toFixed(2)} (expect 3.65)  turns=${mean(all.map(r => r.turns)).toFixed(1)} (expect 49.5)`);
const hist = {};
for (const r of all) hist[r.total] = (hist[r.total] || 0) + 1;
const capacity = STAND_ROW_VALUES.reduce((n, row) => n + row.length, 0);
console.log(`Distribution (stand capacity is ${capacity} tiles):`);
for (const k of Object.keys(hist).map(Number).sort((a, b) => a - b)) {
  const share = (100 * hist[k]) / all.length;
  console.log(`  ${String(k).padStart(2)} tiles: ${share.toFixed(1).padStart(5)}%  ${'#'.repeat(Math.round(share / 2))}`);
}
console.log(`\nShare of players reaching 6+ tiles: ${(100 * all.filter(r => r.total >= 6).length / all.length).toFixed(1)}%`);
console.log(`Share of WINNERS reaching 6+ tiles: ${(100 * winners.filter(r => r.total >= 6).length / winners.length).toFixed(1)}%`);

console.log('\n=== 2. THE PYRAMID - mean tiles per row ===\n');
console.log('Row 1 is the bottom (4 slots), row 4 the top (1 slot). If players really do');
console.log('fill bottom-up, row 1 should be near-full before row 2 has anything.');
for (let i = 0; i < STAND_ROW_VALUES.length; i++) {
  const m = mean(all.map(r => r.rowFill[i] || 0));
  const cap = STAND_ROW_VALUES[i].length;
  console.log(`  row ${i + 1} (${cap} slots, up to ${STAND_ROW_VALUES[i][cap - 1]} VP): mean=${m.toFixed(2)}  full in ${(100 * all.filter(r => (r.rowFill[i] || 0) === cap).length / all.length).toFixed(1)}% of stands`);
}

console.log('\n=== 3. GOAL COMPLETION RATE BY SHAPE (no steering - a FLOOR) ===\n');
console.log('Rate = share of finished stands that already satisfy a goal card of that');
console.log('shape, averaged evenly over every ingredient combination of the shape.\n');
console.log('shape                    cards   all players   winners   ratio W/all');
for (const { name, shape } of SHAPES) {
  const goals = goalsOfShape(shape);
  const rate = (rows) => {
    let hits = 0;
    for (const r of rows) for (const goal of goals) if (goal.every(g => r.counts[g.ing] >= g.need)) hits++;
    return (100 * hits) / (rows.length * goals.length);
  };
  const a = rate(all), w = rate(winners);
  console.log(`${name}  ${String(goals.length).padStart(4)}   ${a.toFixed(1).padStart(9)}%  ${w.toFixed(1).padStart(7)}%   ${(w / a).toFixed(2).padStart(6)}x`);
}

console.log('\n=== 4. IF N GOALS ARE DEALT, HOW MANY GET MET? ===\n');
console.log('Draws N goal cards of the given shape at random per game and counts how many');
console.log('are satisfied by at least one player. This is the RACE test: a shape where');
console.log('every card is met by somebody has no scarcity, one where none is met is dead.\n');
for (const { name, shape } of SHAPES) {
  const goals = goalsOfShape(shape);
  if (goals.length < PLAYERS) continue;
  let metTotal = 0, contested = 0, games = 0;
  for (let g = 0; g < all.length; g += PLAYERS) {
    const table = all.slice(g, g + PLAYERS);
    if (table.length < PLAYERS) break;
    games++;
    // Deal PLAYERS goals without replacement, deterministically strided so the
    // probe stays reproducible (no Math.random - see the harness convention).
    const stride = 1 + ((g / PLAYERS) % (goals.length - 1));
    const dealt = [];
    for (let k = 0; k < PLAYERS; k++) dealt.push(goals[(((g / PLAYERS) + k * stride) | 0) % goals.length]);
    for (const goal of dealt) {
      const n = table.filter(r => goal.every(x => r.counts[x.ing] >= x.need)).length;
      if (n > 0) metTotal++;
      if (n > 1) contested++;
    }
  }
  console.log(`${name}  of ${PLAYERS} dealt: ${(metTotal / games).toFixed(2)} met by someone, ${(contested / games).toFixed(2)} wanted by 2+ players (the actual race)`);
}
console.log('');

// ---------------------------------------------------------------------------
// SECTION 5: THE DOSE, using the REAL ten-card deck.
//
// This is the section that sets the VP value, so it uses the actual deck rather
// than a shape average. Two things it is measuring that a shape average cannot:
//
//   (a) INGREDIENTS ARE NOT CONSUMED, so two dealt cards that overlap can both be
//       satisfied by a stand that only just covers the union. 2 lemon + 2 chocolate
//       and 2 lemon + caramel + strawberry need six tiles between them, not eight.
//       If that happens often, the dose is double what one card's value suggests.
//
//   (b) A goal is taken by ONE player. Qualifying is not the same as scoring, so
//       both are reported: qualification is the ceiling, the greedy allocation
//       below is the realistic figure.
//
// STILL UNSTEERED. The bot has never heard of goal cards, so every number here is
// a floor. What it tells you is the SHAPE of the dose, not its level.
console.log('=== 5. THE DOSE - the real 10-card deck, unsteered ===\n');
{
  const dealt = (gameIndex) => {
    // Deterministic deal without replacement: stride through the deck so the
    // sample covers many combinations without Math.random (harness convention).
    const stride = 1 + (gameIndex % (GOAL_DECK.length - 1));
    const out = [];
    const used = new Set();
    let k = 0;
    while (out.length < PLAYERS && k < GOAL_DECK.length * 2) {
      const idx = (gameIndex + k * stride) % GOAL_DECK.length;
      if (!used.has(idx)) { used.add(idx); out.push(GOAL_DECK[idx]); }
      k++;
    }
    return out;
  };

  let games = 0, qualSum = 0, awardSum = 0, goalsAwarded = 0, goalsDead = 0, contestedGoals = 0;
  const qualHist = {}, awardHist = {};
  for (let g = 0; g < all.length; g += PLAYERS) {
    const table = all.slice(g, g + PLAYERS);
    if (table.length < PLAYERS) break;
    const cards = dealt(games);
    games++;

    const qual = table.map(r => cards.filter(c => satisfies(r.counts, c)).length);
    for (const q of qual) { qualSum += q; qualHist[q] = (qualHist[q] || 0) + 1; }

    // Award each card to one qualifying player, giving it to whoever has taken
    // fewest so far. That is not turn order - it is the NEUTRAL split, and it
    // deliberately avoids flattering the module by letting one player sweep.
    const awarded = new Array(PLAYERS).fill(0);
    for (const card of cards) {
      const eligible = [];
      for (let p = 0; p < PLAYERS; p++) if (satisfies(table[p].counts, card)) eligible.push(p);
      if (eligible.length === 0) { goalsDead++; continue; }
      if (eligible.length > 1) contestedGoals++;
      eligible.sort((a, b) => awarded[a] - awarded[b]);
      awarded[eligible[0]]++;
      goalsAwarded++;
    }
    for (const a of awarded) { awardSum += a; awardHist[a] = (awardHist[a] || 0) + 1; }
  }

  const pr = (hist, label) => {
    const keys = Object.keys(hist).map(Number).sort((a, b) => a - b);
    console.log(`  ${label}: ` + keys.map(k => `${k} goals ${((100 * hist[k]) / (games * PLAYERS)).toFixed(1)}%`).join('   '));
  };
  console.log(`Cards dealt per game: ${PLAYERS} (one per player) from a deck of ${GOAL_DECK.length}\n`);
  console.log(`Goals a player QUALIFIES for at game end: mean=${(qualSum / (games * PLAYERS)).toFixed(2)}  (the ceiling)`);
  pr(qualHist, 'qualification');
  console.log(`Goals a player is AWARDED after the race:  mean=${(awardSum / (games * PLAYERS)).toFixed(2)}  (the realistic figure)`);
  pr(awardHist, 'awards      ');
  console.log(`\nOf the ${PLAYERS} cards dealt: ${(goalsAwarded / games).toFixed(2)} taken, ${(goalsDead / games).toFixed(2)} die unclaimed (${((100 * goalsDead) / (goalsDead + goalsAwarded)).toFixed(0)}% dead cardboard)`);
  console.log(`Cards wanted by 2+ players: ${(contestedGoals / games).toFixed(2)} per game - THIS IS THE RACE, and unsteered it is the number to be sceptical of`);

  // HOW FAR IS A STAND FROM QUALIFYING?
  //
  // The bot cannot steer, so the rates above are a floor. This is the cheap proxy
  // for what steering would buy: the DEFICIT is how many additional tiles of the
  // right ingredients a finished stand would have needed. A deficit of 1 is a
  // stand that one redirected claim would have converted - and a player has about
  // six claims, so a deficit of 1 or 2 is comfortably inside steering range. A
  // deficit of 3+ means the card was never reachable and no amount of play
  // converts it.
  //
  // Reported against the DEALT cards (what the player can actually chase) and
  // against the whole deck (what a bigger deal would offer).
  const deficit = (counts, card) => {
    let d = 0;
    for (const [ing, need] of Object.entries(card.need)) d += Math.max(0, need - (counts[ing] || 0));
    return d;
  };
  const dealtDef = {}, deckDef = {};
  let games2 = 0;
  for (let g = 0; g < all.length; g += PLAYERS) {
    const table = all.slice(g, g + PLAYERS);
    if (table.length < PLAYERS) break;
    const cards = dealt(games2);
    games2++;
    for (const r of table) {
      const a = Math.min(...cards.map(c => deficit(r.counts, c)));
      const b = Math.min(...GOAL_DECK.map(c => deficit(r.counts, c)));
      dealtDef[a] = (dealtDef[a] || 0) + 1;
      deckDef[b] = (deckDef[b] || 0) + 1;
    }
  }
  const showDef = (hist, label) => {
    const keys = Object.keys(hist).map(Number).sort((a, b) => a - b);
    const total = keys.reduce((n, k) => n + hist[k], 0);
    console.log(`  ${label}: ` + keys.map(k => `${k} short ${((100 * hist[k]) / total).toFixed(1)}%`).join('   '));
  };
  console.log('\nDISTANCE TO THE NEAREST GOAL (tiles short at game end - the steering headroom):');
  showDef(dealtDef, `nearest of the ${PLAYERS} dealt `);
  showDef(deckDef, 'nearest in the full deck');

  // HOW MANY CARDS SHOULD BE DEALT? Deal size and card value both set the dose,
  // so they cannot be chosen separately. This sweeps the deal and reports what
  // each size does to dead cardboard and to awards per player.
  console.log('\nDEAL SIZE SWEEP (unsteered - awards are floors, dead-cardboard shares are ceilings):\n');
  console.log('  dealt   qualify>=1   awarded/player   dead cardboard   1-tile-short');
  for (let deal = PLAYERS; deal <= 7; deal++) {
    let gm = 0, aw = 0, dead = 0, taken = 0, qual1 = 0, near1 = 0;
    for (let g = 0; g < all.length; g += PLAYERS) {
      const table = all.slice(g, g + PLAYERS);
      if (table.length < PLAYERS) break;
      const stride = 1 + (gm % (GOAL_DECK.length - 1));
      const cards = []; const used = new Set();
      for (let k = 0; cards.length < deal && k < GOAL_DECK.length * 2; k++) {
        const idx = (gm + k * stride) % GOAL_DECK.length;
        if (!used.has(idx)) { used.add(idx); cards.push(GOAL_DECK[idx]); }
      }
      gm++;
      const awarded = new Array(PLAYERS).fill(0);
      for (const card of cards) {
        const el = [];
        for (let p = 0; p < PLAYERS; p++) if (satisfies(table[p].counts, card)) el.push(p);
        if (!el.length) { dead++; continue; }
        el.sort((a, b) => awarded[a] - awarded[b]);
        awarded[el[0]]++; taken++;
      }
      for (let p = 0; p < PLAYERS; p++) {
        aw += awarded[p];
        if (cards.some(c => satisfies(table[p].counts, c))) qual1++;
        else if (Math.min(...cards.map(c => deficit(table[p].counts, c))) === 1) near1++;
      }
    }
    const n = gm * PLAYERS;
    console.log(`  ${String(deal).padStart(5)}   ${((100 * qual1) / n).toFixed(1).padStart(9)}%   ${(aw / n).toFixed(2).padStart(14)}   ${((100 * dead) / (dead + taken)).toFixed(0).padStart(14)}%   ${((100 * near1) / n).toFixed(1).padStart(11)}%`);
  }

  console.log('\nVP DOSE at candidate card values (mean VP per player from the module):');
  const perPlayer = awardSum / (games * PLAYERS);
  for (const vp of [4, 6, 8, 10, 12]) {
    const dose = perPlayer * vp;
    // The unsteered award rate is a floor, so the second column projects the dose
    // at a plausible STEERED rate. 0.55 is taken from the deficit table: 19%
    // already qualify and 44% are one tile short, and one redirected claim of six
    // converts a 1-short player, so roughly half to two-thirds should land a goal.
    const steered = 0.55 * vp;
    console.log(`  ${String(vp).padStart(2)} VP/card -> unsteered ${dose.toFixed(2)} VP/player (${((100 * dose) / 48.7).toFixed(1)}%), projected at a 0.55 steered rate ${steered.toFixed(1)} VP/player (${((100 * steered) / 48.7).toFixed(1)}% of 48.7)`);
  }
  console.log('  (the Freshness Bonus this replaces pays 9.0 VP/player, 18.5% - measured too high)');
}
console.log('');
