// LOPIANO-LENS PROBE, 9 August 2026. Successor to probe-lopiano-2026-08-06.js,
// which no longer runs: it imports takeExtraTile, deleted from the engine on
// 8 August. Same four questions, plus two the 6 August version could not ask.
//
//   1. SCORING MIXTURE BY PAYMENT FAMILY. Stand rows, crumb tray, card VP,
//      Tasting Menus, and the Flavour of the Day SPLIT INTO ITS TWO CLAUSES -
//      the per-tile count and the 3 VP majority. The majority is the only
//      lane in the game paid for beating another player, so it must be read
//      on its own and not folded into the module's total.
//   2. THE COMPULSORY CLOCK. Free cells on a personal board over the game.
//      They can only fall (a claim converts a tile cell to a plate cell);
//      only removePlate frees one, at 2 cupcakes. Measured, not assumed.
//   3. WHICH END CONDITION FIRES, per player count.
//   4. THE SLOWEST LEGAL LINE. Every player always takes the smallest legal
//      sweep. Does the clock still reach the end, and how much slower?
//   5. THE CROSS-TABLE CHANNEL. A fresh pot of tea pays the brewer 1 cupcake
//      and hands the next player a full 25-tile trolley. Measures what the
//      brewer swept from versus what the next seat swept from, which is the
//      size of the benefit the giver is being paid 1 cupcake for.
//   6. THE PAID CARD DEAL (8 August). How often it is bought and what share
//      of locked steps it is bought on.
//
// Read-only with respect to the engine: drives the public API exactly as
// simulate.js does and touches no seam or setter.
import { createGame, sweep, takeBonusTile, declineBonusTile, place, claim, skipClaim, skipSpend, moveTile, removePlate, reserveCard, dealCards, takeExtraTile, refill, getValidPlacements, getValidSweeps, getPatternMatches, calculateFinalScores, getFlavourCount, getFlavourLeaders, isFlavourInPlay, STAND_ROW_VALUES, TASTING_MENU_VP, FLAVOUR_VP_PER_TILE, FLAVOUR_MAJORITY_VP, REWARD_CARDS } from './src/engine/game.js';
import { createStatsCollector } from './src/engine/statsCollector.js';
import * as basicBot from './src/bots/basicBot.js';

// A claim step is LOCKED when nothing in the card row, and nothing reserved,
// matches any shape on the acting player's board. Same definition simulate.js
// metric 4 uses; recomputed here so the deal-on-a-locked-step figure can be
// paired with it in one pass.
function claimableCount(gameState) {
  const player = gameState.players[gameState.currentPlayerIndex];
  let n = 0;
  for (const card of gameState.cardMarket) {
    if (getPatternMatches(player.board, card.pattern).length > 0) n++;
  }
  if (player.reservedCard && getPatternMatches(player.board, player.reservedCard.pattern).length > 0) n++;
  return n;
}

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

function marketFill(gameState) {
  let n = 0;
  for (const t of gameState.market) if (t) n++;
  return n;
}

function runGame(playerCount, { minSweep = false } = {}) {
  const configs = Array.from({ length: playerCount }, (_, i) => ({ name: `P${i + 1}` }));
  const strategy = basicBot;
  let gameState = createGame(configs, createStatsCollector());
  const freeCellTrace = [];
  const chan = { pots: 0, fillBrewer: 0, fillNext: 0 };
  const spendStats = { lockedSteps: 0, claimSteps: 0, deals: 0, dealsOnLocked: 0 };
  let steps = 0;
  let potJustPoured = false;

  while (!gameState.gameOver && steps < 6000) {
    switch (gameState.gamePhase) {
      case 'sweep': {
        if (gameState.bonusTileAvailable) {
          const b = strategy.decideBonusTile ? strategy.decideBonusTile(gameState) : null;
          gameState = (b !== null && b !== undefined && gameState.market[b])
            ? takeBonusTile(gameState, b) : declineBonusTile(gameState);
          break;
        }
        // Channel measurement: the fill this seat is sweeping from. The turn
        // straight after a pot is the one the brewer handed over.
        if (potJustPoured) { chan.fillNext += marketFill(gameState); potJustPoured = false; }
        freeCellTrace.push({
          player: gameState.currentPlayerIndex,
          free: getValidPlacements(gameState.players[gameState.currentPlayerIndex].board).length,
        });
        let d;
        if (minSweep) {
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
        // The paid extra tile, restored later on 9 August. It was not in this
        // driver when the file was written, because the rule did not exist that
        // morning - so any figure taken from the first run of this probe was
        // measured on a menu one spend short. Metric 6 in particular (the paid
        // card deal's share of locked steps) reads HIGH without it, since the
        // tile cures most locks before the spend step is reached.
        const ex = strategy.decideExtraTile ? strategy.decideExtraTile(gameState) : null;
        if (ex !== null && ex !== undefined) gameState = takeExtraTile(gameState, ex);
        gameState = place(gameState, strategy.decidePlacements(gameState));
        break;
      }
      case 'spend': {
        const lockedNow = claimableCount(gameState) === 0;
        const m = strategy.decideMove ? strategy.decideMove(gameState) : null;
        if (m) gameState = moveTile(gameState, m.fromIndex, m.toIndex);
        const rp = strategy.decideRemovePlate ? strategy.decideRemovePlate(gameState) : null;
        if (rp !== null && rp !== undefined) gameState = removePlate(gameState, rp);
        const dc = strategy.decideDealCards ? strategy.decideDealCards(gameState) : false;
        if (dc) { gameState = dealCards(gameState); spendStats.deals++; if (lockedNow) spendStats.dealsOnLocked++; }
        const rc = strategy.decideReserve ? strategy.decideReserve(gameState) : null;
        if (rc !== null && rc !== undefined) gameState = reserveCard(gameState, rc);
        gameState = skipSpend(gameState);
        break;
      }
      case 'claim': {
        spendStats.claimSteps++;
        if (claimableCount(gameState) === 0) spendStats.lockedSteps++;
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
      case 'refill': {
        // A pot is detected by the market REFILLING, not by a stats counter -
        // the counter's name has moved before and a silent zero here would read
        // as "no channel exists", which is the opposite of the truth.
        const fillBefore = marketFill(gameState);
        gameState = refill(gameState);
        if (marketFill(gameState) > fillBefore) { chan.pots++; chan.fillBrewer += fillBefore; potJustPoured = true; }
        break;
      }
      default:
        throw new Error(`unknown phase ${gameState.gamePhase}`);
    }
    steps++;
  }
  calculateFinalScores(gameState);
  return { gameState, freeCellTrace, chan, spendStats };
}

function pct(a, b) { return b === 0 ? 0 : (100 * a / b); }

console.log(`LOPIANO-LENS PROBE (9 August engine) - ${GAMES} games per player count, basicBot\n`);

for (const playerCount of [2, 3, 4]) {
  let stand = 0, crumb = 0, cards = 0, menus = 0, flavTile = 0, flavMaj = 0, total = 0, players = 0;
  let turns = 0, games = 0;
  const endReasons = {};
  let freeAtStart = 0, freeAtEnd = 0, monotoneBreaks = 0, traceGames = 0;
  let pots = 0, fillBrewer = 0, fillNext = 0;
  let lockedSteps = 0, claimSteps = 0, deals = 0, dealsOnLocked = 0;

  for (let g = 0; g < GAMES; g++) {
    const { gameState, freeCellTrace, chan, spendStats } = runGame(playerCount);
    games++;
    turns += gameState.stats.turnsPlayed;
    endReasons[gameState.endGameReason || 'none'] = (endReasons[gameState.endGameReason || 'none'] || 0) + 1;
    pots += chan.pots; fillBrewer += chan.fillBrewer; fillNext += chan.fillNext;
    lockedSteps += spendStats.lockedSteps; claimSteps += spendStats.claimSteps;
    deals += spendStats.deals; dealsOnLocked += spendStats.dealsOnLocked;

    const leaders = new Set(isFlavourInPlay(gameState) ? getFlavourLeaders(gameState) : []);
    for (const p of gameState.players) {
      players++;
      stand += standScore(p);
      crumb += p.crumbTray.length;
      cards += cardScore(p);
      menus += p.tastingMenus.length * TASTING_MENU_VP;
      if (isFlavourInPlay(gameState)) {
        flavTile += getFlavourCount(gameState, p) * FLAVOUR_VP_PER_TILE;
        if (leaders.has(p.id)) flavMaj += FLAVOUR_MAJORITY_VP;
      }
      total += p.score;
    }
    const p0 = freeCellTrace.filter(t => t.player === 0).map(t => t.free);
    if (p0.length > 1) {
      traceGames++;
      freeAtStart += p0[0];
      freeAtEnd += p0[p0.length - 1];
      for (let i = 1; i < p0.length; i++) if (p0[i] > p0[i - 1]) monotoneBreaks++;
    }
  }

  const row = (label, v) => `    ${label.padEnd(24)}${(v / players).toFixed(2).padStart(6)}  ${pct(v, total).toFixed(1)}%`;
  console.log(`--- ${playerCount} PLAYERS ---`);
  console.log(`Mean score ${(total / players).toFixed(1)} over ${(turns / games / playerCount).toFixed(2)} turns/player`);
  console.log(`  Scoring lanes (mean VP/player, share of score):`);
  console.log(row('Cake stand rows', stand) + '   [count, convex]');
  console.log(row('Card VP', cards) + '   [count, flat]');
  console.log(row('Tasting Menus', menus) + '   [count, flat - race-gated]');
  console.log(row('Flavour: per tile', flavTile) + '   [count, flat]');
  console.log(row('Flavour: the majority', flavMaj) + '   [RANK - the only one]');
  console.log(row('Crumb tray', crumb) + '   [count, flat]');
  console.log(`    ${'PRODUCT lanes'.padEnd(24)}  0.00    0.0%   [none exist]`);
  console.log(`  End condition: ${Object.entries(endReasons).map(([k, v]) => `${k} ${pct(v, games).toFixed(1)}%`).join(', ')}`);
  console.log(`  Seat-1 board free cells: ${(freeAtStart / traceGames).toFixed(1)} at first sweep -> ${(freeAtEnd / traceGames).toFixed(1)} at last`);
  console.log(`  Turns where free cells ROSE (would break the clock): ${monotoneBreaks} across ${traceGames} games`);
  console.log(`  CHANNEL (a fresh pot of tea): ${(pots / games).toFixed(2)} pots/game`);
  console.log(`    market fill the BREWER swept from: ${(fillBrewer / pots).toFixed(1)} of 25`);
  console.log(`    market fill the NEXT SEAT swept from: ${(fillNext / Math.max(1, pots)).toFixed(1)} of 25`);
  console.log(`    the brewer is paid 1 cupcake in the same act`);
  console.log(`  PAID CARD DEAL: bought ${(deals / games).toFixed(2)}/game; ${pct(dealsOnLocked, lockedSteps).toFixed(1)}% of locked steps bought it`);
  console.log(`    claim steps locked: ${pct(lockedSteps, claimSteps).toFixed(1)}%\n`);
}

console.log('--- SLOWEST LEGAL LINE (every player always takes the smallest legal sweep) ---');
for (const playerCount of [2, 3, 4]) {
  const N = Math.min(GAMES, 300);
  let turns = 0, scores = 0, players = 0;
  const endReasons = {};
  for (let g = 0; g < N; g++) {
    const { gameState } = runGame(playerCount, { minSweep: true });
    turns += gameState.stats.turnsPlayed;
    endReasons[gameState.endGameReason || 'none'] = (endReasons[gameState.endGameReason || 'none'] || 0) + 1;
    for (const p of gameState.players) { players++; scores += p.score; }
  }
  console.log(`  ${playerCount}p, ${N} games: ${(turns / N / playerCount).toFixed(2)} turns/player, mean score ${(scores / players).toFixed(1)}`);
  console.log(`    End condition: ${Object.entries(endReasons).map(([k, v]) => `${k} ${pct(v, N).toFixed(1)}%`).join(', ')}`);
}
