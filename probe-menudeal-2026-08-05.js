// PROBE: HOW MANY TASTING MENUS SHOULD BE DEALT, BY PLAYER COUNT?
//
// The build ships one per player because that is what the UNSTEERED sweep in
// probe-goalcards-2026-08-05.js supported: extra cards looked useless there,
// lifting qualification only from 18.8% to 33.5% while dead cardboard sat flat at
// 80-81%. That sweep was run against a bot that had never heard of the module, so
// it could not see the one thing deal size actually controls: CHOICE. A steering
// player with five menus on the table picks the one their stand is nearest to. A
// player with three takes what they are given.
//
// So this re-runs the question with the menu-aware bot, and it is looking at a
// different balance from the first sweep. At 3p, one per player currently gives:
//
//   dead cardboard 54.4%  |  0.46 menus/player  |  0.113 contested menus/game
//
// Dead cardboard is just the wrong side of half, and the CONTESTED figure - two or
// more players wanting the same card - is the whole justification for the module.
// At 0.113 a game the race is essentially theoretical. Both point the same way:
//
//   DEAL FEWER  -> scarcer, so more players chase the same card (contested up),
//                  less dead cardboard, but more players shut out with nothing.
//   DEAL MORE   -> more choice, so more players find a reachable target
//                  (menus/player up), but supply outruns demand and the dead
//                  share climbs, and the race dies completely.
//
// The right answer is the smallest deal that does not shut out too many players,
// and this probe is here to find where that is at each count.
//
// Deals are PINNED from a deterministic shuffle keyed to the game index, so a
// deal of 3 is a strict prefix of the deal of 5 in the same game. Deal size is
// therefore the only variable moving between rows of the sweep.
import {
  createGame, sweep, takeBonusTile, declineBonusTile, takeExtraTile, place, claim,
  skipClaim, skipSpend, moveTile, removePlate, reserveCard, refill,
  calculateFinalScores, getWinningPlayers, getStandIngredients,
  TASTING_MENUS, satisfiesMenu, TASTING_MENU_VP,
} from './src/engine/game.js';
import { createStatsCollector } from './src/engine/statsCollector.js';
import * as basicBot from './src/bots/basicBot.js';

// Deterministic shuffle of the ten menu ids, keyed by game index. Not Math.random:
// the whole point is that deal N and deal N+1 share a prefix in the same game.
function dealFor(gameIndex, count) {
  const ids = TASTING_MENUS.map(m => m.id);
  let s = (gameIndex * 2654435761) >>> 0;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return ids.slice(0, count);
}

function runGame(playerConfigs, menuIds) {
  const strategy = basicBot;
  let gameState = createGame(playerConfigs, createStatsCollector(), { tastingMenus: menuIds });
  let steps = 0;
  let firstTakeTurn = null;
  let takenByThird = [0, 0, 0];
  let seenTaken = 0;

  while (!gameState.gameOver && steps < 1000) {
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
        const d = strategy.decideClaim(gameState);
        if (d && d.cardId) gameState = claim(gameState, d.cardId, d.removedBoardIndex, d.destination);
        else gameState = skipClaim(gameState);
        // A menu can only be taken on a claim, so this is the only place the
        // count can change. Recording WHEN matters as much as how many: a module
        // whose targets all fall at the death is an end-of-game bonus, not a
        // pressure device.
        const nowTaken = gameState.tastingMenus.filter(m => m.takenBy !== null).length;
        if (nowTaken > seenTaken) {
          if (firstTakeTurn === null) firstTakeTurn = gameState.stats.turnsPlayed;
          seenTaken = nowTaken;
        }
        break;
      }
      case 'refill':
        gameState = refill(gameState);
        break;
    }
    steps++;
  }
  if (gameState.gameOver) calculateFinalScores(gameState);

  const turns = gameState.stats.turnsPlayed;
  const winners = getWinningPlayers(gameState);

  // CONTESTED: dealt menus that two or more FINAL stands satisfy. Read off end
  // state, so it sees overlap but not order - a player who was beaten to a card
  // still counts, which is what makes it a fair proxy for "we both wanted that".
  let contested = 0;
  for (const menu of gameState.tastingMenus) {
    let n = 0;
    for (const p of gameState.players) if (satisfiesMenu(getStandIngredients(p), menu)) n++;
    if (n > 1) contested++;
  }

  return {
    dealt: gameState.tastingMenus.length,
    taken: gameState.tastingMenus.filter(m => m.takenBy !== null).length,
    contested,
    turns,
    firstTakeFrac: firstTakeTurn === null ? null : firstTakeTurn / Math.max(1, turns),
    perPlayer: gameState.players.map(p => ({
      menus: p.tastingMenus.length,
      score: p.score,
      won: winners.some(w => w.id === p.id),
    })),
  };
}

const GAMES = parseInt(process.argv[2]) || 1500;
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

console.log(`\nTASTING MENU - DEAL SIZE SWEEP (${GAMES} games per row, basicBot, menu-aware)\n`);
console.log('"shut out" is the share of players finishing with NO menu at all. It is the cost of');
console.log('dealing fewer, and the reason this is not simply "deal as few as possible".\n');

for (const players of [2, 3, 4]) {
  const cfg = Array.from({ length: players }, (_, i) => ({ id: i, name: `P${i}`, type: 'ai' }));
  console.log(`--- ${players} PLAYERS ---`);
  console.log('  dealt  per-plr  dose VP   dead    contested/game   shut out   1+ menu   1st take   seat spread');
  for (let deal = Math.max(2, players - 1); deal <= players + 3 && deal <= TASTING_MENUS.length; deal++) {
    const results = [];
    for (let g = 0; g < GAMES; g++) results.push(runGame(cfg, dealFor(g, deal)));

    const flat = results.flatMap(r => r.perPlayer);
    const perPlayer = mean(flat.map(p => p.menus));
    const dead = 1 - mean(results.map(r => r.taken / r.dealt));
    const contested = mean(results.map(r => r.contested));
    const shutOut = flat.filter(p => p.menus === 0).length / flat.length;
    const firsts = results.map(r => r.firstTakeFrac).filter(x => x !== null);
    // Seat spread: biggest minus smallest mean menus by seat. Must stay near zero
    // or the module has reintroduced the seat bias the Teapot Track was killed for.
    const bySeat = Array.from({ length: players }, (_, s) => mean(results.map(r => r.perPlayer[s].menus)));
    const spread = Math.max(...bySeat) - Math.min(...bySeat);

    console.log(
      `  ${String(deal).padStart(5)}  ${perPlayer.toFixed(2).padStart(7)}  ${(perPlayer * TASTING_MENU_VP).toFixed(2).padStart(7)}  ` +
      `${(100 * dead).toFixed(1).padStart(5)}%  ${contested.toFixed(3).padStart(14)}   ` +
      `${(100 * shutOut).toFixed(1).padStart(7)}%  ${(100 * (1 - shutOut)).toFixed(1).padStart(7)}%  ` +
      `${(100 * mean(firsts)).toFixed(0).padStart(8)}%  ${spread.toFixed(3).padStart(11)}`,
    );
  }
  console.log('');
}
console.log('Read: dose should land near 4-5 VP/player (the Freshness Bonus it replaced paid 9.0,');
console.log('measured too high). Dead cardboard wants to be under 50%. Contested is the race and');
console.log('bigger is better. Shut out is what you are spending to get it.\n');
