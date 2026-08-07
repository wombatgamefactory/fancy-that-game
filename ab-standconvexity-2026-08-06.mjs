// IS THE CAKE STAND'S CONVEXITY THE RUNAWAY?
//
// THE HYPOTHESIS, from probe-spread-2026-08-06.js at 4 players: the winner ends
// with 6.79 stand tiles against the last player's 4.91 - 38% more - but 31.42
// stand VP against 16.80 - 87% more. The stand is a CONVEX function of tiles
// plated (bottom-row increments are 1, 3, 8, 14), and tiles plated is roughly
// linear in claims. Convexity is precisely what turns a small lead into a large
// one, and the cake stand is 60% of the whole winner-minus-last gap.
//
// THE CONTROL that settles it: a stand paying a FLAT 5 VP per tile. Same maximum
// (20 + 15 + 10 + 5 = 50), same rows, same capacities, zero convexity. If the
// spread collapses under it, convexity is the driver and the question becomes how
// much of it to keep. If the spread barely moves, the stand is exonerated and the
// claim bottleneck owns the problem after all.
//
// Cells between the two bracket the trade, because the convexity is not a bug:
// it is the "now or bigger?" gradient the design scores highest on, and the
// 5 August revaluation deliberately steepened it (bottom-row completion went from
// 17.4% to 33.5% of stands). THE POINT OF THIS HARNESS IS TO PRICE THAT TRADE,
// not to recommend flattening.
//
// MECHANICS as in ab-menuvp-2026-08-05.mjs: STAND_ROW_VALUES is a module-level
// `export const` with no runtime seam, so each cell REWRITES game.js, runs in a
// CHILD PROCESS, and restores the original in a finally block. basicBot values a
// plating by the marginal row increment read from this constant, so the bot
// genuinely adapts to each candidate rather than playing the live values.
//
//   node ab-standconvexity-2026-08-06.mjs [gamesPerCell] [playerCounts]
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GAME = path.join(__dirname, 'src', 'engine', 'game.js');
const SELF = fileURLToPath(import.meta.url);
const VALUES_RE = /export const STAND_ROW_VALUES = \[\[[^\]]*\], \[[^\]]*\], \[[^\]]*\], \[[^\]]*\]\];/;

// ---------------------------------------------------------------------------
// CHILD MODE
// ---------------------------------------------------------------------------
if (process.argv[2] === '--child') {
  const GAMES = parseInt(process.argv[3]);
  const COUNT = parseInt(process.argv[4]);
  const g = await import('./src/engine/game.js');
  const { createStatsCollector } = await import('./src/engine/statsCollector.js');
  const basicBot = await import('./src/bots/basicBot.js');

  const cfg = Array.from({ length: COUNT }, (_, i) => ({ id: i, name: `P${i}`, type: 'ai' }));
  let spread = 0, ratio = 0, ratioN = 0, totalScore = 0, turns = 0;
  let standTop = 0, standBot = 0, tilesTop = 0, tilesBot = 0, claimsTop = 0, claimsBot = 0;
  let bottomRowFull = 0, stands = 0;

  for (let n = 0; n < GAMES; n++) {
    let gs = g.createGame(cfg, createStatsCollector());
    let steps = 0;
    while (!gs.gameOver && steps < 1000) {
      switch (gs.gamePhase) {
        case 'sweep': {
          if (gs.bonusTileAvailable) {
            const b = basicBot.decideBonusTile ? basicBot.decideBonusTile(gs) : null;
            gs = (b !== null && b !== undefined && gs.market[b]) ? g.takeBonusTile(gs, b) : g.declineBonusTile(gs);
            break;
          }
          const d = basicBot.decideSweep(gs);
          if (d) gs = g.sweep(gs, d.rowOrCol, d.isRow, d.declaration, d.declarationType);
          else gs.gamePhase = 'place';
          break;
        }
        case 'place': {
          const e = basicBot.decideExtraTile ? basicBot.decideExtraTile(gs) : null;
          if (e !== null && e !== undefined) gs = g.takeExtraTile(gs, e);
          gs = g.place(gs, basicBot.decidePlacements(gs));
          break;
        }
        case 'spend': {
          const m = basicBot.decideMove ? basicBot.decideMove(gs) : null;
          if (m) gs = g.moveTile(gs, m.fromIndex, m.toIndex);
          const rp = basicBot.decideRemovePlate ? basicBot.decideRemovePlate(gs) : null;
          if (rp !== null && rp !== undefined) gs = g.removePlate(gs, rp);
          const rc = basicBot.decideReserve ? basicBot.decideReserve(gs) : null;
          if (rc !== null && rc !== undefined) gs = g.reserveCard(gs, rc);
          gs = g.skipSpend(gs);
          break;
        }
        case 'claim': {
          const d = basicBot.decideClaim(gs);
          if (d && d.cardId) gs = g.claim(gs, d.cardId, d.removedBoardIndex, d.destination);
          else gs = g.skipClaim(gs);
          break;
        }
        case 'refill': gs = g.refill(gs); break;
      }
      steps++;
    }
    if (gs.gameOver) g.calculateFinalScores(gs);

    const scores = gs.players.map(p => p.score);
    const top = Math.max(...scores), bottom = Math.min(...scores);
    spread += top - bottom;
    if (top > 0) { ratio += bottom / top; ratioN++; }
    for (const s of scores) totalScore += s;
    turns += gs.stats.turnsPlayed;

    const standVP = (p) => {
      let v = 0;
      for (let i = 0; i < p.stand.length; i++) {
        if (p.stand[i].tiles.length > 0) v += g.STAND_ROW_VALUES[i][p.stand[i].tiles.length - 1];
      }
      return v;
    };
    const tiles = (p) => p.stand.reduce((a, r) => a + r.tiles.length, 0);
    const order = gs.players.map((p, i) => ({ p, score: p.score })).sort((a, b) => b.score - a.score);
    standTop += standVP(order[0].p); standBot += standVP(order[COUNT - 1].p);
    tilesTop += tiles(order[0].p);   tilesBot += tiles(order[COUNT - 1].p);
    claimsTop += order[0].p.claimedCards.length; claimsBot += order[COUNT - 1].p.claimedCards.length;
    for (const p of gs.players) { stands++; if (p.stand[0].tiles.length === 4) bottomRowFull++; }
  }

  process.stdout.write(JSON.stringify({
    spread: spread / GAMES,
    ratio: 100 * ratio / Math.max(1, ratioN),
    meanScore: totalScore / (GAMES * COUNT),
    turnsPerPlayer: turns / GAMES / COUNT,
    standTop: standTop / GAMES, standBot: standBot / GAMES,
    tilesTop: tilesTop / GAMES, tilesBot: tilesBot / GAMES,
    claimsTop: claimsTop / GAMES, claimsBot: claimsBot / GAMES,
    bottomRowFullPct: 100 * bottomRowFull / Math.max(1, stands),
  }));
  process.exit(0);
}

// ---------------------------------------------------------------------------
// PARENT
// ---------------------------------------------------------------------------
const GAMES = parseInt(process.argv[2]) || 1200;
const COUNTS = (process.argv[3] || '3,4').split(',').map(Number);

// Every cell keeps the same four rows, the same capacities and a full-pyramid
// total of 50, so nothing but the SHAPE of the reward changes.
const CELLS = [
  { key: 'LIVE', label: 'LIVE     1/4/12/26 · 2/6/12 · 3/7 · 5   (increments 1,3,8,14)',
    rows: [[1, 4, 12, 26], [2, 6, 12], [3, 7], [5]] },
  { key: 'PRE5AUG', label: 'PRE-5AUG 1/4/12/22 · 2/7/14 · 3/9 · 5   (increments 1,3,8,10)',
    rows: [[1, 4, 12, 22], [2, 7, 14], [3, 9], [5]] },
  { key: 'MILD', label: 'MILD     2/7/14/24 · 3/8/13 · 4/9 · 5   (increments 2,5,7,10)',
    rows: [[2, 7, 14, 24], [3, 8, 13], [4, 9], [5]] },
  { key: 'LINEAR', label: 'LINEAR   5/10/15/20 · 5/10/15 · 5/10 · 5 (flat 5 a tile - THE CONTROL)',
    rows: [[5, 10, 15, 20], [5, 10, 15], [5, 10], [5]] },
];

const original = fs.readFileSync(GAME, 'utf8');
if (!VALUES_RE.test(original)) throw new Error('could not find STAND_ROW_VALUES in game.js');
const valuesLine = (rows) => `export const STAND_ROW_VALUES = [${rows.map(r => `[${r.join(', ')}]`).join(', ')}];`;

try {
  console.log(`\nSTAND CONVEXITY vs SCORE SPREAD - ${GAMES} games per cell per player count (basicBot)`);
  console.log('Every cell tops out at 50 for a full pyramid. Only the SHAPE of the reward changes.\n');

  for (const COUNT of COUNTS) {
    console.log(`=== ${COUNT} PLAYERS ===`);
    console.log('  cell     | spread | last% | score | stand top:last | tiles top:last | bottom row full');
    for (const cell of CELLS) {
      fs.writeFileSync(GAME, original.replace(VALUES_RE, valuesLine(cell.rows)));
      const r = JSON.parse(execFileSync(process.execPath, [SELF, '--child', String(GAMES), String(COUNT)], {
        encoding: 'utf8', maxBuffer: 1 << 24,
      }));
      // The amplification ratio: how much a tile lead is magnified into a VP lead.
      const tileRatio = r.tilesTop / r.tilesBot;
      const vpRatio = r.standTop / r.standBot;
      console.log(
        `  ${cell.key.padEnd(8)} | ${r.spread.toFixed(2).padStart(6)} | ${r.ratio.toFixed(1).padStart(5)} | ${r.meanScore.toFixed(1).padStart(5)} | ${r.standTop.toFixed(1).padStart(5)}:${r.standBot.toFixed(1).padEnd(5)} (${vpRatio.toFixed(2)}x) | ${r.tilesTop.toFixed(2)}:${r.tilesBot.toFixed(2)} (${tileRatio.toFixed(2)}x) | ${r.bottomRowFullPct.toFixed(1).padStart(5)}%`,
      );
    }
    console.log('  AMPLIFICATION = the VP ratio divided by the tile ratio. 1.00 would mean the stand');
    console.log('  converts a tile lead into an equal VP lead; above 1 it magnifies it.\n');
  }
  console.log('LABELS:');
  for (const c of CELLS) console.log(`  ${c.key.padEnd(8)} ${c.label}`);
} finally {
  fs.writeFileSync(GAME, original);
  console.log('\ngame.js restored to its original STAND_ROW_VALUES.');
}
