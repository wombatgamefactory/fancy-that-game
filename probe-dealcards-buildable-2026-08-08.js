// PROBE: does the paid 2-card deal expose something you can BUILD TOWARD?
// (8 August, second probe. The first one, probe-dealcards-2026-08-08.js, measured
// only whether a dealt card is claimable THIS TURN - which is the wrong question
// for the rule's stated intent.)
//
// DEAN'S INTENT, in his words: "a way to expose cards that you might be able to
// build when none of the visible cards are buildable." That is a claim about the
// NEXT few turns, not about this one, and it needs a different measure.
//
// THE MEASURE. For each card, `bestOpenGap` is how many more tiles the board needs
// to complete the nearest still-open window of that card's pattern - so 0 means
// claimable now, 1 means one tile away, and INFINITY means every window is dead
// (an empty plate or a wrong-coloured tile sits in all of them), which is the
// literal reading of "not buildable". The row's gap is the best of those.
//
// So at every card-locked spend step this records the row's gap BEFORE, then peeks
// at the two cards the deal would turn up and records the gap AFTER. It peeks
// rather than deals: nothing is consumed and the game is not perturbed, so the
// arm being measured is the live game.
//
// THE THREE QUESTIONS, in order of how much they matter to the rule:
//   1. How often is the row genuinely UNBUILDABLE (gap infinite), and how often
//      does the deal fix that? This is the state the rule was written for.
//   2. How often does the deal improve the gap at all?
//   3. How often does it produce a gap of 0 or 1 - a claim now, or a claim next
//      turn if the right tile is swept?
import { createGame, sweep, place, claim, skipSpend, skipClaim, refill, canDealCards,
  getPatternMatches, getPatternWindows, moveTile, removePlate, reserveCard,
  takeBonusTile, declineBonusTile, CARDS_PER_DEAL } from './src/engine/game.js';
import * as basicBot from './src/bots/basicBot.js';

const games = parseInt(process.argv[2]) || 400;
const playerCount = parseInt(process.argv[3]) || 3;

// How many more tiles this board needs to finish the nearest OPEN window of the
// pattern. Infinity when every window is dead. Same definition basicBot uses.
function bestOpenGap(board, pattern) {
  let best = Infinity;
  for (const win of getPatternWindows(board, pattern)) {
    if (win.missing.length < best) best = win.missing.length;
  }
  return best;
}

function rowGap(board, cards) {
  let best = Infinity;
  for (const card of cards) {
    const g = bestOpenGap(board, card.pattern);
    if (g < best) best = g;
  }
  return best;
}

let lockedSteps = 0;
let unbuildableBefore = 0;      // gap infinite: nothing on the row can be built at all
let unbuildableFixed = 0;       // ...and the deal made something buildable
let improved = 0;               // gap strictly smaller after the deal
let toZero = 0;                 // a card became claimable at once
let toOne = 0;                  // best gap became 1 (one tile away)
const gapBefore = {};
const gapAfter = {};
let improvedBy = 0;             // total tiles of gap removed, for a mean
const bucket = (o, g) => { const k = Number.isFinite(g) ? String(g) : 'dead'; o[k] = (o[k] || 0) + 1; };

for (let g = 0; g < games; g++) {
  const configs = Array.from({ length: playerCount }, (_, i) => ({ name: `Bot ${i + 1}`, aiDifficulty: 'basic', isHuman: false }));
  let gs = createGame(configs, null);
  let steps = 0;
  while (!gs.gameOver && steps < 2000) {
    switch (gs.gamePhase) {
      case 'sweep': {
        if (gs.bonusTileAvailable) {
          const b = basicBot.decideBonusTile(gs);
          gs = (b !== null && b !== undefined && gs.market[b]) ? takeBonusTile(gs, b) : declineBonusTile(gs);
          break;
        }
        const d = basicBot.decideSweep(gs);
        if (d) gs = sweep(gs, d.rowOrCol, d.isRow, d.declaration, d.declarationType);
        else gs.gamePhase = 'place';
        break;
      }
      case 'place':
        gs = place(gs, basicBot.decidePlacements(gs));
        break;
      case 'spend': {
        const player = gs.players[gs.currentPlayerIndex];
        const visible = [...gs.cardMarket, ...player.reservedCards]
          .filter(c => c.id !== gs.reservedCardIdThisTurn);
        const lockedNow = !visible.some(c => getPatternMatches(player.board, c.pattern).length > 0);

        if (lockedNow && canDealCards(gs)) {
          lockedSteps++;
          const before = rowGap(player.board, visible);
          // PEEK, do not deal - the two cards the spend would turn up.
          const peek = gs.gameDeck.slice(0, CARDS_PER_DEAL);
          const after = Math.min(before, rowGap(player.board, peek));

          bucket(gapBefore, before);
          bucket(gapAfter, after);
          if (!Number.isFinite(before)) {
            unbuildableBefore++;
            if (Number.isFinite(after)) unbuildableFixed++;
          }
          if (after < before) {
            improved++;
            if (Number.isFinite(before)) improvedBy += (before - after);
          }
          if (after === 0) toZero++;
          if (after === 1) toOne++;
        }

        const mv = basicBot.decideMove(gs);
        if (mv) gs = moveTile(gs, mv.fromIndex, mv.toIndex);
        const rp = basicBot.decideRemovePlate(gs);
        if (rp !== null && rp !== undefined) gs = removePlate(gs, rp);
        const rc = basicBot.decideReserve(gs);
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
      case 'refill':
        gs = refill(gs);
        break;
    }
    steps++;
  }
}

const pct = (n, d) => d ? `${(100 * n / d).toFixed(1)}%` : 'n/a';
const dist = (o) => ['0', '1', '2', '3', '4', '5', '6', 'dead']
  .filter(k => o[k]).map(k => `${k}:${o[k]} (${pct(o[k], lockedSteps)})`).join('  ');

console.log(`\n=== DOES THE 2-CARD DEAL EXPOSE SOMETHING BUILDABLE? (${games} games, ${playerCount}p) ===`);
console.log(`\nMeasured at every CARD-LOCKED spend step where the deal was legal: ${lockedSteps} steps.`);
console.log(`"Gap" = tiles still needed to finish the nearest OPEN window on the row.`);
console.log(`  0 = claimable now, 1 = one tile away, "dead" = every window blocked, nothing buildable.\n`);
console.log(`Gap BEFORE the deal:  ${dist(gapBefore)}`);
console.log(`Gap AFTER  the deal:  ${dist(gapAfter)}`);

console.log(`\n--- Q1. The state the rule was written for ---`);
console.log(`Row genuinely UNBUILDABLE (gap dead): ${unbuildableBefore} of ${lockedSteps} locked steps (${pct(unbuildableBefore, lockedSteps)})`);
console.log(`  ...of which the deal made something buildable: ${unbuildableFixed} (${pct(unbuildableFixed, unbuildableBefore)})`);

console.log(`\n--- Q2. Does it improve the gap at all? ---`);
console.log(`Gap strictly improved: ${improved} (${pct(improved, lockedSteps)} of locked steps)`);
console.log(`  mean tiles of gap removed, when it improved from a finite gap: ${improved ? (improvedBy / improved).toFixed(2) : 'n/a'}`);

console.log(`\n--- Q3. How close does it get you? ---`);
console.log(`Best gap becomes 0 (claim NOW):        ${toZero} (${pct(toZero, lockedSteps)})`);
console.log(`Best gap becomes 1 (claim NEXT turn,`);
console.log(`  if you sweep the right tile):        ${toOne} (${pct(toOne, lockedSteps)})`);
console.log(`Either:                                ${toZero + toOne} (${pct(toZero + toOne, lockedSteps)})\n`);
