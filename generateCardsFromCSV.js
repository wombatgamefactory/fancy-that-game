import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Map CSV ingredient names to internal names
const INGREDIENT_MAP = {
  'Lemon': 'lemon',
  'Chocolate': 'chocolate',
  'Caramel': 'caramel',
  'Strawberry': 'strawberry',
  'Almond': 'almond'
};

function parseCSV(filePath) {
  // The CSV is cp1252-encoded (card names contain é/û, e.g. "praliné", "brûlée").
  // latin1 is byte-identical to cp1252 for every character these names use;
  // reading as utf-8 corrupts those bytes to the replacement character.
  let content = fs.readFileSync(filePath, 'latin1');
  // Remove BOM if present
  if (content.charCodeAt(0) === 0xFEFF) {
    content = content.slice(1);
  }
  // Normalize line endings
  content = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = content.split('\n');
  const headers = lines[0].split(',');

  const cards = [];

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;

    const values = lines[i].split(',');
    const row = {};

    headers.forEach((header, index) => {
      row[header.trim()] = (values[index] || '').trim();
    });

    // Skip filler rows and header
    if (!row['Card#'] || row['Card#'] === 'reward' || row['Card#'] === '') continue;

    const cardNum = parseInt(row['Card#']);
    if (isNaN(cardNum)) {
      console.log(`Skipping row ${i}: Card# = "${row['Card#']}"`);
      continue;
    }

    // Get the 6 pattern cells (top row: pattern1-3, bottom row: pattern4-6)
    const pattern = [
      row['pattern1']?.toLowerCase() || null,
      row['pattern2']?.toLowerCase() || null,
      row['pattern3']?.toLowerCase() || null,
      row['pattern4']?.toLowerCase() || null,
      row['pattern5']?.toLowerCase() || null,
      row['pattern6']?.toLowerCase() || null
    ];

    // Filter out null/empty and normalize
    const patternCells = pattern.map(p => p === '' || p === null ? null : p);

    const scoringIngredient = row['Scoring']?.toLowerCase() || '';

    // Victory points: flat 1–4 value from the CSV `vp` column. Fail loudly on bad data
    // rather than silently defaulting.
    const vp = parseInt(row['vp'], 10);
    if (isNaN(vp) || vp < 1 || vp > 4) {
      throw new Error(`Card ${cardNum} (${row['Title']}) has invalid vp "${row['vp']}" — must be an integer 1–4.`);
    }

    cards.push({
      id: cardNum,
      name: row['Title'] || `Card ${cardNum}`,
      family: INGREDIENT_MAP[row['Scoring']] || scoringIngredient,
      pattern: patternCells,
      vp
    });
  }

  return cards.sort((a, b) => a.id - b.id);
}

function generateTilesJS(cards) {
  const cardDefs = cards.map(card => {
    const patternStr = JSON.stringify(card.pattern);
    return `  { id: ${card.id}, name: '${card.name.replace(/'/g, "\\'")}', family: '${card.family}', pattern: ${patternStr}, vp: ${card.vp} }`;
  }).join(',\n');

  return `// Card definitions (from reward_cards.csv)
// Each card: id, name, family (cosmetic ingredient family — art/grouping only, no
// mechanical effect), pattern (3×2 grid with nulls), vp (1–4 victory points)
export const REWARD_CARDS = [
${cardDefs}
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
`;
}

const csvPath = path.join(__dirname, 'reward_cards.csv');
const cards = parseCSV(csvPath);
const tilesContent = generateTilesJS(cards);

const tilesPath = path.join(__dirname, 'src', 'engine', 'tiles.js');
fs.writeFileSync(tilesPath, tilesContent);

console.log(`Generated ${cards.length} cards in ${tilesPath}`);
