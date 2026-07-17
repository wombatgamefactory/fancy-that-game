import { createGame, sweep, takeBonusTile, declineBonusTile, place, claim, skipClaim, skipMove, moveTile, refill, getValidSweeps, getValidPlacements, calculateFinalScores, ROW_VALUES } from './src/engine/game.js';
import { createStatsCollector } from './src/engine/statsCollector.js';
import * as fastBot from './src/bots/fastBot.js';
import * as basicBot from './src/bots/basicBot.js';

const BOT_STRATEGIES = {
  basic: basicBot,
  fast: fastBot,
};

function runGame(playerConfigs, botStrategy) {
  const statsCollector = createStatsCollector();
  const strategy = BOT_STRATEGIES[botStrategy] || fastBot;

  let gameState = createGame(playerConfigs, statsCollector);
  let turns = 0;
  const maxTurns = 1000;

  while (!gameState.gameOver && turns < maxTurns) {
    const currentPlayer = gameState.players[gameState.currentPlayerIndex];

    switch (gameState.gamePhase) {
      case 'sweep': {
        if (gameState.bonusTileAvailable) {
          // A line-clearing sweep earned a bonus tile. Take one if the strategy
          // wants it and a tile exists, otherwise decline and advance to place.
          const bonusIdx = strategy.decideBonusTile ? strategy.decideBonusTile(gameState) : null;
          if (bonusIdx !== null && bonusIdx !== undefined && gameState.market[bonusIdx]) {
            gameState = takeBonusTile(gameState, bonusIdx);
          } else {
            gameState = declineBonusTile(gameState);
          }
          break;
        }
        const decision = strategy.decideSweep(gameState);
        if (decision) {
          gameState = sweep(gameState, decision.rowOrCol, decision.isRow, decision.declaration, decision.declarationType);
        } else {
          // No legal sweep (market emptied) — advance so the engine can reach
          // its end-of-game check instead of spinning in the sweep phase.
          gameState.gamePhase = 'place';
        }
        break;
      }
      case 'place': {
        // Board overflow is handled by the engine at the transition into this
        // phase (checkBoardOverflowOnPlace), so any state seen here is placeable.
        const placements = strategy.decidePlacements(gameState);
        gameState = place(gameState, placements);
        break;
      }
      case 'move': {
        // Cupcake move: relocate one tile when it completes an otherwise
        // unclaimable card this turn.
        const moveDecision = strategy.decideMove ? strategy.decideMove(gameState) : null;
        if (moveDecision) {
          gameState = moveTile(gameState, moveDecision.fromIndex, moveDecision.toIndex);
        }
        gameState = skipMove(gameState);
        break;
      }
      case 'claim': {
        const decision = strategy.decideClaim(gameState);
        if (decision && decision.cardId) {
          gameState = claim(gameState, decision.cardId, decision.removedBoardIndex, decision.destination);
        } else {
          gameState = skipClaim(gameState);
        }
        break;
      }
      case 'refill': {
        gameState = refill(gameState);
        break;
      }
    }

    turns++;
  }

  if (gameState.gameOver) {
    calculateFinalScores(gameState);
  }

  // Per-player end-of-game metrics: final score, cards claimed, and the
  // stand/crumb breakdown (plate = tiles banked on the cake stand, crumb =
  // tiles sent to the crumb tray).
  const perPlayer = gameState.players.map(p => {
    let standScore = 0;
    let standTiles = 0;
    for (const row of p.stand) {
      standTiles += row.tiles.length;
      if (row.tiles.length > 0) standScore += ROW_VALUES[row.tiles.length - 1];
    }
    return {
      score: p.score,
      claims: p.claimedCards.length,
      standScore,
      standTiles,
      crumbs: p.crumbTray.length,
      cupcakes: p.cupcakes,
      cardVp: p.score - standScore - p.crumbTray.length - p.cupcakes,
    };
  });

  return {
    gameState,
    turns,
    endReason: gameState.endGameReason,
    perPlayer,
    stats: statsCollector.getReport(),
  };
}

function aggregateStats(allGameStats) {
  const aggregate = {
    gamesRun: allGameStats.length,
    marketFills: { total: 0, avg: 0, min: Infinity, max: 0 },
    totalTilesTaken: { total: 0, avg: 0, min: Infinity, max: 0 },
    totalCardsClaimed: { total: 0, avg: 0, min: Infinity, max: 0 },
    maxSweepSize: { total: 0, avg: 0, min: Infinity, max: 0 },
    avgSweepSize: { total: 0, avg: 0, min: Infinity, max: 0 },
    sweepCount: { total: 0, avg: 0, min: Infinity, max: 0 },
  };

  for (const stats of allGameStats) {
    aggregate.marketFills.total += stats.marketFills;
    aggregate.marketFills.min = Math.min(aggregate.marketFills.min, stats.marketFills);
    aggregate.marketFills.max = Math.max(aggregate.marketFills.max, stats.marketFills);

    aggregate.totalTilesTaken.total += stats.totalTilesTaken;
    aggregate.totalTilesTaken.min = Math.min(aggregate.totalTilesTaken.min, stats.totalTilesTaken);
    aggregate.totalTilesTaken.max = Math.max(aggregate.totalTilesTaken.max, stats.totalTilesTaken);

    aggregate.totalCardsClaimed.total += stats.totalCardsClaimed;
    aggregate.totalCardsClaimed.min = Math.min(aggregate.totalCardsClaimed.min, stats.totalCardsClaimed);
    aggregate.totalCardsClaimed.max = Math.max(aggregate.totalCardsClaimed.max, stats.totalCardsClaimed);

    aggregate.maxSweepSize.total += stats.maxSweepSize;
    aggregate.maxSweepSize.min = Math.min(aggregate.maxSweepSize.min, stats.maxSweepSize);
    aggregate.maxSweepSize.max = Math.max(aggregate.maxSweepSize.max, stats.maxSweepSize);

    aggregate.avgSweepSize.total += parseFloat(stats.avgSweepSize);
    aggregate.avgSweepSize.min = Math.min(aggregate.avgSweepSize.min, parseFloat(stats.avgSweepSize));
    aggregate.avgSweepSize.max = Math.max(aggregate.avgSweepSize.max, parseFloat(stats.avgSweepSize));

    aggregate.sweepCount.total += stats.sweepCount;
    aggregate.sweepCount.min = Math.min(aggregate.sweepCount.min, stats.sweepCount);
    aggregate.sweepCount.max = Math.max(aggregate.sweepCount.max, stats.sweepCount);
  }

  aggregate.marketFills.avg = (aggregate.marketFills.total / allGameStats.length).toFixed(2);
  aggregate.totalTilesTaken.avg = (aggregate.totalTilesTaken.total / allGameStats.length).toFixed(2);
  aggregate.totalCardsClaimed.avg = (aggregate.totalCardsClaimed.total / allGameStats.length).toFixed(2);
  aggregate.maxSweepSize.avg = (aggregate.maxSweepSize.total / allGameStats.length).toFixed(2);
  aggregate.avgSweepSize.avg = (aggregate.avgSweepSize.total / allGameStats.length).toFixed(2);
  aggregate.sweepCount.avg = (aggregate.sweepCount.total / allGameStats.length).toFixed(2);

  return aggregate;
}

function formatAggregateStats(aggregate) {
  console.log(`\n=== AGGREGATE STATS (${aggregate.gamesRun} games) ===\n`);
  console.log(`Market Fills:        avg=${aggregate.marketFills.avg}, min=${aggregate.marketFills.min}, max=${aggregate.marketFills.max}`);
  console.log(`Total Tiles Taken:   avg=${aggregate.totalTilesTaken.avg}, min=${aggregate.totalTilesTaken.min}, max=${aggregate.totalTilesTaken.max}`);
  console.log(`Total Cards Claimed: avg=${aggregate.totalCardsClaimed.avg}, min=${aggregate.totalCardsClaimed.min}, max=${aggregate.totalCardsClaimed.max}`);
  console.log(`Max Sweep Size:      avg=${aggregate.maxSweepSize.avg}, min=${aggregate.maxSweepSize.min}, max=${aggregate.maxSweepSize.max}`);
  console.log(`Avg Sweep Size:      avg=${aggregate.avgSweepSize.avg}, min=${aggregate.avgSweepSize.min}, max=${aggregate.avgSweepSize.max}`);
  console.log(`Sweep Count:         avg=${aggregate.sweepCount.avg}, min=${aggregate.sweepCount.min}, max=${aggregate.sweepCount.max}`);
}

const gamesPerConfig = parseInt(process.argv[2]) || 10;
const playerCount = parseInt(process.argv[3]) || 3;
const botStrategy = process.argv[4] || 'fast';

console.log(`Running ${gamesPerConfig} games with ${playerCount} players (${botStrategy} bot)...\n`);

const allGameStats = [];
const allPlayerMetrics = [];
const endReasonCounts = {};
const startTime = Date.now();

for (let i = 0; i < gamesPerConfig; i++) {
  const playerConfigs = Array.from({ length: playerCount }, (_, idx) => ({
    name: `Bot ${idx + 1}`,
    aiDifficulty: botStrategy,
    isHuman: false,
  }));

  const { turns, stats, perPlayer, endReason } = runGame(playerConfigs, botStrategy);
  allGameStats.push(stats);
  for (const pm of perPlayer) allPlayerMetrics.push(pm);
  endReasonCounts[endReason || 'none'] = (endReasonCounts[endReason || 'none'] || 0) + 1;

  if ((i + 1) % Math.max(1, Math.floor(gamesPerConfig / 10)) === 0 || gamesPerConfig <= 10) {
    console.log(`  Game ${i + 1}/${gamesPerConfig} completed in ${turns} turns`);
  }
}

const elapsed = Date.now() - startTime;
const aggregate = aggregateStats(allGameStats);
formatAggregateStats(aggregate);

// Final-score and plate-vs-crumb reporting (per player, across all games).
const n = allPlayerMetrics.length;
const sum = (f) => allPlayerMetrics.reduce((a, m) => a + f(m), 0);
const scores = allPlayerMetrics.map(m => m.score);
const totalStandTiles = sum(m => m.standTiles);
const totalCrumbs = sum(m => m.crumbs);
console.log(`\n=== FINAL SCORE / STAND REPORT (${n} player-results) ===\n`);
console.log(`Final score:   mean=${(sum(m => m.score) / n).toFixed(1)}, min=${Math.min(...scores)}, max=${Math.max(...scores)}`);
console.log(`Claims/player: mean=${(sum(m => m.claims) / n).toFixed(2)}`);
console.log(`Stand score:   mean=${(sum(m => m.standScore) / n).toFixed(1)}`);
console.log(`Card vp:       mean=${(sum(m => m.cardVp) / n).toFixed(1)}`);
console.log(`Cupcakes left: mean=${(sum(m => m.cupcakes) / n).toFixed(2)}`);
console.log(`Plate tiles:   total=${totalStandTiles} (mean/player=${(totalStandTiles / n).toFixed(2)})`);
console.log(`Crumb tiles:   total=${totalCrumbs} (mean/player=${(totalCrumbs / n).toFixed(2)})`);
console.log(`Plate:Crumb    = ${totalStandTiles}:${totalCrumbs} (crumb share ${(100 * totalCrumbs / (totalStandTiles + totalCrumbs || 1)).toFixed(1)}%)`);
console.log(`\nEnd reasons: ${JSON.stringify(endReasonCounts)}`);
console.log(`\nCompleted ${gamesPerConfig} games in ${elapsed}ms (${(elapsed / gamesPerConfig).toFixed(1)}ms/game)`);
