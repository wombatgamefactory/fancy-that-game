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

---
name: fancy-that-game
description: >
  Complete design reference for "Fancy That!" — an original gateway-weight tile
  placement and patisserie collection game currently in development. Use this
  skill whenever the user asks about this game's design, wants to develop any
  aspect of it further, or references the tile game, the reward cards, the
  sweep mechanic, the scoring system, the personal board, the ingredient symbols,
  or any component of this design. Also trigger when the user wants to design
  ingredient symbols, patisserie illustrations, card layouts, board layouts,
  or any other element of this specific game. This skill is the authoritative
  design document — always read it before responding to any question about
  this game.
---

# Fancy That! — Complete Design Document

## Overview

A 2–4 player gateway-weight tile placement and patisserie collection game.

Target complexity: Azul/Cascadia band (BGG ~1.8–2.3).
Target play time: 45–60 minutes.

**Theme:** Afternoon tea. Players sweep coloured tiles from a shared market,
build colour patterns on their personal boards to claim kawaii patisserie reward
cards, and collect removed tiles that multiply their end-game scores.

The aesthetic is *kawaii afternoon tea*: charming, slightly whimsical,
sophisticated rather than babyish. Think Beatrix Potter meets Sanrio meets the
Great British Bake Off — refined, warm, distinctly British, with a dash of whimsy.

**The name plays on the double meaning of "fancy":**
- *A fancy* = a small decorative cake (fondant fancy, French fancy, fairy cake)
- *Fancy* (adjective) = elaborate, decorative, refined
- *To fancy* (verb) = to like, to want, to take a liking to
- *A flight of fancy* = whimsical imagination, delight
- *Fancy that!* = British exclamation of pleased surprise

---

## Components

### Tiles (100 total)
- 5 colours x 5 ingredient symbols = 25 unique tile types x 4 copies = 100 tiles
- Each tile has: a solid colour background + a small etched black ingredient symbol
- **Colour** = pattern matching axis (used for claiming reward cards)
- **Symbol** = ingredient (used for end-game scoring when tile is removed from a claimed pattern)
- Held in a drawstring bag during play

**The 5 tile colours (locked in):**
Yellow, Pink, Orange, Green, Blue.
These are abstract pattern markers with no in-fiction meaning (Azul-style).

**The 5 ingredient symbols (locked in):**
1. **Strawberry** — bold heart shape with leafy crown
2. **Lemon** — lemon slice viewed front-on showing segments
3. **Chocolate** — square divided into a 2×2 grid (bar of chocolate)
4. **Almond** — pointed teardrop with central seam
5. **Caramel** — wrapped candy with twisted ends

Each symbol works as both a black etched silhouette on tiles AND a full-colour
symbol on the reward cards. All five have maximally distinct silhouettes that
read at 20mm tile size from across a table.

### Reward Cards (50 total)
50 unique cards, 10 per ingredient. Each card shows:
- The patisserie name and illustration
- A colour pattern (1–4 coloured tile squares arranged within a 2×2 ghost area)
- A row of ingredient symbols along the bottom edge

**Pattern tiers — all patterns fit within a 2×2 ghost area:**

| Tier | Shape       | Tiles | Symbols | Notes                          |
|------|-------------|-------|---------|--------------------------------|
| 1    | Single      | 1     | 0       | One colour, no shape           |
| 2    | Domino      | 2     | 1       | Two adjacent tiles             |
| 3    | L-tromino   | 3     | 2       | L-shape within 2×2 (4 rotations) |
| 4    | 2×2 square  | 4     | 3       | Full 2×2 square                |

Symbol count = tiles − 1. All symbols on a card are the same ingredient.
The card's ingredient is always thematically linked to the patisserie depicted.

**Pattern matching rule:** The pattern shown on the card may be matched in any
rotation or reflection on the player's board. The card itself is
never rotated during play — the player scans their board for the shape in any
of its valid orientations.

### Personal Player Boards (4 total)
- Plain 5×5 grid (25 cells) — no border colours, no tracks, no scoring strip
- Tiles may be placed anywhere on the grid — no adjacency requirements
- Each player also maintains a personal **scoring pile** of removed tiles beside their board

### Cupcakes (5 per player)
- Each player starts the game with exactly **5 cupcakes**
- Cupcakes may be **spent to move a single tile** on your personal board from one empty cell to another (one cupcake per move)
- Cupcakes are spent, never earned during play
- At end game, each remaining cupcake is worth **1 VP**

### Central Market Board (1 total)
- **2 players:** 5×5 recessed grid (25 cells)
- **3–4 players:** 6×6 recessed grid (36 cells)
- Row and column coordinates printed on edges for clear sweep communication
- Slightly tapered recesses — tiles can be dumped and slid into position

### Other Components
- Drawstring tile bag
- Score pad / scoring sheet

---

## Setup

1. Shuffle the full 50-card deck. Deal **16 cards** face-down to form the **game deck**,
   regardless of player count. Set remaining cards aside — they play no further part
   this game.
2. Reveal the top **4 cards** from the game deck face-up as the **card market**.
   These are the only cards players may currently claim.
3. Dump tiles from the bag to fill the 6×6 market board.
4. Each player takes a personal board and clears space for their scoring pile.
5. Randomly determine first player.

---

## Turn Structure

On your turn, perform these steps in order:

### Step 1 — Sweep
- Choose any one **row or column** on the market board
- Declare either a **colour** or an **ingredient symbol**
- Take all tiles in that row/column that match your declared attribute
- You always take at least 1 tile

**Bonus tile:** If your sweep removes the very last tile from the chosen row or
column (completely clearing it), you may immediately take **1 additional tile**
from anywhere on the market board, including the row/column just swept.
This bonus does not chain — it triggers at most once per turn.

### Step 2 — Place Tiles
- Place all taken tiles anywhere on your personal 5×5 board
- **No adjacency requirement** — tiles may go in any empty cells
- All tiles taken must be placed this turn — no holding tiles between turns

### Step 3 — Claim (optional, maximum 1 per turn)
- Examine your personal board
- If tiles on your board form the colour pattern on any face-up card in the card
  market — in that exact shape or any **rotation or reflection** — you may claim it
- When you claim a card:
  1. **Remove exactly 1 tile** from those that formed the matching pattern.
     Place it in your personal scoring pile. You choose which tile to remove.
  2. **Tuck the card** face-down under your board (keep accessible for scoring)
  3. **Immediately draw** the top card of the game deck and place it face-up,
     refilling the card market back to 4 face-up cards
- You may only claim **1 card per turn**, even if multiple patterns are complete

### Step 3.5 — Move Tiles (optional, using cupcakes)
- At any point during your turn (during sweep, place, or claim phases), you may spend a **cupcake** to move one tile on your personal board from its current cell to any other empty cell
- You may move multiple tiles in a single turn if you have cupcakes to spend
- Each move costs exactly 1 cupcake

### Step 4 — Refill Market Board
- Count tiles remaining on the market board
- Refill threshold depends on player count:
  - **2 players:** If **5 or fewer tiles** remain, dump tiles from the bag to refill
  - **3–4 players:** If **6 or fewer tiles** remain, dump tiles from the bag to refill
- If the bag is empty, do not refill — play continues with remaining tiles

---

## Pattern Reference

All patterns occupy a 2×2 ghost area on the player's board.

**Tier 1 — Single (1 tile, 0 symbols):**
Any 1 tile of the stated colour anywhere on the board. Claimed the moment you
place a tile of the right colour.

**Tier 2 — Domino (2 tiles, 1 symbol):**
Two orthogonally adjacent tiles of the stated colours. Valid horizontally or
vertically (2 rotations).

**Tier 3 — L-tromino (3 tiles, 2 symbols):**
Three tiles in an L-shape within a 2×2 area (one corner cell empty).
4 valid rotations. Example: Blue + Blue across the top row, Yellow in
bottom-left (bottom-right empty).

**Tier 4 — 2×2 square (4 tiles, 3 symbols):**
All four cells of a 2×2 area filled with the stated colours.
Rotational symmetry means only 1 effective orientation for symmetric patterns;
asymmetric colour arrangements (e.g. Florentine: Orange/Pink/Green/Blue) have
up to 4 rotations.

---

## Scoring Flow

**When you SWEEP tiles:**
No immediate scoring. Tiles go to your personal board.

**When you PLACE tiles:**
Colour matters for pattern matching — that is their only board function.
Ingredient symbol is dormant until a tile is removed.

**When you CLAIM a card:**
Remove 1 tile from the pattern into your scoring pile.
No scoring happens yet. This is tile-banking for end game.

**At END GAME — per ingredient:**

> (symbols on tucked cards of that ingredient) × (tiles in scoring pile showing that ingredient's symbol) = VP for that ingredient

Sum all five ingredients for your final total.

**Example:** You hold the Bakewell tart (2× Almond) and the Galette des Rois
(2× Almond) = 4 almond symbols total. Your scoring pile contains 3 tiles with
the almond symbol. Almond score: 4 × 3 = 12 VP.

**Cupcakes:** Add 1 VP for each remaining cupcake (unspent).

Final score = (ingredient multiplications summed) + (remaining cupcakes).

The physical process at end game: sort tucked cards into 5 ingredient groups,
count symbols in each. Sort scoring pile tiles into 5 ingredient groups, count
each. Multiply pairs and sum. Five multiplications, four additions total.

---

## End Game Conditions

The game ends in one of three ways:

### 1. Card Market Exhausted (Normal End)
The game ends when the **last card is claimed from the card market** — the game
deck is exhausted and the final market card is taken. Complete the current round
so all players have had equal turns, then score.

| Players | Cards in game deck | Cards claimed per player (approx) |
|---------|--------------------|-----------------------------------|
| 2       | 16                 | ~8                                |
| 3       | 16                 | ~5–6                              |
| 4       | 16                 | ~4                                |

### 2. Board Overflow (Immediate End)
If a player sweeps tiles and is unable to place all of them on their 5×5 board
(insufficient empty cells), the game ends immediately. All other players get
exactly **one more turn** each to complete their actions, then final scoring occurs.

The player who triggered the overflow does not get additional turns.

### 3. Market Tiles Exhausted
If all tiles are removed from the 6×6 market board and the tile bag is empty,
the game ends immediately. No further sweeps are possible. Final scoring occurs.

**Tiebreaker:** Most reward cards claimed. If still tied, share the victory.

---

## The Complete Card Catalogue

### Lemon (cards 1–10)

| #  | Name                          | Pattern colours               | Symbols  |
|----|-------------------------------|-------------------------------|----------|
| 1  | Lemon madeleine               | Yellow                        | —        |
| 2  | Tarte au citron               | Yellow, Yellow                | 1× Lemon |
| 3  | Pink grapefruit tartelette    | Pink, Pink                    | 1× Lemon |
| 4  | Orange marmalade slice        | Orange, Orange                | 1× Lemon |
| 5  | Lemon meringue pie            | Yellow, Yellow, Pink          | 2× Lemon |
| 6  | Earl Grey financier           | Blue, Blue, Yellow            | 2× Lemon |
| 7  | Key lime & blueberry tart     | Green, Green, Blue            | 2× Lemon |
| 8  | Blood orange tart             | Orange, Orange, Pink          | 2× Lemon |
| 9  | Yuzu tart                     | Yellow, Yellow, Green, Green  | 3× Lemon |
| 10 | Lime & Earl Grey drizzle cake | Green, Green, Blue, Blue      | 3× Lemon |

### Chocolate (cards 11–20)

| #  | Name                           | Pattern colours                | Symbols  |
|----|--------------------------------|--------------------------------|----------|
| 11 | Chocolate-orange truffle       | Orange                         | —        |
| 12 | Chocolate-cherry tart          | Pink, Pink                     | 1× Choc  |
| 13 | Chocolate-mint truffle         | Green, Green                   | 1× Choc  |
| 14 | Chocolate-hazelnut praliné     | Orange, Orange                 | 1× Choc  |
| 15 | Black Forest gateau            | Pink, Pink, Green              | 2× Choc  |
| 16 | Sachertorte                    | Orange, Orange, Yellow         | 2× Choc  |
| 17 | Pistachio chocolate religieuse | Green, Green, Pink             | 2× Choc  |
| 18 | Chocolate-blueberry tartelette | Blue, Blue, Pink               | 2× Choc  |
| 19 | Opéra cake                     | Yellow, Yellow, Orange, Orange | 3× Choc  |
| 20 | Florentine                     | Orange, Pink, Green, Blue      | 3× Choc  |

### Caramel (cards 21–30)

| #  | Name                       | Pattern colours              | Symbols    |
|----|----------------------------|------------------------------|------------|
| 21 | Crème brûlée               | Yellow                       | —          |
| 22 | Canelé                     | Orange, Orange               | 1× Caramel |
| 23 | Tarte Tatin                | Orange, Green                | 1× Caramel |
| 24 | Crème caramel              | Yellow, Orange               | 1× Caramel |
| 25 | Salted caramel tart        | Orange, Orange, Yellow       | 2× Caramel |
| 26 | Sticky toffee pudding      | Orange, Pink, Pink           | 2× Caramel |
| 27 | Caramel apple charlotte    | Green, Green, Orange         | 2× Caramel |
| 28 | Earl Grey & caramel tart   | Blue, Blue, Yellow           | 2× Caramel |
| 29 | Paris-Brest (blueberry)    | Yellow, Yellow, Orange, Blue | 3× Caramel |
| 30 | Banoffee pie               | Yellow, Yellow, Orange, Pink | 3× Caramel |

### Strawberry (cards 31–40)

| #  | Name                    | Pattern colours           | Symbols   |
|----|-------------------------|---------------------------|-----------|
| 31 | Strawberry tartlet      | Pink                      | —         |
| 32 | Apple turnover          | Green, Green              | 1× Straw  |
| 33 | Blueberry mille-feuille | Blue, Blue                | 1× Straw  |
| 34 | Plum tart               | Blue, Blue                | 1× Straw  |
| 35 | Fraisier                | Pink, Pink, Green         | 2× Straw  |
| 36 | Mixed berry pavlova     | Pink, Blue, Blue          | 2× Straw  |
| 37 | Carrot cake             | Orange, Orange, Green     | 2× Straw  |
| 38 | Blackcurrant cheesecake | Blue, Blue, Pink          | 2× Straw  |
| 39 | Charlotte aux fraises   | Pink, Pink, Yellow, Green | 3× Straw  |
| 40 | Autumn fruit crumble    | Green, Orange, Blue, Pink | 3× Straw  |

### Almond (cards 41–50)

| #  | Name                             | Pattern colours           | Symbols   |
|----|----------------------------------|---------------------------|-----------|
| 41 | Financier                        | Yellow                    | —         |
| 42 | Pistachio macaron                | Green, Green              | 1× Almond |
| 43 | Raspberry & pistachio tart       | Pink, Green               | 1× Almond |
| 44 | Pistachio & blueberry religieuse | Green, Blue               | 1× Almond |
| 45 | Bakewell tart                    | Pink, Pink, Green         | 2× Almond |
| 46 | Galette des Rois                 | Yellow, Yellow, Orange    | 2× Almond |
| 47 | Mont Blanc                       | Pink, Pink, Yellow        | 2× Almond |
| 48 | Blueberry frangipane tart        | Blue, Blue, Yellow        | 2× Almond |
| 49 | Fig & almond tart                | Blue, Blue, Pink, Orange  | 3× Almond |
| 50 | Battenberg                       | Pink, Yellow, Yellow, Pink| 3× Almond |

---

## Key Design Principles

**Engelstein one-way flow:** Tiles swept from market → placed on personal board
→ patterns recognised → card claimed + tile removed to scoring pile →
end-game multiplication. Nothing feeds back upstream.

**The central strategic tension:** Sweeping by colour controls which colours you
collect (for pattern building) but randomises which ingredient symbols you get.
Sweeping by symbol controls your end-game multiplier potential but randomises
the colours you receive. A tile matching both your current pattern need AND a
symbol you're collecting is the prize of each turn. The removal decision at
claiming adds a third layer: which tile do you sacrifice from the pattern?

**Non-mean interaction:** Competition is over market tiles (which colours/symbols
are available) and the card market (racing to build patterns first). No direct
take-that mechanics — you can never directly destroy another player's board.

**The scoring pile as a parallel game:** Players manage two collections
simultaneously — tiles on their board (for future patterns) and tiles in their
scoring pile (for end-game multipliers). These objectives frequently conflict,
which is the strategic heart of the game.

**Visual end state:** At game end, each player's 5×5 board is a spread of
coloured tiles — the afternoon-tea landscape they built. Combined with tucked
reward cards, this tells the story of their tea. The game should look beautiful
on the table throughout play and especially at scoring.

**Cozy positioning:** Sits alongside Calico, Cascadia, Harmonies in the
cozy-tile-placement band — but on the British craft / kawaii / afternoon tea
thematic axis. Targets the same audience that buys Wingspan, Cascadia, and
Calico, with a distinctive visual register.

---

## Visual Design Notes

**Symbol icon style (etched on tiles):**
- Bold solid black filled silhouette, not a line drawing
- No outlines, no shading, no internal detail beyond one or two strong negative-space cuts
- Must read at 20mm size from 80cm viewing distance
- Pictogram style (road sign / app icon grammar)
- Five completely distinct shape grammars to avoid silhouette confusion

**Symbol icon style (full colour, on cards):**
- Same shape language as etched version
- Natural ingredient colours: red strawberry, yellow lemon, brown chocolate, tan/cream almond, golden caramel
- Soft flat shading, minimal shadow, no heavy outlines — kawaii with restraint

**Card layout (confirmed from produced prototype cards):**
- Title in rounded rectangle at top
- Large painterly patisserie illustration centre
- Colour pattern shown as physical tile squares in their exact geometric arrangement, centred below the illustration, within a 2×2 ghost grid
- Ingredient symbol strip along the bottom in a warm tan/caramel-coloured band
- Background: warm cream / off-white

**Card art style:**
- Warm painterly illustration, visible gouache-like brushwork
- Refined kawaii — not babyish, not photorealistic
- Soft palette, warm lighting, vintage tea-room sensibility
- Patisserie shown in isolation on a plain background, slight three-quarter view

---

## Still To Be Resolved

- **2-player balance** — with the 16-card fixed deck, 2-player games may need dedicated playtesting to ensure adequate game length and player interaction
- **Tile colour accuracy on cards** — the rendered card tile colours (Blue appears as mid-teal; Yellow as lime-yellow on the Blueberry frangipane tart) should be confirmed against physical tile colours before print production
- **Score pad design** — the end-game calculation would benefit from a purpose-designed scoring sheet with 5 ingredient columns
- **Box insert design** — tiles need to be accessible by colour/symbol for setup
- **Subtitle** — working title is "Fancy That! A Game of Afternoon Tea"