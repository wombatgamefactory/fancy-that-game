import { getValidSweeps, getPatternMatches, getPatternWindows, getValidPlacements, ROW_VALUES, BOARD_SIZE } from '../engine/game.js';

// Approximate value of a completed claim beyond the card's printed VP: the
// sacrificed tile is banked on the stand or crumb tray (~2 VP on average).
const CLAIM_EXTRA = 2;

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

// Marginal value of adding one more tile to a row that currently holds `len`
// tiles: ROW_VALUES is the shared cumulative prefix, so the gain is
// ROW_VALUES[len] - ROW_VALUES[len-1] (opening a row is worth ROW_VALUES[0]).
function rowMarginalValue(len) {
  return ROW_VALUES[len] - (len > 0 ? ROW_VALUES[len - 1] : 0);
}

function countBoardIngredient(board, ingredient) {
  let count = 0;
  for (const cell of board) {
    if (cell && cell.ingredient === ingredient) count++;
  }
  return count;
}

// Baseline destination policy for a tile removed while claiming a card.
// Concentration only pays the marginal +3/+3/+4/+5 of a single row, so this
// favours extending an existing locked row, then opens rows sized to how much
// supply of that ingredient is still on the board (the source of future
// sacrifices), and crumbs when committing a big row would be a blind gamble.
//
// ONE-ROW-PER-INGREDIENT RULE: an ingredient may only ever occupy one stand
// row. Extending that row (step a) is the ONLY way to plate an already-locked
// ingredient; once its row is full the tile must go to the crumb tray.
export function decideDestination(player, tile) {
  const stand = player.stand;

  // a. A locked row already matching this ingredient with spare capacity:
  //    extend the one closest to completion (highest marginal value). This is
  //    now the only legal way to plate an already-plated ingredient.
  let bestRow = -1;
  let bestMarginal = -Infinity;
  for (let i = 0; i < stand.length; i++) {
    const row = stand[i];
    if (row.ingredient === tile.ingredient && row.tiles.length < row.capacity) {
      const marginal = rowMarginalValue(row.tiles.length);
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

    if (boardCount >= 2) {
      // Confident supply: lock the LARGEST empty row.
      let pick = emptyRows[0];
      for (const i of emptyRows) {
        if (stand[i].capacity > stand[pick].capacity) pick = i;
      }
      return { type: 'row', rowIndex: pick };
    }

    // Thin supply (0-1 on board): cheap experiment on the SMALLEST empty row,
    // unless only large rows (capacity >= 3) remain and we have no supply at
    // all — then take the guaranteed crumb point instead of a blind lock.
    const hasSmallRow = emptyRows.some(i => stand[i].capacity < 3);
    if (!hasSmallRow && boardCount === 0) return { type: 'crumb' };

    let pick = emptyRows[0];
    for (const i of emptyRows) {
      if (stand[i].capacity < stand[pick].capacity) pick = i;
    }
    return { type: 'row', rowIndex: pick };
  }

  // c. No room anywhere: crumb.
  return { type: 'crumb' };
}

// All valid sweeps ranked best-first by the window-aware heuristic. Exported
// so the MCTS bot can prune its search to the most promising candidates.
export function rankSweeps(gameState) {
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
  return scored.map(s => s.sweep);
}

export function decideSweep(gameState) {
  const ranked = rankSweeps(gameState);
  return ranked.length > 0 ? ranked[0] : null;
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

  let bestNowVp = 0;
  const matchedNow = new Set();
  for (const card of gameState.cardMarket) {
    if (getPatternMatches(player.board, card.pattern).length > 0) {
      matchedNow.add(card.id);
      bestNowVp = Math.max(bestNowVp, card.vp || 0);
    }
  }

  // Cells inside near-complete windows: avoid pulling a tile out of a pattern
  // we are one tile away from finishing.
  const protectedCells = new Set();
  const windowsByCard = new Map();
  for (const card of gameState.cardMarket) {
    const windows = getPatternWindows(player.board, card.pattern);
    windowsByCard.set(card.id, windows);
    for (const win of windows) {
      if (win.missing.length <= 1) for (const c of win.cells) protectedCells.add(c);
    }
  }

  let best = null;
  for (const card of gameState.cardMarket) {
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

  // Find all claimable cards.
  const claimableCards = [];
  for (const card of gameState.cardMarket) {
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
  const destination = decideDestination(currentPlayer, removedTile);

  return { cardId: card.id, removedBoardIndex: bestRemoveIndex, destination };
}
