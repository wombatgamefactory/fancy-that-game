// How thin is the market in the last lap? Measured on the 6 August engine, where
// an empty bag is a no-op rather than an ending, so play continues over a market
// that only thins from the final pot onward.
import { createGame, sweep, takeBonusTile, declineBonusTile, takeExtraTile, place, claim, skipClaim, skipSpend, moveTile, removePlate, reserveCard, refill, calculateFinalScores } from './src/engine/game.js';
import { createStatsCollector } from './src/engine/statsCollector.js';
import * as basicBot from './src/bots/basicBot.js';
const GAMES = Number(process.argv[2] || 500);
for (const pc of [2, 3, 4]) {
  const marketByTurnFromEnd = new Map();   // turns-from-end -> [sum, n]
  let sweepSizeLate = 0, sweepsLate = 0, refreshes = 0, starvedTurns = 0, allTurns = 0;
  for (let g = 0; g < GAMES; g++) {
    const strategy = basicBot;
    let gs = createGame(Array.from({length: pc}, (_, i) => ({name: `P${i+1}`})), createStatsCollector());
    const trace = [];   // market count at each turn start
    let steps = 0;
    while (!gs.gameOver && steps < 6000) {
      if (gs.gamePhase === 'sweep') {
        if (gs.bonusTileAvailable) { const b = strategy.decideBonusTile(gs); gs = (b != null && gs.market[b]) ? takeBonusTile(gs, b) : declineBonusTile(gs); }
        else {
          const avail = gs.market.filter(t => t).length;
          trace.push(avail);
          const d = strategy.decideSweep(gs);
          if (d) { const before = gs.pendingSweepTiles.length; gs = sweep(gs, d.rowOrCol, d.isRow, d.declaration, d.declarationType); }
          else gs.gamePhase = 'place';
        }
      }
      else if (gs.gamePhase === 'place') { const e = strategy.decideExtraTile(gs); if (e != null) gs = takeExtraTile(gs, e); gs = place(gs, strategy.decidePlacements(gs)); }
      else if (gs.gamePhase === 'spend') { const m = strategy.decideMove(gs); if (m) gs = moveTile(gs, m.fromIndex, m.toIndex); const rp = strategy.decideRemovePlate(gs); if (rp != null) gs = removePlate(gs, rp); const rc = strategy.decideReserve(gs); if (rc != null) gs = reserveCard(gs, rc); gs = skipSpend(gs); }
      else if (gs.gamePhase === 'claim') { const c = strategy.decideClaim(gs); if (c) { try { gs = claim(gs, c.cardId, c.removedBoardIndex, c.destination); } catch (e) { gs = skipClaim(gs); } } else gs = skipClaim(gs); }
      else if (gs.gamePhase === 'refill') gs = refill(gs);
      steps++;
    }
    refreshes += gs.stats.marketRefills || 0;
    for (let i = 0; i < trace.length; i++) {
      const fromEnd = trace.length - 1 - i;
      if (fromEnd < 12) {
        const e = marketByTurnFromEnd.get(fromEnd) || [0, 0];
        e[0] += trace[i]; e[1]++;
        marketByTurnFromEnd.set(fromEnd, e);
      }
      allTurns++;
      if (trace[i] < 8) starvedTurns++;
    }
  }
  console.log(`--- ${pc} PLAYERS, ${GAMES} games ---`);
  const cells = [];
  for (let k = 11; k >= 0; k--) {
    const e = marketByTurnFromEnd.get(k);
    cells.push(e ? (e[0] / e[1]).toFixed(1).padStart(5) : '    -');
  }
  console.log(`  tiles on the 25-cell market, by turns before the end (11 ... 0):`);
  console.log(`  ${cells.join(' ')}`);
  console.log(`  turns played on a market under 8 tiles: ${(100 * starvedTurns / allTurns).toFixed(1)}%\n`);
}
