// RE-EXPORT SHIM. The deck this file used to define moved into the engine on
// 5 August when the module was built, and was renamed with the move:
// src/engine/tastingMenus.js, exporting TASTING_MENUS / PAIR_MENUS /
// TRIPLE_MENUS.
//
// The two 5 August probes (probe-goaldeck-2026-08-05.js and
// probe-goalcards-2026-08-05.js) are the baseline this build is measured against
// and are kept verbatim, so they still import GOAL_DECK from here. Pointing those
// names at the engine's array rather than leaving a copy behind is the whole
// purpose of the file: the eight balance checks now verify the deck the game
// actually deals, which is what test 14 of the tasting-menu suite asserts.
//
// NOTHING NEW SHOULD IMPORT THIS. New code reads src/engine/tastingMenus.js and
// uses the tastingMenu vocabulary - `goal` is ambiguous between the Patisserie
// Goals and the deleted Pantry Goals.
export {
  TASTING_MENUS as GOAL_DECK,
  PAIR_MENUS as PAIR_CARDS,
  TRIPLE_MENUS as TRIPLE_CARDS,
  satisfies,
} from './src/engine/tastingMenus.js';
