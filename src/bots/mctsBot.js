import { getValidSweeps, getValidPlacements, sweep, takeBonusTile, declineBonusTile, dealCards, place, claim, skipClaim, skipSpend, moveTile, removePlate, refill, calculateFinalScores, canClaimMore, getLegalDestinations, countBoardIngredient, STAND_ROW_VALUES, REWARD_CARDS, BOARD_SIZE, getPatternMatches, getPatternWindows, TASTING_MENU_VP, FLAVOUR_VP_PER_TILE } from '../engine/game.js';
import { decideBonusTile as greedyBonusTile, decidePlacements as greedyPlacements, decideClaim as greedyClaim, decideMove as greedyMove, decideRemovePlate as greedyRemovePlate, decideDealCards as greedyDealCards, decideExtraTile as greedyExtraTile, rankSweeps, rankBonusTiles } from './basicBot.js';

// The PAID cupcake decisions taken here - the 2-card deal (8 August) and the
// extra tile (restored 9 August) - are delegated to the
// basicBot heuristics rather than expanded into the MCTS move space. Adding any
// of them as a tree action would balloon branching and rollout cost; the shared
// basicBot core makes it a clean one-function delegation, and the same greedy
// policy then runs inside the playouts, so search and rollout agree about how
// cupcakes are spent. The 2-card deal has a SECOND reason to stay out of the
// tree - it would search with knowledge of the deck order. See the rollout.
//
// ONE ASYMMETRY, INHERITED AND LEFT AS IT WAS: the rollout plays the spend-step
// purchases but has never bought an EXTRA TILE inside a playout - the place
// branch just places. That was true of this file before 8 August and is
// unchanged by the restoration. It makes playouts value a cupcake slightly low
// against a tile-locked board. Fixing it is a search change, to be measured on
// its own rather than folded into a rule change.
//
// decideOrderTea is gone (1 August): tea fires from the engine at the end of any
// turn that leaves four teapots showing. The tea ROUND is gone too (3 August),
// so the 'teaReserve' guard the rollout used to carry is gone with it - refill()
// now brews the pot and rotates in one call, and a playout never parks mid-round.
// The trigger's real decision lives in the sweep, where rankSweeps already prices
// it (see symbolTriggerValue in basicBot).
// (decideReserve delegated to the basicBot heuristic here until 11 August, when
// the paid reserve was deleted from the game.)

export function decideDealCards(gameState) {
  return greedyDealCards(gameState);
}

export function decideExtraTile(gameState) {
  return greedyExtraTile(gameState);
}

// Action-space pruning: with a few hundred iterations, spreading visits over
// 40+ sweep options drowns the search in rollout noise. Concentrate on the
// heuristically best candidates instead.
const MAX_SWEEP_ACTIONS = 8;
const MAX_BONUS_ACTIONS = 5;

// Committed (already-banked) score: mirror of calculateFinalScores on a live
// state — stand row values + 1/crumb + Σ claimed card vp. The ingredient-
// objective term (OBJECTIVE_VP per pantry goal taken) is deleted with the goals
// themselves on 4 August, exactly as it is in calculateFinalScores, so the two
// still agree line for line. CUPCAKES ARE NOT IN IT since 3 August: they score
// nothing and are only a tiebreaker, so counting them here would make the search
// hoard exactly the resource the rule change exists to make it spend.
//
// IT TAKES THE STATE AS WELL AS THE PLAYER since 6 August, for the Flavour of the
// Day: that lane is scored off the board against an ingredient that lives on the
// game state, so the player alone is no longer enough to mirror the scoring
// function. The argument is optional so a caller with only a player still works.
function committedScore(player, state = null) {
  let s = 0;
  for (let i = 0; i < player.stand.length; i++) {
    const row = player.stand[i];
    if (row.tiles.length > 0) s += STAND_ROW_VALUES[i][row.tiles.length - 1];
  }
  s += player.crumbTray.length;
  for (const cardId of player.claimedCards) {
    const card = REWARD_CARDS.find(c => c.id === cardId);
    if (card) s += card.vp;
  }
  // THE TASTING MENU. The search picks it up through the evaluation function, and
  // the evaluation function is this. A taken menu is ALREADY-BANKED VP, so it
  // belongs here rather than in the board-progress term - and this is why the
  // greedy claim policy the rollouts share (decideClaim in basicBot) steers toward
  // removals that close a menu deficit inside the playouts too.
  s += (player.tastingMenus ? player.tastingMenus.length : 0) * TASTING_MENU_VP;
  // THE FLAVOUR OF THE DAY (6 August). Board tiles of the revealed ingredient,
  // 1 VP each. Unlike every other term here this one is NOT banked - a claim can
  // take a Flavour tile off the board again - but it is the closest thing the
  // rollout has to a running total of the lane, and pricing it is what stops the
  // search sacrificing Flavour tiles for free.
  //
  // THE MAJORITY HALF IS DELIBERATELY OMITTED, and that is a decision rather than
  // an oversight: it is a CROSS-PLAYER term, so modelling it inside a rollout
  // means recomputing every opponent's count at every evaluation to price a bonus
  // that moves by 3 VP at most. It costs more than it is worth. The search still
  // chases the majority indirectly, because the per-tile term already pushes it
  // toward holding more of the ingredient than anyone else.
  if (state && state.flavourOfTheDay) {
    s += countBoardIngredient(player.board, state.flavourOfTheDay) * FLAVOUR_VP_PER_TILE;
  }
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

// THE ROLLOUT'S COPY OF THE WORLD. Everything the engine MUTATES has to be
// copied here, or an imaginary playout edits the real game.
//
// THE SPREAD DOES THE SCALARS, AND THAT INCLUDES THE END STATE (4 August).
// `endTriggered`, `startPlayerIndex`, `endGameReason`, `gameOver` and
// `turnsSinceLastClaim` are all plain values on the state object, so `...state`
// carries them across by value and a rollout that arms the ending cannot arm the
// real one. This matters more than it used to: the end is a TRIGGER now, and
// advanceToNextTurn stops the game only when endTriggered is set AND the turn has
// come back round to startPlayerIndex - a clone that dropped either field would
// let every playout run past the end of the game and score a position that cannot
// happen. Do not "tidy" the spread away into an explicit field list without
// carrying both of them.
//
// 6 AUGUST: the rollout no longer emulates ANY end condition. It used to arm
// 'boardOverflow' by hand at the placement step; that ending is deleted, and both
// of the two live ones - a full board, and an empty market against an empty bag -
// are armed by the engine itself inside advanceToNextTurn, which every rollout
// reaches through refill(). Nothing here has to know the rule. What the clone
// still has to carry is the end STATE those conditions write, which is the
// paragraph above.
// THE TASTING MENU NEEDS TWO EXPLICIT COPIES, and this is the single most likely
// bug in this build. The Freshness Bonus had exactly the same shape - two mutable
// containers, both written by the engine - and both had to be copied here or a
// rollout took real tokens off the real table. This module inherits the hazard:
//   - `state.tastingMenus` is an array of OBJECTS the engine WRITES to (claim sets
//     an entry's takenBy when somebody qualifies). A SPREAD OF THE ARRAY IS NOT
//     ENOUGH - it copies the array and shares every entry - so it must be MAPPED
//     with each entry spread, or an imaginary rollout takes a real card off the
//     real table permanently, for every player, for the rest of the game. There is
//     no reset in this module, so that damage is not even self-healing.
//   - `player.tastingMenus` is an ARRAY the engine PUSHES to, so a shared
//     reference would score rollout menus on the real player.
// Nothing else the module adds is mutable: TASTING_MENU_VP is a constant, and the
// deck in tastingMenus.js is never written to (createGame deals fresh entries).
// There is a test for this - section 12 of test-rules-2026-08-05-tasting-menu.mjs.
//
// THE FLAVOUR OF THE DAY (6 August) NEEDS NOTHING HERE, and that is deliberate -
// do not add a line for it. `state.flavourOfTheDay` is an IMMUTABLE STRING that
// nothing writes to after createGame, so the spread copies it by value, and the
// only other thing the module reads is player.board, which is deep-copied above.
// A module with no mutable state has no clone hazard.
function cloneState(state) {
  return {
    ...state,
    players: state.players.map(p => ({
      ...p,
      board: [...p.board],
      stand: p.stand.map(r => ({ ...r, tiles: [...r.tiles] })),
      crumbTray: [...p.crumbTray],
      claimedCards: [...p.claimedCards],
      // (reservedCards was deep-copied here until 11 August; the reserve is
      // deleted, so there is no per-player card array left to alias.)
      // MUST be copied - see the Tasting Menu note above. claim() pushes the taken
      // menu id onto this, so a shared reference scores rollout menus for real.
      tastingMenus: [...p.tastingMenus],
      // (player.objectiveCards was copied here, and the shared objectivePairs
      // deep-copied below it, until 4 August. Both fields are deleted with the
      // pantry goals, and nothing in a rollout can write to them any more - which
      // retires the nastiest clone hazard this file had: resolveObjectives wrote
      // takenBy onto a pair object, so a shallow copy let an imaginary rollout
      // spend a real objective for the whole table.)
    })),
    // MUST be a MAP, NOT A SPREAD of the array - each entry is itself mutated when
    // takenBy is set. This is the same shape of hazard the deleted objectivePairs
    // had: one shallow-copied shared object that a rollout writes a claim into,
    // affecting every player for the rest of the real game.
    tastingMenus: state.tastingMenus.map(m => ({ ...m })),
    market: [...state.market],
    bag: [...state.bag],
    gameDeck: [...state.gameDeck],
    cardMarket: [...state.cardMarket],
    // cardDiscard MUST be copied: every simulated turn now ends with a card
    // dealt from the deck (dealEndOfTurnCard), and drawCard reshuffles the
    // discard pile in place once the deck runs dry. Sharing the real array
    // would let a search rollout shuffle and consume the live discard pile.
    cardDiscard: [...state.cardDiscard],
    pendingSweepTiles: [...state.pendingSweepTiles],
    stats: { ...state.stats },
    // A rollout is imaginary and must not be logged. Belt and braces: the engine
    // also refuses to log through a collector that is not bound to the exact
    // state passed in (see metrics() in game.js), so a clone cannot pollute the
    // real game's metrics even if this line is ever lost again. It was lost
    // once, and hundreds of imaginary rollout turns per real turn went onto the
    // end screen as sweeps, claims and refills.
    statsCollector: null,
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
  } else if (phase === 'spend') {
    // Offer the heuristic cupcake move (complete a card we couldn't otherwise
    // claim) and the heuristic plate removal alongside skipping; the search
    // decides if either pays off. They are offered as ALTERNATIVES rather than as
    // a combined action - the pair is legal together, but enumerating the cross
    // product would double the branching here for a combination the greedy policy
    // inside the rollouts already explores. (A third alternative, the paid
    // reserve, was offered until 11 August.)
    const actions = [];
    const move = greedyMove(state);
    if (move) actions.push({ kind: 'move', ...move });
    const plateIndex = greedyRemovePlate(state);
    if (plateIndex !== null && plateIndex !== undefined) actions.push({ kind: 'removePlate', index: plateIndex });
    actions.push(null); // spend nothing
    return actions;
  } else if (phase === 'claim') {
    // canClaimMore is unconditionally true since 6 August (plates are unlimited);
    // kept as the engine's hook for a future claim limit. Harmless here.
    if (!canClaimMore(state)) return [null];
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
    } else if (phase === 'spend') {
      // A spend action is tagged {kind}: 'move' carries {fromIndex, toIndex},
      // 'removePlate' carries {index}, null spends nothing. Either way the phase
      // then advances - AT MOST ONE SPEND PER ROLLOUT TURN.
      //
      // THAT IS NOW A SEARCH LIMIT, NOT THE RULE. The per-turn allowances were
      // deleted on 11 August (second revision), so a real turn may move two tiles
      // or clear two plates; this tree still models one spend and then advances.
      // Widening it means the spend layer branches on every (kind, cell) pair
      // AGAIN per extra purchase, which multiplies the branching factor of the
      // one phase that already has the widest legal set. Left as is deliberately:
      // the bot plays a legal, conservative turn, and MCTS results are a floor on
      // the uncapped rule rather than a measurement of it.
      if (action && action.kind === 'move') {
        moveTile(cloned, action.fromIndex, action.toIndex);
      } else if (action && action.kind === 'removePlate') {
        removePlate(cloned, action.index);
      }
      skipSpend(cloned);
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
  const playerCommitted = committedScore(player, state);

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
    bestOpponentCommitted = Math.max(bestOpponentCommitted, committedScore(opponent, state));
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
            // A ROLLOUT ABORT, NOT A RULES ENDING. An empty tile market is no
            // longer an ending in itself (4 August): the engine's empty-market
            // valve either brews the incoming player a fresh board or, with the
            // bag dry, arms 'marketTiles' and drops them into the spend phase so
            // they can still claim. Neither route is reachable from here -
            // brewFreshPot is private to the engine, and applyEmptyMarketRule
            // only runs on a real rotation - so the playout stops and is scored
            // where it stands. It is an approximation of the last turn or two of
            // a game that is ending anyway, which is why it is tolerable.
            cloned.gameOver = true;
            break;
          }
          const action = selectHeuristicSweep(cloned);
          sweep(cloned, action.rowOrCol, action.isRow, action.declaration, action.declarationType);
        }
      } else if (cloned.gamePhase === 'place') {
        // NO SPECIAL CASE ANY MORE (6 August). This branch used to re-implement
        // triggerEndGame + checkBoardOverflowOnPlace inline: a sweep bigger than
        // the board armed 'boardOverflow', binned the whole sweep and jumped the
        // turn to refill. That ending is deleted. Sweeping more than you can place
        // is an ordinary turn now - place what fits, the excess goes back into the
        // bag - and greedyPlacements returns the nulls that say so, so the engine's
        // own place() handles it and there is nothing here to emulate.
        //
        // An emulation that outlives the rule it copies is worse than none: this
        // one would have kept ending rollouts on a condition the real game cannot
        // reach, and every playout past a tight board would have scored a position
        // that cannot happen.
        place(cloned, greedyPlacements(cloned));
      } else if (cloned.gamePhase === 'spend') {
        // Spend the cupcakes in playouts too — an otherwise unclaimable card
        // completed by a move, and a cell bought back from a plate, are both real
        // parts of both players' strength now that cupcakes buy rather than score.
        const mv = greedyMove(cloned);
        if (mv) moveTile(cloned, mv.fromIndex, mv.toIndex);
        const rp = greedyRemovePlate(cloned);
        if (rp !== null && rp !== undefined) removePlate(cloned, rp);
        // Paid 2-card deal (8 August). Played in rollouts for the same reason as
        // the other three: a cupcake spent is a cupcake gone, and a rollout that
        // never spends over-values a hoard.
        //
        // IT IS NOT OFFERED AS A TREE ACTION, deliberately, and that is not just
        // branching economy. The clone holds the REAL deck in its real order, so a
        // tree node that dealt two cards would be searching with knowledge of
        // which two - information no player has. Delegating to the greedy
        // heuristic keeps the decision blind, because decideDealCards prices the
        // deck as a distribution and never reads gameDeck.
        if (greedyDealCards(cloned)) dealCards(cloned);
        skipSpend(cloned);
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
  // already claimable (same heuristic the MCTS tree explores). TILES ONLY now -
  // a plate is removed rather than moved, and that is decideRemovePlate below.
  return greedyMove(gameState);
}

export async function decideRemovePlate(gameState, difficulty) {
  // Buy an empty plate off the board for REMOVE_PLATE_CUPCAKE_COST. Same
  // heuristic the tree explores as the 'removePlate' spend action.
  return greedyRemovePlate(gameState);
}
