import { getValidSweeps, getPatternMatches, getPatternWindows, getValidPlacements, getTotalCardsClaimed, getVisibleCupcakeSymbols, STAND_ROW_VALUES, CUPCAKE_PLATES, BOARD_SIZE } from '../engine/game.js';

// Approximate value of a completed claim beyond the card's printed VP: the
// sacrificed tile is banked on the stand or crumb tray. A conservative floor —
// a crumb is 1 VP, a shallow plate 2-3 — kept low so the sweep/placement demand
// weighting below stays a relative ranking, not an absolute score. (Realized
// plate marginals under the escalating table average higher, ~4-5, but bumping
// this would need the pruning cutoffs re-tuned in lockstep,
// so it is deliberately left as a stable floor.)
const CLAIM_EXTRA = 2;

// Value of gaining a cupcake by plating onto a cupcake plate. There is no cap,
// so this gain always pays. A cupcake is worth at least 1 VP if simply kept, and
// more in practice: it fuels a tile/tart move or a mid-claim re-ice. +1.5 credits
// that upside without letting the bonus dominate a whole row's marginal value.
const CUPCAKE_PLATE_BONUS = 1.5;

// Does plating onto (rowIndex, plateIndex) land on one of the stand's cupcake
// plates? Mirrors the engine's isCupcakePlate (not exported) off the shared
// CUPCAKE_PLATES table so the destination heuristic can price the cupcake.
function isCupcakePlate(rowIndex, plateIndex) {
  return CUPCAKE_PLATES.some(p => p.rowIndex === rowIndex && p.plateIndex === plateIndex);
}

// ── Tea-round tuning constants ─────────────────────────────────────────────
// The three tea-TIMING knobs that used to live here (TEA_STRONG_POT,
// TEA_MODEST_POT, TEA_WEAK_SWEEP_MAX) were deleted on 1 August with
// decideOrderTea - see the note further down. They tuned a voluntary
// start-of-turn flush, and there is no longer any such action to tune. Only the
// reserve-round knobs below survive, because the reserve round itself does.
//
// RESERVE_MAX_MISSING: a market card whose best window on THIS player's board is
//   missing more than this many tiles is hopeless — never reserved.
const RESERVE_MAX_MISSING = 4;
// ───────────────────────────────────────────────────────────────────────────

// Per-colour demand derived from viable pattern windows on this player's
// board: how much claim progress one more tile of each colour buys. Windows
// close to completion dominate (quadratic progress).
function buildColourDemand(board, cardMarket) {
  const demand = {};
  for (const card of cardMarket) {
    const weight = (card.vp || 0) + CLAIM_EXTRA;
    for (const win of getPatternWindows(board, card.pattern)) {
      if (win.missing.length === 0) continue;
      const progress = (win.matched + 1) / win.need;
      const value = (weight * progress * progress) / win.missing.length;
      for (const miss of win.missing) {
        demand[miss.colour] = (demand[miss.colour] || 0) + value;
      }
    }
  }
  return demand;
}

// Per-cell demand map: boardIndex -> Map(colour -> gain), where gain is the
// claim progress bought by placing that colour on that cell across all viable
// windows. Filling a window's final cell earns a completion bonus.
function buildPlacementDemand(board, cardMarket) {
  const demand = new Map();
  for (const card of cardMarket) {
    const weight = (card.vp || 0) + CLAIM_EXTRA;
    for (const win of getPatternWindows(board, card.pattern)) {
      if (win.missing.length === 0) continue;
      const before = win.matched / win.need;
      const after = (win.matched + 1) / win.need;
      let gain = weight * (after * after - before * before);
      if (win.missing.length === 1) gain += weight * 2; // completes the pattern
      for (const miss of win.missing) {
        let colourMap = demand.get(miss.index);
        if (!colourMap) {
          colourMap = new Map();
          demand.set(miss.index, colourMap);
        }
        colourMap.set(miss.colour, (colourMap.get(miss.colour) || 0) + gain);
      }
    }
  }
  return demand;
}

function emptyNeighbourCount(board, pos) {
  const row = Math.floor(pos / BOARD_SIZE);
  const col = pos % BOARD_SIZE;
  let count = 0;
  if (row > 0 && board[pos - BOARD_SIZE] === null) count++;
  if (row < BOARD_SIZE - 1 && board[pos + BOARD_SIZE] === null) count++;
  if (col > 0 && board[pos - 1] === null) count++;
  if (col < BOARD_SIZE - 1 && board[pos + 1] === null) count++;
  return count;
}

function getSweptTiles(market, sweep, marketSize) {
  const tiles = [];
  if (sweep.isRow) {
    const startIdx = sweep.rowOrCol * marketSize;
    const endIdx = startIdx + marketSize;
    for (let i = startIdx; i < endIdx; i++) {
      const tile = market[i];
      if (tile) {
        const matches = sweep.declarationType === 'colour'
          ? tile.colour === sweep.declaration
          : tile.ingredient === sweep.declaration;
        if (matches) {
          tiles.push(tile);
        }
      }
    }
  } else {
    // Column
    for (let r = 0; r < marketSize; r++) {
      const i = r * marketSize + sweep.rowOrCol;
      const tile = market[i];
      if (tile) {
        const matches = sweep.declarationType === 'colour'
          ? tile.colour === sweep.declaration
          : tile.ingredient === sweep.declaration;
        if (matches) {
          tiles.push(tile);
        }
      }
    }
  }
  return tiles;
}

// Marginal value of adding one more tile to stand row `rowIndex` that currently
// holds `len` tiles: each row has its own cumulative table, so the gain is
// STAND_ROW_VALUES[rowIndex][len] - STAND_ROW_VALUES[rowIndex][len-1] (opening a
// row is worth STAND_ROW_VALUES[rowIndex][0], e.g. bottom 1, top 5).
function rowMarginalValue(rowIndex, len) {
  const values = STAND_ROW_VALUES[rowIndex];
  return values[len] - (len > 0 ? values[len - 1] : 0);
}

function countBoardIngredient(board, ingredient) {
  let count = 0;
  for (const cell of board) {
    if (cell && cell.ingredient === ingredient) count++;
  }
  return count;
}

// Baseline destination policy for a tile removed while claiming a card.
// Concentration pays a row's per-tile marginal (the bottom row escalates
// 1/3/8/10, short rows enter higher but cap out), so this favours extending an
// existing locked row, then opens rows sized to how much
// supply of that ingredient is still on the board (the source of future
// sacrifices), and crumbs when committing a big row would be a blind gamble.
//
// ONE-ROW-PER-INGREDIENT RULE: an ingredient may only ever occupy one stand
// row. Extending that row (step a) is the ONLY way to plate an already-locked
// ingredient; once its row is full the tile must go to the crumb tray.
//
// `gameState` is optional: when supplied it lets the empty-row choice (step b)
// read how many claims remain, discounting the deep bottom row late in the game
// when it can no longer be filled.
export function decideDestination(player, tile, gameState = null) {
  const stand = player.stand;

  // a. A locked row already matching this ingredient with spare capacity:
  //    extend the one closest to completion (highest marginal value). This is
  //    now the only legal way to plate an already-plated ingredient.
  let bestRow = -1;
  let bestMarginal = -Infinity;
  for (let i = 0; i < stand.length; i++) {
    const row = stand[i];
    if (row.ingredient === tile.ingredient && row.tiles.length < row.capacity) {
      const marginal = rowMarginalValue(i, row.tiles.length);
      if (marginal > bestMarginal) {
        bestMarginal = marginal;
        bestRow = i;
      }
    }
  }
  if (bestRow !== -1) return { type: 'row', rowIndex: bestRow };

  // If this ingredient is already locked to a row (necessarily a FULL one, or
  // step a would have extended it), opening a second row is illegal — crumb.
  if (stand.some(row => row.ingredient === tile.ingredient)) {
    return { type: 'crumb' };
  }

  // b. Ingredient never plated: consider opening an empty row with supply
  //    confidence based on how many tiles of this ingredient are on the board.
  const emptyRows = [];
  for (let i = 0; i < stand.length; i++) {
    if (stand[i].ingredient === null && stand[i].tiles.length === 0) emptyRows.push(i);
  }

  if (emptyRows.length > 0) {
    const boardCount = countBoardIngredient(player.board, tile.ingredient);

    // How many more tiles of this ingredient we can plausibly plate into a
    // freshly-opened row after the tile in hand. boardCount still includes the
    // tile being plated (the board isn't mutated until after this call), so the
    // remaining same-ingredient supply is boardCount - 1. It is further bounded
    // by how many claims this player has left before the game ends: late-game,
    // even ample board supply can't be converted, so the deep bottom row (which
    // only pays off deep: 2/6/14/26) stops being worth opening and short high-
    // entry rows (top 5, third 4) win — the redesign's "focus beats spread" intent.
    let futureSacrifices = Math.max(0, boardCount - 1);
    if (gameState) {
      const claimed = getTotalCardsClaimed(gameState);
      const myRemainingClaims = Math.ceil(
        Math.max(0, gameState.cardsNeededToEnd - claimed) / gameState.playerCount
      );
      futureSacrifices = Math.min(futureSacrifices, myRemainingClaims);
    }

    // Score each empty row by the cumulative value it can realistically reach
    // (rows print cumulative totals, scored at the last filled plate), plus a
    // bonus for any cupcake plate passed on the way (always paid now — no cap).
    // This is value-sensitive where the old flat table left it near-neutral: with
    // little support a short row's high entry (top 5) beats a deep row opened
    // shallow (bottom 2); with real support the bottom row's escalating tail wins.
    let bestPick = -1;
    let bestValue = -Infinity;
    for (const i of emptyRows) {
      const cap = stand[i].capacity;
      const depth = Math.min(cap, 1 + futureSacrifices); // plates we can reach
      let value = STAND_ROW_VALUES[i][depth - 1];
      for (let d = 0; d < depth; d++) {
        if (isCupcakePlate(i, d)) value += CUPCAKE_PLATE_BONUS;
      }
      if (value > bestValue) {
        bestValue = value;
        bestPick = i;
      }
    }

    // Opening a row banks at least its entry value (>= 2), which clears the
    // guaranteed 1-VP crumb; the check keeps the crumb fallback meaningful if
    // the value table is ever retuned downward.
    if (bestValue > 1) return { type: 'row', rowIndex: bestPick };
  }

  // c. No room anywhere: crumb.
  return { type: 'crumb' };
}

// All valid sweeps scored best-first by the window-aware heuristic, returning
// { sweep, score } pairs. Shared by rankSweeps (which drops the scores) and by
// the sweep choice itself (decideSweep takes the top-ranked entry).
function scoreSweeps(gameState) {
  const validSweeps = getValidSweeps(gameState);
  if (validSweeps.length === 0) return [];

  const currentPlayer = gameState.players[gameState.currentPlayerIndex];
  const marketSize = Math.sqrt(gameState.market.length);

  // Colour demand from viable pattern windows on OUR board: a colour is worth
  // the claim progress one more tile of it buys (near-complete windows
  // dominate), not just its raw frequency across market cards.
  const colourValue = buildColourDemand(currentPlayer.board, gameState.cardMarket);

  // Ingredient demand: the ingredients of locked, unfilled stand rows — those
  // rows can only ever be extended by that ingredient (stand trajectory).
  const wantedIngredients = new Set();
  for (const row of currentPlayer.stand) {
    if (row.ingredient !== null && row.tiles.length < row.capacity) {
      wantedIngredients.add(row.ingredient);
    }
  }

  const scored = validSweeps.map(sweep => {
    let score = 0;

    const sweptTiles = getSweptTiles(gameState.market, sweep, marketSize);

    // Diminishing returns per colour within one sweep: a window missing one
    // pink needs ONE pink, so the second copy of a colour is worth less.
    const colourSeen = {};
    for (const tile of sweptTiles) {
      const copies = colourSeen[tile.colour] = (colourSeen[tile.colour] || 0) + 1;
      const decay = copies === 1 ? 1 : 0.4;
      score += (colourValue[tile.colour] || 0) * decay;
      // Tiles whose ingredient feeds a locked row keep future sacrifices useful.
      if (wantedIngredients.has(tile.ingredient)) score += 1;
    }

    // Mild bonus for more tiles = more options.
    score += sweptTiles.length * 0.1;

    return { sweep, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored;
}

// All valid sweeps ranked best-first by the window-aware heuristic. Exported
// so the MCTS bot can prune its search to the most promising candidates.
export function rankSweeps(gameState) {
  return scoreSweeps(gameState).map(s => s.sweep);
}

export function decideSweep(gameState) {
  const ranked = rankSweeps(gameState);
  return ranked.length > 0 ? ranked[0] : null;
}

// Fewest tiles missing across every viable window of `card` on `board`, or
// Infinity when the card has no viable window at all (every placement collides
// with a wrong-coloured tile or tart). A complete pattern reports 0.
function minMissingForCard(board, card) {
  let best = Infinity;
  for (const win of getPatternWindows(board, card.pattern)) {
    if (win.missing.length < best) best = win.missing.length;
  }
  return best;
}

// Would a refresh right now actually RESTOCK the tile market, i.e. does the bag
// (plus the tiles the flush returns to it) hold enough to fill every cell?
//
// This began life as a workaround for a rules hole: once the bag was short, the
// redeal left cells empty - including teapot-symbol cells - so the gate stayed
// armed and a bot that only checked legality would order tea again, on the same
// turn, for another pot, forever (~200 refreshes, games that never ended). That
// hole is CLOSED in the rules now: a refresh requires a non-empty bag, and the
// game ends on an empty bag ('bagEmpty'), so nothing here is load-bearing for
// termination any more.
// It stays purely as PLAY JUDGEMENT, and it is deliberately stricter than the
// rule: a flush that cannot refill the whole board is mostly just a reshuffle,
// and it hands the game its ending. A bot willing to spend the last of the bag
// for one more pot would be a legal (and sometimes better) strategy - that is a
// bot-tuning question, not a rules one.
export function refreshWouldRestockBoard(gameState) {
  let onBoard = 0;
  for (const tile of gameState.market) if (tile) onBoard++;
  return gameState.bag.length + onBoard >= gameState.market.length;
}

// decideOrderTea DELETED 1 AUGUST, along with its TEA_STRONG_POT /
// TEA_MODEST_POT / TEA_WEAK_SWEEP_MAX thresholds. This bot is kept as the
// historical baseline for arena comparisons, and its old policy was "a strong pot
// fires on its own; a modest pot fires only if the market in front of us is also
// poor". None of that survives the rule change: tea is no longer ordered by a
// player at the start of a turn, it fires from the engine at the end of one.
//
// This bot has no symbol steering of its own (it predates it), so with the
// decision gone it simply never thinks about tea at all - which is exactly what a
// baseline should be for measuring whether basicBot's symbolTriggerValue earns
// its keep.

// Which market card players[reserverIndex] should reserve during a tea round
// (returns a cardId), or null to pass. Scores every market card by
// vp / (1 + minMissingTiles) on THAT player's board (near-complete, high-vp
// cards win); passes if every card is hopeless (best window missing >
// RESERVE_MAX_MISSING, or no viable window at all). The reserve itself is
// uncapped since 1 Aug, so a held card never blocks a take.
export function decideTeaReserve(gameState, reserverIndex) {
  const player = gameState.players[reserverIndex];

  let bestId = null;
  let bestScore = -Infinity;
  for (const card of gameState.cardMarket) {
    const mm = minMissingForCard(player.board, card);
    if (mm === Infinity || mm > RESERVE_MAX_MISSING) continue; // hopeless
    const score = (card.vp || 0) / (1 + mm);
    if (score > bestScore) {
      bestScore = score;
      bestId = card.id;
    }
  }
  return bestId;
}

// Market indices ranked best-first as bonus-tile picks. Exported so the MCTS
// bot can prune its search to the most promising candidates.
export function rankBonusTiles(gameState) {
  const availableTiles = gameState.market
    .map((t, i) => ({ tile: t, index: i }))
    .filter(({ tile }) => tile !== null);

  if (availableTiles.length === 0) return [];

  const currentPlayer = gameState.players[gameState.currentPlayerIndex];

  // Value each market tile by the claim progress its colour buys on OUR board
  // (window-aware), not by raw colour frequency across the card market.
  const colourValue = buildColourDemand(currentPlayer.board, gameState.cardMarket);

  const scored = availableTiles.map(({ tile, index }) => {
    let score = colourValue[tile.colour] || 0;

    // Prefer tiles matching ingredients we're already picking up this turn.
    const ingredientCount = gameState.pendingSweepTiles.filter(
      t => t.ingredient === tile.ingredient
    ).length;
    score += ingredientCount * 0.5;

    return { index, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.map(s => s.index);
}

export function decideBonusTile(gameState) {
  const ranked = rankBonusTiles(gameState);
  return ranked.length > 0 ? ranked[0] : null;
}

// NOTE: place() pairs placements[i] with pendingSweepTiles[i] BY INDEX, so
// the returned array must be aligned to the original tile order.
export function decidePlacements(gameState) {
  const currentPlayer = gameState.players[gameState.currentPlayerIndex];
  const tilesToPlace = gameState.pendingSweepTiles;
  const board = [...currentPlayer.board]; // scratch copy, updated as we commit

  if (getValidPlacements(board).length < tilesToPlace.length) {
    throw new Error('Not enough valid positions to place tiles');
  }

  const placements = new Array(tilesToPlace.length).fill(-1);
  const remaining = tilesToPlace.map((tile, index) => ({ tile, index }));

  // Commit one (tile, position) pair at a time, always the globally best one,
  // recomputing window demand after each commit so a tile that opens up a
  // near-complete window is immediately followed up on.
  while (remaining.length > 0) {
    const demand = buildPlacementDemand(board, gameState.cardMarket);
    const positions = getValidPlacements(board);

    let bestEntry = remaining[0];
    let bestPos = positions[0];
    let bestScore = -Infinity;

    for (const entry of remaining) {
      for (const pos of positions) {
        const colourMap = demand.get(pos);
        const gain = colourMap ? colourMap.get(entry.tile.colour) || 0 : 0;

        // Occupying a cell that windows want for a DIFFERENT colour kills
        // those windows — charge most of the best forgone gain.
        let forgone = 0;
        if (colourMap) {
          for (const [colour, value] of colourMap) {
            if (colour !== entry.tile.colour && value > forgone) forgone = value;
          }
        }

        let score = gain - forgone * 0.9;

        if (gain === 0) {
          // Dead tile: tuck it against existing tiles/edges so contiguous
          // open space (future pattern room) is preserved.
          score -= emptyNeighbourCount(board, pos) * 0.05;
        }

        score += Math.random() * 0.001; // tie-break

        if (score > bestScore) {
          bestScore = score;
          bestEntry = entry;
          bestPos = pos;
        }
      }
    }

    board[bestPos] = bestEntry.tile;
    placements[bestEntry.index] = bestPos;
    remaining.splice(remaining.indexOf(bestEntry), 1);
  }

  return placements;
}

// Cupcake move: spend 1 cupcake (1 VP) to relocate a board tile when that
// single move completes a market card we could not otherwise claim this turn.
// Only fires when the unlocked card strictly beats the best already-claimable
// card (max one claim per turn). Returns { fromIndex, toIndex } or null.
export function decideMove(gameState) {
  const player = gameState.players[gameState.currentPlayerIndex];
  if (gameState.cupcakesUsedThisTurn || player.cupcakes <= 0) return null;

  // Claimable candidates are the market cards PLUS this player's reserved cards
  // (which complete as normal claims). A cupcake move that finishes any of them
  // is fair game.
  const candidateCards = [...gameState.cardMarket, ...player.reservedCards];

  let bestNowVp = 0;
  const matchedNow = new Set();
  for (const card of candidateCards) {
    if (getPatternMatches(player.board, card.pattern).length > 0) {
      matchedNow.add(card.id);
      bestNowVp = Math.max(bestNowVp, card.vp || 0);
    }
  }

  // Cells inside near-complete windows: avoid pulling a tile out of a pattern
  // we are one tile away from finishing.
  const protectedCells = new Set();
  const windowsByCard = new Map();
  for (const card of candidateCards) {
    const windows = getPatternWindows(player.board, card.pattern);
    windowsByCard.set(card.id, windows);
    for (const win of windows) {
      if (win.missing.length <= 1) for (const c of win.cells) protectedCells.add(c);
    }
  }

  let best = null;
  for (const card of candidateCards) {
    if (matchedNow.has(card.id)) continue;
    const vp = card.vp || 0;
    // Card vp + banked sacrifice tile (~CLAIM_EXTRA) must beat the spent
    // cupcake (1 VP) AND the best claim already available without moving.
    if (vp + CLAIM_EXTRA - 1 <= bestNowVp) continue;

    for (const win of windowsByCard.get(card.id)) {
      if (win.missing.length !== 1) continue;
      const { index: toIndex, colour } = win.missing[0];

      // Source: a same-colour tile outside this window, ideally one that is
      // not itself part of another near-complete window.
      let source = -1;
      let sourceProtected = true;
      for (let i = 0; i < player.board.length; i++) {
        const cell = player.board[i];
        if (!cell || cell.colour !== colour) continue; // skips tarts (no colour)
        if (win.cells.includes(i)) continue;
        const isProtected = protectedCells.has(i);
        if (source === -1 || (sourceProtected && !isProtected)) {
          source = i;
          sourceProtected = isProtected;
        }
      }
      if (source === -1) continue;

      // Safety: verify the move really completes the card.
      const trial = [...player.board];
      trial[toIndex] = trial[source];
      trial[source] = null;
      if (getPatternMatches(trial, card.pattern).length === 0) continue;

      if (!best || vp > best.vp || (vp === best.vp && best.sourceProtected && !sourceProtected)) {
        best = { fromIndex: source, toIndex, vp, sourceProtected };
      }
    }
  }

  return best ? { fromIndex: best.fromIndex, toIndex: best.toIndex } : null;
}

export function decideClaim(gameState) {
  const currentPlayer = gameState.players[gameState.currentPlayerIndex];

  // Candidates are the market cards PLUS this player's reserved cards, which
  // complete as normal claims (claim() resolves a reserved id transparently).
  const candidateCards = [...gameState.cardMarket, ...currentPlayer.reservedCards];

  // Find all claimable cards.
  const claimableCards = [];
  for (const card of candidateCards) {
    const matches = getPatternMatches(currentPlayer.board, card.pattern);
    if (matches.length > 0) {
      claimableCards.push({ card, matches });
    }
  }

  if (claimableCards.length === 0) {
    return null; // Skip claim
  }

  // Rank by vp descending; tie-break preferring the smaller pattern (fewer
  // tiles consumed — a big block ties up scarce board space).
  claimableCards.sort((a, b) => {
    const vpDiff = (b.card.vp || 0) - (a.card.vp || 0);
    if (vpDiff !== 0) return vpDiff;
    const tilesA = a.card.pattern.filter(c => c).length;
    const tilesB = b.card.pattern.filter(c => c).length;
    return tilesA - tilesB;
  });

  const { card, matches } = claimableCards[0];
  const match = matches[0];
  const patternCells = match.cells;

  // Colours still wanted by any market card.
  const coloursNeeded = new Set();
  for (const c of gameState.cardMarket) {
    for (const colour of c.pattern) {
      if (colour) coloursNeeded.add(colour);
    }
  }

  // Ingredients of locked, unfilled stand rows — a removed tile of one of
  // these extends an existing row (better than opening a new one).
  const lockedUnfilled = new Set();
  for (const row of currentPlayer.stand) {
    if (row.ingredient !== null && row.tiles.length < row.capacity) {
      lockedUnfilled.add(row.ingredient);
    }
  }

  let bestRemoveIndex = patternCells[0];
  let bestRemoveScore = -Infinity;

  for (const cellIndex of patternCells) {
    const tile = currentPlayer.board[cellIndex];
    if (!tile) continue;

    let score = 0;

    // Prefer removing a tile that extends a locked stand row.
    if (lockedUnfilled.has(tile.ingredient)) score += 5;

    // Avoid breaking a colour still needed if this is the only tile of it.
    if (coloursNeeded.has(tile.colour)) {
      const otherTilesOfColour = currentPlayer.board.filter(
        (t, i) => i !== cellIndex && t && t.colour === tile.colour
      );
      if (otherTilesOfColour.length === 0) {
        score -= 10;
      }
    }

    if (score > bestRemoveScore) {
      bestRemoveScore = score;
      bestRemoveIndex = cellIndex;
    }
  }

  const removedTile = currentPlayer.board[bestRemoveIndex];
  const destination = decideDestination(currentPlayer, removedTile, gameState);

  return { cardId: card.id, removedBoardIndex: bestRemoveIndex, destination };
}
