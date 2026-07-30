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
  { id: 25, name: 'Salted caramel tart', family: 'caramel', pattern: [null,"orange","orange","pink","orange",null], vp: 3 },
  { id: 26, name: 'Sticky toffee pudding', family: 'caramel', pattern: [null,"orange","orange","yellow","orange",null], vp: 3 },
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
  { id: 43, name: 'Raspberry & pistachio tart', family: 'almond', pattern: [null,"green","green","pink","green",null], vp: 3 },
  { id: 44, name: 'Pistachio & blueberry religieuse', family: 'almond', pattern: [null,"blue","blue","green","green",null], vp: 3 },
  { id: 45, name: 'Bakewell tart', family: 'almond', pattern: ["pink","yellow",null,null,null,null], vp: 1 },
  { id: 46, name: 'Galette des Rois', family: 'almond', pattern: ["green","green","green",null,null,null], vp: 2 },
  { id: 47, name: 'Mont Blanc', family: 'almond', pattern: ["orange","yellow","orange",null,"yellow",null], vp: 4 },
  { id: 48, name: 'Blueberry frangipane tart', family: 'almond', pattern: ["blue","orange","blue",null,"orange",null], vp: 4 },
  { id: 49, name: 'Fig & almond tart', family: 'almond', pattern: ["pink","pink",null,"blue","blue",null], vp: 5 },
  { id: 50, name: 'Battenberg', family: 'almond', pattern: ["pink","yellow",null,"yellow","pink",null], vp: 5 }
];

// Tile system: 5 colours × 5 ingredients = 25 unique tile types, 4 copies each = 100 tiles
export const COLOURS = ['yellow', 'pink', 'green', 'blue', 'orange'];
export const INGREDIENTS = ['lemon', 'chocolate', 'caramel', 'strawberry', 'almond'];

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

// Create a shuffled tile bag with 4 copies of each tile type
export function createTileBag() {
  const tileTypes = generateTileTypes();
  const bag = [];

  for (const tileType of tileTypes) {
    for (let i = 0; i < 4; i++) {
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
// Cards a 2-player game must see claimed before the card-count end condition
// fires (8 tarts × 2 players). This is NOT a deck size — the deck holds all 47
// cards left after the market is dealt (see initGameDeck). 3p/4p scale this up
// (24/32) in createGame.
export const CARDS_TO_END_2P = 16;
