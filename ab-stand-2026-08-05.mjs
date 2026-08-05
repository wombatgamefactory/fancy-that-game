// A/B HARNESS for the 5 August cake-stand question: the bottom row (4 tiles of
// ONE ingredient, the hardest structure in the game) pays 22 VP + 1 cupcake,
// while the top three rows together (6 tiles across THREE ingredients) pay
// 28 VP + 3 cupcakes. The deep commitment is underpaid. Candidates below keep
// the pyramid total at 50 and the left-to-right climb within every row, but
// shift weight into the bottom row's completion tile.
//
// Same mechanics as ab-2026-08-03-v2.mjs: STAND_ROW_VALUES (and for one cell
// CUPCAKE_PLATES) are module-level `export const`s with no runtime seam, and the
// project is not under git, so each cell REWRITES game.js, runs the stand-shape
// probe in a CHILD PROCESS (ES module bindings resolve at first load), and
// restores the original source in a finally block. If interrupted mid-run,
// check STAND_ROW_VALUES and CUPCAKE_PLATES in src/engine/game.js before
// trusting anything.
//
//   node ab-stand-2026-08-05.mjs [gamesPerCell]
//
// The probe (probe-feld-2026-08-04.js) drives basicBot, which values plating by
// the MARGINAL row increment read from STAND_ROW_VALUES - so the bot genuinely
// adapts to each candidate rather than playing the old values.
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GAME = path.join(__dirname, 'src', 'engine', 'game.js');
const GAMES = parseInt(process.argv[2]) || 400;

const VALUES_RE = /export const STAND_ROW_VALUES = \[\[[^\]]*\], \[[^\]]*\], \[[^\]]*\], \[[^\]]*\]\];/;
const PLATES_RE = /export const CUPCAKE_PLATES = \[[\s\S]*?\];/;

const valuesLine = (rows) =>
  `export const STAND_ROW_VALUES = [${rows.map(r => `[${r.join(', ')}]`).join(', ')}];`;

// Candidate cells. `plates` non-null adds a completion cupcake on the bottom
// row's 4th plate (rowIndex 0, plateIndex 3) alongside the existing four.
// All six cells run on 5 August, 400 games/cell, basic bot, results in the
// conversation record. Bottom-row completion rate: LIVE 14-20% of stands; every
// candidate ~32-36%. Total stand VP stayed ~24/player in every cell (no
// inflation - the pyramid still sums to 50, tiles just move between rows). The
// 3-cap middle row's full rate fell to 10-16% in ALL candidates: tile-budget
// substitution, the cost of making the bottom row worth feeding. D was the
// recommendation (bottom 26 beats top-three 24, openers 1/2/3/5 kept,
// three-deep bottom = full middle row = 12).
const CELLS = [
  { key: 'LIVE', label: 'LIVE   22/14/9/5  bottom 1/4/12/22', rows: null, plates: null },
  { key: 'A', label: 'A      26/11/8/5  bottom 1/4/12/26 (openers 1/2/3/5 kept)', rows: [[1, 4, 12, 26], [2, 5, 11], [3, 8], [5]], plates: null },
  { key: 'B', label: 'B      28/10/7/5  bottom 1/4/12/28 (steeper jackpot)', rows: [[1, 4, 12, 28], [2, 5, 10], [2, 7], [5]], plates: null },
  { key: 'C', label: 'C      layout A + completion cupcake on bottom plate 4', rows: [[1, 4, 12, 26], [2, 5, 11], [3, 8], [5]],
    plates: `export const CUPCAKE_PLATES = [
  { rowIndex: 0, plateIndex: 1 },
  { rowIndex: 0, plateIndex: 3 },
  { rowIndex: 1, plateIndex: 1 },
  { rowIndex: 2, plateIndex: 1 },
  { rowIndex: 3, plateIndex: 0 },
];` },
  { key: 'D', label: 'D      26/12/7/5  bottom 1/4/12/26, middle row 2/6/12', rows: [[1, 4, 12, 26], [2, 6, 12], [3, 7], [5]], plates: null },
  { key: 'E', label: 'E      25/12/8/5  bottom 1/4/12/25, middle row 2/6/12', rows: [[1, 4, 12, 25], [2, 6, 12], [3, 8], [5]], plates: null },
];

const original = fs.readFileSync(GAME, 'utf8');
if (!VALUES_RE.test(original)) throw new Error('could not find STAND_ROW_VALUES in game.js');
if (!PLATES_RE.test(original)) throw new Error('could not find CUPCAKE_PLATES in game.js');

try {
  for (const cell of CELLS) {
    let src = original;
    if (cell.rows) src = src.replace(VALUES_RE, valuesLine(cell.rows));
    if (cell.plates) src = src.replace(PLATES_RE, cell.plates);
    fs.writeFileSync(GAME, src);

    const out = execFileSync('node', ['probe-feld-2026-08-04.js', String(GAMES)],
      { cwd: __dirname, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

    console.log(`\n########## ${cell.label} ##########`);
    // Keep only the stand-shape lines; the probe's claim/leader sections are
    // unaffected by row values and just add noise here.
    for (const line of out.split('\n')) {
      if (/=== \d PLAYERS|Stand row|Crumb tray|Cupcakes SPENT/.test(line)) console.log(line);
    }
  }
} finally {
  fs.writeFileSync(GAME, original);
  console.log('\ngame.js restored to original.');
}
