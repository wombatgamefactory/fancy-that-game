// WOULD UNCAPPING THE CUPCAKE SPENDS CHANGE ANYTHING? (3 August)
//
// The rules currently allow, per turn: ONE move (tile or empty plate), ONE extra
// tile, ONE reserve. Players at the table repeatedly assume they can do several.
// This probe asks whether the caps are the thing actually limiting spending, or
// whether supply and the one-claim-per-turn rule are doing that job already.
//
// It measures three things, two of them bot-independent:
//
//   A. AFFORDABILITY. Cupcakes held at the start of each spend step, and how
//      often a player could have paid for a second spend of any kind. If this is
//      low the cap is decorative.
//
//   B. THE TWO-TILE UNLOCK (bot-independent, combinatorial). At the extra-tile
//      step, a card-locked player is checked for: curable by ONE extra tile, and
//      curable by TWO but not one. The second number is the only genuinely NEW
//      capability uncapping grants - a pattern two tiles short is unreachable at
//      the current allowance no matter how many cupcakes you are sitting on.
//
//   C. THE SECOND MOVE. After the bot's one move resolves, is the player still
//      card-locked, and would a second tile move cure it? With one claim per turn
//      a second move that completes a SECOND card is worth nothing, so this
//      isolates the case that matters: the first move was not enough on its own.
//
// Plus terminal unspent cupcakes, for the "is anyone even short of them" question.
import {
  createGame, sweep, takeBonusTile, declineBonusTile, takeExtraTile, place, claim,
  skipClaim, skipSpend, moveTile, removePlate, reserveCard, refill, calculateFinalScores,
  getPatternMatches, getValidPlacements, getMoveCost,
  MOVE_TILE_CUPCAKE_COST, EXTRA_TILE_CUPCAKE_COST,
} from './src/engine/game.js';
import { createStatsCollector } from './src/engine/statsCollector.js';
import * as bot from './src/bots/basicBot.js';

const GAMES = parseInt(process.argv[2] || '400', 10);

function candidateCards(gameState, player) {
  return [...gameState.cardMarket, ...player.reservedCards];
}

function isLocked(board, cards) {
  for (const c of cards) if (getPatternMatches(board, c.pattern).length > 0) return false;
  return true;
}

// Colours currently sitting in the tile market - the only ones an extra tile can buy.
function marketColours(gameState) {
  const s = new Set();
  for (const t of gameState.market) if (t) s.add(t.colour);
  return [...s];
}

// Can N extra tiles of freely-chosen market colours unlock a claim? N is 1 or 2.
function unlockableWithExtraTiles(board, cards, colours, n) {
  const spots = getValidPlacements(board);
  if (spots.length < n) return false;
  if (n === 1) {
    for (const colour of colours) {
      for (const i of spots) {
        const b = board.slice();
        b[i] = { colour, ingredient: 'probe' };
        if (!isLocked(b, cards)) return true;
      }
    }
    return false;
  }
  for (const c1 of colours) {
    for (const i of spots) {
      const b1 = board.slice();
      b1[i] = { colour: c1, ingredient: 'probe' };
      for (const c2 of colours) {
        for (const j of spots) {
          if (j === i) continue;
          const b2 = b1.slice();
          b2[j] = { colour: c2, ingredient: 'probe' };
          if (!isLocked(b2, cards)) return true;
        }
      }
    }
  }
  return false;
}

// Would ONE more tile move (any tile to any empty cell) cure a lock?
function unlockableWithOneMove(board, cards) {
  const spots = getValidPlacements(board);
  for (let from = 0; from < board.length; from++) {
    const cell = board[from];
    if (cell === null || cell === undefined) continue;
    if (cell.type === 'blocked') continue; // tile move only, the 1-cupcake price
    for (const to of spots) {
      const b = board.slice();
      b[to] = b[from];
      b[from] = null;
      if (!isLocked(b, cards)) return true;
    }
  }
  return false;
}

function runGame(playerCount, acc) {
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
        // --- MEASUREMENT B: the two-tile unlock ------------------------------
        // Taken on the projected board (swept tiles placed as the bot intends),
        // which is the same basis decideExtraTile uses.
        {
          const player = s.players[s.currentPlayerIndex];
          const cards = candidateCards(s, player).filter(c => c.id !== s.reservedCardIdThisTurn);
          const projected = [...player.board];
          const plan = s.pendingSweepTiles.length > 0 ? bot.decidePlacements(s) : [];
          for (let i = 0; i < plan.length; i++) if (plan[i] >= 0) projected[plan[i]] = s.pendingSweepTiles[i];
          if (cards.length > 0 && isLocked(projected, cards)) {
            acc.lockedAtExtraStep++;
            const colours = marketColours(s);
            const one = unlockableWithExtraTiles(projected, cards, colours, 1);
            if (one) acc.curableByOne++;
            else if (unlockableWithExtraTiles(projected, cards, colours, 2)) {
              acc.curableByTwoOnly++;
              if (player.cupcakes >= 2 * EXTRA_TILE_CUPCAKE_COST) acc.curableByTwoOnlyAfforded++;
            }
          }
        }
        const x = bot.decideExtraTile ? bot.decideExtraTile(s) : null;
        if (x !== null && x !== undefined) s = takeExtraTile(s, x);
        const placements = bot.decidePlacements(s);
        s = place(s, placements);
        break;
      }
      case 'spend': {
        // --- MEASUREMENT A: affordability at the spend step -------------------
        const pre = s.players[s.currentPlayerIndex];
        acc.spendSteps++;
        acc.cupcakesHeldSum += pre.cupcakes;
        if (pre.cupcakes >= 2) acc.couldAffordTwo++;

        const md = bot.decideMove ? bot.decideMove(s) : null;
        if (md) { s = moveTile(s, md.fromIndex, md.toIndex); acc.movesMade++; }
        const rp = bot.decideRemovePlate ? bot.decideRemovePlate(s) : null;
        if (rp !== null && rp !== undefined) s = removePlate(s, rp);
        const rid = bot.decideReserve ? bot.decideReserve(s) : null;
        if (rid !== null && rid !== undefined) { s = reserveCard(s, rid); acc.reservesMade++; }

        // --- MEASUREMENT C: is a SECOND move wanted? --------------------------
        {
          const player = s.players[s.currentPlayerIndex];
          const cards = candidateCards(s, player).filter(c => c.id !== s.reservedCardIdThisTurn);
          if (cards.length > 0 && isLocked(player.board, cards)) {
            acc.lockedAfterSpend++;
            if (unlockableWithOneMove(player.board, cards)) {
              acc.lockedButOneMoveCures++;
              // Only NEW if the allowance is what stopped them - i.e. they
              // already moved this turn, and can still pay.
              if (s.moveUsedThisTurn && player.cupcakes >= MOVE_TILE_CUPCAKE_COST) acc.secondMoveWouldCure++;
              if (!s.moveUsedThisTurn) acc.botDeclinedACuringMove++;
            }
          }
        }
        s = skipSpend(s);
        break;
      }
      case 'claim': {
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
    acc.terminalCupcakes.push(p.cupcakes);
    if (p.cupcakes >= 4) acc.playersEndingWith4Plus++;
    acc.playerCount++;
  }
  return s;
}

function blank() {
  return {
    games: 0, turns: 0, playerCount: 0,
    spendSteps: 0, cupcakesHeldSum: 0, couldAffordTwo: 0,
    movesMade: 0, reservesMade: 0,
    lockedAtExtraStep: 0, curableByOne: 0, curableByTwoOnly: 0, curableByTwoOnlyAfforded: 0,
    lockedAfterSpend: 0, lockedButOneMoveCures: 0, secondMoveWouldCure: 0, botDeclinedACuringMove: 0,
    terminalCupcakes: [], playersEndingWith4Plus: 0,
  };
}

const pct = (a, b) => b === 0 ? '  n/a' : (100 * a / b).toFixed(1) + '%';

for (const pc of [2, 3, 4]) {
  const acc = blank();
  for (let g = 0; g < GAMES; g++) runGame(pc, acc);
  const meanTerm = acc.terminalCupcakes.reduce((a, b) => a + b, 0) / acc.terminalCupcakes.length;

  console.log(`\n===== ${pc} PLAYERS  (${acc.games} games, ${(acc.turns / acc.games).toFixed(1)} turns/game) =====`);
  console.log(`A. AFFORDABILITY`);
  console.log(`   mean cupcakes held entering the spend step : ${(acc.cupcakesHeldSum / acc.spendSteps).toFixed(2)}`);
  console.log(`   spend steps able to afford 2+ cupcakes     : ${pct(acc.couldAffordTwo, acc.spendSteps)}  (${acc.couldAffordTwo}/${acc.spendSteps})`);
  console.log(`   moves actually bought / spend step         : ${pct(acc.movesMade, acc.spendSteps)}`);
  console.log(`   reserves actually bought / spend step      : ${pct(acc.reservesMade, acc.spendSteps)}`);
  console.log(`   mean cupcakes UNSPENT at game end          : ${meanTerm.toFixed(2)}  (${pct(acc.playersEndingWith4Plus, acc.playerCount)} of players end on 4+)`);
  console.log(`B. THE TWO-TILE UNLOCK  (bot-independent)`);
  console.log(`   locked turns seen at the extra-tile step   : ${acc.lockedAtExtraStep}`);
  console.log(`   ...curable by ONE extra tile (legal today) : ${pct(acc.curableByOne, acc.lockedAtExtraStep)}`);
  console.log(`   ...curable ONLY by TWO (illegal today)     : ${pct(acc.curableByTwoOnly, acc.lockedAtExtraStep)}`);
  console.log(`   ...of those, could afford both tiles       : ${pct(acc.curableByTwoOnlyAfforded, acc.curableByTwoOnly)}`);
  console.log(`C. THE SECOND MOVE`);
  console.log(`   still locked after the spend step          : ${acc.lockedAfterSpend}`);
  console.log(`   ...one tile move would cure it             : ${pct(acc.lockedButOneMoveCures, acc.lockedAfterSpend)}`);
  console.log(`   ...and the ALLOWANCE is what blocked it    : ${pct(acc.secondMoveWouldCure, acc.lockedAfterSpend)}  (${acc.secondMoveWouldCure})`);
  console.log(`   ...bot simply declined a curing move       : ${pct(acc.botDeclinedACuringMove, acc.lockedAfterSpend)}  (bot quality, not rules)`);
}
