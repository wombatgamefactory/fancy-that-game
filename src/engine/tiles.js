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
// WHY IT MATTERS BEYOND SUPPLY. Every pot of tea flushes the whole market back
// into the bag and redeals 25 cells. Since 4 August a bag that cannot cover the
// board no longer ends the game on the spot - it deals what it has and play goes
// on across a thinning market until the NEXT refill is needed (see isTeaDue and
// endTurn in game.js). The bag size therefore sets how many full laps of the
// market the table gets before that last thin lap, not a hard stop.
export const TILE_COPIES = 4;

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
// EMPTY PLATE TOKENS per player (3 August rule change: 8 -> 6). Claiming a card
// plants an empty plate on the board cell the sacrificed tile came from, so a
// player's pool of plates IS their claim allowance, and the pool running out is
// the game's clock. The card-count end condition therefore fires at
// EMPTY_PLATES_PER_PLAYER × playerCount claims (see cardsNeededToEnd).
//
// WHY 6. At 8 the pool ended only 12.2 / 5.6 / 0.2% of games at 2/3/4 players -
// claims per player ran 5.9-6.9 against 8 plates each, so the advertised clock
// almost never struck and 85.6% of 4-player games ended on an empty bag instead.
// At 6 the pool becomes the ending in 93.9 / 93.1 / 54.6% of games and takes
// 4.3 / 5.3 / 1.6 turns off the length, with near-identical pacing at every count
// (7.88 / 8.15 / 8.02 turns per player).
//
// DO NOT PRE-CORRECT 4 PLAYERS TO 5. It was tested: it drops the worst-off
// player at 4p to 3.93 claims, below the 4 needed to fill the bottom stand row at
// all, which locks the trailing player out of the stand's headline scoring
// option. The 4-player coin flip against 'bagEmpty' is expected to resolve itself
// as the paid extra tile (EXTRA_TILE_CUPCAKE_COST) lifts claim rates - 4 players
// needs just one more total claim to cross.
//
// PHYSICAL COMPONENT COUNT IS NOT THIS NUMBER x PLAYERS. Since the 4 August
// ruling the pool is purely a CLOCK: emptying it triggers the ending, and the
// round that is then finished out may claim on from an UNLIMITED supply of spare
// plates (see canClaimMore in game.js). So a game can finish having placed more
// plates than the pool holds, and the box has to cover the overrun.
//
// MEASURED over 1,000 basicBot games per count: the overrun runs 0.21 / 0.36 /
// 0.40 on average and tops out at 1 / 2 / 3 at 2/3/4 players, so 30.4% of
// 4-player games need at least one spare. The box therefore wants 27 rather than
// 24. The ceiling is structural rather than empirical - at most playerCount - 1
// turns follow the trigger and each may claim once - so 24 + (players - 1) is
// the number to punch, and simulate.js metric 10 reports it every run.
export const EMPTY_PLATES_PER_PLAYER = 6;

// Cards a 2-player game must see claimed before the card-count end condition
// fires (6 empty plates × 2 players). This is NOT a deck size — the deck holds
// all 47 cards left after the market is dealt (see initGameDeck). Every player
// count derives the same way in createGame (3p = 18, 4p = 24).
export const CARDS_TO_END_2P = EMPTY_PLATES_PER_PLAYER * 2;
