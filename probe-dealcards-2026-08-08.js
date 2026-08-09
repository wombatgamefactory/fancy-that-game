// PROBE: what is the paid 2-card deal actually worth, at the moment a player
// would buy it? (8 August, for the rule change that deleted the extra tile.)
//
// WHY IT EXISTS. basicBot's decideDealCards prices the spend as a lottery -
// p = the share of the 50-card deck the board already satisfies, pHit = the
// chance at least one of two dealt cards lands claimable - and clears it against
// RESERVE_CUPCAKE_VALUE (2 VP), the bar every other cupcake spend clears. On the
// first run after the change the bot bought it ZERO times in 20 games, which is
// either a bad threshold or a bad action, and the report cannot tell those apart.
//
// So this walks the same games and logs, at every spend step:
//   - was the row legally dealable at all (canDealCards)?
//   - was the player CARD-LOCKED (nothing on the row or in reserve claimable)?
//   - p, pHit and the implied VP value for the locked ones.
//
// It buys NOTHING - the arm it measures is the live engine, unchanged - so the
// distribution it prints is the one the threshold has to be set against.
import { createGame, sweep, takeBonusTile, declineBonusTile, place, claim, skipClaim, skipSpend, moveTile, removePlate, reserveCard, dealCards, refill, canDealCards, getPatternMatches, REWARD_CARDS, CARDS_PER_DEAL, MAX_MARKET_CARDS } from './src/engine/game.js';
import * as basicBot from './src/bots/basicBot.js';

const games = parseInt(process.argv[2]) || 300;
const playerCount = parseInt(process.argv[3]) || 3;
// Set to 1 to have the bot actually buy whenever it is locked and legal, which
// answers "what would it pay off if it always bought" rather than "would it".
const ALWAYS_BUY = process.argv[4] === 'buy';

const CLAIM_EXTRA = 2; // same banked-sacrifice constant basicBot uses

let spendSteps = 0;
let legal = 0;          // canDealCards true
let lockedAndLegal = 0; // ...and nothing claimable
let rowAtCap = 0;       // blocked purely by the row cap
let broke = 0;          // blocked purely by having no cupcake
const values = [];      // implied VP value at each locked+legal step
const pHits = [];
let boughtAndHit = 0;   // ALWAYS_BUY arm: a dealt card was claimable at once
let bought = 0;

function lockedFor(gameState, player) {
  const cards = [...gameState.cardMarket, ...player.reservedCards]
    .filter(c => c.id !== gameState.reservedCardIdThisTurn);
  for (const card of cards) {
    if (getPatternMatches(player.board, card.pattern).length > 0) return false;
  }
  return true;
}

function deckValue(board) {
  let matching = 0, vp = 0;
  for (const card of REWARD_CARDS) {
    if (getPatternMatches(board, card.pattern).length === 0) continue;
    matching++;
    vp += (card.vp || 0);
  }
  if (matching === 0) return { p: 0, pHit: 0, value: 0 };
  const p = matching / REWARD_CARDS.length;
  const pHit = 1 - Math.pow(1 - p, CARDS_PER_DEAL);
  return { p, pHit, value: pHit * (vp / matching + CLAIM_EXTRA) };
}

for (let g = 0; g < games; g++) {
  const configs = Array.from({ length: playerCount }, (_, i) => ({ name: `Bot ${i + 1}`, aiDifficulty: 'basic', isHuman: false }));
  let gs = createGame(configs, null);
  let steps = 0;
  while (!gs.gameOver && steps < 2000) {
    switch (gs.gamePhase) {
      case 'sweep': {
        if (gs.bonusTileAvailable) {
          const b = basicBot.decideBonusTile(gs);
          gs = (b !== null && b !== undefined && gs.market[b]) ? takeBonusTile(gs, b) : declineBonusTile(gs);
          break;
        }
        const d = basicBot.decideSweep(gs);
        if (d) gs = sweep(gs, d.rowOrCol, d.isRow, d.declaration, d.declarationType);
        else gs.gamePhase = 'place';
        break;
      }
      case 'place':
        gs = place(gs, basicBot.decidePlacements(gs));
        break;
      case 'spend': {
        const player = gs.players[gs.currentPlayerIndex];
        spendSteps++;
        const canDeal = canDealCards(gs);
        if (canDeal) legal++;
        else if (gs.cardMarket.length + CARDS_PER_DEAL > MAX_MARKET_CARDS) rowAtCap++;
        else if (player.cupcakes < 1) broke++;

        if (canDeal && lockedFor(gs, player)) {
          lockedAndLegal++;
          const { pHit, value } = deckValue(player.board);
          values.push(value);
          pHits.push(pHit);
          if (ALWAYS_BUY) {
            const before = gs.cardMarket.length;
            gs = dealCards(gs);
            bought++;
            let hit = false;
            for (let i = before; i < gs.cardMarket.length; i++) {
              if (getPatternMatches(player.board, gs.cardMarket[i].pattern).length > 0) { hit = true; break; }
            }
            if (hit) boughtAndHit++;
          }
        }

        const mv = basicBot.decideMove(gs);
        if (mv) gs = moveTile(gs, mv.fromIndex, mv.toIndex);
        const rp = basicBot.decideRemovePlate(gs);
        if (rp !== null && rp !== undefined) gs = removePlate(gs, rp);
        const rc = basicBot.decideReserve(gs);
        if (rc !== null && rc !== undefined) gs = reserveCard(gs, rc);
        gs = skipSpend(gs);
        break;
      }
      case 'claim': {
        const d = basicBot.decideClaim(gs);
        if (d && d.cardId) gs = claim(gs, d.cardId, d.removedBoardIndex, d.destination);
        else gs = skipClaim(gs);
        break;
      }
      case 'refill':
        gs = refill(gs);
        break;
    }
    steps++;
  }
}

const pct = (n, d) => d ? `${(100 * n / d).toFixed(1)}%` : 'n/a';
const mean = (a) => a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0;
const quantile = (a, q) => {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
};

console.log(`\n=== PAID 2-CARD DEAL: opportunity and value (${games} games, ${playerCount}p${ALWAYS_BUY ? ', ALWAYS-BUY arm' : ''}) ===\n`);
console.log(`Spend steps:            ${spendSteps}`);
console.log(`  legally dealable:     ${legal} (${pct(legal, spendSteps)})`);
console.log(`  blocked by row cap:   ${rowAtCap} (${pct(rowAtCap, spendSteps)})`);
console.log(`  blocked by no cupcake:${broke} (${pct(broke, spendSteps)})`);
console.log(`  dealable AND locked:  ${lockedAndLegal} (${pct(lockedAndLegal, spendSteps)} of steps, ${pct(lockedAndLegal, legal)} of dealable)`);
console.log(`\nAt a dealable+locked step:`);
console.log(`  P(at least one of ${CARDS_PER_DEAL} lands claimable): mean=${mean(pHits).toFixed(3)}  median=${quantile(pHits, 0.5).toFixed(3)}  p90=${quantile(pHits, 0.9).toFixed(3)}`);
console.log(`  implied VP value:      mean=${mean(values).toFixed(2)}  median=${quantile(values, 0.5).toFixed(2)}  p90=${quantile(values, 0.9).toFixed(2)}`);
for (const bar of [0.5, 1.0, 1.5, 2.0, 2.5]) {
  const n = values.filter(v => v >= bar).length;
  console.log(`  steps clearing a bar of ${bar.toFixed(1)} VP: ${n} (${pct(n, values.length)} of locked, ${pct(n, spendSteps)} of all steps)`);
}
if (ALWAYS_BUY) {
  console.log(`\nALWAYS-BUY arm: bought ${bought}, of which ${boughtAndHit} dealt an immediately claimable card (${pct(boughtAndHit, bought)})`);
  console.log(`  (compare the predicted mean P above - if these disagree, the lottery model is wrong, not the threshold)`);
}
