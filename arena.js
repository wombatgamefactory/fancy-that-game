// TEMPORARY head-to-head harness (step 6 of the rules rework). Delete when done.
//
// simulate.js runs one strategy in every seat. This runs a DIFFERENT strategy per
// seat so the new basicBot can be played against the old one, with seats rotated
// game by game so no result is a seat-order artefact.
//
// Usage: node arena.js <games> <playerCount> <modA> <modB>
//   where modA/modB are module names under src/bots/ (without .js).
import { createGame, sweep, takeBonusTile, declineBonusTile, dealCards, takeExtraTile, place, claim, skipClaim, skipSpend, moveTile, removePlate, reserveCard, refill, calculateFinalScores, getWinningPlayers } from './src/engine/game.js';

const games = parseInt(process.argv[2]) || 100;
const playerCount = parseInt(process.argv[3]) || 2;
const nameA = process.argv[4] || 'basicBot';
const nameB = process.argv[5] || 'oldBasicBot';

const modA = await import(`./src/bots/${nameA}.js`);
const modB = await import(`./src/bots/${nameB}.js`);

function runGame(strategies) {
  const playerConfigs = strategies.map((_, i) => ({ name: `Bot ${i + 1}`, aiDifficulty: 'basic', isHuman: false }));
  let gameState = createGame(playerConfigs, null);
  let steps = 0;
  while (!gameState.gameOver && steps < 2000) {
    const strategy = strategies[gameState.currentPlayerIndex];
    switch (gameState.gamePhase) {
      case 'sweep': {
        if (gameState.bonusTileAvailable) {
          const bonusIdx = strategy.decideBonusTile(gameState);
          if (bonusIdx !== null && bonusIdx !== undefined && gameState.market[bonusIdx]) gameState = takeBonusTile(gameState, bonusIdx);
          else gameState = declineBonusTile(gameState);
          break;
        }
        // 1 August: tea is no longer a start-of-turn decision - refill() fires
        // it at the end of a turn. 3 August: it is mechanical too, so there is no
        // reserve round to drive and no phase to park in.
        const decision = strategy.decideSweep(gameState);
        if (decision) gameState = sweep(gameState, decision.rowOrCol, decision.isRow, decision.declaration, decision.declarationType);
        else gameState.gamePhase = 'place';
        break;
      }
      case 'place': {
        // The extra tile is bought here, before placements are chosen (deleted
        // 8 August, restored 9 August). The paid 2-card deal is a spend-step
        // action and stays below; both are on the menu.
        // A LOOP SINCE 9 AUGUST (second revision) - the tile is uncapped, so ask
        // again after each purchase and let the engine's gates end it.
        for (let n = 0; n < 25; n++) {
          const ex = strategy.decideExtraTile ? strategy.decideExtraTile(gameState) : null;
          if (ex === null || ex === undefined) break;
          gameState = takeExtraTile(gameState, ex);
        }
        gameState = place(gameState, strategy.decidePlacements(gameState));
        break;
      }
      case 'spend': {
        const mv = strategy.decideMove ? strategy.decideMove(gameState) : null;
        if (mv) gameState = moveTile(gameState, mv.fromIndex, mv.toIndex);
        const rp = strategy.decideRemovePlate ? strategy.decideRemovePlate(gameState) : null;
        if (rp !== null && rp !== undefined) gameState = removePlate(gameState, rp);
        // 8 August: 1 cupcake, 2 new cards on the row, claimable this same turn.
        if (strategy.decideDealCards && strategy.decideDealCards(gameState)) gameState = dealCards(gameState);
        const rc = strategy.decideReserve ? strategy.decideReserve(gameState) : null;
        if (rc !== null && rc !== undefined) gameState = reserveCard(gameState, rc);
        gameState = skipSpend(gameState);
        break;
      }
      case 'claim': {
        const d = strategy.decideClaim(gameState);
        if (d && d.cardId) gameState = claim(gameState, d.cardId, d.removedBoardIndex, d.destination);
        else gameState = skipClaim(gameState);
        break;
      }
      case 'refill':
        gameState = refill(gameState);
        break;
    }
    steps++;
  }
  if (gameState.gameOver) calculateFinalScores(gameState);
  return gameState;
}

// Seat rotation: game i puts A in seats { i, i+2, ... } so both arms play every
// seat an equal number of times (turn order matters a lot here - the flusher
// sweeps first).
let winsA = 0, winsB = 0, draws = 0, scoreA = 0, scoreB = 0, nA = 0, nB = 0;
const endReasons = {};
let unfinished = 0;
for (let g = 0; g < games; g++) {
  const isA = [];
  for (let i = 0; i < playerCount; i++) isA.push(((i + g) % 2) === 0);
  // Guarantee at least one of each arm at odd player counts.
  if (isA.every(v => v)) isA[0] = false;
  if (isA.every(v => !v)) isA[0] = true;
  const strategies = isA.map(v => (v ? modA : modB));
  const st = runGame(strategies);
  if (!st.gameOver) unfinished++;
  endReasons[st.endGameReason || 'none'] = (endReasons[st.endGameReason || 'none'] || 0) + 1;
  const scores = st.players.map(p => p.score);
  // 3 August: a tie on raw score is broken by cupcakes, then by cards claimed, so
  // the arena must ask the engine who won rather than comparing scores itself -
  // otherwise every cupcake-broken tie is reported as a shared win.
  const winners = getWinningPlayers(st).map(p => p.id);
  const anyA = winners.some(i => isA[i]);
  const anyB = winners.some(i => !isA[i]);
  if (anyA && anyB) draws++;
  else if (anyA) winsA++;
  else winsB++;
  for (let i = 0; i < playerCount; i++) {
    if (isA[i]) { scoreA += scores[i]; nA++; } else { scoreB += scores[i]; nB++; }
  }
}

const decisive = winsA + winsB;
console.log(`${nameA} vs ${nameB} @ ${playerCount}p, ${games} games`);
console.log(`  wins: ${nameA}=${winsA}  ${nameB}=${winsB}  shared=${draws}`);
console.log(`  ${nameA} win share of decisive games: ${decisive ? (100 * winsA / decisive).toFixed(1) : 'n/a'}%`);
console.log(`  mean score: ${nameA}=${(scoreA / nA).toFixed(2)} (n=${nA})  ${nameB}=${(scoreB / nB).toFixed(2)} (n=${nB})`);
// Since 4 August a reason names WHICH CONDITION ARMED the ending, not where play
// stopped - the game finishes the round after it fires so every seat gets equal
// turns, and the FIRST reason to arm is the one kept. Since 6 August there are
// only two: 'boardFull' (a player's board is completely full) and 'marketTiles'
// (market and bag both empty), and the second is a backstop that essentially
// never fires. Expect 'boardFull' on effectively every game; anything else in
// this line, at any rate, is worth looking at.
console.log(`  end reasons: ${JSON.stringify(endReasons)}  unfinished=${unfinished}`);
