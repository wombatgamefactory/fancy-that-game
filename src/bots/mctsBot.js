import { getValidSweeps, getValidPlacements, sweep, takeBonusTile, place, claim, skipClaim, skipMove, refill, calculateFinalScores, INGREDIENTS, REWARD_CARDS, BOARD_SIZE, getPatternMatches } from '../engine/game.js';
import { decideBonusTile as greedyBonusTile, decidePlacements as greedyPlacements, decideClaim as greedyClaim } from './basicBot.js';

const ITERATIONS_MAP = {
  'basic': 0,
  'mcts-1': 60,
  'mcts-2': 200,
  'mcts-3': 600,
  'mcts-4': 1200,
};

const CHUNK_SIZE = 20;

function cloneState(state) {
  return {
    ...state,
    players: state.players.map(p => ({
      ...p,
      board: [...p.board],
      scoringPile: [...p.scoringPile],
      claimedCards: [...p.claimedCards],
    })),
    market: [...state.market],
    bag: [...state.bag],
    gameDeck: [...state.gameDeck],
    cardMarket: [...state.cardMarket],
    pendingSweepTiles: [...state.pendingSweepTiles],
    stats: { ...state.stats },
  };
}

class MCTSNode {
  constructor(state, action, parent) {
    this.state = state;
    this.action = action;
    this.parent = parent;
    this.children = [];
    this.unexplored = null;
    this.visits = 0;
    this.value = 0;
  }

  getUnexploredActions() {
    if (this.unexplored === null) {
      const actions = getActionsForPhase(this.state);
      this.unexplored = actions ? [...actions] : [];
    }
    return this.unexplored;
  }
}

function ucb1(node, parentVisits) {
  if (node.visits === 0) return Infinity;
  const exploitation = node.value / node.visits;
  const exploration = Math.sqrt(2) * Math.sqrt(Math.log(parentVisits) / node.visits);
  return exploitation + exploration;
}

function select(node) {
  while (node.getUnexploredActions().length === 0 && node.children.length > 0) {
    let bestChild = node.children[0];
    let bestScore = ucb1(bestChild, node.visits);
    for (let i = 1; i < node.children.length; i++) {
      const score = ucb1(node.children[i], node.visits);
      if (score > bestScore) {
        bestScore = score;
        bestChild = node.children[i];
      }
    }
    node = bestChild;
  }
  return node;
}

function ingredientPlacements(state) {
  const currentPlayer = state.players[state.currentPlayerIndex];
  const validPositions = getValidPlacements(currentPlayer.board);
  const tilesToPlace = state.pendingSweepTiles;

  if (validPositions.length < tilesToPlace.length) {
    return [];
  }

  // Find ingredient with highest claimed symbols
  let bestIngredient = null;
  let bestSymbols = -1;
  for (const ingredient of INGREDIENTS) {
    let symbols = 0;
    for (const cardId of currentPlayer.claimedCards) {
      const card = REWARD_CARDS.find(c => c.id === cardId);
      if (card && card.ingredient === ingredient) {
        symbols += card.symbolCount;
      }
    }
    if (symbols > bestSymbols) {
      bestSymbols = symbols;
      bestIngredient = ingredient;
    }
  }

  // Sort tiles so best ingredient tiles go first
  const sortedTiles = [...tilesToPlace].sort((a, b) => {
    const aIsBest = a.ingredient === bestIngredient ? 1 : 0;
    const bIsBest = b.ingredient === bestIngredient ? 1 : 0;
    return bIsBest - aIsBest;
  });

  const placements = [];
  const usedPositions = new Set();

  for (const tile of sortedTiles) {
    let bestPos = null;
    let bestScore = -Infinity;

    // Prefer positions adjacent to same-ingredient tiles
    for (const pos of validPositions) {
      if (usedPositions.has(pos)) continue;

      let score = 0;

      // Check for adjacent same-ingredient tiles
      const row = Math.floor(pos / BOARD_SIZE);
      const col = pos % BOARD_SIZE;
      const adjacent = [
        (row - 1) * BOARD_SIZE + col,
        (row + 1) * BOARD_SIZE + col,
        row * BOARD_SIZE + (col - 1),
        row * BOARD_SIZE + (col + 1),
      ];

      for (const adjPos of adjacent) {
        if (adjPos >= 0 && adjPos < BOARD_SIZE * BOARD_SIZE) {
          const adjTile = currentPlayer.board[adjPos];
          if (adjTile && adjTile.ingredient === tile.ingredient) {
            score += 10;
          }
        }
      }

      if (score === 0) {
        score = Math.random(); // Fallback to greedy
      }

      if (score > bestScore) {
        bestScore = score;
        bestPos = pos;
      }
    }

    if (bestPos === null) bestPos = validPositions[0];
    placements.push(bestPos);
    usedPositions.add(bestPos);
  }

  return placements;
}

function spreadPlacements(state) {
  const currentPlayer = state.players[state.currentPlayerIndex];
  const validPositions = getValidPlacements(currentPlayer.board);
  const tilesToPlace = state.pendingSweepTiles;

  if (validPositions.length < tilesToPlace.length) {
    return [];
  }

  const placements = [];
  const usedPositions = new Set();

  for (const tile of tilesToPlace) {
    let bestPos = null;
    let bestScore = -Infinity;

    // Score by count of empty orthogonal neighbours
    for (const pos of validPositions) {
      if (usedPositions.has(pos)) continue;

      const row = Math.floor(pos / BOARD_SIZE);
      const col = pos % BOARD_SIZE;
      const adjacent = [
        (row - 1) * BOARD_SIZE + col,
        (row + 1) * BOARD_SIZE + col,
        row * BOARD_SIZE + (col - 1),
        row * BOARD_SIZE + (col + 1),
      ];

      let emptyNeighbours = 0;
      for (const adjPos of adjacent) {
        if (adjPos >= 0 && adjPos < BOARD_SIZE * BOARD_SIZE) {
          if (!currentPlayer.board[adjPos]) {
            emptyNeighbours++;
          }
        }
      }

      if (emptyNeighbours > bestScore) {
        bestScore = emptyNeighbours;
        bestPos = pos;
      }
    }

    if (bestPos === null) bestPos = validPositions[0];
    placements.push(bestPos);
    usedPositions.add(bestPos);
  }

  return placements;
}

function getActionsForPhase(state) {
  const phase = state.gamePhase;
  if (phase === 'sweep') {
    if (state.bonusTileAvailable) {
      const tiles = state.market.map((t, i) => t ? i : null).filter(i => i !== null);
      return tiles.length > 0 ? tiles : [null];
    } else {
      return getValidSweeps(state);
    }
  } else if (phase === 'place') {
    // For placement, explore multiple strategies
    const positions = getValidPlacements(state.players[state.currentPlayerIndex].board);
    if (positions.length < state.pendingSweepTiles.length) {
      return [];
    }
    return ['greedy', 'ingredient', 'spread'];
  } else if (phase === 'move') {
    // For move phase, just skip (moving costs cupcakes and is rarely optimal)
    return [null];
  } else if (phase === 'claim') {
    const claimOptions = [];
    for (const card of state.cardMarket) {
      claimOptions.push({ cardId: card.id });
    }
    claimOptions.push(null); // Skip
    return claimOptions;
  }
  return [];
}

function applyAction(state, action) {
  const cloned = cloneState(state);
  const phase = cloned.gamePhase;

  try {
    if (phase === 'sweep') {
      if (cloned.bonusTileAvailable) {
        // Action is a market index for bonus tile
        if (action !== null && action !== undefined) {
          takeBonusTile(cloned, action);
        } else {
          cloned.bonusTileAvailable = false;
          cloned.gamePhase = 'place';
        }
      } else if (action && action.rowOrCol !== undefined) {
        // Action is a sweep move
        sweep(cloned, action.rowOrCol, action.isRow, action.declaration, action.declarationType);
      }
      return cloned;
    } else if (phase === 'place') {
      let placements;
      if (action === 'ingredient') {
        placements = ingredientPlacements(cloned);
      } else if (action === 'spread') {
        placements = spreadPlacements(cloned);
      } else {
        placements = greedyPlacements(cloned);
      }
      place(cloned, placements);
      return cloned;
    } else if (phase === 'move') {
      skipMove(cloned);
      return cloned;
    } else if (phase === 'claim') {
      if (action === null) {
        skipClaim(cloned);
      } else if (action && action.cardId) {
        const claimDec = greedyClaim(cloned);
        if (claimDec) {
          claim(cloned, claimDec.cardId, claimDec.removedBoardIndex);
        } else {
          skipClaim(cloned);
        }
      } else {
        skipClaim(cloned);
      }
      return cloned;
    } else if (phase === 'refill') {
      refill(cloned);
      return cloned;
    }
  } catch (e) {
    console.error('Error applying action in MCTS:', e);
    return cloned;
  }

  return cloned;
}

function getRowTilesFromMarket(market, row, size) {
  return market.slice(row * size, row * size + size);
}

function getColTilesFromMarket(market, col, size) {
  const out = [];
  for (let r = 0; r < size; r++) out.push(market[r * size + col]);
  return out;
}

function selectHeuristicSweep(state) {
  const validSweeps = getValidSweeps(state);
  if (validSweeps.length === 0) return null;

  const marketSize = Math.sqrt(state.market.length);

  // Build wanted colours set
  const wantedColours = new Set();
  for (const card of state.cardMarket) {
    for (const colour of card.pattern) {
      if (colour) wantedColours.add(colour);
    }
  }

  let bestSweep = validSweeps[0];
  let bestScore = -Infinity;
  const tiedSweeps = [];

  for (const sweep of validSweeps) {
    let score = 0;

    const tiles = sweep.isRow
      ? getRowTilesFromMarket(state.market, sweep.rowOrCol, marketSize)
      : getColTilesFromMarket(state.market, sweep.rowOrCol, marketSize);

    for (const tile of tiles) {
      if (!tile) continue;

      if (sweep.declarationType === 'colour') {
        // Count how many tiles match the declaration
        if (tile.colour === sweep.declaration && wantedColours.has(tile.colour)) {
          score += 1;
        }
      } else {
        // Ingredient sweeps always score +1 per tile
        if (tile.ingredient === sweep.declaration) {
          score += 1;
        }
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestSweep = sweep;
      tiedSweeps.length = 0;
      tiedSweeps.push(sweep);
    } else if (score === bestScore) {
      tiedSweeps.push(sweep);
    }
  }

  // Random tie-break
  if (tiedSweeps.length > 1) {
    return tiedSweeps[Math.floor(Math.random() * tiedSweeps.length)];
  }

  return bestSweep;
}

function evaluateState(state, playerIndex) {
  const player = state.players[playerIndex];
  const opponents = state.players.filter((_, i) => i !== playerIndex);

  // Player estimate
  let playerCommitted = 0;
  let playerBoardProgress = 0;
  let playerTrajectory = 0;

  // Committed score (from claimed cards + scoring pile)
  const playerIngredientSymbols = {};
  const playerIngredientInPile = {};
  for (const ingredient of INGREDIENTS) {
    playerIngredientSymbols[ingredient] = 0;
    playerIngredientInPile[ingredient] = 0;
  }

  for (const cardId of player.claimedCards) {
    const card = REWARD_CARDS.find(c => c.id === cardId);
    if (card) {
      playerIngredientSymbols[card.ingredient] += card.symbolCount;
    }
  }

  for (const tile of player.scoringPile) {
    if (tile && tile.ingredient) {
      playerIngredientInPile[tile.ingredient] = (playerIngredientInPile[tile.ingredient] || 0) + 1;
    }
  }

  for (const ingredient of INGREDIENTS) {
    playerCommitted += playerIngredientSymbols[ingredient] * playerIngredientInPile[ingredient];
  }
  playerCommitted += (player.cupcakes || 0);

  // Board progress
  for (const card of state.cardMarket) {
    const matches = getPatternMatches(player.board, card.pattern);
    if (matches.length > 0) {
      playerBoardProgress += card.symbolCount * 2;
    } else {
      // Fractional credit for partial patterns
      const matchingTiles = player.board.filter(t => t && card.pattern.includes(t.colour)).length;
      playerBoardProgress += (matchingTiles / BOARD_SIZE) * card.symbolCount * 0.5;
    }
  }

  // Ingredient trajectory
  for (const ingredient of INGREDIENTS) {
    const marketSymbols = REWARD_CARDS
      .filter(c => state.cardMarket.some(cm => cm && cm.id === c.id) && c.ingredient === ingredient)
      .reduce((sum, c) => sum + c.symbolCount, 0);
    playerTrajectory += (playerIngredientInPile[ingredient] || 0) * marketSymbols * 0.3;
  }

  const playerEstimate = playerCommitted + playerBoardProgress + playerTrajectory;

  // Best opponent estimate (committed score only for simplicity)
  let bestOpponentCommitted = 0;
  for (const opponent of opponents) {
    let committed = 0;
    const oppIngredientSymbols = {};
    const oppIngredientInPile = {};
    for (const ingredient of INGREDIENTS) {
      oppIngredientSymbols[ingredient] = 0;
      oppIngredientInPile[ingredient] = 0;
    }

    for (const cardId of opponent.claimedCards) {
      const card = REWARD_CARDS.find(c => c.id === cardId);
      if (card) {
        oppIngredientSymbols[card.ingredient] += card.symbolCount;
      }
    }

    for (const tile of opponent.scoringPile) {
      if (tile && tile.ingredient) {
        oppIngredientInPile[tile.ingredient] = (oppIngredientInPile[tile.ingredient] || 0) + 1;
      }
    }

    for (const ingredient of INGREDIENTS) {
      committed += oppIngredientSymbols[ingredient] * oppIngredientInPile[ingredient];
    }
    committed += (opponent.cupcakes || 0);

    bestOpponentCommitted = Math.max(bestOpponentCommitted, committed);
  }

  return playerEstimate - bestOpponentCommitted;
}

function rollout(state, playerIndex) {
  const cloned = cloneState(state);
  let iterations = 0;
  const maxIterations = 100;

  while (!cloned.gameOver && iterations < maxIterations) {
    iterations++;

    try {
      if (cloned.gamePhase === 'sweep') {
        if (cloned.bonusTileAvailable) {
          const tiles = cloned.market.map((t, i) => t ? i : null).filter(i => i !== null);
          if (tiles.length > 0 && Math.random() > 0.5) {
            takeBonusTile(cloned, tiles[Math.floor(Math.random() * tiles.length)]);
          } else {
            cloned.bonusTileAvailable = false;
            cloned.gamePhase = 'place';
          }
        } else {
          const validSweeps = getValidSweeps(cloned);
          if (validSweeps.length === 0) {
            cloned.gameOver = true;
            break;
          }
          const action = selectHeuristicSweep(cloned);
          sweep(cloned, action.rowOrCol, action.isRow, action.declaration, action.declarationType);
        }
      } else if (cloned.gamePhase === 'place') {
        const placements = greedyPlacements(cloned);
        place(cloned, placements);
      } else if (cloned.gamePhase === 'move') {
        skipMove(cloned);
      } else if (cloned.gamePhase === 'claim') {
        const claimDec = greedyClaim(cloned);
        if (claimDec) {
          claim(cloned, claimDec.cardId, claimDec.removedBoardIndex);
        } else {
          skipClaim(cloned);
        }
      } else if (cloned.gamePhase === 'refill') {
        refill(cloned);
      }
    } catch (e) {
      console.error('Error in rollout:', e);
      break;
    }
  }

  if (cloned.gameOver) {
    calculateFinalScores(cloned);
    const playerScore = cloned.players[playerIndex].score;
    const maxOpponentScore = Math.max(
      ...cloned.players
        .map((p, i) => i !== playerIndex ? p.score : -Infinity)
    );
    return playerScore - maxOpponentScore;
  } else {
    return evaluateState(cloned, playerIndex);
  }
}

function backpropagate(node, value) {
  while (node) {
    node.visits++;
    node.value += value;
    node = node.parent;
  }
}

function expand(node) {
  const unexploredActions = node.getUnexploredActions();
  if (unexploredActions.length === 0) {
    return node;
  }

  const action = unexploredActions.pop();
  const childState = applyAction(node.state, action);
  const child = new MCTSNode(childState, action, node);
  node.children.push(child);
  return child;
}

async function mctsSearch(state, playerIndex, totalIterations, progressCallback) {
  const root = new MCTSNode(cloneState(state), null, null);

  for (let i = 0; i < totalIterations; i += CHUNK_SIZE) {
    const end = Math.min(i + CHUNK_SIZE, totalIterations);

    for (let j = i; j < end; j++) {
      let leaf = select(root);

      // If leaf has unexplored actions, expand one
      if (leaf.getUnexploredActions().length > 0) {
        leaf = expand(leaf);
      }

      // Simulate from the leaf
      const outcome = rollout(leaf.state, playerIndex);

      // Backpropagate
      backpropagate(leaf, outcome);
    }

    // Report progress
    if (progressCallback) {
      const progress = Math.round((end / totalIterations) * 100);
      progressCallback(progress);
    }

    await new Promise(r => setTimeout(r, 0));
  }

  if (root.children.length === 0) {
    return null;
  }

  // Return action with most visits
  let bestChild = root.children[0];
  for (let i = 1; i < root.children.length; i++) {
    if (root.children[i].visits > bestChild.visits) {
      bestChild = root.children[i];
    }
  }

  return bestChild.action;
}

export async function decideSweep(gameState, difficulty, progressCallback) {
  if (!difficulty || !difficulty.startsWith('mcts')) {
    return null;
  }

  const iterations = ITERATIONS_MAP[difficulty] || 100;
  const playerIndex = gameState.currentPlayerIndex;

  try {
    const bestAction = await mctsSearch(gameState, playerIndex, iterations, progressCallback);
    return bestAction;
  } catch (e) {
    console.error('Error in MCTS decideSweep:', e);
    return null;
  }
}

export async function decideBonusTile(gameState, difficulty) {
  if (!difficulty || !difficulty.startsWith('mcts')) {
    return greedyBonusTile(gameState);
  }

  // For bonus tile, just use greedy (small branching factor)
  return greedyBonusTile(gameState);
}

export function decidePlacements(gameState, difficulty) {
  // Placement strategy exploration happens naturally in the MCTS tree
  // (getActionsForPhase returns ['greedy', 'ingredient', 'spread'])
  // So here we just return the greedy strategy synchronously
  return greedyPlacements(gameState);
}

export async function decideClaim(gameState, difficulty) {
  if (!difficulty || !difficulty.startsWith('mcts')) {
    return greedyClaim(gameState);
  }

  // Use greedy for claim
  return greedyClaim(gameState);
}
