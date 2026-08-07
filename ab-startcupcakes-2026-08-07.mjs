// SHOULD THE STARTING CUPCAKES BE RETUNED FOR THE 7 AUGUST SEAT BIAS?
//
// THE SITUATION. Worst seat deviation reads +3.9 / +5.1 / +4.9 at 2/3/4 players.
// The obvious reach is the starting-cupcake table, which is the knob that fixed
// this problem on 4 August. Two things say "measure first":
//
//   1. THE PROJECT HAS ALREADY OVERSHOT WITH THIS KNOB. At three players 2/2/3 put
//      seat 3 at +4.8 against a flat table's -3.1 - a swing of about EIGHT points
//      for one cupcake. The note in game.js concluded that one cupcake is a
//      COARSER instrument than the residual it was meant to correct. If the
//      residual has grown, the instrument may now fit; if not, it will overshoot
//      the other way again.
//   2. THE CAUSE IS NOT WHAT IT LOOKS LIKE. probe-flavourseat-2026-08-07.js shows
//      the bias is mostly NOT the Flavour of the Day: with the module switched OFF
//      seat 1 already reads +4.1 at three players and seat 3 -4.3. Flavour adds
//      only about +1.8. So this is the older, undiagnosed 3-player bias that has
//      been drifting since the 5 August stand revaluation, with a Flavour-shaped
//      layer on top.
//
// This sweeps candidate tables and reports the WORST seat deviation and the
// first-to-last gradient for each, so the choice is made on measurement.
//
// MECHANICS as in the other 6-7 August harnesses: STARTING_CUPCAKES_BY_SEAT is a
// module-level `export const` with no runtime seam, so each cell REWRITES game.js,
// runs in a CHILD PROCESS, and restores the original in a finally block. If
// interrupted, check that constant before trusting anything measured afterwards.
//
//   node ab-startcupcakes-2026-08-07.mjs [gamesPerCell] [playerCounts]
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GAME = path.join(__dirname, 'src', 'engine', 'game.js');
const SELF = fileURLToPath(import.meta.url);
const TABLE_RE = /export const STARTING_CUPCAKES_BY_SEAT = \{[\s\S]*?\};/;

// ---------------------------------------------------------------------------
// CHILD MODE
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
    spread: spread / GAMES,
    ratio: 100 * ratio / Math.max(1, ratioN),
  }));
  process.exit(0);
}

// ---------------------------------------------------------------------------
// PARENT
// ---------------------------------------------------------------------------
const GAMES = parseInt(process.argv[2]) || 3000;
const COUNTS = (process.argv[3] || '2,3,4').split(',').map(Number);

// Candidate tables per player count. The LIVE row is always first.
const CELLS = {
  2: [[2, 2], [2, 3], [2, 4]],
  3: [[2, 2, 2], [2, 2, 3], [2, 3, 3], [2, 2, 4], [2, 3, 4]],
  4: [[2, 2, 3, 3], [2, 3, 3, 4], [2, 2, 3, 4], [2, 3, 4, 4], [2, 3, 4, 5]],
};

const original = fs.readFileSync(GAME, 'utf8');
if (!TABLE_RE.test(original)) throw new Error('could not find STARTING_CUPCAKES_BY_SEAT in game.js');

const tableLine = (count, arr) => {
  const rows = { 2: [2, 2], 3: [2, 2, 2], 4: [2, 2, 3, 3] };
  rows[count] = arr;
  return 'export const STARTING_CUPCAKES_BY_SEAT = {\n'
    + [2, 3, 4].map(n => `  ${n}: [${rows[n].join(', ')}],`).join('\n')
    + '\n};';
};

try {
  console.log(`\nSTARTING CUPCAKES vs SEAT FAIRNESS - ${GAMES} games per cell (basicBot)`);
  console.log('Target: every seat within about +/-3 of an even win share.');
  console.log('CAUTION: two identical 3,000-game runs have come out 2.2 points apart in this');
  console.log('project, so differences under ~2 points are not real.\n');

  for (const COUNT of COUNTS) {
    console.log(`=== ${COUNT} PLAYERS ===`);
    console.log('  table          | ' + Array.from({ length: COUNT }, (_, i) => `seat ${i + 1}`.padStart(7)).join(' | ') + ' |  worst | gradient VP | last%');
    for (const arr of CELLS[COUNT]) {
      fs.writeFileSync(GAME, original.replace(TABLE_RE, tableLine(COUNT, arr)));
      const r = JSON.parse(execFileSync(process.execPath, [SELF, '--child', String(GAMES), String(COUNT)], {
        encoding: 'utf8', maxBuffer: 1 << 24,
      }));
      const live = arr.join('/') === CELLS[COUNT][0].join('/') ? '  <- LIVE' : '';
      console.log(
        `  ${arr.join('/').padEnd(14)} | ${r.dev.map(d => d.toFixed(1).padStart(7)).join(' | ')} | ${r.worst.toFixed(1).padStart(6)} | ${r.gradient.toFixed(2).padStart(11)} | ${r.ratio.toFixed(1).padStart(5)}${live}`,
      );
    }
    console.log('');
  }
} finally {
  fs.writeFileSync(GAME, original);
  console.log('game.js restored to its original STARTING_CUPCAKES_BY_SEAT.');
}
