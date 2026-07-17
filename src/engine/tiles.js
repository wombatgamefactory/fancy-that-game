// Card definitions (from reward_cards.csv)
// Each card: id, name, family (cosmetic ingredient family — art/grouping only, no
// mechanical effect), pattern (3×2 grid with nulls), vp (1–4 victory points)
export const REWARD_CARDS = [
  { id: 1, name: 'Lemon madeleine', family: 'lemon', pattern: ["yellow","yellow",null,null,null,null], vp: 1 },
  { id: 2, name: 'Tarte au citron', family: 'lemon', pattern: ["yellow","yellow","yellow",null,null,null], vp: 2 },
  { id: 3, name: 'Pink grapefruit tartelette', family: 'lemon', pattern: ["pink","pink","green",null,null,null], vp: 2 },
  { id: 4, name: 'Orange marmalade slice', family: 'lemon', pattern: ["orange","orange","blue",null,null,null], vp: 2 },
  { id: 5, name: 'Lemon meringue pie', family: 'lemon', pattern: ["pink","yellow","pink",null,"yellow",null], vp: 3 },
  { id: 6, name: 'Earl Grey financier', family: 'lemon', pattern: ["orange","blue","blue","orange",null,null], vp: 2 },
  { id: 7, name: 'Key lime & blueberry tart', family: 'lemon', pattern: ["green","blue",null,"blue","green",null], vp: 4 },
  { id: 8, name: 'Blood orange tart', family: 'lemon', pattern: ["pink","orange","orange","pink",null,null], vp: 2 },
  { id: 9, name: 'Yuzu tart', family: 'lemon', pattern: ["green","green",null,"pink","orange",null], vp: 4 },
  { id: 10, name: 'Lime & Earl Grey drizzle cake', family: 'lemon', pattern: ["blue","green","blue",null,"green",null], vp: 3 },
  { id: 11, name: 'Chocolate-orange truffle', family: 'chocolate', pattern: ["orange","orange",null,null,null,null], vp: 1 },
  { id: 12, name: 'Chocolate-cherry tart', family: 'chocolate', pattern: ["pink","pink","yellow",null,null,null], vp: 2 },
  { id: 13, name: 'Chocolate-mint truffle', family: 'chocolate', pattern: ["green","green","blue",null,null,null], vp: 2 },
  { id: 14, name: 'Chocolate-hazelnut praliné', family: 'chocolate', pattern: ["orange","orange","orange",null,null,null], vp: 2 },
  { id: 15, name: 'Black Forest gateau', family: 'chocolate', pattern: ["pink","green","green","pink",null,null], vp: 2 },
  { id: 16, name: 'Sachertorte', family: 'chocolate', pattern: ["yellow","orange","yellow",null,"orange",null], vp: 3 },
  { id: 17, name: 'Pistachio chocolate religieuse', family: 'chocolate', pattern: ["pink","green","green","pink",null,null], vp: 2 },
  { id: 18, name: 'Chocolate-blueberry tartelette', family: 'chocolate', pattern: ["yellow","blue",null,"blue","yellow",null], vp: 4 },
  { id: 19, name: 'Opéra cake', family: 'chocolate', pattern: ["blue","yellow","blue",null,"yellow",null], vp: 3 },
  { id: 20, name: 'Florentine', family: 'chocolate', pattern: ["blue","blue",null,"pink","green",null], vp: 4 },
  { id: 21, name: 'Crème brûlée', family: 'caramel', pattern: ["yellow","yellow",null,null,null,null], vp: 1 },
  { id: 22, name: 'Canelé', family: 'caramel', pattern: ["orange","orange","pink",null,null,null], vp: 2 },
  { id: 23, name: 'Tarte Tatin', family: 'caramel', pattern: ["green","green","orange",null,null,null], vp: 2 },
  { id: 24, name: 'Crème caramel', family: 'caramel', pattern: ["yellow","yellow","yellow",null,null,null], vp: 2 },
  { id: 25, name: 'Salted caramel tart', family: 'caramel', pattern: ["pink","orange","orange","pink",null,null], vp: 2 },
  { id: 26, name: 'Sticky toffee pudding', family: 'caramel', pattern: ["pink","orange","orange","pink",null,null], vp: 2 },
  { id: 27, name: 'Caramel apple charlotte', family: 'caramel', pattern: ["green","blue",null,"blue","green",null], vp: 4 },
  { id: 28, name: 'Earl Grey & caramel tart', family: 'caramel', pattern: ["blue","green","blue",null,"green",null], vp: 2 },
  { id: 29, name: 'Paris-Brest (blueberry praliné)', family: 'caramel', pattern: ["blue","yellow","blue",null,"yellow",null], vp: 2 },
  { id: 30, name: 'Banoffee pie', family: 'caramel', pattern: ["pink","pink",null,"green","blue",null], vp: 4 },
  { id: 31, name: 'Strawberry tartlet', family: 'strawberry', pattern: ["pink","pink",null,null,null,null], vp: 1 },
  { id: 32, name: 'Apple turnover', family: 'strawberry', pattern: ["green","green","orange",null,null,null], vp: 2 },
  { id: 33, name: 'Blueberry mille-feuille', family: 'strawberry', pattern: ["blue","blue","yellow",null,null,null], vp: 2 },
  { id: 34, name: 'Plum tart', family: 'strawberry', pattern: ["orange","blue","blue","orange",null,null], vp: 2 },
  { id: 35, name: 'Fraisier', family: 'strawberry', pattern: ["pink","pink","pink",null,null,null], vp: 2 },
  { id: 36, name: 'Mixed berry pavlova', family: 'strawberry', pattern: ["yellow","blue","blue","yellow",null,null], vp: 2 },
  { id: 37, name: 'Carrot cake', family: 'strawberry', pattern: ["orange","green",null,"green","orange",null], vp: 4 },
  { id: 38, name: 'Blackcurrant cheesecake', family: 'strawberry', pattern: ["green","yellow","green",null,"yellow",null], vp: 2 },
  { id: 39, name: 'Charlotte aux fraises', family: 'strawberry', pattern: ["yellow","pink","yellow",null,"pink",null], vp: 2 },
  { id: 40, name: 'Autumn fruit crumble', family: 'strawberry', pattern: ["orange","orange",null,"green","blue",null], vp: 4 },
  { id: 41, name: 'Financier', family: 'almond', pattern: ["yellow","yellow","orange",null,null,null], vp: 2 },
  { id: 42, name: 'Pistachio macaron', family: 'almond', pattern: ["green","green","yellow",null,null,null], vp: 2 },
  { id: 43, name: 'Raspberry & pistachio tart', family: 'almond', pattern: ["green","blue","blue","green",null,null], vp: 2 },
  { id: 44, name: 'Pistachio & blueberry religieuse', family: 'almond', pattern: ["green","blue","blue","green",null,null], vp: 2 },
  { id: 45, name: 'Bakewell tart', family: 'almond', pattern: ["pink","pink",null,null,null,null], vp: 1 },
  { id: 46, name: 'Galette des Rois', family: 'almond', pattern: ["green","green","green",null,null,null], vp: 2 },
  { id: 47, name: 'Mont Blanc', family: 'almond', pattern: ["yellow","pink","yellow",null,"pink",null], vp: 2 },
  { id: 48, name: 'Blueberry frangipane tart', family: 'almond', pattern: ["blue","orange","blue",null,"orange",null], vp: 2 },
  { id: 49, name: 'Fig & almond tart', family: 'almond', pattern: ["orange","orange",null,"green","blue",null], vp: 4 },
  { id: 50, name: 'Battenberg', family: 'almond', pattern: ["pink","yellow",null,"yellow","pink",null], vp: 4 }
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

export const BOARD_SIZE = 5;
export const CARD_MARKET_SIZE = 4;
export const TOTAL_GAME_CARDS = 16;
