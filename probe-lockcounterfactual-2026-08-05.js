// WAS THAT LOCK REAL? - the counterfactual behind the 31% card-lock figure.
//
// WHY THIS EXISTS. Dean's table experience is the opposite of the simulation's:
// human players claim a card most turns, and clever play with the extra-tile and
// reserve spends should very nearly guarantee one. The harness reports basicBot
// reaching its claim step with nothing claimable on 31-32% of claim steps, and at
// 4 players on 43.3% of the last-placed player's. Those cannot both be right
// about the same game.
//
// The metric cannot tell the difference between:
//   (a) a POSITION with no claim in it - the board and the row genuinely did not
//       line up, which is a fact about the design; and
//   (b) a BOT that swept the wrong line - a fact about basicBot and nothing else.
//
// This separates them. Every time the bot ends a turn without claiming, the turn
// is replayed from the sweep step against EVERY legal sweep, and we ask whether
// any of them would have produced a claimable card. Three outcomes:
//
//   UNAVOIDABLE - no sweep on the board could have produced a claim. A real
//                 property of the position.
//   BOT ERROR   - some other sweep would have. The bot picked wrong.
//   + EXTRA TILE- of the unavoidable ones, how many an affordable extra tile
//                 (2 cupcakes, from anywhere on the market) would have rescued.
//
// The replay uses basicBot's own placement heuristic, which is explicitly
// completion-aware (buildPlacementDemand pays weight x2 for finishing a pattern),
// so this is a fair test of the SWEEP choice specifically. It is a LOWER BOUND on
// what a perfect player could do: a human also chooses placements, plans a turn
// ahead, and banks cupcakes for exactly this - none of which is modelled here.
//
//   node probe-lockcounterfactual-2026-08-05.js [games] [players]
//
// Expensive: it replays every locked turn against every legal sweep, so a few
// hundred games is the right order, not thousands.
import {
  createGame, sweep, takeBonusTile, declineBonusTile, takeExtraTile, place, claim,
  skipClaim, skipSpend, moveTile, removePlate, reserveCard, refill,
  calculateFinalScores, getValidSweeps, EXTRA_TILE_CUPCAKE_COST,
} from './src/engine/game.js';
import { createStatsCollector } from './src/engine/statsCollector.js';
import * as basicBot from './src/bots/basicBot.js';

// Deep enough for a one-turn replay: everything the sweep, placement, spend and
// claim steps write to. Deliberately a copy of mctsBot's cloneState rather than a
// call to it, because that one is private to the search and this probe must not
// silently follow it if it changes for search reasons.
function cloneState(state) {
  return {
    ...state,
    players: state.players.map(p => ({
      ...p,
      board: [...p.board],
      stand: p.stand.map(r => ({ ...r, tiles: [...r.tiles] })),
      crumbTray: [...p.crumbTray],
      claimedCards: [...p.claimedCards],
      reservedCards: [...p.reservedCards],
      tastingMenus: [...p.tastingMenus],
    })),
    tastingMenus: state.tastingMenus.map(m => ({ ...m })),
    market: [...state.market],
    bag: [...state.bag],
    gameDeck: [...state.gameDeck],
    cardMarket: [...state.cardMarket],
    cardDiscard: [...state.cardDiscard],
    pendingSweepTiles: [...state.pendingSweepTiles],
    stats: { ...state.stats },
    statsCollector: null,   // a replay is imaginary and must never be logged
  };
}

// Play one turn forward from a sweep-phase state using the given sweep, then
// report whether the claim step found anything. `extraIndex` optionally buys the
// extra tile from that market cell first.
function turnYieldsClaim(atSweep, chosenSweep, extraIndex = null) {
  let s = cloneState(atSweep);
  try {
    s = sweep(s, chosenSweep.rowOrCol, chosenSweep.isRow, chosenSweep.declaration, chosenSweep.declarationType);
    if (extraIndex !== null) {
      if (!s.market[extraIndex]) return false;
      s = takeExtraTile(s, extraIndex);
    }
    s = place(s, basicBot.decidePlacements(s));
    s = skipSpend(s);
    if (s.gamePhase !== 'claim') return false;
    const d = basicBot.decideClaim(s);
    return !!(d && d.cardId);
  } catch {
    // An illegal line for this position is not a counterfactual, just a dead end.
    return false;
  }
}

function runGame(playerConfigs) {
  let gameState = createGame(playerConfigs, createStatsCollector());
  const n = playerConfigs.length;
  const tally = Array.from({ length: n }, () => ({
    claimSteps: 0, locked: 0, unavoidable: 0, botError: 0, rescuedByExtraTile: 0,
  }));
  // The state as it stood at the START of the current turn's sweep step, kept so
  // a locked claim can be replayed against the alternatives.
  let atSweep = null;
  let sweepsThisTurn = null;
  let steps = 0;

  while (!gameState.gameOver && steps < 1000) {
    const me = gameState.currentPlayerIndex;
    switch (gameState.gamePhase) {
      case 'sweep': {
        if (gameState.bonusTileAvailable) {
          const b = basicBot.decideBonusTile ? basicBot.decideBonusTile(gameState) : null;
          gameState = (b !== null && b !== undefined && gameState.market[b])
            ? takeBonusTile(gameState, b) : declineBonusTile(gameState);
          break;
        }
        atSweep = cloneState(gameState);
        sweepsThisTurn = getValidSweeps(gameState);
        const d = basicBot.decideSweep(gameState);
        if (d) gameState = sweep(gameState, d.rowOrCol, d.isRow, d.declaration, d.declarationType);
        else gameState.gamePhase = 'place';
        break;
      }
      case 'place': {
        const extra = basicBot.decideExtraTile ? basicBot.decideExtraTile(gameState) : null;
        if (extra !== null && extra !== undefined) gameState = takeExtraTile(gameState, extra);
        gameState = place(gameState, basicBot.decidePlacements(gameState));
        break;
      }
      case 'spend': {
        const m = basicBot.decideMove ? basicBot.decideMove(gameState) : null;
        if (m) gameState = moveTile(gameState, m.fromIndex, m.toIndex);
        const rp = basicBot.decideRemovePlate ? basicBot.decideRemovePlate(gameState) : null;
        if (rp !== null && rp !== undefined) gameState = removePlate(gameState, rp);
        const rc = basicBot.decideReserve ? basicBot.decideReserve(gameState) : null;
        if (rc !== null && rc !== undefined) gameState = reserveCard(gameState, rc);
        gameState = skipSpend(gameState);
        break;
      }
      case 'claim': {
        tally[me].claimSteps++;
        const d = basicBot.decideClaim(gameState);
        if (d && d.cardId) {
          gameState = claim(gameState, d.cardId, d.removedBoardIndex, d.destination);
        } else {
          tally[me].locked++;
          // THE COUNTERFACTUAL. Could any other sweep have produced a claim?
          let rescued = false;
          if (atSweep && sweepsThisTurn) {
            for (const cand of sweepsThisTurn) {
              if (turnYieldsClaim(atSweep, cand)) { rescued = true; break; }
            }
          }
          if (rescued) {
            tally[me].botError++;
          } else {
            tally[me].unavoidable++;
            // Of the genuinely unavoidable ones, would an affordable extra tile
            // have rescued it? Try the bot's own best sweep plus each market cell.
            const player = atSweep ? atSweep.players[me] : null;
            if (player && player.cupcakes >= EXTRA_TILE_CUPCAKE_COST && sweepsThisTurn?.length) {
              const best = basicBot.decideSweep(cloneState(atSweep));
              if (best) {
                for (let cell = 0; cell < atSweep.market.length; cell++) {
                  if (!atSweep.market[cell]) continue;
                  if (turnYieldsClaim(atSweep, best, cell)) { tally[me].rescuedByExtraTile++; break; }
                }
              }
            }
          }
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

  const order = gameState.players.map((p, i) => ({ i, score: p.score })).sort((a, b) => b.score - a.score);
  return order.map((o, rank) => ({ rank, ...tally[o.i] }));
}

const GAMES = parseInt(process.argv[2]) || 300;
const COUNT = parseInt(process.argv[3]) || 4;
const cfg = Array.from({ length: COUNT }, (_, i) => ({ id: i, name: `P${i}`, type: 'ai' }));

const FIELDS = ['claimSteps', 'locked', 'unavoidable', 'botError', 'rescuedByExtraTile'];
const buckets = Array.from({ length: COUNT }, () => {
  const b = {}; for (const k of FIELDS) b[k] = 0; return b;
});
for (let g = 0; g < GAMES; g++) {
  for (const r of runGame(cfg)) for (const k of FIELDS) buckets[r.rank][k] += r[k];
}

const tot = {}; for (const k of FIELDS) tot[k] = buckets.reduce((a, b) => a + b[k], 0);

console.log(`\nWAS THAT LOCK REAL? - ${GAMES} games at ${COUNT} players (basicBot)\n`);
console.log('Every turn the bot ended without claiming is replayed against EVERY legal sweep,');
console.log('using the bot\'s own completion-aware placement heuristic.\n');
console.log(`Claim steps:                      ${tot.claimSteps}`);
console.log(`Locked (bot did not claim):       ${tot.locked}  (${(100 * tot.locked / tot.claimSteps).toFixed(1)}% of claim steps)`);
console.log(`  of which BOT ERROR:             ${tot.botError}  (${(100 * tot.botError / Math.max(1, tot.locked)).toFixed(1)}% of locks) - another sweep WOULD have claimed`);
console.log(`  of which UNAVOIDABLE:           ${tot.unavoidable}  (${(100 * tot.unavoidable / Math.max(1, tot.locked)).toFixed(1)}% of locks) - no sweep on the board could`);
console.log(`    ...of those, an affordable extra tile rescues: ${tot.rescuedByExtraTile} (${(100 * tot.rescuedByExtraTile / Math.max(1, tot.unavoidable)).toFixed(1)}% of unavoidable)\n`);
const trueLock = tot.unavoidable - tot.rescuedByExtraTile;
console.log(`TRUE LOCK RATE (no sweep, and no affordable extra tile, could claim):`);
console.log(`  ${trueLock}/${tot.claimSteps} = ${(100 * trueLock / tot.claimSteps).toFixed(1)}% of claim steps`);
console.log(`  against the harness's reported ${(100 * tot.locked / tot.claimSteps).toFixed(1)}%\n`);

console.log('BY FINISHING RANK (rank 1 is the winner):');
console.log('  rank | claim steps | locked | locked% | bot error% | true lock%');
for (let r = 0; r < COUNT; r++) {
  const b = buckets[r];
  const tl = b.unavoidable - b.rescuedByExtraTile;
  console.log(
    `    ${r + 1}  | ${String(b.claimSteps).padStart(11)} | ${String(b.locked).padStart(6)} | ${(100 * b.locked / Math.max(1, b.claimSteps)).toFixed(1).padStart(6)}% | ${(100 * b.botError / Math.max(1, b.locked)).toFixed(1).padStart(9)}% | ${(100 * tl / Math.max(1, b.claimSteps)).toFixed(1).padStart(9)}%`,
  );
}
console.log('\nCAVEAT: a LOWER BOUND on avoidability. The replay varies the SWEEP only - it uses');
console.log('one placement heuristic, plans no turns ahead, and does not bank cupcakes for a');
console.log('lock it can see coming. A human does all three, so the true bot-error share is higher.');
