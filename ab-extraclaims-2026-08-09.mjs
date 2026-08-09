// SHOULD A PLAYER BE ABLE TO CLAIM MORE THAN ONE PATISSERIE GOAL IN A TURN?
// (9 August 2026)
//
// THE QUESTION. The adopted rule is ONE claim per turn. The engine has carried the
// pre-agreed variant since the design session - claims beyond the first cost n
// cupcakes each - as a dormant constant (EXTRA_CLAIM_CUPCAKE_COST, ships null).
// This sweeps it: null (control), 0 (UNLIMITED and free, the version Dean asked
// about), 1 and 2 (priced).
//
// WHAT THIS MEASURES, and why each line is here:
//   claims/turn distribution  - does the multi-claim turn actually HAPPEN, or is
//                               it a rule that fires twice a game? The existing
//                               sim says 15.5% of claim steps open with 2+ cards
//                               claimable, but claiming spends a board tile, so
//                               the second match may evaporate. This measures the
//                               claims that LAND, not the ones that looked legal.
//   turns/player              - the clock. Board-full is the ending; a claim keeps
//                               its cell occupied (tile -> plate), so the direct
//                               effect should be nil and any movement is indirect.
//   winner-to-last gap        - the runaway test. A big-combo turn is a leader
//                               amplifier if the player who already has the board
//                               is the one who can chain claims.
//   gradient / worst win%     - seat fairness, the thing every previous sweep on
//                               this game has moved by accident.
//   kept cupcakes + spend mix - at cost 1-2, does the extra claim starve the extra
//                               tile and the 2-card deal, which are the two cures
//                               for a locked claim step?
//   branching proxy           - mean cards claimable when the step opens, and the
//                               mean number of DECISIONS the claim step demands per
//                               turn. This is the analysis-burden number: the whole
//                               objection to the variant is turn length, so it has
//                               to be a measured quantity and not a feeling.
//
//   node ab-extraclaims-2026-08-09.mjs [gamesPerCell]
import { createGame, sweep, takeBonusTile, declineBonusTile, takeExtraTile, dealCards,
  place, claim, skipClaim, skipSpend, moveTile, removePlate, reserveCard, refill,
  calculateFinalScores, getWinningPlayers, getPatternMatches,
  setExtraClaimCupcakeCost, EXTRA_CLAIM_CUPCAKE_COST } from './src/engine/game.js';
import { createStatsCollector } from './src/engine/statsCollector.js';
import * as bot from './src/bots/basicBot.js';

const GAMES = parseInt(process.argv[2] || '1500', 10);

// null = the adopted rule. A number = cupcakes charged per claim beyond the first.
const CONDITIONS = [
  { cost: null, label: 'one per turn (adopted)' },
  { cost: 0, label: 'unlimited, free' },
  { cost: 1, label: 'unlimited, 1 cupcake each' },
  { cost: 2, label: 'unlimited, 2 cupcakes each' },
];

function runGame(playerCount, acc) {
  const sc = createStatsCollector();
  // Handed back on the returned state so the caller can read the spend mix; the
  // engine only ever writes to it.

  const cfg = Array.from({ length: playerCount }, (_, i) => ({ id: i, name: `P${i}`, type: 'ai' }));
  let s = createGame(cfg, sc);
  let steps = 0;
  // Claims landed in the CURRENT turn, counted here rather than read off
  // gameState.claimsThisTurn at the end, because refill() resets it.
  let claimsThisTurn = 0;
  let stepOpen = true;

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
        // The extra tile is uncapped (9 August), so ask again after every purchase.
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
        // Sample the branching factor ONCE per turn, as the step opens - the same
        // definition simulate.js metric 5 uses, so the two are comparable.
        if (stepOpen) {
          const p = s.players[s.currentPlayerIndex];
          let n = 0;
          for (const c of s.cardMarket) if (getPatternMatches(p.board, c.pattern).length > 0) n++;
          for (const c of p.reservedCards) if (getPatternMatches(p.board, c.pattern).length > 0) n++;
          acc.claimStepsOpened++;
          acc.claimableAtOpen += n;
          if (n >= 2) acc.multiMatchOpens++;
          stepOpen = false;
        }
        const d = bot.decideClaim(s);
        if (d && d.cardId) {
          s = claim(s, d.cardId, d.removedBoardIndex, d.destination);
          claimsThisTurn++;
        } else {
          s = skipClaim(s);
        }
        break;
      }
      case 'refill': {
        acc.claimsPerTurnHist[claimsThisTurn] = (acc.claimsPerTurnHist[claimsThisTurn] || 0) + 1;
        if (claimsThisTurn >= 2) acc.multiClaimTurns++;
        acc.turnsCounted++;
        claimsThisTurn = 0;
        stepOpen = true;
        s = refill(s);
        break;
      }
    }
    steps++;
  }
  if (steps >= 3000) acc.truncated++;
  if (s.gameOver) calculateFinalScores(s);
  return { state: s, report: sc.getReport() };
}

function measure(playerCount, cost) {
  setExtraClaimCupcakeCost(cost);
  const acc = {
    claimStepsOpened: 0, claimableAtOpen: 0, multiMatchOpens: 0,
    claimsPerTurnHist: [], multiClaimTurns: 0, turnsCounted: 0, truncated: 0,
  };
  const wins = new Array(playerCount).fill(0);
  const score = new Array(playerCount).fill(0);
  let turns = 0, kept = 0, zeroClaim = 0, claims = 0;
  let winnerScore = 0, lastScore = 0, gapSum = 0;
  let extraTiles = 0, deals = 0, reserves = 0, moves = 0, plates = 0, extraClaimSpend = 0;
  let boardFullEnds = 0;

  for (let g = 0; g < GAMES; g++) {
    const { state: s, report } = runGame(playerCount, acc);
    turns += s.stats.turnsPlayed;
    if (s.endGameReason === 'boardFull') boardFullEnds++;
    const winners = new Set(getWinningPlayers(s).map(p => p.id));
    const scores = s.players.map(p => p.score ?? 0);
    const hi = Math.max(...scores), lo = Math.min(...scores);
    winnerScore += hi; lastScore += lo; gapSum += hi - lo;
    s.players.forEach((p, seat) => {
      if (winners.has(p.id)) wins[seat] += 1 / winners.size;
      score[seat] += scores[seat];
      claims += p.claimedCards.length;
      kept += p.cupcakes;
      if (p.claimedCards.length === 0) zeroClaim++;
    });
    // Cupcake spend mix, so a priced extra claim's crowding-out is visible.
    const sp = report.cupcakeSpendTotals || {};
    extraTiles += sp.extraTile || 0;
    deals += sp.dealCards || 0;
    reserves += sp.reserve || 0;
    moves += sp.moveTile || 0;
    plates += sp.removePlate || 0;
    extraClaimSpend += sp.extraClaim || 0;
  }

  const even = 100 / playerCount;
  const seatWin = wins.map(w => 100 * w / GAMES);
  const seatScore = score.map(v => v / GAMES);
  const n = GAMES * playerCount;
  const worstWin = seatWin.reduce((worst, w) => Math.abs(w - even) > Math.abs(worst) ? w - even : worst, 0);
  const totalClaimsLanded = acc.claimsPerTurnHist.reduce((a, v, i) => a + (v || 0) * i, 0);

  setExtraClaimCupcakeCost(EXTRA_CLAIM_CUPCAKE_COST);
  return {
    seatWin, seatScore, worstWin,
    gradient: seatScore[0] - seatScore[seatScore.length - 1],
    turnsPerPlayer: turns / GAMES / playerCount,
    meanScore: score.reduce((a, v) => a + v, 0) / n,
    winnerScore: winnerScore / GAMES,
    lastScore: lastScore / GAMES,
    gap: gapSum / GAMES,
    lastShare: 100 * (lastScore / GAMES) / (winnerScore / GAMES),
    claimsPerPlayer: claims / n,
    keptPerPlayer: kept / n,
    zeroClaimPct: 100 * zeroClaim / n,
    multiClaimPct: 100 * acc.multiClaimTurns / acc.turnsCounted,
    claimsHist: acc.claimsPerTurnHist,
    claimableAtOpen: acc.claimableAtOpen / acc.claimStepsOpened,
    multiMatchOpenPct: 100 * acc.multiMatchOpens / acc.claimStepsOpened,
    claimsPerClaimStep: totalClaimsLanded / acc.claimStepsOpened,
    boardFullPct: 100 * boardFullEnds / GAMES,
    truncated: acc.truncated,
    spendMix: { extraTiles, deals, reserves, moves, plates, extraClaimSpend },
  };
}

console.log(`\nEXTRA PATISSERIE CLAIMS PER TURN - ${GAMES} games per cell`);
console.log('Control is the adopted one-claim-per-turn rule. Every other row lets a player');
console.log('keep claiming while they can pay and still find a pattern on their board.\n');

for (const pc of [2, 3, 4]) {
  console.log(`===== ${pc} PLAYERS =====`);
  console.log('  rule                          turns/pl  mean  winner  last  gap  last%  claims/pl  kept  0-claim%  gradient  worst win%');
  const rows = [];
  for (const { cost, label } of CONDITIONS) {
    const r = measure(pc, cost);
    rows.push({ label, r });
    console.log(
      `  ${label.padEnd(28)} ${r.turnsPerPlayer.toFixed(2).padStart(7)} ${r.meanScore.toFixed(1).padStart(6)} ` +
      `${r.winnerScore.toFixed(1).padStart(6)} ${r.lastScore.toFixed(1).padStart(5)} ${r.gap.toFixed(1).padStart(5)} ` +
      `${r.lastShare.toFixed(1).padStart(5)}  ${r.claimsPerPlayer.toFixed(2).padStart(8)}  ${r.keptPerPlayer.toFixed(2).padStart(4)}  ` +
      `${r.zeroClaimPct.toFixed(1).padStart(7)}  ${r.gradient.toFixed(2).padStart(8)}  ${(r.worstWin >= 0 ? '+' : '') + r.worstWin.toFixed(1).padStart(5)}`
    );
  }
  console.log('\n  claims LANDED per turn (0 = a turn that claimed nothing):');
  for (const { label, r } of rows) {
    const h = [];
    for (let i = 0; i < r.claimsHist.length; i++) {
      if (r.claimsHist[i]) h.push(`${i}:${(100 * r.claimsHist[i] / r.claimsHist.reduce((a, v) => a + (v || 0), 0)).toFixed(1)}%`);
    }
    console.log(`    ${label.padEnd(28)} ${h.join('  ')}   [2+ turns ${r.multiClaimPct.toFixed(1)}%]`);
  }
  console.log('\n  analysis burden + spend mix:');
  for (const { label, r } of rows) {
    const s = r.spendMix;
    const per = v => (v / (GAMES * pc)).toFixed(2);
    console.log(
      `    ${label.padEnd(28)} claimable@open ${r.claimableAtOpen.toFixed(2)} (2+ ${r.multiMatchOpenPct.toFixed(1)}%), ` +
      `claims/step ${r.claimsPerClaimStep.toFixed(2)}, boardFull-end ${r.boardFullPct.toFixed(0)}%`
    );
    console.log(
      `    ${''.padEnd(28)} cupcakes/player: tile ${per(s.extraTiles)} deal ${per(s.deals)} reserve ${per(s.reserves)} ` +
      `move ${per(s.moves)} plate ${per(s.plates)} EXTRACLAIM ${per(s.extraClaimSpend)}`
    );
  }
  console.log('');
}
