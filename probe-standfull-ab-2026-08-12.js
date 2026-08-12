// A/B: WHAT DOES END CONDITION 3 ACTUALLY COST? (12 August)
//
// probe-standfull-end-2026-08-12.js answers "how often would it fire" by counting
// stand fills on an engine that did not yet have the rule. This one answers the
// question that decides whether the rule is affordable: with the ending LIVE, what
// happens to game length, to scores, and to the seat ladder?
//
//   A  CONTROL   setStandFullEndsGame(false) - the engine as it was on 11 August.
//   B  LIVE      the shipped rule.
//
// Same bots, same driver, same everything else. The toggle is the entire diff.
//
// WHAT TO LOOK FOR, in order of how much it would matter:
//
//   TURNS. The new ending can only fire EARLIER than the one it pre-empts, never
//   later, so the game gets shorter. The question is by how much and whether it
//   lands evenly. A small even shortening is fine; a large one would mean the game
//   is being cut off before its scoring lanes have paid out.
//
//   SCORE. Fewer turns is fewer tiles is fewer points. A drop concentrated on the
//   player who filled their stand would be perverse - they would be punished for
//   the achievement that ended the game - so the filling seat's score is reported
//   separately from the table's.
//
//   THE SEAT LADDER. Already out of band at 3 players and under investigation
//   (outstanding-changes-v7.md section 4). This probe cannot fix that, but it must
//   show the new ending does not make it worse.
//
// THE DRIVER IS arena.js's, DELIBERATELY, AND IT IS NOT THE ONE THE OLDER PROBES
// USE. Every probe file written before 10 August asks decideExtraTile at the
// PLACE step, because that is where the extra tile used to be bought. It moved to
// the spend step, canBuyExtraTile now refuses outside it, and decideExtraTile
// therefore returns null every single time - so those probes silently play a game
// in which nobody ever buys an extra tile, and they do it without throwing.
// Copying that block into this file cost a full measurement pass: it read
// 'standFull' at 10% of games against arena's 0.3-1.3%, purely because unbought
// extra tiles meant boards filled slower and games ran long. All five spends are
// driven here, each in its own uncapped loop, exactly as arena does it.
import {
  createGame, sweep, takeBonusTile, declineBonusTile, takeExtraTile, place, claim,
  skipClaim, skipSpend, moveTile, removePlate, dealCards, refill, calculateFinalScores,
  isStandFull, setStandFullEndsGame, STAND_FULL_ENDS_GAME,
} from './src/engine/game.js';
import { createStatsCollector } from './src/engine/statsCollector.js';
import * as bot from './src/bots/basicBot.js';

const GAMES = parseInt(process.argv[2] || '600', 10);

function runGame(playerCount, acc) {
  let s = createGame(
    Array.from({ length: playerCount }, (_, i) => ({ id: i, name: 'P' + i, type: 'ai' })),
    createStatsCollector(),
  );
  let steps = 0;

  while (!s.gameOver && steps < 2000) {
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
        s = place(s, bot.decidePlacements(s));
        break;
      }
      case 'spend': {
        // The iteration counts are runaway stops, not rules - no spend has a
        // per-turn allowance since 11 August, so each loop ends when the bot
        // declines or the engine's own gate closes.
        for (let n = 0; n < 25; n++) {
          const ex = bot.decideExtraTile ? bot.decideExtraTile(s) : null;
          if (ex === null || ex === undefined) break;
          s = takeExtraTile(s, ex.marketIndex, ex.boardIndex);
        }
        for (let n = 0; n < 25; n++) {
          const mv = bot.decideMove ? bot.decideMove(s) : null;
          if (!mv) break;
          s = moveTile(s, mv.fromIndex, mv.toIndex);
        }
        for (let n = 0; n < 25; n++) {
          const rp = bot.decideRemovePlate ? bot.decideRemovePlate(s) : null;
          if (rp === null || rp === undefined) break;
          s = removePlate(s, rp);
        }
        for (let n = 0; n < 10; n++) {
          if (!(bot.decideDealCards && bot.decideDealCards(s))) break;
          s = dealCards(s);
        }
        s = skipSpend(s);
        break;
      }
      case 'claim': {
        const d = bot.decideClaim(s);
        if (d && d.cardId) {
          try { s = claim(s, d.cardId, d.removedBoardIndex, d.destination); }
          catch (e) { s = skipClaim(s); }
        } else s = skipClaim(s);
        break;
      }
      case 'refill': s = refill(s); break;
      default: steps = 2000;
    }
    steps++;
  }

  calculateFinalScores(s);
  const scores = s.players.map(p => p.score);
  const best = Math.max(...scores);
  const winners = scores.filter(v => v === best).length;
  for (const p of s.players) {
    acc.scoreBySeat[p.id] += p.score;
    acc.winBySeat[p.id] += p.score === best ? 1 / winners : 0;
    acc.claims += p.claimedCards.length;
    acc.standTiles += p.stand.reduce((n, r) => n + r.tiles.length, 0);
    acc.seats++;
    // The filling seat's own score, isolated. A player must not be worse off for
    // having completed their stand.
    if (isStandFull(p)) { acc.fullStandScore += p.score; acc.fullStands++; }
  }
  acc.reasons[s.endGameReason || 'none'] = (acc.reasons[s.endGameReason || 'none'] || 0) + 1;
  acc.turns += s.stats.turnsPlayed;
  acc.games++;
}

function runArm(playerCount, live) {
  setStandFullEndsGame(live);
  const acc = {
    scoreBySeat: Array.from({ length: playerCount }, () => 0),
    winBySeat: Array.from({ length: playerCount }, () => 0),
    claims: 0, standTiles: 0, seats: 0, turns: 0, games: 0,
    fullStandScore: 0, fullStands: 0, reasons: {},
  };
  for (let g = 0; g < GAMES; g++) runGame(playerCount, acc);
  return acc;
}

const pct = (n, d) => (100 * n / (d || 1)).toFixed(1);
const mean = a => a.scoreBySeat.reduce((x, y) => x + y, 0) / a.seats;

function report(label, a, playerCount) {
  const ladder = a.winBySeat.map((w, i) => `s${i + 1} ${pct(w, a.games)}%`).join('  ');
  console.log(`  ${label}`);
  console.log(`     turns/game ${(a.turns / a.games).toFixed(2)}   mean score ${mean(a).toFixed(2)}   claims/seat ${(a.claims / a.seats).toFixed(2)}   stand tiles/seat ${(a.standTiles / a.seats).toFixed(2)}`);
  console.log(`     end reasons ${JSON.stringify(a.reasons)}`);
  console.log(`     seats finishing with a FULL stand: ${pct(a.fullStands, a.seats)}%, mean score ${a.fullStands ? (a.fullStandScore / a.fullStands).toFixed(2) : 'n/a'} (table ${mean(a).toFixed(2)})`);
  console.log(`     win share (even = ${(100 / playerCount).toFixed(1)}%): ${ladder}`);
}

console.log(`STAND_FULL_ENDS_GAME ships as ${STAND_FULL_ENDS_GAME}. Restored at the end of this run.`);

for (const pc of [2, 3, 4]) {
  console.log(`\n=== ${pc} PLAYERS - ${GAMES} games per arm ===`);
  const A = runArm(pc, false);
  const B = runArm(pc, true);
  report('A control (11 August engine)', A, pc);
  report('B live   (end condition 3)', B, pc);
  console.log(`  DELTA  turns ${((B.turns / B.games) - (A.turns / A.games)).toFixed(2)}   score ${(mean(B) - mean(A)).toFixed(2)} VP   claims/seat ${((B.claims / B.seats) - (A.claims / A.seats)).toFixed(2)}`);
}

setStandFullEndsGame(STAND_FULL_ENDS_GAME);
