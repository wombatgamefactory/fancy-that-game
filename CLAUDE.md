# Fancy That! — Board Game Engine

## What this project is
A 100% JavaScript engine for the 2–4 player gateway tile-placement game 
"Fancy That!" by Dean Morris. Pure JS — no Python, no server, no build step.
Runs in the browser (watch mode) and headlessly via Node (simulation mode).

## Architecture
- src/engine/game.js  — pure game logic (no DOM references ever)
- src/engine/tiles.js — tile constants, bag initialisation
- src/bots/*.js       — bot implementations (import game.js only)
- src/ui/board.js     — DOM rendering (imports game.js only)
- simulate.js         — Node headless runner (imports game.js and bots)
- index.html          — browser entry point; imports board.js and bots

CRITICAL: game.js and bots must be pure (zero DOM). 
board.js is the only file that touches the DOM.

## Game summary
- 2–4 players; tile placement + patisserie collection
- Central market: 5×5 grid, refilled from a tile bag
- Personal boards: 5×5 grid per player (4×4 in 2-player)
- Tiles: 5 colours × 5 ingredient symbols = 100 tiles (4 copies each)

## Turn structure
1. SWEEP: point to a tile; take it + all tiles between it and the nearest edge
   in that row or column
2. PLACE: place all taken tiles on personal board (each must be adjacent to 
   existing tile or board edge)
3. CLAIM: check for completed 2×2 colour patterns matching patisserie cards
   (read from player's seated position — no rotation, no reflection)
4. REFILL CHECK: if 3+ rows/columns empty, trigger refill from bag

## Scoring
- Ingredient tracks: advance 1 step each time a tile with that symbol is TAKEN
  (not placed). Tracks run 1–5. All start at 1.
- End game: each symbol on claimed patisserie cards scores VP = track level
  for that ingredient. No flat VP.
- Personal board scoring strip: additional end-game criteria (TBD)

## Key constants (update as design is finalised)
- BOARD_SIZE = 5           (4 in 2-player mode)
- COLOURS = 5              (palette TBD: pink, yellow, green, blue, cream)
- SYMBOLS = ['strawberry', 'lemon', 'chocolate', 'almond', 'caramel']
- TILES_PER_TYPE = 4       (100 tiles total)
- TRACK_MAX = 5
- PATISSERIE_TYPES = 8     (TBD from candidate list)
- CARDS_PER_TYPE = 3       (24 cards total)
- REFILL_TRIGGER = 3       (empty rows + columns combined)

## Patisserie card structure
{
  type: 'bakewellTart',
  pattern: [[C1, C2], [C3, C4]],   // 2×2 colour pattern
  positions: [0,1,2],              // which of 4 cells the figure appears in
  symbols: ['almond', 'almond', 'strawberry']  // end-game scoring symbols
}

## Simulation mode (Node)
node simulate.js --games 1000 --players 2
Outputs: win rates, avg score, avg game length, track level distributions