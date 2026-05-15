// Card definitions (parsed from reward_cards.csv)
// Each card: id, name, ingredient (for scoring), 2x2 pattern (0-4 colors)
export const REWARD_CARDS = [
  { id: 1, name: 'Lemon madeleine', ingredient: 'lemon', pattern: ['yellow'] },
  { id: 2, name: 'Tarte au citron', ingredient: 'lemon', pattern: ['yellow', 'yellow'] },
  { id: 3, name: 'Pink grapefruit tartelette', ingredient: 'lemon', pattern: ['pink', 'pink'] },
  { id: 4, name: 'Orange marmalade slice', ingredient: 'lemon', pattern: ['orange', 'orange'] },
  { id: 5, name: 'Lemon meringue pie', ingredient: 'lemon', pattern: ['yellow', 'yellow', 'pink'] },
  { id: 6, name: 'Earl Grey financier', ingredient: 'lemon', pattern: ['blue', 'blue', 'yellow'] },
  { id: 7, name: 'Key lime & blueberry tart', ingredient: 'lemon', pattern: ['green', 'green', 'blue'] },
  { id: 8, name: 'Blood orange tart', ingredient: 'lemon', pattern: ['orange', 'orange', 'pink'] },
  { id: 9, name: 'Yuzu tart', ingredient: 'lemon', pattern: ['yellow', 'yellow', 'green', 'green'] },
  { id: 10, name: 'Lime & Earl Grey drizzle cake', ingredient: 'lemon', pattern: ['green', 'green', 'blue', 'blue'] },
  { id: 11, name: 'Chocolate-orange truffle', ingredient: 'chocolate', pattern: ['orange'] },
  { id: 12, name: 'Chocolate-cherry tart', ingredient: 'chocolate', pattern: ['pink', 'pink'] },
  { id: 13, name: 'Chocolate-mint truffle', ingredient: 'chocolate', pattern: ['green', 'green'] },
  { id: 14, name: 'Chocolate-hazelnut praline', ingredient: 'chocolate', pattern: ['orange', 'orange'] },
  { id: 15, name: 'Black Forest gateau', ingredient: 'chocolate', pattern: ['pink', 'pink', 'green'] },
  { id: 16, name: 'Sachertorte', ingredient: 'chocolate', pattern: ['orange', 'orange', 'yellow'] },
  { id: 17, name: 'Pistachio chocolate religieuse', ingredient: 'chocolate', pattern: ['green', 'green', 'pink'] },
  { id: 18, name: 'Chocolate-blueberry tartelette', ingredient: 'chocolate', pattern: ['blue', 'blue', 'pink'] },
  { id: 19, name: 'Opera cake', ingredient: 'chocolate', pattern: ['yellow', 'yellow', 'orange', 'orange'] },
  { id: 20, name: 'Florentine', ingredient: 'chocolate', pattern: ['orange', 'pink', 'green', 'blue'] },
  { id: 21, name: 'Creme brulee', ingredient: 'caramel', pattern: ['yellow'] },
  { id: 22, name: 'Canele', ingredient: 'caramel', pattern: ['orange', 'orange'] },
  { id: 23, name: 'Tarte Tatin', ingredient: 'caramel', pattern: ['orange', 'green'] },
  { id: 24, name: 'Creme caramel', ingredient: 'caramel', pattern: ['yellow', 'orange'] },
  { id: 25, name: 'Salted caramel tart', ingredient: 'caramel', pattern: ['orange', 'orange', 'yellow'] },
  { id: 26, name: 'Sticky toffee pudding', ingredient: 'caramel', pattern: ['orange', 'pink', 'pink'] },
  { id: 27, name: 'Caramel apple charlotte', ingredient: 'caramel', pattern: ['green', 'green', 'orange'] },
  { id: 28, name: 'Earl Grey & caramel tart', ingredient: 'caramel', pattern: ['blue', 'blue', 'yellow'] },
  { id: 29, name: 'Paris-Brest (blueberry praline)', ingredient: 'caramel', pattern: ['yellow', 'yellow', 'orange', 'blue'] },
  { id: 30, name: 'Banoffee pie', ingredient: 'caramel', pattern: ['yellow', 'yellow', 'orange', 'pink'] },
  { id: 31, name: 'Strawberry tartlet', ingredient: 'strawberry', pattern: ['pink'] },
  { id: 32, name: 'Apple turnover', ingredient: 'strawberry', pattern: ['green', 'green'] },
  { id: 33, name: 'Blueberry mille-feuille', ingredient: 'strawberry', pattern: ['blue', 'blue'] },
  { id: 34, name: 'Plum tart', ingredient: 'strawberry', pattern: ['blue', 'blue'] },
  { id: 35, name: 'Fraisier', ingredient: 'strawberry', pattern: ['pink', 'pink', 'green'] },
  { id: 36, name: 'Mixed berry pavlova', ingredient: 'strawberry', pattern: ['pink', 'blue', 'blue'] },
  { id: 37, name: 'Carrot cake', ingredient: 'strawberry', pattern: ['orange', 'orange', 'green'] },
  { id: 38, name: 'Blackcurrant cheesecake', ingredient: 'strawberry', pattern: ['blue', 'blue', 'pink'] },
  { id: 39, name: 'Charlotte aux fraises', ingredient: 'strawberry', pattern: ['pink', 'pink', 'yellow', 'green'] },
  { id: 40, name: 'Autumn fruit crumble', ingredient: 'strawberry', pattern: ['green', 'orange', 'blue', 'pink'] },
  { id: 41, name: 'Financier', ingredient: 'almond', pattern: ['yellow'] },
  { id: 42, name: 'Pistachio macaron', ingredient: 'almond', pattern: ['green', 'green'] },
  { id: 43, name: 'Raspberry & pistachio tart', ingredient: 'almond', pattern: ['pink', 'green'] },
  { id: 44, name: 'Pistachio & blueberry religieuse', ingredient: 'almond', pattern: ['green', 'blue'] },
  { id: 45, name: 'Bakewell tart', ingredient: 'almond', pattern: ['pink', 'pink', 'green'] },
  { id: 46, name: 'Galette des Rois', ingredient: 'almond', pattern: ['yellow', 'yellow', 'orange'] },
  { id: 47, name: 'Mont Blanc', ingredient: 'almond', pattern: ['pink', 'pink', 'yellow'] },
  { id: 48, name: 'Blueberry frangipane tart', ingredient: 'almond', pattern: ['blue', 'blue', 'yellow'] },
  { id: 49, name: 'Fig & almond tart', ingredient: 'almond', pattern: ['blue', 'blue', 'pink', 'orange'] },
  { id: 50, name: 'Battenberg', ingredient: 'almond', pattern: ['pink', 'yellow', 'yellow', 'pink'] },
];

// Tile system: 5 colours × 5 ingredients = 100 unique tiles, 4 copies each = 400 tiles
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

// Initialize 5×5 market grid by drawing from bag
export function initMarket(bag) {
  const market = [];
  for (let i = 0; i < 25; i++) {
    market.push(bag.shift());
  }
  return market;
}

export const BOARD_SIZE = 5;
export const TRACK_MAX = 5;
