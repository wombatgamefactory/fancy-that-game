// DIAGNOSTIC (3 August): is "spend 2 cupcakes, move one empty plate" a rule the
// bot should ever buy, and how often is the situation it is FOR actually on the
// table?
//
// WHY IT EXISTS. simulate.js reported `move plate=0` over 200 games - the rule
// was never once exercised. Three separate things caused that, and this probe
// separates them so the fix can be checked against a measured baseline rather
// than a hunch:
//
//   1. getPatternWindows discarded any window with a plate in it, so the bot
//      could not SEE a plate-blocked card (fixed: allowBlocked).
//   2. decideMove only ever sourced coloured tiles, so a plate was never a
//      candidate to move.
//   3. decideMove only fired when the move COMPLETED a card that same turn. A
//      plate move never can - the spend step is after the place step, so
//      clearing a cell leaves it empty until next turn. Under a same-turn test
//      a plate move scores zero by construction.
//
// WHAT TO READ. "plate is the only thing missing" is the case the rule is
// written for: move the plate, and the window needs just that one cell filled.
// If that line is a fraction of a percent the rule is decoration; if it is
// several percent of spend steps it is a real decision and the bot must play it.
import { createGame, sweep, takeBonusTile, declineBonusTile, place, claim, skipClaim, skipSpend, moveTile, removePlate, reserveCard, takeExtraTile, refill, calculateFinalScores, getPatternWindows, getValidPlacements, REMOVE_PLATE_CUPCAKE_COST } from './src/engine/game.js';
import * as bot from './src/bots/basicBot.js';

function runGame(pc, t) {
  let s = createGame(Array.from({ length: pc }, (_, i) => ({ id: i, name: 'P' + i, type: 'ai' })));
  let steps = 0;
  while (!s.gameOver && steps < 1000) {
    switch (s.gamePhase) {
      case 'sweep': {
        if (s.bonusTileAvailable) {
          const b = bot.decideBonusTile(s);
          s = (b !== null && b !== undefined && s.market[b]) ? takeBonusTile(s, b) : declineBonusTile(s);
          break;
        }
        const d = bot.decideSweep(s);
        if (d) s = sweep(s, d.rowOrCol, d.isRow, d.declaration, d.declarationType); else s.gamePhase = 'place';
        break;
      }
      case 'place': {
        const x = bot.decideExtraTile(s);
        if (x !== null && x !== undefined) s = takeExtraTile(s, x);
        s = place(s, bot.decidePlacements(s));
        break;
      }
      case 'spend': {
        const p = s.players[s.currentPlayerIndex];
        t.spendSteps++;
        if (p.cupcakes >= 1) t.afford1++;
        if (p.cupcakes >= REMOVE_PLATE_CUPCAKE_COST) t.afford3++;

        // The best plate-blocked window across every card we could claim.
        // "gap" = how many cells still need a tile once the plate is gone.
        let best = null;
        for (const card of [...s.cardMarket, ...p.reservedCards]) {
          for (const win of getPatternWindows(p.board, card.pattern, { allowBlocked: true })) {
            if (win.blocked.length !== 1) continue; // one removal per turn
            const gap = win.missing.length + 1; // the freed cell needs a tile too
            if (!best || gap < best.gap) best = { gap };
          }
        }
        if (best) {
          t.blocked++;
          if (best.gap <= 1) t.gap1++;
          if (best.gap <= 2) t.gap2++;
          // Affordability is the whole test now: a removal needs no empty cell to
          // put the plate in, because there is no plate left to put anywhere.
          if (p.cupcakes >= REMOVE_PLATE_CUPCAKE_COST) t.actionable++;
        }

        const m = bot.decideMove(s);
        if (m) {
          const wasPlate = p.board[m.fromIndex] && p.board[m.fromIndex].type === 'blocked';
          if (wasPlate) t.firedPlate++; else t.firedTile++;
          s = moveTile(s, m.fromIndex, m.toIndex);
        }
        const rc = bot.decideReserve(s);
        if (rc !== null && rc !== undefined) s = reserveCard(s, rc);
        s = skipSpend(s);
        break;
      }
      case 'claim': {
        const d = bot.decideClaim(s);
        s = (d && d.cardId) ? claim(s, d.cardId, d.removedBoardIndex, d.destination) : skipClaim(s);
        break;
      }
      case 'refill': s = refill(s); break;
    }
    steps++;
  }
  if (s.gameOver) calculateFinalScores(s);
}

const GAMES = parseInt(process.argv[2]) || 100;
console.log(`\nPlate-removal opportunity probe (${GAMES} games per count)\n`);
for (const pc of [2, 4]) {
  const t = { spendSteps: 0, afford1: 0, afford3: 0, blocked: 0, gap1: 0, gap2: 0, actionable: 0, firedTile: 0, firedPlate: 0 };
  for (let g = 0; g < GAMES; g++) runGame(pc, t);
  const pct = n => (100 * n / t.spendSteps).toFixed(1) + '%';
  console.log(`${pc}p  (${t.spendSteps} spend steps)`);
  console.log(`   can afford a tile move (1):            ${t.afford1} (${pct(t.afford1)})`);
  console.log(`   can afford a plate removal (${REMOVE_PLATE_CUPCAKE_COST}):       ${t.afford3} (${pct(t.afford3)})`);
  console.log(`   a card window blocked by exactly 1 plate: ${t.blocked} (${pct(t.blocked)})`);
  console.log(`      ...plate is the ONLY thing missing:   ${t.gap1} (${pct(t.gap1)})`);
  console.log(`      ...plate + 1 cell to fill:            ${t.gap2} (${pct(t.gap2)})`);
  console.log(`      ...and affordable right now:          ${t.actionable} (${pct(t.actionable)})`);
  console.log(`   fired:  move tile=${t.firedTile} (${pct(t.firedTile)})  remove plate=${t.firedPlate} (${pct(t.firedPlate)})\n`);
}
