// THE CRUMB TRAY AS A FAILURE STATE, not a lane. Dean's ruling, 6 August: every
// tile in the crumb tray represents a placement the player should have avoided.
//
// The tray is ALWAYS a legal destination (getLegalDestinations opens with it), so
// the question is not how often it scores - it is how often a player is CORNERED
// into it versus choosing it with a stand row open. A forced crumb is a mistake
// made several turns earlier, when the rows were opened and locked; a chosen crumb
// with a row available is either a deliberate trade or a plain error.
//
// Reports, per player count and by finishing rank: crumbs as a share of claims,
// and the forced/chosen split.
import { createGame, sweep, takeBonusTile, declineBonusTile, takeExtraTile, place, claim, skipClaim, skipSpend, moveTile, removePlate, reserveCard, refill, getLegalDestinations, calculateFinalScores } from './src/engine/game.js';
import { createStatsCollector } from './src/engine/statsCollector.js';
import * as basicBot from './src/bots/basicBot.js';
const GAMES = Number(process.argv[2] || 500);

for (const pc of [2, 3, 4]) {
  let claims = 0, crumbs = 0, forced = 0, chosen = 0;
  const byRank = Array.from({ length: pc }, () => ({ claims: 0, crumbs: 0, forced: 0 }));
  for (let g = 0; g < GAMES; g++) {
    const strategy = basicBot;
    let gs = createGame(Array.from({ length: pc }, (_, i) => ({ name: `P${i + 1}` })), createStatsCollector());
    const per = Array.from({ length: pc }, () => ({ claims: 0, crumbs: 0, forced: 0 }));
    let steps = 0;
    while (!gs.gameOver && steps < 6000) {
      if (gs.gamePhase === 'sweep') {
        if (gs.bonusTileAvailable) { const b = strategy.decideBonusTile(gs); gs = (b != null && gs.market[b]) ? takeBonusTile(gs, b) : declineBonusTile(gs); }
        else { const d = strategy.decideSweep(gs); if (d) gs = sweep(gs, d.rowOrCol, d.isRow, d.declaration, d.declarationType); else gs.gamePhase = 'place'; }
      }
      else if (gs.gamePhase === 'place') { const e = strategy.decideExtraTile(gs); if (e != null) gs = takeExtraTile(gs, e); gs = place(gs, strategy.decidePlacements(gs)); }
      else if (gs.gamePhase === 'spend') { const m = strategy.decideMove(gs); if (m) gs = moveTile(gs, m.fromIndex, m.toIndex); const rp = strategy.decideRemovePlate(gs); if (rp != null) gs = removePlate(gs, rp); const rc = strategy.decideReserve(gs); if (rc != null) gs = reserveCard(gs, rc); gs = skipSpend(gs); }
      else if (gs.gamePhase === 'claim') {
        const who = gs.currentPlayerIndex;
        const c = strategy.decideClaim(gs);
        if (c) {
          const p = gs.players[who];
          const tile = p.board[c.removedBoardIndex];
          const rowsOpen = tile ? getLegalDestinations(p, tile).some(d => d.type === 'row') : false;
          try {
            gs = claim(gs, c.cardId, c.removedBoardIndex, c.destination);
            per[who].claims++;
            if (c.destination.type === 'crumb') { per[who].crumbs++; if (!rowsOpen) per[who].forced++; }
          } catch (e) { gs = skipClaim(gs); }
        } else gs = skipClaim(gs);
      }
      else if (gs.gamePhase === 'refill') gs = refill(gs);
      steps++;
    }
    calculateFinalScores(gs);
    const order = gs.players.map((p, i) => ({ i, s: p.score })).sort((a, b) => b.s - a.s);
    order.forEach((e, rank) => { byRank[rank].claims += per[e.i].claims; byRank[rank].crumbs += per[e.i].crumbs; byRank[rank].forced += per[e.i].forced; });
    for (const p of per) { claims += p.claims; crumbs += p.crumbs; forced += p.forced; }
  }
  chosen = crumbs - forced;
  console.log(`--- ${pc} PLAYERS, ${GAMES} games ---`);
  console.log(`  crumbs as a share of claims: ${(100 * crumbs / claims).toFixed(2)}%   (${crumbs} of ${claims})`);
  console.log(`  of those crumbs: FORCED (no stand row legal) ${(100 * forced / (crumbs || 1)).toFixed(1)}%, chosen with a row open ${(100 * chosen / (crumbs || 1)).toFixed(1)}%`);
  byRank.forEach((r, rank) => {
    const label = rank === 0 ? 'winner' : rank === pc - 1 ? 'last  ' : `#${rank + 1}    `;
    console.log(`    ${label}  crumb rate ${(100 * r.crumbs / (r.claims || 1)).toFixed(2)}%  of which forced ${(100 * r.forced / (r.crumbs || 1)).toFixed(0)}%`);
  });
  console.log('');
}
