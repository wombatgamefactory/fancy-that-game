# Undo / Confirm Turn Feature

## Overview

This feature adds the ability for human players to undo actions within their turn and explicitly confirm when they're ready to end their turn.

## How It Works

### For Human Players

1. **Undo Button Appears** — After making any action (sweep, place, claim, move tile), an "↩ Undo" button appears in the phase controls.

2. **Step-by-Step Undo** — Each click on Undo reverts one action:
   - Undo after Sweep → returns to Sweep phase, tiles return to market
   - Undo after Place → returns to Place phase, tiles return to working area
   - Undo after Claim → returns to Claim phase, card is unclaimed
   - Undo after Skip → returns to Claim phase
   - Undo after tile Move (cupcake) → reverts the move, returns the cupcake

3. **Multiple Undo** — You can undo multiple times to revert your entire turn back to the start.

4. **Confirm Turn** — After Claim/Skip Claim, the phase becomes "Turn complete" and shows:
   - An "↩ Undo" button (if you want to change your claim)
   - A "Confirm Turn →" button to lock in your actions and advance to the next player

5. **No Undo After Confirm** — Once you click "Confirm Turn", the undo stack is cleared and you cannot undo further. The next player's turn begins.

### For AI Players

- AI players are unaffected and auto-advance as before
- No undo buttons are shown during AI turns
- Human players can undo even before/after AI turns (within their own turn only)

## Game Flow

```
HUMAN PLAYER TURN:
  Sweep → (Undo available)
    ↓
  [Bonus Tile?] → (Undo available)
    ↓
  Place Tiles → (Undo available)
    ↓
  Claim/Skip → (Undo available)
    ↓
  REFILL PHASE (Turn Complete)
    ↓ [Show Undo + Confirm buttons]
    ↓
  Player clicks "Confirm Turn"
    ↓ [Undo stack cleared, turn advances]
    ↓
  NEXT PLAYER
```

## Technical Details

### State Snapshots

Before each action, a deep clone of `gameState` is captured:
- Market tiles
- Player boards
- Scoring piles
- Current phase
- Pending sweep tiles
- Bonus tile state
- Card market

Non-serializable fields (statsCollector) are preserved as references.

### UI State Reset

When undoing, transient UI state is also cleared:
- placementMap (tile placement tracking)
- selectedPlacements
- removableTiles (for claim phase)
- claimingCardId
- cupcakeMode

### Modified Functions

**main.js:**
- `snapshotGameState()` — deep clones game state
- `pushUndoSnapshot()` — captures state before action
- `undoAction()` — reverts to previous state
- `confirmTurn()` — locks turn and advances player
- `checkAutoAdvance()` — modified to skip auto-refill for human players
- `updateDisplay()` — syncs undo state to UI

**board.js:**
- `updatePhaseControls()` — renders undo/confirm buttons for refill phase

## Files Modified

- `src/ui/main.js` — Undo stack management, callback wrapping, auto-advance logic
- `src/ui/board.js` — UI button rendering and event handling

## Testing Checklist

- [ ] Start game with human player 1 only
- [ ] Make a sweep selection → Undo button appears
- [ ] Click Undo → tiles return to market, phase reverts
- [ ] Make another sweep, place tiles → Undo available at each step
- [ ] Claim a card → Undo available in refill phase
- [ ] Click "Confirm Turn" → turn locks, advances to next player
- [ ] Verify AI-only game still auto-advances without undo UI
- [ ] Verify mixed human/AI game: human has undo/confirm, AI auto-advances
