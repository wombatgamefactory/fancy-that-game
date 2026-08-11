import { createGame, sweep, takeBonusTile, declineBonusTile, dealCards, takeExtraTile, place, claim, skipClaim, skipSpend, moveTile, removePlate, refill, getValidSweeps, getValidPlacements, calculateFinalScores, getWinningPlayers, STAND_ROW_VALUES, getStartingCupcakes, getTastingMenusEnabled, setTastingMenusEnabled, getStandIngredients, menuDeficit, TASTING_MENU_VP, getTastingMenuCount, TASTING_MENUS, getFlavourEnabled, setFlavourEnabled, getFlavourCount, getFlavourLeaders, isFlavourInPlay, FLAVOUR_VP_PER_TILE, FLAVOUR_MAJORITY_VP,
  // The cupcake price ladder, imported so metric 8 prints the LIVE prices. It
  // printed "(2ea)" and "(3ea)" as typed literals until 7 August.
  MOVE_TILE_CUPCAKE_COST, DEAL_CARDS_CUPCAKE_COST, CARDS_PER_DEAL, EXTRA_TILE_CUPCAKE_COST, REMOVE_PLATE_CUPCAKE_COST, MAX_MARKET_CARDS,
  // The extra-tile cap and its A/B seam (9 August, second revision).
  getMaxExtraTilesPerTurn, setMaxExtraTilesPerTurn,
  // The other three spends' caps - all null since 11 August (second revision),
  // and read rather than assumed so a capped A/B run labels its own report.
  getPerTurnSpendCap, setPerTurnSpendCap,
  // The starting-cupcake table and its seam (9 August, second revision).
  STARTING_CUPCAKES_BY_SEAT, setStartingCupcakesTable } from './src/engine/game.js';
// COLOURS is imported for the bag-skew baseline arithmetic, not for colour logic:
// the per-colour share and the tiles-per-colour figure are both DERIVED here, so
// a change to TILE_COPIES or to the colour list moves the report with it. The
// bag size has twice been hardcoded into a report string in this file's history.
import { TILE_BAG_SIZE, TILE_COPIES, TILE_COLOUR_SHARE_PCT, COLOURS, EMPTY_PLATES_IN_BOX_PER_PLAYER } from './src/engine/tiles.js';
import { createStatsCollector } from './src/engine/statsCollector.js';

// Cupcake tokens the 3 August component list proposes for the box (was 16). The
// supply watch in metric 8 measures against this - it constrains nothing in play,
// because the RULES have no cupcake cap.
const CUPCAKE_TOKENS_IN_BOX = 30;

// HOW MANY EXTRA TILES A TURN ACTUALLY BUYS (9 August, second revision). The
// statsCollector counts cupcakes spent on tiles; it cannot see how they clumped,
// and clumping is the entire question the uncapped rule asks. Accumulated across
// every game of the run, in the driver, because the engine has no per-turn hook
// to hang it on.
const extraTileTurns = { turns: 0, buys: 0, most: 0, dist: {} };

// THE SAME MEASUREMENT FOR THE OTHER THREE SPENDS (11 August, second revision),
// now that none of them is capped either. Same shape, same reason: the question
// the uncapped rule asks is whether a turn CLUMPS its spending, and a cupcake
// total cannot answer it.
//
// READ THESE WITH THE BOT CAVEAT IN MIND. basicBot prices a second tile move
// against the card it can already claim and mostly refuses it, so a distribution
// of all 1s here is the expected FIRST result and is not evidence the rule is
// inert - see decideMove in basicBot.js.
const spendClumps = {
  move: { turns: 0, buys: 0, most: 0, dist: {} },
  plate: { turns: 0, buys: 0, most: 0, dist: {} },
  deal: { turns: 0, buys: 0, most: 0, dist: {} },
};
function recordClump(acc, n) {
  if (n <= 0) return;
  acc.turns++;
  acc.buys += n;
  acc.dist[n] = (acc.dist[n] || 0) + 1;
  if (n > acc.most) acc.most = n;
}
function clumpLine(label, acc, cap) {
  const multi = acc.turns - (acc.dist[1] || 0);
  const dist = Object.keys(acc.dist).sort((a, b) => a - b).map(k => `${k}x${acc.dist[k]}`).join(' ') || '(none)';
  return `  ${label} (cap = ${cap === null ? 'UNLIMITED' : cap}): turns=${acc.turns} bought=${acc.buys} `
    + `per buying turn=${acc.turns ? (acc.buys / acc.turns).toFixed(2) : '0.00'} most=${acc.most} `
    + `multi=${multi} | ${dist}`;
}
import * as fastBot from './src/bots/fastBot.js';
import * as basicBot from './src/bots/basicBot.js';
import * as randomBot from './src/bots/randomBot.js';

// THE REPORT THIS HARNESS PRINTS is the 28 July design doc's "Metrics to log per
// simulated/real game" list, which SUPERSEDES the 24 July one. The ten sections
// below are numbered to match the doc, so a finding can be read straight back
// against the design question that asked for it. Anything the old list reported
// that no live rule produces has been deleted rather than left running beside it.
//
// ONE of the ten cannot be simulated: metric 6 also asks for the reserve round's
// TIME cost, which is a stopwatch measure of a real table. The printout says so
// rather than inventing a proxy for it.
//
// SECTIONS 11 AND 12 ARE NOT FROM THAT LIST. They are rule-conformance readings
// bolted onto the metrics run because they need thousands of games to be worth
// anything: 11 verifies the 4 August equal-turns rule, 12 verifies the staggered
// starting cupcakes. (11 used to be the ingredient-objective report; the pantry
// goals were deleted on 4 August and it was reused rather than left as a gap.)

const BOT_STRATEGIES = {
  basic: basicBot,
  fast: fastBot,
  random: randomBot,
};

function runGame(playerConfigs, botStrategy) {
  const statsCollector = createStatsCollector();
  const strategy = BOT_STRATEGIES[botStrategy] || fastBot;

  let gameState = createGame(playerConfigs, statsCollector);
  // Driver phase-STEPS, not turns. One real turn is several passes round this
  // loop (sweep, place, move, claim, refill, plus one reserve step per player on
  // a refresh turn), so this runs about five times the turn count. It exists only
  // as the runaway guard; the real turn count is gameState.stats.turnsPlayed and
  // that is what the report calls "turns".
  let steps = 0;
  const maxSteps = 1000;
  // Cards a flush sweeps into the discard pile, read off the report's per-card
  // tracking rather than counted at a reserve decision - there is no reserve
  // round left to count at (3 August). Context for metric 7: this burn is what
  // makes reshuffles routine.
  let cardsDiscardedByFlushes = 0;

  while (!gameState.gameOver && steps < maxSteps) {
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
        // 1 August: there is no "order tea" decision to offer here any more. Tea
        // fires automatically at the END of a turn, from inside refill(), so the
        // sweep phase is just a sweep. (3 August: the interactive 'teaReserve'
        // phase this comment used to hand off to is deleted - a pot resolves
        // start to finish inside refill() and parks nothing.)
        const decision = strategy.decideSweep(gameState);
        if (decision) {
          gameState = sweep(gameState, decision.rowOrCol, decision.isRow, decision.declaration, decision.declarationType);
        } else {
          // No legal sweep (market emptied) - advance so the engine can reach
          // its end-of-game check instead of spinning in the sweep phase.
          gameState.gamePhase = 'place';
        }
        break;
      }
      case 'place': {
        // A sweep bigger than the board is legal since 6 August: decidePlacements
        // returns a null for every tile that will not fit, and place() sends those
        // back into the bag. (This used to say the engine had already resolved an
        // overflow before the phase was reached, because overflow ended the game.)
        //
        // THE EXTRA TILE HAS LEFT THIS CASE (10 August). It was resolved here,
        // before the placements were chosen, because it was a sweep-step option
        // whose tile joined the pending pile and so had to be visible to the
        // placement decision. It is a spend-step action now and lives in the
        // 'spend' case below, where the board it is buying into is already final.
        const placements = strategy.decidePlacements(gameState);
        gameState = place(gameState, placements);
        break;
      }
      case 'spend': {
        // SPEND 1 CUPCAKE: TAKE 1 EXTRA TILE, moved here from the 'place' case on
        // 10 August. It runs FIRST of the five spends, which is the same relative
        // order it had when it sat a phase earlier - so a turn that unlocks with a
        // tile still declines the 2-card deal below for the same reason it always
        // did, and the spend counts stay comparable with the 9 August runs.
        //
        // A LOOP SINCE 9 AUGUST (second revision), because the rule is unlimited
        // purchases at a flat price. The bot is asked again after every purchase
        // and stops when it answers null - which it does as soon as the lock
        // clears, the purse empties or the board runs out of room. The MAX_BUYS
        // guard is a runaway stop, not a rule: the engine's own gates are what
        // actually end the loop.
        //
        // The decision is a PAIR now - which market tile, and which cell it goes
        // in - because the tile is placed as it is bought.
        let boughtThisTurn = 0;
        const MAX_BUYS = 25;
        while (boughtThisTurn < MAX_BUYS) {
          const extra = strategy.decideExtraTile ? strategy.decideExtraTile(gameState) : null;
          if (extra === null || extra === undefined) break;
          gameState = takeExtraTile(gameState, extra.marketIndex, extra.boardIndex);
          boughtThisTurn++;
        }
        if (boughtThisTurn > 0) {
          extraTileTurns.turns++;
          extraTileTurns.buys += boughtThisTurn;
          extraTileTurns.dist[boughtThisTurn] = (extraTileTurns.dist[boughtThisTurn] || 0) + 1;
          if (boughtThisTurn > extraTileTurns.most) extraTileTurns.most = boughtThisTurn;
        }
        // THE OTHER THREE SPENDS ARE LOOPS TOO SINCE 11 AUGUST (second revision),
        // for the same reason the extra tile became one on the 9th: no spend on
        // the menu has a per-turn allowance any more. Each bot hook is asked
        // again after every purchase and stops when it answers null, which it
        // does as soon as the purse empties or its own gate closes. Every
        // MAX_* below is a runaway stop rather than a rule.
        //
        // Cupcake move: relocate one tile (1) when it completes an otherwise
        // unclaimable card this turn.
        let movesThisTurn = 0;
        const MAX_MOVES = 25;
        while (movesThisTurn < MAX_MOVES) {
          const moveDecision = strategy.decideMove ? strategy.decideMove(gameState) : null;
          if (!moveDecision) break;
          gameState = moveTile(gameState, moveDecision.fromIndex, moveDecision.toIndex);
          movesThisTurn++;
        }
        recordClump(spendClumps.move, movesThisTurn);
        // Remove an empty plate to the box (2). Independent of the move, so both
        // can happen on the same turn - see removePlate.
        let platesThisTurn = 0;
        const MAX_PLATES = 25;
        while (platesThisTurn < MAX_PLATES) {
          const plateIndex = strategy.decideRemovePlate ? strategy.decideRemovePlate(gameState) : null;
          if (plateIndex === null || plateIndex === undefined) break;
          gameState = removePlate(gameState, plateIndex);
          platesThisTurn++;
        }
        recordClump(spendClumps.plate, platesThisTurn);
        // Paid 2-card deal (8 August): 1 cupcake to put CARDS_PER_DEAL new cards
        // on the row. Resolved before the claim step, which may want to act on
        // what it turns up. MAX_DEALS is low because MAX_MARKET_CARDS closes this
        // one long before a purse does.
        let dealsThisTurn = 0;
        const MAX_DEALS = 10;
        while (dealsThisTurn < MAX_DEALS) {
          if (!(strategy.decideDealCards && strategy.decideDealCards(gameState))) break;
          gameState = dealCards(gameState);
          dealsThisTurn++;
        }
        recordClump(spendClumps.deal, dealsThisTurn);
        // (The paid reserve was driven here from 3 August. Deleted 11 August.)
        gameState = skipSpend(gameState);
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

    steps++;
  }

  if (gameState.gameOver) {
    calculateFinalScores(gameState);
  }

  // Per-player end-of-game metrics: final score, cards claimed, and the
  // stand/crumb breakdown (plate = tiles banked on the cake stand, crumb =
  // tiles sent to the crumb tray). KEPT CUPCAKES NO LONGER SCORE (3 August) -
  // they are reported as a resource and as the tiebreaker, not as VP.
  // THE FLAVOUR OF THE DAY (metric 14). The majority is a CROSS-PLAYER fact, so it
  // is resolved once for the game before the per-player rows are built - the same
  // two-pass shape calculateFinalScores had to adopt, and for the same reason.
  const flavourLeaders = new Set(getFlavourLeaders(gameState));

  const perPlayer = gameState.players.map((p, seat) => {
    let standScore = 0;
    let standTiles = 0;
    for (let i = 0; i < p.stand.length; i++) {
      const row = p.stand[i];
      standTiles += row.tiles.length;
      if (row.tiles.length > 0) standScore += STAND_ROW_VALUES[i][row.tiles.length - 1];
    }
    return {
      seat,
      score: p.score,
      claims: p.claimedCards.length,
      standScore,
      standTiles,
      crumbs: p.crumbTray.length,
      cupcakes: p.cupcakes,
      // THE TASTING MENU. Read off the player rather than the collector so it is
      // available even in a run with no metrics, and so metric 10's score make-up
      // can be reconciled exactly.
      tastingMenus: p.tastingMenus ? p.tastingMenus.length : 0,
      tastingMenuVp: (p.tastingMenus ? p.tastingMenus.length : 0) * TASTING_MENU_VP,
      // THE DEFICIT AT GAME END against the NEAREST dealt menu still on the table
      // - one of metric 13's four headline readings, and the one that says whether
      // four tiles is reachable. It has to be computed here rather than in the
      // collector because it is a fact about the FINISHED stand, not an event.
      // Infinity when no menu is left untaken, which is filtered out below rather
      // than folded into an average.
      finalDeficit: (() => {
        const counts = getStandIngredients(p);
        let nearest = Infinity;
        for (const menu of (gameState.tastingMenus || [])) {
          if (menu.takenBy !== null) continue;
          const d = menuDeficit(counts, menu);
          if (d < nearest) nearest = d;
        }
        return nearest;
      })(),
      // THE FLAVOUR OF THE DAY (6 August), metric 14's raw material. Read off the
      // FINISHED BOARD rather than logged, because the lane fires no events at all
      // during play - it is a setup draw and an end-game count.
      //
      // BOARD ONLY. If this line ever grows a stand or crumb read, the module has
      // stopped being what it is.
      flavourTiles: getFlavourCount(gameState, p),
      flavourLeader: flavourLeaders.has(p.id),
      // The DOSE: what the whole module paid this player, both clauses.
      flavourVp: getFlavourCount(gameState, p) * FLAVOUR_VP_PER_TILE
        + (flavourLeaders.has(p.id) ? FLAVOUR_MAJORITY_VP : 0),
      // Card VP by subtraction. Still exact, but every other lane has to come off
      // it: since 4 August the score is stand + crumbs + cards + menus, and since
      // 6 August the Flavour as well. (The pantry goals were the term that used to
      // sit here and were deleted that morning; Today's Speciality replaced them
      // that afternoon, the Freshness Bonus replaced IT the same evening, and the
      // Tasting Menu replaced that on 5 August.)
      //
      // MISS THE FLAVOUR TERM AND METRIC 10 SILENTLY CREDITS THIS LANE TO THE
      // CARDS, which is the one reading that would hide the module's whole dose.
      cardVp: p.score - standScore - p.crumbTray.length
        - ((p.tastingMenus ? p.tastingMenus.length : 0) * TASTING_MENU_VP)
        - (getFlavourCount(gameState, p) * FLAVOUR_VP_PER_TILE
          + (flavourLeaders.has(p.id) ? FLAVOUR_MAJORITY_VP : 0)),
    };
  });
  const winners = getWinningPlayers(gameState);
  const winnerSeats = winners.map(w => w.id);

  // Blowout check (standing D1 watch): the winner-vs-last score gap this game.
  const gameScores = perPlayer.map(p => p.score);
  const scoreSpread = Math.max(...gameScores) - Math.min(...gameScores);

  // --- METRIC 14: the Flavour of the Day, the three readings that are facts
  // about the whole TABLE rather than about one player -----------------------
  //
  // THE LEAD MARGIN is top minus second. It is what the 3 VP bonus was dosed
  // against: the typical lead is about 2 tiles, so a 3 VP bonus is worth roughly
  // what the margin is worth, and a margin that drifts upward means the bonus has
  // become a reward for a race that was already over.
  const flavourCounts = perPlayer.map(p => p.flavourTiles).sort((a, b) => b - a);
  const flavourTop = flavourCounts[0] || 0;
  const flavourLeadMargin = flavourTop > 0 ? flavourTop - (flavourCounts[1] || 0) : null;
  const flavourTie = flavourTop > 0 && flavourLeaders.size > 1;
  // WHO TOOK THE MAJORITY, BY FINISHING RANK. Dense rank on the final score, 0 =
  // won (or shared the win). If the bonus goes overwhelmingly to rank 0 it is
  // paying the player who was winning anyway, which is the failure mode the
  // handoff's "what must not get worse" table watches through the score spread.
  const sortedScores = [...new Set(gameScores)].sort((a, b) => b - a);
  const flavourLeaderRanks = perPlayer
    .filter(p => p.flavourLeader)
    .map(p => sortedScores.indexOf(p.score));

  // DOES THE MODULE DECIDE THE WINNER? The counterfactual: re-rank the table with
  // the whole lane subtracted and see whether the same players win. This is the
  // figure the dose was calibrated on - 12.9 / 17.9 / 20.4% at 2/3/4 players
  // against the Tasting Menu's 12.1 / 22.5 / 26.5% - so it is what a re-dose has
  // to be argued against.
  //
  // The scores are put back before returning: getWinningPlayers reads player.score
  // and every later metric reads it too, so a counterfactual that forgot to
  // restore would quietly rewrite the whole report.
  let flavourDecided = false;
  if (isFlavourInPlay(gameState)) {
    const realScores = gameState.players.map(p => p.score);
    gameState.players.forEach((p, i) => { p.score -= perPlayer[i].flavourVp; });
    const withoutSeats = getWinningPlayers(gameState).map(w => w.id).join(',');
    gameState.players.forEach((p, i) => { p.score = realScores[i]; });
    flavourDecided = withoutSeats !== winnerSeats.join(',');
  }

  // (Reserve completion was computed here. The reserve is deleted (11 August),
  // so statsCollector.reserves is always empty and this is always 0.)
  const reservesCompleted = 0;

  // Metric 7 context: cards burned by tea flushes. A card that ENTERED the row
  // and left it without being claimed by anybody went to the discard on a flush.
  const report = statsCollector.getReport();
  const claimedIds = new Set();
  for (const p of gameState.players) for (const id of p.claimedCards) claimedIds.add(id);
  for (const cardId in statsCollector.cardMarketTracking) {
    const t = statsCollector.cardMarketTracking[cardId];
    if (typeof t.exited === 'number' && !claimedIds.has(parseInt(cardId))) cardsDiscardedByFlushes++;
  }

  // TURNS ACTUALLY TAKEN, PER SEAT - the verification of the 4 August equal-turns
  // rule. Counted from the collector's turn-start samples rather than derived from
  // turnsPlayed / playerCount, because deriving it would assume exactly the thing
  // being checked. There is precisely one sample per turn played (createGame takes
  // turn 0, advanceToNextTurn takes every rotation that actually hands somebody a
  // turn, and it returns before sampling when the equal-turns stop fires), so this
  // is an independent reading of who got how many turns.
  const turnsBySeat = Array(gameState.players.length).fill(0);
  for (const s of statsCollector.turnSamples) {
    if (s.playerId >= 0 && s.playerId < turnsBySeat.length) turnsBySeat[s.playerId]++;
  }

  // CONTESTED MENUS (metric 13.3): dealt menus that MORE THAN ONE player's
  // finished stand satisfies. This is the race made countable, and it is the
  // figure to be most sceptical of - unsteered it measures 0.02 per game, which is
  // to say the unsteered bot produces no race at all.
  //
  // It is read off the FINISHED stands rather than logged, and that is a real
  // approximation worth naming: a player who qualified, took the menu, and would
  // still qualify at the end counts; a player who qualified only transiently
  // cannot (stands never shrink, so in fact there is no such player - a stand only
  // ever gains tiles). What it CANNOT see is order, which is what the take log is
  // for.
  //
  // Also collected: how many players ended the game qualifying for at least one
  // DEALT menu, taken or not, which is the 19.1%-unsteered figure the targets are
  // projected from.
  let contestedMenus = 0;
  let playersQualifyingForAny = 0;
  const standCounts = gameState.players.map(p => getStandIngredients(p));
  const qualifiesAny = Array(gameState.players.length).fill(false);
  for (const menu of (gameState.tastingMenus || [])) {
    let qualifiers = 0;
    for (let i = 0; i < standCounts.length; i++) {
      if (menuDeficit(standCounts[i], menu) > 0) continue;
      qualifiers++;
      qualifiesAny[i] = true;
    }
    if (qualifiers >= 2) contestedMenus++;
  }
  for (const q of qualifiesAny) if (q) playersQualifyingForAny++;

  return {
    contestedMenus,
    playersQualifyingForAny,
    menusDealtThisGame: (gameState.tastingMenus || []).length,
    // Metric 14. flavourOfTheDay is on the state (and on the report) so the run
    // can check the five come up evenly; the rest are this game's table facts.
    flavourOfTheDay: gameState.flavourOfTheDay,
    flavourLeadMargin,
    flavourTie,
    flavourLeaderRanks,
    flavourDecided,
    gameState,
    steps,
    turnsPlayed: gameState.stats.turnsPlayed,
    endReason: gameState.endGameReason,
    // Armed but not yet honoured is a legitimate mid-state; a FINISHED game must
    // always have both. Reported so the end-reason breakdown can be read as
    // "which condition armed the ending", which is what it means since 4 August.
    endTriggered: gameState.endTriggered,
    turnsBySeat,
    perPlayer,
    winnerSeats,
    scoreSpread,
    report,
    // Metric 3's fourth figure: the CARD row length the game finished on. Read
    // off the state rather than collected, since "the end" is not an event the
    // collector sees.
    endRowSize: gameState.cardMarket.length,
    cardsDiscardedByFlushes,
    reservesCompleted,
    // Empty plates bought off boards and retired to the box. Read off the state
    // for the same reason as endRowSize - it is a running total, not an event.
    platesReturnedToBox: gameState.platesReturnedToBox,
    // PLATES PLACED BY THE HEAVIEST CLAIMER - the number the punchboard is sized
    // off, and metric 10's replacement for the plate OVERRUN it reported until
    // 6 August. The overrun was "claims past the shared pool"; the pool is deleted
    // and plates are unlimited, so the only component question left is how many
    // one player can need in front of them at once. Every claim plants exactly one
    // plate, so a player's claim count IS their plate count.
    maxPlatesOnePlayer: Math.max(...gameState.players.map(p => p.claimedCards.length)),
    // THE TRIM RULE (6 August): turns on which a sweep did not fit, and the tiles
    // that went back into the bag because of it. Read off the state - they are
    // running totals rather than events the collector sees. Baselines from the
    // adopted rule: about 0.5 turns and 1.0 tiles per game at every player count.
    trimmedSweeps: gameState.trimmedSweeps,
    tilesReturnedToBag: gameState.tilesReturnedToBag,
  };
}

// --- small aggregation helpers ---------------------------------------------
const sumOf = (arr) => arr.reduce((a, v) => a + v, 0);
const meanOf = (arr) => (arr.length ? sumOf(arr) / arr.length : 0);
const minOf = (arr) => (arr.length ? Math.min(...arr) : 0);
const maxOf = (arr) => (arr.length ? Math.max(...arr) : 0);
const pct = (n, d) => (d > 0 ? (100 * n / d).toFixed(1) + '%' : 'n/a');
// Render a sparse count array as "0:12  1:30  2:8", skipping empty buckets.
function histLine(counts) {
  const parts = [];
  for (let i = 0; i < counts.length; i++) {
    if (counts[i]) parts.push(`${i}:${counts[i]}`);
  }
  return parts.length ? parts.join('  ') : '(none)';
}
function addInto(target, source) {
  for (const key in source) target[key] = (target[key] || 0) + source[key];
}

const gamesPerConfig = parseInt(process.argv[2]) || 10;
const playerCount = parseInt(process.argv[3]) || 3;
const botStrategy = process.argv[4] || 'fast';

// THE A/B CONTROL ARM. A fourth argument of `nomenus` switches the Tasting Menu
// off for the whole run, which is the only way to tell what the MODULE did from
// what the game was already doing - and the two questions it answers are the two
// the 5 August handoff asks to be checked: whether seat fairness (metric 12) and
// last-as-a-share-of-winner (metric 10) survived it.
//
// This is the one legitimate caller of the setter. Nothing else may touch it: the
// game always starts from the constant.
// A fifth argument of `noflavour` does the same for the Flavour of the Day
// (6 August), which has its own seam for the same reason. The two arms are
// separate switches on the same argument rather than a combined one: the whole
// point of an A/B is that exactly one thing differs between the runs.
const menusOff = process.argv[5] === 'nomenus';
const flavourOff = process.argv[5] === 'noflavour';
if (menusOff) setTastingMenusEnabled(false);
if (flavourOff) setFlavourEnabled(false);

// THE EXTRA-TILE CAP ARM (9 August, second revision). `maxtiles=1` restores the
// one-per-turn rule the uncapped one replaced, which is the BASELINE half of any
// comparison; `maxtiles=unlimited` states the live rule explicitly. Matched
// anywhere in the argument list rather than positionally, so it composes with
// the nomenus/noflavour arm above instead of fighting it for argv[5].
//
// It also swings the bot: basicBot.decideExtraTile reads the same live value and
// switches its second-tile reach off under a cap of 1, so both arms play the
// rule they are being measured under.
const capArg = process.argv.slice(2).find(a => /^maxtiles=/.test(a));
const capValue = capArg ? capArg.split('=')[1] : null;
if (capValue !== null) {
  setMaxExtraTilesPerTurn(capValue === 'unlimited' ? null : parseInt(capValue, 10));
}
const liveCap = getMaxExtraTilesPerTurn();

// THE ALLOWANCE ARM (11 August, second revision), the same idea one step wider.
// `allowances=1` restores the per-turn allowance on the other three spends - the
// move, the plate removal and the paid deal - which is the BASELINE half of any
// comparison against every run recorded before today. `allowances=unlimited`
// states the live rule explicitly.
//
// PAIR IT WITH maxtiles=1 FOR THE FULL OLD MENU. This arm deliberately leaves
// the extra tile alone: it went uncapped two days earlier and has been measured
// under that rule since, so the two caps are separate experiments and folding
// them into one flag would make the interesting run impossible to isolate.
const allowanceArg = process.argv.slice(2).find(a => /^allowances=/.test(a));
if (allowanceArg) {
  const v = allowanceArg.split('=')[1];
  const n = v === 'unlimited' ? null : parseInt(v, 10);
  for (const action of ['moveTile', 'removePlate', 'dealCards']) setPerTurnSpendCap(action, n);
}

// THE OPENING-PURSE ARM (9 August, second revision). `startminus=1` shifts EVERY
// seat down by one cupcake, keeping the stagger's differences intact - which is
// the point, because the differences are what compensate seat 1 for sweeping a
// fuller market and the level is what feeds the uncapped extra tile. Floored at
// 0, so a deeper cut cannot hand anyone a negative purse.
//
// Shifting the whole table is NOT the same experiment as flattening it, and this
// arm deliberately does the former. If the seat ladder needs re-tuning that is a
// change to the differences and belongs in its own run.
//
// `starttable=3,3,4,4` sets THIS player count's opening purse outright, which is
// what a candidate table has to be tested with - the shift above can only move a
// table up or down, and the 9 August finding is that the LEVEL is not the knob.
// The two are exclusive; starttable wins if both are given.
const tableArg = process.argv.slice(2).find(a => /^starttable=/.test(a));
const shiftArg = process.argv.slice(2).find(a => /^startminus=/.test(a));
const startShift = (shiftArg && !tableArg) ? parseInt(shiftArg.split('=')[1], 10) : 0;
if (tableArg) {
  const seats = tableArg.split('=')[1].split(',').map(n => parseInt(n, 10));
  if (seats.length !== playerCount) {
    throw new Error(`starttable has ${seats.length} seats but the run is ${playerCount} players`);
  }
  setStartingCupcakesTable({ ...STARTING_CUPCAKES_BY_SEAT, [playerCount]: seats });
}
if (startShift) {
  const shifted = {};
  for (const count in STARTING_CUPCAKES_BY_SEAT) {
    shifted[count] = STARTING_CUPCAKES_BY_SEAT[count].map(n => Math.max(0, n - startShift));
  }
  setStartingCupcakesTable(shifted);
}

console.log(`Running ${gamesPerConfig} games with ${playerCount} players (${botStrategy} bot)${menusOff ? ', TASTING MENUS OFF (A/B control arm)' : ''}${flavourOff ? ', FLAVOUR OF THE DAY OFF (A/B control arm)' : ''}, extra tiles/turn = ${liveCap === null ? 'UNLIMITED' : liveCap}${tableArg ? `, STARTING CUPCAKES ${getStartingCupcakes(playerCount).join('/')} (candidate table)` : ''}${startShift ? `, STARTING CUPCAKES -${startShift} PER SEAT (${getStartingCupcakes(playerCount).join('/')})` : ''}...\n`);

const games = [];
const allPlayerMetrics = [];
const endReasonCounts = {};
const startTime = Date.now();

for (let i = 0; i < gamesPerConfig; i++) {
  const playerConfigs = Array.from({ length: playerCount }, (_, idx) => ({
    name: `Bot ${idx + 1}`,
    aiDifficulty: botStrategy,
    isHuman: false,
  }));

  const result = runGame(playerConfigs, botStrategy);
  games.push(result);
  for (const pm of result.perPlayer) allPlayerMetrics.push(pm);
  endReasonCounts[result.endReason || 'none'] = (endReasonCounts[result.endReason || 'none'] || 0) + 1;

  if ((i + 1) % Math.max(1, Math.floor(gamesPerConfig / 10)) === 0 || gamesPerConfig <= 10) {
    console.log(`  Game ${i + 1}/${gamesPerConfig} completed in ${result.turnsPlayed} turns`);
  }
}

const elapsed = Date.now() - startTime;
const reports = games.map(g => g.report);
const nGames = games.length;
const nPlayers = allPlayerMetrics.length;

// ---------------------------------------------------------------------------
// Tile-market baseline. Not one of the ten, but it is the shape of the tile game
// all ten sit on top of, and the end screen reports the same figures.
// ---------------------------------------------------------------------------
console.log(`\n=== TILE MARKET BASELINE (${nGames} games) ===\n`);
console.log(`Sweeps/game:       mean=${meanOf(reports.map(r => r.sweepCount)).toFixed(2)}, min=${minOf(reports.map(r => r.sweepCount))}, max=${maxOf(reports.map(r => r.sweepCount))}`);
console.log(`Sweep size:        mean=${meanOf(reports.map(r => parseFloat(r.avgSweepSize))).toFixed(2)}, largest single sweep=${maxOf(reports.map(r => r.maxSweepSize))}`);
console.log(`Tiles taken/game:  mean=${meanOf(reports.map(r => r.totalTilesTaken)).toFixed(2)}, max=${maxOf(reports.map(r => r.totalTilesTaken))} (from a ${TILE_BAG_SIZE}-tile bag)`);

// ---------------------------------------------------------------------------
// 1. REFRESH CADENCE. Target: spread through the game, flushing with 5-7 tiles
//    left on the board.
//
//    THE OLD FAILURE MODES ARE GONE (1 August). Tea used to be a voluntary
//    start-of-turn action, so the two things worth watching were (A) does it fire
//    at every legal chance and (B) does a bad market sit unflushed while players
//    wait each other out. Neither has a subject any more: tea fires automatically
//    at the end of the turn that reaches the threshold. What replaces them is the
//    TRIGGER INVARIANT - no turn should ever BEGIN with tea still due.
// ---------------------------------------------------------------------------
const allRefreshes = reports.flatMap(r => r.refreshes);
const refreshesPerGame = reports.map(r => r.refreshCount);
const symbolDist = [0, 0, 0, 0, 0, 0];
for (const r of reports) for (let s = 0; s <= 5; s++) symbolDist[s] += r.refreshSymbolDist[s] || 0;
// WHERE in the game each refresh fired, as a fraction of that game's own length,
// bucketed into quarters. This is the "spread through the game" test: a mean turn
// number cannot tell a spread apart from a cluster in the middle.
const quarters = [0, 0, 0, 0];
for (const g of games) {
  const len = Math.max(1, g.turnsPlayed);
  for (const r of g.report.refreshes) {
    quarters[Math.min(3, Math.floor(4 * r.turn / len))]++;
  }
}
// The trigger invariant: turns that BEGAN with a fresh pot of tea still owed.
// The end-of-turn trigger is supposed to make this impossible THROUGH THE BODY OF
// THE GAME, so a firing there is a bug, not a tuning result.
//
// THE END OF THE GAME IS A LEGITIMATE EXCEPTION and must be counted apart, or
// this line reports the end rule as a fault. A pot due against an empty bag is a
// no-op since 6 August - it simply does not happen - so nothing refills the
// market from that point on and every turn after it begins with tea still due.
// (Until 6 August the same turns were produced by the 'bagEmpty' ENDING, which
// stopped refilling for the same reason and then closed the game. The ending is
// gone; the uncovered late turns it explained are not.)
//
// Those turns can now run for longer than one round, because a dry bag no longer
// ends anything, so this is a "late in the game" split rather than a strict
// final-round one - the boundary below is kept at the last round because that is
// still where the great majority of them land.
//
// The split is by turn number: turns are 0-based and one sample is taken per turn
// played, so the final round is the last playerCount turns of the game.
let teaDueLate = 0;
let teaDueEarly = 0;
for (const g of games) {
  const finalRoundFrom = Math.max(0, g.turnsPlayed - playerCount);
  for (const turn of g.report.teaDueTurns || []) {
    if (turn >= finalRoundFrom) teaDueLate++;
    else teaDueEarly++;
  }
}
const teaDueAtTurnStart = sumOf(reports.map(r => r.teaDueAtTurnStart));
const totalTurnStarts = sumOf(reports.map(r => r.turnSampleCount));
// Is one seat doing all the flushing? Largest share of a game's own refreshes
// fired by a single player.
const seatShares = games.filter(g => g.report.refreshCount > 0)
  .map(g => maxOf(Object.values(g.report.refreshesByPlayer)) / g.report.refreshCount);
const bySeat = {};
for (const r of allRefreshes) bySeat[r.playerId] = (bySeat[r.playerId] || 0) + 1;
console.log(`\n=== 1. REFRESH CADENCE (${allRefreshes.length} refreshes over ${nGames} games) ===\n`);
console.log(`Refreshes/game:    mean=${meanOf(refreshesPerGame).toFixed(2)}, min=${minOf(refreshesPerGame)}, max=${maxOf(refreshesPerGame)}`);
console.log(`Games with >=1:    ${refreshesPerGame.filter(v => v > 0).length}/${nGames}`);
console.log(`Symbols at firing: mean=${meanOf(allRefreshes.map(r => r.symbols)).toFixed(2)}, dist 0/1/2/3/4/5 = ${symbolDist.join('/')}`);
console.log(`Tiles left at pot: mean=${meanOf(allRefreshes.map(r => r.tilesLeft)).toFixed(2)}, min=${minOf(allRefreshes.map(r => r.tilesLeft))}, max=${maxOf(allRefreshes.map(r => r.tilesLeft))} (of 25 cells)`);
console.log(`Reward collected:  total=${sumOf(allRefreshes.map(r => r.reward))}, mean/refresh=${meanOf(allRefreshes.map(r => r.reward)).toFixed(2)} cupcakes`);
console.log(`Firing turn:       mean=${meanOf(allRefreshes.map(r => r.turn)).toFixed(1)}, min=${minOf(allRefreshes.map(r => r.turn))}, max=${maxOf(allRefreshes.map(r => r.turn))}`);
console.log(`Spread over game:  quarters Q1/Q2/Q3/Q4 = ${quarters.join('/')} (an even split is "spread through the game")`);
console.log(`Fired by seat:     ${JSON.stringify(bySeat)}; one seat's share of its own game mean=${(100 * meanOf(seatShares)).toFixed(1)}%`);
console.log(`TRIGGER INVARIANT: ${teaDueAtTurnStart}/${totalTurnStarts} turns began with tea still due`);
console.log(`  before the final round: ${teaDueEarly} (MUST be 0 - a skipped pot or a flush that failed to cover the symbols)`);
console.log(`  in the final round:     ${teaDueLate} (expected: a pot due against an empty bag is a no-op, so the market stops refilling and the last turns play on uncovered)`);

// ---------------------------------------------------------------------------
// 2. BACKSTOP (EMPTY-BOARD) REFRESHES. Should now be ZERO, not merely rare: an
//    empty market shows all five teapots, so the end-of-turn trigger refills it
//    before the turn can pass on. Anything here means the trigger has a hole.
// ---------------------------------------------------------------------------
const mandatoryPerGame = reports.map(r => r.mandatoryRefreshCount);
const mandatoryTurns = reports.flatMap(r => r.mandatoryRefreshTurns);
console.log(`\n=== 2. BACKSTOP (EMPTY-BOARD) REFRESHES - should be 0 ===\n`);
console.log(`Per game:          mean=${meanOf(mandatoryPerGame).toFixed(3)}, max=${maxOf(mandatoryPerGame)}, games affected=${mandatoryPerGame.filter(v => v > 0).length}/${nGames}`);
console.log(`Share of all refreshes: ${pct(sumOf(mandatoryPerGame), allRefreshes.length)}`);
console.log(`Turn numbers:      ${mandatoryTurns.length ? mandatoryTurns.slice(0, 30).join(', ') + (mandatoryTurns.length > 30 ? ' ...' : '') : '(none)'}`);

// ---------------------------------------------------------------------------
// 3. CARD ROW SIZE. One sample per real turn, taken at the START of that turn
//    (before a refresh could flush it back to INITIAL_MARKET_CARDS). Feeds the
//    initialMarketCards knob - the row is capped at MAX_MARKET_CARDS (30 July).
// ---------------------------------------------------------------------------
const allRowSizes = reports.flatMap(r => r.rowSizes);
const rowHist = [];
for (const size of allRowSizes) rowHist[size] = (rowHist[size] || 0) + 1;
const firstClaimRowSizes = reports.map(r => r.firstClaimRowSize).filter(v => v !== null);
const firstClaimTurns = reports.map(r => r.firstClaimTurn).filter(v => v !== null);
const endRowSizes = games.map(g => g.endRowSize);
console.log(`\n=== 3. CARD ROW SIZE (${allRowSizes.length} turn samples) ===\n`);
console.log(`Row size/turn:     mean=${meanOf(allRowSizes).toFixed(2)}, min=${minOf(allRowSizes)}, max=${maxOf(allRowSizes)}`);
// The physical-table check: each game's own peak row. "max" above is the single
// worst turn of the whole batch; this line says how big the row gets in a
// TYPICAL game, which is what decides whether the card row fits on a table.
const gamePeakRows = reports.map(r => r.maxRowSize);
console.log(`Per-game peak:     mean=${meanOf(gamePeakRows).toFixed(2)}, min=${minOf(gamePeakRows)}, max=${maxOf(gamePeakRows)}`);
console.log(`  distribution:    ${histLine(rowHist)}`);
console.log(`At FIRST claim:    mean=${meanOf(firstClaimRowSizes).toFixed(2)}, max=${maxOf(firstClaimRowSizes)} (first claim lands on turn mean=${meanOf(firstClaimTurns).toFixed(2)})`);
console.log(`At game end:       mean=${meanOf(endRowSizes).toFixed(2)}, max=${maxOf(endRowSizes)}`);

// ---------------------------------------------------------------------------
// 4. CARD-LOCK INCIDENCE. A locked turn is one where the active player reached
//    their claim step with no legal claim anywhere on the card row.
//    The 27 July lock (every card wanting a colour absent from market and boards)
//    should be structurally impossible to SUSTAIN now, because the row grows by a
//    card every single turn - so the streak line is the one that decides it.
// ---------------------------------------------------------------------------
const claimSteps = sumOf(reports.map(r => r.claimChanceSamples));
const lockTurns = sumOf(reports.map(r => r.lockTurns));
const lockStreaks = reports.flatMap(r => Object.values(r.longestLockStreakByPlayer));
const streakHist = [];
for (const s of lockStreaks) streakHist[s] = (streakHist[s] || 0) + 1;
console.log(`\n=== 4. CARD-LOCK INCIDENCE (${claimSteps} claim steps) ===\n`);
console.log(`Locked turns:      ${lockTurns}/${claimSteps} (${pct(lockTurns, claimSteps)})`);
console.log(`Games with >=1:    ${reports.filter(r => r.lockTurns > 0).length}/${nGames}`);
console.log(`Longest lock streak per player: max=${maxOf(lockStreaks)}, mean=${meanOf(lockStreaks).toFixed(2)}`);
console.log(`  streak lengths:  ${histLine(streakHist)} (player-results counted by their worst run of consecutive locked turns)`);

// ---------------------------------------------------------------------------
// 5. MULTI-MATCH FREQUENCY. Turns where the player could legally have claimed 2+
//    cards - the turns on which one-claim-per-turn actually bit. This is the
//    evidence for or against the pre-agreed extraClaimCupcakeCost variant.
// ---------------------------------------------------------------------------
const multiMatchTurns = sumOf(reports.map(r => r.multiMatchTurns));
const claimableHist = [];
for (const r of reports) {
  for (let i = 0; i < r.claimableHistogram.length; i++) {
    claimableHist[i] = (claimableHist[i] || 0) + r.claimableHistogram[i];
  }
}
console.log(`\n=== 5. MULTI-MATCH FREQUENCY (${claimSteps} claim steps) ===\n`);
console.log(`Turns with 2+ claimable: ${multiMatchTurns}/${claimSteps} (${pct(multiMatchTurns, claimSteps)})`);
console.log(`Claimable cards/turn:    mean=${meanOf(reports.map(r => r.meanClaimableCards)).toFixed(2)}`);
console.log(`  distribution:          ${histLine(claimableHist)} (cards claimable when the claim step opened)`);

// ---------------------------------------------------------------------------
// 6. THE CARD ROW AT ITS CAP - the metric that replaced "claims from reserves"
//    on 11 August, when the reserve was deleted and the tea flush with it.
//
//    WHY THIS ONE. The flush was the only thing that ever SHRANK the row, so a
//    row at MAX_MARKET_CARDS now only moves when somebody claims from it. If a
//    table can sit at the cap for long stretches, the 30 July frozen-market
//    failure is back at the top of the range instead of the bottom, and the paid
//    2-card deal cannot help (it needs room for both cards). This share is the
//    early warning.
// ---------------------------------------------------------------------------
const totalClaims = sumOf(reports.map(r => r.totalCardsClaimed));
const atCap = allRowSizes.filter(n => n >= MAX_MARKET_CARDS).length;
console.log(`\n=== 6. CARD ROW AT THE CAP (${allRowSizes.length} turn samples) ===\n`);
console.log(`Turns starting at the cap (${MAX_MARKET_CARDS}): ${atCap}/${allRowSizes.length} (${pct(atCap, allRowSizes.length)})`);
console.log(`  The row grows by one every turn and shrinks only when somebody claims. Since`);
console.log(`  11 August no pot of tea flushes it, so this is the staleness watch: a high`);
console.log(`  share means the row is standing still and the paid 2-card deal is locked out.`);

// ---------------------------------------------------------------------------
// 7. DECK RESHUFFLES. Expected to be ZERO since 11 August: the tea flush was the
//    discard pile's only source, and a deck of 50 against a row that grows one a
//    turn cannot run dry. A non-zero figure here means something is discarding
//    cards again and the "one-way deck" assumption in the engine has broken.
// ---------------------------------------------------------------------------
const reshuffles = reports.map(r => r.deckReshuffles);
const flushBurn = games.map(g => g.cardsDiscardedByFlushes);
console.log(`\n=== 7. DECK RESHUFFLES ===\n`);
console.log(`Per game:          mean=${meanOf(reshuffles).toFixed(2)}, min=${minOf(reshuffles)}, max=${maxOf(reshuffles)}  (expected 0)`);
console.log(`Games with >=1:    ${reshuffles.filter(v => v > 0).length}/${nGames}`);
console.log(`Cards that left the row unclaimed: mean/game=${meanOf(flushBurn).toFixed(2)} (expected 0 - nothing burns the row now)`);

// ---------------------------------------------------------------------------
// 8. CUPCAKE ECONOMY. Influx by source, spend by use, and the PHYSICAL SUPPLY
//    question. CUPCAKES STOPPED SCORING VP ON 3 AUGUST and became a four-outlet
//    currency plus the tiebreaker, so this block is now the evidence for "what is
//    a cupcake worth" - the number the 1/2/3 price ladder and the seat stagger
//    both rest on. (The held-objective reward used to rest on it too; the pantry
//    goals are deleted since 4 August.) The rules have had no cupcake cap since
//    24 July, so the supply lines MEASURE and enforce nothing.
// ---------------------------------------------------------------------------
const influx = { start: 0, pot: 0, plates: 0 };
const spend = { moveTile: 0, extraTile: 0, removePlate: 0, dealCards: 0, reserve: 0, extraClaim: 0 }; // reserve stays 0 - deleted 11 August
for (const r of reports) {
  addInto(influx, r.cupcakeInfluxTotals);
  addInto(spend, r.cupcakeSpendTotals);
}
const influxTotal = influx.start + influx.pot + influx.plates;
const spendTotal = Object.values(spend).reduce((a, v) => a + v, 0);
const keptCupcakes = sumOf(allPlayerMetrics.map(m => m.cupcakes));
const totalScore = sumOf(allPlayerMetrics.map(m => m.score));
const peakHeld = reports.map(r => r.maxCupcakesHeld);
const gamesOver30 = peakHeld.filter(v => v > CUPCAKE_TOKENS_IN_BOX).length;
// The two halves of the cupcake-worth question the handoff asks for by name:
// games ending with a player who could not afford what they wanted, and games
// ending with a player sitting on a surplus they had nothing to do with.
const brokeGames = games.filter(g => g.perPlayer.some(pl => pl.cupcakes === 0)).length;
const surplusGames = games.filter(g => g.perPlayer.some(pl => pl.cupcakes >= 4)).length;
console.log(`\n=== 8. CUPCAKE ECONOMY (${nPlayers} player-results) ===\n`);
console.log(`Influx by source:  start=${influx.start}, refresh pot=${influx.pot}, plates=${influx.plates}, total=${influxTotal}`);
console.log(`  mean/player:     start=${(influx.start / nPlayers).toFixed(2)}, pot=${(influx.pot / nPlayers).toFixed(2)}, plates=${(influx.plates / nPlayers).toFixed(2)}, total=${(influxTotal / nPlayers).toFixed(2)}`);
// THE PRICES ARE READ FROM THE ENGINE, NEVER TYPED. They were hardcoded as
// "(2ea)" and "(3ea)" until 7 August and went on printing the 3 August ladder
// under the 7 August one, which is the third time a stale literal has survived a
// repricing in this project. The divide-by-price line below is derived for the
// same reason.
console.log(`Spend by use:      move tile=${spend.moveTile} (${MOVE_TILE_CUPCAKE_COST}ea), extra tile=${spend.extraTile} (${EXTRA_TILE_CUPCAKE_COST}ea), deal ${CARDS_PER_DEAL} cards=${spend.dealCards} (${DEAL_CARDS_CUPCAKE_COST}ea), remove plate=${spend.removePlate} (${REMOVE_PLATE_CUPCAKE_COST}ea), extra claim=${spend.extraClaim} (disabled)`);
console.log(`  times bought:    move tile=${(spend.moveTile / MOVE_TILE_CUPCAKE_COST).toFixed(0)}, extra tile=${(spend.extraTile / EXTRA_TILE_CUPCAKE_COST).toFixed(0)}, deal cards=${(spend.dealCards / DEAL_CARDS_CUPCAKE_COST).toFixed(0)}, remove plate=${(spend.removePlate / REMOVE_PLATE_CUPCAKE_COST).toFixed(0)}`);
console.log(`  total spent:     ${spendTotal} = ${pct(spendTotal, influxTotal)} of influx (was 47-51% when hoarding paid 1 VP each)`);
console.log(`  PRICES ARE CUPCAKES, NOT ACTIONS: the line above divides each figure by its`);
console.log(`  price, so a spend at ${REMOVE_PLATE_CUPCAKE_COST} showing the same cupcake total as one at 1 is`);
console.log(`  ${REMOVE_PLATE_CUPCAKE_COST} times the rarer action.`);
console.log(`  plates returned to the box: ${sumOf(games.map(g => g.platesReturnedToBox || 0))} over ${nGames} games (${(sumOf(games.map(g => g.platesReturnedToBox || 0)) / nGames).toFixed(2)}/game)`);
// THE UNCAPPED EXTRA TILE, measured as CLUMPING rather than as a total (9 August,
// second revision). Under the old one-per-turn rule every one of these lines is a
// tautology - buying turns and tiles bought are the same number and the
// distribution is all 1s - so a run whose distribution is still all 1s has
// measured a bot that cannot see a two-tile unlock, not a rule that nobody wants.
console.log(`EXTRA TILES PER TURN (cap = ${liveCap === null ? 'UNLIMITED' : liveCap}):`);
console.log(`  turns that bought any: ${extraTileTurns.turns} over ${nGames} games (${(extraTileTurns.turns / nGames).toFixed(2)}/game)`);
console.log(`  tiles bought/buying turn: ${extraTileTurns.turns ? (extraTileTurns.buys / extraTileTurns.turns).toFixed(2) : '0.00'}, most in one turn=${extraTileTurns.most}`);
console.log(`  distribution: ${Object.keys(extraTileTurns.dist).sort((a, b) => a - b).map(k => `${k}x${extraTileTurns.dist[k]}`).join(' ') || '(none)'}`);
console.log(`  multi-buy turns: ${extraTileTurns.turns - (extraTileTurns.dist[1] || 0)} (${pct(extraTileTurns.turns - (extraTileTurns.dist[1] || 0), extraTileTurns.turns || 1)} of buying turns)`);
// THE OTHER THREE SPENDS, CLUMPED (11 August, second revision). Every allowance
// on the menu is deleted, so each of these can now show a number above 1 - and
// under the old rule every one of them was a tautology at 1.
console.log(`OTHER SPENDS PER TURN:`);
console.log(clumpLine('move a tile      ', spendClumps.move, getPerTurnSpendCap('moveTile')));
console.log(clumpLine('clear a plate    ', spendClumps.plate, getPerTurnSpendCap('removePlate')));
console.log(clumpLine(`deal ${CARDS_PER_DEAL} cards     `, spendClumps.deal, getPerTurnSpendCap('dealCards')));
console.log(`Kept at game end:  ${keptCupcakes} = ${(keptCupcakes / nPlayers).toFixed(2)}/player - SCORES NOTHING since 3 August, tiebreaker only`);
console.log(`  games where a player finished BROKE (0 held):   ${brokeGames}/${nGames} (${pct(brokeGames, nGames)})`);
console.log(`  games where a player finished with 4+ unspent:  ${surplusGames}/${nGames} (${pct(surplusGames, nGames)})`);
console.log(`SUPPLY WATCH (${CUPCAKE_TOKENS_IN_BOX} tokens proposed for the box; the RULES have no cap):`);
// DERIVED, NOT TYPED (9 August, second revision). This line read "4p setup alone
// now places 14 tokens (2+3+4+5)" as a literal, at every player count, and went on
// printing the 4-player ladder after the table had changed. That is the same stale
// literal this file's metric-8 header warns about two screens up.
console.log(`  ${playerCount}p setup alone places ${getStartingCupcakes(playerCount).reduce((a, v) => a + v, 0)} tokens (${getStartingCupcakes(playerCount).join('+')}) before a single pot is brewed.`);
console.log(`  peak held simultaneously across all players: mean=${meanOf(peakHeld).toFixed(2)}, max=${maxOf(peakHeld)}`);
console.log(`  games whose peak exceeded ${CUPCAKE_TOKENS_IN_BOX} tokens: ${gamesOver30}/${nGames} (${pct(gamesOver30, nGames)})`);

// ---------------------------------------------------------------------------
// 9. BAG SKEW. The refresh is a full destructive flush, so the same tiles cycle
//    board -> bag -> board. A colour nobody sweeps shows up as a surplus in the
//    flushed-back distribution against the bag's flat per-colour share.
//
//    THE BASELINE IS DERIVED, NEVER TYPED. It was "20" as a literal in the skew
//    column until 4 August, which happened to be right only because there are
//    five colours; the bag size beside it was written out as a number twice and
//    was wrong for the whole life of the 125-tile bag. Both now come from
//    TILE_COLOUR_SHARE_PCT / TILE_BAG_SIZE / TILE_COPIES in tiles.js.
// ---------------------------------------------------------------------------
const returned = {};
const dealt = {};
for (const r of reports) {
  addInto(returned, r.returnedColours);
  addInto(dealt, r.dealtColours);
}
const tilesReturned = sumOf(reports.map(r => r.tilesReturned));
const tilesDealt = sumOf(reports.map(r => r.tilesDealtAfterFlush));
const immediateReturns = sumOf(reports.map(r => r.immediateReturns));
console.log(`\n=== 9. BAG SKEW (${sumOf(reports.map(r => r.bagFlushCount))} flushes) ===\n`);
console.log(`Bag baseline is a flat ${TILE_COLOUR_SHARE_PCT.toFixed(1)}% per colour (${TILE_BAG_SIZE / COLOURS.length} of each in ${TILE_BAG_SIZE} tiles, ${TILE_COPIES} copies per combo).`);
for (const colour of Object.keys(returned).sort()) {
  const rShare = 100 * (returned[colour] || 0) / (tilesReturned || 1);
  const dShare = 100 * (dealt[colour] || 0) / (tilesDealt || 1);
  console.log(`  ${colour.padEnd(7)} flushed back ${rShare.toFixed(1).padStart(5)}%   dealt out ${dShare.toFixed(1).padStart(5)}%   (skew ${(rShare - TILE_COLOUR_SHARE_PCT).toFixed(1).padStart(5)} pts)`);
}
console.log(`Tiles returned=${tilesReturned}, dealt back out=${tilesDealt}, of which ${immediateReturns} came straight back (${pct(immediateReturns, tilesDealt)} of a "fresh" board is recycled)`);

// ---------------------------------------------------------------------------
// 10. PER-PLAYER CLAIMS, FINAL SCORE SPREAD (standing D1 blowout watch) and GAME
//     LENGTH (standing D3 watch - real sessions still need timing).
// ---------------------------------------------------------------------------
const scores = allPlayerMetrics.map(m => m.score);
const claimsPer = allPlayerMetrics.map(m => m.claims);
const claimGaps = games.map(g => maxOf(g.perPlayer.map(p => p.claims)) - minOf(g.perPlayer.map(p => p.claims)));
const spreads = games.map(g => g.scoreSpread);
const turnsPerGame = games.map(g => g.turnsPlayed);
const stepsPerGame = games.map(g => g.steps);
const totalStandTiles = sumOf(allPlayerMetrics.map(m => m.standTiles));
const totalCrumbs = sumOf(allPlayerMetrics.map(m => m.crumbs));
const totalCardVp = sumOf(allPlayerMetrics.map(m => m.cardVp));
const totalStandScore = sumOf(allPlayerMetrics.map(m => m.standScore));
console.log(`\n=== 10. CLAIMS, SCORES AND GAME LENGTH (${nPlayers} player-results) ===\n`);
console.log(`Claims/player:     mean=${meanOf(claimsPer).toFixed(2)}, min=${minOf(claimsPer)}, max=${maxOf(claimsPer)}`);
console.log(`  within-game gap: mean=${meanOf(claimGaps).toFixed(2)}, max=${maxOf(claimGaps)} (most claims minus fewest, per game)`);
// EMPTY PLATES: the component count, and nothing else. 6 AUGUST - this line used
// to report the plate OVERRUN, claims made past the shared pool. There is no
// pool: plates are unlimited, nothing tests one, and the only question left is
// how many a single player can need in front of them at once. Every claim plants
// exactly one plate, so that is the heaviest claimer's claim count. The MAX sizes
// the punchboard; the mean only says how routine it is.
const maxPlates = games.map(g => g.maxPlatesOnePlayer);
console.log(`Plates, most placed by any one player: mean=${meanOf(maxPlates).toFixed(2)}, max=${maxOf(maxPlates)}`);
console.log(`  BOX HOLDS ${EMPTY_PLATES_IN_BOX_PER_PLAYER} per player (${EMPTY_PLATES_IN_BOX_PER_PLAYER * playerCount} at ${playerCount}p) - see tiles.js.`);
console.log(`  games wanting an ${EMPTY_PLATES_IN_BOX_PER_PLAYER + 1}th: ${pct(maxPlates.filter(v => v > EMPTY_PLATES_IN_BOX_PER_PLAYER).length, nGames)} - a THIN TAIL, not a hard zero (about 0.1% of`);
console.log(`  2-player games). Plates are unlimited by rule, so the box count is a convenience`);
console.log(`  figure and a table that runs one short simply uses anything to hand. Needs a few`);
console.log(`  thousand games to read at all - do not conclude anything from a short run.`);
console.log(`  The ceiling is structural: one claim per turn, one plate per claim, so a player`);
console.log(`  can never place more plates than they have taken turns.`);
// THE TRIM RULE (6 August): how often a sweep did not fit, and what it cost.
// Adopted baselines: 0.53 / 0.51 / 0.47 turns and 0.99 / 1.11 / 1.00 tiles per
// game at 2/3/4 players. Materially larger means the sweep heuristic has stopped
// caring about board space; materially smaller means it has started over-caring.
const trims = games.map(g => g.trimmedSweeps);
const binned = games.map(g => g.tilesReturnedToBag);
console.log(`Trimmed sweeps:    ${meanOf(trims).toFixed(2)} turns/game hit the rule, ${meanOf(binned).toFixed(2)} tiles/game went back into the bag`);
console.log(`  games affected: ${pct(trims.filter(v => v > 0).length, nGames)}  (a swept tile with nowhere to go is returned, not lost - the player keeps their spend and claim)`);
console.log(`Final score:       mean=${meanOf(scores).toFixed(1)}, min=${minOf(scores)}, max=${maxOf(scores)}`);
console.log(`Score spread (D1): mean=${meanOf(spreads).toFixed(1)}, min=${minOf(spreads)}, max=${maxOf(spreads)} (ABSOLUTE winner-minus-last, per game)`);
// The RATIO as well as the gap. Reporting only one of them misleads: the ratio
// moves whenever everyone's score inflates, so removing the cupcake VP (3 August)
// and then the objective VP (4 August) both worsen it without either changing who
// is ahead.
const lastAsShare = games.map(g => {
  const sc = g.perPlayer.map(pl => pl.score);
  const top = maxOf(sc);
  return top > 0 ? minOf(sc) / top : 1;
});
console.log(`  last as % of winner: mean=${(100 * meanOf(lastAsShare)).toFixed(1)}% (report BOTH - the ratio alone moves with score inflation)`);
const totalMenuVp = sumOf(allPlayerMetrics.map(m => m.tastingMenuVp));
const totalFlavourVp = sumOf(allPlayerMetrics.map(m => m.flavourVp));
console.log(`Score make-up:     stand=${(totalStandScore / nPlayers).toFixed(1)}, cards=${(totalCardVp / nPlayers).toFixed(1)}, crumbs=${(totalCrumbs / nPlayers).toFixed(1)}, menus=${(totalMenuVp / nPlayers).toFixed(1)}, flavour=${(totalFlavourVp / nPlayers).toFixed(1)} VP/player`);
console.log(`  (THOSE FIVE ARE THE WHOLE SCORE, and they must sum to the mean above - if they do not,`);
console.log(`   a lane has been added to the engine without being added here, and the card figure is`);
console.log(`   where the difference hides, because it is derived by subtraction. Cupcakes stopped`);
console.log(`   scoring on 3 August (~3 VP/player) and the ingredient objectives were deleted on`);
console.log(`   4 August (~3-6 VP/player). MENUS is the flavour-module slot - Today's Speciality, then`);
console.log(`   the Freshness Bonus (9.0 VP/player, 18.5% of score - measured TOO HIGH), now the`);
console.log(`   Tasting Menu, TARGET ~4.4 VP/player. FLAVOUR is the FIFTH lane, added 6 August: the`);
console.log(`   first one not fed by the claim step. Unsteered baseline 5.18 / 4.59 / 4.32 - see metric 14.)`);
console.log(`  card:stand VP    = ${totalCardVp}:${totalStandScore} (card share ${pct(totalCardVp, totalCardVp + totalStandScore)})`);
console.log(`  plate:crumb tiles= ${totalStandTiles}:${totalCrumbs} (crumb share ${pct(totalCrumbs, totalStandTiles + totalCrumbs)})`);
console.log(`Game length (D3):  turns mean=${meanOf(turnsPerGame).toFixed(1)}, min=${minOf(turnsPerGame)}, max=${maxOf(turnsPerGame)}`);
console.log(`  turns per player: mean=${(meanOf(turnsPerGame) / playerCount).toFixed(2)} - the figure to compare across player counts`);
console.log(`  driver phase-steps (NOT turns): mean=${meanOf(stepsPerGame).toFixed(1)} - the loop runs several times per turn`);
console.log(`End reasons:       ${JSON.stringify(endReasonCounts)}`);
console.log(`  Since 4 August a reason names WHICH CONDITION ARMED THE ENDING, not where play stopped:`);
console.log(`  the game runs on to the end of the round after it fires. First reason wins, so a game`);
console.log(`  that arms two in its last round is reported under the one that actually ended it.`);
console.log(`  SINCE 6 AUGUST THERE ARE TWO, and no others:`);
console.log(`    'boardFull'   - a player's board is completely full. This is the game's clock and it`);
console.log(`                    is expected to end ESSENTIALLY EVERY GAME (100% of 3,000 measured).`);
console.log(`    'marketTiles' - market and bag both empty. A backstop: the table can only absorb`);
console.log(`                    25 x players tiles against a bag of ${TILE_BAG_SIZE}, so at 2 and 3 players it is`);
console.log(`                    structurally unreachable and at 4 the board fill wins the race.`);
console.log(`  'cardMarket', 'bagEmpty' and 'boardOverflow' are DELETED. Any of them appearing here`);
console.log(`  means something is arming an ending the rules no longer have.`);

// ---------------------------------------------------------------------------
// 11. THE EQUAL-TURNS RULE (4 August). Every player must have had exactly the
//     same number of turns when the game is scored, whichever condition armed the
//     ending. This replaces the old pair of turn-boundary checks, which CLAIMED to
//     give equal turns and did not - a boundary check firing in front of seat 3 of
//     4 left seats 1-2 a turn up.
//
//     Two independent readings, and both must hold:
//       (a) turnsPlayed is an exact multiple of the player count, since the game
//           can only be declared over when the turn comes back to the start player;
//       (b) the per-seat turn counts, read from the collector's one-sample-per-turn
//           log rather than derived from (a), are all identical.
//     ANY FAILURE HERE IS A RULE BUG, not a tuning result - and it is worth
//     breaking out by end reason, because the reasons arm at different points in
//     the turn and a hole would show up in only one of them.
// ---------------------------------------------------------------------------
const finished = games.filter(g => g.gameState.gameOver);
const unequalGames = finished.filter(g => Math.min(...g.turnsBySeat) !== Math.max(...g.turnsBySeat));
const nonMultipleGames = finished.filter(g => g.turnsPlayed % playerCount !== 0);
const untriggered = finished.filter(g => !g.endTriggered || !g.endReason);
console.log(`\n=== 11. EQUAL-TURNS RULE (${finished.length}/${nGames} games reached a scored ending) ===\n`);
console.log(`Every seat had the same number of turns: ${finished.length - unequalGames.length}/${finished.length} games (MUST be all)`);
console.log(`turnsPlayed divisible by ${playerCount}:            ${finished.length - nonMultipleGames.length}/${finished.length} games (MUST be all)`);
console.log(`Finished games carrying an end reason:   ${finished.length - untriggered.length}/${finished.length} games (MUST be all)`);
if (unequalGames.length) {
  console.log(`  FAILURES by end reason: ${JSON.stringify(unequalGames.reduce((acc, g) => { acc[g.endReason || 'none'] = (acc[g.endReason || 'none'] || 0) + 1; return acc; }, {}))}`);
  console.log(`  first failing game's per-seat turns: ${JSON.stringify(unequalGames[0].turnsBySeat)}`);
}
if (finished.length < nGames) {
  console.log(`  ${nGames - finished.length} game(s) hit the driver's step guard without ever finishing - investigate before reading anything above.`);
}

// ---------------------------------------------------------------------------
// 12. SEAT FAIRNESS. THE SINGLE MOST IMPORTANT NUMBER IN THE 3 AUGUST SET, and
//     the verification test for the staggered starting cupcakes (2/3/4/5).
//     TARGET: every seat within +/-2 points of an even win share, with an
//     identical strategy in every seat.
//
//     The advantage this corrects was large and real: with one strategy in every
//     seat over 3,000 games per configuration, P1 won 55.8 / 39.8 / 40.3% at
//     2/3/4 players against 50 / 33.3 / 25% expected, and the last seat at 4p
//     won 14.4%. The compensation is a GUESS at what a cupcake is worth, so this
//     must be verified, not assumed.
//
//     RE-MEASURE FROM SCRATCH SINCE 4 AUGUST. Those figures were taken with the
//     ingredient objectives in the game (they leaned the same way, and are now
//     deleted) and under the old turn-boundary endings, which did NOT give equal
//     turns. Equal turns removes one cause of the gradient outright, so the
//     stagger may now be over-correcting.
// ---------------------------------------------------------------------------
const evenShare = 100 / playerCount;
const seatWins = Array(playerCount).fill(0);
const seatScoreTotal = Array(playerCount).fill(0);
const seatClaimTotal = Array(playerCount).fill(0);
for (const g of games) {
  // A shared win counts as a fractional win for each winner, so the shares still
  // sum to 100% and a tie does not silently vanish from one seat's column.
  const share = 1 / Math.max(1, g.winnerSeats.length);
  for (const seat of g.winnerSeats) seatWins[seat] += share;
  for (const pl of g.perPlayer) {
    seatScoreTotal[pl.seat] += pl.score;
    seatClaimTotal[pl.seat] += pl.claims;
  }
}
console.log(`\n=== 12. SEAT FAIRNESS - verifies the staggered starting cupcakes ===\n`);
// Read the live table for THIS player count rather than a by-seat array: since
// 4 August the stagger is keyed by player count, so seat 3 does not get the same
// opening at 3 players as it does at 4.
const startingCupcakes = getStartingCupcakes(playerCount);
console.log(`Even share at ${playerCount}p is ${evenShare.toFixed(1)}%. Target: every seat within +/-2 points of it.`);
console.log(`Live table at ${playerCount}p: ${startingCupcakes.join(' / ')} (total influx ${startingCupcakes.reduce((a, v) => a + v, 0)}).`);
let worstDeviation = 0;
for (let seat = 0; seat < playerCount; seat++) {
  const winShare = 100 * seatWins[seat] / nGames;
  const deviation = winShare - evenShare;
  if (Math.abs(deviation) > Math.abs(worstDeviation)) worstDeviation = deviation;
  const flag = Math.abs(deviation) > 2 ? '  <-- OUTSIDE TARGET' : '';
  console.log(`  seat ${seat + 1} (starts with ${startingCupcakes[seat]} cupcakes): wins ${winShare.toFixed(1)}% (${deviation >= 0 ? '+' : ''}${deviation.toFixed(1)}), mean score ${(seatScoreTotal[seat] / nGames).toFixed(2)}, claims ${(seatClaimTotal[seat] / nGames).toFixed(2)}${flag}`);
}
const scoreGradient = (seatScoreTotal[0] - seatScoreTotal[playerCount - 1]) / nGames;
console.log(`Score gradient first-to-last: ${scoreGradient.toFixed(2)} VP (was 1.68 / 2.32 / 6.26 at 2/3/4p before the stagger)`);
console.log(`Worst seat deviation: ${worstDeviation >= 0 ? '+' : ''}${worstDeviation.toFixed(1)} points - ${Math.abs(worstDeviation) <= 2 ? 'WITHIN TARGET' : 'OUTSIDE TARGET'}`);
console.log(`  NOTE: at ${gamesPerConfig} games the 95% noise band is roughly +/-${(98 / Math.sqrt(gamesPerConfig)).toFixed(1)} points. The original`);
console.log(`  finding used 3,000 games/config; treat anything under ~1,000 as indicative only.`);

// ---------------------------------------------------------------------------
// 13. THE TASTING MENU (5 August). Not from the 28 July list - it is the
//     verification pass for the module that replaced the Freshness Bonus.
//
//     DEAD CARDBOARD IS THE NUMBER THIS WHOLE SECTION EXISTS FOR: the share of
//     dealt menus that nobody ever takes. The unsteered floor - a bot that has
//     never heard of the module - is 81%.
//       well under 50%  the deck is reachable; tune TASTING_MENU_VP, not the deck;
//       above 50%       the deck is too steep. Revise THE DECK, not the value;
//       near 0%         every menu goes, which makes it a setup bonus rather than
//                       a race - check the contested line before celebrating.
//
//     THE FOUR-TILE DECK FAILED THIS TEST AND WAS REPLACED ON 5 AUGUST, the same
//     day it shipped. Measured at 2,000 games, 3p, basicBot, with the menu-aware
//     bot wired up in both arms - so this is a clean like-for-like and the only
//     thing that differs is the deck:
//
//                            4 tiles (2/2 + 2/1/1)   3 tiles (2/1 + 1/1/1)
//       dead cardboard              57.9%                   21.9%
//       menus per player             0.56                    1.04
//       contested per game           0.131                   0.545
//       qualifying for 1+           52.2%                   79.5%
//       time to first menu     67.8% through            48.5% through
//
//     The four-tile row is condemned by the rule stated three lines above it: over
//     50% dead with a bot that is genuinely steering is a deck problem. It also
//     failed the LAST line of this section - at 67.8% of the way through a game,
//     the first menu was landing as an end-of-game bonus rather than a pressure
//     device, which is the module's stated job.
//
//     WHAT THE LIGHTER DECK COST was the dose, not reachability: 1.04 menus per
//     player at the original 8 VP was 8.33 VP/player, against the 4.4 this section
//     was built to aim at and the 9.0 that condemned the Freshness Bonus for being
//     too much. SETTLED 5 AUGUST by dropping the card to 5 VP, which measures 4.52
//     VP/player. See TASTING_MENU_VP in game.js.
//
//     BUT CHECK THE BOT FIRST IF IT READS HIGH. basicBot prices the menus at the
//     sweep, placement and claim steps (MENU_*_SHARE). A high figure with those
//     unwired measures the bot's blindness, not the rule - which is exactly what
//     the 81% floor is.
//
//     THE PROJECTION THIS BUILD EXISTS TO CONFIRM OR KILL. A player makes about
//     six claims and 44.3% of them finish exactly ONE TILE SHORT, so one redirected
//     claim converts them: that projects roughly 0.55 menus per player, 4.4 VP,
//     about 9% of score. THAT 0.55 IS A PROJECTION, NOT A MEASUREMENT. Revise
//     TASTING_MENU_VP if the steered rate lands below 0.4 (raise toward 10-12) or
//     above 0.8 (drop to 6).
//
//     TIME TO FIRST MENU is the module's stated job made measurable. If menus are
//     all taken in the last two turns it is an end-of-game bonus rather than a
//     pressure device and has failed, whatever the dose says.
//
//     AND WATCH BY SEAT. The Freshness Bonus got menus-by-seat flat and it must not
//     regress; metric 12 is where a slope shows up as wins.
// ---------------------------------------------------------------------------
const menusDealt = sumOf(reports.map(r => r.menusDealt));
const menusDead = sumOf(reports.map(r => r.menusDead));
const menusTaken = menusDealt - menusDead;
const menusPer = allPlayerMetrics.map(m => m.tastingMenus);
const menuMaxes = reports.map(r => r.tastingMenusMax);
// Which menus were dealt. All ten must come up evenly over a long run; anything
// else is a bug in the deal, not a design finding.
const menuDeal = {};
for (const r of reports) {
  for (const id of r.tastingMenuDeal) menuDeal[id] = (menuDeal[id] || 0) + 1;
}
// THE DISTRIBUTION, not just the mean (metric 13.2). A mean of 0.55 built from
// every player taking about half a menu is a different game from one built from a
// fifth of players taking three.
const menuDist = {};
for (const n of menusPer) menuDist[n] = (menuDist[n] || 0) + 1;
// DEFICIT AT GAME END against the nearest menu still on the table (13.4). The
// 44.3% one-tile-short figure is the whole basis of the 0.55 projection, so this
// is where the projection is confirmed or killed.
const deficits = allPlayerMetrics.map(m => m.finalDeficit).filter(d => Number.isFinite(d));
const deficitDist = {};
for (const d of deficits) deficitDist[Math.min(4, d)] = (deficitDist[Math.min(4, d)] || 0) + 1;
const oneShort = deficitDist[1] || 0;
const twoOrMoreShort = deficits.filter(d => d >= 2).length;
// TIME TO FIRST MENU (13.7), as a fraction of each game's own length, because
// games differ in length and an absolute turn number would blur that away.
const firstMenuFraction = [];
const takeFractions = [];
for (const g of games) {
  const len = Math.max(1, g.turnsPlayed);
  const turns = (g.report.tastingMenuTurns || []).slice().sort((a, b) => a - b);
  for (const t of turns) takeFractions.push(t / len);
  if (turns.length > 0) firstMenuFraction.push(turns[0] / len);
}
const takenInLastThird = takeFractions.filter(f => f >= 2 / 3).length;
// WHERE the claims fall, and the sweep split. Both repeated from the previous two
// sections as the standing behavioural baselines.
const thirds = [0, 0, 0];
for (const g of games) {
  const len = Math.max(1, g.turnsPlayed);
  for (const turn of g.report.claimTurns || []) {
    thirds[Math.min(2, Math.floor(3 * turn / len))]++;
  }
}
const thirdsTotal = sumOf(thirds) || 1;
const declarations = { colour: 0, symbol: 0 };
for (const r of reports) addInto(declarations, r.sweepsByDeclaration);
const declarationTotal = declarations.colour + declarations.symbol;

console.log(`\n=== 13. THE TASTING MENU (${getTastingMenuCount(playerCount)} dealt = players+1, from a deck of ${TASTING_MENUS.length}, ${TASTING_MENU_VP} VP each) ===\n`);
if (!getTastingMenusEnabled()) {
  console.log(`MODULE DISABLED for this run (setTastingMenusEnabled(false)). Everything below reads zero`);
  console.log(`by construction - this is the A/B control arm, so compare metrics 1-12 against a live run.`);
}
console.log(`DEAD CARDBOARD:    ${menusDead}/${menusDealt} dealt menus were never taken = ${pct(menusDead, menusDealt)}`);
console.log(`  <-- THE number this module lives or dies by. Unsteered floor is 81%. Well under 50% means`);
console.log(`      the deck is reachable; above 50% with a menu-aware bot condemns the DECK, not the VP.`);
console.log(`      The four-tile deck read 57.9% here and was replaced on 5 August; three tiles reads ~22%.`);
console.log(`Menus per player:  mean=${meanOf(menusPer).toFixed(2)}, min=${minOf(menusPer)}, max=${maxOf(menusPer)} (= ${(meanOf(menusPer) * TASTING_MENU_VP).toFixed(2)} VP/player)`);
console.log(`  <-- TARGET was 0.55, projected against the FOUR-TILE deck. The three-tile deck lands near`);
console.log(`      0.9-1.0, which is why the card dropped from 8 VP to 5 on 5 August. Watch the VP/player`);
console.log(`      figure above against the ~4.4 target, not this rate alone. Unsteered: 0.19.`);
console.log(`  distribution:    ${Object.keys(menuDist).sort((a, b) => a - b).map(k => `${k} menus: ${pct(menuDist[k], nPlayers)}`).join(', ')}`);
console.log(`  most by ONE player in a game: mean=${meanOf(menuMaxes).toFixed(2)}, max=${maxOf(menuMaxes)}`);
console.log(`  <-- watch the MAX: one player hoovering the deal is the failure mode TASTING_MENU_ONE_PER_TURN`);
console.log(`      exists to fix. It ships OFF; turn it on and re-run before arguing about it.`);
const contested = sumOf(games.map(g => g.contestedMenus));
const qualifiers = sumOf(games.map(g => g.playersQualifyingForAny));
console.log(`CONTESTED MENUS:   ${(contested / nGames).toFixed(3)} per game - dealt menus 2+ players' final stands meet`);
console.log(`  <-- THE RACE, and the figure to be most sceptical of: unsteered it is 0.02 per game, i.e.`);
console.log(`      no race at all. Read off finished stands, so it sees overlap but not order.`);
console.log(`Players qualifying for at least one dealt menu: ${pct(qualifiers, nPlayers)} (19.1% unsteered)`);
console.log(`DEFICIT AT GAME END against the nearest menu still on the table:`);
console.log(`  qualified (0):   ${pct(deficitDist[0] || 0, deficits.length)}`);
console.log(`  ONE TILE SHORT:  ${pct(oneShort, deficits.length)}   <-- 44.3% unsteered. This is the decision the module exists to create.`);
console.log(`  2+ short:        ${pct(twoOrMoreShort, deficits.length)} (36.5% unsteered)`);
console.log(`  (${nPlayers - deficits.length} player-results had no untaken menu left to measure against and are excluded)`);
const menusBySeat = Array(playerCount).fill(0);
for (const pm of allPlayerMetrics) menusBySeat[pm.seat] += pm.tastingMenus;
console.log(`  by seat:         ${menusBySeat.map((v, i) => `seat ${i + 1}=${(v / nGames).toFixed(3)}`).join(', ')}`);
console.log(`  <-- MUST be flat. The Freshness Bonus got this flat and it must not regress; the Teapot`);
console.log(`      Track's equivalent line fell monotonically down the seating order, which condemned it.`);
console.log(`TIME TO FIRST MENU: mean=${firstMenuFraction.length ? (100 * meanOf(firstMenuFraction)).toFixed(1) : 'n/a'}% of the way through the game (over ${firstMenuFraction.length} games that took one)`);
console.log(`  menus taken in the LAST THIRD: ${pct(takenInLastThird, takeFractions.length)}`);
console.log(`  <-- if menus are all taken at the death, this is an end-of-game bonus rather than a pressure`);
console.log(`      device and has failed at its stated job, whatever the dose reads.`);
console.log(`Menus dealt:       ${JSON.stringify(menuDeal)} (should be even over a long run)`);
console.log(`Claims by game third: ${thirds.map(t => pct(t, thirdsTotal)).join(' / ')}`);
console.log(`  (24 / 39 / 37% with no flavour module; 24.0 / 39.4 / 36.6% under Today's Speciality, whose`);
console.log(`   failure to move this AT ALL is half of why it was replaced. This module's urgency is a race`);
console.log(`   against an opponent rather than against the clock, so read this as description.)`);
console.log(`Sweep declarations:   colour ${pct(declarations.colour, declarationTotal)} / ingredient ${pct(declarations.symbol, declarationTotal)}`);
console.log(`  (43.8 / 43.4 / 44.4% colour with no module; 42.8 / 42.9 / 43.4% under Today's Speciality -`);
console.log(`   a one-point move, which was the other reading that condemned it. A menu names INGREDIENTS,`);
console.log(`   so this should swing toward ingredient sweeps if the bot is really steering.)`);

// ---------------------------------------------------------------------------
// 14. THE FLAVOUR OF THE DAY (6 August). The verification pass for the game's
//     FOURTH scoring lane, and the first one in its history that is NOT FED BY
//     THE CLAIM STEP. That is the entire reason it exists: every other lane -
//     stand rows, card VP, Tasting Menus - fires only when a card is claimed, and
//     the trailing player is refused the claim on 37.7 / 42.5 / 44.2% of the claim
//     steps they reach at 2/3/4 players. On those turns they did not score less.
//     They scored nothing. This lane is fed by sweeping and placing, which nobody
//     can decline.
//
//     THE HEADLINE IS "DECIDES THE WINNER", and it is a calibration against the
//     game's own accepted module rather than an absolute target:
//
//                                              2p      3p      4p
//       Tasting Menus @5 VP - the benchmark   12.1%   22.5%   26.5%
//       Crumb tray @1 VP - the "does nothing" 0.8%    0.9%    0.6%
//       THIS MODULE at 1/tile + 3 - ADOPTED   12.9%   17.9%   20.4%
//       at 1/tile + 5 - REJECTED              16.6%   21.6%   26.3%
//
//     Consistently BELOW the Tasting Menu is the shape being aimed at. At 1+5 it
//     is a second Tasting Menu, and two ingredient-driven modules each deciding a
//     quarter of games would leave the colour-pattern puzzle deciding
//     correspondingly fewer - which is the shape of the 4 August Pantry Goals
//     failure.
//
//     EVERY BASELINE BELOW WAS MEASURED UNSTEERED - scored post-hoc on games
//     played by a bot that had never heard of the module - so they are all FLOORS.
//     basicBot now prices the lane at the sweep and claim steps, so a steered run
//     should read ABOVE them. If it reads at or below the unsteered floor, suspect
//     the bot terms before the rule.
//
//     AND THE WATCH ITEM THAT IS NOT ABOUT THIS MODULE AT ALL: the colour-versus-
//     ingredient declaration split, printed in metric 13 above. Baseline is 43.8 /
//     43.4 / 44.4% colour with no ingredient module in play. THE PER-TILE CLAUSE
//     GIVES EVERY PLAYER A REASON TO CHASE AN INGREDIENT ON EVERY TURN, and colour
//     is the card puzzle, and the card puzzle is the game. If colour drops more
//     than a few points below that baseline, the fix is specific and is NOT a
//     re-dose: drop the per-tile clause and run majority-only at 5 VP, which
//     motivates only the players in contention and still decides 10.4 / 12.5 /
//     12.4% of games.
// ---------------------------------------------------------------------------
const flavourTilesPer = allPlayerMetrics.map(m => m.flavourTiles);
const flavourVpPer = allPlayerMetrics.map(m => m.flavourVp);
const flavourGames = games.filter(g => g.flavourOfTheDay);
const flavourTies = flavourGames.filter(g => g.flavourTie).length;
const flavourDecidedCount = flavourGames.filter(g => g.flavourDecided).length;
const flavourMargins = flavourGames.map(g => g.flavourLeadMargin).filter(m => m !== null);
// Which ingredient was revealed. All five must come up evenly over a long run -
// anything else is a bug in the draw, not a design finding.
const flavourDeal = {};
for (const g of games) {
  const f = g.flavourOfTheDay || 'none';
  flavourDeal[f] = (flavourDeal[f] || 0) + 1;
}
// The majority by FINISHING RANK: rank 1 is the winner. A bonus that goes almost
// entirely to the winner is paying the player who was already ahead.
const flavourRankCounts = Array(playerCount).fill(0);
let flavourLeaderTotal = 0;
for (const g of flavourGames) {
  for (const rank of g.flavourLeaderRanks) {
    if (rank >= 0 && rank < flavourRankCounts.length) flavourRankCounts[rank]++;
    flavourLeaderTotal++;
  }
}
// The distribution of tiles held, not just the mean - a mean of 3.5 built from
// everybody holding 3 or 4 is a different game from one built from a leader on 8
// and everybody else on 2.
const flavourDist = {};
for (const n of flavourTilesPer) flavourDist[n] = (flavourDist[n] || 0) + 1;

console.log(`\n=== 14. THE FLAVOUR OF THE DAY (${FLAVOUR_VP_PER_TILE} VP per board tile + ${FLAVOUR_MAJORITY_VP} to the most, friendly ties) ===\n`);
if (!getFlavourEnabled()) {
  console.log(`MODULE DISABLED for this run (setFlavourEnabled(false)). Everything below reads zero by`);
  console.log(`construction - this is the A/B control arm, so compare metrics 1-13 against a live run.\n`);
}
console.log(`DECIDES THE WINNER: ${pct(flavourDecidedCount, flavourGames.length)} of games - the table finishes differently without this lane`);
console.log(`  <-- THE headline. Benchmark is the Tasting Menu at 5 VP: 12.1 / 22.5 / 26.5% at 2/3/4p.`);
console.log(`      This module should sit CONSISTENTLY BELOW it (12.9 / 17.9 / 20.4% unsteered at 1+3).`);
console.log(`      The "does nothing" floor for scale is the crumb tray at 0.8 / 0.9 / 0.6%.`);
console.log(`Dose:              ${meanOf(flavourVpPer).toFixed(2)} VP/player from the whole module (both clauses)`);
console.log(`  <-- unsteered baseline 5.18 / 4.59 / 4.32 at 2/3/4p. A steered bot should read above it.`);
console.log(`Flavour tiles per player at game end: mean=${meanOf(flavourTilesPer).toFixed(2)}, min=${minOf(flavourTilesPer)}, max=${maxOf(flavourTilesPer)}`);
console.log(`  <-- unsteered baseline 3.53 / 3.45 / 3.42. BOARD ONLY - the stand and crumb tray do not`);
console.log(`      count, which is the rule the whole module rests on.`);
console.log(`  distribution:    ${Object.keys(flavourDist).sort((a, b) => a - b).map(k => `${k}:${flavourDist[k]}`).join('  ')}`);
console.log(`THE MAJORITY:      tie rate ${pct(flavourTies, flavourGames.length)} of games (unsteered 11.3 / 13.8 / 18.0%)`);
console.log(`  <-- FRIENDLY TIES ARE THE RULE: everyone tied at the top takes the full ${FLAVOUR_MAJORITY_VP} VP and there is`);
console.log(`      deliberately no tiebreak. At one game in five a tiebreaker would be a real burden at`);
console.log(`      gateway weight, which is why this figure is reported rather than designed away.`);
console.log(`  taken by finishing rank: ${flavourRankCounts.map((n, i) => `${i === 0 ? 'winner' : `#${i + 1}`}=${pct(n, flavourLeaderTotal)}`).join(', ')}`);
console.log(`  <-- if this is nearly all winner, the bonus is paying whoever was ahead anyway. Read it`);
console.log(`      beside the winner-minus-last gap in metric 10, which must not worsen by more than 3.`);
console.log(`Lead margin (top minus second): mean=${flavourMargins.length ? meanOf(flavourMargins).toFixed(2) : 'n/a'} tiles, max=${maxOf(flavourMargins)}`);
console.log(`  <-- unsteered 2.69 / 2.29 / 2.06. The ${FLAVOUR_MAJORITY_VP} VP bonus was dosed against a ~2 tile lead, so a`);
console.log(`      margin that drifts up means the bonus is rewarding a race that was already over.`);
console.log(`Flavour revealed:  ${JSON.stringify(flavourDeal)} (should be even over a long run)`);
console.log(`  (Zero games ended without a Flavour unless the module is off - it is drawn at setup and`);
console.log(`   NEVER changes: not on a pot of tea, not on a claim, not ever. That is the whole design.)`);
console.log(`SEE ALSO metric 13's LAST line - the colour/ingredient declaration split. Baseline is 43.8 /`);
console.log(`  43.4 / 44.4% colour with no ingredient module. A drop of more than a few points condemns`);
console.log(`  the PER-TILE clause (run majority-only at 5 VP instead), not the bonus.`);

console.log(`\nCompleted ${gamesPerConfig} games in ${elapsed}ms (${(elapsed / gamesPerConfig).toFixed(1)}ms/game)`);
