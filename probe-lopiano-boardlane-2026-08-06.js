// TWO CANDIDATE END-GAME BOARD LANES, measured side by side.
//
// Both are scoring functions of the FINAL BOARD STATE only, so both can be
// measured without touching the engine: play the shipped game, then score the
// boards two extra ways and see what each would have paid.
//
//   BLOB   - 1 VP per tile in your largest CONNECTED SAME-COLOUR group.
//            Orthogonal adjacency. Empty plates and empty cells break the group,
//            which matters: a claim fragments your own display.
//   FEATURE- one ingredient is revealed at setup (drawn per game, uniformly from
//            the five). 1 VP per tile of THAT ingredient on your player board at
//            the end. Dean's proposal, 6 August: colours are for cards,
//            ingredients are for end-game scoring.
//
// WHAT THIS CAN AND CANNOT TELL YOU. It measures the UNSTEERED dose and the
// unsteered distribution by finishing rank - what each lane pays when nobody is
// playing for it. Steering raises the dose for everybody, and a stronger player
// steers better, so:
//   - the doses below are a FLOOR;
//   - the catch-up readings below FLATTER both lanes, because the leader would
//     out-steer the trailing player on either.
// Treat the rank column as "does this lane at least not make the spread worse",
// not as proof it closes it.
import { createGame, sweep, takeBonusTile, declineBonusTile, takeExtraTile, place, claim, skipClaim, skipSpend, moveTile, removePlate, reserveCard, refill, calculateFinalScores } from './src/engine/game.js';
import { INGREDIENTS } from './src/engine/tiles.js';
import { createStatsCollector } from './src/engine/statsCollector.js';
import * as basicBot from './src/bots/basicBot.js';

const GAMES = Number(process.argv[2] || 800);
const SIDE = 5;

// Largest connected same-colour group of TILES. Plates and empty cells are walls.
function largestBlob(board) {
  const seen = new Array(board.length).fill(false);
  let best = 0;
  const isTile = (c) => c && c.type !== 'blocked' && c.colour;
  for (let i = 0; i < board.length; i++) {
    if (seen[i] || !isTile(board[i])) continue;
    const colour = board[i].colour;
    let size = 0;
    const stack = [i];
    seen[i] = true;
    while (stack.length) {
      const idx = stack.pop();
      size++;
      const r = Math.floor(idx / SIDE), c = idx % SIDE;
      const nbrs = [];
      if (r > 0) nbrs.push(idx - SIDE);
      if (r < SIDE - 1) nbrs.push(idx + SIDE);
      if (c > 0) nbrs.push(idx - 1);
      if (c < SIDE - 1) nbrs.push(idx + 1);
      for (const n of nbrs) {
        if (!seen[n] && isTile(board[n]) && board[n].colour === colour) { seen[n] = true; stack.push(n); }
      }
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

console.log(`TWO CANDIDATE BOARD LANES - ${GAMES} games per player count, basicBot, UNSTEERED\n`);

for (const pc of [2, 3, 4]) {
  const rank = Array.from({ length: pc }, () => ({ base: 0, blob: 0, feat: 0, n: 0 }));
  let lastPctBase = 0, lastPctBlob = 0, lastPctFeat = 0;
  let gapBase = 0, gapBlob = 0, gapFeat = 0;
  let flipBlob = 0, flipFeat = 0;
  let featSpread = 0, blobSpread = 0;

  for (let g = 0; g < GAMES; g++) {
    const gs = runGame(pc);
    // One featured ingredient per game, drawn uniformly - the setup reveal.
    const feature = INGREDIENTS[Math.floor(Math.random() * INGREDIENTS.length)];
    const rows = gs.players.map(p => ({
      base: p.score,
      blob: p.score + largestBlob(p.board),
      feat: p.score + featureCount(p.board, feature),
      blobOnly: largestBlob(p.board),
      featOnly: featureCount(p.board, feature),
    }));
    const byBase = [...rows].sort((a, b) => b.base - a.base);
    byBase.forEach((r, i) => { rank[i].base += r.base; rank[i].blob += r.blobOnly; rank[i].feat += r.featOnly; rank[i].n++; });

    const lo = (arr, key) => Math.min(...arr.map(r => r[key]));
    const hi = (arr, key) => Math.max(...arr.map(r => r[key]));
    lastPctBase += 100 * lo(rows, 'base') / (hi(rows, 'base') || 1);
    lastPctBlob += 100 * lo(rows, 'blob') / (hi(rows, 'blob') || 1);
    lastPctFeat += 100 * lo(rows, 'feat') / (hi(rows, 'feat') || 1);
    gapBase += hi(rows, 'base') - lo(rows, 'base');
    gapBlob += hi(rows, 'blob') - lo(rows, 'blob');
    gapFeat += hi(rows, 'feat') - lo(rows, 'feat');
    // Does the lane change who wins?
    const winnerBase = byBase[0];
    if ([...rows].sort((a, b) => b.blob - a.blob)[0] !== winnerBase) flipBlob++;
    if ([...rows].sort((a, b) => b.feat - a.feat)[0] !== winnerBase) flipFeat++;
    blobSpread += hi(rows, 'blobOnly') - lo(rows, 'blobOnly');
    featSpread += hi(rows, 'featOnly') - lo(rows, 'featOnly');
  }

  const n = GAMES;
  console.log(`--- ${pc} PLAYERS ---`);
  console.log(`                              BLOB (largest same-colour group)   FEATURED INGREDIENT`);
  const dBlob = rank.reduce((s, r) => s + r.blob, 0) / rank.reduce((s, r) => s + r.n, 0);
  const dFeat = rank.reduce((s, r) => s + r.feat, 0) / rank.reduce((s, r) => s + r.n, 0);
  const meanBase = rank.reduce((s, r) => s + r.base, 0) / rank.reduce((s, r) => s + r.n, 0);
  console.log(`  dose, VP/player              ${dBlob.toFixed(2).padStart(6)}                          ${dFeat.toFixed(2).padStart(6)}`);
  console.log(`  as % of the new total        ${(100 * dBlob / (meanBase + dBlob)).toFixed(1).padStart(6)}%                         ${(100 * dFeat / (meanBase + dFeat)).toFixed(1).padStart(6)}%`);
  console.log(`  in-game range (best-worst)   ${(blobSpread / n).toFixed(2).padStart(6)}                          ${(featSpread / n).toFixed(2).padStart(6)}`);
  console.log(`  changes the winner in        ${(100 * flipBlob / n).toFixed(1).padStart(6)}% of games                ${(100 * flipFeat / n).toFixed(1).padStart(6)}% of games`);
  console.log(`  by finishing rank (VP paid):`);
  rank.forEach((r, i) => {
    const label = i === 0 ? 'winner' : i === pc - 1 ? 'last  ' : `#${i + 1}    `;
    console.log(`    ${label}  base ${(r.base / r.n).toFixed(1).padStart(5)}   blob ${(r.blob / r.n).toFixed(2).padStart(5)}                    feature ${(r.feat / r.n).toFixed(2).padStart(5)}`);
  });
  console.log(`  last as % of winner:  base ${(lastPctBase / n).toFixed(1)}%   +blob ${(lastPctBlob / n).toFixed(1)}%   +feature ${(lastPctFeat / n).toFixed(1)}%`);
  console.log(`  winner-minus-last gap: base ${(gapBase / n).toFixed(1)}   +blob ${(gapBlob / n).toFixed(1)}   +feature ${(gapFeat / n).toFixed(1)}\n`);
}
