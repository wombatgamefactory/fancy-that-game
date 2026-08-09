// HOW MUCH ANALYSIS DOES A MULTI-CLAIM TURN ACTUALLY ADD? (9 August 2026)
//
// The A/B (ab-extraclaims-2026-08-09.mjs) answers what unlimited claims do to the
// SCORES. This answers the objection that made the question worth asking: that it
// makes the turn longer to think about. That has to be a measured quantity.
//
// At every claim step of a normally-played game this walks the claim step as a
// SEARCH TREE and records:
//
//   options        - the legal (card, sacrificed tile, destination) triples facing
//                    the player for their FIRST claim. This is the size of the
//                    decision under the ADOPTED rule, and the baseline everything
//                    else is measured against.
//   maxChain       - the longest chain of claims reachable this turn under the
//                    variant, found exhaustively. 1 means the variant changes
//                    nothing on this turn no matter how long the player stares.
//   orderDependent - of the turns where a 2-chain exists: is there a first claim
//                    that LOOKS fine and kills the second? This is the number that
//                    decides the argument. If order never matters the extra rule is
//                    "take both, in any order" and costs a table nothing. If it
//                    often matters, the claim step becomes a sequencing puzzle and
//                    every player at the table has to solve it or be shown they got
//                    it wrong.
//   trapRate       - the sharper version of the same thing: the share of ALL claim
//                    steps on which a player who claims the highest-VP card first
//                    ends the turn with fewer cards than optimal play would have.
//                    A gateway game's rules should not punish the obvious move.
//   treeSize       - total nodes in the chain search. The honest "how much more is
//                    there to look at" figure, for turns where a chain exists.
//
// It plays with the ADOPTED rule live, so the states sampled are the ones a real
// game reaches - the counterfactual is measured, not played out.
//
//   node probe-extraclaims-branching-2026-08-09.js [games] [playerCounts]
import { createGame, sweep, takeBonusTile, declineBonusTile, takeExtraTile, dealCards,
  place, claim, skipClaim, skipSpend, moveTile, removePlate, reserveCard, refill,
  calculateFinalScores, getPatternMatches, getLegalDestinations } from './src/engine/game.js';
import { createStatsCollector } from './src/engine/statsCollector.js';
import * as bot from './src/bots/basicBot.js';

const GAMES = parseInt(process.argv[2] || '400', 10);
const COUNTS = (process.argv[3] || '2,3,4').split(',').map(Number);

// A light, cloneable model of everything a claim chain can touch: the 25 board
// cells and the four stand rows. Nothing else in the game state can change inside
// a single claim step, so this is the whole search space.
function snapshot(player) {
  return {
    board: player.board.map(c => (c && c.type === 'blocked' ? BLOCKED : c)),
    stand: player.stand.map(r => ({ ingredient: r.ingredient, tiles: r.tiles.slice(), capacity: r.capacity })),
  };
}
const BLOCKED = { type: 'blocked' };

// Every legal (card, cell, destination) triple available right now. Cards are
// identified by index into `cards` so a claimed one can be struck off the chain.
function legalClaims(snap, cards, taken) {
  const out = [];
  for (let ci = 0; ci < cards.length; ci++) {
    if (taken.has(ci)) continue;
    const matches = getPatternMatches(snap.board, cards[ci].pattern);
    if (matches.length === 0) continue;
    const cells = new Set();
    for (const m of matches) m.cells.forEach(c => cells.add(c));
    for (const cell of cells) {
      const tile = snap.board[cell];
      if (!tile || tile.type === 'blocked') continue;
      for (const dest of getLegalDestinations(snap, tile)) {
        out.push({ ci, cell, dest, vp: cards[ci].vp || 0 });
      }
    }
  }
  return out;
}

function applyClaim(snap, opt) {
  const tile = snap.board[opt.cell];
  const next = {
    board: snap.board.slice(),
    stand: snap.stand.map(r => ({ ingredient: r.ingredient, tiles: r.tiles.slice(), capacity: r.capacity })),
  };
  next.board[opt.cell] = BLOCKED;
  if (opt.dest.type === 'row') {
    const row = next.stand[opt.dest.rowIndex];
    row.tiles.push(tile);
    if (row.ingredient === null) row.ingredient = tile.ingredient;
  }
  return next;
}

// Longest chain reachable from here, exhaustively. Depth-capped for safety; a
// chain longer than 6 has never appeared and would be reported as a truncation.
function search(snap, cards, taken, depth, stat) {
  const opts = legalClaims(snap, cards, taken);
  stat.nodes += opts.length;
  if (opts.length === 0 || depth >= 6) {
    if (depth >= 6) stat.truncated++;
    return 0;
  }
  let best = 0;
  // Dedupe by (card, cell): two destinations for the same sacrifice differ only in
  // where the tile is banked, which cannot change what is claimable afterwards
  // EXCEPT through the stand's one-row-per-ingredient rule - so keep one option per
  // (card, cell, destination-kind) rather than collapsing destinations entirely.
  const seen = new Set();
  for (const o of opts) {
    const key = `${o.ci}:${o.cell}:${o.dest.type}:${o.dest.rowIndex ?? -1}`;
    if (seen.has(key)) continue;
    seen.add(key);
    taken.add(o.ci);
    const sub = 1 + search(applyClaim(snap, o), cards, taken, depth + 1, stat);
    taken.delete(o.ci);
    if (sub > best) best = sub;
    if (best >= cards.length) break;
  }
  return best;
}

function analyseClaimStep(gameState, acc) {
  const player = gameState.players[gameState.currentPlayerIndex];
  const cards = [...gameState.cardMarket, ...player.reservedCards];
  const snap = snapshot(player);
  const first = legalClaims(snap, cards, new Set());
  acc.steps++;
  if (first.length === 0) { acc.lockedSteps++; acc.chainHist[0] = (acc.chainHist[0] || 0) + 1; return; }

  acc.optionsSum += first.length;
  acc.optionsMax = Math.max(acc.optionsMax, first.length);

  const stat = { nodes: 0, truncated: 0 };
  const maxChain = search(snap, cards, new Set(), 0, stat);
  acc.chainHist[maxChain] = (acc.chainHist[maxChain] || 0) + 1;
  acc.truncated += stat.truncated;
  if (maxChain >= 2) {
    acc.chainSteps++;
    acc.treeNodes += stat.nodes;

    // ORDER DEPENDENCE. For each distinct FIRST claim, what is the best total
    // chain it leads to? If some first claim reaches maxChain and another reaches
    // less, the order matters and the turn is a puzzle.
    let worstFirst = Infinity;
    const seen = new Set();
    for (const o of first) {
      const key = `${o.ci}:${o.cell}:${o.dest.type}:${o.dest.rowIndex ?? -1}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const taken = new Set([o.ci]);
      const sub = 1 + search(applyClaim(snap, o), cards, taken, 1, { nodes: 0, truncated: 0 });
      if (sub < worstFirst) worstFirst = sub;
    }
    if (worstFirst < maxChain) acc.orderDependent++;

    // THE TRAP. Take the highest-VP card first (ties broken by the first option
    // found, i.e. arbitrarily, exactly as a player eyeballing the row would) and
    // see whether that costs a card.
    let greedy = null;
    for (const o of first) if (!greedy || o.vp > greedy.vp) greedy = o;
    const taken = new Set([greedy.ci]);
    const greedyChain = 1 + search(applyClaim(snap, greedy), cards, taken, 1, { nodes: 0, truncated: 0 });
    if (greedyChain < maxChain) acc.trapped++;
  }
}

function runGame(playerCount, acc) {
  const sc = createStatsCollector();
  const cfg = Array.from({ length: playerCount }, (_, i) => ({ id: i, name: `P${i}`, type: 'ai' }));
  let s = createGame(cfg, sc);
  let steps = 0;
  let sampled = false;

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
        if (!sampled) { analyseClaimStep(s, acc); sampled = true; }
        const d = bot.decideClaim(s);
        if (d && d.cardId) s = claim(s, d.cardId, d.removedBoardIndex, d.destination);
        else s = skipClaim(s);
        break;
      }
      case 'refill': sampled = false; s = refill(s); break;
    }
    steps++;
  }
  if (s.gameOver) calculateFinalScores(s);
}

console.log(`\nMULTI-CLAIM ANALYSIS BURDEN - ${GAMES} games per player count`);
console.log('Played under the ADOPTED one-claim rule; the chain is the counterfactual.\n');

for (const pc of COUNTS) {
  const acc = {
    steps: 0, lockedSteps: 0, optionsSum: 0, optionsMax: 0, chainHist: [],
    chainSteps: 0, orderDependent: 0, trapped: 0, treeNodes: 0, truncated: 0,
  };
  for (let g = 0; g < GAMES; g++) runGame(pc, acc);

  const live = acc.steps - acc.lockedSteps;
  const hist = acc.chainHist.map((v, i) => v ? `${i}:${(100 * v / acc.steps).toFixed(1)}%` : null)
    .filter(Boolean).join('  ');
  console.log(`===== ${pc} PLAYERS (${acc.steps} claim steps) =====`);
  console.log(`  Locked (no legal claim at all):    ${(100 * acc.lockedSteps / acc.steps).toFixed(1)}%`);
  console.log(`  First-claim options (card x tile x destination): mean=${(acc.optionsSum / live).toFixed(1)} over unlocked steps, max=${acc.optionsMax}`);
  console.log(`  Longest chain available:           ${hist}`);
  console.log(`  Steps where a 2+ chain exists:     ${acc.chainSteps}/${acc.steps} (${(100 * acc.chainSteps / acc.steps).toFixed(1)}%)`);
  if (acc.chainSteps > 0) {
    console.log(`    ...of those, ORDER MATTERS in:   ${acc.orderDependent}/${acc.chainSteps} (${(100 * acc.orderDependent / acc.chainSteps).toFixed(1)}%)`);
    console.log(`    ...highest-VP-first LOSES a card: ${acc.trapped}/${acc.chainSteps} (${(100 * acc.trapped / acc.chainSteps).toFixed(1)}%)`);
    console.log(`    mean search-tree nodes on those steps: ${(acc.treeNodes / acc.chainSteps).toFixed(1)}`);
    console.log(`    trap rate over ALL claim steps:  ${(100 * acc.trapped / acc.steps).toFixed(2)}%`);
  }
  if (acc.truncated) console.log(`  (depth cap hit ${acc.truncated} times)`);
  console.log('');
}
