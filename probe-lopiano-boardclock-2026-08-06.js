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
// LOPIANO-LENS PROBE, part 3: THE BOARD-FULL CLOCK, measured before it is coded.
//
// Dean's 6 August ruling re-denominates the ending in board capacity. The lens's
// second gate is "count the compulsory unit's total supply against the slowest
// legal line" - the check that the source catalogue's third-best title passed on
// compulsion and then failed on arithmetic after publication. This probe runs it.
//
// THE APPROXIMATION, stated plainly. The new engine is not written, so this drives
// the CURRENT engine with the plate pool lifted out of the way -
// gameState.cardsNeededToEnd is set high enough that neither the card end
// condition (isGameOver) nor the claim cap (canClaimMore) can ever fire. What is
// left is exactly the board clock plus the bag backstop, which is the shape of the
// new rule. It is not the new rule: the current engine still ends on 'boardFull'
// (the INCOMING player has no free cell) and on 'boardOverflow' (the sweep is
// bigger than the free cells left), and the new design may fold those together.
// Both are board-capacity endings, so the arithmetic below holds either way.
//
// THE KEY IDENTITY, which is why the supply question is answerable exactly:
// tiles permanently removed from the bag by one player = 25 - (their free cells).
// A board cell is a tile, a plate, or empty; a claim converts a tile cell into a
// plate cell and sends the tile to the stand or crumb tray, so it never returns to
// the bag and never frees a cell. A COMPLETELY FULL BOARD THEREFORE COSTS THE BAG
// EXACTLY 25 TILES, whatever the player did with them. Against a 100-tile bag that
// also has to keep 25 cells of market covered, that is the whole of the question.
import { createGame, sweep, takeBonusTile, declineBonusTile, takeExtraTile, place, claim, skipClaim, skipSpend, moveTile, removePlate, reserveCard, refill, getValidPlacements, calculateFinalScores } from './src/engine/game.js';
import { TILE_BAG_SIZE } from './src/engine/tiles.js';
import { createStatsCollector } from './src/engine/statsCollector.js';
import * as basicBot from './src/bots/basicBot.js';

const GAMES = Number(process.argv[2] || 500);

function runGame(playerCount, { boardClock }) {
  const configs = Array.from({ length: playerCount }, (_, i) => ({ name: `P${i + 1}` }));
  const strategy = basicBot;
  let gameState = createGame(configs, createStatsCollector());
  // Lift the plate pool out of the way: no card end condition, no claim cap.
  if (boardClock) gameState.cardsNeededToEnd = 9999;
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
          try { gameState = claim(gameState, c.cardId, c.removedBoardIndex, c.destination); }
          catch (e) { gameState = skipClaim(gameState); }
        } else {
          gameState = skipClaim(gameState);
        }
        break;
      }
      case 'refill': gameState = refill(gameState); break;
      default: throw new Error(`unknown phase ${gameState.gamePhase}`);
    }
    steps++;
  }
  calculateFinalScores(gameState);
  return gameState;
}

function report(label, playerCount, boardClock) {
  const endReasons = {};
  let turns = 0, scores = 0, claims = 0, players = 0;
  let freeCells = 0, fullestBoardFree = 0, absorbed = 0, bagLeft = 0, marketLeft = 0;
  let spreadWinnerLast = 0, lastPctWinner = 0;

  for (let g = 0; g < GAMES; g++) {
    const gs = runGame(playerCount, { boardClock });
    endReasons[gs.endGameReason || 'none'] = (endReasons[gs.endGameReason || 'none'] || 0) + 1;
    turns += gs.stats.turnsPlayed;
    bagLeft += gs.bag.length;
    marketLeft += gs.market.filter(t => t).length;
    let minFree = 99;
    for (const p of gs.players) {
      players++;
      scores += p.score;
      claims += p.claimedCards.length;
      const free = getValidPlacements(p.board).length;
      freeCells += free;
      absorbed += (25 - free);
      if (free < minFree) minFree = free;
    }
    fullestBoardFree += minFree;
    const sorted = [...gs.players].sort((a, b) => b.score - a.score);
    spreadWinnerLast += sorted[0].score - sorted[sorted.length - 1].score;
    lastPctWinner += 100 * sorted[sorted.length - 1].score / (sorted[0].score || 1);
  }

  const pct = (v) => (100 * v / GAMES).toFixed(1);
  console.log(`  ${label}`);
  console.log(`    ending: ${Object.entries(endReasons).map(([k, v]) => `${k} ${pct(v)}%`).join(', ')}`);
  console.log(`    ${(turns / GAMES / playerCount).toFixed(2)} turns/player, mean score ${(scores / players).toFixed(1)}, claims/player ${(claims / players).toFixed(2)}`);
  console.log(`    free cells at end: ${(freeCells / players).toFixed(1)} mean, ${(fullestBoardFree / GAMES).toFixed(1)} on the fullest board`);
  console.log(`    tiles absorbed onto boards: ${(absorbed / GAMES).toFixed(1)} of ${TILE_BAG_SIZE}   bag left ${(bagLeft / GAMES).toFixed(1)}, market ${(marketLeft / GAMES).toFixed(1)}`);
  console.log(`    spread winner-last ${(spreadWinnerLast / GAMES).toFixed(1)}, last as % of winner ${(lastPctWinner / GAMES).toFixed(1)}%`);
}

console.log(`THE BOARD-FULL CLOCK - ${GAMES} games per arm, basicBot\n`);
console.log(`SUPPLY ARITHMETIC, exact and independent of any simulation:`);
console.log(`  a completely full board removes exactly 25 tiles from the ${TILE_BAG_SIZE}-tile bag, permanently.`);
for (const n of [2, 3, 4]) {
  console.log(`  ${n} players, all boards full = ${25 * n} tiles absorbed, leaving ${TILE_BAG_SIZE - 25 * n} for a market that needs 25 cells covered.`);
}
console.log('');

for (const playerCount of [2, 3, 4]) {
  console.log(`--- ${playerCount} PLAYERS ---`);
  report('plate pool as clock (today)   ', playerCount, false);
  report('board capacity as clock (new) ', playerCount, true);
  console.log('');
}
