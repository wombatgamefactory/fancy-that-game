// Card definitions (from reward_cards.csv)
// Each card: id, name, family (cosmetic ingredient family — art/grouping only, no
// mechanical effect), pattern (3×2 grid with nulls), vp (per-card victory points,
// data-driven from reward_cards.csv — no fixed band)
export const REWARD_CARDS = [
  { id: 1, name: 'Lemon madeleine', family: 'lemon', pattern: ["yellow","yellow",null,null,null,null], vp: 1 },
  { id: 2, name: 'Tarte au citron', family: 'lemon', pattern: ["yellow","yellow","yellow",null,null,null], vp: 2 },
  { id: 3, name: 'Pink grapefruit tartelette', family: 'lemon', pattern: ["pink","pink","green",null,null,null], vp: 2 },
  { id: 4, name: 'Orange marmalade slice', family: 'lemon', pattern: ["orange","orange","blue",null,null,null], vp: 2 },
  { id: 5, name: 'Lemon meringue pie', family: 'lemon', pattern: ["pink","yellow","pink",null,"yellow",null], vp: 4 },
  { id: 6, name: 'Earl Grey financier', family: 'lemon', pattern: [null,"blue","blue","yellow","yellow",null], vp: 3 },
  { id: 7, name: 'Key lime & blueberry tart', family: 'lemon', pattern: ["green","blue",null,"blue","green",null], vp: 5 },
  { id: 8, name: 'Blood orange tart', family: 'lemon', pattern: [null,"orange","orange","pink","pink",null], vp: 3 },
  { id: 9, name: 'Yuzu tart', family: 'lemon', pattern: ["green","green",null,"pink","orange",null], vp: 5 },
  { id: 10, name: 'Lime & Earl Grey drizzle cake', family: 'lemon', pattern: ["blue","green","blue",null,"green",null], vp: 4 },
  { id: 11, name: 'Chocolate-orange truffle', family: 'chocolate', pattern: ["orange","orange",null,null,null,null], vp: 1 },
  { id: 12, name: 'Chocolate-cherry tart', family: 'chocolate', pattern: ["pink","pink","yellow",null,null,null], vp: 2 },
  { id: 13, name: 'Chocolate-mint truffle', family: 'chocolate', pattern: ["green","green","blue",null,null,null], vp: 2 },
  { id: 14, name: 'Chocolate-hazelnut praliné', family: 'chocolate', pattern: ["blue","orange","blue",null,null,null], vp: 2 },
  { id: 15, name: 'Black Forest gateau', family: 'chocolate', pattern: [null,"pink","pink","yellow","yellow",null], vp: 3 },
  { id: 16, name: 'Sachertorte', family: 'chocolate', pattern: ["yellow","orange","yellow",null,"orange",null], vp: 4 },
  { id: 17, name: 'Pistachio chocolate religieuse', family: 'chocolate', pattern: [null,"green","green","pink","pink",null], vp: 3 },
  { id: 18, name: 'Chocolate-blueberry tartelette', family: 'chocolate', pattern: ["yellow","blue",null,"blue","yellow",null], vp: 5 },
  { id: 19, name: 'Opéra cake', family: 'chocolate', pattern: ["blue","yellow","blue",null,"yellow",null], vp: 4 },
  { id: 20, name: 'Florentine', family: 'chocolate', pattern: ["blue","blue",null,"pink","green",null], vp: 5 },
  { id: 21, name: 'Crème brûlée', family: 'caramel', pattern: ["yellow","orange",null,null,null,null], vp: 1 },
  { id: 22, name: 'Canelé', family: 'caramel', pattern: ["orange","orange","pink",null,null,null], vp: 2 },
  { id: 23, name: 'Tarte Tatin', family: 'caramel', pattern: ["green","green","orange",null,null,null], vp: 2 },
  { id: 24, name: 'Crème caramel', family: 'caramel', pattern: ["yellow","orange","orange",null,null,null], vp: 2 },
  { id: 25, name: 'Salted caramel tart', family: 'caramel', pattern: [null,"orange","orange","pink","pink",null], vp: 3 },
  { id: 26, name: 'Sticky toffee pudding', family: 'caramel', pattern: [null,"orange","orange","yellow","yellow",null], vp: 3 },
  { id: 27, name: 'Caramel apple charlotte', family: 'caramel', pattern: ["green","green",null,"orange","blue",null], vp: 5 },
  { id: 28, name: 'Earl Grey & caramel tart', family: 'caramel', pattern: ["orange","blue","orange",null,"blue",null], vp: 4 },
  { id: 29, name: 'Paris-Brest (blueberry praliné)', family: 'caramel', pattern: ["yellow","blue","yellow",null,"blue",null], vp: 4 },
  { id: 30, name: 'Banoffee pie', family: 'caramel', pattern: ["pink","pink",null,"green","blue",null], vp: 5 },
  { id: 31, name: 'Strawberry tartlet', family: 'strawberry', pattern: ["pink","pink",null,null,null,null], vp: 1 },
  { id: 32, name: 'Apple turnover', family: 'strawberry', pattern: ["green","yellow","green",null,null,null], vp: 2 },
  { id: 33, name: 'Blueberry mille-feuille', family: 'strawberry', pattern: ["blue","blue","pink",null,null,null], vp: 2 },
  { id: 34, name: 'Plum tart', family: 'strawberry', pattern: [null,"blue","blue","orange","orange",null], vp: 3 },
  { id: 35, name: 'Fraisier', family: 'strawberry', pattern: ["pink","pink","pink",null,null,null], vp: 2 },
  { id: 36, name: 'Mixed berry pavlova', family: 'strawberry', pattern: [null,"blue","blue","pink","pink",null], vp: 3 },
  { id: 37, name: 'Carrot cake', family: 'strawberry', pattern: ["orange","green",null,"green","orange",null], vp: 5 },
  { id: 38, name: 'Blackcurrant cheesecake', family: 'strawberry', pattern: ["green","yellow","green",null,"yellow",null], vp: 4 },
  { id: 39, name: 'Charlotte aux fraises', family: 'strawberry', pattern: ["yellow","pink","yellow",null,"pink",null], vp: 4 },
  { id: 40, name: 'Autumn fruit crumble', family: 'strawberry', pattern: ["orange","orange",null,"green","blue",null], vp: 5 },
  { id: 41, name: 'Financier', family: 'almond', pattern: ["yellow","yellow","orange",null,null,null], vp: 2 },
  { id: 42, name: 'Pistachio macaron', family: 'almond', pattern: ["green","green","yellow",null,null,null], vp: 2 },
  { id: 43, name: 'Raspberry & pistachio tart', family: 'almond', pattern: [null,"green","green","pink","pink",null], vp: 3 },
  { id: 44, name: 'Pistachio & blueberry religieuse', family: 'almond', pattern: [null,"blue","blue","green","green",null], vp: 3 },
  { id: 45, name: 'Bakewell tart', family: 'almond', pattern: ["pink","yellow",null,null,null,null], vp: 1 },
  { id: 46, name: 'Galette des Rois', family: 'almond', pattern: ["green","green","green",null,null,null], vp: 2 },
  { id: 47, name: 'Mont Blanc', family: 'almond', pattern: ["orange","yellow","orange",null,"yellow",null], vp: 4 },
  { id: 48, name: 'Blueberry frangipane tart', family: 'almond', pattern: ["blue","orange","blue",null,"orange",null], vp: 4 },
  { id: 49, name: 'Fig & almond tart', family: 'almond', pattern: ["pink","pink",null,"blue","blue",null], vp: 5 },
  { id: 50, name: 'Battenberg', family: 'almond', pattern: ["pink","yellow",null,"yellow","pink",null], vp: 5 }
];

// Tile system: 5 colours × 5 ingredients = 25 unique tile types, TILE_COPIES each.
export const COLOURS = ['yellow', 'pink', 'green', 'blue', 'orange'];
export const INGREDIENTS = ['lemon', 'chocolate', 'caramel', 'strawberry', 'almond'];

// Copies of each of the 25 colour/ingredient combinations in the bag.
//
// 4 AUGUST: 5 -> 4, taking the bag back from 125 tiles to 100. A 4-player game
// was played to completion on 3 August and the table did not run out of tiles or
// come close, so the extra 25 were buying nothing. Read TILE_COPIES and
// TILE_BAG_SIZE rather than writing 4 or 100 anywhere - those figures have twice
// been hardcoded into report strings and a bag-skew baseline, which is exactly
// the kind of thing that silently keeps reporting the previous rule set.
//
// 7 AUGUST: 4 -> 5, back to 125. THE 4 AUGUST REASONING WAS SUPERSEDED TWO DAYS
// LATER BY A RULE IT COULD NOT HAVE ANTICIPATED. The board-full clock (6 August)
// made games longer and claims more frequent, and the 3 August game that showed
// no shortage was played under the plate-pool ending. Measured on the live
// engine at 3,000 games per count, four players ran 327 turns that began with a
// pot of tea due and nothing to refill from: the teapot symbols stay uncovered,
// the trigger stays armed for the rest of the game, and the table plays out on a
// thinning trolley. 93.2 of the 100 tiles were permanently out of the bag by the
// end. Two and three players were clean at 0, and both were well tuned on
// teapot cadence, so THAT CADENCE IS THE THING TO RE-CHECK after this change -
// a bigger bag means bare cells refill more readily and pots may come slower.
//
// WHAT THE BAG SIZE ACTUALLY BUYS, REWRITTEN 6 AUGUST. It used to be described as
// "how many full laps of the market the table gets before the last thin lap",
// because a pot of tea that could not be poured ended the game. It no longer
// ends anything - the pot simply does not arrive - so what the bag size now
// decides is WHETHER END CONDITION 2 IS REACHABLE AT ALL:
//
//   A board cell absorbs one tile and is then spent. A claim moves the tile off
//   the cell to the cake stand and drops an empty plate on the same cell. The
//   table can therefore absorb 25 x playerCount tiles, plus one more for each
//   plate a player pays cupcakes to take off their board, plus one more for each
//   CRUMB claim - which since 11 August leaves its cell empty rather than plating
//   it (see CRUMB_CLAIM_LEAVES_PLATE in game.js). Crumbs run at 5-7% of claims
//   and claims at 6-8 a player, so that last term is under one cell per player
//   per game and does not disturb the arithmetic below.
//
//   That is 50 / 75 / 100 at 2 / 3 / 4 players against a bag of 125 since
//   7 August. "The market and the bag are both empty" is now STRUCTURALLY
//   UNREACHABLE AT EVERY PLAYER COUNT, where at 100 tiles four players was a
//   photo finish that the board fill won. End condition 2 is therefore a written
//   backstop and nothing else - which is what it already was in practice, having
//   never fired once in 3,000 simulated games at any count.
//
// So moving this number does not lengthen or shorten the game - a full board
// does that. It moves how thin the market gets on the way, and at 4 players it
// decides whether the backstop ending is a real possibility or an arithmetic one.
export const TILE_COPIES = 5;

// Total tiles in the bag at setup. Derived, never asserted separately.
export const TILE_BAG_SIZE = COLOURS.length * INGREDIENTS.length * TILE_COPIES;

// Share of the bag each colour holds, as a percentage - the flat baseline the
// bag-skew report (metric 9) measures drift against. Derived so it survives a
// change to either COLOURS or TILE_COPIES.
export const TILE_COLOUR_SHARE_PCT = 100 / COLOURS.length;

// Generate all tile types (colour, ingredient)
export function generateTileTypes() {
  const tiles = [];
  for (const colour of COLOURS) {
    for (const ingredient of INGREDIENTS) {
      tiles.push({ colour, ingredient });
    }
  }
  return tiles;
}

// Create a shuffled tile bag with TILE_COPIES copies of each tile type
// (TILE_BAG_SIZE tiles in total).
export function createTileBag() {
  const tileTypes = generateTileTypes();
  const bag = [];

  for (const tileType of tileTypes) {
    for (let i = 0; i < TILE_COPIES; i++) {
      bag.push({ ...tileType });
    }
  }

  // Fisher-Yates shuffle
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }

  return bag;
}

// The PLAYER's personal 5×5 tile board (25 cells). Unrelated to the tile market
// (see MARKET_SIZE in game.js), which is separately 5×5 - do not substitute one
// for the other.
export const BOARD_SIZE = 5;
// Cards dealt face-up to the card market at setup, and dealt back after a tea
// flush (30 July: reduced from 4; the row grows on its own each turn).
export const INITIAL_MARKET_CARDS = 3;
// Hard ceiling on the card row (30 July rule change). The end-of-turn deal
// (dealEndOfTurnCard) is skipped while the row already holds this many cards.
export const MAX_MARKET_CARDS = 8;
// EMPTY PLATES ARE UNLIMITED (6 August).
//
// EMPTY_PLATES_PER_PLAYER stood here - a shared pool of 6 per player that was the
// game's clock: claiming a card plants a plate on the board cell the sacrificed
// tile came from, so the pool was the table's claim allowance, and running it out
// ended the game. THE POOL IS DELETED OUTRIGHT, NOT RAISED. It is not a clock and
// not a resource, no rule anywhere may test it, and CARDS_TO_END_2P (its
// 2-player derivation) goes with it. The clock is a full board now - see the
// endGameReason block in game.js for why the swap was made rather than a retune.
//
// WHAT THE BOX ACTUALLY NEEDS is below, and it is a PUNCHBOARD FIGURE ONLY.
export const EMPTY_PLATES_IN_BOX_PER_PLAYER = 10;

// ^ TEN PER PLAYER, FORTY IN THE BOX. Not a limit, not a supply, and nothing in
// the engine may read this to decide anything - it exists so the harness reports
// against a named number instead of a literal typed into a report string, and so
// the component list has one place to come from.
//
// MEASURED over 3,000 basicBot games under the adopted rule: the most plates any
// one player placed in a game averaged 7.0 / 7.0 / 7.1 at 2/3/4 players and
// topped out at 10 at every count. The structural ceiling is one plate per turn
// per player (one claim per turn, one plate per claim).
//
// TEN IS NOT A HARD CEILING, and the report says so rather than asserting a zero
// it cannot hold: re-measured over 6,000 two-player games, about 0.1% of them
// want an eleventh. That is fine and needs no component change - plates are
// unlimited BY RULE, so a table one short in a thousand games simply uses
// anything to hand. It would only matter if a rule ever tested the supply, and
// none may.
//
// (It was 27 TOTAL under the pool - 24 plus a measured overrun of up to 3 - which
// is a different quantity entirely: that number was sized off a shared table
// supply, this one is sized off what a single player physically needs in front of
// them. Do not compare the two.)
