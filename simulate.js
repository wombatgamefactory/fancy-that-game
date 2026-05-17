import { createGame, sweep, takeBonusTile, place, claim, skipClaim, refill, getValidSweeps, getValidPlacements } from './src/engine/game.js';
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
        const decision = strategy.decideSweep(gameState);
        if (decision) {
          gameState = sweep(gameState, decision.rowOrCol, decision.isRow, decision.declaration, decision.declarationType);
        }
        break;
      }
      case 'place': {
        const emptyCount = getValidPlacements(currentPlayer.board).length;
        if (gameState.pendingSweepTiles.length > emptyCount) {
          gameState.endGameReason = 'boardOverflow';
          gameState.remainingTurnsInEndGame = gameState.players.length - 1;
          gameState.pendingSweepTiles = [];
          gameState.gamePhase = 'refill';
        } else {
          const placements = strategy.decidePlacements(gameState);
          if (placements && placements.length > 0) {
            gameState = place(gameState, placements);
          }
        }
        break;
      }
      case 'claim': {
        const decision = strategy.decideClaim(gameState);
        if (decision && decision.cardId) {
          gameState = claim(gameState, decision.cardId, decision.removedBoardIndex);
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

  return {
    gameState,
    turns,
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
const startTime = Date.now();

for (let i = 0; i < gamesPerConfig; i++) {
  const playerConfigs = Array.from({ length: playerCount }, (_, idx) => ({
    name: `Bot ${idx + 1}`,
    aiDifficulty: botStrategy,
    isHuman: false,
  }));

  const { gameState, turns, stats } = runGame(playerConfigs, botStrategy);
  allGameStats.push(stats);

  if ((i + 1) % Math.max(1, Math.floor(gamesPerConfig / 10)) === 0 || gamesPerConfig <= 10) {
    console.log(`  Game ${i + 1}/${gamesPerConfig} completed in ${turns} turns`);
  }
}

const elapsed = Date.now() - startTime;
const aggregate = aggregateStats(allGameStats);
formatAggregateStats(aggregate);
console.log(`\nCompleted ${gamesPerConfig} games in ${elapsed}ms (${(elapsed / gamesPerConfig).toFixed(1)}ms/game)`);
