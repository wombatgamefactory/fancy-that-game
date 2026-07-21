export function createStatsCollector() {
  const collector = {
    sweeps: [], // Array of { count: number } to track each individual sweep
    cardsClaimedCount: 0,
    marketFillCount: 0,
    cardMarketTracking: {}, // { cardId: { entered: turn, exited: turn } }
    teaRoundTurns: [], // turn number of each tea round ordered (orderTea)
    teaReserves: [], // Array of { playerId, cardId } for each card reserved
    cupcakePlateGains: 0, // cupcakes gained by plating onto a cupcake plate (below cap)
    cupcakeForfeits: 0, // cupcake-plate triggers wasted because the player was at cap
    firstPlatingRow: {}, // playerId -> stand rowIndex of that player's FIRST plating
                         // this game (top row = 3). Watches whether the 5-VP top
                         // plate is becoming the automatic opening move.

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

    recordTeaRound(turn) {
      this.teaRoundTurns.push(parseInt(turn));
    },

    recordTeaReserve(playerId, cardId) {
      if (!cardId) return;
      this.teaReserves.push({ playerId: playerId, cardId: cardId });
    },

    recordCupcakePlateGain() {
      this.cupcakePlateGains = this.cupcakePlateGains + 1;
    },

    recordCupcakeForfeit() {
      this.cupcakeForfeits = this.cupcakeForfeits + 1;
    },

    // Record a plating onto a stand row. Only the FIRST plating per player each
    // game is kept (later platings are ignored), so firstPlatingRow captures
    // which row each player opened their stand on.
    recordPlating(playerId, rowIndex) {
      if (playerId === undefined || playerId === null) return;
      if (this.firstPlatingRow[playerId] === undefined) {
        this.firstPlatingRow[playerId] = rowIndex;
      }
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
        teaRoundCount: this.teaRoundTurns.length,
        teaRoundTurns: this.teaRoundTurns.slice(),
        teaReservesTaken: this.teaReserves.length,
        cupcakePlateGains: this.cupcakePlateGains,
        cupcakeForfeits: this.cupcakeForfeits,
        firstPlatingRow: { ...this.firstPlatingRow },
      };
    },
  };

  return collector;
}
