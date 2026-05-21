// Card definitions (from reward_cards.csv)
// Each card: id, name, ingredient (for end-game scoring), pattern (3×2 grid with nulls),
// symbolCount (number of ingredient symbols on card)
export const REWARD_CARDS = [
  { id: 1, name: 'Lemon madeleine', ingredient: 'lemon', pattern: ["yellow","yellow",null,null,null,null], symbolCount: 0 },
  { id: 2, name: 'Tarte au citron', ingredient: 'lemon', pattern: ["yellow","yellow","yellow",null,null,null], symbolCount: 1 },
  { id: 3, name: 'Pink grapefruit tartelette', ingredient: 'lemon', pattern: ["pink","pink","green",null,null,null], symbolCount: 1 },
  { id: 4, name: 'Orange marmalade slice', ingredient: 'lemon', pattern: ["orange","orange","blue",null,null,null], symbolCount: 1 },
  { id: 5, name: 'Lemon meringue pie', ingredient: 'lemon', pattern: ["pink","yellow","pink",null,"yellow",null], symbolCount: 2 },
  { id: 6, name: 'Earl Grey financier', ingredient: 'lemon', pattern: ["orange","blue","blue","orange",null,null], symbolCount: 2 },
  { id: 7, name: 'Key lime & blueberry tart', ingredient: 'lemon', pattern: ["green","blue",null,"blue","green",null], symbolCount: 3 },
  { id: 8, name: 'Blood orange tart', ingredient: 'lemon', pattern: ["pink","orange","orange","pink",null,null], symbolCount: 2 },
  { id: 9, name: 'Yuzu tart', ingredient: 'lemon', pattern: ["green","green",null,"pink","orange",null], symbolCount: 3 },
  { id: 10, name: 'Lime & Earl Grey drizzle cake', ingredient: 'lemon', pattern: ["blue","green","blue",null,"green",null], symbolCount: 2 },
  { id: 11, name: 'Chocolate-orange truffle', ingredient: 'chocolate', pattern: ["orange","orange",null,null,null,null], symbolCount: 0 },
  { id: 12, name: 'Chocolate-cherry tart', ingredient: 'chocolate', pattern: ["pink","pink","yellow",null,null,null], symbolCount: 1 },
  { id: 13, name: 'Chocolate-mint truffle', ingredient: 'chocolate', pattern: ["green","green","blue",null,null,null], symbolCount: 1 },
  { id: 14, name: 'Chocolate-hazelnut praliné', ingredient: 'chocolate', pattern: ["orange","orange","orange",null,null,null], symbolCount: 1 },
  { id: 15, name: 'Black Forest gateau', ingredient: 'chocolate', pattern: ["pink","green","green","pink",null,null], symbolCount: 2 },
  { id: 16, name: 'Sachertorte', ingredient: 'chocolate', pattern: ["yellow","orange","yellow",null,"orange",null], symbolCount: 2 },
  { id: 17, name: 'Pistachio chocolate religieuse', ingredient: 'chocolate', pattern: ["pink","green","green","pink",null,null], symbolCount: 2 },
  { id: 18, name: 'Chocolate-blueberry tartelette', ingredient: 'chocolate', pattern: ["yellow","blue",null,"blue","yellow",null], symbolCount: 3 },
  { id: 19, name: 'Opéra cake', ingredient: 'chocolate', pattern: ["blue","yellow","blue",null,"yellow",null], symbolCount: 2 },
  { id: 20, name: 'Florentine', ingredient: 'chocolate', pattern: ["blue","blue",null,"pink","green",null], symbolCount: 3 },
  { id: 21, name: 'Crème brûlée', ingredient: 'caramel', pattern: ["yellow","yellow",null,null,null,null], symbolCount: 0 },
  { id: 22, name: 'Canelé', ingredient: 'caramel', pattern: ["orange","orange","pink",null,null,null], symbolCount: 1 },
  { id: 23, name: 'Tarte Tatin', ingredient: 'caramel', pattern: ["green","green","orange",null,null,null], symbolCount: 1 },
  { id: 24, name: 'Crème caramel', ingredient: 'caramel', pattern: ["yellow","yellow","yellow",null,null,null], symbolCount: 1 },
  { id: 25, name: 'Salted caramel tart', ingredient: 'caramel', pattern: ["pink","orange","orange","pink",null,null], symbolCount: 2 },
  { id: 26, name: 'Sticky toffee pudding', ingredient: 'caramel', pattern: ["pink","orange","orange","pink",null,null], symbolCount: 2 },
  { id: 27, name: 'Caramel apple charlotte', ingredient: 'caramel', pattern: ["green","blue",null,"blue","green",null], symbolCount: 3 },
  { id: 28, name: 'Earl Grey & caramel tart', ingredient: 'caramel', pattern: ["blue","green","blue",null,"green",null], symbolCount: 2 },
  { id: 29, name: 'Paris-Brest (blueberry praliné)', ingredient: 'caramel', pattern: ["blue","yellow","blue",null,"yellow",null], symbolCount: 2 },
  { id: 30, name: 'Banoffee pie', ingredient: 'caramel', pattern: ["pink","pink",null,"green","blue",null], symbolCount: 3 },
  { id: 31, name: 'Strawberry tartlet', ingredient: 'strawberry', pattern: ["pink","pink",null,null,null,null], symbolCount: 0 },
  { id: 32, name: 'Apple turnover', ingredient: 'strawberry', pattern: ["green","green","orange",null,null,null], symbolCount: 1 },
  { id: 33, name: 'Blueberry mille-feuille', ingredient: 'strawberry', pattern: ["blue","blue","yellow",null,null,null], symbolCount: 1 },
  { id: 34, name: 'Plum tart', ingredient: 'strawberry', pattern: ["orange","blue","blue","orange",null,null], symbolCount: 2 },
  { id: 35, name: 'Fraisier', ingredient: 'strawberry', pattern: ["pink","pink","pink",null,null,null], symbolCount: 1 },
  { id: 36, name: 'Mixed berry pavlova', ingredient: 'strawberry', pattern: ["yellow","blue","blue","yellow",null,null], symbolCount: 2 },
  { id: 37, name: 'Carrot cake', ingredient: 'strawberry', pattern: ["orange","green",null,"green","orange",null], symbolCount: 3 },
  { id: 38, name: 'Blackcurrant cheesecake', ingredient: 'strawberry', pattern: ["green","yellow","green",null,"yellow",null], symbolCount: 2 },
  { id: 39, name: 'Charlotte aux fraises', ingredient: 'strawberry', pattern: ["pink","pink","yellow",null,"green",null], symbolCount: 3 },
  { id: 40, name: 'Autumn fruit crumble', ingredient: 'strawberry', pattern: ["orange","orange",null,"green","blue",null], symbolCount: 3 },
  { id: 41, name: 'Financier', ingredient: 'almond', pattern: ["yellow","yellow","orange",null,null,null], symbolCount: 1 },
  { id: 42, name: 'Pistachio macaron', ingredient: 'almond', pattern: ["green","green","yellow",null,null,null], symbolCount: 1 },
  { id: 43, name: 'Raspberry & pistachio tart', ingredient: 'almond', pattern: ["green","blue","blue","green",null,null], symbolCount: 2 },
  { id: 44, name: 'Pistachio & blueberry religieuse', ingredient: 'almond', pattern: ["green","blue","blue","green",null,null], symbolCount: 2 },
  { id: 45, name: 'Bakewell tart', ingredient: 'almond', pattern: ["pink","pink",null,null,null,null], symbolCount: 0 },
  { id: 46, name: 'Galette des Rois', ingredient: 'almond', pattern: ["green","green","green",null,null,null], symbolCount: 1 },
  { id: 47, name: 'Mont Blanc', ingredient: 'almond', pattern: ["yellow","pink","yellow",null,"pink",null], symbolCount: 2 },
  { id: 48, name: 'Blueberry frangipane tart', ingredient: 'almond', pattern: ["blue","orange","blue",null,"orange",null], symbolCount: 2 },
  { id: 49, name: 'Fig & almond tart', ingredient: 'almond', pattern: ["orange","orange",null,"green","blue",null], symbolCount: 3 },
  { id: 50, name: 'Battenberg', ingredient: 'almond', pattern: ["pink","yellow",null,"yellow","pink",null], symbolCount: 3 }
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

export const BOARD_SIZE = 5;
export const CARD_MARKET_SIZE = 4;
export const TOTAL_GAME_CARDS = 16;
