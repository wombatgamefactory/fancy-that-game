import { getValidSweeps, getValidPlacements, sweep, takeBonusTile, declineBonusTile, place, claim, skipClaim, skipMove, moveTile, refill, calculateFinalScores, getLegalDestinations, ROW_VALUES, REWARD_CARDS, BOARD_SIZE, getPatternMatches, getPatternWindows } from '../engine/game.js';
import { decideBonusTile as greedyBonusTile, decidePlacements as greedyPlacements, decideClaim as greedyClaim, decideMove as greedyMove, rankSweeps, rankBonusTiles } from './basicBot.js';

// Action-space pruning: with a few hundred iterations, spreading visits over
// 40+ sweep options drowns the search in rollout noise. Concentrate on the
// heuristically best candidates instead.
const MAX_SWEEP_ACTIONS = 8;
const MAX_BONUS_ACTIONS = 5;

// Committed (already-banked) score: mirror of calculateFinalScores on a live
// state — stand row values + 1/crumb + Σ claimed card vp + unspent cupcakes.
function committedScore(player) {
  let s = 0;
  for (const row of player.stand) {
    if (row.tiles.length > 0) s += ROW_VALUES[row.tiles.length - 1];
  }
  s += player.crumbTray.length;
  for (const cardId of player.claimedCards) {
    const card = REWARD_CARDS.find(c => c.id === cardId);
    if (card) s += card.vp;
  }
  s += player.cupcakes || 0;
  return s;
}

// Which tile the removal heuristic would sacrifice from a matched pattern:
// prefer a tile that extends a locked stand row, avoid breaking the last tile
// of a colour still wanted by the card market.
function pickRemovalIndex(player, cardMarket, patternCells) {
  const coloursNeeded = new Set();
  for (const c of cardMarket) {
    for (const colour of c.pattern) if (colour) coloursNeeded.add(colour);
  }
  const lockedUnfilled = new Set();
  for (const row of player.stand) {
    if (row.ingredient !== null && row.tiles.length < row.capacity) lockedUnfilled.add(row.ingredient);
  }
  let best = patternCells[0];
  let bestScore = -Infinity;
  for (const cellIndex of patternCells) {
    const tile = player.board[cellIndex];
    if (!tile) continue;
    let score = 0;
    if (lockedUnfilled.has(tile.ingredient)) score += 5;
    if (coloursNeeded.has(tile.colour)) {
      const others = player.board.filter((t, i) => i !== cellIndex && t && t.colour === tile.colour);
      if (others.length === 0) score -= 10;
    }
    if (score > bestScore) {
      bestScore = score;
      best = cellIndex;
    }
  }
  return best;
}

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
      stand: p.stand.map(r => ({ ...r, tiles: [...r.tiles] })),
      crumbTray: [...p.crumbTray],
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

  // Target ingredient: the ingredient of a locked, unfilled stand row (those
  // rows can only ever grow with that ingredient). Fall back to the most-common
  // ingredient already on the board if nothing is locked yet.
  let bestIngredient = null;
  for (const row of currentPlayer.stand) {
    if (row.ingredient !== null && row.tiles.length < row.capacity) {
      bestIngredient = row.ingredient;
      break;
    }
  }
  if (bestIngredient === null) {
    const counts = {};
    for (const cell of currentPlayer.board) {
      if (cell && cell.ingredient) counts[cell.ingredient] = (counts[cell.ingredient] || 0) + 1;
    }
    let bestCount = -1;
    for (const ing in counts) {
      if (counts[ing] > bestCount) {
        bestCount = counts[ing];
        bestIngredient = ing;
      }
    }
  }

  // Process best-ingredient tiles first, but keep each chosen position paired
  // with its tile's ORIGINAL index — place() zips placements[i] with
  // pendingSweepTiles[i] by index.
  const sortedEntries = tilesToPlace
    .map((tile, index) => ({ tile, index }))
    .sort((a, b) => {
      const aIsBest = a.tile.ingredient === bestIngredient ? 1 : 0;
      const bIsBest = b.tile.ingredient === bestIngredient ? 1 : 0;
      return bIsBest - aIsBest;
    });

  const placements = new Array(tilesToPlace.length).fill(-1);
  const usedPositions = new Set();

  for (const { tile, index } of sortedEntries) {
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

    if (bestPos === null) bestPos = validPositions.find(p => !usedPositions.has(p));
    placements[index] = bestPos;
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

    if (bestPos === null) bestPos = validPositions.find(p => !usedPositions.has(p));
    placements.push(bestPos);
    usedPositions.add(bestPos);
  }

  return placements;
}

function getActionsForPhase(state) {
  const phase = state.gamePhase;
  if (phase === 'sweep') {
    if (state.bonusTileAvailable) {
      const ranked = rankBonusTiles(state).slice(0, MAX_BONUS_ACTIONS);
      return ranked.length > 0 ? ranked : [null];
    } else {
      return rankSweeps(state).slice(0, MAX_SWEEP_ACTIONS);
    }
  } else if (phase === 'place') {
    // For placement, explore multiple strategies
    const positions = getValidPlacements(state.players[state.currentPlayerIndex].board);
    if (positions.length < state.pendingSweepTiles.length) {
      return [];
    }
    return ['greedy', 'ingredient', 'spread'];
  } else if (phase === 'move') {
    // Offer the heuristic cupcake move (complete a card we couldn't otherwise
    // claim) alongside skipping; the search decides if it pays off.
    const suggestion = greedyMove(state);
    return suggestion ? [suggestion, null] : [null];
  } else if (phase === 'claim') {
    // Only actually claimable cards, and for each give MCTS a real plate-vs-crumb
    // choice: one action per legal destination of the tile the removal heuristic
    // would pick, plus null to skip.
    const player = state.players[state.currentPlayerIndex];
    const claimOptions = [];
    for (const card of state.cardMarket) {
      const matches = getPatternMatches(player.board, card.pattern);
      if (matches.length === 0) continue;
      const removedBoardIndex = pickRemovalIndex(player, state.cardMarket, matches[0].cells);
      const removedTile = player.board[removedBoardIndex];
      for (const destination of getLegalDestinations(player, removedTile)) {
        claimOptions.push({ cardId: card.id, removedBoardIndex, destination });
      }
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
          declineBonusTile(cloned);
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
      // A move action carries {fromIndex, toIndex}; either way the phase then
      // advances (only one cupcake move is allowed per turn).
      if (action && typeof action.fromIndex === 'number') {
        moveTile(cloned, action.fromIndex, action.toIndex);
      }
      skipMove(cloned);
      return cloned;
    } else if (phase === 'claim') {
      // Execute the action's OWN chosen card/removal/destination — do not
      // re-derive it from a heuristic (that discarded the search's choice).
      if (action && action.cardId) {
        claim(cloned, action.cardId, action.removedBoardIndex, action.destination);
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

// Rollout sweep policy: the window-aware heuristic ranking with a little
// randomness (pick among the top 3) so playouts stay diverse.
function selectHeuristicSweep(state) {
  const ranked = rankSweeps(state);
  if (ranked.length === 0) return null;
  const k = Math.min(3, ranked.length);
  // Weight toward the top choice: 1st twice as likely as 2nd, etc.
  const r = Math.random();
  const pick = r < 0.6 ? 0 : r < 0.85 ? 1 : 2;
  return ranked[Math.min(pick, k - 1)];
}

function evaluateState(state, playerIndex) {
  const player = state.players[playerIndex];
  const opponents = state.players.filter((_, i) => i !== playerIndex);

  // Already-banked score.
  const playerCommitted = committedScore(player);

  // Board progress: a completed pattern is worth vp*2 (claimable now); an
  // incomplete one gets credit for its best viable window, quadratic in
  // progress so tiles actually ARRANGED toward a pattern count, not scattered
  // colour-matching tiles anywhere on the board.
  let playerBoardProgress = 0;
  for (const card of state.cardMarket) {
    let best = 0;
    for (const win of getPatternWindows(player.board, card.pattern)) {
      if (win.missing.length === 0) {
        best = 2;
        break;
      }
      const progress = win.matched / win.need;
      if (progress * progress > best) best = progress * progress;
    }
    playerBoardProgress += best * card.vp;
  }

  // Stand trajectory: small credit for board tiles whose ingredient matches a
  // locked, unfilled stand row (they can grow that row when sacrificed).
  const lockedUnfilled = new Set();
  for (const row of player.stand) {
    if (row.ingredient !== null && row.tiles.length < row.capacity) lockedUnfilled.add(row.ingredient);
  }
  let playerTrajectory = 0;
  for (const cell of player.board) {
    if (cell && cell.ingredient && lockedUnfilled.has(cell.ingredient)) playerTrajectory += 0.3;
  }

  const playerEstimate = playerCommitted + playerBoardProgress + playerTrajectory;

  // Opponents: committed score only.
  let bestOpponentCommitted = 0;
  for (const opponent of opponents) {
    bestOpponentCommitted = Math.max(bestOpponentCommitted, committedScore(opponent));
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
            declineBonusTile(cloned);
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
        // Mirror the engine's board-overflow handling so rollouts don't throw
        // (and end the game) when the board can't accept all swept tiles.
        const board = cloned.players[cloned.currentPlayerIndex].board;
        const empty = getValidPlacements(board).length;
        if (cloned.pendingSweepTiles.length > empty) {
          cloned.endGameReason = 'boardOverflow';
          cloned.remainingTurnsInEndGame = cloned.players.length - 1;
          cloned.pendingSweepTiles = [];
          cloned.gamePhase = 'refill';
        } else {
          place(cloned, greedyPlacements(cloned));
        }
      } else if (cloned.gamePhase === 'move') {
        // Use the cupcake move in playouts too — completing an otherwise
        // unclaimable card is a real part of both players' strength.
        const mv = greedyMove(cloned);
        if (mv) moveTile(cloned, mv.fromIndex, mv.toIndex);
        skipMove(cloned);
      } else if (cloned.gamePhase === 'claim') {
        const claimDec = greedyClaim(cloned);
        if (claimDec) {
          claim(cloned, claimDec.cardId, claimDec.removedBoardIndex, claimDec.destination);
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

export async function decideMove(gameState, difficulty) {
  // Cupcake move: complete a card this turn if it strictly beats what is
  // already claimable (same heuristic the MCTS tree explores).
  return greedyMove(gameState);
}
