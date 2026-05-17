export function createStatsCollector() {
  const collector = {
    sweeps: [], // Array of { count: number } to track each individual sweep
    cardsClaimedCount: 0,
    marketFillCount: 0,
    cardMarketTracking: {}, // { cardId: { entered: turn, exited: turn } }

    recordMarketFill() {
      this.marketFillCount = this.marketFillCount + 1;
    },

    recordSweep(tileCount) {
      const count = parseInt(tileCount);
      if (isNaN(count) || count < 1) return;
      this.sweeps.push({ count: count });
    },

    recordCardClaimed() {
      this.cardsClaimedCount = this.cardsClaimedCount + 1;
    },

    recordCardMarketEntry(cardId, turn) {
      if (!cardId) return;
      if (!this.cardMarketTracking[cardId]) {
        this.cardMarketTracking[cardId] = {};
      }
      this.cardMarketTracking[cardId].entered = parseInt(turn);
    },

    recordCardMarketExit(cardId, turn) {
      if (!cardId) return;
      if (!this.cardMarketTracking[cardId]) {
        this.cardMarketTracking[cardId] = {};
      }
      this.cardMarketTracking[cardId].exited = parseInt(turn);
    },

    getReport() {
      // Calculate sweep stats from individual sweep records
      let totalTilesTaken = 0;
      let maxSweepSize = 0;
      const sweepCount = this.sweeps.length;

      for (let i = 0; i < sweepCount; i++) {
        const sweepTiles = this.sweeps[i].count || 0;
        totalTilesTaken = totalTilesTaken + sweepTiles;
        if (sweepTiles > maxSweepSize) {
          maxSweepSize = sweepTiles;
        }
      }

      const avgSweepSize = sweepCount > 0
        ? (totalTilesTaken / sweepCount).toFixed(2)
        : '0.0';

      // Calculate card market lifetime
      let totalCardLifetime = 0;
      let cardLifetimeCount = 0;

      for (const cardId in this.cardMarketTracking) {
        const tracking = this.cardMarketTracking[cardId];
        if (typeof tracking.entered === 'number' && typeof tracking.exited === 'number') {
          const lifetime = tracking.exited - tracking.entered;
          if (lifetime >= 0) {
            totalCardLifetime = totalCardLifetime + lifetime;
            cardLifetimeCount = cardLifetimeCount + 1;
          }
        }
      }

      const avgCardMarketLife = cardLifetimeCount > 0
        ? (totalCardLifetime / cardLifetimeCount).toFixed(2)
        : '0.0';

      return {
        marketFills: Math.min(this.marketFillCount, 4),
        totalTilesTaken: Math.min(totalTilesTaken, 100),
        totalCardsClaimed: this.cardsClaimedCount,
        maxSweepSize: maxSweepSize,
        avgSweepSize: avgSweepSize,
        sweepCount: sweepCount,
        cardMarketAvgLifetime: avgCardMarketLife,
      };
    },
  };

  return collector;
}
