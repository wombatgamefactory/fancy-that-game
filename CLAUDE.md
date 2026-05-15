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
- Personal boards: 5×5 grid per player
- Tiles: 5 colours × 5 ingredients = 100 unique tiles (4 copies each = 400 total)
- Reward cards: 50 unique patisserie cards, each requiring a specific 2×2 colour pattern

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

## Key constants
- BOARD_SIZE = 5
- COLOURS = ['yellow', 'pink', 'green', 'blue', 'orange']
- INGREDIENTS = ['lemon', 'chocolate', 'caramel', 'strawberry', 'almond']
- TILES_PER_TYPE = 4
- TRACK_MAX = 5 (ingredient tracks)
- REFILL_TRIGGER = 3 (empty rows/columns that trigger refill)
- REWARD_CARDS = 50 unique patisserie cards

## Patisserie card structure
Each card in REWARD_CARDS:
{
  id: 1-50,
  name: 'Lemon madeleine',
  ingredient: 'lemon',              // ingredient that scores when card is claimed
  pattern: ['yellow', 'pink', ...]  // 1-4 colours forming the 2×2 pattern (left-to-right, top-to-bottom)
}

Pattern matching: cards are claimed when a player completes a 2×2 region on their
personal board matching the card's colour pattern (no rotation/reflection).
When claimed, player advances that ingredient's track (already advanced on SWEEP).

## Simulation mode (Node)
node simulate.js --games 1000 --players 2
Outputs: win rates, avg score, avg game length, track level distributions