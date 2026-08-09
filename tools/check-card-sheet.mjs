// Fancy That! - card sheet freshness check.
//
//   node tools/check-card-sheet.mjs           check every card, exit 1 on drift
//   node tools/check-card-sheet.mjs --dump    also write crops of the bad cards
//
// WHY THIS EXISTS. The pattern a player has to build is PAINTED INTO THE CARD
// ART. The engine matches on REWARD_CARDS in src/engine/tiles.js; the player
// reads the swatches off a pre-rendered sprite sheet. Nothing connects the two.
// Edit a pattern in reward_cards.csv, splice it into tiles.js with
// generateCardsFromCSV.js, and the game will happily award a card for a shape
// that is not the one printed on it - silently, for weeks.
//
// That is not hypothetical. Cards 25 (Salted caramel tart), 26 (Sticky toffee
// pudding) and 43 (Raspberry & pistachio tart) each had one swatch recoloured
// on 4 August and the sheet was not re-exported until 9 August. Every game in
// between showed all three wrong. This script is what would have caught it.
//
// So: it reads the pixels back out of the sheet the CSS actually points at,
// decodes the printed swatches, and diffs them against the engine's data. Run
// it after ANY card pattern change, and after any re-export of the art.
//
// THREE things about it are non-obvious:
//
// 1. It takes the sheet path and grid size FROM style.css, not from a constant
//    here. The whole failure mode is two things drifting apart, so the checker
//    has to test the file the game loads - hardcoding a name would just add a
//    third thing to keep in sync.
// 2. The palette below is the PRINTED palette, sampled off the art. It is NOT
//    --tile-* from style.css: the print is a few shades deeper, and pink is
//    ~66 away from --tile-pink, far enough that classifying against the CSS
//    values misses every pink swatch on every card.
// 3. Pixels are read in a browser canvas via Playwright, the same way
//    layout-check.mjs diffs screenshots. Node has no image decoder and the
//    project has no dependencies; this keeps it that way. Only the swatch strip
//    of each card is drawn, one card at a time, so nothing has to hold a
//    54-megapixel bitmap.

import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire('C:/Users/dean/AppData/Roaming/npm/node_modules/playwright/');
const { chromium } = require('playwright');

import { REWARD_CARDS } from '../src/engine/tiles.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DUMP_DIR = path.join(HERE, 'screenshots', 'card-sheet');
const PORT = 8098;
const DUMP = process.argv.includes('--dump');

// Sampled off the printed swatches - see note 2 above. If a future export
// shifts the tints, cards start reporting "no swatches found" rather than
// passing quietly; re-sample from a known card and update these.
const PALETTE = {
  yellow: [0xE7, 0xC9, 0x5E],
  pink:   [0xE6, 0x78, 0x91],
  green:  [0x81, 0xBC, 0x7F],
  blue:   [0x72, 0xBA, 0xD4],
  orange: [0xE3, 0x88, 0x3B],
};
const TOLERANCE = 40;

// The swatch strip, as a fraction of card height. Starts below the artwork -
// 0.58 rather than 0.55 because the sticky toffee pudding's sauce puddles down
// to ~0.56 - and stops above the card number in the bottom corner.
const STRIP_TOP = 0.58;
const STRIP_BOTTOM = 0.93;

// --- what the game actually loads -------------------------------------------

// Pull the sheet and its grid out of the .card-market-sprite rule rather than
// restating them. background-size: 1000% 700% IS the grid: 10 cards across,
// 7 down.
function readSpriteRuleFromCSS() {
  const css = fs.readFileSync(path.join(ROOT, 'style.css'), 'utf8');
  const rule = css.match(/\.card-market-sprite\s*\{([\s\S]*?)\}/);
  if (!rule) throw new Error('No .card-market-sprite rule in style.css - has it been renamed?');

  const url = rule[1].match(/background-image:\s*url\(['"]?([^'")?]+)/);
  const size = rule[1].match(/background-size:\s*(\d+)%\s+(\d+)%/);
  if (!url) throw new Error('No background-image url in .card-market-sprite');
  if (!size) throw new Error('No background-size in .card-market-sprite - cannot infer the grid');

  return {
    file: url[1],
    cols: Number(size[1]) / 100,
    rows: Number(size[2]) / 100,
  };
}

// --- comparison --------------------------------------------------------------

// Compare shape and colour, ignoring WHERE in the 2x3 grid the data happens to
// sit. [null,g,g]/[p,p,null] and [g,g,null]/[null,p,p] are the same printed
// shape, and the engine matches under rotation and reflection anyway, so the
// column offset the CSV chose is not something the art can get wrong.
function canon(pattern) {
  let rows = [pattern.slice(0, 3), pattern.slice(3, 6)];
  let cols = rows[0].map((_, i) => rows.map(r => r[i]));
  while (cols.length && cols[0].every(c => !c)) cols.shift();
  while (cols.length && cols[cols.length - 1].every(c => !c)) cols.pop();
  if (!cols.length) return '[]';
  rows = cols[0].map((_, i) => cols.map(c => c[i]));
  while (rows.length && rows[rows.length - 1].every(c => !c)) rows.pop();
  return JSON.stringify(rows);
}

// --- the read ----------------------------------------------------------------

// Runs inside the page. Draws one card's swatch strip to a canvas and decodes
// it. Swatches are flat-filled, axis-aligned and on a regular lattice, so the
// bands can be found by projecting the colour hits onto each axis and taking
// contiguous runs - no connected-component labelling needed.
function decodeStripInPage(geometry, cardId) {
  const { cols, rows, palette, tolerance, stripTop, stripBottom } = geometry;
  const names = Object.keys(palette);

  const img = window.__sheet;
  const cw = img.naturalWidth / cols;
  const ch = img.naturalHeight / rows;
  const col = (cardId - 1) % cols;
  const row = Math.floor((cardId - 1) / cols);

  const sx = Math.round(col * cw);
  const sy = Math.round(row * ch + ch * stripTop);
  const sw = Math.round(cw);
  const sh = Math.round(ch * (stripBottom - stripTop));

  const c = document.createElement('canvas');
  c.width = sw;
  c.height = sh;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
  const data = ctx.getImageData(0, 0, sw, sh).data;

  // Classify every pixel to its nearest tile colour, or to nothing.
  const hit = new Uint8Array(sw * sh);
  const which = new Uint8Array(sw * sh);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    let best = -1;
    let bestD = Infinity;
    for (let k = 0; k < names.length; k++) {
      const [r, g, b] = palette[names[k]];
      const d = Math.hypot(data[i] - r, data[i + 1] - g, data[i + 2] - b);
      if (d < bestD) { bestD = d; best = k; }
    }
    if (bestD < tolerance) { hit[p] = 1; which[p] = best; }
  }

  const runs = (counts, minLen) => {
    const out = [];
    let start = null;
    for (let i = 0; i <= counts.length; i++) {
      const on = i < counts.length && counts[i] > 8;
      if (on && start === null) start = i;
      else if (!on && start !== null) {
        if (i - start >= minLen) out.push([start, i]);
        start = null;
      }
    }
    return out;
  };

  const colCounts = new Array(sw).fill(0);
  const rowCounts = new Array(sh).fill(0);
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      if (hit[y * sw + x]) { colCounts[x]++; rowCounts[y]++; }
    }
  }
  const xruns = runs(colCounts, 20);
  const yruns = runs(rowCounts, 20);

  // The runs come out in order, so their index IS the grid slot - band 0 is the
  // leftmost occupied column, and canon() strips the same leading blanks off the
  // data side before comparing.
  const grid = [null, null, null, null, null, null];
  let swatches = 0;
  for (let r = 0; r < yruns.length && r < 2; r++) {
    for (let c2 = 0; c2 < xruns.length && c2 < 3; c2++) {
      const [ya, yb] = yruns[r];
      const [xa, xb] = xruns[c2];
      const tally = new Array(names.length).fill(0);
      let hits = 0;
      let total = 0;
      for (let y = ya; y < yb; y++) {
        for (let x = xa; x < xb; x++) {
          total++;
          if (hit[y * sw + x]) { hits++; tally[which[y * sw + x]]++; }
        }
      }
      // A grid slot the card does not use is mostly cream, so it fails this.
      if (hits / total < 0.5) continue;
      swatches++;
      grid[r * 3 + c2] = names[tally.indexOf(Math.max(...tally))];
    }
  }
  return { grid, swatches };
}

// --- run ---------------------------------------------------------------------

const sprite = readSpriteRuleFromCSS();
const sheetPath = path.join(ROOT, sprite.file);
if (!fs.existsSync(sheetPath)) {
  console.error(`style.css points at ${sprite.file}, which does not exist.`);
  process.exit(1);
}

// index.html and the sheet both have to come over HTTP - see layout-check.mjs
// note 2. A bare static server is enough; the page itself is never loaded.
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '') || 'index.html';
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': rel.endsWith('.png') ? 'image/png' : 'text/html' });
  res.end(fs.readFileSync(file));
});
await new Promise(r => server.listen(PORT, r));

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded' });

const sheetURL = `/${sprite.file.replace(/\\/g, '/')}`;
const loaded = await page.evaluate(async url => {
  const img = new Image();
  img.src = url;
  await img.decode();
  window.__sheet = img;
  return { w: img.naturalWidth, h: img.naturalHeight };
}, sheetURL);

const geometry = {
  cols: sprite.cols,
  rows: sprite.rows,
  palette: PALETTE,
  tolerance: TOLERANCE,
  stripTop: STRIP_TOP,
  stripBottom: STRIP_BOTTOM,
};

console.log(`sheet   ${sprite.file} (${loaded.w} x ${loaded.h}, ${sprite.cols} x ${sprite.rows} cards)`);
console.log(`data    ${REWARD_CARDS.length} cards in src/engine/tiles.js\n`);

// Ship the decoder into the page once. It has to cross as source text because
// it closes over nothing but its arguments and Playwright cannot pass a live
// function reference.
await page.evaluate(src => { window.__decode = new Function(`return (${src})`)(); },
  decodeStripInPage.toString());

const mismatched = [];
const unreadable = [];

for (const card of REWARD_CARDS) {
  const { grid, swatches } = await page.evaluate(
    ([g, id]) => window.__decode(g, id), [geometry, card.id]);

  if (swatches === 0) unreadable.push(card);
  else if (canon(grid) !== canon(card.pattern)) mismatched.push({ card, grid });
}

if (DUMP && mismatched.length) {
  fs.mkdirSync(DUMP_DIR, { recursive: true });
  for (const { card } of mismatched) {
    const buf = await page.evaluate(([g, id]) => {
      const img = window.__sheet;
      const cw = img.naturalWidth / g.cols;
      const ch = img.naturalHeight / g.rows;
      const c = document.createElement('canvas');
      c.width = Math.round(cw);
      c.height = Math.round(ch);
      c.getContext('2d').drawImage(img, Math.round(((id - 1) % g.cols) * cw),
        Math.round(Math.floor((id - 1) / g.cols) * ch), c.width, c.height, 0, 0, c.width, c.height);
      return c.toDataURL('image/png').split(',')[1];
    }, [geometry, card.id]);
    const out = path.join(DUMP_DIR, `card-${card.id}.png`);
    fs.writeFileSync(out, Buffer.from(buf, 'base64'));
    console.log(`  wrote ${path.relative(ROOT, out)}`);
  }
}

await browser.close();
server.close();

for (const card of unreadable) {
  console.log(`  UNREADABLE ${String(card.id).padStart(2)} ${card.name}`);
  console.log('      no swatches found - the printed palette may have shifted (see note 2)');
}
for (const { card, grid } of mismatched) {
  console.log(`  MISMATCH ${String(card.id).padStart(2)} ${card.name}`);
  console.log(`      data  ${JSON.stringify(card.pattern)}`);
  console.log(`      sheet ${JSON.stringify(grid)}`);
}

const bad = mismatched.length + unreadable.length;
if (bad === 0) {
  console.log(`ALL ${REWARD_CARDS.length} CARDS MATCH - the sheet is in sync with the engine.`);
} else {
  console.log(`\n${bad} of ${REWARD_CARDS.length} cards are out of sync.`);
  console.log('Re-export the sheet to a NEW versioned filename, repoint .card-market-sprite');
  console.log('in style.css and bump its ?v= query, then run this again.');
}
process.exit(bad === 0 ? 0 : 1);
