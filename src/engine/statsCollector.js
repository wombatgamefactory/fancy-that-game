export function createStatsCollector() {
  const collector = {
    sweeps: [], // Array of { count: number } to track each individual sweep
    cardsClaimedCount: 0,
    reserveClaimsCount: 0, // claims completed from a personal reserve (subset of the above)
    marketFillCount: 0, // times the tile market was (re)filled — initial deal, tea refills, backstops
    cardMarketTracking: {}, // { cardId: { entered: turn, exited: turn } }
    teaRounds: [], // Array of { turn, potSize } — one per Fresh Pot of Tea fired
    teaReserves: [], // Array of { playerId, cardId } for each card reserved
    backstopFirings: [], // turn number of each backstop tile refresh (market emptied)
    deckReshuffles: 0, // times the card discard was reshuffled into a fresh deck
    cupcakePlateGains: 0, // cupcakes gained by plating onto a cupcake plate (no cap now)
    // Per-player cupcake influx by source: { playerId: { start, pot, plates } }.
    // start = the 2 opening cupcakes; pot = the tea cupcake pot; plates = cupcake
    // plates covered on the stand. The cupcake cap is gone, so influx is the wild's
    // new watch item (re-icing frequency lives alongside it in the design metrics).
    cupcakeInflux: {},
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

    // fromReserve flags a claim completed out of a personal reserve (vs the shared
    // market), feeding the claims-from-reserve fraction.
    recordCardClaimed(cardId, turn, fromReserve) {
      this.cardsClaimedCount = this.cardsClaimedCount + 1;
      if (fromReserve) this.reserveClaimsCount = this.reserveClaimsCount + 1;
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

    // A Fresh Pot of Tea fired on `turn`, collecting a cupcake pot of `potSize`
    // (the number of visible cupcake symbols at the time). Pot is 0-4.
    recordTeaRound(turn, potSize) {
      this.teaRounds.push({ turn: parseInt(turn), potSize: potSize | 0 });
    },

    recordTeaReserve(playerId, cardId) {
      if (!cardId) return;
      this.teaReserves.push({ playerId: playerId, cardId: cardId });
    },

    // The backstop refreshed a completely empty tile market on `turn`.
    recordBackstopFiring(turn) {
      this.backstopFirings.push(parseInt(turn));
    },

    recordDeckReshuffle() {
      this.deckReshuffles = this.deckReshuffles + 1;
    },

    // Add `amount` cupcakes to `playerId`'s influx under `source`
    // ('start' | 'pot' | 'plates').
    recordCupcakeGain(playerId, source, amount) {
      if (playerId === undefined || playerId === null) return;
      const amt = amount | 0;
      if (amt <= 0) return;
      if (!this.cupcakeInflux[playerId]) {
        this.cupcakeInflux[playerId] = { start: 0, pot: 0, plates: 0 };
      }
      if (this.cupcakeInflux[playerId][source] === undefined) {
        this.cupcakeInflux[playerId][source] = 0;
      }
      this.cupcakeInflux[playerId][source] += amt;
    },

    recordCupcakePlateGain(playerId) {
      this.cupcakePlateGains = this.cupcakePlateGains + 1;
      this.recordCupcakeGain(playerId, 'plates', 1);
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

      // Cupcake influx totals by source, plus a deep copy of the per-player map.
      const cupcakeInflux = {};
      const cupcakeInfluxTotals = { start: 0, pot: 0, plates: 0 };
      for (const pid in this.cupcakeInflux) {
        const src = this.cupcakeInflux[pid];
        cupcakeInflux[pid] = { start: src.start || 0, pot: src.pot || 0, plates: src.plates || 0 };
        cupcakeInfluxTotals.start += cupcakeInflux[pid].start;
        cupcakeInfluxTotals.pot += cupcakeInflux[pid].pot;
        cupcakeInfluxTotals.plates += cupcakeInflux[pid].plates;
      }

      return {
        marketFills: this.marketFillCount,
        totalTilesTaken: Math.min(totalTilesTaken, 100),
        totalCardsClaimed: this.cardsClaimedCount,
        reserveClaims: this.reserveClaimsCount,
        maxSweepSize: maxSweepSize,
        avgSweepSize: avgSweepSize,
        sweepCount: sweepCount,
        cardMarketAvgLifetime: avgCardMarketLife,
        teaRoundCount: this.teaRounds.length,
        teaRounds: this.teaRounds.map(t => ({ turn: t.turn, potSize: t.potSize })),
        teaReservesTaken: this.teaReserves.length,
        backstopCount: this.backstopFirings.length,
        backstopFirings: this.backstopFirings.slice(),
        deckReshuffles: this.deckReshuffles,
        cupcakePlateGains: this.cupcakePlateGains,
        cupcakeInflux: cupcakeInflux,
        cupcakeInfluxTotals: cupcakeInfluxTotals,
        firstPlatingRow: { ...this.firstPlatingRow },
      };
    },
  };

  return collector;
}
