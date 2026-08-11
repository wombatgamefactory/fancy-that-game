// "First to X" bonus-card probe.
//
// Measures, on UNMODIFIED games, when each candidate race would first be won and
// by whom. No bot changes: the bots do not know the races exist, so this is the
// no-chasing baseline - it answers "when does this condition arise naturally"
// and "does it land on the player who was already winning". Real play would
// resolve races EARLIER (players chase them) and more CONCENTRATED (the leader
// chases best), so every number here is the optimistic end of the range.
//
// Stand row indices: 0 = bottom (4 plates), 1 = second (3), 2 = third (2), 3 = top (1).
import { createGame, sweep, takeBonusTile, declineBonusTile, place, claim, skipClaim, skipSpend, moveTile, removePlate, takeExtraTile, refill, calculateFinalScores, STAND_ROW_VALUES } from './src/engine/game.js';
import { createStatsCollector } from './src/engine/statsCollector.js';
import * as bot from './src/bots/basicBot.js';

const filled = (p, r) => p.stand[r].tiles.length;
const RACES = [
  { key: 'A', label: "4 rows opened (one tile in every row)", test: p => [0,1,2,3].every(r => filled(p,r) >= 1) },
  { key: 'B', label: "top + third rows full (3 tiles)",        test: p => filled(p,3) >= 1 && filled(p,2) >= 2 },
  { key: 'C', label: "bottom row full (4 tiles, one flavour)", test: p => filled(p,0) >= 4 },
  { key: 'D', label: "all 4 cupcake plates covered (7 tiles)", test: p => filled(p,0)>=2 && filled(p,1)>=2 && filled(p,2)>=2 && filled(p,3)>=1 },
  // Cheaper alternatives, for comparison - can these land in the opening third?
  { key: 'E', label: "3 cards claimed",                        test: p => p.claimedCards.length >= 3 },
  { key: 'F', label: "second row full (3 tiles, one flavour)", test: p => filled(p,1) >= 3 },
];

function runGame(pc) {
  const sc = createStatsCollector();
  let s = createGame(Array.from({length:pc},(_,i)=>({id:i,name:'P'+i,type:'ai'})), sc);
  const won = {}; // raceKey -> { turn, playerId }
  let steps = 0;
  const checkRaces = () => {
    for (const r of RACES) {
      if (won[r.key]) continue;
      for (const p of s.players) {
        if (r.test(p)) { won[r.key] = { turn: s.stats.turnsPlayed, playerId: p.id }; break; }
      }
    }
  };
  while (!s.gameOver && steps < 1000) {
    switch (s.gamePhase) {
      case 'sweep': {
        if (s.bonusTileAvailable) { const b = bot.decideBonusTile ? bot.decideBonusTile(s) : null;
          s = (b !== null && b !== undefined && s.market[b]) ? takeBonusTile(s,b) : declineBonusTile(s); break; }
        const d = bot.decideSweep(s);
        if (d) s = sweep(s, d.rowOrCol, d.isRow, d.declaration, d.declarationType); else s.gamePhase = 'place';
        break;
      }
      case 'place': {
        // 3 August: buy the extra tile BEFORE choosing placements - it is placed
        // with the swept tiles, so the placement decision has to see it.
        const x = bot.decideExtraTile ? bot.decideExtraTile(s) : null;
        if (x !== null && x !== undefined) s = takeExtraTile(s, x);
        s = place(s, bot.decidePlacements(s)); break;
      }
      case 'spend': { const m = bot.decideMove ? bot.decideMove(s) : null;
        if (m) s = moveTile(s, m.fromIndex, m.toIndex);
        const rp = bot.decideRemovePlate ? bot.decideRemovePlate(s) : null;
        if (rp !== null && rp !== undefined) s = removePlate(s, rp);
        // (the paid reserve was driven here until 11 August, when it was deleted)
        s = skipSpend(s); break; }
      case 'claim': { const d = bot.decideClaim(s);
        s = (d && d.cardId) ? claim(s, d.cardId, d.removedBoardIndex, d.destination) : skipClaim(s);
        checkRaces(); break; }
      case 'refill': s = refill(s); break;
    }
    steps++;
  }
  if (s.gameOver) calculateFinalScores(s);
  const scores = s.players.map(p => p.score);
  const top = Math.max(...scores);
  return { turns: Math.max(1, s.stats.turnsPlayed), won, scores,
           winners: s.players.filter(p => p.score === top).map(p => p.id) };
}

const GAMES = parseInt(process.argv[2]) || 500;
const BONUS = parseInt(process.argv[3]) || 5;

for (const pc of [2, 3, 4]) {
  const all = [];
  for (let g = 0; g < GAMES; g++) all.push(runGame(pc));
  console.log(`\n================ ${pc} PLAYERS (${GAMES} games, bonus ${BONUS} VP each) ================\n`);
  console.log(`${'race'.padEnd(44)} ${'won'.padStart(6)} ${'when (frac of game)'.padStart(20)} ${'in 1st third'.padStart(13)} ${'to game winner'.padStart(15)}`);
  for (const r of RACES) {
    const hits = all.filter(g => g.won[r.key]);
    if (!hits.length) { console.log(`${r.label.padEnd(44)} ${'0'.padStart(6)}`); continue; }
    const fracs = hits.map(g => g.won[r.key].turn / g.turns);
    const meanFrac = fracs.reduce((a,b)=>a+b,0) / fracs.length;
    const firstThird = fracs.filter(f => f < 1/3).length;
    const toWinner = hits.filter(g => g.winners.includes(g.won[r.key].playerId)).length;
    console.log(`${r.label.padEnd(44)} ${String(hits.length).padStart(6)} ${meanFrac.toFixed(2).padStart(20)} ${(100*firstThird/hits.length).toFixed(0).padStart(12)}% ${(100*toWinner/hits.length).toFixed(0).padStart(14)}%`);
  }

  // Concentration: using Dean's four (A-D), how many does one player sweep?
  const DEANS = ['A','B','C','D'];
  const conc = {};
  for (const g of all) {
    const counts = {};
    for (const k of DEANS) if (g.won[k]) counts[g.won[k].playerId] = (counts[g.won[k].playerId]||0)+1;
    const most = Math.max(0, ...Object.values(counts));
    conc[most] = (conc[most]||0) + 1;
  }
  console.log(`\nConcentration of Dean's four races (A-D), most won by any ONE player:`);
  for (const k of Object.keys(conc).sort()) console.log(`  ${k} of 4: ${conc[k]} games (${(100*conc[k]/GAMES).toFixed(1)}%)`);

  // Counterfactual: award BONUS VP per race and recompute the spread.
  const base = [], withB = [];
  let flips = 0;
  for (const g of all) {
    const adj = g.scores.slice();
    for (const k of DEANS) if (g.won[k]) adj[g.won[k].playerId] += BONUS;
    const bLast = Math.min(...g.scores), bTop = Math.max(...g.scores);
    const aLast = Math.min(...adj), aTop = Math.max(...adj);
    base.push(100*bLast/bTop); withB.push(100*aLast/aTop);
    const newTop = Math.max(...adj);
    if (!adj.map((v,i)=>v===newTop?i:-1).filter(i=>i>=0).some(i => g.winners.includes(i))) flips++;
  }
  const mean = a => a.reduce((x,y)=>x+y,0)/a.length;
  const fail = a => 100 * a.filter(v => v < 75).length / a.length;
  console.log(`\nIssue D1 spread test (last as % of winner; criterion >= 75%):`);
  console.log(`  BASELINE       mean=${mean(base).toFixed(1)}%   games failing=${fail(base).toFixed(1)}%`);
  console.log(`  WITH A-D @${BONUS}VP  mean=${mean(withB).toFixed(1)}%   games failing=${fail(withB).toFixed(1)}%`);
  console.log(`  games whose winner CHANGES: ${(100*flips/GAMES).toFixed(1)}%`);
}
