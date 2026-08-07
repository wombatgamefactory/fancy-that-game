// WHICH OF THE THREE 7-AUGUST-AFTERNOON CONSTANTS MOVED THE 4-PLAYER SEAT BIAS?
//
// THE SITUATION. On the morning of 7 August, immediately after the starting-cupcake
// ladder was adopted, 4-player seat deviations verified at +1.3 / +0.2 / -0.2 / -1.3
// with a first-to-last score gradient of 0.46 VP - the best the project had measured.
// The afternoon changed three constants (TILE_COPIES 4->5, EXTRA_TILE_CUPCAKE_COST
// 2->1, REMOVE_PLATE_CUPCAKE_COST 3->2) and a fresh 3,000-game run now reads
// +2.9 / +0.6 / -0.6 / -2.9 with a gradient of 1.66 VP.
//
// The win-share move is only marginally outside the +/-1.8 noise band and would not
// be worth chasing on its own. THE GRADIENT IS THE REASON TO MEASURE: it more than
// tripled, and a mean-score gradient over 3,000 games is far less noisy than a win
// share. So this sweeps one arm per constant, each reverting exactly one value to its
// pre-afternoon setting, to find which one carries it - or whether none does.
//
// PREDICTION REGISTERED BEFORE RUNNING, so this cannot be read backwards: TILE_COPIES.
// The 4-player bag ran dry on 327 turns per 3,000 games before the afternoon, and a
// pot due against an empty bag is a silent no-op - the market stops refilling for
// EVERYBODY. That froze the late game, and a frozen market cannot be swept fuller by
// an earlier seat. If that is right, the old bug was accidentally suppressing the
// seat bias and fixing it exposed a bias that was there all along. The extra-tile
// price is the alternative candidate and points the other way: it should HELP the
// later seats, who start with more cupcakes to spend on it.
//
// MECHANICS follow the other 6-7 August harnesses: these are module-level
// `export const`s with no runtime seam, so each cell REWRITES the source, runs in a
// CHILD PROCESS, and restores the originals in a finally block. If interrupted,
// check TILE_COPIES in tiles.js and both prices in game.js before trusting anything
// measured afterwards.
//
//   node ab-afternoonseat-2026-08-07.mjs [gamesPerCell] [playerCount]
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GAME = path.join(__dirname, 'src', 'engine', 'game.js');
const TILES = path.join(__dirname, 'src', 'engine', 'tiles.js');
const SELF = fileURLToPath(import.meta.url);

const RE_COPIES = /export const TILE_COPIES = \d+;/;
const RE_EXTRA = /export const EXTRA_TILE_CUPCAKE_COST = \d+;/;
const RE_PLATE = /export const REMOVE_PLATE_CUPCAKE_COST = \d+;/;

// ---------------------------------------------------------------------------
// CHILD MODE - identical driver loop to ab-startcupcakes-2026-08-07.mjs
// ---------------------------------------------------------------------------
if (process.argv[2] === '--child') {
  const GAMES = parseInt(process.argv[3]);
  const COUNT = parseInt(process.argv[4]);
  const g = await import('./src/engine/game.js');
  const { createStatsCollector } = await import('./src/engine/statsCollector.js');
  const b = await import('./src/bots/basicBot.js');

  const cfg = Array.from({ length: COUNT }, (_, i) => ({ id: i, name: `P${i}`, type: 'ai' }));
  const win = new Array(COUNT).fill(0);
  const score = new Array(COUNT).fill(0);
  let spread = 0, ratio = 0, ratioN = 0;

  for (let n = 0; n < GAMES; n++) {
    let s = g.createGame(cfg, createStatsCollector());
    let st = 0;
    while (!s.gameOver && st < 1000) {
      switch (s.gamePhase) {
        case 'sweep': {
          if (s.bonusTileAvailable) {
            const x = b.decideBonusTile ? b.decideBonusTile(s) : null;
            s = (x !== null && x !== undefined && s.market[x]) ? g.takeBonusTile(s, x) : g.declineBonusTile(s);
            break;
          }
          const d = b.decideSweep(s);
          if (d) s = g.sweep(s, d.rowOrCol, d.isRow, d.declaration, d.declarationType);
          else s.gamePhase = 'place';
          break;
        }
        case 'place': {
          const e = b.decideExtraTile ? b.decideExtraTile(s) : null;
          if (e !== null && e !== undefined) s = g.takeExtraTile(s, e);
          s = g.place(s, b.decidePlacements(s));
          break;
        }
        case 'spend': {
          const m = b.decideMove ? b.decideMove(s) : null;
          if (m) s = g.moveTile(s, m.fromIndex, m.toIndex);
          const rp = b.decideRemovePlate ? b.decideRemovePlate(s) : null;
          if (rp !== null && rp !== undefined) s = g.removePlate(s, rp);
          const rc = b.decideReserve ? b.decideReserve(s) : null;
          if (rc !== null && rc !== undefined) s = g.reserveCard(s, rc);
          s = g.skipSpend(s);
          break;
        }
        case 'claim': {
          const d = b.decideClaim(s);
          if (d && d.cardId) s = g.claim(s, d.cardId, d.removedBoardIndex, d.destination);
          else s = g.skipClaim(s);
          break;
        }
        case 'refill': s = g.refill(s); break;
      }
      st++;
    }
    if (s.gameOver) g.calculateFinalScores(s);
    const scores = s.players.map(p => p.score);
    const top = Math.max(...scores), bot = Math.min(...scores);
    spread += top - bot;
    if (top > 0) { ratio += bot / top; ratioN++; }
    const winners = scores.filter(x => x === top).length;
    for (let i = 0; i < COUNT; i++) {
      score[i] += scores[i];
      if (scores[i] === top) win[i] += 1 / winners;
    }
  }

  const even = 100 / COUNT;
  const dev = win.map(w => 100 * w / GAMES - even);
  const sc = score.map(x => x / GAMES);
  process.stdout.write(JSON.stringify({
    dev,
    worst: dev.reduce((a, x) => (Math.abs(x) > Math.abs(a) ? x : a), 0),
    gradient: sc[0] - sc[COUNT - 1],
    mean: sc.reduce((a, x) => a + x, 0) / COUNT,
    spread: spread / GAMES,
    ratio: 100 * ratio / Math.max(1, ratioN),
  }));
  process.exit(0);
}

// ---------------------------------------------------------------------------
// PARENT
// ---------------------------------------------------------------------------
const GAMES = parseInt(process.argv[2]) || 3000;
const COUNT = parseInt(process.argv[3]) || 4;

const origGame = fs.readFileSync(GAME, 'utf8');
const origTiles = fs.readFileSync(TILES, 'utf8');
for (const [re, src, name] of [[RE_COPIES, origTiles, 'TILE_COPIES'], [RE_EXTRA, origGame, 'EXTRA_TILE_CUPCAKE_COST'], [RE_PLATE, origGame, 'REMOVE_PLATE_CUPCAKE_COST']]) {
  if (!re.test(src)) throw new Error(`could not find ${name}`);
}

// Each cell names what it reverts. LIVE first.
const CELLS = [
  { label: 'LIVE (125 / 1 / 2)', copies: 5, extra: 1, plate: 2 },
  { label: 'TILE_COPIES back to 4', copies: 4, extra: 1, plate: 2 },
  { label: 'extra tile back to 2', copies: 5, extra: 2, plate: 2 },
  { label: 'plate removal back to 3', copies: 5, extra: 1, plate: 3 },
];

try {
  console.log(`\nWHICH AFTERNOON CONSTANT MOVED THE SEAT BIAS - ${GAMES} games per cell, ${COUNT} players (basicBot)`);
  console.log('Morning-of-7-August baseline at 4p was +1.3 / +0.2 / -0.2 / -1.3, gradient 0.46 VP.');
  console.log('CAUTION: two identical 3,000-game runs have come out 2.2 points apart in this');
  console.log('project. The WIN SHARES below are near that floor; the GRADIENT is the readable column.\n');
  console.log('  cell                    | ' + Array.from({ length: COUNT }, (_, i) => `seat ${i + 1}`.padStart(7)).join(' | ') + ' |  worst | gradient VP |  mean | last%');

  for (const c of CELLS) {
    fs.writeFileSync(TILES, origTiles.replace(RE_COPIES, `export const TILE_COPIES = ${c.copies};`));
    fs.writeFileSync(GAME, origGame
      .replace(RE_EXTRA, `export const EXTRA_TILE_CUPCAKE_COST = ${c.extra};`)
      .replace(RE_PLATE, `export const REMOVE_PLATE_CUPCAKE_COST = ${c.plate};`));
    const r = JSON.parse(execFileSync(process.execPath, [SELF, '--child', String(GAMES), String(COUNT)], {
      encoding: 'utf8', maxBuffer: 1 << 24,
    }));
    console.log(
      `  ${c.label.padEnd(23)} | ${r.dev.map(d => d.toFixed(1).padStart(7)).join(' | ')} | ${r.worst.toFixed(1).padStart(6)} | ${r.gradient.toFixed(2).padStart(11)} | ${r.mean.toFixed(1).padStart(5)} | ${r.ratio.toFixed(1).padStart(5)}`,
    );
  }
} finally {
  fs.writeFileSync(GAME, origGame);
  fs.writeFileSync(TILES, origTiles);
  console.log('\ngame.js and tiles.js restored to their original constants.');
}
