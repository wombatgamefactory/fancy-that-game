import { getValidSweeps, getValidPlacements, sweep, takeBonusTile, place, claim, skipClaim, refill, calculateFinalScores } from '../engine/game.js';
import { decideBonusTile as greedyBonusTile, decidePlacements as greedyPlacements, decideClaim as greedyClaim } from './basicBot.js';

const ITERATIONS_MAP = {
  'basic': 0,
  'mcts-1': 30,
  'mcts-2': 100,
  'mcts-3': 300,
  'mcts-4': 600,
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
    // For placement, we'll use heuristic strategies
    const positions = getValidPlacements(state.players[state.currentPlayerIndex].board);
    if (positions.length < state.pendingSweepTiles.length) {
      return [];
    }
    return ['greedy']; // Single strategy for now
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
      const placements = greedyPlacements(cloned);
      place(cloned, placements);
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
          const action = validSweeps[Math.floor(Math.random() * validSweeps.length)];
          sweep(cloned, action.rowOrCol, action.isRow, action.declaration, action.declarationType);
        }
      } else if (cloned.gamePhase === 'place') {
        const placements = greedyPlacements(cloned);
        place(cloned, placements);
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

  if (!cloned.gameOver) {
    calculateFinalScores(cloned);
  }

  const playerScore = cloned.players[playerIndex].score;
  const maxOpponentScore = Math.max(
    ...cloned.players
      .map((p, i) => i !== playerIndex ? p.score : -Infinity)
  );

  return playerScore - maxOpponentScore;
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

async function mctsSearch(state, playerIndex, totalIterations) {
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

export async function decideSweep(gameState, difficulty) {
  if (!difficulty || !difficulty.startsWith('mcts')) {
    return null;
  }

  const iterations = ITERATIONS_MAP[difficulty] || 100;
  const playerIndex = gameState.currentPlayerIndex;

  try {
    const bestAction = await mctsSearch(gameState, playerIndex, iterations);
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

export async function decidePlacements(gameState, difficulty) {
  if (!difficulty || !difficulty.startsWith('mcts')) {
    return greedyPlacements(gameState);
  }

  // Use greedy for placement to keep speed reasonable
  return greedyPlacements(gameState);
}

export async function decideClaim(gameState, difficulty) {
  if (!difficulty || !difficulty.startsWith('mcts')) {
    return greedyClaim(gameState);
  }

  // Use greedy for claim
  return greedyClaim(gameState);
}
