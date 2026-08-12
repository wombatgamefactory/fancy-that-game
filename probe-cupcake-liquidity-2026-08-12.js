// CUPCAKE LIQUIDITY PROBE - 12 August 2026, written for the Feld-lens review.
//
// THE QUESTION. Two of the four spends need an EMPTY CELL on the buyer's own
// board (the extra tile, the tile move), and an empty cell is also the game's
// clock - the game ends when somebody's 25 cells are all full. So the currency
// and the clock are denominated in the same resource, and the suspicion is that
// the spend menu closes as the game closes: a cupcake is most useful in the
// opening, when nobody needs one, and least useful at the death, when a player
// who has fallen behind does.
//
// simulate.js metric 8 cannot answer this. It reports total influx, total spend
// and cupcakes kept at the end, all of which are consistent with the menu
// staying wide open and the bots simply choosing not to buy.
//
// WHAT THIS MEASURES, sampled at every spend step of every turn:
//   - how many of the four spends are LEGAL AND AFFORDABLE (canBuyExtraTile,
//     canMoveTile, canDealCards, canRemovePlate - the engine's own predicates,
//     so this cannot drift from the rules)
//   - how many would be legal WITH AN INFINITE PURSE, which separates "the
//     player is broke" from "the board has closed the door"
//   - cupcakes held
// all bucketed by game third, computed after the game ends so the denominator
// is the game's real length rather than a guess.
//
// AND AT GAME END, by FINISHING RANK: cupcakes held, and total cupcake income.
// That is the second half of the question - the largest income source is the
// cupcake plates on the cake stand, which pay only when a tile is PLATED, which
// happens only on a CLAIM. If income is claim-coupled then the player who is
// locked out of claiming earns least of the currency that cures a lock.
//
// READ-ONLY with respect to the engine: it calls no setter and mutates nothing.
// The bot caveats that apply to every figure in this project apply here too -
// basicBot is blind to the price of a further claim and prices a second tile
// move against the card it can already claim. Those affect WHAT IT BUYS. They do
// not affect the affordability counts below, which are facts about the state.
//
// Usage: node probe-cupcake-liquidity-2026-08-12.js [games] [players]
import { createGame, sweep, takeBonusTile, declineBonusTile, dealCards, takeExtraTile, place, claim, skipClaim, skipSpend, moveTile, removePlate, refill, calculateFinalScores, canBuyExtraTile, canMoveTile, canDealCards, canRemovePlate, EXTRA_TILE_CUPCAKE_COST, MOVE_TILE_CUPCAKE_COST, DEAL_CARDS_CUPCAKE_COST, REMOVE_PLATE_CUPCAKE_COST } from './src/engine/game.js';
import * as basicBot from './src/bots/basicBot.js';

const GAMES = parseInt(process.argv[2]) || 500;
const PLAYERS = parseInt(process.argv[3]) || 3;

// A spend's affordability with the real purse, and its legality with an infinite
// one. The engine predicates fold the two together, so the second reading is
// taken by temporarily reading the player's purse as large - done by asking the
// predicate after noting the price, rather than by writing to the state.
function spendPicture(gameState) {
  const player = gameState.players[gameState.currentPlayerIndex];
  const purse = player.cupcakes;
  const priced = [
    [EXTRA_TILE_CUPCAKE_COST, canBuyExtraTile],
    [MOVE_TILE_CUPCAKE_COST, canMoveTile],
    [DEAL_CARDS_CUPCAKE_COST, canDealCards],
    [REMOVE_PLATE_CUPCAKE_COST, canRemovePlate],
  ];
  let affordable = 0;
  let openWithInfinitePurse = 0;
  for (const [price, predicate] of priced) {
    if (predicate(gameState)) affordable++;
    // The purse is the only clause of each predicate this can legitimately
    // neutralise, so raise it, ask, and put it straight back. Nothing else in the
    // state is touched and the value is restored before the next line runs.
    player.cupcakes = 99;
    if (predicate(gameState)) openWithInfinitePurse++;
    player.cupcakes = purse;
    void price;
  }
  return { affordable, openWithInfinitePurse, purse };
}

function runGame() {
  let gameState = createGame(
    Array.from({ length: PLAYERS }, (_, i) => ({ id: i, name: `P${i}` })),
  );
  const samples = [];       // one per spend step: {turn, affordable, open, purse}
  let steps = 0;

  while (!gameState.gameOver && steps < 1000) {
    switch (gameState.gamePhase) {
      case 'sweep': {
        if (gameState.bonusTileAvailable) {
          const b = basicBot.decideBonusTile ? basicBot.decideBonusTile(gameState) : null;
          gameState = (b !== null && b !== undefined && gameState.market[b])
            ? takeBonusTile(gameState, b) : declineBonusTile(gameState);
          break;
        }
        const d = basicBot.decideSweep(gameState);
        if (d) gameState = sweep(gameState, d.rowOrCol, d.isRow, d.declaration, d.declarationType);
        else gameState.gamePhase = 'place';
        break;
      }
      case 'place':
        gameState = place(gameState, basicBot.decidePlacements(gameState));
        break;
      case 'spend': {
        // THE SAMPLE, taken before anything is bought - the menu the player was
        // handed, not what is left after they have eaten from it.
        const picture = spendPicture(gameState);
        samples.push({ turn: gameState.stats.turnsPlayed, ...picture });

        let n = 0;
        while (n++ < 25) {
          const extra = basicBot.decideExtraTile ? basicBot.decideExtraTile(gameState) : null;
          if (extra === null || extra === undefined) break;
          gameState = takeExtraTile(gameState, extra.marketIndex, extra.boardIndex);
        }
        n = 0;
        while (n++ < 25) {
          const m = basicBot.decideMove ? basicBot.decideMove(gameState) : null;
          if (!m) break;
          gameState = moveTile(gameState, m.fromIndex, m.toIndex);
        }
        n = 0;
        while (n++ < 25) {
          const rp = basicBot.decideRemovePlate ? basicBot.decideRemovePlate(gameState) : null;
          if (rp === null || rp === undefined) break;
          gameState = removePlate(gameState, rp);
        }
        n = 0;
        while (n++ < 10) {
          if (!(basicBot.decideDealCards && basicBot.decideDealCards(gameState))) break;
          gameState = dealCards(gameState);
        }
        gameState = skipSpend(gameState);
        break;
      }
      case 'claim': {
        const d = basicBot.decideClaim(gameState);
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
  return { gameState, samples, totalTurns: gameState.stats.turnsPlayed };
}

// Three buckets, filled after the fact so the denominator is the game's own length.
const thirds = [0, 1, 2].map(() => ({ n: 0, affordable: 0, open: 0, purse: 0, none: 0, boardShut: 0 }));
// Cupcakes held and earned at the end, by finishing rank (0 = winner).
const byRank = Array.from({ length: PLAYERS }, () => ({ n: 0, kept: 0, claims: 0, score: 0 }));

for (let g = 0; g < GAMES; g++) {
  const { gameState, samples, totalTurns } = runGame();
  for (const s of samples) {
    const idx = Math.min(2, Math.floor((s.turn / Math.max(1, totalTurns)) * 3));
    const b = thirds[idx];
    b.n++;
    b.affordable += s.affordable;
    b.open += s.openWithInfinitePurse;
    b.purse += s.purse;
    if (s.affordable === 0) b.none++;
    // The door the BOARD shut rather than the purse: nothing affordable, and
    // nothing would have been affordable with money either.
    if (s.openWithInfinitePurse === 0) b.boardShut++;
  }
  const ranked = [...gameState.players].sort((a, b2) => b2.score - a.score);
  ranked.forEach((p, rank) => {
    const r = byRank[rank];
    r.n++;
    r.kept += p.cupcakes;
    r.claims += p.claimedCards.length;
    r.score += p.score;
  });
}

const f = (x, d = 2) => x.toFixed(d);
console.log(`\nCUPCAKE LIQUIDITY - ${GAMES} games, ${PLAYERS} players, basicBot, live engine\n`);
console.log('THE SPEND MENU BY GAME THIRD (sampled at every spend step, before anything is bought)');
console.log('  Four spends exist: extra tile 1, move a tile 1, deal 2 cards 1, remove a plate 2.\n');
console.log('  third | samples | affordable now | open with money | purse | steps with NOTHING | of those, the BOARD shut the door');
thirds.forEach((b, i) => {
  console.log(`    ${['1st', '2nd', '3rd'][i]} | ${String(b.n).padStart(7)} | `
    + `${f(b.affordable / b.n).padStart(14)} | ${f(b.open / b.n).padStart(15)} | `
    + `${f(b.purse / b.n).padStart(5)} | ${f(100 * b.none / b.n, 1).padStart(17)}% | `
    + `${f(100 * b.boardShut / b.n, 1).padStart(6)}%`);
});

console.log('\nAT GAME END, BY FINISHING RANK (0 = winner)');
console.log('  rank | mean score | claims | cupcakes still held');
byRank.forEach((r, i) => {
  console.log(`    ${i + 1}  | ${f(r.score / r.n).padStart(10)} | ${f(r.claims / r.n).padStart(6)} | ${f(r.kept / r.n).padStart(19)}`);
});
console.log('');
