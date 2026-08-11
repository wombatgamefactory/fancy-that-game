import { getValidSweeps, getValidPlacements, getPatternMatches, canClaimMore } from '../engine/game.js';
import { decideDestination, decideDealCards as basicDealCards, decideExtraTile as basicExtraTile, decideMove as basicMove, decideRemovePlate as basicRemovePlate } from './basicBot.js';

// decideOrderTea is gone (1 August): tea is no longer a decision, it fires from
// the engine at the end of any turn that leaves four teapots showing. The tea
// ROUND is gone too (3 August), and with it the free reserve.
//
// The PAID decisions that replaced it reuse the basicBot heuristics (cheap
// window scans, no rollout cost). The fast bot is random about sweeps and
// placements precisely so the cupcake economy is the part being measured;
// leaving those random would make every cupcake figure noise.
//
// (One of them was the paid RESERVE, delegated here from 3 August. It was
// deleted from the game on 11 August and this delegation went with it.)

// CAVEAT worth knowing when reading fast-bot cupcake numbers: basicExtraTile
// projects the board forward using basicBot's placement plan, and this bot places
// at random. So it buys against a better placement than it will actually make and
// will slightly OVERSTATE how often the tile unlocks a claim. Use the basic bot
// for the card-lock verification figure. (Deleted 8 August with the rule,
// restored 9 August.)
export function decideExtraTile(gameState) {
  return basicExtraTile(gameState);
}

// The paid 2-card deal (8 August). It replaced the extra tile above for a day;
// since 9 August both are delegated.
//
// THE CAVEAT ABOVE DOES NOT APPLY TO THIS ONE, which is worth stating rather than
// leaving implied: decideDealCards reads the board as it actually is at the spend
// step - the placements have already happened, by whatever logic - so this
// delegation is faithful and fast-bot deal counts can be read at face value.
export function decideDealCards(gameState) {
  return basicDealCards(gameState);
}

// THIS WAS MISSING, AND IT SILENTLY BROKE A HEADLINE METRIC (3 August). Every
// harness calls the move as `strategy.decideMove ? strategy.decideMove(s) : null`,
// so a bot without one simply never moves - and simulate.js runs THIS bot by
// default. Metric 8 therefore reported `move tile=0, move plate=0` over any
// number of games, which reads as "nobody ever wants to buy a move" when it
// actually meant "the bot being measured cannot buy one". Two of the four
// cupcake outlets were missing from the cupcake-economy measurement entirely.
//
// Same caveat as decideExtraTile above: this reasons over windows built by
// basicBot's placement logic while this bot places at random, so its moves are
// chosen against a tidier board than it will actually have. Use basicBot for the
// move-rate figure; this exists so the spend totals are not structurally zero.
export function decideMove(gameState) {
  return basicMove(gameState);
}

// The plate outlet, delegated for exactly the reason above: a driver calls it as
// `strategy.decideRemovePlate ? ... : null`, so an absent export reports the
// 3-cupcake action as never wanted rather than never offered. Same placement
// caveat as decideMove.
export function decideRemovePlate(gameState) {
  return basicRemovePlate(gameState);
}

export function decideSweep(gameState) {
  const validSweeps = getValidSweeps(gameState);
  if (validSweeps.length === 0) return null;
  return validSweeps[Math.floor(Math.random() * validSweeps.length)];
}

export function decideBonusTile(gameState) {
  const availableTiles = gameState.market
    .map((t, i) => ({ tile: t, index: i }))
    .filter(({ tile }) => tile !== null);
  if (availableTiles.length === 0) return null;
  return availableTiles[Math.floor(Math.random() * availableTiles.length)].index;
}

// THE TRIM RULE (6 August). The array must be ONE ENTRY PER SWEPT TILE, with
// null for any tile that will not fit and therefore goes back into the bag - the
// pairing is by index, so a short array is not the same thing and place() refuses
// it. This function used to return a short array, which was harmless only because
// an over-full board ended the game before place() was ever reached.
export function decidePlacements(gameState) {
  const currentPlayer = gameState.players[gameState.currentPlayerIndex];
  const availablePositions = getValidPlacements(currentPlayer.board);
  const tilesToPlace = gameState.pendingSweepTiles.length;

  const placements = new Array(tilesToPlace).fill(null);

  for (let i = 0; i < tilesToPlace && availablePositions.length > 0; i++) {
    const idx = Math.floor(Math.random() * availablePositions.length);
    placements[i] = availablePositions[idx];
    availablePositions.splice(idx, 1);
  }

  return placements;
}

export function decideClaim(gameState) {
  // canClaimMore is unconditionally true since 6 August (plates are unlimited);
  // kept as the engine's hook for a future claim limit. See basicBot.decideClaim.
  if (!canClaimMore(gameState)) return null;
  const currentPlayer = gameState.players[gameState.currentPlayerIndex];

  // Candidates are the shared card row (the personal reserve is deleted, which
  // complete as normal claims). Find the first claimable one and pick a tile.
  const candidateCards = gameState.cardMarket;

  for (const card of candidateCards) {
    const matches = getPatternMatches(currentPlayer.board, card.pattern);
    if (matches.length > 0) {
      const match = matches[0];
      const patternCells = match.cells;
      const removeIdx = patternCells[Math.floor(Math.random() * patternCells.length)];
      const removedTile = currentPlayer.board[removeIdx];
      const destination = decideDestination(currentPlayer, removedTile, gameState);
      return { cardId: card.id, removedBoardIndex: removeIdx, destination };
    }
  }

  return null;
}
