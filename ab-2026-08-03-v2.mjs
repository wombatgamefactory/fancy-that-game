// A/B HARNESS for the second 3 August 2026 change set: the bag size (TILE_COPIES)
// and the 2-cupcake extra tile. Run with
//   node ab-2026-08-03-v2.mjs [gamesPerCell] [playerCounts] [bot]
//   node ab-2026-08-03-v2.mjs 300 2,3,4 fast
//   node ab-2026-08-03-v2.mjs 100 2,3,4 basic
//
// ALWAYS RUN BOTH BOTS. simulate.js defaults to `fast`, which sweeps and places
// at RANDOM; its games clog the personal boards and end on boardFull/boardOverflow,
// so tile-supply and board-space effects read very differently under it than under
// `basic`, whose games are ~40% shorter and end on the empty-plate clock. A
// conclusion that holds under only one of them is a fact about that bot.
//
// WHY IT EXISTS AND WHAT IT CANNOT DO. The two knobs under test are module-level
// `export const`s with no runtime seam (unlike EXTRA_CLAIM_CUPCAKE_COST, which has
// setExtraClaimCupcakeCost). This project is not under version control either, so
// there is no old revision to run against. This harness therefore REWRITES the two
// constants in place, runs a batch, and restores the originals - a real edit to
// real files, with the originals held in memory and written back in a finally
// block. If it is interrupted mid-run, check TILE_COPIES in src/engine/tiles.js
// and EXTRA_TILE_CUPCAKE_COST in src/engine/game.js before trusting anything.
//
// THE PLATE ACTION IS NOT A/B'd, and cannot be: its predecessor (move a plate for
// 2) is deleted code, not a constant. It is measured directly instead - see the
// removePlate line in the metric-8 block of the main report, and
// probe-plate-price.js for why that line reads the way it does.
//
// Each cell is run in a CHILD PROCESS so the constants are re-read from source
// every time. Importing the engine once and mutating it would not work: ES module
// bindings are resolved at first load.
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';
// Imported for ONE reason: to size the bag labels below from the real tile
// geometry instead of typing "100" and "125" into them. It is read once, before
// any rewrite, and only the combination count is used - which the rewrite cannot
// change, since it only ever touches TILE_COPIES.
import { COLOURS, INGREDIENTS, TILE_COPIES } from './src/engine/tiles.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TILES = path.join(__dirname, 'src', 'engine', 'tiles.js');
const GAME = path.join(__dirname, 'src', 'engine', 'game.js');

const GAMES = parseInt(process.argv[2]) || 200;
const COUNTS = (process.argv[3] || '2,3,4').split(',').map(n => parseInt(n.trim()));
const BOT = process.argv[4] || 'fast';

// Tiles in the bag for a given TILE_COPIES. Derived from the colour and
// ingredient lists so the cell labels cannot go stale the way the hardcoded
// "100" and "125" in them did - which is precisely what happened when the bag
// went back to 4 copies on 4 August and this table still called 125 the new one.
const COMBOS = COLOURS.length * INGREDIENTS.length;
const bagOf = (copies) => copies * COMBOS;

// The four cells: (bag copies) x (extra-tile price).
//
// WHAT IS LIVE MOVED ON 4 AUGUST. The 3 August set adopted 5 copies and a
// 2-cupcake extra tile (the bottom row here). A 4-player game played to
// completion on 3 August never came close to running out of tiles, so the bag
// went back to 4 copies while the 2-cupcake price stayed - i.e. the LIVE cell is
// now the third row, and the fourth is the one that was backed out. The marker is
// computed from TILE_COPIES rather than written into a label so it follows the
// constant instead of having to be remembered.
const CELLS = [
  { copies: 4, extraTile: 1 },
  { copies: 5, extraTile: 1 },
  { copies: 4, extraTile: 2 },
  { copies: 5, extraTile: 2 },
].map(c => ({
  ...c,
  label: `${c.copies === TILE_COPIES && c.extraTile === 2 ? 'LIVE ' : '     '}bag ${bagOf(c.copies)}, extra tile ${c.extraTile}`,
}));

// Guard on the PATTERN MATCHING, not on the text changing: consecutive cells
// often share one of the two values, and a rewrite that is correctly a no-op is
// not a failure to find the constant.
function rewrite(file, re, replacement) {
  const src = fs.readFileSync(file, 'utf8');
  if (!re.test(src)) throw new Error(`could not find ${re} in ${file}`);
  fs.writeFileSync(file, src.replace(re, replacement));
}

function setConstants(copies, extraTile) {
  rewrite(TILES, /export const TILE_COPIES = \d+;/, `export const TILE_COPIES = ${copies};`);
  rewrite(GAME, /export const EXTRA_TILE_CUPCAKE_COST = \d+;/, `export const EXTRA_TILE_CUPCAKE_COST = ${extraTile};`);
}

// Pull the handful of figures worth comparing out of simulate.js's printout.
// Deliberately a few named lines rather than the whole report: this is a
// difference table, and the full report is one `node simulate.js` away.
function parse(out) {
  const grab = (re, i = 1) => { const m = out.match(re); return m ? m[i] : '-'; };
  return {
    turns:      grab(/Game length \(D3\):\s+turns mean=([\d.]+)/),
    tiles:      grab(/Tiles taken\/game:\s+mean=([\d.]+)/),
    refreshes:  grab(/Refreshes\/game:\s+mean=([\d.]+)/),
    lockPct:    grab(/Locked turns:\s+\d+\/\d+ \(([\d.]+)%\)/),
    claims:     grab(/Claims\/player:\s+mean=([\d.]+)/),
    score:      grab(/Final score:\s+mean=([\d.]+)/),
    spread:     grab(/Score spread \(D1\):\s+mean=([\d.]+)/),
    lastPct:    grab(/last as % of winner: mean=([\d.]+)%/),
    extraTile:  grab(/extra tile=(\d+)/),
    moveTile:   grab(/move tile=(\d+)/),
    removePlate:grab(/remove plate=(\d+)/),
    reserve:    grab(/reserve=(\d+)/),
    spentPct:   grab(/total spent:\s+\d+ = ([\d.]+)%/),
    broke:      grab(/finished BROKE \(0 held\):\s+\d+\/\d+ \(([\d.]+)%\)/),
    endReasons: grab(/End reasons:\s+(\{.*\})/),
  };
}

const originalTiles = fs.readFileSync(TILES, 'utf8');
const originalGame = fs.readFileSync(GAME, 'utf8');
const results = {};

try {
  for (const cell of CELLS) {
    setConstants(cell.copies, cell.extraTile);
    for (const pc of COUNTS) {
      process.stderr.write(`  running ${cell.label.trim()} at ${pc}p (${GAMES} games)...\n`);
      const out = execFileSync(process.execPath, ['simulate.js', String(GAMES), String(pc), BOT], {
        cwd: __dirname, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
      });
      results[`${cell.label}|${pc}`] = parse(out);
    }
  }
} finally {
  fs.writeFileSync(TILES, originalTiles);
  fs.writeFileSync(GAME, originalGame);
  process.stderr.write('  constants restored to the live values\n');
}

const ROWS = [
  ['turns',       'game length (turns)'],
  ['tiles',       'tiles taken/game'],
  ['refreshes',   'pots of tea/game'],
  ['lockPct',     'card-locked turns %'],
  ['claims',      'claims/player'],
  ['score',       'final score'],
  ['spread',      'score spread (D1)'],
  ['lastPct',     'last as % of winner'],
  ['moveTile',    'cupcakes: move tile'],
  ['extraTile',   'cupcakes: extra tile'],
  ['removePlate', 'cupcakes: remove plate'],
  ['reserve',     'cupcakes: reserve'],
  ['spentPct',    'cupcake influx spent %'],
  ['broke',       'games with a broke player %'],
];

for (const pc of COUNTS) {
  console.log(`\n=== ${pc} PLAYERS (${GAMES} games per cell) ===\n`);
  const cells = CELLS.map(c => results[`${c.label}|${pc}`]);
  console.log(`${''.padEnd(28)}${CELLS.map(c => c.label.trim().padStart(26)).join('')}`);
  for (const [key, label] of ROWS) {
    console.log(`${label.padEnd(28)}${cells.map(r => String(r[key]).padStart(26)).join('')}`);
  }
  console.log(`\n  end reasons:`);
  CELLS.forEach((c, i) => console.log(`    ${c.label.trim().padEnd(28)} ${cells[i].endReasons}`));
}

console.log(`\nNote: cupcake spend rows are CUPCAKES SPENT, not actions taken - divide the`);
console.log(`extra-tile figure by its price to compare purchase counts across cells.`);
