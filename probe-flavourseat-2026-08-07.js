// IS THE FLAVOUR OF THE DAY CAUSING THE SEAT BIAS, AND IS A CUPCAKE THE RIGHT
// INSTRUMENT FOR IT?
//
// THE SITUATION. Worst seat deviation read +3.9 / +5.1 / +4.9 at 2/3/4 players on
// 7 August, against roughly +2.7 / +4.3 / +2.2 before the Flavour of the Day
// landed. The project's own band is about +/-3, so 3 and 4 players are outside it
// and 2 is on the line.
//
// THE HYPOTHESIS. The Flavour is SHARED, so the tile market is contested for one
// ingredient, and the earlier seat picks over a fuller market every round. That is
// the same mechanism that condemned the Teapot Track on 4 August.
//
// WHY THIS MATTERS BEFORE ANY TUNING. The project has already retuned the starting
// cupcakes twice and overshot once (2/2/3 at three players put seat 3 at +4.8, and
// the note in game.js records that one cupcake is a COARSER instrument than the
// residual it was meant to correct). So the question is not only "how big is the
// bias" but "is it the shape a starting cupcake can fix at all":
//
//   A ONE-OFF grant can correct a ONE-OFF advantage.
//   A PER-ROUND advantage compounds over ~9 rounds and a single cupcake cannot
//   touch it - it would need a per-round compensation, or a change to the rule.
//
// So this reports the bias BY ROUND as well as in total. If seat 1's Flavour lead
// is established in round 1 and then flat, a starting cupcake is the right tool.
// If it grows every round, it is not, and the fix has to be in the module.
//
//   node probe-flavourseat-2026-08-07.js [games] [playerCounts]
//
// Uses the engine's own setFlavourEnabled seam and restores it in a finally block.
import {
  createGame, sweep, takeBonusTile, declineBonusTile, takeExtraTile, place, claim,
  skipClaim, skipSpend, moveTile, removePlate, reserveCard, refill,
  calculateFinalScores, getFlavourCount, getFlavourLeaders, isFlavourInPlay,
  getFlavourEnabled, setFlavourEnabled, countBoardIngredient,
} from './src/engine/game.js';
import { createStatsCollector } from './src/engine/statsCollector.js';
import * as basicBot from './src/bots/basicBot.js';

// Snapshot Flavour tiles per seat at the end of each ROUND, so the lead can be
// watched opening (or not).
const ROUNDS_TRACKED = 8;

function runGame(cfg, trackFlavour) {
  const COUNT = cfg.length;
  let gs = createGame(cfg, createStatsCollector());
  let steps = 0;
  const byRound = Array.from({ length: ROUNDS_TRACKED }, () => new Array(COUNT).fill(0));
  let lastRound = -1;

  while (!gs.gameOver && steps < 1000) {
    // A round boundary is when the turn returns to seat 0.
    if (trackFlavour && gs.gamePhase === 'sweep' && gs.currentPlayerIndex === 0) {
      const round = Math.floor(gs.stats.turnsPlayed / COUNT);
      if (round !== lastRound && round < ROUNDS_TRACKED) {
        lastRound = round;
        for (let i = 0; i < COUNT; i++) {
          byRound[round][i] = isFlavourInPlay(gs) ? getFlavourCount(gs, gs.players[i]) : 0;
        }
      }
    }
    switch (gs.gamePhase) {
      case 'sweep': {
        if (gs.bonusTileAvailable) {
          const b = basicBot.decideBonusTile ? basicBot.decideBonusTile(gs) : null;
          gs = (b !== null && b !== undefined && gs.market[b]) ? takeBonusTile(gs, b) : declineBonusTile(gs);
          break;
        }
        const d = basicBot.decideSweep(gs);
        if (d) gs = sweep(gs, d.rowOrCol, d.isRow, d.declaration, d.declarationType);
        else gs.gamePhase = 'place';
        break;
      }
      case 'place': {
        const e = basicBot.decideExtraTile ? basicBot.decideExtraTile(gs) : null;
        if (e !== null && e !== undefined) gs = takeExtraTile(gs, e);
        gs = place(gs, basicBot.decidePlacements(gs));
        break;
      }
      case 'spend': {
        const m = basicBot.decideMove ? basicBot.decideMove(gs) : null;
        if (m) gs = moveTile(gs, m.fromIndex, m.toIndex);
        const rp = basicBot.decideRemovePlate ? basicBot.decideRemovePlate(gs) : null;
        if (rp !== null && rp !== undefined) gs = removePlate(gs, rp);
        const rc = basicBot.decideReserve ? basicBot.decideReserve(gs) : null;
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
      case 'refill': gs = refill(gs); break;
    }
    steps++;
  }
  if (gs.gameOver) calculateFinalScores(gs);

  const scores = gs.players.map(p => p.score);
  const top = Math.max(...scores);
  const winners = gs.players.filter(p => p.score === top).length;
  const leaders = new Set(getFlavourLeaders(gs));
  return {
    scores,
    winShare: scores.map(s => (s === top ? 1 / winners : 0)),
    flavourTiles: gs.players.map(p => (isFlavourInPlay(gs) ? getFlavourCount(gs, p) : 0)),
    majority: gs.players.map(p => (leaders.has(p.id) ? 1 : 0)),
    byRound,
  };
}

function runArm(GAMES, COUNT, trackFlavour) {
  const cfg = Array.from({ length: COUNT }, (_, i) => ({ id: i, name: `P${i}`, type: 'ai' }));
  const win = new Array(COUNT).fill(0);
  const score = new Array(COUNT).fill(0);
  const tiles = new Array(COUNT).fill(0);
  const maj = new Array(COUNT).fill(0);
  const rounds = Array.from({ length: ROUNDS_TRACKED }, () => new Array(COUNT).fill(0));
  for (let n = 0; n < GAMES; n++) {
    const r = runGame(cfg, trackFlavour);
    for (let i = 0; i < COUNT; i++) {
      win[i] += r.winShare[i]; score[i] += r.scores[i];
      tiles[i] += r.flavourTiles[i]; maj[i] += r.majority[i];
      for (let k = 0; k < ROUNDS_TRACKED; k++) rounds[k][i] += r.byRound[k][i];
    }
  }
  const even = 100 / COUNT;
  return {
    dev: win.map(w => 100 * w / GAMES - even),
    score: score.map(s => s / GAMES),
    tiles: tiles.map(t => t / GAMES),
    maj: maj.map(m => 100 * m / GAMES),
    rounds: rounds.map(r => r.map(v => v / GAMES)),
  };
}

const GAMES = parseInt(process.argv[2]) || 3000;
const COUNTS = (process.argv[3] || '2,3,4').split(',').map(Number);
const was = getFlavourEnabled();

try {
  console.log(`\nDOES THE FLAVOUR OF THE DAY CAUSE THE SEAT BIAS? - ${GAMES} games per arm (basicBot)\n`);
  for (const COUNT of COUNTS) {
    setFlavourEnabled(false);
    const off = runArm(GAMES, COUNT, false);
    setFlavourEnabled(true);
    const on = runArm(GAMES, COUNT, true);

    console.log(`=== ${COUNT} PLAYERS ===`);
    console.log('  Win-share deviation from an even split:');
    console.log('   seat | flavour OFF | flavour ON |  delta');
    for (let i = 0; i < COUNT; i++) {
      console.log(`     ${i + 1}  | ${off.dev[i].toFixed(1).padStart(11)} | ${on.dev[i].toFixed(1).padStart(10)} | ${(on.dev[i] - off.dev[i]).toFixed(1).padStart(6)}`);
    }
    console.log('  Flavour tiles held at game end, and share of games taking the majority:');
    console.log('   seat | tiles | majority%');
    for (let i = 0; i < COUNT; i++) {
      console.log(`     ${i + 1}  | ${on.tiles[i].toFixed(2).padStart(5)} | ${on.maj[i].toFixed(1).padStart(8)}%`);
    }
    console.log('  FLAVOUR TILES BY SEAT, ROUND BY ROUND - the shape that decides the fix:');
    console.log('   round | ' + Array.from({ length: COUNT }, (_, i) => `seat ${i + 1}`.padStart(7)).join(' | ') + ' | seat1 - last');
    for (let k = 1; k < ROUNDS_TRACKED; k++) {
      const row = on.rounds[k];
      if (row.every(v => v === 0)) continue;
      const gap = row[0] - row[COUNT - 1];
      console.log(`     ${String(k).padStart(3)}  | ${row.map(v => v.toFixed(2).padStart(7)).join(' | ')} | ${gap.toFixed(2).padStart(11)}`);
    }
    console.log('  <- A GAP THAT IS SET IN ROUND 1 AND THEN FLAT is a one-off advantage, and a');
    console.log('     starting cupcake is the right instrument. A GAP THAT GROWS EVERY ROUND is a');
    console.log('     per-round advantage; no one-off grant can correct it and the fix must be in');
    console.log('     the module itself.\n');
  }
} finally {
  setFlavourEnabled(was);
}
