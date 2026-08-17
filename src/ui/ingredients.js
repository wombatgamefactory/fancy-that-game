// ---------------------------------------------------------------------------
// THE FIVE INGREDIENTS, AS THE INTERFACE HAS TO SAY THEM (17 August)
// ---------------------------------------------------------------------------
//
// Three facts about an ingredient that are NOT the same fact, and this module
// exists because the rename of 17 August pulled them apart:
//
//   the ID       what the engine calls it            'citrus'
//   the LABEL    what a player reads                 'Citrus'
//   the ART      what the picture is a picture of    symbol-lemon-v3.png
//
// Until 17 August the id, the label and the filename were one string with
// different capitalisation, so nothing needed a module. Then lemon became Citrus,
// strawberry became Fruit and almond became Nuts (Dean's ruling, 11 August;
// swept through the code on the 17th), and every <img src> in the build was being
// assembled out of an id that no longer names a picture.
//
// IT IS ITS OWN FILE RATHER THAN A BLOCK IN board.js because motion.js needs it
// too - a flying tile clone carries the same symbol - and board.js already
// imports motion.js. Putting the map in board.js would have made that a cycle.
//
// THE ART DOES NOT MOVE, AND THAT IS THE RULE RATHER THAN A SHORTCUT. A lemon
// wheel IS Citrus, an almond IS Nuts, a strawberry IS Fruit; the picture is named
// for its SUBJECT and the id for its CATEGORY. Renaming the files would assert an
// equivalence the rename explicitly denies - see the note on INGREDIENTS in
// src/engine/tiles.js, which says the same thing from the other end.

// What a player reads. Keys are engine ids (src/engine/tiles.js, INGREDIENTS).
export const INGREDIENT_LABELS = {
  citrus: 'Citrus',
  chocolate: 'Chocolate',
  caramel: 'Caramel',
  fruit: 'Fruit',
  nuts: 'Nuts',
};

// Engine id -> image file stem. TOTAL, not a fallback with three exceptions: an
// ingredient added or renamed in the engine should surface here as a missing
// picture on the first render, rather than quietly requesting a 404 named after
// the new id.
//
// The -v3 files are the web-scale export (ticket 17, 9 August): 88px on the long
// side, which is 2x .ft-flavour__symbol at 44px, the largest box any of these is
// ever drawn in. The v1 files were 794 to 1200px and 531KB combined; these are
// 4.6KB. The originals stay in images/ under their old symbol_<subject>.png
// names, unreferenced, so the two can be compared.
export const INGREDIENT_ART = {
  citrus: 'lemon',
  chocolate: 'chocolate',
  caramel: 'caramel',
  fruit: 'strawberry',
  nuts: 'almond',
};

export function ingredientLabel(ingredient) {
  return INGREDIENT_LABELS[ingredient] || ingredient || '';
}

// The src for an ingredient's symbol. EVERY <img> in the build goes through here,
// so the id -> picture translation is stated once and cannot drift.
export function ingredientArt(ingredient) {
  return `images/symbol-${INGREDIENT_ART[ingredient] || ingredient}-v3.png`;
}

// "a nuts tile", "a citrus tile". None of the five ingredients starts with a
// vowel since the rename (it was "an almond" before), but an ingredient is
// dropped at random into a sentence, so the article stays derived rather than
// written - the next ingredient added may well need "an".
export function ingredientPhrase(ingredient) {
  const word = ingredientLabel(ingredient).toLowerCase();
  return `${/^[aeiou]/.test(word) ? 'an' : 'a'} ${word}`;
}
