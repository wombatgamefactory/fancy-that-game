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
// TILE LEDGER. Where is every one of the 100 tiles when the game ends?
//
// Settles one question and nothing else: when a claim plants an empty plate on a
// board cell, does the tile that was there return to the bag? Counts every tile in
// the game at the final state and checks the six locations sum to TILE_BAG_SIZE.
//
// Run under the BOARD-CAPACITY clock (cardsNeededToEnd lifted out of reach), which
// is the rule set the question is being asked about.
import { createGame, sweep, takeBonusTile, declineBonusTile, takeExtraTile, place, claim, skipClaim, skipSpend, moveTile, removePlate, reserveCard, refill, getValidPlacements, calculateFinalScores } from './src/engine/game.js';
import { TILE_BAG_SIZE } from './src/engine/tiles.js';
import { createStatsCollector } from './src/engine/statsCollector.js';
import * as basicBot from './src/bots/basicBot.js';

const GAMES = Number(process.argv[2] || 500);

function runGame(playerCount) {
  const configs = Array.from({ length: playerCount }, (_, i) => ({ name: `P${i + 1}` }));
  const strategy = basicBot;
  let gameState = createGame(configs, createStatsCollector());
  gameState.cardsNeededToEnd = 9999;   // board clock only
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
        } else gameState = skipClaim(gameState);
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

console.log(`TILE LEDGER under the board clock - ${GAMES} games per player count, basicBot`);
console.log(`Every tile in the game, by location, at the final state. Bag holds ${TILE_BAG_SIZE}.\n`);

for (const playerCount of [2, 3, 4]) {
  let bag = 0, market = 0, onBoards = 0, onStands = 0, inCrumb = 0, plates = 0, claims = 0, free = 0;
  for (let g = 0; g < GAMES; g++) {
    const gs = runGame(playerCount);
    bag += gs.bag.length;
    market += gs.market.filter(t => t).length;
    for (const p of gs.players) {
      for (const cell of p.board) {
        if (cell === null || cell === undefined) { free++; continue; }
        if (cell.type === 'blocked') { plates++; continue; }
        onBoards++;
      }
      for (const row of p.stand) onStands += row.tiles.length;
      inCrumb += p.crumbTray.length;
      claims += p.claimedCards.length;
    }
  }
  const d = (v) => (v / GAMES).toFixed(1).padStart(6);
  const accounted = (bag + market + onBoards + onStands + inCrumb) / GAMES;
  console.log(`--- ${playerCount} PLAYERS ---`);
  console.log(`  IN THE BAG                       ${d(bag)}`);
  console.log(`  on the tile market               ${d(market)}`);
  console.log(`  on player boards (as tiles)      ${d(onBoards)}`);
  console.log(`  on CAKE STANDS                   ${d(onStands)}   <- left the board, did NOT return to the bag`);
  console.log(`  in CRUMB TRAYS                   ${d(inCrumb)}   <- same`);
  console.log(`  ------------------------------------------`);
  console.log(`  accounted for                    ${accounted.toFixed(1).padStart(6)} of ${TILE_BAG_SIZE}`);
  console.log(`  missing (overflow tiles binned)  ${(TILE_BAG_SIZE - accounted).toFixed(1).padStart(6)}`);
  console.log(`  empty plates on boards           ${d(plates)}   (= claims made, ${(claims / GAMES).toFixed(1)})`);
  console.log(`  empty board cells                ${d(free)}`);
  console.log(`  CHECK  tiles permanently out of the bag = board tiles + stand + crumb = ${((onBoards + onStands + inCrumb) / GAMES).toFixed(1)}`);
  console.log(`         filled cells (tiles + plates)     = ${((onBoards + plates) / GAMES).toFixed(1)}  <- the two are equal by construction\n`);
}
