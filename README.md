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
   - Game ends when players can't place tiles or market runs out

### Run Headless (Node)

Test game logic without UI:
```bash
node src/engine/game.js
```

## Game Overview

- **Players**: 2–4
- **Turn Structure**:
  1. **SWEEP**: Select a market tile, take entire row
  2. **PLACE**: Position tiles on your 5×5 personal board
  3. **CLAIM**: Earn cards by completing 2×2 colour patterns
  4. **REFILL**: Replenish market from bag if needed

- **Scoring**: Each claimed card scores points = its ingredient's track level (1–5)
- **Cards**: 50 unique patisserie cards with specific colour patterns
- **Tiles**: 5 colours × 5 ingredients = 100 types, 4 copies each

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
```

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
