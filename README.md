# Fancy That! Board Game Engine

A 100% JavaScript implementation of the Fancy That! board game for 2–4 players. Play against AI opponents in the browser or run simulations to test game balance.

## Quick Start

### Run in Browser

1. **Start the dev server** (from project directory):
   ```bash
   npx http-server -p 8080 -c-1
   ```

2. **Open in browser**: http://localhost:8080

3. **Configure your game**:
   - Select number of players (2–4)
   - Choose Human or AI for each player
   - Set AI difficulty: Random, Shallow MCTS (100), Medium MCTS (500), or Deep MCTS (2000)
   - Click "Start Game"

4. **Play**:
   - **Human players**: Click a market tile to SWEEP, then click your board cells to PLACE tiles
   - **AI players**: Watch them play automatically with a 500ms pause between moves
   - The game ends when a player's board is completely full, or when no tiles are
     left in the supply (market and bag both empty). Whichever fires, the round is
     finished out so every player has had the same number of turns, and only then
     is the game scored

### Run Headless (Node)

Test game logic without UI:
```bash
node src/engine/game.js
```

## Game Overview

- **Players**: 2–4
- **Turn Structure**:
  1. **SWEEP**: Declare a colour or an ingredient and take every matching tile from
     one market row or column (clear the line and take 1 free extra tile from
     anywhere). You may also **spend 1 cupcake for 1 extra tile from anywhere** at
     this step
  2. **PLACE**: Position tiles on your 5×5 personal board
  3. **SPEND**: Optionally spend cupcakes (move a tile, reserve a card, remove an
     empty plate, or **deal 2 new cards onto the card row** - and you may claim one
     of them this same turn)
  4. **CLAIM**: Earn a card by completing its colour pattern on your board. If the
     tile you remove carries **your own Speciality ingredient**, also score
     whatever the teapot is standing on
  5. **END OF TURN**: Deal 1 card to the card market, or - when 4 of the 5 teapot
     symbols are showing - order a fresh pot of tea instead, which flushes the card
     row and refreshes the whole tile market. A refresh deals as many tiles as the
     bag holds; a partly filled market is played on, not an ending

- **Today's Speciality**: each player is dealt their OWN ingredient face up at
  setup, all different. Removing a tile of *your* ingredient when you claim scores
  the value the teapot is on. The teapot is **shared**: every fresh pot moves it
  one space along a track that is 6/1 at 2 players, 6/3/1 at 3 and 6/4/2/1 at 4,
  so everyone's Speciality is worth the same at the same moment and everyone's
  goes cold together when it runs off the end
- **Scoring**: cake stand rows + 1 per crumb + each claimed card's printed VP +
  Today's Speciality. Cupcakes score nothing - they are the first tiebreaker
- **Cards**: 50 unique patisserie cards with specific colour patterns
- **Tiles**: 5 colours × 5 ingredients = 25 types, 4 copies each = 100 tiles
- **Cupcakes**: spend 1 to move a tile, 1 to reserve a card, 2 to take an extra
  tile, 3 to remove an empty plate from your board (empty plates are unlimited, so
  what this buys is a CELL - and because a full board ends the game, it is the one
  action that pushes the ending away)

## Architecture

```
src/engine/
  game.js       – Core game logic (pure, no DOM)
  tiles.js      – Card definitions, tile bag, market setup

src/ui/
  main.js       – Game flow (setup, turns, end state)
  board.js      – UI rendering (setup screen, game board, stats)

src/bots/
  randomBot.js  – Baseline random move selection

index.html, style.css – Browser entry point

tools/
  layout-check.mjs      – Responsive layout regression suite
  check-card-sheet.mjs  – Card art vs card data freshness check
```

### Changing a card pattern

Patterns live in **three** places and only two of them are linked:

1. `reward_cards.csv` – the source of truth Dean edits.
2. `src/engine/tiles.js` – what the engine matches on. Run
   `node generateCardsFromCSV.js` to splice the CSV in.
3. **The card art** – the swatches are painted into the sprite sheet, and
   nothing regenerates them. Re-export the sheet to a new versioned filename,
   repoint `.card-market-sprite` in `style.css` and bump its `?v=` query.

Miss step 3 and the game awards a card for a shape that is not the one printed
on it. Verify with `node tools/check-card-sheet.mjs`, which reads the swatches
back out of the sheet and diffs them against the engine (`--dump` writes crops
of any card that disagrees).

## Current Status

✅ **Phase 1 Complete**:
- Core game logic (SWEEP, PLACE, CLAIM, REFILL)
- 50 reward cards with pattern matching
- Setup screen with player configuration
- Game board UI (market, personal board, stats)
- Random AI bot
- Auto-play mode for AI-only games
- Graceful game-end handling

⏳ **In Progress**:
- MCTS bots with configurable difficulty
- Statistics gathering system
- Browser testing & optimization

## Configuration

See [CLAUDE.md](CLAUDE.md) for detailed design notes and constants.
