// "PAY 1 CUPCAKE TO COMPLETE ANOTHER CARD" AS A SIXTH MENU SPEND (9 August 2026)
//
// Dean's proposal, and it is a different shape from the variant the engine has
// carried since 28 July. That one is a CLAIM RULE - keep claiming while you can
// pay. This one is a MENU ITEM, and the menu's existing grammar is "one of each per
// turn", so it caps itself at exactly one purchase: a maximum of two cards a turn,
// no special rule needed.
//
// THE QUESTION THIS ANSWERS is whether the price does any work. A spend that every
// player buys every time it is available is not a priced decision, it is a tax on
// the wallet - and the 2,000-game A/B hints at exactly that: at 1 cupcake the extra
// claim is funded out of KEPT cupcakes (1.94 -> 1.52) rather than out of any other
// spend, i.e. out of slack in the economy rather than out of a trade-off.
//
// CANDIDATES:
//   control    - one claim per turn, as adopted
//   2max free  - a second claim allowed, free. Isolates the CAP from the PRICE.
//   2max @1    - Dean's proposal
//   2max @2    - the same at a price that might actually bite
//   uncapped@1 - the 28 July variant, for comparison against the capped version
//
// THE CAP IS ENFORCED IN THE HARNESS, not the engine: the driver simply stops
// asking for a third claim. Everything else is the engine's own variant flag.
//
// LIQUIDITY vs CHOICE. After every claim the harness asks whether a further claim
// is legal on the board, and if so whether the player could pay for it. That
// separates "the chain was refused because the rule capped it", "...because the
// player was broke" and "...because there was nothing there".
//
// HONEST LIMIT, STATED UP FRONT: basicBot's decideClaim does not know the price
// exists - it claims whenever it legally can. So this measures the LIQUIDITY GATE
// exactly and says nothing about whether a human would ever decline. Any row where
// "could pay" and "bought" are equal is the bot never declining, not evidence that
// the spend is an auto-buy for a person.
//
//   node ab-secondclaim-spend-2026-08-09.mjs [gamesPerCell]
import { createGame, sweep, takeBonusTile, declineBonusTile, takeExtraTile, dealCards,
  place, claim, skipClaim, skipSpend, moveTile, removePlate, reserveCard, refill,
  calculateFinalScores, getWinningPlayers, getPatternMatches,
  setExtraClaimCupcakeCost, EXTRA_CLAIM_CUPCAKE_COST } from './src/engine/game.js';
import { createStatsCollector } from './src/engine/statsCollector.js';
import * as bot from './src/bots/basicBot.js';

const GAMES = parseInt(process.argv[2] || '2000', 10);

const ONLY = (process.argv[3] || '').split(',').filter(Boolean);
const ALL_CANDIDATES = [
  { label: 'control (one per turn)', cost: null, maxClaims: 1 },
  { label: '2 max, free',            cost: 0,    maxClaims: 2 },
  { label: '2 max, 1 cupcake',       cost: 1,    maxClaims: 2 },
  { label: '2 max, 2 cupcakes',      cost: 2,    maxClaims: 2 },
  { label: 'uncapped, 1 cupcake',    cost: 1,    maxClaims: Infinity },
];
const CANDIDATES = ONLY.length ? ALL_CANDIDATES.filter(c => ONLY.some(o => c.label.includes(o))) : ALL_CANDIDATES;

// Is any further claim legal for this player right now?
function furtherClaimExists(s) {
  const p = s.players[s.currentPlayerIndex];
  for (const c of s.cardMarket) if (getPatternMatches(p.board, c.pattern).length > 0) return true;
  for (const c of p.reservedCards) if (getPatternMatches(p.board, c.pattern).length > 0) return true;
  return false;
}

function runGame(playerCount, maxClaims, cost, acc) {
  const sc = createStatsCollector();
  const cfg = Array.from({ length: playerCount }, (_, i) => ({ id: i, name: `P${i}`, type: 'ai' }));
  let s = createGame(cfg, sc);
  let steps = 0, claimsThisTurn = 0;

  while (!s.gameOver && steps < 3000) {
    switch (s.gamePhase) {
      case 'sweep': {
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
        // THE HARNESS-SIDE CAP. Close the step rather than ask again.
        if (claimsThisTurn >= maxClaims) { s = skipClaim(s); break; }
        const d = bot.decideClaim(s);
        if (d && d.cardId) {
          s = claim(s, d.cardId, d.removedBoardIndex, d.destination);
          claimsThisTurn++;
          // Classify the moment AFTER the first claim lands - the one that decides
          // whether the second completion is a real option.
          if (claimsThisTurn === 1 && cost !== null) {
            const p = s.players[s.currentPlayerIndex];
            if (furtherClaimExists(s)) {
              acc.chainAvailable++;
              if (p.cupcakes >= cost) acc.couldPay++;
              else acc.brokeAtChain++;
            }
          }
        } else {
          s = skipClaim(s);
        }
        break;
      }
      case 'refill': {
        if (claimsThisTurn >= 2) acc.chainTurns++;
        // The LOCKED TURN. More claiming drains the shared row against a refill
        // that is one card a turn regardless, so this is the number the change
        // costs everybody else - and the one the last fortnight has been buying
        // down. Counted as turns that claimed nothing, the same denominator the
        // main simulate.js lock metric uses.
        if (claimsThisTurn === 0) acc.zeroClaimTurns++;
        acc.turns++;
        claimsThisTurn = 0;
        s = refill(s);
        break;
      }
    }
    steps++;
  }
  if (s.gameOver) calculateFinalScores(s);
  return { state: s, report: sc.getReport() };
}

function measure(playerCount, cand) {
  setExtraClaimCupcakeCost(cand.cost);
  const acc = { chainAvailable: 0, couldPay: 0, brokeAtChain: 0, chainTurns: 0, turns: 0, zeroClaimTurns: 0 };
  const wins = new Array(playerCount).fill(0);
  const score = new Array(playerCount).fill(0);
  let turns = 0, kept = 0, claims = 0, winnerScore = 0, gapSum = 0, lastScore = 0;
  let zeroClaimTurns = 0;
  const spend = { extraTile: 0, dealCards: 0, reserve: 0, moveTile: 0, removePlate: 0, extraClaim: 0 };

  for (let g = 0; g < GAMES; g++) {
    const { state: s, report } = runGame(playerCount, cand.maxClaims, cand.cost, acc);
    turns += s.stats.turnsPlayed;
    const winners = new Set(getWinningPlayers(s).map(p => p.id));
    const scores = s.players.map(p => p.score ?? 0);
    winnerScore += Math.max(...scores); lastScore += Math.min(...scores);
    gapSum += Math.max(...scores) - Math.min(...scores);
    s.players.forEach((p, seat) => {
      if (winners.has(p.id)) wins[seat] += 1 / winners.size;
      score[seat] += scores[seat];
      claims += p.claimedCards.length;
      kept += p.cupcakes;
    });
    for (const k of Object.keys(spend)) spend[k] += report.cupcakeSpendTotals?.[k] || 0;
  }
  setExtraClaimCupcakeCost(EXTRA_CLAIM_CUPCAKE_COST);

  const n = GAMES * playerCount;
  const even = 100 / playerCount;
  const seatWin = wins.map(w => 100 * w / GAMES);
  const seatScore = score.map(v => v / GAMES);
  return {
    label: cand.label,
    turnsPerPlayer: turns / GAMES / playerCount,
    meanScore: score.reduce((a, v) => a + v, 0) / n,
    winnerScore: winnerScore / GAMES,
    gap: gapSum / GAMES,
    lastShare: 100 * (lastScore / GAMES) / (winnerScore / GAMES),
    claimsPerPlayer: claims / n,
    keptPerPlayer: kept / n,
    chainTurnPct: 100 * acc.chainTurns / acc.turns,
    zeroClaimPct: 100 * acc.zeroClaimTurns / acc.turns,
    chainAvailable: acc.chainAvailable, couldPay: acc.couldPay, broke: acc.brokeAtChain,
    worstWin: seatWin.reduce((w, v) => Math.abs(v - even) > Math.abs(w) ? v - even : w, 0),
    gradient: seatScore[0] - seatScore[seatScore.length - 1],
    spend: Object.fromEntries(Object.entries(spend).map(([k, v]) => [k, v / n])),
  };
}

console.log(`\nSECOND COMPLETION AS A MENU SPEND - ${GAMES} games per cell`);
console.log('The cap is "one of each spend per turn", i.e. a second card and no more.\n');

for (const pc of [2, 3, 4]) {
  console.log(`===== ${pc} PLAYERS =====`);
  console.log('  rule                     turns/pl  mean  winner   gap  last%  claims/pl  kept  chain-turn%  LOCKED%  gradient  worst win%');
  const rows = CANDIDATES.map(c => measure(pc, c));
  for (const r of rows) {
    console.log(
      `  ${r.label.padEnd(23)} ${r.turnsPerPlayer.toFixed(2).padStart(7)} ${r.meanScore.toFixed(1).padStart(5)} ` +
      `${r.winnerScore.toFixed(1).padStart(6)} ${r.gap.toFixed(1).padStart(5)} ${r.lastShare.toFixed(1).padStart(5)}  ` +
      `${r.claimsPerPlayer.toFixed(2).padStart(8)}  ${r.keptPerPlayer.toFixed(2).padStart(4)}  ` +
      `${r.chainTurnPct.toFixed(1).padStart(10)}  ${r.zeroClaimPct.toFixed(1).padStart(6)}  ${r.gradient.toFixed(2).padStart(8)}  ${(r.worstWin >= 0 ? '+' : '') + r.worstWin.toFixed(1).padStart(5)}`
    );
  }
  console.log('\n  THE LIQUIDITY GATE - at the moment a second completion became legal:');
  for (const r of rows) {
    if (!r.chainAvailable) { console.log(`    ${r.label.padEnd(23)} (n/a - no second claim under this rule)`); continue; }
    console.log(
      `    ${r.label.padEnd(23)} available ${String(r.chainAvailable).padStart(6)} times; ` +
      `could pay ${(100 * r.couldPay / r.chainAvailable).toFixed(1)}%, broke ${(100 * r.broke / r.chainAvailable).toFixed(1)}%`
    );
  }
  console.log('\n  WHERE THE CUPCAKES WENT (per player per game):');
  for (const r of rows) {
    const s = r.spend;
    const total = Object.values(s).reduce((a, v) => a + v, 0);
    console.log(
      `    ${r.label.padEnd(23)} tile ${s.extraTile.toFixed(2)}  deal ${s.dealCards.toFixed(2)}  reserve ${s.reserve.toFixed(2)}  ` +
      `move ${s.moveTile.toFixed(2)}  plate ${s.removePlate.toFixed(2)}  2ND CLAIM ${s.extraClaim.toFixed(2)}  ` +
      `| spent ${total.toFixed(2)} kept ${r.keptPerPlayer.toFixed(2)}`
    );
  }
  console.log('');
}
