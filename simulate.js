import { createGame, sweep, takeBonusTile, declineBonusTile, place, claim, skipClaim, skipMove, moveTile, refill, orderTea, teaReserve, teaReserveMustPass, getValidSweeps, getValidPlacements, calculateFinalScores, STAND_ROW_VALUES } from './src/engine/game.js';
import { createStatsCollector } from './src/engine/statsCollector.js';
import * as fastBot from './src/bots/fastBot.js';
import * as basicBot from './src/bots/basicBot.js';
import * as randomBot from './src/bots/randomBot.js';

const BOT_STRATEGIES = {
  basic: basicBot,
  fast: fastBot,
  random: randomBot,
};

// Largest single sweep currently available on the tile market: the max tiles a
// single colour/ingredient declaration would take from any one row or column.
// Cheap scan used for the late-game drought metric (a "drought" turn is one where
// even the best sweep is a single junk tile once every player's tea is spent).
function bestSweepTileCount(gameState) {
  const { market, marketSize } = gameState;
  let best = 0;
  for (let i = 0; i < marketSize; i++) {
    for (const isRow of [true, false]) {
      const counts = {};
      for (let j = 0; j < marketSize; j++) {
        const tile = isRow ? market[i * marketSize + j] : market[j * marketSize + i];
        if (!tile) continue;
        const ck = 'c:' + tile.colour;
        const ik = 'i:' + tile.ingredient;
        counts[ck] = (counts[ck] || 0) + 1;
        counts[ik] = (counts[ik] || 0) + 1;
      }
      for (const k in counts) if (counts[k] > best) best = counts[k];
    }
  }
  return best;
}

function runGame(playerConfigs, botStrategy) {
  const statsCollector = createStatsCollector();
  const strategy = BOT_STRATEGIES[botStrategy] || fastBot;

  let gameState = createGame(playerConfigs, statsCollector);
  let turns = 0;
  const maxTurns = 1000;
  // Cards a flush sweeps into the discard pile (counted at each tea round's last
  // reserve decision, just before finishTeaRound clears the market remainder).
  let cardsDiscardedByFlushes = 0;
  // Late-game droughts: sweep turns where the best available sweep is a single
  // tile AND every player's tea card is already spent (no refresh left to fix it).
  let lateDroughtTurns = 0;

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
        // Driver contract: at the start of a turn, first offer the fresh-pot-of-
        // tea flush; only if the strategy declines (or lacks the hook) do we
        // sweep as before.
        if (strategy.decideOrderTea && strategy.decideOrderTea(gameState)) {
          gameState = orderTea(gameState);
          break;
        }
        const decision = strategy.decideSweep(gameState);
        if (decision) {
          if (gameState.players.every(p => p.teaCardUsed) && bestSweepTileCount(gameState) <= 1) {
            lateDroughtTurns++;
          }
          gameState = sweep(gameState, decision.rowOrCol, decision.isRow, decision.declaration, decision.declarationType);
        } else {
          // No legal sweep (market emptied) — advance so the engine can reach
          // its end-of-game check instead of spinning in the sweep phase.
          gameState.gamePhase = 'place';
        }
        break;
      }
      case 'teaReserve': {
        // The DECIDING player is teaReserverIndex, not currentPlayerIndex. Fast-
        // path a forced pass (reserve full or market empty) without consulting
        // the bot, otherwise ask THAT player's strategy which card to reserve.
        const reserverIndex = gameState.teaReserverIndex;
        let cardId = null;
        if (!teaReserveMustPass(gameState)) {
          cardId = strategy.decideTeaReserve ? strategy.decideTeaReserve(gameState, reserverIndex) : null;
        }
        // On the final reserve decision, whatever is left in the market (minus a
        // card this reserver takes) is about to be flushed to the discard.
        if (gameState.teaReservesRemaining === 1) {
          const taken = (cardId !== null && cardId !== undefined) ? 1 : 0;
          cardsDiscardedByFlushes += Math.max(0, gameState.cardMarket.length - taken);
        }
        gameState = teaReserve(gameState, cardId);
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
    for (let i = 0; i < p.stand.length; i++) {
      const row = p.stand[i];
      standTiles += row.tiles.length;
      if (row.tiles.length > 0) standScore += STAND_ROW_VALUES[i][row.tiles.length - 1];
    }
    // First-plating row (top row = index 3). undefined => player never plated.
    const firstPlatingRow = statsCollector.firstPlatingRow[p.id];
    return {
      score: p.score,
      claims: p.claimedCards.length,
      standScore,
      standTiles,
      crumbs: p.crumbTray.length,
      cupcakes: p.cupcakes,
      cardVp: p.score - standScore - p.crumbTray.length - p.cupcakes,
      plated: firstPlatingRow !== undefined,
      topRowFirst: firstPlatingRow === 3,
    };
  });

  // Blowout check: the winner-vs-last score gap this game (per-game concentration
  // premium is back by design; a runaway gap is the knob to watch).
  const gameScores = perPlayer.map(p => p.score);
  const scoreSpread = Math.max(...gameScores) - Math.min(...gameScores);

  // Tea-round metrics. A reserve is "completed" when the reserving player's
  // claimedCards contains the reserved card's id (claim() pushes it there).
  const reserves = statsCollector.teaReserves; // [{ playerId, cardId }]
  let reservesCompleted = 0;
  for (const r of reserves) {
    if (gameState.players[r.playerId].claimedCards.includes(r.cardId)) reservesCompleted++;
  }
  const report = statsCollector.getReport();
  const teaStats = {
    teaRounds: report.teaRoundCount,
    teaFirings: report.teaRounds, // [{ turn, potSize }] per firing
    reservesTaken: report.teaReservesTaken,
    reservesCompleted,
    cardsDiscarded: cardsDiscardedByFlushes,
    backstopCount: report.backstopCount,
    deckReshuffles: report.deckReshuffles,
    reserveClaims: report.reserveClaims,
    totalCardsClaimed: report.totalCardsClaimed,
    lateDroughtTurns,
    cupcakeInfluxTotals: report.cupcakeInfluxTotals,
  };

  return {
    gameState,
    turns,
    endReason: gameState.endGameReason,
    perPlayer,
    scoreSpread,
    stats: report,
    teaStats,
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
    cupcakePlateGains: { total: 0, avg: 0, min: Infinity, max: 0 },
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

    aggregate.cupcakePlateGains.total += stats.cupcakePlateGains;
    aggregate.cupcakePlateGains.min = Math.min(aggregate.cupcakePlateGains.min, stats.cupcakePlateGains);
    aggregate.cupcakePlateGains.max = Math.max(aggregate.cupcakePlateGains.max, stats.cupcakePlateGains);
  }

  aggregate.marketFills.avg = (aggregate.marketFills.total / allGameStats.length).toFixed(2);
  aggregate.totalTilesTaken.avg = (aggregate.totalTilesTaken.total / allGameStats.length).toFixed(2);
  aggregate.totalCardsClaimed.avg = (aggregate.totalCardsClaimed.total / allGameStats.length).toFixed(2);
  aggregate.maxSweepSize.avg = (aggregate.maxSweepSize.total / allGameStats.length).toFixed(2);
  aggregate.avgSweepSize.avg = (aggregate.avgSweepSize.total / allGameStats.length).toFixed(2);
  aggregate.sweepCount.avg = (aggregate.sweepCount.total / allGameStats.length).toFixed(2);
  aggregate.cupcakePlateGains.avg = (aggregate.cupcakePlateGains.total / allGameStats.length).toFixed(2);

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
  console.log(`Cupcake Plate Gains: avg=${aggregate.cupcakePlateGains.avg}, min=${aggregate.cupcakePlateGains.min}, max=${aggregate.cupcakePlateGains.max}`);
}

const gamesPerConfig = parseInt(process.argv[2]) || 10;
const playerCount = parseInt(process.argv[3]) || 3;
const botStrategy = process.argv[4] || 'fast';

console.log(`Running ${gamesPerConfig} games with ${playerCount} players (${botStrategy} bot)...\n`);

const allGameStats = [];
const allPlayerMetrics = [];
const allTeaStats = [];
const allTurns = [];
const allScoreSpreads = [];
const endReasonCounts = {};
const startTime = Date.now();

for (let i = 0; i < gamesPerConfig; i++) {
  const playerConfigs = Array.from({ length: playerCount }, (_, idx) => ({
    name: `Bot ${idx + 1}`,
    aiDifficulty: botStrategy,
    isHuman: false,
  }));

  const { turns, stats, perPlayer, endReason, teaStats, scoreSpread } = runGame(playerConfigs, botStrategy);
  allGameStats.push(stats);
  allTeaStats.push(teaStats);
  allTurns.push(turns);
  allScoreSpreads.push(scoreSpread);
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
const totalStandScore = sum(m => m.standScore);
const totalCardVp = sum(m => m.cardVp);
console.log(`\n=== FINAL SCORE / STAND REPORT (${n} player-results) ===\n`);
console.log(`Final score:   mean=${(sum(m => m.score) / n).toFixed(1)}, min=${Math.min(...scores)}, max=${Math.max(...scores)}`);
console.log(`Claims/player: mean=${(sum(m => m.claims) / n).toFixed(2)}`);
console.log(`Stand score:   mean=${(sum(m => m.standScore) / n).toFixed(1)}`);
console.log(`Card vp:       mean=${(sum(m => m.cardVp) / n).toFixed(1)}`);
// Card VP vs stand VP realized split (design target ~50/50 once card values are
// rebalanced; today's card data is still the stale 1-4 band, so expect card-light).
const cardStandTotal = totalCardVp + totalStandScore;
console.log(`Card:Stand VP  = ${totalCardVp.toFixed(0)}:${totalStandScore.toFixed(0)} (card share ${(100 * totalCardVp / (cardStandTotal || 1)).toFixed(1)}%)`);
console.log(`Cupcakes left: mean=${(sum(m => m.cupcakes) / n).toFixed(2)}`);
console.log(`Plate tiles:   total=${totalStandTiles} (mean/player=${(totalStandTiles / n).toFixed(2)})`);
console.log(`Crumb tiles:   total=${totalCrumbs} (mean/player=${(totalCrumbs / n).toFixed(2)})`);
console.log(`Plate:Crumb    = ${totalStandTiles}:${totalCrumbs} (crumb share ${(100 * totalCrumbs / (totalStandTiles + totalCrumbs || 1)).toFixed(1)}%)`);
// Blowout check: per-game winner-vs-last score gap.
const meanSpread = allScoreSpreads.reduce((a, s) => a + s, 0) / allScoreSpreads.length;
console.log(`Score spread:  mean=${meanSpread.toFixed(1)}, min=${Math.min(...allScoreSpreads)}, max=${Math.max(...allScoreSpreads)} (winner-vs-last, per game)`);
// Top-row-first-plating rate: of players who plated at all, how often their FIRST
// plating was the top row (5 VP + cupcake). Watch for it becoming automatic (->1).
const platedCount = allPlayerMetrics.filter(m => m.plated).length;
const topFirstCount = allPlayerMetrics.filter(m => m.topRowFirst).length;
console.log(`Top-row first: ${topFirstCount}/${platedCount} platings started top (rate ${platedCount > 0 ? (topFirstCount / platedCount).toFixed(3) : '0.000'})`);
console.log(`\nEnd reasons: ${JSON.stringify(endReasonCounts)}`);

// Game-length (turns) distribution.
const meanTurns = allTurns.reduce((a, t) => a + t, 0) / allTurns.length;
console.log(`\n=== GAME LENGTH (${allTurns.length} games) ===\n`);
console.log(`Turns: mean=${meanTurns.toFixed(1)}, min=${Math.min(...allTurns)}, max=${Math.max(...allTurns)}`);

// Tea-round report.
const teaRoundsPerGame = allTeaStats.map(t => t.teaRounds);
const totalReserves = allTeaStats.reduce((a, t) => a + t.reservesTaken, 0);
const totalReservesCompleted = allTeaStats.reduce((a, t) => a + t.reservesCompleted, 0);
const totalDiscarded = allTeaStats.reduce((a, t) => a + t.cardsDiscarded, 0);
const meanTeaRounds = teaRoundsPerGame.reduce((a, t) => a + t, 0) / teaRoundsPerGame.length;
const gamesWithTea = teaRoundsPerGame.filter(t => t > 0).length;
console.log(`\n=== TEA ROUND REPORT (${allTeaStats.length} games) ===\n`);
console.log(`Tea rounds/game:    mean=${meanTeaRounds.toFixed(2)}, min=${Math.min(...teaRoundsPerGame)}, max=${Math.max(...teaRoundsPerGame)}`);
console.log(`Games with >=1 tea: ${gamesWithTea}/${allTeaStats.length} (${(100 * gamesWithTea / allTeaStats.length).toFixed(1)}%)`);
console.log(`Reserves taken:     total=${totalReserves} (mean/game=${(totalReserves / allTeaStats.length).toFixed(2)})`);
console.log(`Reserves completed: total=${totalReservesCompleted} (completion rate ${totalReserves > 0 ? (100 * totalReservesCompleted / totalReserves).toFixed(1) : '0.0'}%)`);
console.log(`Cards discarded by flushes: total=${totalDiscarded} (mean/game=${(totalDiscarded / allTeaStats.length).toFixed(2)})`);

// Tea timing + pot size across every firing (target: teas spread through the game
// with healthy pots; failure modes are everyone hoarding to a tiny end-game sweep
// or everyone firing early on a ~0 pot).
const allFirings = allTeaStats.flatMap(t => t.teaFirings || []);
if (allFirings.length > 0) {
  const firingTurns = allFirings.map(f => f.turn);
  const potSizes = allFirings.map(f => f.potSize);
  const meanTurn = firingTurns.reduce((a, v) => a + v, 0) / firingTurns.length;
  const meanPot = potSizes.reduce((a, v) => a + v, 0) / potSizes.length;
  const potDist = [0, 1, 2, 3, 4].map(p => potSizes.filter(v => v === p).length);
  console.log(`Tea firing turn:    mean=${meanTurn.toFixed(1)}, min=${Math.min(...firingTurns)}, max=${Math.max(...firingTurns)}`);
  console.log(`Tea pot size:       mean=${meanPot.toFixed(2)}, min=${Math.min(...potSizes)}, max=${Math.max(...potSizes)} (dist 0-4: ${potDist.join('/')})`);
} else {
  console.log(`Tea firing turn:    (no teas fired)`);
}

// Backstop firings (target: near zero; >~1/game means player-driven refresh isn't
// covering tile supply). Deck reshuffles (now expected at 4p). Late-game droughts.
const totalBackstops = allTeaStats.reduce((a, t) => a + (t.backstopCount || 0), 0);
const gamesWithBackstop = allTeaStats.filter(t => (t.backstopCount || 0) > 0).length;
const totalReshuffles = allTeaStats.reduce((a, t) => a + (t.deckReshuffles || 0), 0);
const totalDroughts = allTeaStats.reduce((a, t) => a + (t.lateDroughtTurns || 0), 0);
console.log(`Backstop firings:   total=${totalBackstops} (mean/game=${(totalBackstops / allTeaStats.length).toFixed(3)}, games affected=${gamesWithBackstop}/${allTeaStats.length})`);
console.log(`Deck reshuffles:    total=${totalReshuffles} (mean/game=${(totalReshuffles / allTeaStats.length).toFixed(2)})`);
console.log(`Late-game droughts: total=${totalDroughts} (mean/game=${(totalDroughts / allTeaStats.length).toFixed(2)}) [best-sweep=1 tile, all teas spent]`);

// Claims from reserve as a fraction of all claims (reserve traffic is up now).
const totalReserveClaims = allTeaStats.reduce((a, t) => a + (t.reserveClaims || 0), 0);
const totalClaims = allTeaStats.reduce((a, t) => a + (t.totalCardsClaimed || 0), 0);
console.log(`Claims from reserve: ${totalReserveClaims}/${totalClaims} (${totalClaims > 0 ? (100 * totalReserveClaims / totalClaims).toFixed(1) : '0.0'}% of all claims)`);

// Cupcake influx per player by source (start / pot / plates) and the mean total
// per player-result — the wild is looser with the cap gone; watch this knob.
let inStart = 0, inPot = 0, inPlates = 0;
for (const t of allTeaStats) {
  const tot = t.cupcakeInfluxTotals || { start: 0, pot: 0, plates: 0 };
  inStart += tot.start; inPot += tot.pot; inPlates += tot.plates;
}
const inTotal = inStart + inPot + inPlates;
console.log(`\n=== CUPCAKE INFLUX (${n} player-results) ===\n`);
console.log(`By source: start=${inStart}, pot=${inPot}, plates=${inPlates}, total=${inTotal}`);
console.log(`Mean/player: start=${(inStart / n).toFixed(2)}, pot=${(inPot / n).toFixed(2)}, plates=${(inPlates / n).toFixed(2)}, total=${(inTotal / n).toFixed(2)}`);

console.log(`\nCompleted ${gamesPerConfig} games in ${elapsed}ms (${(elapsed / gamesPerConfig).toFixed(1)}ms/game)`);
