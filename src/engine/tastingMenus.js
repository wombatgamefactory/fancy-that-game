// THE TASTING MENU DECK - the single definition, and the file every other one
// reads. Adopted 5 August 2026, replacing the Freshness Bonus outright.
//
// LIGHTENED 5 AUGUST, SAME DAY, FROM FOUR TILES TO THREE. The deck shipped as
// five 2/2 and five 2/1/1, every card demanding four tiles. It is now five 2/1
// and five 1/1/1, every card demanding THREE. The reason is the one the module
// was always going to be judged on - dead cardboard - and the lighter tier was
// already measured before the four-tile deck shipped: unsteered, a finished stand
// satisfies a 2/1 card 16.4% of the time and a 1/1/1 card 14.4%, against 6.8% for
// 2/2 and 6.7% for 2/1/1. Roughly 2.3x more reachable, and the menus stop being
// a thing only the leader can afford to chase.
//
// Ten cards, five 2/1 and five 1/1/1, balanced so every ingredient appears on
// exactly half the deck and is worth the same SIX tiles across it. Every card
// demands exactly THREE tiles, which is what lets both shapes carry one flat
// value (TASTING_MENU_VP) without a per-card table. That invariant is the whole
// reason to keep the two halves matched, so if the deck is ever revised again,
// revise both halves together.
//
// TASTING_MENU_VP WAS RE-DOSED FOR THIS DECK on 5 August - 8 down to 5, because
// three-tile cards are taken roughly twice as often. See the note on the constant
// in game.js, and re-dose it again if either half of this deck changes.
//
// THIS FILE MOVED HERE FROM goal-deck-2026-08-05.mjs when the module was built.
// That file is now a re-export shim so the two 5 August probes keep measuring the
// deck the engine actually deals rather than a copy of it. The name changed with
// the move: `goal` is ambiguous between the Patisserie Goals (the market row you
// claim from) and the deleted Pantry Goals, and the whole point of the naming
// rule is that the two live decks are never described in the same words.
//
// WHY TEN IS STILL THE ONLY DECK SIZE THAT MEETS THE BRIEF - and it is a proof,
// not a preference, so do not "round it up to twelve". The three-tile shapes hit
// the same wall the four-tile ones did, by a slightly different route:
//
//   2/1 cards name one doubled ingredient and one single, so a balanced set of k
//   needs k/5 doubles per ingredient AND k/5 singles: k must be a multiple of 5.
//   1/1/1 cards are the 3-subsets of the five ingredients. "Every ingredient
//   equally represented" over a set of m of them needs 3m/5 appearances each, so
//   m must be a multiple of 5 - and there are only C(5,3) = 10 such cards in
//   existence, so m is 5 or 10.
//   Half and half therefore forces an even total built from those two lists, and
//   the only one inside the 10-15 brief is 5 + 5 = 10.
//
// THE CONSTRUCTION IS THE SAME RING AS BEFORE, one tile lighter on each half,
// which is why the deck could be lightened without re-deriving anything. It is
// generated rather than typed so it stays balanced if the ingredient list ever
// changes. Lay the five ingredients on a ring. The 2/1 cards double each
// ingredient once and join it to its NEIGHBOUR (the old 2/2 adjacent pair, with
// one pip taken off the second ingredient). The 1/1/1 cards take each ingredient
// once and join it to the two ingredients OPPOSITE it on the ring (the old 2/1/1
// card, with the doubling dropped) - precisely the ones it is never paired with
// on a 2/1 card. That choice is what makes all ten ingredient pairings appear
// across the deck, each exactly twice.
//
// The eight balance checks that verify all of the above live in
// probe-goaldeck-2026-08-05.js, which imports THIS array.
import { INGREDIENTS } from './tiles.js';

const N = INGREDIENTS.length;
const at = (i) => INGREDIENTS[((i % N) + N) % N];

// Five pair-plus-one cards: double ingredient i, joined by its NEIGHBOUR on the
// ring. Two ingredients named, three tiles demanded. The name PAIR_MENUS is about
// the doubled ingredient - the pair of matching tiles the card asks for - and it
// kept its meaning through the lightening even though the card lost a pip.
export const PAIR_MENUS = Array.from({ length: N }, (_, i) => ({
  id: `t${i + 1}`,
  shape: '2/1',
  need: { [at(i)]: 2, [at(i + 1)]: 1 },
}));

// Five three-different cards: ingredient i and the two ingredients OPPOSITE it on
// the ring. Three ingredients named, three tiles demanded, nothing doubled.
export const TRIPLE_MENUS = Array.from({ length: N }, (_, i) => ({
  id: `t${N + i + 1}`,
  shape: '1/1/1',
  need: { [at(i)]: 1, [at(i + 2)]: 1, [at(i + 3)]: 1 },
}));

export const TASTING_MENUS = [...PAIR_MENUS, ...TRIPLE_MENUS];

// How many TILES a menu demands in total. THREE for every card in the deck by
// construction - this exists so a consumer (the UI, the art brief, a probe) can
// state that as a fact it read rather than one it assumed. It has already earned
// its keep once: the number changed from four to three on 5 August and every
// caller that went through here needed no edit.
export function menuTileCount(menu) {
  let total = 0;
  for (const need of Object.values(menu.need)) total += need;
  return total;
}

// Does a multiset of ingredients satisfy this menu? Ingredients are NOT consumed,
// so this is a pure read and two overlapping menus can both be satisfied by tiles
// that overlap. `counts` is an ingredient -> count map (getStandIngredients).
export function satisfies(counts, menu) {
  for (const [ingredient, need] of Object.entries(menu.need)) {
    if ((counts[ingredient] || 0) < need) return false;
  }
  return true;
}

// How many tiles short of this menu the given holding is - summed over the
// ingredients it still lacks. 0 means it qualifies. THE NATURAL HEURISTIC for
// the bots and the one thing the UI's "one tile short" highlight is a test of, so
// it lives here rather than being re-derived in three places.
export function deficit(counts, menu) {
  let short = 0;
  for (const [ingredient, need] of Object.entries(menu.need)) {
    short += Math.max(0, need - (counts[ingredient] || 0));
  }
  return short;
}
