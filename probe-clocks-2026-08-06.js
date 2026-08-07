// FROZEN 6 AUGUST 2026 - HISTORICAL RECORD, DO NOT MAINTAIN.
//
// This probe measured a CANDIDATE end condition against the rules as they stood
// BEFORE the new one was adopted, and several of the things it drives no longer
// exist: the shared empty-plate pool (gameState.cardsNeededToEnd), the endings
// 'cardMarket', 'bagEmpty' and 'boardOverflow', and isGameOver. It is kept as the
// record of what was measured and why the ruling went the way it did, NOT as a
// tool - it may well not run, and it must not be repaired into looking current.
// The design of record is the ENGINE (src/engine/game.js).
//
// ALTERNATIVE END-CONDITION PROBE (6 August).
//
// The Lopiano-lens review's step-3 finding is that the game's clock (the shared
// empty-plate pool) is denominated in the WINNER'S currency: a claim is the only
// scoring act and the only unit of the ending, so the leader spends the clock
// fastest and the trailing player has the game ended on them.
//
// This probe does not change any rule. It plays today's game and records, turn
// by turn, the value of every counter a DIFFERENT system could be denominated
// in, so a replacement clock can be calibrated to today's length rather than
// guessed at.
//
// Counters tracked per turn (table-wide unless stated):
//   freeCellsMin   - the fewest free cells any single player has left
//   freeCellsTotal - free cells summed across the table
//   pots           - pots of tea brewed so far (stats.refreshes.length)
//   rowLen         - cards sitting in the card market
//   claims         - claims made so far (today's clock, for reference)
//   standRowsMax   - most completed stand rows held by any one player
//   standRowsAll   - completed stand rows summed across the table
//   bagLeft        - tiles left in the bag
//
// For each candidate threshold it reports the TURN NUMBER at which the counter
// first crossed, expressed as turns-per-player so it is directly comparable with
// today's ~9. Games where a counter never crossed before today's ending are
// reported as censored - the counterfactual game would have run LONGER than
// today's, and this probe cannot say how much longer.
//
// Read-only with respect to the engine.
import { createGame, sweep, takeBonusTile, declineBonusTile, takeExtraTile, place, claim, skipClaim, skipSpend, moveTile, removePlate, reserveCard, refill, calculateFinalScores } from './src/engine/game.js';
import { createStatsCollector } from './src/engine/statsCollector.js';
import * as basicBot from './src/bots/basicBot.js';

const GAMES = Number(process.argv[2] || 1000);

function snapshot(gameState, claims) {
  let freeMin = Infinity, freeTotal = 0, standMax = 0, standAll = 0;
  for (const p of gameState.players) {
    const free = p.board.filter(c => c === null).length;
    if (free < freeMin) freeMin = free;
    freeTotal += free;
    const rows = p.stand.filter(r => r.tiles.length >= r.capacity).length;
    if (rows > standMax) standMax = rows;
    standAll += rows;
  }
  return {
    turn: gameState.stats.turnsPlayed,
    freeCellsMin: freeMin,
    freeCellsTotal: freeTotal,
    pots: gameState.statsCollector ? gameState.statsCollector.refreshes.length : 0,
    rowLen: gameState.cardMarket.length,
    claims,
    standRowsMax: standMax,
    standRowsAll: standAll,
    bagLeft: gameState.bag.length,
  };
}

function runGame(playerCount) {
  const configs = Array.from({ length: playerCount }, (_, i) => ({ name: `P${i + 1}` }));
  const strategy = basicBot;
  let gameState = createGame(configs, createStatsCollector());
  const trace = [];
  let claims = 0;
  let lastTurn = -1;
  let steps = 0;

  while (!gameState.gameOver && steps < 6000) {
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
        if (extra !== null && extra !== undefined) gameState = takeExtraTile(gameState, extra);
        gameState = place(gameState, strategy.decidePlacements(gameState));
        break;
      }
      case 'spend': {
        const m = strategy.decideMove ? strategy.decideMove(gameState) : null;
        if (m) gameState = moveTile(gameState, m.fromIndex, m.toIndex);
        const rp = strategy.decideRemovePlate ? strategy.decideRemovePlate(gameState) : null;
        if (rp !== null && rp !== undefined) gameState = removePlate(gameState, rp);
        const rc = strategy.decideReserve ? strategy.decideReserve(gameState) : null;
        if (rc !== null && rc !== undefined) gameState = reserveCard(gameState, rc);
        gameState = skipSpend(gameState);
        break;
      }
      case 'claim': {
        const c = strategy.decideClaim(gameState);
        if (c) {
          try { gameState = claim(gameState, c.cardId, c.removedBoardIndex, c.destination); claims++; }
          catch (e) { gameState = skipClaim(gameState); }
        } else {
          gameState = skipClaim(gameState);
        }
        break;
      }
      case 'refill': gameState = refill(gameState); break;
      default: throw new Error(`unknown phase ${gameState.gamePhase}`);
    }
    // Sample once per completed turn, at the first step after the turn counter
    // moves - i.e. the state a rules-level end check would read.
    if (gameState.stats.turnsPlayed !== lastTurn) {
      lastTurn = gameState.stats.turnsPlayed;
      trace.push(snapshot(gameState, claims));
    }
    steps++;
  }
  calculateFinalScores(gameState);
  trace.push(snapshot(gameState, claims));
  return { gameState, trace, claims };
}

// First turn at which pred(sample) is true, or null if it never was.
function firstCross(trace, pred) {
  for (const s of trace) if (pred(s)) return s.turn;
  return null;
}

// A trigger fired on turn t finishes the round, so the game ends on the last turn
// of that round. Turns-per-player of a game triggered at turn t (1-indexed turns).
function lengthAfterTrigger(turn, playerCount) {
  return Math.ceil(turn / playerCount);
}

const CANDIDATES = [
  // label, predicate factory
  { key: 'board<=0',  label: 'any player has 0 free cells',        pred: s => s.freeCellsMin <= 0 },
  { key: 'board<=2',  label: 'any player has <=2 free cells',      pred: s => s.freeCellsMin <= 2 },
  { key: 'board<=4',  label: 'any player has <=4 free cells',      pred: s => s.freeCellsMin <= 4 },
  { key: 'board<=6',  label: 'any player has <=6 free cells',      pred: s => s.freeCellsMin <= 6 },
  { key: 'board<=8',  label: 'any player has <=8 free cells',      pred: s => s.freeCellsMin <= 8 },
  { key: 'pots>=3',   label: '3rd pot of tea poured',              pred: s => s.pots >= 3 },
  { key: 'pots>=4',   label: '4th pot of tea poured',              pred: s => s.pots >= 4 },
  { key: 'pots>=5',   label: '5th pot of tea poured',              pred: s => s.pots >= 5 },
  { key: 'pots>=6',   label: '6th pot of tea poured',              pred: s => s.pots >= 6 },
  { key: 'pots>=7',   label: '7th pot of tea poured',              pred: s => s.pots >= 7 },
  { key: 'pots>=8',   label: '8th pot of tea poured',              pred: s => s.pots >= 8 },
  { key: 'stand>=2',  label: 'any player completes 2 stand rows',  pred: s => s.standRowsMax >= 2 },
  { key: 'stand>=3',  label: 'any player completes 3 stand rows',  pred: s => s.standRowsMax >= 3 },
  { key: 'standAll>=4', label: 'table completes 4 stand rows',     pred: s => s.standRowsAll >= 4 },
  { key: 'standAll>=6', label: 'table completes 6 stand rows',     pred: s => s.standRowsAll >= 6 },
  { key: 'row>=8',    label: 'card row reaches 8 (today\'s cap)',  pred: s => s.rowLen >= 8 },
  { key: 'bag<=25',   label: 'bag down to 25 tiles',               pred: s => s.bagLeft <= 25 },
  { key: 'bag<=10',   label: 'bag down to 10 tiles',               pred: s => s.bagLeft <= 10 },
];

console.log(`ALTERNATIVE CLOCK CALIBRATION - ${GAMES} games per player count, basicBot`);
console.log('Baseline = today\'s game, ended by the live rules. "would end at" is the');
console.log('turns-per-player a candidate clock would have produced, measured on the');
console.log('same games; "censored" = never crossed before today\'s ending, so the');
console.log('true figure is HIGHER than shown and the mean below is a lower bound.\n');

for (const playerCount of [2, 3, 4]) {
  let turnsTotal = 0, claimsTotal = 0, potsTotal = 0, freeMinTotal = 0, standMaxTotal = 0, standAllTotal = 0, bagTotal = 0, rowMaxTotal = 0, tilesTakenTotal = 0;
  const lengths = [];
  const results = new Map(CANDIDATES.map(c => [c.key, { crossed: 0, lenSum: 0, censored: 0 }]));

  for (let g = 0; g < GAMES; g++) {
    const { gameState, trace, claims } = runGame(playerCount);
    const last = trace[trace.length - 1];
    turnsTotal += last.turn / playerCount;
    lengths.push(last.turn / playerCount);
    // Every tile ever drawn to a board still occupies its cell - a claim converts
    // the tile to a plate on the same cell and nothing frees one in practice - so
    // occupied cells IS the table's draw from the bag.
    tilesTakenTotal += 25 * playerCount - last.freeCellsTotal;
    claimsTotal += claims;
    potsTotal += last.pots;
    freeMinTotal += last.freeCellsMin;
    standMaxTotal += last.standRowsMax;
    standAllTotal += last.standRowsAll;
    bagTotal += last.bagLeft;
    rowMaxTotal += Math.max(...trace.map(s => s.rowLen));

    for (const c of CANDIDATES) {
      const turn = firstCross(trace, c.pred);
      const r = results.get(c.key);
      if (turn === null) r.censored++;
      else { r.crossed++; r.lenSum += lengthAfterTrigger(turn, playerCount); }
    }
  }

  const meanLen = turnsTotal / GAMES;
  const sd = Math.sqrt(lengths.reduce((s, l) => s + (l - meanLen) ** 2, 0) / lengths.length);
  const sorted = [...lengths].sort((a, b) => a - b);
  console.log(`=== ${playerCount} PLAYERS ===`);
  console.log(`  baseline length ${meanLen.toFixed(2)} turns/player   sd ${sd.toFixed(2)}   range ${sorted[0].toFixed(1)}-${sorted[sorted.length - 1].toFixed(1)}   claims ${(claimsTotal / GAMES).toFixed(1)}   pots of tea ${(potsTotal / GAMES).toFixed(2)}`);
  console.log(`  tiles taken from the bag onto boards, table-wide: ${(tilesTakenTotal / GAMES).toFixed(1)} (${(tilesTakenTotal / GAMES / playerCount).toFixed(1)} per player)`);
  console.log(`  at the end: fewest free cells on a board ${(freeMinTotal / GAMES).toFixed(2)}   best stand ${(standMaxTotal / GAMES).toFixed(2)} rows   table stand rows ${(standAllTotal / GAMES).toFixed(2)}   bag ${(bagTotal / GAMES).toFixed(1)}   longest card row ${(rowMaxTotal / GAMES).toFixed(1)}`);
  for (const c of CANDIDATES) {
    const r = results.get(c.key);
    const mean = r.crossed ? (r.lenSum / r.crossed).toFixed(2) : '  -  ';
    const pct = (100 * r.crossed / GAMES).toFixed(1);
    console.log(`    ${c.label.padEnd(36)} would end at ${String(mean).padStart(5)} turns/player   fired in ${pct.padStart(5)}% of games   censored ${(100 - Number(pct)).toFixed(1)}%`);
  }
  console.log('');
}
