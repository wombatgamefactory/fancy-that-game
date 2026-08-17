// PROBE: read the TASTING MENU deck out of the engine and verify it is balanced.
//
// The brief: half the deck one shape, half the other, every ingredient equally
// represented, 10-15 cards, every card the same number of tiles. This file CHECKS
// the deck rather than asserting it, because the balance conditions are easy to
// get one short and impossible to see by eye.
//
// IT NO LONGER NAMES THE SHAPES. The deck was lightened from four tiles per card
// (2/2 + 2/1/1) to three (2/1 + 1/1/1) on 5 August, and every label below now
// reads the shape strings off the cards themselves. That is deliberate: a probe
// that hardcodes what it expects to find will pass while printing a lie the next
// time the deck moves. The one thing it does still assert about tiles is that
// EVERY CARD COSTS THE SAME, which is what lets both halves carry one flat VP.
//
// WHY 10 IS THE ONLY DECK SIZE THAT MEETS THE BRIEF - true of both the four-tile
// and the three-tile deck, by the same argument:
//
//   A doubled-ingredient card (2/2 or 2/1) is constrained by its doubles: a
//   balanced set of k needs k/5 doubles per ingredient, so k is a multiple of 5.
//   For 2/2 specifically the cards are the edges of a graph on the five
//   ingredients, every vertex the same degree d; sum of degrees = 2 x edges, so
//   5d is even, d is even, and the half is 0, 5 or 10 cards. THERE IS NO BALANCED
//   SET OF 6, 7, 8 OR 9.
//
//   The three-ingredient card (2/1/1 or 1/1/1) is constrained the same way: 5 | k
//   from the doubles for 2/1/1, and for 1/1/1 from every ingredient needing 3k/5
//   appearances. C(5,3) = 10 caps the 1/1/1 half at ten cards in existence.
//
//   Half and half therefore forces an even total built from those two lists, and
//   the only one inside 10-15 is 5 + 5 = 10.
//
// THE CONSTRUCTION
//
//   Lay the five ingredients on a ring. One half joins each ingredient to its
//   NEIGHBOUR (2 citrus + chocolate); the other half joins each ingredient to the
//   two OPPOSITE it (caramel + fruit + nuts) - precisely the ones it is
//   never paired with on the first half's cards. The check below confirms the
//   side effect that makes this the right choice of the several balanced options:
//   all ten ingredient pairings appear across the deck, each exactly twice.
//
// Run with a path as the first argument to also WRITE THE DECK OUT AS CSV, one
// column per ingredient holding the number of that ingredient the card demands.
// The file is generated from the same array the checks above run against, so a
// deck that fails a check cannot be exported.
import { INGREDIENTS } from './src/engine/tiles.js';
import { writeFileSync } from 'node:fs';
import { GOAL_DECK, PAIR_CARDS, TRIPLE_CARDS } from './goal-deck-2026-08-05.mjs';

const N = INGREDIENTS.length;
const pairCards = PAIR_CARDS;
const tripleCards = TRIPLE_CARDS;
const deck = GOAL_DECK;

// ---- checks ----------------------------------------------------------------
let failures = 0;
const check = (label, ok, detail) => {
  if (!ok) failures++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`);
};

const cardsWith = {}, pips = {}, doubles = {}, singles = {};
for (const ing of INGREDIENTS) { cardsWith[ing] = 0; pips[ing] = 0; doubles[ing] = 0; singles[ing] = 0; }
for (const card of deck) {
  for (const [ing, n] of Object.entries(card.need)) {
    cardsWith[ing]++;
    pips[ing] += n;
    if (n === 2) doubles[ing]++; else singles[ing]++;
  }
}

// Every unordered ingredient PAIRING that appears on some card, counted.
const pairings = {};
for (const card of deck) {
  const ings = Object.keys(card.need).sort();
  for (let a = 0; a < ings.length; a++) {
    for (let b = a + 1; b < ings.length; b++) {
      const key = `${ings[a]}+${ings[b]}`;
      pairings[key] = (pairings[key] || 0) + 1;
    }
  }
}

const uniform = (obj) => new Set(Object.values(obj)).size === 1;

// Read the two shape names off the cards rather than naming them here, so this
// probe reports the deck it was handed and not the one it was written against.
const shapeOf = (cards) => cards[0]?.shape ?? '?';
const pairShape = shapeOf(pairCards), tripleShape = shapeOf(tripleCards);
const tileCounts = {};
for (const card of deck) {
  const n = Object.values(card.need).reduce((a, b) => a + b, 0);
  tileCounts[n] = (tileCounts[n] || 0) + 1;
}
const tilesPerCard = Object.keys(tileCounts).length === 1 ? Number(Object.keys(tileCounts)[0]) : null;

console.log(`\nTASTING MENU DECK - ${deck.length} cards (${pairCards.length} x ${pairShape}, ${tripleCards.length} x ${tripleShape}), ${tilesPerCard ?? '?'} tiles each\n`);
console.log('=== THE DECK ===\n');
for (const card of deck) {
  const text = Object.entries(card.need)
    .sort((a, b) => b[1] - a[1])
    .map(([ing, n]) => (n === 2 ? `2 ${ing}` : ing))
    .join(' + ');
  console.log(`  ${card.shape.padEnd(6)} ${text}`);
}

console.log('\n=== BALANCE CHECKS ===\n');
check('every ingredient on the same number of cards', uniform(cardsWith), JSON.stringify(cardsWith));
check('every ingredient worth the same total tiles', uniform(pips), JSON.stringify(pips));
check('every ingredient doubled the same number of times', uniform(doubles), JSON.stringify(doubles));
check('every ingredient a single the same number of times', uniform(singles), JSON.stringify(singles));
check(`deck is exactly half ${pairShape} and half ${tripleShape}`, pairCards.length === tripleCards.length);
// THE NINTH CHECK, added 5 August with the lightening to three tiles. Both halves
// costing the same is what lets one flat TASTING_MENU_VP price the whole deck, and
// it was previously only true by construction and stated in a comment. A deck that
// mixes a 3-tile and a 4-tile card is not wrong, but it needs a per-card value, so
// this failing is a signal to go and look at the VP constant rather than the deck.
check('every card demands the same number of tiles', tilesPerCard !== null, `${JSON.stringify(tileCounts)} (tiles -> cards)`);
check(`all ${(N * (N - 1)) / 2} ingredient pairings appear`, Object.keys(pairings).length === (N * (N - 1)) / 2, `${Object.keys(pairings).length} distinct`);
check('each pairing appears the same number of times', uniform(pairings), JSON.stringify(pairings));
check('no duplicate cards', new Set(deck.map(c => Object.entries(c.need).sort().map(e => e.join(':')).join('|'))).size === deck.length);

console.log(`\n=== HOW OFTEN IS EACH INGREDIENT ASKED FOR? ===\n`);
console.log('  cards mentioning it   :', cardsWith[INGREDIENTS[0]], `of ${deck.length} (${((100 * cardsWith[INGREDIENTS[0]]) / deck.length).toFixed(0)}% of the deck)`);
console.log('  tiles demanded across the deck:', pips[INGREDIENTS[0]]);
console.log('  doubled on:', doubles[INGREDIENTS[0]], 'cards, a single on:', singles[INGREDIENTS[0]], 'cards');

console.log(`\n${failures === 0 ? 'ALL CHECKS PASS' : `${failures} CHECK(S) FAILED`}\n`);

// Export only a deck that passed, so the spreadsheet can never disagree with the
// checks. Columns: card number, shape, then one per ingredient carrying the count
// demanded (0, 1 or 2), then the total tiles the card costs.
const csvPath = process.argv[2];
if (csvPath) {
  if (failures > 0) {
    console.log('NOT WRITING CSV - the deck failed a balance check.\n');
    process.exit(1);
  }
  const header = ['Card', 'Shape', ...INGREDIENTS, 'Tiles'];
  const rows = deck.map((card, i) => [
    i + 1,
    // LEADING APOSTROPHE IS DELIBERATE - it is Excel's force-to-text marker, and
    // without it "2/1" opens as 1 February and "1/1/1" as a date too. The engine's
    // shape strings stay clean; the guard belongs to the export, not the data. The
    // v1 spreadsheet carried this and losing it in a regeneration is silent.
    `'${card.shape}`,
    ...INGREDIENTS.map(ing => card.need[ing] || 0),
    Object.values(card.need).reduce((a, b) => a + b, 0),
  ]);
  // A totals row makes the balance visible in the spreadsheet itself rather than
  // only in this probe's output.
  const totals = ['TOTAL', `${deck.length} cards`, ...INGREDIENTS.map(ing => pips[ing]), rows.reduce((n, r) => n + r[r.length - 1], 0)];
  const csv = [header, ...rows, totals].map(r => r.join(',')).join('\r\n') + '\r\n';
  writeFileSync(csvPath, csv, 'utf8');
  console.log(`Wrote ${deck.length} cards to ${csvPath}\n`);
}

process.exit(failures === 0 ? 0 : 1);
