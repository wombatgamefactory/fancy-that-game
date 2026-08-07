// FROZEN 6 AUGUST 2026 - HISTORICAL RECORD, DO NOT MAINTAIN.
//
// THIS IS THE PROBE THE NEW END CONDITION WAS ADOPTED ON, and it is the reason
// the figures quoted throughout the engine exist. It measured the rule from
// OUTSIDE the engine, as a driver-level overlay, so its whole decline/partial/
// discard apparatus - and everything in enforceNewRules - is now dead: the engine
// carries the rule itself. Several things it drives no longer exist at all (the
// shared empty-plate pool gameState.cardsNeededToEnd, the endings 'cardMarket',
// 'bagEmpty' and 'boardOverflow', isGameOver, and the whole-sweep bin that
// recoverPartial unwinds), so it will not run as written.
//
// It is kept as the record of what was measured and why the ruling went the way
// it did, NOT as a tool, and it must not be repaired into looking current. THE
// DESIGN OF RECORD IS THE ENGINE (src/engine/game.js); the live measurement is
// simulate.js, whose metric 10 now reports the trim rule's cost every run.
//
// FILL-THE-BOARD END CONDITION PROBE (6 August).
//
// THE RULE UNDER TEST. Two endings and no others:
//   1. a player completely fills their personal board (all 25 cells hold a tile
//      or an empty plate), or
//   2. no tiles remain anywhere in the supply - the bag is empty AND the tile
//      market is empty.
// Empty plates are UNLIMITED: the plate pool stops being a clock entirely, so
// the card-count ending ('cardMarket') is gone and a player may claim on any
// turn they have a pattern for. The finish-the-round rule is unchanged - a
// trigger arms the ending and play continues until the turn returns to the start
// player, so every seat gets the same number of turns.
//
// The two live endings this removes:
//   'cardMarket'  - deleted outright (plates are infinite).
//   'bagEmpty'    - a pot of tea that cannot be poured no longer ends anything.
//                   The market simply is not refilled and play continues over a
//                   thinning market until it is bare, at which point ending 2
//                   ('marketTiles') fires.
//   'boardOverflow' - see below.
//
// THE OVERFLOW QUESTION, which the new rule forces and which is the reason this
// probe runs two variants. Today, sweeping more tiles than your board can hold
// ends the game. Under the new rule it must not, so something else has to happen
// to the excess, and the choice is worth measuring rather than assuming:
//
//   variant DECLINE - you may only declare a sweep you can place in full. If no
//     legal sweep fits, you take no tiles this turn but still take your spend and
//     claim. (Also gates the line-clear bonus tile on space; the paid extra tile
//     already refuses itself when the board has no room.)
//   variant PARTIAL - sweep whatever you like, place as many of the tiles as you
//     have cells for, RETURN THE REST TO THE BAG, and carry on to your spend and
//     claim as normal. ADOPTED 6 August.
//   variant DISCARD - today's overflow handling with only the ending removed: the
//     WHOLE sweep is binned (not just the excess) and the turn jumps straight to
//     refill, so the player loses their spend and their claim.
//
// BASELINE is today's live rules, same bot, same game count, printed first.
//
// HOW IT IS IMPLEMENTED. No engine edit. triggerEndGame only ARMS an ending, and
// the stop happens later in advanceToNextTurn, so the driver can (a) clear any
// armed reason the new rule does not recognise, (b) arm 'boardFull' itself the
// moment any board fills, and (c) keep the plate pool permanently ahead of the
// claim count. See enforceNewRules for the one edge case that needs unwinding.
//
// THE BOT'S CLOCK. basicBot reads cardsNeededToEnd to estimate how many claims
// it has left, and that estimate steers which cake-stand rows it opens and
// whether it reserves. Pinning the pool at infinity would tell it the game never
// ends. Instead the pool is re-pointed every step at an HONEST horizon under the
// new rule - free cells on the fastest-filling board, divided by the measured
// ~2.5 tiles a turn - so the bot still plays a game it knows is finite.
import { createGame, sweep, takeBonusTile, declineBonusTile, takeExtraTile, place, claim, skipClaim, skipSpend, moveTile, removePlate, reserveCard, refill, calculateFinalScores, getValidPlacements, getTotalCardsClaimed, getWinningPlayers } from './src/engine/game.js';
import { createStatsCollector } from './src/engine/statsCollector.js';
import * as basicBot from './src/bots/basicBot.js';

const GAMES = Number(process.argv[2] || 500);

// Endings the new rule does not recognise. Armed by the engine, cleared here.
const BANNED_REASONS = new Set(['cardMarket', 'bagEmpty', 'boardOverflow']);

// Tiles a player takes onto their board in an average turn, from the 6 August
// baseline run (22.3 per player over 8.84 turns). Only used to give the bot a
// claims-remaining horizon; nothing in the rules depends on it.
const TILES_PER_TURN = 2.5;

function freeCells(player) {
  return player.board.reduce((n, c) => n + (c === null ? 1 : 0), 0);
}

function boardIsFull(player) {
  return player.board.every(c => c !== null);
}

// Re-point the plate pool at the new rule's real horizon. Keeps canClaimMore
// true forever (plates are unlimited) while leaving basicBot an estimate of how
// many claims it has left that is true under THIS ending rather than the old one.
function setClaimHorizon(gameState) {
  let minFree = Infinity;
  for (const p of gameState.players) minFree = Math.min(minFree, freeCells(p));
  const turnsLeft = Math.max(1, Math.ceil(minFree / TILES_PER_TURN));
  gameState.cardsNeededToEnd = getTotalCardsClaimed(gameState) + turnsLeft * gameState.playerCount;
}

// Apply the new end condition to whatever the engine just did. Called after
// every driver step.
function enforceNewRules(gameState, tally) {
  if (gameState.gameOver && BANNED_REASONS.has(gameState.endGameReason)) {
    // The engine armed a banned ending AND closed the game in the same call,
    // which only 'bagEmpty' can do (it arms inside endTurn, one line before the
    // rotation that owns the stop). Unwind the stop. advanceToNextTurn had
    // already done everything else on its way past, except the two lines after
    // its early return: the stats sample, which is diagnostic only, and the
    // empty-market valve, which is replicated here. The bag is necessarily empty
    // on this path, so the valve's "brew instead" branch cannot apply.
    gameState.gameOver = false;
    gameState.endTriggered = false;
    gameState.endGameReason = null;
    tally.unwoundStops++;
    if (gameState.market.every(t => t === null)) {
      gameState.endTriggered = true;
      gameState.endGameReason = 'marketTiles';
      gameState.gamePhase = 'spend';
    }
  } else if (gameState.endTriggered && BANNED_REASONS.has(gameState.endGameReason)) {
    if (gameState.endGameReason === 'boardOverflow') tally.overflows++;
    if (gameState.endGameReason === 'bagEmpty') tally.dryPots++;
    gameState.endTriggered = false;
    gameState.endGameReason = null;
  }

  // ENDING 1. Armed as soon as any board fills, not on that player's next turn -
  // the fill is the event, and waiting for the rotation would hand a player who
  // filled just after their own turn a whole extra lap.
  if (!gameState.endTriggered) {
    for (let i = 0; i < gameState.players.length; i++) {
      if (boardIsFull(gameState.players[i])) {
        gameState.endTriggered = true;
        gameState.endGameReason = 'boardFull';
        // WHO STOPS THE CLOCK. The Lopiano-lens complaint about today's ending is
        // that it is denominated in the winner's currency - claims are both the
        // only scoring act and the only unit of the clock, so the leader ends the
        // game on the trailing player. A board-fill clock is denominated in TILES
        // TAKEN, which is a different currency, and whether the seat that fills
        // first is also the seat that wins is the measurement that says whether
        // the swap actually bought anything.
        tally.triggerSeat = i;
        break;
      }
    }
  }

  setClaimHorizon(gameState);
}

// --- capacity-aware sweeping (variant DECLINE) -----------------------------
// How many tiles a candidate sweep would actually take, mirroring sweep()'s own
// row/column walk.
function sweepSize(gameState, s) {
  const size = gameState.marketSize;
  let n = 0;
  for (let i = 0; i < size; i++) {
    const tile = s.isRow ? gameState.market[s.rowOrCol * size + i] : gameState.market[i * size + s.rowOrCol];
    if (!tile) continue;
    const match = s.declarationType === 'colour' ? tile.colour === s.declaration : tile.ingredient === s.declaration;
    if (match) n++;
  }
  return n;
}

// The actual tile objects a candidate sweep would take, in sweep()'s own order.
// Needed by variant PARTIAL, which has to know what was taken after the engine
// has already binned it.
function sweptTilesFor(gameState, s) {
  const size = gameState.marketSize;
  const tiles = [];
  for (let i = 0; i < size; i++) {
    const tile = s.isRow ? gameState.market[s.rowOrCol * size + i] : gameState.market[i * size + s.rowOrCol];
    if (!tile) continue;
    const match = s.declarationType === 'colour' ? tile.colour === s.declaration : tile.ingredient === s.declaration;
    if (match) tiles.push(tile);
  }
  return tiles;
}

// Best-ranked sweep that fits in the space the player has, or null to decline.
function decideFittingSweep(gameState) {
  const player = gameState.players[gameState.currentPlayerIndex];
  const room = freeCells(player);
  if (room === 0) return null;
  for (const s of basicBot.rankSweeps(gameState)) {
    if (sweepSize(gameState, s) <= room) return s;
  }
  return null;
}

// VARIANT PARTIAL (adopted). The engine has just run its overflow check and, if
// it fired, binned the whole sweep and jumped the turn to refill. Put back as
// many of the tiles as the board can hold and hand the turn back to the
// placement step, so only the genuine excess is given up and the player keeps
// their spend and claim. `taken` is what the sweep (plus any bonus tile)
// actually lifted off the market.
//
// THE EXCESS GOES BACK INTO THE BAG, not out of the game: it stays in
// circulation and can be dealt out again by the next pot of tea. Materially this
// only matters at 4 players, where the bag and the table's total board capacity
// are both 100 and the supply genuinely runs thin.
function recoverPartial(gameState, taken, tally) {
  if (gameState.gamePhase !== 'refill' || taken.length === 0) return;
  const player = gameState.players[gameState.currentPlayerIndex];
  const room = freeCells(player);
  tally.binnedTiles += taken.length - room;
  tally.partialTurns++;
  gameState.pendingSweepTiles = taken.slice(0, room);
  for (const tile of taken.slice(room)) gameState.bag.push(tile);
  gameState.gamePhase = 'place';
}

// --- the driver ------------------------------------------------------------
// mode: 'baseline' | 'decline' | 'partial' | 'discard'
function runGame(playerCount, mode) {
  const configs = Array.from({ length: playerCount }, (_, i) => ({ name: `P${i + 1}` }));
  let gameState = createGame(configs, createStatsCollector());
  const newRules = mode !== 'baseline';
  const tally = { overflows: 0, dryPots: 0, unwoundStops: 0, declinedSweeps: 0, binnedTiles: 0, partialTurns: 0, deadlock: 0, triggerSeat: null };
  let steps = 0;
  let consecutiveDeclines = 0;
  const claimsBy = new Array(playerCount).fill(0);

  if (newRules) enforceNewRules(gameState, tally);

  while (!gameState.gameOver && steps < 20000) {
    switch (gameState.gamePhase) {
      case 'sweep': {
        const player = gameState.players[gameState.currentPlayerIndex];
        if (gameState.bonusTileAvailable) {
          const room = freeCells(player) - gameState.pendingSweepTiles.length;
          const b = (mode === 'decline' && room < 1) ? null : basicBot.decideBonusTile(gameState);
          const takesIt = b !== null && b !== undefined && gameState.market[b];
          const taken = takesIt
            ? [...gameState.pendingSweepTiles, gameState.market[b]]
            : [...gameState.pendingSweepTiles];
          gameState = takesIt ? takeBonusTile(gameState, b) : declineBonusTile(gameState);
          if (mode === 'partial') recoverPartial(gameState, taken, tally);
          break;
        }
        const d = (mode === 'decline') ? decideFittingSweep(gameState) : basicBot.decideSweep(gameState);
        if (d) {
          consecutiveDeclines = 0;
          const taken = sweptTilesFor(gameState, d);
          gameState = sweep(gameState, d.rowOrCol, d.isRow, d.declaration, d.declarationType);
          if (mode === 'partial') recoverPartial(gameState, taken, tally);
        } else {
          if (mode === 'decline') { tally.declinedSweeps++; consecutiveDeclines++; }
          gameState.gamePhase = 'place'; // nothing swept; place() with no tiles falls through to spend
        }
        // DEADLOCK WATCH, variant DECLINE only. Nothing in that variant forces a
        // player to take tiles, so a table where every board is too full for any
        // sweep on offer would sit there for ever: no tiles leave the market, so
        // no board fills and the market never empties. Recorded rather than
        // designed around - it is a hole in the rule, and its rate is the point.
        if (consecutiveDeclines >= playerCount * 4) {
          tally.deadlock = 1;
          gameState.endTriggered = true;
          gameState.endGameReason = 'deadlock';
          gameState.gameOver = true;
        }
        break;
      }
      case 'place': {
        const extra = basicBot.decideExtraTile(gameState);
        if (extra !== null && extra !== undefined) gameState = takeExtraTile(gameState, extra);
        gameState = place(gameState, basicBot.decidePlacements(gameState));
        break;
      }
      case 'spend': {
        const m = basicBot.decideMove(gameState);
        if (m) gameState = moveTile(gameState, m.fromIndex, m.toIndex);
        const rp = basicBot.decideRemovePlate(gameState);
        if (rp !== null && rp !== undefined) gameState = removePlate(gameState, rp);
        const rc = basicBot.decideReserve(gameState);
        if (rc !== null && rc !== undefined) gameState = reserveCard(gameState, rc);
        gameState = skipSpend(gameState);
        break;
      }
      case 'claim': {
        const seat = gameState.currentPlayerIndex;
        const c = basicBot.decideClaim(gameState);
        if (c) {
          try { gameState = claim(gameState, c.cardId, c.removedBoardIndex, c.destination); claimsBy[seat]++; }
          catch (e) { gameState = skipClaim(gameState); }
        } else {
          gameState = skipClaim(gameState);
        }
        break;
      }
      case 'refill': gameState = refill(gameState); break;
      default: throw new Error(`unknown phase ${gameState.gamePhase}`);
    }
    // Unconditional, INCLUDING when the engine has just set gameOver: unwinding a
    // stop the new rule does not recognise is the one thing only this call does.
    if (newRules && gameState.endGameReason !== 'deadlock') enforceNewRules(gameState, tally);
    steps++;
  }
  if (steps >= 20000) throw new Error('game did not terminate');
  calculateFinalScores(gameState);
  return { gameState, tally, claimsBy, steps };
}

// --- reporting -------------------------------------------------------------
function mean(a) { return a.reduce((s, x) => s + x, 0) / a.length; }
function sd(a) { const m = mean(a); return Math.sqrt(mean(a.map(x => (x - m) ** 2))); }
function pct(n, d) { return `${(100 * n / d).toFixed(1)}%`; }

function report(playerCount, mode, label) {
  const lengths = [], scores = [], winnerScores = [], spreads = [], claimTotals = [];
  const worstClaims = [], bestClaims = [], endFree = [], bagLeft = [], pots = [];
  const maxPlatesOnePlayer = [], overflows = [], declines = [], dryPots = [], rowAtEnd = [];
  const binned = [], partialTurns = [];
  const reasons = new Map();
  const seatWins = new Array(playerCount).fill(0);
  const triggerRanks = [];
  let sharedWins = 0, deadlocks = 0, triggerGames = 0, triggerWins = 0;

  for (let g = 0; g < GAMES; g++) {
    const { gameState, tally, claimsBy } = runGame(playerCount, mode);
    const turns = gameState.stats.turnsPlayed / playerCount;
    lengths.push(turns);
    const ss = gameState.players.map(p => p.score);
    scores.push(...ss);
    const sorted = [...ss].sort((a, b) => b - a);
    winnerScores.push(sorted[0]);
    spreads.push(sorted[0] - sorted[sorted.length - 1]);
    claimTotals.push(claimsBy.reduce((s, x) => s + x, 0));
    worstClaims.push(Math.min(...claimsBy));
    bestClaims.push(Math.max(...claimsBy));
    maxPlatesOnePlayer.push(Math.max(...claimsBy));
    endFree.push(Math.min(...gameState.players.map(freeCells)));
    bagLeft.push(gameState.bag.length);
    pots.push(gameState.statsCollector ? gameState.statsCollector.refreshes.length : 0);
    rowAtEnd.push(gameState.cardMarket.length);
    overflows.push(tally.overflows);
    declines.push(tally.declinedSweeps);
    dryPots.push(tally.dryPots);
    binned.push(tally.binnedTiles);
    partialTurns.push(tally.partialTurns);
    deadlocks += tally.deadlock;
    const reason = gameState.endGameReason || 'none';
    reasons.set(reason, (reasons.get(reason) || 0) + 1);
    const winners = getWinningPlayers(gameState);
    if (winners.length > 1) sharedWins++;
    else seatWins[gameState.players.indexOf(winners[0])]++;
    if (tally.triggerSeat !== null) {
      triggerGames++;
      if (winners.includes(gameState.players[tally.triggerSeat])) triggerWins++;
      const ss2 = gameState.players.map(p => p.score);
      const rankOfTrigger = ss2.filter(s => s > ss2[tally.triggerSeat]).length + 1;
      triggerRanks.push(rankOfTrigger);
    }
  }

  const srt = [...lengths].sort((a, b) => a - b);
  console.log(`  ${label}`);
  console.log(`    length ${mean(lengths).toFixed(2)} turns/player  sd ${sd(lengths).toFixed(2)}  range ${srt[0].toFixed(1)}-${srt[srt.length - 1].toFixed(1)}  median ${srt[Math.floor(srt.length / 2)].toFixed(1)}`);
  const reasonLine = [...reasons.entries()].sort((a, b) => b[1] - a[1])
    .map(([r, n]) => `${r} ${pct(n, GAMES)}`).join('   ');
  console.log(`    ended by: ${reasonLine}`);
  console.log(`    score  mean ${mean(scores).toFixed(1)}  winner ${mean(winnerScores).toFixed(1)}  spread first-to-last ${mean(spreads).toFixed(1)}`);
  console.log(`    claims per game ${mean(claimTotals).toFixed(1)} (${(mean(claimTotals) / playerCount).toFixed(1)} per player)  worst-off player ${mean(worstClaims).toFixed(1)}  best ${mean(bestClaims).toFixed(1)}`);
  console.log(`    plates: most placed by any one player ${mean(maxPlatesOnePlayer).toFixed(1)} mean, ${Math.max(...maxPlatesOnePlayer)} max  (box holds 6/player today)`);
  console.log(`    at the end: fewest free cells ${mean(endFree).toFixed(2)}  bag ${mean(bagLeft).toFixed(1)}  card row ${mean(rowAtEnd).toFixed(1)}  pots of tea ${mean(pots).toFixed(2)}`);
  if (mode !== 'baseline') {
    console.log(`    turns hitting the overflow rule ${mean(overflows).toFixed(2)}/game   tiles returned to the bag ${mean(binned).toFixed(2)}/game   declined sweeps ${mean(declines).toFixed(2)}/game`);
    console.log(`    pots that could not be poured (dry bag) ${mean(dryPots).toFixed(2)}/game   deadlocked games ${pct(deadlocks, GAMES)}`);
    if (triggerGames > 0) {
      console.log(`    the seat that filled first won ${pct(triggerWins, triggerGames)} of the games it ended (chance = ${(100 / playerCount).toFixed(1)}%), mean finishing place ${mean(triggerRanks).toFixed(2)} of ${playerCount}`);
    }
  }
  console.log(`    wins by seat: ${seatWins.map((w, i) => `P${i + 1} ${pct(w, GAMES)}`).join('  ')}   shared ${pct(sharedWins, GAMES)}`);
  console.log('');
}

console.log(`FILL-THE-BOARD END CONDITION - ${GAMES} games per player count per variant, basicBot\n`);
console.log('New rule: the game ends ONLY when a player fills their board, or the bag');
console.log('and the tile market are both empty. Empty plates are unlimited.\n');

for (const playerCount of [2, 3, 4]) {
  console.log(`=== ${playerCount} PLAYERS ===`);
  report(playerCount, 'baseline', 'BASELINE (today\'s live rules)');
  report(playerCount, 'decline', 'NEW RULE, variant DECLINE (only declare a sweep you can place in full)');
  report(playerCount, 'partial', 'NEW RULE, variant PARTIAL - ADOPTED (place what fits, excess back to the bag)');
  report(playerCount, 'discard', 'NEW RULE, variant DISCARD (today\'s overflow: whole sweep binned, turn lost)');
}
