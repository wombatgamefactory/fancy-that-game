// WHAT SHOULD THE STARTING CUPCAKES BE UNDER THE UNCAPPED EXTRA TILE? (9 August)
//
// THE SITUATION. Uncapping the extra tile made a cupcake worth more, because it
// now converts into market access without a per-turn limit. The staggered opening
// purse - which exists to compensate the later seats for sweeping a thinner market
// - therefore OVER-COMPENSATES, and the seat gradient has flipped sign:
//
//   score gradient first-to-last (positive = seat 1 ahead)
//     4p   capped +0.89   uncapped -3.32
//     3p   capped +1.36   uncapped -1.63
//     2p   capped +0.94   uncapped -0.43
//
// Dividing each swing by the table's SPREAD (top seat minus bottom seat: 3, 2 and
// 1 cupcakes) gives 1.40 / 1.50 / 1.37 VP per cupcake of spread. That consistency
// across three independent player counts is what makes the fix predictable: to
// move the gradient back to zero, remove about spread = gradient / 1.4 cupcakes.
//
// AND THE LEVEL IS NOT THE KNOB - that is the 9 August -1 finding. Cutting every
// seat by one shortened the game, dropped every score, widened the winner-to-last
// gap and produced games where a player claimed nothing at all. So the candidates
// here hold TOTAL INFLUX at or near the current table's while flattening the
// spread, rather than paying for the flattening out of the level.
//
// SCREENED ON SCORE GRADIENT, NOT WIN RATE, and deliberately. At 800 games a
// seat's win share carries a +/-3.5 point band, which cannot separate these
// candidates; a seat's mean score carries about +/-1.2 VP. The winner of each
// sweep is then verified on win rate at 3,000 games with simulate.js.
//
//   node ab-startcupcakes-uncapped-2026-08-09.mjs [gamesPerCell]
import { createGame, sweep, takeBonusTile, declineBonusTile, takeExtraTile, dealCards,
  place, claim, skipClaim, skipSpend, moveTile, removePlate, reserveCard, refill,
  calculateFinalScores, getWinningPlayers, setStartingCupcakesTable,
  STARTING_CUPCAKES_BY_SEAT } from './src/engine/game.js';
import { createStatsCollector } from './src/engine/statsCollector.js';
import * as bot from './src/bots/basicBot.js';

const GAMES = parseInt(process.argv[2] || '800', 10);

// Candidates per player count. The control is always first, and every candidate
// carries its total so the level change is visible rather than implied.
const CANDIDATES = {
  2: [[2, 3], [3, 3], [2, 2]],
  3: [[2, 3, 4], [3, 3, 4], [3, 3, 3], [2, 3, 3]],
  4: [[2, 3, 4, 5], [3, 3, 4, 4], [3, 4, 4, 4], [4, 4, 4, 4], [3, 3, 3, 4]],
};

// A SECOND ROUND without editing the list above, which would erase the record of
// the first: extra arguments of the form `3=3,4,4` REPLACE that player count's
// candidates. Counts not mentioned keep the defaults and are still swept, so a
// second round says which counts it is re-opening by naming them.
//   node ab-startcupcakes-uncapped-2026-08-09.mjs 800 3=3,4,4 3=3,3,4
const overrides = process.argv.slice(3).filter(a => /^\d+=[\d,]+$/.test(a));
if (overrides.length > 0) {
  const replaced = new Set();
  for (const spec of overrides) {
    const [count, seats] = spec.split('=');
    if (!replaced.has(count)) { CANDIDATES[count] = []; replaced.add(count); }
    CANDIDATES[count].push(seats.split(',').map(n => parseInt(n, 10)));
  }
  // Sweep ONLY the counts named, so a second round is quick and its output cannot
  // be mistaken for a full re-run of the first.
  for (const count of Object.keys(CANDIDATES)) {
    if (!replaced.has(count)) delete CANDIDATES[count];
  }
}

function runGame(playerCount) {
  const sc = createStatsCollector();
  const cfg = Array.from({ length: playerCount }, (_, i) => ({ id: i, name: `P${i}`, type: 'ai' }));
  let s = createGame(cfg, sc);
  let steps = 0;

  while (!s.gameOver && steps < 1000) {
    switch (s.gamePhase) {
      case 'sweep': {
        if (s.bonusTileAvailable) {
          const b = bot.decideBonusTile ? bot.decideBonusTile(s) : null;
          s = (b !== null && b !== undefined && s.market[b]) ? takeBonusTile(s, b) : declineBonusTile(s);
          break;
        }
        const d = bot.decideSweep(s);
        if (d) s = sweep(s, d.rowOrCol, d.isRow, d.declaration, d.declarationType);
        else s.gamePhase = 'place';
        break;
      }
      case 'place': {
        // Uncapped: ask again after every purchase, exactly as simulate.js does.
        for (let n = 0; n < 25; n++) {
          const x = bot.decideExtraTile ? bot.decideExtraTile(s) : null;
          if (x === null || x === undefined) break;
          s = takeExtraTile(s, x);
        }
        s = place(s, bot.decidePlacements(s));
        break;
      }
      case 'spend': {
        const mv = bot.decideMove ? bot.decideMove(s) : null;
        if (mv) s = moveTile(s, mv.fromIndex, mv.toIndex);
        const rp = bot.decideRemovePlate ? bot.decideRemovePlate(s) : null;
        if (rp !== null && rp !== undefined) s = removePlate(s, rp);
        if (bot.decideDealCards && bot.decideDealCards(s)) s = dealCards(s);
        const rid = bot.decideReserve ? bot.decideReserve(s) : null;
        if (rid !== null && rid !== undefined) s = reserveCard(s, rid);
        s = skipSpend(s);
        break;
      }
      case 'claim': {
        const d = bot.decideClaim(s);
        if (d && d.cardId) s = claim(s, d.cardId, d.removedBoardIndex, d.destination);
        else s = skipClaim(s);
        break;
      }
      case 'refill': s = refill(s); break;
    }
    steps++;
  }
  if (s.gameOver) calculateFinalScores(s);
  return s;
}

function measure(playerCount, table) {
  setStartingCupcakesTable({ ...STARTING_CUPCAKES_BY_SEAT, [playerCount]: table });
  const wins = new Array(playerCount).fill(0);
  const score = new Array(playerCount).fill(0);
  const claims = new Array(playerCount).fill(0);
  let turns = 0, kept = 0, zeroClaim = 0;

  for (let g = 0; g < GAMES; g++) {
    const s = runGame(playerCount);
    turns += s.stats.turnsPlayed;
    // A shared win counts for every player holding it, so the shares still sum
    // to 100% across seats and a tie does not silently vanish from the table.
    const winners = new Set(getWinningPlayers(s).map(p => p.id));
    s.players.forEach((p, seat) => {
      if (winners.has(p.id)) wins[seat] += 1 / winners.size;
      score[seat] += p.score ?? 0;
      claims[seat] += p.claimedCards.length;
      kept += p.cupcakes;
      if (p.claimedCards.length === 0) zeroClaim++;
    });
  }

  const even = 100 / playerCount;
  const seatWin = wins.map(w => 100 * w / GAMES);
  const seatScore = score.map(v => v / GAMES);
  const gradient = seatScore[0] - seatScore[seatScore.length - 1];
  const worstWin = seatWin.reduce((worst, w) => Math.abs(w - even) > Math.abs(worst) ? w - even : worst, 0);
  return {
    table, total: table.reduce((a, v) => a + v, 0),
    seatWin, seatScore, gradient, worstWin,
    spread: Math.max(...seatScore) - Math.min(...seatScore),
    turnsPerPlayer: turns / GAMES / playerCount,
    meanScore: score.reduce((a, v) => a + v, 0) / (GAMES * playerCount),
    keptPerPlayer: kept / (GAMES * playerCount),
    zeroClaimPct: 100 * zeroClaim / (GAMES * playerCount),
    claims,
  };
}

console.log(`\nUNCAPPED EXTRA TILE - starting-cupcake candidates, ${GAMES} games per cell`);
console.log('gradient = seat 1 mean score minus last seat mean score. Target: near 0.');
console.log('spread   = best seat minus worst seat, whichever they are. Target: small.\n');

for (const pc of Object.keys(CANDIDATES).map(Number).sort()) {
  console.log(`===== ${pc} PLAYERS =====`);
  console.log('  table            total  gradient  spread  worst win%   turns/pl  mean score  kept  0-claim%');
  for (const table of CANDIDATES[pc]) {
    const r = measure(pc, table);
    const label = r.table.join('/').padEnd(14);
    console.log(
      `  ${label} ${String(r.total).padStart(5)}  ${r.gradient.toFixed(2).padStart(8)}  ${r.spread.toFixed(2).padStart(6)}  ` +
      `${(r.worstWin >= 0 ? '+' : '') + r.worstWin.toFixed(1).padStart(5)}      ${r.turnsPerPlayer.toFixed(2).padStart(5)}  ` +
      `${r.meanScore.toFixed(1).padStart(9)}  ${r.keptPerPlayer.toFixed(2).padStart(4)}  ${r.zeroClaimPct.toFixed(1).padStart(7)}`
    );
    console.log(`    per seat: score ${r.seatScore.map(v => v.toFixed(1)).join(' / ')}   win% ${r.seatWin.map(v => v.toFixed(1)).join(' / ')}`);
  }
  console.log('');
}

setStartingCupcakesTable(null);
