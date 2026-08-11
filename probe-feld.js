// Feld-lens probe. Answers four questions the standard simulate.js report does
// not: (1) are claims back-loaded, (2) when are cupcakes actually spent, (3) how
// often is the crumb tray chosen, (4) what does the pre-agreed extra-claim
// cupcake variant do to all of the above. Read-only with respect to the engine -
// the only thing it touches is the documented setExtraClaimCupcakeCost seam.
import { createGame, sweep, takeBonusTile, declineBonusTile, takeExtraTile, place, claim, skipClaim, skipSpend, moveTile, removePlate, refill, calculateFinalScores, STAND_ROW_VALUES, setExtraClaimCupcakeCost, EXTRA_CLAIM_CUPCAKE_COST } from './src/engine/game.js';
import { createStatsCollector } from './src/engine/statsCollector.js';
import * as basicBot from './src/bots/basicBot.js';

function runGame(playerConfigs) {
  const strategy = basicBot;
  const statsCollector = createStatsCollector();
  let gameState = createGame(playerConfigs, statsCollector);

  const claimTurns = [];   // turn number of every claim
  const spendTurns = [];   // turn number of every cupcake move-spend
  let crumbChoices = 0;    // claims whose plated tile went to the crumb tray
  let plateChoices = 0;
  let steps = 0;

  while (!gameState.gameOver && steps < 1000) {
    const turnNow = gameState.stats.turnsPlayed;
    switch (gameState.gamePhase) {
      case 'sweep': {
        if (gameState.bonusTileAvailable) {
          const b = strategy.decideBonusTile ? strategy.decideBonusTile(gameState) : null;
          gameState = (b !== null && b !== undefined && gameState.market[b])
            ? takeBonusTile(gameState, b) : declineBonusTile(gameState);
          break;
        }
        const d = strategy.decideSweep(gameState);
        if (d) gameState = sweep(gameState, d.rowOrCol, d.isRow, d.declaration, d.declarationType);
        else gameState.gamePhase = 'place';
        break;
      }
      case 'place': {
        // 3 August: the extra tile is bought at the sweep step, before placements,
        // and counts as a cupcake-spend turn for the pressure-valve measurement.
        const extra = strategy.decideExtraTile ? strategy.decideExtraTile(gameState) : null;
        if (extra !== null && extra !== undefined) {
          spendTurns.push(turnNow);
          gameState = takeExtraTile(gameState, extra);
        }
        gameState = place(gameState, strategy.decidePlacements(gameState));
        break;
      }
      case 'spend': {
        const m = strategy.decideMove ? strategy.decideMove(gameState) : null;
        if (m) { spendTurns.push(turnNow); gameState = moveTile(gameState, m.fromIndex, m.toIndex); }
        const rp = strategy.decideRemovePlate ? strategy.decideRemovePlate(gameState) : null;
        if (rp !== null && rp !== undefined) { spendTurns.push(turnNow); gameState = removePlate(gameState, rp); }
        // (the paid reserve was driven here until 11 August, when it was deleted)
        gameState = skipSpend(gameState);
        break;
      }
      case 'claim': {
        // Under the extra-claim variant a successful claim leaves the phase in
        // 'claim', so loop until the bot declines or the phase moves on.
        const d = strategy.decideClaim(gameState);
        if (d && d.cardId) {
          claimTurns.push(turnNow);
          // destination is an OBJECT ({type:'crumb'} or {type:'row',rowIndex}),
          // never a bare string - reading it as a string silently reports 0
          // crumbs for every game.
          if (d.destination && d.destination.type === 'crumb') crumbChoices++; else plateChoices++;
          gameState = claim(gameState, d.cardId, d.removedBoardIndex, d.destination);
        } else {
          gameState = skipClaim(gameState);
        }
        break;
      }
      case 'refill':
        gameState = refill(gameState);
        break;
    }
    steps++;
  }
  if (gameState.gameOver) calculateFinalScores(gameState);

  const totalTurns = Math.max(1, gameState.stats.turnsPlayed);
  const third = (t) => Math.min(2, Math.floor((t / totalTurns) * 3));
  const claimThirds = [0, 0, 0];
  for (const t of claimTurns) claimThirds[third(t)]++;
  const spendThirds = [0, 0, 0];
  for (const t of spendTurns) spendThirds[third(t)]++;

  // "First five rounds" = the first 5 * playerCount turns, the W1/W3 window.
  const earlyWindow = 5 * playerConfigs.length;
  const earlySpends = spendTurns.filter(t => t < earlyWindow).length;
  const earlyClaims = claimTurns.filter(t => t < earlyWindow).length;

  const perPlayer = gameState.players.map(p => {
    let standScore = 0;
    for (let i = 0; i < p.stand.length; i++) {
      if (p.stand[i].tiles.length > 0) standScore += STAND_ROW_VALUES[i][p.stand[i].tiles.length - 1];
    }
    // cardVp by subtraction. It used to take the cupcakes off as well, from when
    // they scored 1 VP each; they have scored nothing since 3 August, so
    // subtracting them was quietly UNDER-reporting card VP by the whole held
    // stack. The pantry goals were deleted on the morning of 4 August, and
    // TODAY'S SPECIALITY was added that afternoon - so the score is
    // stand + crumbs + cards + speciality, and the Speciality has to come off
    // here or this remainder silently absorbs it (up to 6 VP a claim, which would
    // read as the cards suddenly getting more valuable).
    return { score: p.score, claims: p.claimedCards.length, standScore, cupcakes: p.cupcakes,
             speciality: p.specialityVp || 0,
             cardVp: p.score - standScore - p.crumbTray.length - (p.specialityVp || 0) };
  });
  const scores = perPlayer.map(p => p.score);

  return {
    turns: totalTurns, endReason: gameState.endGameReason,
    claimThirds, spendThirds, earlySpends, earlyClaims, earlyWindow,
    crumbChoices, plateChoices, perPlayer,
    winner: Math.max(...scores), last: Math.min(...scores),
    report: statsCollector.getReport(),
  };
}

function run(label, playerCount, games, extraClaimCost) {
  setExtraClaimCupcakeCost(extraClaimCost);
  const cfg = Array.from({ length: playerCount }, (_, i) => ({ id: i, name: `P${i}`, type: 'ai' }));
  const all = [];
  for (let g = 0; g < games; g++) all.push(runGame(cfg));
  setExtraClaimCupcakeCost(EXTRA_CLAIM_CUPCAKE_COST);

  const sum = (a) => a.reduce((x, y) => x + y, 0);
  const mean = (a) => (a.length ? sum(a) / a.length : 0);
  const ct = [0, 1, 2].map(i => sum(all.map(g => g.claimThirds[i])));
  const st = [0, 1, 2].map(i => sum(all.map(g => g.spendThirds[i])));
  const ctTot = sum(ct) || 1, stTot = sum(st) || 1;
  const crumb = sum(all.map(g => g.crumbChoices)), plate = sum(all.map(g => g.plateChoices));
  const flat = all.flatMap(g => g.perPlayer);
  // Last place as a percentage of the winner, per game - the standing issue-D1
  // criterion is "last place within ~25% of the winner", i.e. this >= 75%.
  const lastPct = all.map(g => (g.winner > 0 ? 100 * g.last / g.winner : 100));
  const failD1 = lastPct.filter(v => v < 75).length;

  console.log(`\n--- ${label} (${playerCount}p, ${games} games, extraClaim=${extraClaimCost}) ---`);
  console.log(`Turns: mean=${mean(all.map(g => g.turns)).toFixed(1)}`);
  console.log(`Claims by game-third:  ${ct.map(v => (100 * v / ctTot).toFixed(1) + '%').join('  ')}  (flat = 33/33/33; back-load = rising)`);
  console.log(`Cupcake spends/third:  ${st.map(v => (100 * v / stTot).toFixed(1) + '%').join('  ')}`);
  console.log(`First 5 rounds (${all[0].earlyWindow} turns): ${(sum(all.map(g => g.earlySpends)) / games).toFixed(2)} cupcake spends/game, ${(sum(all.map(g => g.earlyClaims)) / games).toFixed(2)} claims/game`);
  console.log(`Plating destination:   crumb ${crumb} vs plate ${plate}  (crumb ${(100 * crumb / (crumb + plate || 1)).toFixed(1)}%)`);
  // Stand and Cards are the whole score bar the crumb tray now - the Objectives
  // column was dropped on 4 August with the pantry goals (it was reading an
  // objectiveVp field this probe never built, so it printed NaN regardless).
  console.log(`Claims/player: ${mean(flat.map(p => p.claims)).toFixed(2)}   Score: ${mean(flat.map(p => p.score)).toFixed(1)}   Stand ${mean(flat.map(p => p.standScore)).toFixed(1)} / Cards ${mean(flat.map(p => p.cardVp)).toFixed(1)}   (cupcakes held, scoring nothing: ${mean(flat.map(p => p.cupcakes)).toFixed(1)})`);
  console.log(`Last as % of winner:   mean=${mean(lastPct).toFixed(1)}%  games below 75% (issue D1 fail): ${failD1}/${games} (${(100 * failD1 / games).toFixed(1)}%)`);
  const lock = sum(all.map(g => g.report.lockTurns)), steps = sum(all.map(g => g.report.claimChanceSamples));
  console.log(`Card-locked claim steps: ${lock}/${steps} (${(100 * lock / (steps || 1)).toFixed(1)}%)`);
  const infl = all.map(g => g.report.cupcakeInfluxTotals), spd = all.map(g => g.report.cupcakeSpendTotals);
  const iT = sum(infl.map(o => o.start + o.pot + o.plates));
  // 3 August: the single `move` bucket split into five named uses. Sum them all
  // rather than naming two, so a future outlet is not silently dropped.
  const sT = sum(spd.map(o => Object.values(o).reduce((a, v) => a + v, 0)));
  const byUse = spd.reduce((acc, o) => { for (const k in o) acc[k] = (acc[k] || 0) + o[k]; return acc; }, {});
  console.log(`Cupcakes: influx ${iT}, spent ${sT} (${(100 * sT / (iT || 1)).toFixed(1)}%) - ${JSON.stringify(byUse)}`);
  return all;
}

const GAMES = parseInt(process.argv[2]) || 300;
for (const pc of [2, 3, 4]) {
  run('BASELINE  (rule as adopted)', pc, GAMES, null);
  run('VARIANT   (extra claim @1)', pc, GAMES, 1);
}
