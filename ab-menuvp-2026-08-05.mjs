// A/B HARNESS for TASTING_MENU_VP, after the deck was lightened from four tiles
// to three on 5 August.
//
// WHY. The three-tile deck fixed everything the four-tile deck was measured
// failing - dead cardboard 55.8% -> 21.1% at 3p, menus taken in the last third
// 74.7% -> 45.7%, contested menus 0.102 -> 0.545 per game - by roughly DOUBLING
// how many menus get taken (0.44 -> 1.05 per player). The VP value did not move
// with it, so the module's dose went from 3.5 VP (8.1% of score) to 8.4 VP
// (17.8%), which is the same overdose that condemned the Freshness Bonus. The
// handoff's own rule says drop the value above 0.8 menus per player. This
// measures WHICH value rather than arguing about it.
//
// MECHANICS, copied from ab-stand-2026-08-05.mjs: TASTING_MENU_VP is a
// module-level `export const` with no runtime seam, so each cell REWRITES
// game.js, runs in a CHILD PROCESS (ES module bindings resolve at first load),
// and restores the original source in a finally block. If interrupted mid-run,
// check TASTING_MENU_VP in src/engine/game.js before trusting anything.
//
//   node ab-menuvp-2026-08-05.mjs [gamesPerCell] [playerCounts]
//
// basicBot prices menus off TASTING_MENU_VP directly (menuValueOfPlating returns
// it outright on a completing claim), so the bot genuinely chases each candidate
// value less hard as it falls. That is the point: a cheaper menu should be taken
// LESS often, not merely be worth less, and the two effects compound.
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GAME = path.join(__dirname, 'src', 'engine', 'game.js');
const SELF = fileURLToPath(import.meta.url);
const VP_RE = /export const TASTING_MENU_VP = \d+;/;

// ---------------------------------------------------------------------------
// CHILD MODE: one cell, one player count. Prints a single JSON line.
// ---------------------------------------------------------------------------
if (process.argv[2] === '--child') {
  const GAMES = parseInt(process.argv[3]);
  const COUNT = parseInt(process.argv[4]);
  const g = await import('./src/engine/game.js');
  const { createStatsCollector } = await import('./src/engine/statsCollector.js');
  const basicBot = await import('./src/bots/basicBot.js');

  const cfg = Array.from({ length: COUNT }, (_, i) => ({ id: i, name: `P${i}`, type: 'ai' }));
  const seatWins = new Array(COUNT).fill(0);
  const menusByRank = new Array(COUNT).fill(0);
  let spread = 0, ratio = 0, ratioN = 0, totalScore = 0, totalMenus = 0;
  let dealt = 0, taken = 0;

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
    const winners = gs.players.filter(p => p.score === top).length;
    for (let i = 0; i < COUNT; i++) if (scores[i] === top) seatWins[i] += 1 / winners;

    dealt += gs.tastingMenus.length;
    taken += gs.tastingMenus.filter(m => m.takenBy !== null).length;
    for (const p of gs.players) totalMenus += p.tastingMenus.length;

    gs.players.map((p, i) => ({ i, score: p.score })).sort((a, b) => b.score - a.score)
      .forEach((o, rank) => { menusByRank[rank] += gs.players[o.i].tastingMenus.length; });
  }

  const even = 100 / COUNT;
  const devs = seatWins.map(w => 100 * w / GAMES - even);
  process.stdout.write(JSON.stringify({
    spread: spread / GAMES,
    ratio: 100 * ratio / Math.max(1, ratioN),
    meanScore: totalScore / (GAMES * COUNT),
    menusPerPlayer: totalMenus / (GAMES * COUNT),
    dosePct: 100 * (totalMenus / (GAMES * COUNT)) * g.TASTING_MENU_VP / (totalScore / (GAMES * COUNT)),
    doseVP: (totalMenus / (GAMES * COUNT)) * g.TASTING_MENU_VP,
    deadPct: 100 * (dealt - taken) / Math.max(1, dealt),
    worstSeat: devs.reduce((a, b) => Math.abs(b) > Math.abs(a) ? b : a, 0),
    winnerLastMenuRatio: menusByRank[0] / Math.max(0.0001, menusByRank[COUNT - 1]),
  }));
  process.exit(0);
}

// ---------------------------------------------------------------------------
// PARENT MODE
// ---------------------------------------------------------------------------
const GAMES = parseInt(process.argv[2]) || 1500;
const COUNTS = (process.argv[3] || '2,3,4').split(',').map(Number);
// 8 is LIVE. 4 is the value that lands the dose on the ~4.4 VP / ~9% target the
// module was specified against. 3 is included to bracket it from below rather
// than to be adopted.
const CELLS = [8, 6, 5, 4, 3];

const original = fs.readFileSync(GAME, 'utf8');
if (!VP_RE.test(original)) throw new Error('could not find TASTING_MENU_VP in game.js');
const liveVP = parseInt(original.match(VP_RE)[0].match(/\d+/)[0]);

try {
  console.log(`\nTASTING_MENU_VP A/B - ${GAMES} games per cell per player count (basicBot)`);
  console.log(`Deck: three tiles per card. LIVE value is ${liveVP}.`);
  console.log('Dose target from the module spec: ~4.4 VP/player, ~9% of score.\n');

  for (const COUNT of COUNTS) {
    console.log(`=== ${COUNT} PLAYERS ===`);
    console.log('   VP | menus/pl |  dose VP | dose % |  spread | last% | dead% | worst seat | win:last menus');
    for (const vp of CELLS) {
      fs.writeFileSync(GAME, original.replace(VP_RE, `export const TASTING_MENU_VP = ${vp};`));
      const out = execFileSync(process.execPath, [SELF, '--child', String(GAMES), String(COUNT)], {
        encoding: 'utf8', maxBuffer: 1 << 24,
      });
      const r = JSON.parse(out);
      const live = vp === liveVP ? '  <- LIVE' : '';
      console.log(
        `  ${String(vp).padStart(3)} | ${r.menusPerPlayer.toFixed(2).padStart(8)} | ${r.doseVP.toFixed(2).padStart(8)} | ${r.dosePct.toFixed(1).padStart(5)}% | ${r.spread.toFixed(2).padStart(7)} | ${r.ratio.toFixed(1).padStart(5)} | ${r.deadPct.toFixed(1).padStart(5)} | ${r.worstSeat.toFixed(1).padStart(10)} | ${r.winnerLastMenuRatio.toFixed(2).padStart(5)}x${live}`,
      );
    }
    console.log('');
  }
} finally {
  fs.writeFileSync(GAME, original);
  console.log('game.js restored to its original TASTING_MENU_VP.');
}
