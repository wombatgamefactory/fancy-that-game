// TEMPORARY calibration probe (step 6). Delete when done.
//   node probe.js <games> <playerCount>
// Collects, from real basicBot games:
//   A. the SCALE of the sweep heuristic (so the new tea constants can be set in
//      the same units), and how a fresh 25-tile market compares to the live one.
//   B. reserve completion rate BUCKETED BY minMissing at the moment of reserving,
//      which is the evidence for or against "the bot reserves cards it cannot
//      realistically complete".
import { createGame, sweep, takeBonusTile, declineBonusTile, place, claim, skipClaim, skipMove, moveTile, refill, teaReserve, teaReserveMustPass, calculateFinalScores, getValidSweeps, getPatternWindows, getVisibleCupcakeSymbols, CUPCAKE_SYMBOL_CELLS } from './src/engine/game.js';
import { COLOURS, INGREDIENTS } from './src/engine/tiles.js';
import * as basicBot from './src/bots/basicBot.js';

const CLAIM_EXTRA = 2;

function buildColourDemand(board, cardMarket) {
  const demand = {};
  for (const card of cardMarket) {
    const weight = (card.vp || 0) + CLAIM_EXTRA;
    for (const win of getPatternWindows(board, card.pattern)) {
      if (win.missing.length === 0) continue;
      const progress = (win.matched + 1) / win.need;
      const value = (weight * progress * progress) / win.missing.length;
      for (const miss of win.missing) demand[miss.colour] = (demand[miss.colour] || 0) + value;
    }
  }
  return demand;
}

function getSweptTiles(market, s, size) {
  const out = [];
  const idxs = [];
  if (s.isRow) for (let i = 0; i < size; i++) idxs.push(s.rowOrCol * size + i);
  else for (let r = 0; r < size; r++) idxs.push(r * size + s.rowOrCol);
  for (const i of idxs) {
    const t = market[i];
    if (!t) continue;
    const m = s.declarationType === 'colour' ? t.colour === s.declaration : t.ingredient === s.declaration;
    if (m) out.push(t);
  }
  return out;
}

function bestSweepScore(market, size, colourValue, wanted) {
  const sweeps = getValidSweeps({ market, marketSize: size });
  let best = 0;
  for (const s of sweeps) {
    const tiles = getSweptTiles(market, s, size);
    const seen = {};
    let score = 0;
    for (const t of tiles) {
      const copies = (seen[t.colour] = (seen[t.colour] || 0) + 1);
      score += (colourValue[t.colour] || 0) * (copies === 1 ? 1 : 0.4);
      if (wanted.has(t.ingredient)) score += 1;
    }
    score += tiles.length * 0.1;
    if (score > best) best = score;
  }
  return best;
}

function wantedIngredients(player) {
  const s = new Set();
  for (const row of player.stand) if (row.ingredient !== null && row.tiles.length < row.capacity) s.add(row.ingredient);
  return s;
}

function randomMarket(n, size) {
  const cells = size * size;
  const m = new Array(cells).fill(null);
  const order = [];
  for (let i = 0; i < cells; i++) order.push(i);
  for (let i = order.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [order[i], order[j]] = [order[j], order[i]]; }
  for (let i = 0; i < n; i++) {
    m[order[i]] = { colour: COLOURS[(Math.random() * 5) | 0], ingredient: INGREDIENTS[(Math.random() * 5) | 0] };
  }
  return m;
}

function minMissingForCard(board, card) {
  let best = Infinity;
  for (const w of getPatternWindows(board, card.pattern)) if (w.missing.length < best) best = w.missing.length;
  return best;
}

const games = parseInt(process.argv[2]) || 40;
const playerCount = parseInt(process.argv[3]) || 3;

const sweepScores = [];        // best sweep score at every turn start
const reserveRows = [];        // { game, playerId, mm, vp, cardId }
const results = [];

for (let g = 0; g < games; g++) {
  const playerConfigs = Array.from({ length: playerCount }, (_, i) => ({ name: `Bot ${i + 1}`, aiDifficulty: 'basic', isHuman: false }));
  let gameState = createGame(playerConfigs, null);
  const myReserves = [];
  let steps = 0;
  let lastTurnSampled = -1;
  while (!gameState.gameOver && steps < 2000) {
    switch (gameState.gamePhase) {
      case 'sweep': {
        if (gameState.bonusTileAvailable) {
          const b = basicBot.decideBonusTile(gameState);
          if (b !== null && gameState.market[b]) gameState = takeBonusTile(gameState, b);
          else gameState = declineBonusTile(gameState);
          break;
        }
        // Turn-start sample (once per turn).
        if (gameState.stats.turnsPlayed !== lastTurnSampled) {
          lastTurnSampled = gameState.stats.turnsPlayed;
          const me = gameState.players[gameState.currentPlayerIndex];
          const dem = buildColourDemand(me.board, gameState.cardMarket);
          const want = wantedIngredients(me);
          const cur = bestSweepScore(gameState.market, gameState.marketSize, dem, want);
          sweepScores.push(cur);
        }
        const d = basicBot.decideSweep(gameState);
        if (d) gameState = sweep(gameState, d.rowOrCol, d.isRow, d.declaration, d.declarationType);
        else gameState.gamePhase = 'place';
        break;
      }
      case 'teaReserve': {
        const ri = gameState.teaReserverIndex;
        let cardId = null;
        if (!teaReserveMustPass(gameState)) cardId = basicBot.decideTeaReserve(gameState, ri);
        if (cardId !== null && cardId !== undefined) {
          const card = gameState.cardMarket.find(c => c.id === cardId);
          myReserves.push({ playerId: ri, mm: minMissingForCard(gameState.players[ri].board, card), vp: card.vp, cardId, turn: gameState.stats.turnsPlayed });
        }
        gameState = teaReserve(gameState, cardId);
        break;
      }
      case 'place': gameState = place(gameState, basicBot.decidePlacements(gameState)); break;
      case 'move': {
        const mv = basicBot.decideMove(gameState);
        if (mv) gameState = moveTile(gameState, mv.fromIndex, mv.toIndex);
        gameState = skipMove(gameState);
        break;
      }
      case 'claim': {
        const d = basicBot.decideClaim(gameState);
        if (d && d.cardId) gameState = claim(gameState, d.cardId, d.removedBoardIndex, d.destination);
        else gameState = skipClaim(gameState);
        break;
      }
      case 'refill': gameState = refill(gameState); break;
    }
    steps++;
  }
  if (gameState.gameOver) calculateFinalScores(gameState);
  for (const r of myReserves) {
    reserveRows.push({ ...r, completed: gameState.players[r.playerId].claimedCards.includes(r.cardId), turns: gameState.stats.turnsPlayed });
  }
  results.push(gameState);
}

const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const mean = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

console.log(`\n--- A. SWEEP SCORE SCALE (${sweepScores.length} turn starts, ${games} games @ ${playerCount}p) ---`);
console.log(`best-sweep score: mean=${mean(sweepScores).toFixed(2)} p10=${q(sweepScores, 0.10).toFixed(2)} p25=${q(sweepScores, 0.25).toFixed(2)} p50=${q(sweepScores, 0.5).toFixed(2)} p75=${q(sweepScores, 0.75).toFixed(2)} p90=${q(sweepScores, 0.9).toFixed(2)} max=${Math.max(...sweepScores).toFixed(2)}`);

// A2 (fresh-market swap value) is RETIRED. It existed to calibrate the constants
// of the old voluntary order-tea decision; the 1 August rule change deletes that
// decision, so there is nothing left to calibrate.

console.log(`\n--- B. RESERVE COMPLETION BY minMissing AT RESERVE TIME (${reserveRows.length} reserves) ---`);
for (let mm = 0; mm <= 5; mm++) {
  const rows = reserveRows.filter(r => r.mm === mm);
  if (!rows.length) continue;
  const done = rows.filter(r => r.completed).length;
  console.log(`  mm=${mm}: n=${rows.length} (${(100 * rows.length / reserveRows.length).toFixed(0)}% of reserves)  completed ${done} = ${(100 * done / rows.length).toFixed(1)}%  meanVp=${mean(rows.map(r => r.vp)).toFixed(2)}`);
}
const late = reserveRows.filter(r => r.turn > r.turns * 0.75);
console.log(`  reserves taken in the last quarter of the game: n=${late.length}, completed ${(100 * late.filter(r => r.completed).length / Math.max(1, late.length)).toFixed(1)}%`);
console.log(`  overall completion: ${(100 * reserveRows.filter(r => r.completed).length / reserveRows.length).toFixed(1)}%`);
