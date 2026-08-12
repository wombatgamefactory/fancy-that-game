// HOW OFTEN WOULD "A FULL CAKE STAND ENDS THE GAME" ACTUALLY FIRE? (12 August)
//
// THE CASE FOR THE RULE. A stand holds 10 tiles - rows of 4/3/2/1 - and every one
// of them arrives by a claim. Until the paid further claim shipped (9 August) a
// player got one claim a turn and the stand could not plausibly fill inside a
// game's length. Uncapped repeat claims (11 August) made 10 platings reachable in
// principle, and a player whose stand is full has nothing left to buy with a
// claim: every future tile can only go to the crumb tray at 1 VP. That is a
// player with nothing to do, which is an ending.
//
// THE CASE AGAINST IT IS ARITHMETIC, AND THIS PROBE IS THE TEST. Filling the
// stand is not 10 claims, it is 10 claims whose tiles land in a very particular
// shape: FOUR DISTINCT INGREDIENTS, one per row, in exactly 4/3/2/1 counts,
// under the one-row-per-ingredient rule (getLegalDestinations). Every crumb claim
// is a plating that did not happen, and measured claims run 6-7 a player.
//
// MEASURED ON THE CURRENT ENGINE, WHICH IS THE HONEST WAY TO DO IT. The new
// ending can only fire on a stand that fills, and a stand fills or does not fill
// identically up to the moment it does - the rule changes nothing before its own
// trigger. So counting fills here, and comparing WHEN they happen against when
// the game's end was already armed, tells us exactly how often the new reason
// would be the one a player is shown.
//
//   A  NORMAL     all seats basicBot, live rules. What a real table does.
//   B  NO-CRUMB   one seat that never sends a tile to the tray when any row will
//                 take it, and otherwise keeps the bot's own row choice. The
//                 cheapest possible "play for it": one decision changed, nothing
//                 else disturbed.
//   C  SHAPER     B, plus it picks the row that gets it closest to a complete
//                 4/3/2/1 rather than the row worth the most VP.
//
// C IS REPORTED BUT IT IS NOT AN UPPER BOUND, and the first run of this probe
// shows why: shaping toward the target LOWERS the fill rate, because choosing a
// row by shape rather than by value locks ingredients onto the wrong rows and
// strands later tiles in the tray. basicBot's own valuation is the better
// stand-filler. Read C as "a player who plays for it naively does worse", not as
// a ceiling.
//
// Reported per arm:
//   - stands filled, as a share of games and of seats
//   - of those, how many filled BEFORE anything else armed the end (the share
//     where 'standFull' would be the named reason, since first reason wins)
//   - how far the table actually gets: mean and max tiles on a stand at game end,
//     and the distribution of full ROWS
//
// DRIVER: arena.js's, not the older probes'. They ask decideExtraTile at the PLACE
// step, where canBuyExtraTile has refused since 10 August, so they silently play a
// game in which nobody ever buys an extra tile - and that changes how fast boards
// fill, which is exactly what this probe is racing the stand against. All five
// spends are driven below.
import {
  createGame, sweep, takeBonusTile, declineBonusTile, takeExtraTile, place, claim,
  skipClaim, skipSpend, moveTile, removePlate, dealCards, refill, calculateFinalScores,
  getLegalDestinations, STAND_ROW_VALUES,
} from './src/engine/game.js';
import { createStatsCollector } from './src/engine/statsCollector.js';
import * as bot from './src/bots/basicBot.js';

const GAMES = parseInt(process.argv[2] || '400', 10);

const STAND_CAPACITY = 10; // 4 + 3 + 2 + 1

const standTiles = p => p.stand.reduce((n, r) => n + r.tiles.length, 0);
const standFull = p => p.stand.every(r => r.tiles.length >= r.capacity);
const fullRows = p => p.stand.filter(r => r.tiles.length >= r.capacity).length;

// The hunter's whole edit: keep the bot's card and cell, change only where the
// tile goes.
//
// `shape` off (arm B): never crumb if a row will take it; among legal rows keep
// whatever the bot chose, falling back to the first legal row if the bot's pick
// was the tray.
//
// `shape` on (arm C): additionally choose the row that leaves the smallest gap to
// a finished stand - complete a row if this tile can, else open an unopened row
// (an unopened row is a dead 0 against the 4/3/2/1 target), else the shallower
// remaining gap.
function hunterDestination(player, decision, shape) {
  const tile = player.board[decision.removedBoardIndex];
  if (!tile) return decision.destination;
  const rows = getLegalDestinations(player, tile).filter(d => d.type === 'row');
  if (rows.length === 0) return { type: 'crumb' };
  if (!shape) {
    const chosen = decision.destination;
    if (chosen && chosen.type === 'row' && rows.some(d => d.rowIndex === chosen.rowIndex)) return chosen;
    return rows[0];
  }
  let best = rows[0];
  let bestScore = -Infinity;
  for (const d of rows) {
    const row = player.stand[d.rowIndex];
    const completes = row.tiles.length + 1 >= row.capacity ? 100 : 0;
    const opens = row.ingredient === null ? 50 : 0;
    const score = completes + opens - (row.capacity - row.tiles.length);
    if (score > bestScore) { bestScore = score; best = d; }
  }
  return best;
}

function runGame(playerCount, { hunterSeat, shape }, acc) {
  let s = createGame(
    Array.from({ length: playerCount }, (_, i) => ({ id: i, name: 'P' + i, type: 'ai' })),
    createStatsCollector(),
  );
  let steps = 0;
  // Per game: did any stand fill, and was the end already armed when it did?
  let filled = 0;          // seats whose stand filled this game
  let filledUnarmed = 0;   // ...of those, seats that filled with nothing yet armed
  let firstFillTurn = null;

  while (!s.gameOver && steps < 2000) {
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
        s = place(s, bot.decidePlacements(s));
        break;
      }
      case 'spend': {
        for (let n = 0; n < 25; n++) {
          const ex = bot.decideExtraTile ? bot.decideExtraTile(s) : null;
          if (ex === null || ex === undefined) break;
          s = takeExtraTile(s, ex.marketIndex, ex.boardIndex);
        }
        for (let n = 0; n < 25; n++) {
          const mv = bot.decideMove ? bot.decideMove(s) : null;
          if (!mv) break;
          s = moveTile(s, mv.fromIndex, mv.toIndex);
        }
        for (let n = 0; n < 25; n++) {
          const rp = bot.decideRemovePlate ? bot.decideRemovePlate(s) : null;
          if (rp === null || rp === undefined) break;
          s = removePlate(s, rp);
        }
        for (let n = 0; n < 10; n++) {
          if (!(bot.decideDealCards && bot.decideDealCards(s))) break;
          s = dealCards(s);
        }
        s = skipSpend(s);
        break;
      }
      case 'claim': {
        const seat = s.currentPlayerIndex;
        const player = s.players[seat];
        const wasFull = standFull(player);
        const d = bot.decideClaim(s);
        if (d && d.cardId) {
          let dest = d.destination;
          if (seat === hunterSeat) dest = hunterDestination(player, d, shape);
          try {
            const armedBefore = s.endTriggered;
            s = claim(s, d.cardId, d.removedBoardIndex, dest);
            if (!wasFull && standFull(s.players[seat])) {
              filled++;
              acc.filledBySeat[seat]++;
              if (!armedBefore) filledUnarmed++;
              if (firstFillTurn === null) firstFillTurn = s.stats.turnsPlayed;
            }
          } catch (e) {
            s = skipClaim(s);
          }
        } else s = skipClaim(s);
        break;
      }
      case 'refill': s = refill(s); break;
      default: steps = 2000;
    }
    steps++;
  }

  calculateFinalScores(s);
  for (const p of s.players) {
    acc.scoreBySeat[p.id] += p.score;
    const n = standTiles(p);
    acc.standTiles += n;
    acc.maxStandTiles = Math.max(acc.maxStandTiles, n);
    acc.standHist[n]++;
    acc.rowHist[fullRows(p)]++;
    acc.claims += p.claimedCards.length;
    acc.crumbs += p.crumbTray.length;
    acc.seats++;
  }
  acc.filledSeats += filled;
  acc.filledUnarmedSeats += filledUnarmed;
  if (filled > 0) acc.gamesWithFill++;
  if (filledUnarmed > 0) {
    acc.gamesNewEnding++;
    acc.newEndingTurnSum += firstFillTurn;
    acc.turnsAtNewEnding += s.stats.turnsPlayed;
  }
  acc.turns += s.stats.turnsPlayed;
  acc.games++;
}

function runArm(playerCount, cfg) {
  const acc = {
    standTiles: 0, maxStandTiles: 0, claims: 0, crumbs: 0, seats: 0,
    standHist: Array(STAND_CAPACITY + 1).fill(0),
    rowHist: Array(5).fill(0),
    filledSeats: 0, filledUnarmedSeats: 0,
    filledBySeat: Array.from({ length: playerCount }, () => 0),
    scoreBySeat: Array.from({ length: playerCount }, () => 0),
    gamesWithFill: 0, gamesNewEnding: 0, newEndingTurnSum: 0, turnsAtNewEnding: 0,
    turns: 0, games: 0,
  };
  for (let g = 0; g < GAMES; g++) runGame(playerCount, cfg, acc);
  return acc;
}

const pct = (n, d) => (100 * n / (d || 1)).toFixed(2);

function report(label, a, hunterSeat) {
  console.log(`  ${label}`);
  if (hunterSeat >= 0) {
    console.log(`     seat ${hunterSeat} (the hunter):      filled ${pct(a.filledBySeat[hunterSeat], a.games)}% of its games, scored ${(a.scoreBySeat[hunterSeat] / a.games).toFixed(2)} VP (table mean ${(a.scoreBySeat.reduce((x, y) => x + y, 0) / a.seats).toFixed(2)})`);
  }
  console.log(`     stands FILLED:            ${a.filledSeats} seats (${pct(a.filledSeats, a.seats)}% of seats), ${a.gamesWithFill} games (${pct(a.gamesWithFill, a.games)}%)`);
  console.log(`     ...with nothing yet armed: ${a.filledUnarmedSeats} seats -> 'standFull' NAMED in ${a.gamesNewEnding} games (${pct(a.gamesNewEnding, a.games)}%)`);
  if (a.gamesNewEnding > 0) {
    console.log(`        first fill on turn ${(a.newEndingTurnSum / a.gamesNewEnding).toFixed(1)} of ${(a.turnsAtNewEnding / a.gamesNewEnding).toFixed(1)} played`);
  }
  console.log(`     tiles on stand at end:    mean ${(a.standTiles / a.seats).toFixed(2)} / ${STAND_CAPACITY}, max ${a.maxStandTiles}`);
  console.log(`     claims/seat ${(a.claims / a.seats).toFixed(2)}, crumbs/seat ${(a.crumbs / a.seats).toFixed(2)}, turns/game ${(a.turns / a.games).toFixed(1)}`);
  console.log(`     stand tiles histogram:    ${a.standHist.map((n, i) => `${i}:${pct(n, a.seats)}%`).join('  ')}`);
  console.log(`     full ROWS histogram:      ${a.rowHist.map((n, i) => `${i}:${pct(n, a.seats)}%`).join('  ')}`);
}

for (const pc of [2, 3, 4]) {
  console.log(`\n=== ${pc} PLAYERS - ${GAMES} games per arm ===`);
  report('A normal (all basicBot)', runArm(pc, { hunterSeat: -1, shape: false }), -1);
  report('B seat 0 never crumbs', runArm(pc, { hunterSeat: 0, shape: false }), 0);
  report('C seat 0 shapes for 4/3/2/1', runArm(pc, { hunterSeat: 0, shape: true }), 0);
}
