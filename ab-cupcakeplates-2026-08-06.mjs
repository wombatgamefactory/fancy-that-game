// WHERE SHOULD THE CUPCAKE PLATES GO? - Dean's 6 August proposal, measured.
//
// THE IDEA. The cake stand's two paths pay very differently. Going DEEP (the
// bottom row, four tiles of one flavour) pays 1/4/12/26 and is where the runaway
// lives - a player with 38% more stand tiles ends with 87% more stand VP. Going
// WIDE (short upper rows, several flavours) pays 5, 3/7 and 2/6/12 and is what a
// trailing player ends up doing whether they meant to or not.
//
// So: move every cupcake OFF the bottom row and onto the upper rows. The spread
// path gets paid in CURRENCY, the jackpot path gets paid in POINTS, and the
// anti-runaway costs nothing on the VP ladder at all. Dean's diagram, top row
// first, C = cupcake plate:
//
//        C          top row     (1 plate)  - 1 cupcake
//        CC         third row   (2 plates) - 2 cupcakes
//        CxC        second row  (3 plates) - 2 cupcakes, the ends
//        xxxx       bottom row  (4 plates) - none
//
// Five cupcakes, the same as today, just relocated. THAT MATTERS: total cupcake
// influx is roughly unchanged, so this is a pure test of WHO gets them, not of
// how many there are.
//
// WHAT TO READ. Not the mean score - a cupcake is not a point. Read:
//   - last as % of winner, and the absolute spread (the thing this is FOR);
//   - cupcake income by finishing rank (does it actually reach the trailing
//     player, or does the winner go wide as well as deep?);
//   - bottom-row completion (if the jackpot path stops being taken, the change has
//     bought anti-runaway by deleting the game's best decision, which is the exact
//     trade the MILD stand values were rejected for making too bluntly);
//   - card-lock rate (cupcakes buy extra tiles, so moving them moves who escapes
//     a locked claim step).
//
// MECHANICS as in ab-standconvexity-2026-08-06.mjs: CUPCAKE_PLATES is a
// module-level `export const` with no runtime seam, so each cell REWRITES
// game.js, runs in a CHILD PROCESS, and restores the original in a finally block.
//
//   node ab-cupcakeplates-2026-08-06.mjs [gamesPerCell] [playerCounts]
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GAME = path.join(__dirname, 'src', 'engine', 'game.js');
const SELF = fileURLToPath(import.meta.url);
const PLATES_RE = /export const CUPCAKE_PLATES = \[[\s\S]*?\];/;

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
  let spread = 0, ratio = 0, ratioN = 0, totalScore = 0;
  let claimSteps = 0, locked = 0, bottomFull = 0, stands = 0, turns = 0;
  // DEAN'S PREMISE, 6 August, from watching a real table: "when players run out of
  // cupcakes they run out of opportunities to score." Sampled at the SWEEP step,
  // which is where the extra tile is bought and therefore where being broke first
  // costs you something. "Broke" = cannot afford the extra tile, the only spend
  // that cures a locked claim step.
  let sweepSteps = 0, brokeSweeps = 0;
  let lockedWhenBroke = 0, claimsWhenBroke = 0, lockedWhenSolvent = 0, claimsWhenSolvent = 0;
  let firstCupcakeTurnSum = 0, firstCupcakeN = 0;
  // Was the player solvent at the START of this turn? Carried from the sweep step
  // to the claim step so the lock can be attributed to the wallet.
  let solventThisTurn = null;
  // Per finishing rank: cupcake income (reconstructed), extra tiles bought,
  // stand VP, stand tiles.
  const rank = Array.from({ length: COUNT }, () => ({ income: 0, extra: 0, standVP: 0, tiles: 0, claims: 0, cupcakePlatings: 0 }));

  for (let n = 0; n < GAMES; n++) {
    let gs = g.createGame(cfg, createStatsCollector());
    const spent = new Array(COUNT).fill(0);
    const extras = new Array(COUNT).fill(0);
    // Turn on which each player first held enough to buy an extra tile.
    const firstSolvent = new Array(COUNT).fill(-1);
    let steps = 0;
    while (!gs.gameOver && steps < 1000) {
      const me = gs.currentPlayerIndex;
      switch (gs.gamePhase) {
        case 'sweep': {
          if (gs.bonusTileAvailable) {
            const b = basicBot.decideBonusTile ? basicBot.decideBonusTile(gs) : null;
            gs = (b !== null && b !== undefined && gs.market[b]) ? g.takeBonusTile(gs, b) : g.declineBonusTile(gs);
            break;
          }
          sweepSteps++;
          const solvent = gs.players[me].cupcakes >= g.EXTRA_TILE_CUPCAKE_COST;
          solventThisTurn = solvent;
          if (!solvent) brokeSweeps++;
          if (solvent && firstSolvent[me] < 0) firstSolvent[me] = gs.stats.turnsPlayed;
          const d = basicBot.decideSweep(gs);
          if (d) gs = g.sweep(gs, d.rowOrCol, d.isRow, d.declaration, d.declarationType);
          else gs.gamePhase = 'place';
          break;
        }
        case 'place': {
          const e = basicBot.decideExtraTile ? basicBot.decideExtraTile(gs) : null;
          if (e !== null && e !== undefined) { spent[me] += g.EXTRA_TILE_CUPCAKE_COST; extras[me]++; gs = g.takeExtraTile(gs, e); }
          gs = g.place(gs, basicBot.decidePlacements(gs));
          break;
        }
        case 'spend': {
          const m = basicBot.decideMove ? basicBot.decideMove(gs) : null;
          if (m) { spent[me] += g.MOVE_TILE_CUPCAKE_COST; gs = g.moveTile(gs, m.fromIndex, m.toIndex); }
          const rp = basicBot.decideRemovePlate ? basicBot.decideRemovePlate(gs) : null;
          if (rp !== null && rp !== undefined) { spent[me] += g.REMOVE_PLATE_CUPCAKE_COST; gs = g.removePlate(gs, rp); }
          const rc = basicBot.decideReserve ? basicBot.decideReserve(gs) : null;
          if (rc !== null && rc !== undefined) { spent[me] += g.RESERVE_CUPCAKE_COST; gs = g.reserveCard(gs, rc); }
          gs = g.skipSpend(gs);
          break;
        }
        case 'claim': {
          claimSteps++;
          const d = basicBot.decideClaim(gs);
          const gotOne = !!(d && d.cardId);
          if (solventThisTurn === false) { if (gotOne) claimsWhenBroke++; else lockedWhenBroke++; }
          else if (solventThisTurn === true) { if (gotOne) claimsWhenSolvent++; else lockedWhenSolvent++; }
          if (gotOne) gs = g.claim(gs, d.cardId, d.removedBoardIndex, d.destination);
          else { locked++; gs = g.skipClaim(gs); }
          break;
        }
        case 'refill': gs = g.refill(gs); break;
      }
      steps++;
    }
    if (gs.gameOver) g.calculateFinalScores(gs);
    turns += gs.stats.turnsPlayed;
    for (const t of firstSolvent) if (t >= 0) { firstCupcakeTurnSum += t; firstCupcakeN++; }

    const scores = gs.players.map(p => p.score);
    const top = Math.max(...scores), bottom = Math.min(...scores);
    spread += top - bottom;
    if (top > 0) { ratio += bottom / top; ratioN++; }
    for (const s of scores) totalScore += s;

    const standVP = (p) => {
      let v = 0;
      for (let i = 0; i < p.stand.length; i++) {
        if (p.stand[i].tiles.length > 0) v += g.STAND_ROW_VALUES[i][p.stand[i].tiles.length - 1];
      }
      return v;
    };
    // How many cupcake plates this player actually landed a tile on, read off the
    // final stand against the live CUPCAKE_PLATES - the direct measure of who the
    // layout paid.
    const platings = (p) => {
      let n2 = 0;
      for (const cp of g.CUPCAKE_PLATES) {
        if (p.stand[cp.rowIndex].tiles.length > cp.plateIndex) n2++;
      }
      return n2;
    };
    for (const p of gs.players) { stands++; if (p.stand[0].tiles.length === 4) bottomFull++; }

    gs.players.map((p, i) => ({ p, i, score: p.score })).sort((a, b) => b.score - a.score)
      .forEach((o, r) => {
        rank[r].income += o.p.cupcakes + spent[o.i];
        rank[r].extra += extras[o.i];
        rank[r].standVP += standVP(o.p);
        rank[r].tiles += o.p.stand.reduce((a, row) => a + row.tiles.length, 0);
        rank[r].claims += o.p.claimedCards.length;
        rank[r].cupcakePlatings += platings(o.p);
      });
  }

  process.stdout.write(JSON.stringify({
    spread: spread / GAMES,
    ratio: 100 * ratio / Math.max(1, ratioN),
    meanScore: totalScore / (GAMES * COUNT),
    lockPct: 100 * locked / Math.max(1, claimSteps),
    brokeSweepPct: 100 * brokeSweeps / Math.max(1, sweepSteps),
    lockWhenBrokePct: 100 * lockedWhenBroke / Math.max(1, lockedWhenBroke + claimsWhenBroke),
    lockWhenSolventPct: 100 * lockedWhenSolvent / Math.max(1, lockedWhenSolvent + claimsWhenSolvent),
    firstSolventTurn: firstCupcakeTurnSum / Math.max(1, firstCupcakeN),
    bottomFullPct: 100 * bottomFull / Math.max(1, stands),
    turnsPerPlayer: turns / GAMES / COUNT,
    rank: rank.map(r => ({
      income: r.income / GAMES, extra: r.extra / GAMES, standVP: r.standVP / GAMES,
      tiles: r.tiles / GAMES, claims: r.claims / GAMES, platings: r.cupcakePlatings / GAMES,
    })),
  }));
  process.exit(0);
}

// ---------------------------------------------------------------------------
// PARENT
// ---------------------------------------------------------------------------
const GAMES = parseInt(process.argv[2]) || 1200;
const COUNTS = (process.argv[3] || '3,4').split(',').map(Number);

// rowIndex 0 = bottom (4 plates) … rowIndex 3 = top (1 plate).
const platesLine = (list) =>
  `export const CUPCAKE_PLATES = [\n${list.map(p => `  { rowIndex: ${p.rowIndex}, plateIndex: ${p.plateIndex} },`).join('\n')}\n];`;

const CELLS = [
  {
    key: 'LIVE',
    label: 'LIVE      bottom[1],bottom[3],second[1],third[1],top[0]   (2 on the bottom row)',
    plates: [
      { rowIndex: 0, plateIndex: 1 }, { rowIndex: 0, plateIndex: 3 },
      { rowIndex: 1, plateIndex: 1 }, { rowIndex: 2, plateIndex: 1 }, { rowIndex: 3, plateIndex: 0 },
    ],
  },
  {
    key: 'DEAN',
    label: "DEAN      top[0], third[0,1], second[0,2], bottom none    (C / CC / CxC / xxxx)",
    plates: [
      { rowIndex: 1, plateIndex: 0 }, { rowIndex: 1, plateIndex: 2 },
      { rowIndex: 2, plateIndex: 0 }, { rowIndex: 2, plateIndex: 1 },
      { rowIndex: 3, plateIndex: 0 },
    ],
  },
  {
    key: 'DEAN-6',
    label: 'DEAN-6    as DEAN plus second[1] - the whole upper pyramid, 6 cupcakes',
    plates: [
      { rowIndex: 1, plateIndex: 0 }, { rowIndex: 1, plateIndex: 1 }, { rowIndex: 1, plateIndex: 2 },
      { rowIndex: 2, plateIndex: 0 }, { rowIndex: 2, plateIndex: 1 },
      { rowIndex: 3, plateIndex: 0 },
    ],
  },
  {
    key: 'HALFWAY',
    label: 'HALFWAY   DEAN but the bottom row keeps ONE, on its opening plate',
    plates: [
      { rowIndex: 0, plateIndex: 0 },
      { rowIndex: 1, plateIndex: 0 }, { rowIndex: 1, plateIndex: 2 },
      { rowIndex: 2, plateIndex: 0 }, { rowIndex: 2, plateIndex: 1 },
      { rowIndex: 3, plateIndex: 0 },
    ],
  },
  {
    // THE REFINEMENT. Every cell above halves bottom-row completion, because
    // stripping the bottom row of cupcakes strips it of the incentive that the
    // 5 August revaluation was adopted to create (it lifted completion from 17.4%
    // to 33.5%). This keeps Dean's upper pyramid AND the completion cupcake on the
    // bottom row's LAST plate - so the deep path is paid only for FINISHING, never
    // for starting, while the wide path is paid all the way along.
    key: 'DEAN+C',
    label: 'DEAN+C    DEAN plus the completion cupcake on bottom[3]  (C / CC / CxC / xxxC)',
    plates: [
      { rowIndex: 0, plateIndex: 3 },
      { rowIndex: 1, plateIndex: 0 }, { rowIndex: 1, plateIndex: 2 },
      { rowIndex: 2, plateIndex: 0 }, { rowIndex: 2, plateIndex: 1 },
      { rowIndex: 3, plateIndex: 0 },
    ],
  },
  {
    // DEAN'S SECOND PROPOSAL, 6 August, and it comes from a TABLE rather than a
    // spreadsheet: "when players run out of cupcakes they run out of opportunities
    // to score." A cupcake on the FIRST plate of every row means the very first
    // tile you ever plate pays one, whichever row you open - so nobody is broke
    // for long, and the extra-tile spend that cures a locked claim step stays
    // reachable. The fifth sits on the bottom row's LAST plate, so the deep row is
    // paid at both ends: once for committing and once for finishing.
    //
    // NOTE THE HISTORY, because it is not a clean slate: an opening-plate variant
    // was playtested on 20 July and rejected as too easy and too spread-rewarding.
    // Two things have changed since. Cupcakes stopped scoring VP on 3 August, so
    // "too easy" no longer means free points - it means a bigger toolbox. And
    // "spread-rewarding" is arguably the point now, given the runaway measured on
    // 6 August. Worth re-testing rather than treating the old note as binding.
    key: 'FIRST',
    label: "FIRST      first plate of EVERY row + the bottom row's last  (C / C. / C.. / C..C)",
    plates: [
      { rowIndex: 0, plateIndex: 0 }, { rowIndex: 0, plateIndex: 3 },
      { rowIndex: 1, plateIndex: 0 },
      { rowIndex: 2, plateIndex: 0 },
      { rowIndex: 3, plateIndex: 0 },
    ],
  },
  {
    // DEAN+C keeps the bottom row's LATE cupcake and still halves completion, so
    // the incentive that was doing the work is the EARLY one. This keeps Dean's
    // upper pyramid and restores the cupcake at bottom[1] - exactly where it sits
    // today - so committing to the deep row still pays something on the second
    // tile rather than nothing until the fourth. bottom[0] is deliberately NOT
    // used: the opening-plate variant was playtested on 20 July and rejected as
    // too easy and too spread-rewarding.
    key: 'DEAN+EARLY',
    label: 'DEAN+EARLY DEAN plus the EARLY cupcake back on bottom[1]  (C / CC / CxC / xCxx)',
    plates: [
      { rowIndex: 0, plateIndex: 1 },
      { rowIndex: 1, plateIndex: 0 }, { rowIndex: 1, plateIndex: 2 },
      { rowIndex: 2, plateIndex: 0 }, { rowIndex: 2, plateIndex: 1 },
      { rowIndex: 3, plateIndex: 0 },
    ],
  },
];

const original = fs.readFileSync(GAME, 'utf8');
if (!PLATES_RE.test(original)) throw new Error('could not find CUPCAKE_PLATES in game.js');

try {
  console.log(`\nWHERE THE CUPCAKE PLATES GO - ${GAMES} games per cell per player count (basicBot)`);
  console.log('Crumb tray counts toward Tasting Menus in every cell (6 August rule).\n');

  for (const COUNT of COUNTS) {
    console.log(`=== ${COUNT} PLAYERS ===`);
    console.log('  cell       | spread | last% | score | lock% | botRow | broke | lock% broke/solvent | 1st cup | last-place income (gap)');
    for (const cell of CELLS) {
      fs.writeFileSync(GAME, original.replace(PLATES_RE, platesLine(cell.plates)));
      const r = JSON.parse(execFileSync(process.execPath, [SELF, '--child', String(GAMES), String(COUNT)], {
        encoding: 'utf8', maxBuffer: 1 << 24,
      }));
      const first = r.rank[0], last = r.rank[COUNT - 1];
      console.log(
        `  ${cell.key.padEnd(10)} | ${r.spread.toFixed(2).padStart(6)} | ${r.ratio.toFixed(1).padStart(5)} | ${r.meanScore.toFixed(1).padStart(5)} | ${r.lockPct.toFixed(1).padStart(5)} | ${r.bottomFullPct.toFixed(1).padStart(5)}% | ${r.brokeSweepPct.toFixed(1).padStart(4)}% | ${r.lockWhenBrokePct.toFixed(1).padStart(8)} / ${r.lockWhenSolventPct.toFixed(1).padStart(6)} | ${r.firstSolventTurn.toFixed(1).padStart(7)} | ${last.income.toFixed(2)} (${(last.income - first.income >= 0 ? '+' : '')}${(last.income - first.income).toFixed(2)})`,
      );
    }
    console.log("  'broke' = share of SWEEP steps where the player could not afford an extra tile.");
    console.log("  'lock% broke/solvent' TESTS DEAN'S PREMISE: if being broke really costs you claims,");
    console.log("  the first number must be clearly higher than the second. '1st cup' is the turn a");
    console.log('  player first becomes able to afford one.');
    console.log('  the winner still collects more cupcakes than the loser and the idea has not landed.\n');
  }
  console.log('LAYOUTS (rowIndex 0 = bottom/4 plates, 3 = top/1 plate):');
  for (const c of CELLS) console.log(`  ${c.label}`);
} finally {
  fs.writeFileSync(GAME, original);
  console.log('\ngame.js restored to its original CUPCAKE_PLATES.');
}
