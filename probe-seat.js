// Is there a first-player advantage to compensate for?
//
// Seat N starts with a staggered cupcake bonus (P1=2, P2=3, P3=4, P4=5) on the
// assumption that going first is worth something. This measures whether the
// compensation lands: win share and mean score by seat, plus tie frequency
// (which matters because cupcakes are now the tiebreaker).
//
// ADOPTED AND LIVE SINCE 3 AUGUST, so this no longer measures a proposal against
// a baseline - it is the VERIFICATION TEST for a rule already in the engine, and
// the single most important number in the change set. TARGET: every seat within
// +/-2 points of an even win share. All seats play the identical strategy, so any
// spread here is positional, not skill. Run enough games that the noise band
// printed under each table is comfortably under 2 points (the original finding
// used 3,000 per configuration).
import { createGame, sweep, takeBonusTile, declineBonusTile, place, claim, skipClaim, skipSpend, moveTile, removePlate, reserveCard, takeExtraTile, refill, calculateFinalScores, getWinningPlayers } from './src/engine/game.js';
import { createStatsCollector } from './src/engine/statsCollector.js';
import * as bot from './src/bots/basicBot.js';

function runGame(pc) {
  const sc = createStatsCollector();
  let s = createGame(Array.from({length:pc},(_,i)=>({id:i,name:'P'+i,type:'ai'})), sc);
  let steps = 0;
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
        const rc = bot.decideReserve ? bot.decideReserve(s) : null;
        if (rc !== null && rc !== undefined) s = reserveCard(s, rc);
        s = skipSpend(s); break; }
      case 'claim': { const d = bot.decideClaim(s);
        s = (d && d.cardId) ? claim(s, d.cardId, d.removedBoardIndex, d.destination) : skipClaim(s); break; }
      case 'refill': s = refill(s); break;
    }
    steps++;
  }
  if (s.gameOver) calculateFinalScores(s);
  const scores = s.players.map(p => p.score);
  // Ties on RAW SCORE are still counted (that is what `tiedOnScore` reports and
  // it is why the tiebreak matters), but the WINNER is the engine's call since
  // 3 August: cupcakes break a score tie, then cards claimed. Comparing raw
  // scores here would credit a seat with a share of a win it actually lost.
  const engineWinners = getWinningPlayers(s).map(p => p.id);
  const claims = s.players.map(p => p.claimedCards.length);
  const top = Math.max(...scores);
  const tiedOnScore = scores.filter(v => v === top).length > 1;
  return { scores, claims, winners: engineWinners, tiedOnScore, turns: s.stats.turnsPlayed };
}

const GAMES = parseInt(process.argv[2]) || 3000;
const mean = a => a.reduce((x,y)=>x+y,0)/a.length;
// Wilson-free rough 95% band for a proportion, good enough to say "inside noise".
const se = (p, n) => 1.96 * Math.sqrt(p * (1 - p) / n) * 100;

console.log(`\nSeat-position analysis - identical strategy in every seat (${GAMES} games/config)\n`);
for (const pc of [2, 3, 4]) {
  const all = [];
  for (let g = 0; g < GAMES; g++) all.push(runGame(pc));
  const expected = 100 / pc;
  // Outright wins only; ties split credit so the column sums to 100.
  const wins = new Array(pc).fill(0), scoreBy = Array.from({length:pc},()=>[]), claimBy = Array.from({length:pc},()=>[]);
  let tied = 0;
  for (const g of all) {
    if (g.tiedOnScore) tied++;
    for (const w of g.winners) wins[w] += 1 / g.winners.length;
    for (let i = 0; i < pc; i++) { scoreBy[i].push(g.scores[i]); claimBy[i].push(g.claims[i]); }
  }
  console.log(`================ ${pc} PLAYERS (expected win share ${expected.toFixed(1)}%) ================`);
  console.log(`${'seat'.padEnd(8)} ${'win share'.padStart(11)} ${'vs expected'.padStart(12)} ${'mean score'.padStart(11)} ${'mean claims'.padStart(12)}`);
  for (let i = 0; i < pc; i++) {
    const w = 100 * wins[i] / GAMES;
    console.log(`${('P' + (i+1) + (i===0?' (1st)':'')).padEnd(8)} ${w.toFixed(1).padStart(10)}% ${(w-expected >= 0 ? '+' : '') + (w-expected).toFixed(1).padStart(11)} ${mean(scoreBy[i]).toFixed(2).padStart(11)} ${mean(claimBy[i]).toFixed(2).padStart(12)}`);
  }
  console.log(`95% noise band on win share: +/-${se(1/pc, GAMES).toFixed(1)} pts`);
  console.log(`Games ending in a TIE on score: ${tied} (${(100*tied/GAMES).toFixed(1)}%)\n`);
}
