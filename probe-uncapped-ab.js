// A/B: DOES UNCAPPING THE EXTRA TILE ACTUALLY CONVERT? (3 August)
//
// probe-cupcake-cap.js found that a third of card-locked turns are curable ONLY
// by two extra tiles, and that the player could nearly always afford both. That
// is a measure of OPPORTUNITY. This probe measures whether taking it changes the
// game: it runs the same bot under two rule sets and compares the claim-step lock
// rate, cards claimed, score and game length.
//
//   BASELINE  - the live rules: one extra tile per turn.
//   UNCAPPED  - the extra tile may be bought repeatedly (the engine's per-turn
//               flag is cleared after each purchase). Nothing else changes: the
//               move stays capped, one claim per turn stays, prices are the same.
//
// The bot is extended for the UNCAPPED arm only, because basicBot.decideExtraTile
// evaluates ONE tile against ONE cell and structurally cannot see a two-tile
// unlock. Without that extension the arm would buy nothing and the A/B would
// report a null result that is purely an artefact of bot vision.
import {
  createGame, sweep, takeBonusTile, declineBonusTile, takeExtraTile, place, claim,
  skipClaim, skipSpend, moveTile, removePlate, reserveCard, refill, calculateFinalScores,
  getPatternMatches, getValidPlacements,
} from './src/engine/game.js';
import { createStatsCollector } from './src/engine/statsCollector.js';
import * as bot from './src/bots/basicBot.js';

const GAMES = parseInt(process.argv[2] || '300', 10);

const isLocked = (board, cards) => !cards.some(c => getPatternMatches(board, c.pattern).length > 0);

// Market indices, one per distinct colour - what an extra-tile purchase can pick.
function colourIndex(gameState) {
  const m = new Map();
  for (let i = 0; i < gameState.market.length; i++) {
    const t = gameState.market[i];
    if (t && !m.has(t.colour)) m.set(t.colour, i);
  }
  return m;
}

// The pair of market indices whose tiles jointly unlock a claim, or null. Only
// consulted once a single tile has been shown not to do it.
function findTwoTileUnlock(board, cards, cIdx) {
  const spots = getValidPlacements(board);
  if (spots.length < 2) return null;
  const colours = [...cIdx.keys()];
  for (const c1 of colours) {
    for (const i of spots) {
      const b1 = board.slice();
      b1[i] = { colour: c1, ingredient: 'probe' };
      for (const c2 of colours) {
        for (const j of spots) {
          if (j === i) continue;
          const b2 = b1.slice();
          b2[j] = { colour: c2, ingredient: 'probe' };
          if (!isLocked(b2, cards)) return [cIdx.get(c1), cIdx.get(c2)];
        }
      }
    }
  }
  return null;
}

function runGame(playerCount, uncapped, acc) {
  const sc = createStatsCollector();
  let s = createGame(Array.from({ length: playerCount }, (_, i) => ({ id: i, name: 'P' + i, type: 'ai' })), sc);
  let steps = 0;

  while (!s.gameOver && steps < 1000) {
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
        if (x !== null && x !== undefined) { s = takeExtraTile(s, x); acc.extraTiles++; }

        if (uncapped) {
          // The two-tile reach the capped rule forbids. Evaluated on the
          // projected board - the same basis decideExtraTile uses - so it only
          // fires when the sweep itself does not already clear the lock.
          const player = s.players[s.currentPlayerIndex];
          const cards = [...s.cardMarket, ...player.reservedCards].filter(c => c.id !== s.reservedCardIdThisTurn);
          const projected = [...player.board];
          const plan = s.pendingSweepTiles.length > 0 ? bot.decidePlacements(s) : [];
          for (let i = 0; i < plan.length; i++) if (plan[i] >= 0) projected[plan[i]] = s.pendingSweepTiles[i];
          // Room for two more tiles AND the two purchases, on a locked board.
          if (cards.length > 0 && player.cupcakes >= 2 && isLocked(projected, cards)
              && getValidPlacements(projected).length >= plan.length + 2) {
            const pair = findTwoTileUnlock(projected, cards, colourIndex(s));
            if (pair) {
              s.extraTileUsedThisTurn = false;
              s = takeExtraTile(s, pair[0]);
              s.extraTileUsedThisTurn = false;
              const second = s.market[pair[1]] ? pair[1] : s.market.findIndex(t => t);
              if (second >= 0) { s = takeExtraTile(s, second); acc.doubleBuys++; }
              acc.extraTiles += 2;
            }
          }
        }

        const placements = bot.decidePlacements(s);
        s = place(s, placements);
        break;
      }
      case 'spend': {
        const md = bot.decideMove ? bot.decideMove(s) : null;
        if (md) s = moveTile(s, md.fromIndex, md.toIndex);
        const rp = bot.decideRemovePlate ? bot.decideRemovePlate(s) : null;
        if (rp !== null && rp !== undefined) s = removePlate(s, rp);
        const rid = bot.decideReserve ? bot.decideReserve(s) : null;
        if (rid !== null && rid !== undefined) s = reserveCard(s, rid);
        s = skipSpend(s);
        break;
      }
      case 'claim': {
        // THE HEADLINE MEASURE: is the player locked at the moment of claiming?
        const player = s.players[s.currentPlayerIndex];
        const cards = [...s.cardMarket, ...player.reservedCards].filter(c => c.id !== s.reservedCardIdThisTurn);
        if (cards.length > 0) {
          acc.claimSteps++;
          if (isLocked(player.board, cards)) acc.locked++;
        }
        const d = bot.decideClaim(s);
        if (d && d.cardId) s = claim(s, d.cardId, d.removedBoardIndex, d.destination);
        else s = skipClaim(s);
        break;
      }
      case 'refill': s = refill(s); break;
    }
    steps++;
  }

  if (s.gameOver) calculateFinalScores(s);
  acc.games++;
  acc.turns += s.stats.turnsPlayed;
  for (const p of s.players) {
    acc.scoreSum += p.score ?? 0;
    acc.cardsSum += p.claimedCards.length;
    acc.terminalCupcakes += p.cupcakes;
    acc.players++;
  }
}

const blank = () => ({ games: 0, turns: 0, players: 0, scoreSum: 0, cardsSum: 0, terminalCupcakes: 0, claimSteps: 0, locked: 0, extraTiles: 0, doubleBuys: 0 });

for (const pc of [2, 3, 4]) {
  const arms = {};
  for (const uncapped of [false, true]) {
    const acc = blank();
    for (let g = 0; g < GAMES; g++) runGame(pc, uncapped, acc);
    arms[uncapped ? 'UNCAPPED' : 'BASELINE'] = acc;
  }
  console.log(`\n===== ${pc} PLAYERS  (${GAMES} games per arm) =====`);
  console.log('                          BASELINE   UNCAPPED');
  const row = (label, f, dp = 2) => {
    const a = f(arms.BASELINE), b = f(arms.UNCAPPED);
    console.log(`  ${label.padEnd(24)}${a.toFixed(dp).padStart(8)}${b.toFixed(dp).padStart(11)}`);
  };
  row('claim-step lock rate %', a => 100 * a.locked / a.claimSteps, 1);
  row('cards claimed / player', a => a.cardsSum / a.players);
  row('mean score', a => a.scoreSum / a.players);
  row('turns / game', a => a.turns / a.games, 1);
  row('extra tiles / game', a => a.extraTiles / a.games);
  row('double-buys / game', a => a.doubleBuys / a.games);
  row('unspent cupcakes / player', a => a.terminalCupcakes / a.players);
}
