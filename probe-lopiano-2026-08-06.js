// LOPIANO-LENS PROBE, 6 August 2026. Answers four questions no existing harness
// reports, all of them needed by the Lopiano assessment and none of them about
// balance tuning:
//
//   1. SCORING MIXTURE BY LANE. What share of a final score comes from stand
//      rows, crumb tray, card VP and Tasting Menus. The lens grades the scoring
//      MIXTURE (paid-for-beating-someone vs per-unit-of-your-own-stuff vs
//      your-count-times-a-rate), so the weights matter, not just the list.
//   2. THE COMPULSORY CLOCK. Free cells on the personal board over the game -
//      the lens's first gate asks whether a player pursuing a winning line can
//      decline to spend the unit the ending counts. Free board cells can only
//      ever fall (a claim converts a tile to a plate, it does not free a cell;
//      only removePlate frees one, at 3 cupcakes). Measured, not assumed.
//   3. WHICH END CONDITION ACTUALLY FIRES, per player count.
//   4. THE SLOWEST LEGAL LINE. A player who sweeps the MINIMUM tiles every turn
//      (always a 1-tile declaration) still fills their board - how fast? This is
//      the lens's "write down the worst-case legal line" test, run rather than
//      argued.
//
// Read-only with respect to the engine: it drives the public API exactly as
// simulate.js does and touches no seam or setter.
import { createGame, sweep, takeBonusTile, declineBonusTile, takeExtraTile, place, claim, skipClaim, skipSpend, moveTile, removePlate, reserveCard, refill, getValidPlacements, getValidSweeps, calculateFinalScores, STAND_ROW_VALUES, TASTING_MENU_VP, REWARD_CARDS } from './src/engine/game.js';
import { createStatsCollector } from './src/engine/statsCollector.js';
import * as basicBot from './src/bots/basicBot.js';

const GAMES = Number(process.argv[2] || 1000);

function standScore(player) {
  let s = 0;
  for (let i = 0; i < player.stand.length; i++) {
    const row = player.stand[i];
    if (row.tiles.length > 0) s += STAND_ROW_VALUES[i][row.tiles.length - 1];
  }
  return s;
}

function cardScore(player) {
  let s = 0;
  for (const id of player.claimedCards) {
    const card = REWARD_CARDS.find(c => c.id === id);
    if (card) s += card.vp;
  }
  return s;
}

// Drive one game with basicBot. `minSweep` forces the slowest legal line for
// EVERY player: always take the sweep that lifts the fewest tiles.
function runGame(playerCount, { minSweep = false } = {}) {
  const configs = Array.from({ length: playerCount }, (_, i) => ({ name: `P${i + 1}` }));
  const strategy = basicBot;
  let gameState = createGame(configs, createStatsCollector());
  const freeCellTrace = [];   // free cells on the ACTIVE player's board, per turn
  let steps = 0;

  while (!gameState.gameOver && steps < 4000) {
    switch (gameState.gamePhase) {
      case 'sweep': {
        if (gameState.bonusTileAvailable) {
          const b = strategy.decideBonusTile ? strategy.decideBonusTile(gameState) : null;
          gameState = (b !== null && b !== undefined && gameState.market[b])
            ? takeBonusTile(gameState, b) : declineBonusTile(gameState);
          break;
        }
        freeCellTrace.push({
          turn: gameState.stats.turnsPlayed,
          player: gameState.currentPlayerIndex,
          free: getValidPlacements(gameState.players[gameState.currentPlayerIndex].board).length,
        });
        let d;
        if (minSweep) {
          // The slowest legal line: of every legal sweep, the one taking fewest
          // tiles. Ties broken arbitrarily (first found).
          const options = getValidSweeps(gameState);
          let best = null, bestN = Infinity;
          for (const o of options) {
            let n = 0;
            for (let k = 0; k < gameState.marketSize; k++) {
              const idx = o.isRow ? o.rowOrCol * gameState.marketSize + k : k * gameState.marketSize + o.rowOrCol;
              const t = gameState.market[idx];
              if (!t) continue;
              if (o.declarationType === 'colour' ? t.colour === o.declaration : t.ingredient === o.declaration) n++;
            }
            if (n < bestN) { bestN = n; best = o; }
          }
          d = best;
        } else {
          d = strategy.decideSweep(gameState);
        }
        if (d) gameState = sweep(gameState, d.rowOrCol, d.isRow, d.declaration, d.declarationType);
        else gameState.gamePhase = 'place';
        break;
      }
      case 'place': {
        if (!minSweep) {
          const extra = strategy.decideExtraTile ? strategy.decideExtraTile(gameState) : null;
          if (extra !== null && extra !== undefined) gameState = takeExtraTile(gameState, extra);
        }
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
          try {
            gameState = claim(gameState, c.cardId, c.removedBoardIndex, c.destination);
          } catch (e) {
            gameState = skipClaim(gameState);
          }
        } else {
          gameState = skipClaim(gameState);
        }
        break;
      }
      case 'refill':
        gameState = refill(gameState);
        break;
      default:
        throw new Error(`unknown phase ${gameState.gamePhase}`);
    }
    steps++;
  }
  calculateFinalScores(gameState);
  return { gameState, freeCellTrace };
}

function pct(a, b) { return b === 0 ? 0 : (100 * a / b); }

console.log(`LOPIANO-LENS PROBE - ${GAMES} games per player count, basicBot\n`);

for (const playerCount of [2, 3, 4]) {
  let stand = 0, crumb = 0, cards = 0, menus = 0, total = 0, players = 0;
  let turns = 0, games = 0;
  const endReasons = {};
  let freeAtStart = 0, freeAtEnd = 0, monotoneBreaks = 0, traceGames = 0;

  for (let g = 0; g < GAMES; g++) {
    const { gameState, freeCellTrace } = runGame(playerCount);
    games++;
    turns += gameState.stats.turnsPlayed;
    endReasons[gameState.endGameReason || 'none'] = (endReasons[gameState.endGameReason || 'none'] || 0) + 1;
    for (const p of gameState.players) {
      players++;
      const s = standScore(p), c = p.crumbTray.length, cd = cardScore(p), m = p.tastingMenus.length * TASTING_MENU_VP;
      stand += s; crumb += c; cards += cd; menus += m; total += p.score;
    }
    // Free-cell monotonicity for player 0 only (one board is enough to test it).
    const p0 = freeCellTrace.filter(t => t.player === 0).map(t => t.free);
    if (p0.length > 1) {
      traceGames++;
      freeAtStart += p0[0];
      freeAtEnd += p0[p0.length - 1];
      for (let i = 1; i < p0.length; i++) if (p0[i] > p0[i - 1]) monotoneBreaks++;
    }
  }

  console.log(`--- ${playerCount} PLAYERS ---`);
  console.log(`Mean score ${(total / players).toFixed(1)} over ${(turns / games / playerCount).toFixed(2)} turns/player`);
  console.log(`  Scoring lanes (mean VP/player, share of score):`);
  console.log(`    Cake stand rows  ${(stand / players).toFixed(2).padStart(6)}  ${pct(stand, total).toFixed(1)}%`);
  console.log(`    Card VP          ${(cards / players).toFixed(2).padStart(6)}  ${pct(cards, total).toFixed(1)}%`);
  console.log(`    Tasting Menus    ${(menus / players).toFixed(2).padStart(6)}  ${pct(menus, total).toFixed(1)}%`);
  console.log(`    Crumb tray       ${(crumb / players).toFixed(2).padStart(6)}  ${pct(crumb, total).toFixed(1)}%`);
  console.log(`  End condition: ${Object.entries(endReasons).map(([k, v]) => `${k} ${pct(v, games).toFixed(1)}%`).join(', ')}`);
  console.log(`  Seat-1 board free cells: ${(freeAtStart / traceGames).toFixed(1)} at first sweep -> ${(freeAtEnd / traceGames).toFixed(1)} at last`);
  console.log(`  Turns where free cells ROSE (would break the clock): ${monotoneBreaks} across ${traceGames} games\n`);
}

// THE SLOWEST LEGAL LINE, run at 3 players: everyone always takes the smallest
// legal sweep. If the game still ends, the clock binds a stalling table.
console.log('--- SLOWEST LEGAL LINE (all players always take the smallest legal sweep), 3 players ---');
{
  const N = Math.min(GAMES, 300);
  let turns = 0, scores = 0, players = 0;
  const endReasons = {};
  for (let g = 0; g < N; g++) {
    const { gameState } = runGame(3, { minSweep: true });
    turns += gameState.stats.turnsPlayed;
    endReasons[gameState.endGameReason || 'none'] = (endReasons[gameState.endGameReason || 'none'] || 0) + 1;
    for (const p of gameState.players) { players++; scores += p.score; }
  }
  console.log(`  ${N} games: ${(turns / N / 3).toFixed(2)} turns/player, mean score ${(scores / players).toFixed(1)}`);
  console.log(`  End condition: ${Object.entries(endReasons).map(([k, v]) => `${k} ${pct(v, N).toFixed(1)}%`).join(', ')}`);
}
