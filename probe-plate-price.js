// SENSITIVITY: at what price does clearing an empty plate become something the
// bot would actually buy?
//
// REPOINTED TO THE REMOVAL. Written for the 2-cupcake plate MOVE, which is
// deleted; the plate now leaves the game for REMOVE_PLATE_CUPCAKE_COST (3). The
// arithmetic it dumps is unchanged, because the two actions free exactly the same
// cell and leave that cell needing exactly the same tile - all that moved is the
// price. That makes this the direct read on whether 3 is payable.
//
// probe-plate-move.js shows the SITUATION the rule is written for arriving on
// most spend steps, and the bot buying it on none of them. This probe asks why,
// by dumping the decision arithmetic rather than the outcome.
//
// THE STANDING VERDICT, WHICH THE REPRICING MAKES WORSE, NOT BETTER. The bot
// prices a cupcake at RESERVE_CUPCAKE_VALUE (2 VP - the value of the extra tile
// it could buy instead), so a plate at 3 has to clear a 6 VP hurdle. The best
// card in the deck is 5 VP, a claim is worth vp + CLAIM_EXTRA = 7, and a window
// one tile short completes about 55% of the time (RESERVE_COMPLETION_ODDS), so
// the very best single-card case is worth 7 x 0.55 = 3.85 - under even the OLD
// 4 VP hurdle, and barely half the new one. The action is arithmetically
// dominated, not merely unattractive, and raising the price deepened that.
//
// This prints the distribution of the value the bot computes, so the gap can be
// read directly: how far under the hurdle the opportunities sit, and what
// fraction would be bought at each candidate price.
import { createGame, sweep, takeBonusTile, declineBonusTile, place, claim, skipClaim, skipSpend, moveTile, removePlate, takeExtraTile, refill, calculateFinalScores, getPatternWindows, getValidPlacements, REMOVE_PLATE_CUPCAKE_COST } from './src/engine/game.js';
import * as bot from './src/bots/basicBot.js';

// Mirror of the odds table and weights inside basicBot.decideRemovePlate. Duplicated
// deliberately: this probe must be able to disagree with the bot.
const ODDS = [1, 0.55, 0.33, 0.20, 0.04, 0.0];
const CLAIM_EXTRA = 2;
const CUPCAKE_VALUE = 2;
const odds = m => (Number.isFinite(m) ? ODDS[Math.min(m, ODDS.length - 1)] : 0);

function bestOpenGap(board, pattern) {
  let best = Infinity;
  for (const w of getPatternWindows(board, pattern)) if (w.missing.length < best) best = w.missing.length;
  return best;
}

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
        const cards = [...s.cardMarket];
        if (p.cupcakes >= REMOVE_PLATE_CUPCAKE_COST) {
          // Best GROSS value available from clearing one plate, ignoring price.
          let bestGross = 0;
          for (const card of cards) {
            const before = bestOpenGap(p.board, card.pattern);
            const weight = (card.vp || 0) + CLAIM_EXTRA;
            for (const win of getPatternWindows(p.board, card.pattern, { allowBlocked: true })) {
              if (win.blocked.length !== 1) continue;
              const after = win.missing.length + 1; // freed cell still needs a tile
              if (!(after < before)) continue;
              const gross = weight * (odds(after) - odds(before));
              if (gross > bestGross) bestGross = gross;
            }
          }
          if (bestGross > 0) {
            t.opportunities++;
            t.grossSum += bestGross;
            if (bestGross > t.grossMax) t.grossMax = bestGross;
            for (const price of [1, 2, 3, 4]) {
              if (bestGross > price * CUPCAKE_VALUE) t.buysAt[price]++;
            }
            // How far short of the live 3-cupcake hurdle?
            const shortfall = REMOVE_PLATE_CUPCAKE_COST * CUPCAKE_VALUE - bestGross;
            if (shortfall > 0) { t.shortSum += shortfall; t.shortN++; }
          }
        }

        const m = bot.decideMove(s);
        if (m) s = moveTile(s, m.fromIndex, m.toIndex);
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
console.log(`\nPlate-removal PRICE sensitivity (${GAMES} games per count)`);
console.log(`a cupcake is priced at ${CUPCAKE_VALUE} VP; live plate price is ${REMOVE_PLATE_CUPCAKE_COST}\n`);
for (const pc of [2, 4]) {
  const t = { opportunities: 0, grossSum: 0, grossMax: 0, shortSum: 0, shortN: 0, buysAt: { 1: 0, 2: 0, 3: 0, 4: 0 } };
  for (let g = 0; g < GAMES; g++) runGame(pc, t);
  console.log(`${pc}p  (${t.opportunities} affordable plate-clearing opportunities)`);
  console.log(`   mean gross value of the best one: ${(t.grossSum / (t.opportunities || 1)).toFixed(2)} VP   (best seen: ${t.grossMax.toFixed(2)})`);
  console.log(`   mean shortfall vs the ${REMOVE_PLATE_CUPCAKE_COST}-cupcake hurdle (${REMOVE_PLATE_CUPCAKE_COST * CUPCAKE_VALUE} VP): ${(t.shortSum / (t.shortN || 1)).toFixed(2)} VP`);
  for (const price of [1, 2, 3, 4]) {
    const live = price === REMOVE_PLATE_CUPCAKE_COST ? '  <-- LIVE PRICE' : '';
    console.log(`   worth buying at ${price} cupcake${price > 1 ? 's' : ''} (hurdle ${price * CUPCAKE_VALUE} VP): ${t.buysAt[price]} (${(100 * t.buysAt[price] / (t.opportunities || 1)).toFixed(1)}% of opportunities)${live}`);
  }
  console.log('');
}
