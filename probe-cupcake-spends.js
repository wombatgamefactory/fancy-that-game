// How much RESIDUAL card lock is left now that the extra tile is in the rules?
//
// ORIGINAL PURPOSE (before 3 August): this probe asked whether "spend 1 cupcake:
// take 1 extra tile" would fix the card lock at all. It found 37.9 / 39.0 / 39.4%
// of locked claim steps curable that way, and that finding is what adopted the
// rule.
//
// WHAT IT MEASURES NOW: the rule is live and the loop below buys the tile, so the
// lock rate reported here is the POST-mitigation rate, and "curable by 1 extra
// tile" now means curable by a SECOND one - the allowance is once per turn. Read
// it as "how much lock is left, and would raising the allowance touch it", not as
// the original before/after test.
//
// It also measures how much of the residual is a board-geometry problem (no free
// cell at all), which no amount of market access can buy.
import { createGame, sweep, takeBonusTile, declineBonusTile, place, claim, skipClaim, skipSpend, moveTile, removePlate, takeExtraTile, refill, calculateFinalScores, getPatternMatches, getValidPlacements } from './src/engine/game.js';
import { createStatsCollector } from './src/engine/statsCollector.js';
import * as bot from './src/bots/basicBot.js';

function claimableCount(player, gameState) {
  let n = 0;
  for (const c of gameState.cardMarket) if (getPatternMatches(player.board, c.pattern).length > 0) n++;
  return n;
}

// Would one extra tile of some colour available on the market unlock a claim?
function extraTileUnlocks(player, gameState) {
  const spots = getValidPlacements(player.board);
  if (!spots.length) return false;
  const colours = new Set();
  for (const t of gameState.market) if (t) colours.add(t.colour);
  for (const colour of colours) {
    for (const idx of spots) {
      const board = player.board.slice();
      board[idx] = { colour, ingredient: 'probe' };
      for (const c of gameState.cardMarket) if (getPatternMatches(board, c.pattern).length > 0) return true;
    }
  }
  return false;
}

function runGame(pc) {
  const sc = createStatsCollector();
  let s = createGame(Array.from({length:pc},(_,i)=>({id:i,name:'P'+i,type:'ai'})), sc);
  let locked = 0, lockedCurable = 0, steps = 0, claimSteps = 0, boardFullAtLock = 0;
  while (!s.gameOver && steps < 1000) {
    switch (s.gamePhase) {
      case 'sweep': {
        if (s.bonusTileAvailable) { const b = bot.decideBonusTile ? bot.decideBonusTile(s) : null;
          s = (b !== null && b !== undefined && s.market[b]) ? takeBonusTile(s,b) : declineBonusTile(s); break; }
        const d = bot.decideSweep(s);
        if (d) s = sweep(s, d.rowOrCol, d.isRow, d.declaration, d.declarationType); else s.gamePhase = 'place';
        break;
      }
      case 'place': {
        // 3 August: buy the extra tile BEFORE choosing placements - it is placed
        // with the swept tiles, so the placement decision has to see it.
        const x = bot.decideExtraTile ? bot.decideExtraTile(s) : null;
        if (x !== null && x !== undefined) s = takeExtraTile(s, x);
        s = place(s, bot.decidePlacements(s)); break;
      }
      case 'spend': { const m = bot.decideMove ? bot.decideMove(s) : null;
        if (m) s = moveTile(s, m.fromIndex, m.toIndex);
        const rp = bot.decideRemovePlate ? bot.decideRemovePlate(s) : null;
        if (rp !== null && rp !== undefined) s = removePlate(s, rp);
        // (the paid reserve was driven here until 11 August, when it was deleted)
        s = skipSpend(s); break; }
      case 'claim': {
        const p = s.players[s.currentPlayerIndex];
        claimSteps++;
        if (claimableCount(p, s) === 0) {
          locked++;
          if (!getValidPlacements(p.board).length) boardFullAtLock++;
          else if (extraTileUnlocks(p, s)) lockedCurable++;
        }
        const d = bot.decideClaim(s);
        s = (d && d.cardId) ? claim(s, d.cardId, d.removedBoardIndex, d.destination) : skipClaim(s);
        break;
      }
      case 'refill': s = refill(s); break;
    }
    steps++;
  }
  if (s.gameOver) calculateFinalScores(s);
  return { locked, lockedCurable, claimSteps, boardFullAtLock };
}

const GAMES = parseInt(process.argv[2]) || 200;
console.log(`\nCard-lock curability: would ONE extra market tile unlock a claim?\n`);
for (const pc of [2, 3, 4]) {
  let locked = 0, curable = 0, steps = 0, boardFull = 0;
  for (let g = 0; g < GAMES; g++) {
    const r = runGame(pc);
    locked += r.locked; curable += r.lockedCurable; steps += r.claimSteps; boardFull += r.boardFullAtLock;
  }
  console.log(`${pc}p  (${GAMES} games, ${steps} claim steps)`);
  console.log(`   locked claim steps:        ${locked} (${(100*locked/steps).toFixed(1)}% of all claim steps)`);
  console.log(`   ...curable by 1 extra tile: ${curable} (${(100*curable/locked).toFixed(1)}% of locks, ${(100*curable/steps).toFixed(1)}% of all claim steps)`);
  console.log(`   ...board had no free cell:  ${boardFull} (${(100*boardFull/locked).toFixed(1)}% of locks - unbuyable at any price)`);
  console.log(`   residual lock rate after the rung: ${(100*(locked-curable)/steps).toFixed(1)}%\n`);
}
