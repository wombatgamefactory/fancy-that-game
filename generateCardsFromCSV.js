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

    // Victory points: value from the CSV `vp` column — the CSV is authoritative,
    // so per-card VP is fully data-driven and the band is NOT fixed here (it is
    // being rebalanced away from 1–4 toward ~2–6). Validate only the real
    // invariant: a positive integer. Fail loudly on bad data rather than
    // silently defaulting.
    const vp = parseInt(row['vp'], 10);
    if (isNaN(vp) || vp < 1 || !Number.isInteger(vp)) {
      throw new Error(`Card ${cardNum} (${row['Title']}) has invalid vp "${row['vp']}" — must be a positive integer.`);
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

// Render just the REWARD_CARDS array literal. This used to render the WHOLE of
// tiles.js from a hardcoded template, which made the generator a silent
// rule-reverter: the template still said "4 copies each = 100 tiles" and
// "CARDS_TO_END_2P = 16" long after both were changed, and had never heard of
// TILE_COPIES at all. Running it to pick up a card edit would have quietly rolled
// back three unrelated rule changes. (Both CARDS_TO_END_2P and the plate pool it
// derived from were deleted outright on 6 August, which is the point exactly:
// a template would still be printing them.)
//
// So it SPLICES now: everything in tiles.js outside the REWARD_CARDS block is
// left exactly as found. The CSV owns the cards and nothing else.
function renderRewardCards(cards) {
  const cardDefs = cards.map(card => {
    const patternStr = JSON.stringify(card.pattern);
    return `  { id: ${card.id}, name: '${card.name.replace(/'/g, "\'")}', family: '${card.family}', pattern: ${patternStr}, vp: ${card.vp} }`;
  }).join(',\n');
  return `export const REWARD_CARDS = [\n${cardDefs}\n];`;
}

const csvPath = path.join(__dirname, 'reward_cards.csv');
const cards = parseCSV(csvPath);

const tilesPath = path.join(__dirname, 'src', 'engine', 'tiles.js');
const existing = fs.readFileSync(tilesPath, 'utf8');

// Match the array literal only, from the export to its closing bracket. The
// patterns inside contain no `]`, so a non-greedy match to the first `\n];` is
// unambiguous; if that ever changes this throws rather than mangling the file.
const BLOCK = /export const REWARD_CARDS = \[[\s\S]*?\n\];/;
if (!BLOCK.test(existing)) {
  throw new Error(`Could not find the REWARD_CARDS block in ${tilesPath} - refusing to write.`);
}
// Match the file's existing line endings. tiles.js is CRLF; splicing in LF-only
// text would rewrite every card line as a spurious diff and leave the file mixed.
const eol = existing.includes('\r\n') ? '\r\n' : '\n';
const block = renderRewardCards(cards).replace(/\n/g, eol);

const updated = existing.replace(BLOCK, block);
fs.writeFileSync(tilesPath, updated);

console.log(`Spliced ${cards.length} cards into ${tilesPath} (everything else left untouched)`);
