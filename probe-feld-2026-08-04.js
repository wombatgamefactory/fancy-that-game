// Feld-lens probe, 4 August set. Answers three things neither simulate.js nor
// probe-feld.js reports, all of them needed for the assessment's Battery B and D:
//
//   (1) STAND SHAPE AT GAME END - how many tiles each row finishes with, and how
//       often the bottom row reaches its 22-VP tail. This is the "is the deep
//       gamble ever taken" question behind STAND_ROW_VALUES.
//   (2) THE LEADER CHECK (Gate F-4) - does the player who WINS spend cupcakes as
//       readily as the player who comes last, or is the currency a consolation?
//   (3) CLAIM DECISION DENSITY by game-third - how often the claim step is a
//       genuine choice (2+ claimable) rather than forced or empty.
//
// Read-only with respect to the engine. Same driver loop as probe-feld.js.
import { createGame, sweep, takeBonusTile, declineBonusTile, takeExtraTile, place, claim, skipClaim, skipSpend, moveTile, removePlate, reserveCard, refill, calculateFinalScores, getPatternMatches, STAND_ROW_VALUES } from './src/engine/game.js';
import * as basicBot from './src/bots/basicBot.js';

function runGame(playerConfigs) {
  const strategy = basicBot;
  let gameState = createGame(playerConfigs);
  const spendByPlayer = playerConfigs.map(() => 0);
  const claimChoice = [0, 0, 0]; // claim steps by third: [0 claimable, 1, 2+]
  const claimChoiceByThird = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  let steps = 0;

  while (!gameState.gameOver && steps < 1000) {
    const turnNow = gameState.stats.turnsPlayed;
    const pi = gameState.currentPlayerIndex;
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
        const extra = strategy.decideExtraTile ? strategy.decideExtraTile(gameState) : null;
        if (extra !== null && extra !== undefined) { spendByPlayer[pi] += 2; gameState = takeExtraTile(gameState, extra); }
        gameState = place(gameState, strategy.decidePlacements(gameState));
        break;
      }
      case 'spend': {
        const m = strategy.decideMove ? strategy.decideMove(gameState) : null;
        if (m) { spendByPlayer[pi] += 1; gameState = moveTile(gameState, m.fromIndex, m.toIndex); }
        const rp = strategy.decideRemovePlate ? strategy.decideRemovePlate(gameState) : null;
        if (rp !== null && rp !== undefined) { spendByPlayer[pi] += 3; gameState = removePlate(gameState, rp); }
        const rc = strategy.decideReserve ? strategy.decideReserve(gameState) : null;
        if (rc !== null && rc !== undefined) { spendByPlayer[pi] += 1; gameState = reserveCard(gameState, rc); }
        gameState = skipSpend(gameState);
        // Sample the claim step the player is looking at, exactly as the engine's
        // own metric 4/5 sampler does, but bucketed by game-third.
        {
          const player = gameState.players[gameState.currentPlayerIndex];
          let n = 0;
          for (const card of gameState.cardMarket) if (getPatternMatches(player.board, card.pattern).length > 0) n++;
          for (const r of player.reservedCards) if (getPatternMatches(player.board, r.pattern).length > 0) n++;
          const bucket = n === 0 ? 0 : (n === 1 ? 1 : 2);
          claimChoice[bucket]++;
          claimChoiceByThird[0][bucket] += 0; // filled below once total turns are known
          claimChoiceByThird.turnLog = claimChoiceByThird.turnLog || [];
          claimChoiceByThird.turnLog.push([turnNow, bucket]);
        }
        break;
      }
      case 'claim': {
        const d = strategy.decideClaim(gameState);
        if (d && d.cardId) gameState = claim(gameState, d.cardId, d.removedBoardIndex, d.destination);
        else gameState = skipClaim(gameState);
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
  for (const [t, bucket] of (claimChoiceByThird.turnLog || [])) {
    claimChoiceByThird[Math.min(2, Math.floor((t / totalTurns) * 3))][bucket]++;
  }

  const scores = gameState.players.map(p => p.score);
  const best = Math.max(...scores), worst = Math.min(...scores);
  const winnerIdx = scores.indexOf(best), loserIdx = scores.indexOf(worst);

  // Stand shape: tiles in each row at game end, and the VP that row paid.
  const rows = [[], [], [], []];
  for (const p of gameState.players) {
    for (let i = 0; i < 4; i++) rows[i].push(p.stand[i].tiles.length);
  }

  return {
    rows,
    winnerSpend: spendByPlayer[winnerIdx], loserSpend: spendByPlayer[loserIdx],
    winnerClaims: gameState.players[winnerIdx].claimedCards.length,
    loserClaims: gameState.players[loserIdx].claimedCards.length,
    claimChoice, claimChoiceByThird: claimChoiceByThird.map(a => a.slice()),
    crumbs: gameState.players.map(p => p.crumbTray.length),
  };
}

const GAMES = parseInt(process.argv[2]) || 500;
for (const pc of [2, 3, 4]) {
  const cfg = Array.from({ length: pc }, (_, i) => ({ id: i, name: `P${i}`, type: 'ai' }));
  const all = [];
  for (let g = 0; g < GAMES; g++) all.push(runGame(cfg));

  const sum = (a) => a.reduce((x, y) => x + y, 0);
  const mean = (a) => (a.length ? sum(a) / a.length : 0);

  console.log(`\n=== ${pc} PLAYERS (${GAMES} games) ===`);
  // (1) stand shape
  const capacity = [4, 3, 2, 1];
  for (let i = 0; i < 4; i++) {
    const counts = all.flatMap(g => g.rows[i]);
    const hist = [];
    for (let n = 0; n <= capacity[i]; n++) hist.push(`${n}:${(100 * counts.filter(v => v === n).length / counts.length).toFixed(1)}%`);
    const vp = counts.map(n => (n > 0 ? STAND_ROW_VALUES[i][n - 1] : 0));
    console.log(`Stand row ${i} (cap ${capacity[i]}, values ${STAND_ROW_VALUES[i].join('/')}): mean ${mean(counts).toFixed(2)} tiles, mean ${mean(vp).toFixed(2)} VP | ${hist.join('  ')}`);
  }
  console.log(`Crumb tray: mean ${mean(all.flatMap(g => g.crumbs)).toFixed(2)} tiles/player`);
  // (2) leader check
  console.log(`Cupcakes SPENT: winner ${mean(all.map(g => g.winnerSpend)).toFixed(2)} vs last ${mean(all.map(g => g.loserSpend)).toFixed(2)}   Claims: winner ${mean(all.map(g => g.winnerClaims)).toFixed(2)} vs last ${mean(all.map(g => g.loserClaims)).toFixed(2)}`);
  // (3) claim decision density
  const tot = [0, 1, 2].map(i => sum(all.map(g => g.claimChoice[i])));
  const t = sum(tot) || 1;
  console.log(`Claim step: 0 claimable ${(100 * tot[0] / t).toFixed(1)}%  |  exactly 1 (forced) ${(100 * tot[1] / t).toFixed(1)}%  |  2+ (a choice) ${(100 * tot[2] / t).toFixed(1)}%`);
  for (let th = 0; th < 3; th++) {
    const b = [0, 1, 2].map(i => sum(all.map(g => g.claimChoiceByThird[th][i])));
    const bt = sum(b) || 1;
    console.log(`  third ${th + 1}: ${(100 * b[0] / bt).toFixed(1)}% / ${(100 * b[1] / bt).toFixed(1)}% / ${(100 * b[2] / bt).toFixed(1)}%`);
  }
}
