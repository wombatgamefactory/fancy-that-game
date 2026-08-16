// THE END TRIGGER BONUS A/B (16 August) - 3 VP to the player who arms the
// ending, against 0.
//
// THE QUESTION IS NOT "how big is 3 VP". It is WHO GETS IT. The ending has been
// an externality since the plate pool was deleted on 6 August, and the standing
// objection to anything denominated in it - written against end condition 3 in
// `game.js` and in section 1.4 of the worklist - is that *a clock denominated in
// claims is denominated in the winner's own currency; the leader ends the game on
// the trailing player*. If the player who fills their board first is usually the
// player already winning, then this rule is 3 VP to the leader and it makes the
// spread worse. So the headline metric here is the FINISHING RANK OF THE PLAYER
// WHO TRIGGERS, in the CONTROL arm - measured where the bonus does not exist and
// therefore cannot have moved anybody's rank.
//
// Driver: arena.js's spend step, so the extra tile is genuinely bought. See the
// header of `probe-tastingmenu-ab-2026-08-16.js` for what that defect cost the
// last measurement that skipped it.
//
// Both arms run with the Tasting Menu OFF - that is the base game as of today.
import {
  createGame, sweep, takeBonusTile, declineBonusTile, takeExtraTile, dealCards,
  place, claim, skipClaim, skipSpend, moveTile, removePlate, refill,
  calculateFinalScores, getWinningPlayers, setEndTriggerBonus, END_TRIGGER_BONUS_VP,
} from './src/engine/game.js';
import { createStatsCollector } from './src/engine/statsCollector.js';
import * as basicBot from './src/bots/basicBot.js';

function runGame(playerConfigs) {
  const strategy = basicBot;
  let gameState = createGame(playerConfigs, createStatsCollector(), { tastingMenus: [] });
  let steps = 0;

  while (!gameState.gameOver && steps < 1000) {
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
      case 'place':
        gameState = place(gameState, strategy.decidePlacements(gameState));
        break;
      case 'spend': {
        for (let n = 0; n < 25; n++) {
          const ex = strategy.decideExtraTile ? strategy.decideExtraTile(gameState) : null;
          if (ex === null || ex === undefined) break;
          gameState = takeExtraTile(gameState, ex.marketIndex, ex.boardIndex);
        }
        for (let n = 0; n < 25; n++) {
          const mv = strategy.decideMove ? strategy.decideMove(gameState) : null;
          if (!mv) break;
          gameState = moveTile(gameState, mv.fromIndex, mv.toIndex);
        }
        for (let n = 0; n < 25; n++) {
          const rp = strategy.decideRemovePlate ? strategy.decideRemovePlate(gameState) : null;
          if (rp === null || rp === undefined) break;
          gameState = removePlate(gameState, rp);
        }
        for (let n = 0; n < 10; n++) {
          if (!(strategy.decideDealCards && strategy.decideDealCards(gameState))) break;
          gameState = dealCards(gameState);
        }
        gameState = skipSpend(gameState);
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
  return gameState;
}

function runArm(GAMES, COUNT, cfg, bonus) {
  setEndTriggerBonus(bonus);
  const rankOfTrigger = new Array(COUNT).fill(0);   // finishing rank of whoever armed it
  const seatOfTrigger = new Array(COUNT).fill(0);
  const seatWins = new Array(COUNT).fill(0);
  const endReasons = {};
  let spread = 0, ratio = 0, ratioN = 0, meanScore = 0, turns = 0;
  let nobodyPaid = 0, triggerWon = 0, unfinished = 0, flipped = 0;

  for (let g = 0; g < GAMES; g++) {
    const gs = runGame(cfg);
    if (!gs.gameOver) { unfinished++; continue; }
    endReasons[gs.endGameReason || 'none'] = (endReasons[gs.endGameReason || 'none'] || 0) + 1;
    turns += gs.stats.turnsPlayed;

    const scores = gs.players.map(p => p.score);
    const top = Math.max(...scores);
    spread += top - Math.min(...scores);
    if (top > 0) { ratio += Math.min(...scores) / top; ratioN++; }
    for (let i = 0; i < COUNT; i++) meanScore += scores[i];

    const winners = getWinningPlayers(gs).map(p => p.id);
    for (const id of winners) seatWins[id] += 1 / winners.length;

    const who = gs.endTriggeredBy;
    if (who === null || who === undefined) { nobodyPaid++; continue; }
    seatOfTrigger[who]++;
    if (winners.includes(who)) triggerWon++;
    // Finishing rank, ties sharing the better rank - 0 is the winner.
    const rank = scores.filter(s => s > scores[who]).length;
    rankOfTrigger[rank]++;

    // WOULD THE WINNER CHANGE WITHOUT THE BONUS? Only meaningful in the live arm.
    // Raw score only; the cupcake tiebreak is not re-run, so a game the bonus
    // drags into or out of a tie counts as changed.
    if (bonus > 0) {
      const less = scores.map((s, i) => (i === who ? s - bonus : s));
      const topLess = Math.max(...less);
      const a = scores.map((s, i) => (s === top ? i : -1)).filter(i => i >= 0).join(',');
      const b = less.map((s, i) => (s === topLess ? i : -1)).filter(i => i >= 0).join(',');
      if (a !== b) flipped++;
    }
  }

  const n = GAMES - unfinished;
  const paid = n - nobodyPaid;
  return {
    n, unfinished, endReasons,
    meanScore: meanScore / (n * COUNT),
    spread: spread / n,
    ratio: 100 * ratio / Math.max(1, ratioN),
    turns: turns / n,
    nobodyPaid: 100 * nobodyPaid / n,
    triggerWinRate: 100 * triggerWon / Math.max(1, paid),
    rankOfTrigger: rankOfTrigger.map(r => 100 * r / Math.max(1, paid)),
    seatOfTrigger: seatOfTrigger.map(s => 100 * s / Math.max(1, paid)),
    seatWinShare: seatWins.map(w => 100 * w / n),
    flipped: 100 * flipped / n,
  };
}

const GAMES = parseInt(process.argv[2]) || 1000;
const COUNTS = (process.argv[3] || '2,3,4').split(',').map(Number);

console.log(`\nTHE END TRIGGER BONUS A/B, 16 AUGUST - ${GAMES} games per arm per player count (basicBot)`);
console.log(`Control = 0 VP, live = ${END_TRIGGER_BONUS_VP} VP to the player who arms the ending.`);
console.log('Tasting Menu OFF in both arms - that is the base game. Correct spend-step driver.\n');

for (const COUNT of COUNTS) {
  const cfg = Array.from({ length: COUNT }, (_, i) => ({ name: `P${i + 1}`, isHuman: false, aiDifficulty: 'basic' }));
  const off = runArm(GAMES, COUNT, cfg, 0);
  const on = runArm(GAMES, COUNT, cfg, END_TRIGGER_BONUS_VP);
  setEndTriggerBonus(END_TRIGGER_BONUS_VP);

  const row = (label, a, b, dp = 2, note = '') =>
    console.log(`  ${label.padEnd(26)}${a.toFixed(dp).padStart(9)}${b.toFixed(dp).padStart(11)}${(b - a).toFixed(dp).padStart(10)}   ${note}`);

  console.log(`=== ${COUNT} PLAYERS ===   (off n=${off.n}, on n=${on.n})`);
  console.log('                          CONTROL     +3 VP        delta');
  row('mean score', off.meanScore, on.meanScore);
  row('spread (winner-last)', off.spread, on.spread, 2, '<- lower is better');
  row('last as % of winner', off.ratio, on.ratio, 1, '<- higher is better');
  row('turns per game', off.turns, on.turns);
  console.log('');
  // THE HEADLINE. Read the CONTROL column: it is measured where the bonus does
  // not exist, so it cannot have moved anybody's rank. If rank 1 dominates, the
  // rule pays the leader.
  console.log('  WHO ARMS THE ENDING, by finishing rank (1 = the winner):');
  for (let r = 0; r < COUNT; r++) {
    console.log(`    rank ${r + 1}      control ${off.rankOfTrigger[r].toFixed(1).padStart(5)}%     live ${on.rankOfTrigger[r].toFixed(1).padStart(5)}%`
      + (r === 0 ? '   <- if this is near 100 the rule pays the leader' : ''));
  }
  console.log(`    even share would be ${(100 / COUNT).toFixed(1)}%`);
  console.log(`  trigger owner wins the game:  control ${off.triggerWinRate.toFixed(1)}%   live ${on.triggerWinRate.toFixed(1)}%`);
  console.log(`  nobody is paid ('marketTiles'):  ${on.nobodyPaid.toFixed(2)}% of games`);
  console.log(`  games the bonus flips:           ${on.flipped.toFixed(1)}%`);
  console.log(`  which SEAT arms it (live):       ${on.seatOfTrigger.map(s => s.toFixed(1) + '%').join(' / ')}`);
  const gap = Math.max(...off.seatWinShare.map((s, i) => Math.abs(s - on.seatWinShare[i])));
  console.log(`  largest seat-share gap between arms: ${gap.toFixed(1)} points (levels withheld - worklist section 4)`);
  const fmt = r => Object.entries(r.endReasons).map(([k, v]) => `${k} ${(100 * v / r.n).toFixed(1)}%`).join(', ');
  console.log(`  end reasons, live:  ${fmt(on)}\n`);
}
