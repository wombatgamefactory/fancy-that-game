// WHO GETS THE MULTI-CLAIM TURNS? (9 August 2026)
//
// The A/B shows unlimited claims widening the winner-to-last gap. This asks the
// question that decides whether that is a runaway problem or just score inflation:
// does the chain turn go to the player who is ALREADY AHEAD?
//
// Run with the variant LIVE (free, the most permissive version - if the effect is
// not there at cost 0 it is not there at any price), and attribute every claim
// turn to the player's eventual finishing rank. Also records the player's VP
// standing AT THE MOMENT of the chain turn, because "the winner had more chain
// turns" could just mean chain turns cause winning; "the player who was already
// leading got the chain" is the runaway shape.
//
//   node probe-extraclaims-who-2026-08-09.js [games] [counts]
import { createGame, sweep, takeBonusTile, declineBonusTile, takeExtraTile, dealCards,
  place, claim, skipClaim, skipSpend, moveTile, removePlate, reserveCard, refill,
  calculateFinalScores, setExtraClaimCupcakeCost, EXTRA_CLAIM_CUPCAKE_COST } from './src/engine/game.js';
import { createStatsCollector } from './src/engine/statsCollector.js';
import * as bot from './src/bots/basicBot.js';

const GAMES = parseInt(process.argv[2] || '1500', 10);
const COUNTS = (process.argv[3] || '2,3,4').split(',').map(Number);

// Running VP standing is not maintained mid-game (scores are calculated at the
// end), so the leader proxy is CARDS CLAIMED SO FAR, which is what the score is
// mostly made of and what a player at the table can see.
function runGame(playerCount, acc) {
  const sc = createStatsCollector();
  const cfg = Array.from({ length: playerCount }, (_, i) => ({ id: i, name: `P${i}`, type: 'ai' }));
  let s = createGame(cfg, sc);
  let steps = 0, claimsThisTurn = 0;
  const chainTurns = new Array(playerCount).fill(0);
  const chainWhileLeading = new Array(playerCount).fill(0);
  const chainWhileTrailing = new Array(playerCount).fill(0);
  let turnPlayer = 0, leadingAtTurnStart = false, trailingAtTurnStart = false;

  while (!s.gameOver && steps < 3000) {
    switch (s.gamePhase) {
      case 'sweep': {
        // Standing is read at the top of the turn, before anything this turn
        // changes it - "was this player ahead when the turn began".
        if (claimsThisTurn === 0) {
          turnPlayer = s.currentPlayerIndex;
          const counts = s.players.map(p => p.claimedCards.length);
          const hi = Math.max(...counts), lo = Math.min(...counts);
          leadingAtTurnStart = hi !== lo && counts[turnPlayer] === hi;
          trailingAtTurnStart = hi !== lo && counts[turnPlayer] === lo;
        }
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
        if (d && d.cardId) { s = claim(s, d.cardId, d.removedBoardIndex, d.destination); claimsThisTurn++; }
        else s = skipClaim(s);
        break;
      }
      case 'refill': {
        if (claimsThisTurn >= 2) {
          chainTurns[turnPlayer]++;
          if (leadingAtTurnStart) chainWhileLeading[turnPlayer]++;
          if (trailingAtTurnStart) chainWhileTrailing[turnPlayer]++;
        }
        claimsThisTurn = 0;
        s = refill(s);
        break;
      }
    }
    steps++;
  }
  if (s.gameOver) calculateFinalScores(s);

  // Rank by final score, 0 = winner. Ties share the better rank, which slightly
  // flatters the tied players and is the conservative direction for this test.
  const order = s.players.map((p, i) => ({ i, score: p.score ?? 0 }))
    .sort((a, b) => b.score - a.score);
  order.forEach((entry, rank) => {
    acc.byRank[rank] = (acc.byRank[rank] || 0) + chainTurns[entry.i];
    acc.scoreByRank[rank] = (acc.scoreByRank[rank] || 0) + entry.score;
  });
  acc.leading += chainWhileLeading.reduce((a, v) => a + v, 0);
  acc.trailing += chainWhileTrailing.reduce((a, v) => a + v, 0);
  acc.total += chainTurns.reduce((a, v) => a + v, 0);
  acc.games++;
}

console.log(`\nWHO GETS THE CHAIN TURNS - variant LIVE at cost 0, ${GAMES} games per count\n`);
for (const pc of COUNTS) {
  setExtraClaimCupcakeCost(0);
  const acc = { byRank: [], scoreByRank: [], leading: 0, trailing: 0, total: 0, games: 0 };
  for (let g = 0; g < GAMES; g++) runGame(pc, acc);
  setExtraClaimCupcakeCost(EXTRA_CLAIM_CUPCAKE_COST);

  console.log(`===== ${pc} PLAYERS =====`);
  console.log(`  chain turns per game: ${(acc.total / acc.games).toFixed(2)} across the table (${(acc.total / acc.games / pc).toFixed(2)} per player)`);
  const rows = acc.byRank.map((v, r) =>
    `rank ${r + 1}: ${(v / acc.games).toFixed(2)}/game (mean score ${(acc.scoreByRank[r] / acc.games).toFixed(1)})`);
  console.log(`  by finishing rank:   ${rows.join('   ')}`);
  const share = acc.byRank[0] / acc.total;
  console.log(`  winner's share of all chain turns: ${(100 * share).toFixed(1)}% (an even table would be ${(100 / pc).toFixed(1)}%)`);
  console.log(`  chain turns taken while ALREADY leading on cards: ${acc.leading} vs while trailing: ${acc.trailing}` +
    `  (ratio ${(acc.leading / Math.max(1, acc.trailing)).toFixed(2)}x)`);
  console.log('');
}
