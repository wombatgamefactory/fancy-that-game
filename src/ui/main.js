import { createGame, sweep, takeBonusTile, declineBonusTile, takeExtraTile, canBuyExtraTile, place, claim, skipClaim, skipSpend, refill, moveTile, removePlate, canRemovePlate, getMoveCost, reserveCard, canReserveCard, canClaimMore, getValidSweeps, getValidPlacements, getPatternMatches, getWinningPlayers, REWARD_CARDS, BOARD_SIZE } from '../engine/game.js';
import { createStatsCollector } from '../engine/statsCollector.js';
import { renderSetupScreen, renderGameScreen, updateGameDisplay, setThinkingState, setThinkingProgress, renderEndScreen } from './board.js';
import * as basicBot from '../bots/basicBot.js';
import * as mctsBot from '../bots/mctsBot.js';

let gameState = null;
let statsCollector = null;
let autoPlayMode = false;
let lastPlayerIndex = -1;
let undoStack = [];

function init() {
  const app = document.getElementById('app');
  renderSetupScreen(app, onGameStart);
}

function snapshotGameState() {
  const { statsCollector, ...rest } = gameState;
  const clone = JSON.parse(JSON.stringify(rest));
  clone.statsCollector = statsCollector;
  return clone;
}

function pushUndoSnapshot() {
  undoStack.push(snapshotGameState());
}

function undoAction() {
  if (undoStack.length === 0) return;
  const snapshot = undoStack.pop();
  const statsCollector = gameState.statsCollector;
  Object.assign(gameState, snapshot);
  gameState.statsCollector = statsCollector;
  if (window._gameUI) {
    window._gameUI.selectedPlacements = [];
    window._gameUI.placementMap = {};
    window._gameUI.removableTiles = [];
    window._gameUI.claimingCardId = null;
    window._gameUI.removedBoardIndex = null;
    window._gameUI.destinationChoices = null;
    window._gameUI.cupcakeMode = false;
    window._gameUI.extraTileMode = false;
    window._gameUI.reserveMode = false;
  }
  updateDisplay();
}

// THE END IS A TRIGGER, NOT A STOP (4 August). Nothing here changes, and that is
// worth stating: refill() still either rotates the turn or ends the game, so
// polling gameState.gameOver after it is still the whole of the driver's job. What
// changed is WHEN the flag arrives. An end condition now only ARMS the ending
// (gameState.endTriggered), and play continues until the turn comes back round to
// the start player so that everybody has had the same number of turns - so
// gameOver can land several turns after a player filled their board. Do not add a
// check on endTriggered here and stop early; that is the bug the rule change
// fixed. The end screen names the reason (endGameReasonText in board.js).
function confirmTurn() {
  undoStack.length = 0;
  refill(gameState);
  updateDisplay();
  if (gameState.gameOver) {
    onGameEnd();
  } else {
    // Ending the turn with four teapots showing brews a fresh pot of tea. Since
    // 3 August that is MECHANICAL - refill() flushes the cards, pays the pot,
    // flushes the tiles and rotates, all inside the one call - so there is
    // nothing for the UI to drive and no reserve round to sit through.
    setTimeout(() => {
      const nextPlayer = gameState.players[gameState.currentPlayerIndex];
      if (!nextPlayer.isHuman) {
        autoPlayGame();
      }
    }, 500);
  }
}

function onGameStart(playerConfigs) {
  undoStack.length = 0;
  statsCollector = createStatsCollector();
  gameState = createGame(playerConfigs, statsCollector);
  autoPlayMode = playerConfigs.every(p => !p.isHuman);

  const app = document.getElementById('app');
  renderGameScreen(app, gameState, onMarketClick, onBonusTile, onPlacementSubmit, onClaimSubmit, onSkipClaim, onSkipMove, onMoveTile, onCupcakeClick, {
    onExtraTile,
    onExtraTileToggle,
    onReserveCard,
    onRemovePlate,
    onReserveToggle,
  });

  updateDisplay();

  if (autoPlayMode) {
    autoPlayGame();
  }
}

function onMarketClick(rowOrCol, isRow, declaration, declarationType) {
  if (gameState.gamePhase !== 'sweep') return;
  const currentPlayer = gameState.players[gameState.currentPlayerIndex];
  if (!currentPlayer.isHuman) return;

  try {
    pushUndoSnapshot();
    sweep(gameState, rowOrCol, isRow, declaration, declarationType);
    updateDisplay();

    if (!gameState.bonusTileAvailable) {
      checkAutoAdvance();
    }
  } catch (e) {
    alert(e.message);
  }
}

function onBonusTile(marketIndex) {
  if (!gameState.bonusTileAvailable) return;
  const currentPlayer = gameState.players[gameState.currentPlayerIndex];
  if (!currentPlayer.isHuman) return;

  try {
    pushUndoSnapshot();
    takeBonusTile(gameState, marketIndex);
    updateDisplay();
    checkAutoAdvance();
  } catch (e) {
    alert(e.message);
  }
}

function onPlacementSubmit(placements) {
  try {
    pushUndoSnapshot();
    place(gameState, placements);
    updateDisplay();
    checkAutoAdvance();
  } catch (e) {
    alert(e.message);
  }
}

function onClaimSubmit(cardId, removedBoardIndex, destination) {
  try {
    pushUndoSnapshot();
    claim(gameState, cardId, removedBoardIndex, destination);
    updateDisplay();
    checkAutoAdvance();
  } catch (e) {
    alert(e.message);
  }
}

function onSkipClaim() {
  try {
    pushUndoSnapshot();
    skipClaim(gameState);
    updateDisplay();
    checkAutoAdvance();
  } catch (e) {
    alert(e.message);
  }
}

function onSkipMove() {
  try {
    pushUndoSnapshot();
    skipSpend(gameState);
    updateDisplay();
    checkAutoAdvance();
  } catch (e) {
    alert(e.message);
  }
}

function onMoveTile(fromIndex, toIndex) {
  try {
    pushUndoSnapshot();
    moveTile(gameState, fromIndex, toIndex);
    window._gameUI.cupcakeMode = false;
    updateDisplay();
  } catch (e) {
    console.warn('Move tile failed:', e.message);
  }
}

// SPEND CUPCAKES (REMOVE_PLATE_CUPCAKE_COST): REMOVE AN EMPTY PLATE, to the box. One click on the plate -
// unlike a tile move there is no destination to choose, because the plate leaves
// the game rather than going anywhere on the board.
function onRemovePlate(index) {
  try {
    pushUndoSnapshot();
    removePlate(gameState, index);
    window._gameUI.cupcakeMode = false;
    updateDisplay();
  } catch (e) {
    alert(e.message);
  }
}

function onCupcakeClick() {
  const currentPlayer = gameState.players[gameState.currentPlayerIndex];
  // Board-spend mode covers TWO actions with separate prices and separate
  // per-turn allowances: move a tile (1) and remove an empty plate (3). Open the
  // mode if either is still available - the engine gates the specific cell.
  const canMoveTile = currentPlayer.cupcakes >= 1 && !gameState.moveUsedThisTurn;
  if (gameState.gamePhase === 'spend' && (canMoveTile || canRemovePlate(gameState))) {
    window._gameUI.cupcakeMode = !window._gameUI.cupcakeMode;
    updateDisplay();
  }
}

// SPEND 1 CUPCAKE: TAKE 1 EXTRA TILE (3 August). Offered at the sweep step, once
// the sweep has resolved and before the swept tiles are placed - the bought tile
// joins them, so the placement UI must see it. Reuses the bonus-tile click path.
function onExtraTile(marketIndex) {
  if (!canBuyExtraTile(gameState)) return;
  const currentPlayer = gameState.players[gameState.currentPlayerIndex];
  if (!currentPlayer.isHuman) return;
  try {
    pushUndoSnapshot();
    takeExtraTile(gameState, marketIndex);
    window._gameUI.extraTileMode = false;
    updateDisplay();
  } catch (e) {
    alert(e.message);
  }
}

function onExtraTileToggle() {
  if (!canBuyExtraTile(gameState)) return;
  window._gameUI.extraTileMode = !window._gameUI.extraTileMode;
  updateDisplay();
}

// SPEND 1 CUPCAKE: RESERVE A CARD (3 August). Offered at the spend step on the
// player's own turn. The reserve holds one card, and the card cannot be claimed
// on the turn it was reserved - the engine enforces both.
function onReserveCard(cardId) {
  if (!canReserveCard(gameState)) return;
  const currentPlayer = gameState.players[gameState.currentPlayerIndex];
  if (!currentPlayer.isHuman) return;
  try {
    pushUndoSnapshot();
    reserveCard(gameState, cardId);
    window._gameUI.reserveMode = false;
    updateDisplay();
  } catch (e) {
    alert(e.message);
  }
}

function onReserveToggle() {
  if (!canReserveCard(gameState)) return;
  window._gameUI.reserveMode = !window._gameUI.reserveMode;
  updateDisplay();
}

// onOrderTea DELETED 1 AUGUST, and the whole TEA RESERVE ROUND deleted 3 August.
//
// A human used to click a button to order a fresh pot at the start of their turn
// (1 August: the engine fires it automatically at the end of the turn instead).
// Every player then took a turn in a clockwise reserve round, which the UI drove
// through onTeaReserve / driveTeaReserves and rendered with its own banner.
//
// None of that exists now. A fresh pot is mechanical and single-player: refill()
// flushes the card row, pays the tea player TEA_POT_REWARD, flushes and redeals
// the tiles, and rotates the turn - all in the one synchronous call. Reserving is
// a PAID action a player takes on their own turn instead (onReserveCard).
//
// Undo was never a concern for a tea round and still is not: confirmTurn clears
// the undo stack before calling refill, so by the time tea fires the turn it
// belongs to is already over.

// A claim phase with nothing claimable is a dead stop for a human: the only
// control is "Skip Claim", which does nothing but reveal "Confirm Turn". Skip it
// on their behalf so the turn ends in one click instead of two. No undo snapshot
// is pushed here - the snapshot taken when the player left the move phase already
// covers this step, so undo rewinds past the auto-skip rather than back onto it.
function autoSkipEmptyClaim() {
  if (gameState.gamePhase !== 'claim') return;
  const currentPlayer = gameState.players[gameState.currentPlayerIndex];
  if (!currentPlayer.isHuman) return;

  // canClaimMore is unconditionally true since 6 August (empty plates are
  // unlimited), so in practice this is now just "is anything claimable". The call
  // is kept as the engine's hook for a future claim limit - see canClaimMore.
  const cards = [...gameState.cardMarket, ...currentPlayer.reservedCards];
  const anyMatch = canClaimMore(gameState)
    && cards.some(card => getPatternMatches(currentPlayer.board, card.pattern).length > 0);
  if (anyMatch) return;

  skipClaim(gameState);
}

function checkAutoAdvance() {
  autoSkipEmptyClaim();

  if (gameState.gamePhase === 'refill') {
    const currentPlayer = gameState.players[gameState.currentPlayerIndex];
    if (currentPlayer.isHuman) {
      // Don't auto-advance — show Confirm Turn button instead
      updateDisplay();
      return;
    }
    // AI player: auto-advance as before. refill() may brew a pot of tea on the
    // way out; that is mechanical now, so it needs no handling here.
    refill(gameState);
    updateDisplay();
    if (gameState.gameOver) {
      onGameEnd();
    } else {
      setTimeout(() => {
        const nextPlayer = gameState.players[gameState.currentPlayerIndex];
        if (!nextPlayer.isHuman) {
          autoPlayGame();
        }
      }, 500);
    }
  }
}

async function autoPlayGame() {
  console.log('autoPlayGame started, autoPlayMode:', autoPlayMode);
  while (!gameState.gameOver) {
    const currentPlayer = gameState.players[gameState.currentPlayerIndex];
    console.log(`Turn: Player ${currentPlayer.id} (${currentPlayer.name}), Phase: ${gameState.gamePhase}`);

    if (!currentPlayer.isHuman) {
      try {
        const isMCTS = currentPlayer.aiDifficulty && currentPlayer.aiDifficulty.startsWith('mcts');
        const bot = isMCTS ? mctsBot : basicBot;

        if (gameState.gamePhase === 'sweep') {
          if (gameState.bonusTileAvailable) {
            setThinkingState(currentPlayer.name, true);
            updateDisplay();
            const bonusTileIndex = await bot.decideBonusTile(gameState, currentPlayer.aiDifficulty);
            setThinkingState(currentPlayer.name, false);
            updateDisplay();

            if (bonusTileIndex !== null) {
              takeBonusTile(gameState, bonusTileIndex);
            } else {
              // Decline the bonus and move to the placement step. (It used to be
              // able to trigger the board-overflow ending here; that ending is
              // deleted - see the placement branch below.)
              declineBonusTile(gameState);
            }
          } else {
            setThinkingState(currentPlayer.name, true);
            updateDisplay();
            const progressCallback = (progress) => setThinkingProgress(currentPlayer.name, progress);
            const sweepMove = await bot.decideSweep(gameState, currentPlayer.aiDifficulty, progressCallback);
            setThinkingState(currentPlayer.name, false);
            updateDisplay();

            if (!sweepMove) {
              // No valid sweeps - game should be over, but end it just in case
              gameState.gameOver = true;
              break;
            }
            sweep(gameState, sweepMove.rowOrCol, sweepMove.isRow, sweepMove.declaration, sweepMove.declarationType);
          }
        } else if (gameState.gamePhase === 'place') {
          // A sweep bigger than the board is legal since 6 August, and the bot's
          // decidePlacements says so: it returns a null for every tile that will
          // not fit, and place() sends those back into the bag. (This used to say
          // the engine had already resolved an overflow before the phase was
          // reached, because an overflow ended the game.)
          setThinkingState(currentPlayer.name, true);
          updateDisplay();
          // Buy an extra tile FIRST (3 August): it is a sweep-step option and the
          // tile it buys is placed with the swept tiles, so the placement decision
          // has to see it.
          const extraIndex = bot.decideExtraTile ? bot.decideExtraTile(gameState) : null;
          if (extraIndex !== null && extraIndex !== undefined) {
            takeExtraTile(gameState, extraIndex);
          }
          const placements = await bot.decidePlacements(gameState, currentPlayer.aiDifficulty);
          setThinkingState(currentPlayer.name, false);
          updateDisplay();

          place(gameState, placements);
        } else if (gameState.gamePhase === 'spend') {
          // Cupcake move: relocate one tile (1) if it completes a card we could
          // not otherwise claim this turn.
          const moveDecision = bot.decideMove ? await bot.decideMove(gameState, currentPlayer.aiDifficulty) : null;
          if (moveDecision) {
            moveTile(gameState, moveDecision.fromIndex, moveDecision.toIndex);
          }
          // Remove an empty plate to the box (3) - a separate allowance from the
          // move, so both can happen on the same turn.
          const plateIndex = bot.decideRemovePlate ? await bot.decideRemovePlate(gameState, currentPlayer.aiDifficulty) : null;
          if (plateIndex !== null && plateIndex !== undefined) {
            removePlate(gameState, plateIndex);
          }
          // Paid reserve: 1 cupcake for a market card, not claimable this turn.
          const reserveId = bot.decideReserve ? bot.decideReserve(gameState) : null;
          if (reserveId !== null && reserveId !== undefined) {
            reserveCard(gameState, reserveId);
          }
          skipSpend(gameState);
        } else if (gameState.gamePhase === 'claim') {
          setThinkingState(currentPlayer.name, true);
          updateDisplay();
          const claimDecision = await bot.decideClaim(gameState, currentPlayer.aiDifficulty);
          setThinkingState(currentPlayer.name, false);
          updateDisplay();

          if (claimDecision) {
            claim(gameState, claimDecision.cardId, claimDecision.removedBoardIndex, claimDecision.destination);
          } else {
            skipClaim(gameState);
          }
        } else if (gameState.gamePhase === 'refill') {
          refill(gameState);
        }

        updateDisplay();

        if (gameState.gameOver) {
          onGameEnd();
          break;
        }
      } catch (e) {
        console.error('AI error:', e);
        gameState.gameOver = true;
        break;
      }

      await new Promise(r => setTimeout(r, 500));
    } else {
      // Handing control back to a human. Nothing can be left owed here since
      // 3 August: a pot of tea resolves inside refill() rather than opening an
      // interactive round a human might still owe a decision to.
      break;
    }
  }
}

function updateDisplay() {
  if (window._gameUI) {
    window._gameUI.canUndo = undoStack.length > 0;
    window._gameUI.onUndo = undoAction;
    window._gameUI.onConfirmTurn = confirmTurn;
  }
  updateGameDisplay(gameState);
}

function onGameEnd() {
  const app = document.getElementById('app');
  const gameStats = statsCollector?.getReport() || {};
  renderEndScreen(
    app,
    gameState,
    () => init(),
    () => init(),
    gameStats
  );
}

init();
