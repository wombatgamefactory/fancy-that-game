// A/B: WHAT IF A CRUMB-TRAY CLAIM LEFT NO EMPTY PLATE ON THE BOARD? (11 August)
//
// THE QUESTION IS PHYSICAL BEFORE IT IS MECHANICAL. Setup puts one plate on each
// of the 10 cake-stand slots, so plating a tile onto the stand hands the player
// the plate they must drop on their board - a gesture that is right 100% of the
// time without anybody reading a rule. The crumb tray carries no plates, so the
// same gesture says "no plate" there, which is NOT the rule (claim() blocks the
// vacated cell whichever destination the tile went to).
//
// So: is the wrong-but-intuitive reading actually a better rule? This measures it.
//
//   A  CONTROL          live rules, all players normal.
//   B  RULE CHANGE      a crumb claim leaves the vacated cell EMPTY, all players
//                       normal. Isolates the passive drift - what changes when
//                       nobody plays for it.
//   C  EXPLOITED        rule change + ONE greedy seat that dumps to the crumb
//                       tray whenever the stand row it would otherwise feed is
//                       worth less than a free cell. Win rate vs 1/playerCount
//                       is the exploitability read.
//   D  GREEDY CONTROL   the same greedy seat under LIVE rules, so arm C's result
//                       can be split into "crumbing is good" and "free cells are
//                       good". Without this the arm is unreadable.
//
// The free cell is priced at FREE_CELL_VP. Anchor: the engine sells exactly this
// cell for REMOVE_PLATE_CUPCAKE_COST = 2 cupcakes, and basicBot prices a cupcake
// at 2 VP (the extra tile it would otherwise buy), so the bot's own hurdle for a
// freed cell is 4 VP - a hurdle it almost never clears (see probe-plate-price.js).
// Humans bought the same cell readily at 1 cupcake. 3 VP is the midpoint and is
// deliberately a parameter, not a constant: pass it as argv[3] and re-read.
//
// It also reports PLATE SUPPLY. The rulebook ships 10 plates per player, which is
// exactly the number of cake-stand slots - so the setup trick consumes the entire
// supply and a crumb claim under the live rules has no plate left to take. That
// is a component-count question, and the claim distribution below answers it.
import {
  createGame, sweep, takeBonusTile, declineBonusTile, takeExtraTile, place, claim,
  skipClaim, skipSpend, moveTile, removePlate, refill, calculateFinalScores,
  getLegalDestinations, STAND_ROW_VALUES, CUPCAKE_PLATES,
} from './src/engine/game.js';
import { createStatsCollector } from './src/engine/statsCollector.js';
import * as bot from './src/bots/basicBot.js';

const GAMES = parseInt(process.argv[2] || '400', 10);
const FREE_CELL_VP = parseFloat(process.argv[3] || '3');
const CUPCAKE_VP = 2; // basicBot's own price for a cupcake

const isCupcakePlate = (r, p) => CUPCAKE_PLATES.some(c => c.rowIndex === r && c.plateIndex === p);

// What plating THIS tile onto row `rowIndex` is worth right now: the step up the
// row's cumulative table, plus the cupcake if it lands on a cupcake plate.
function marginalRowVP(player, rowIndex) {
  const row = player.stand[rowIndex];
  const L = row.tiles.length;
  const gain = STAND_ROW_VALUES[rowIndex][L] - (L > 0 ? STAND_ROW_VALUES[rowIndex][L - 1] : 0);
  return gain + (isCupcakePlate(rowIndex, L) ? CUPCAKE_VP : 0);
}

// The greedy seat's whole edit: keep the bot's card and cell, change only where
// the tile goes. Dump to the crumb tray unless the stand row beats a free cell.
function greedyDestination(player, decision) {
  const d = decision.destination;
  if (!d || d.type !== 'row') return d;
  const tile = player.board[decision.removedBoardIndex];
  if (!tile) return d;
  if (!getLegalDestinations(player, tile).some(x => x.type === 'crumb')) return d;
  return marginalRowVP(player, d.rowIndex) < FREE_CELL_VP ? { type: 'crumb' } : d;
}

// ARMS INVERTED 11 AUGUST, AFTER THE RULE SHIPPED. This probe was written while
// CRUMB_CLAIM_LEAVES_PLATE was still true, so it ADDED the rule change on top of
// the engine. The engine owns the rule now, so the arms are the other way round:
// `restoreOldPlateRule` writes the plate back after a crumb claim to reconstruct
// the OLD behaviour. Same four arms, same meaning, same numbers - only the
// direction of the patch moved. If the constant is ever flipped back, invert this
// again rather than leaving both patches fighting.
function runGame(playerCount, { restoreOldPlateRule, greedySeat }, acc) {
  let s = createGame(
    Array.from({ length: playerCount }, (_, i) => ({ id: i, name: 'P' + i, type: 'ai' })),
    createStatsCollector(),
  );
  const claimsPerSeat = Array.from({ length: playerCount }, () => 0);
  const crumbsPerSeat = Array.from({ length: playerCount }, () => 0);
  let steps = 0;

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
        const x = bot.decideExtraTile ? bot.decideExtraTile(s) : null;
        if (x !== null && x !== undefined) s = takeExtraTile(s, x);
        s = place(s, bot.decidePlacements(s));
        break;
      }
      case 'spend': {
        const md = bot.decideMove ? bot.decideMove(s) : null;
        if (md) s = moveTile(s, md.fromIndex, md.toIndex);
        const rp = bot.decideRemovePlate ? bot.decideRemovePlate(s) : null;
        if (rp !== null && rp !== undefined) s = removePlate(s, rp);
        s = skipSpend(s);
        break;
      }
      case 'claim': {
        const seat = s.currentPlayerIndex;
        const player = s.players[seat];
        const d = bot.decideClaim(s);
        if (d && d.cardId) {
          let dest = d.destination;
          if (seat === greedySeat) dest = greedyDestination(player, d);
          const cell = d.removedBoardIndex;
          try {
            s = claim(s, d.cardId, cell, dest);
            claimsPerSeat[seat]++;
            if (dest.type === 'crumb') {
              crumbsPerSeat[seat]++;
              // THE RULE UNDER TEST, reconstructed backwards. claim() has already
              // left the cell empty; this plates it again to rebuild the old rule.
              if (restoreOldPlateRule) s.players[seat].board[cell] = { type: 'blocked' };
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
  const scores = s.players.map(p => p.score);
  const best = Math.max(...scores);
  const winners = scores.filter(v => v === best).length;
  for (let i = 0; i < playerCount; i++) {
    acc.score[i] += scores[i];
    acc.win[i] += scores[i] === best ? 1 / winners : 0;
    acc.claims[i] += claimsPerSeat[i];
    acc.crumbs[i] += crumbsPerSeat[i];
    acc.maxClaims = Math.max(acc.maxClaims, claimsPerSeat[i]);
    if (claimsPerSeat[i] > 10) acc.over10++;
    acc.seats++;
  }
  acc.turns += s.stats.turnsPlayed;
  acc.games++;
}

function runArm(playerCount, cfg) {
  const acc = {
    score: Array.from({ length: playerCount }, () => 0),
    win: Array.from({ length: playerCount }, () => 0),
    claims: Array.from({ length: playerCount }, () => 0),
    crumbs: Array.from({ length: playerCount }, () => 0),
    turns: 0, games: 0, seats: 0, over10: 0, maxClaims: 0,
  };
  for (let g = 0; g < GAMES; g++) runGame(playerCount, cfg, acc);
  return acc;
}

const pct = (n, d) => (100 * n / (d || 1)).toFixed(1);

for (const pc of [2, 3, 4]) {
  const greedySeat = 0;
  const A = runArm(pc, { restoreOldPlateRule: true, greedySeat: -1 });
  const B = runArm(pc, { restoreOldPlateRule: false, greedySeat: -1 });
  const C = runArm(pc, { restoreOldPlateRule: false, greedySeat });
  const D = runArm(pc, { restoreOldPlateRule: true, greedySeat });

  const mean = a => (a.score.reduce((x, y) => x + y, 0) / a.seats).toFixed(2);
  const claimsMean = a => (a.claims.reduce((x, y) => x + y, 0) / a.seats).toFixed(2);
  const crumbRate = a => pct(a.crumbs.reduce((x, y) => x + y, 0), a.claims.reduce((x, y) => x + y, 0));
  const turns = a => (a.turns / a.games).toFixed(1);
  const seatWin = (a, i) => pct(a.win[i], a.games);

  console.log(`\n=== ${pc} PLAYERS - ${GAMES} games per arm, free cell priced at ${FREE_CELL_VP} VP ===`);
  console.log(`  expected win share for one seat: ${(100 / pc).toFixed(1)}%`);
  console.log(`  A control        mean ${mean(A)} VP  claims/seat ${claimsMean(A)}  crumb rate ${crumbRate(A)}%  turns ${turns(A)}`);
  console.log(`  B rule change    mean ${mean(B)} VP  claims/seat ${claimsMean(B)}  crumb rate ${crumbRate(B)}%  turns ${turns(B)}`);
  console.log(`  C exploited      mean ${mean(C)} VP  claims/seat ${claimsMean(C)}  crumb rate ${crumbRate(C)}%  turns ${turns(C)}`);
  console.log(`      greedy seat  win ${seatWin(C, 0)}%   score ${(C.score[0] / C.games).toFixed(2)}   claims ${(C.claims[0] / C.games).toFixed(2)}   crumbs ${(C.crumbs[0] / C.games).toFixed(2)}`);
  console.log(`  D greedy, live   mean ${mean(D)} VP  claims/seat ${claimsMean(D)}  crumb rate ${crumbRate(D)}%  turns ${turns(D)}`);
  console.log(`      greedy seat  win ${seatWin(D, 0)}%   score ${(D.score[0] / D.games).toFixed(2)}   claims ${(D.claims[0] / D.games).toFixed(2)}   crumbs ${(D.crumbs[0] / D.games).toFixed(2)}`);
  console.log(`  PLATE SUPPLY (arm A): max claims by one player ${A.maxClaims}, seats needing >10 plates ${pct(A.over10, A.seats)}%`);
}
