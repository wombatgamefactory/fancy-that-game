// THREE CANDIDATE END-GAME BOARD LANES, measured side by side on the same games.
//
//   BLOB      1 VP per tile in your largest connected same-colour group. COUNT.
//   COUNT     one ingredient revealed at setup; 1 VP per tile of it on your
//             board. COUNT.
//   MAJORITY  one ingredient revealed at setup; a flat prize to whoever has the
//             MOST of it on their board at the end. RANK - the only one of the
//             three that changes the payment family as well as the feeder.
//
// All three are functions of the FINAL BOARD STATE, so all three are scored
// post-hoc on the same shipped-engine games. Like for like, no engine change.
//
// THE MAJORITY VARIANTS MEASURED:
//   maj5      5 VP to the leader, ties all paid in full
//   maj8      8 VP to the leader, ties all paid in full
//   maj8/4    8 to the leader, 4 to second - the standard Euro softener for the
//             "I collected citrus tiles all game and got nothing" complaint
//   Tie frequency is reported because it decides whether a tiebreak rule is
//   needed at all.
//
// UNSTEERED, like the two-lane probe: doses are a floor, and the rank column
// shows what each lane does before anybody plays for it.
import { createGame, sweep, takeBonusTile, declineBonusTile, takeExtraTile, place, claim, skipClaim, skipSpend, moveTile, removePlate, reserveCard, refill, calculateFinalScores } from './src/engine/game.js';
import { INGREDIENTS } from './src/engine/tiles.js';
import { createStatsCollector } from './src/engine/statsCollector.js';
import * as basicBot from './src/bots/basicBot.js';

const GAMES = Number(process.argv[2] || 800);
const SIDE = 5;

function largestBlob(board) {
  const seen = new Array(board.length).fill(false);
  let best = 0;
  const isTile = (c) => c && c.type !== 'blocked' && c.colour;
  for (let i = 0; i < board.length; i++) {
    if (seen[i] || !isTile(board[i])) continue;
    const colour = board[i].colour;
    let size = 0; const stack = [i]; seen[i] = true;
    while (stack.length) {
      const idx = stack.pop(); size++;
      const r = Math.floor(idx / SIDE), c = idx % SIDE;
      const nbrs = [];
      if (r > 0) nbrs.push(idx - SIDE);
      if (r < SIDE - 1) nbrs.push(idx + SIDE);
      if (c > 0) nbrs.push(idx - 1);
      if (c < SIDE - 1) nbrs.push(idx + 1);
      for (const n of nbrs) if (!seen[n] && isTile(board[n]) && board[n].colour === colour) { seen[n] = true; stack.push(n); }
    }
    if (size > best) best = size;
  }
  return best;
}

function featureCount(board, ingredient) {
  let n = 0;
  for (const c of board) if (c && c.type !== 'blocked' && c.ingredient === ingredient) n++;
  return n;
}

function runGame(playerCount) {
  const strategy = basicBot;
  let gs = createGame(Array.from({ length: playerCount }, (_, i) => ({ name: `P${i + 1}` })), createStatsCollector());
  let steps = 0;
  while (!gs.gameOver && steps < 6000) {
    if (gs.gamePhase === 'sweep') {
      if (gs.bonusTileAvailable) { const b = strategy.decideBonusTile(gs); gs = (b != null && gs.market[b]) ? takeBonusTile(gs, b) : declineBonusTile(gs); }
      else { const d = strategy.decideSweep(gs); if (d) gs = sweep(gs, d.rowOrCol, d.isRow, d.declaration, d.declarationType); else gs.gamePhase = 'place'; }
    }
    else if (gs.gamePhase === 'place') { const e = strategy.decideExtraTile(gs); if (e != null) gs = takeExtraTile(gs, e); gs = place(gs, strategy.decidePlacements(gs)); }
    else if (gs.gamePhase === 'spend') { const m = strategy.decideMove(gs); if (m) gs = moveTile(gs, m.fromIndex, m.toIndex); const rp = strategy.decideRemovePlate(gs); if (rp != null) gs = removePlate(gs, rp); const rc = strategy.decideReserve(gs); if (rc != null) gs = reserveCard(gs, rc); gs = skipSpend(gs); }
    else if (gs.gamePhase === 'claim') { const c = strategy.decideClaim(gs); if (c) { try { gs = claim(gs, c.cardId, c.removedBoardIndex, c.destination); } catch (e) { gs = skipClaim(gs); } } else gs = skipClaim(gs); }
    else if (gs.gamePhase === 'refill') gs = refill(gs);
    steps++;
  }
  calculateFinalScores(gs);
  return gs;
}

for (const pc of [2, 3, 4]) {
  const rank = Array.from({ length: pc }, () => ({ base: 0, blob: 0, cnt: 0, maj5: 0, maj84: 0, wins: 0, n: 0 }));
  let ties = 0, gapBase = 0, gapBlob = 0, gapCnt = 0, gapMaj5 = 0, gapMaj8 = 0, gapMaj84 = 0, gapCombo = 0;
  let flipBlob = 0, flipCnt = 0, flipMaj5 = 0, flipMaj8 = 0, flipMaj84 = 0, flipCombo = 0;
  let leadMargin = 0, dose5 = 0, dose8 = 0, dose84 = 0;

  for (let g = 0; g < GAMES; g++) {
    const gs = runGame(pc);
    const feature = INGREDIENTS[Math.floor(Math.random() * INGREDIENTS.length)];
    const counts = gs.players.map(p => featureCount(p.board, feature));
    const blobs = gs.players.map(p => largestBlob(p.board));
    const top = Math.max(...counts);
    const winners = counts.map((c, i) => c === top ? i : -1).filter(i => i >= 0);
    if (winners.length > 1) ties++;
    const sortedCounts = [...counts].sort((a, b) => b - a);
    leadMargin += sortedCounts[0] - (sortedCounts[1] ?? 0);
    const second = sortedCounts.find(c => c < top);
    const secondSet = second === undefined ? [] : counts.map((c, i) => c === second ? i : -1).filter(i => i >= 0);

    const maj = (first, run) => gs.players.map((p, i) =>
      (winners.includes(i) ? first : 0) + (run && secondSet.includes(i) ? run : 0));
    const m5 = maj(5, 0), m8 = maj(8, 0), m84 = maj(8, 4);
    dose5 += m5.reduce((a, b) => a + b, 0) / pc;
    dose8 += m8.reduce((a, b) => a + b, 0) / pc;
    dose84 += m84.reduce((a, b) => a + b, 0) / pc;

    // THE COMBINATION: 1 VP per tile of the featured ingredient on your board,
    // PLUS 5 to whoever has the most. Majority-with-participation, the standard
    // shape - one sentence, two clauses, and nobody scores nothing.
    const combo = counts.map((c, i) => c + m5[i]);
    const rows = gs.players.map((p, i) => ({
      i, base: p.score, blobOnly: blobs[i], cntOnly: counts[i], m5: m5[i], m8: m8[i], m84: m84[i],
      combo: combo[i],
    }));
    const byBase = [...rows].sort((a, b) => b.base - a.base);
    byBase.forEach((r, k) => {
      rank[k].base += r.base; rank[k].blob += r.blobOnly; rank[k].cnt += r.cntOnly;
      rank[k].maj5 += r.m5; rank[k].maj84 += r.m84; rank[k].combo = (rank[k].combo||0) + r.combo; rank[k].n++;
      if (winners.includes(r.i)) rank[k].wins++;
    });

    const spread = (key) => {
      const tot = rows.map(r => r.base + (key ? r[key] : 0));
      return Math.max(...tot) - Math.min(...tot);
    };
    gapBase += spread(null); gapBlob += spread('blobOnly'); gapCnt += spread('cntOnly');
    gapMaj5 += spread('m5'); gapMaj8 += spread('m8'); gapMaj84 += spread('m84'); gapCombo += spread('combo');

    const flips = (key) => {
      const best = [...rows].sort((a, b) => (b.base + b[key]) - (a.base + a[key]))[0];
      return best.i !== byBase[0].i;
    };
    if (flips('blobOnly')) flipBlob++;
    if (flips('cntOnly')) flipCnt++;
    if (flips('m5')) flipMaj5++;
    if (flips('m8')) flipMaj8++;
    if (flips('m84')) flipMaj84++;
    if (flips('combo')) flipCombo++;
  }

  const n = GAMES;
  console.log(`===== ${pc} PLAYERS, ${n} games =====`);
  console.log(`  featured-ingredient lead margin (top minus second): ${(leadMargin / n).toFixed(2)} tiles`);
  console.log(`  TIES for the majority: ${(100 * ties / n).toFixed(1)}% of games\n`);
  console.log(`  dose VP/player     blob ${(rank.reduce((s,r)=>s+r.blob,0)/rank.reduce((s,r)=>s+r.n,0)).toFixed(2)}   count ${(rank.reduce((s,r)=>s+r.cnt,0)/rank.reduce((s,r)=>s+r.n,0)).toFixed(2)}   maj@5 ${(dose5/n).toFixed(2)}   maj@8 ${(dose8/n).toFixed(2)}   maj@8/4 ${(dose84/n).toFixed(2)}   COMBO(count+maj5) ${(rank.reduce((s,r)=>s+(r.combo||0),0)/rank.reduce((s,r)=>s+r.n,0)).toFixed(2)}`);
  console.log(`  winner-minus-last  base ${(gapBase/n).toFixed(1)}   +blob ${(gapBlob/n).toFixed(1)}   +count ${(gapCnt/n).toFixed(1)}   +maj5 ${(gapMaj5/n).toFixed(1)}   +maj8 ${(gapMaj8/n).toFixed(1)}   +maj8/4 ${(gapMaj84/n).toFixed(1)}   +COMBO ${(gapCombo/n).toFixed(1)}`);
  console.log(`  changes the winner  blob ${(100*flipBlob/n).toFixed(1)}%   count ${(100*flipCnt/n).toFixed(1)}%   maj5 ${(100*flipMaj5/n).toFixed(1)}%   maj8 ${(100*flipMaj8/n).toFixed(1)}%   maj8/4 ${(100*flipMaj84/n).toFixed(1)}%   COMBO ${(100*flipCombo/n).toFixed(1)}%`);
  console.log(`  WHO WINS THE MAJORITY, by finishing rank:`);
  rank.forEach((r, k) => {
    const label = k === 0 ? 'winner' : k === pc - 1 ? 'last  ' : `#${k + 1}    `;
    console.log(`    ${label}  takes the majority ${(100 * r.wins / r.n).toFixed(1).padStart(5)}% of games  (even share ${(100 / pc).toFixed(1)}%)   blob ${(r.blob/r.n).toFixed(2)}  count ${(r.cnt/r.n).toFixed(2)}  maj@8/4 ${(r.maj84/r.n).toFixed(2)}  COMBO ${((r.combo||0)/r.n).toFixed(2)}`);
  });
  console.log('');
}
