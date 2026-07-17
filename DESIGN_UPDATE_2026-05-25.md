# Fancy That! — Design Update (May 25, 2026)

## Overview of Changes

Following playtest feedback (May 24, 2026), the game has been significantly simplified. The core feedback was that the tile placement, card matching, and track advancement felt like "three separate games" for a gateway-weight title. 

**New design philosophy:** Theme and mechanics are now integrated. Players are baking patisseries (recipe cards) and presenting them on a cake stand (pixel-art board).

---

## Major System Changes

### 1. Player Board System — REDESIGNED

**OLD:** 5×5 grid with pre-printed coloured border. Players place tiles adjacently to form 2×2 colour patterns.

**NEW:** 6×6 grid with unique pixel-art pattern (like colour-by-numbers). No adjacency rules.

- Each player has ONE personal 6×6 board
- Board shows a recognizable pixel-art image (teapot, teacup, cake stand, pastry plate, etc.)
- Each cell has a single colour printed on it
- Players place tiles to match the exact colour of each cell
- **No adjacency requirement** — tiles can be placed anywhere on the board as long as colour matches

**Visual end-state:** A completed pixel-art picture unique to each player.

---

### 2. Card System — SIMPLIFIED

**OLD:** Cards showed 3×2 colour patterns. Players matched tiles against card patterns to claim cards.

**NEW:** Cards show ingredient lists only. No colour patterns on cards.

- Each card lists 2–4 required ingredients (e.g., "3 Almonds, 1 Chocolate")
- Players collect tiles matching those ingredients from the market
- When all ingredients are collected, the card is claimed
- Card shows flat VP value (e.g., 5 points, 3 points, 7 points)

**Card claiming is now purely ingredient-matching, not spatial pattern-matching.**

---

### 3. Two-Stage Tile Placement

**Stage 1: Recipe Cards (Ingredient Assembly)**
1. Player sweeps tiles from market (declare colour OR ingredient, take consecutive matching tiles in one direction)
2. Player places tiles directly onto their claimed recipe card, matching the ingredient list
3. When recipe is complete (all required ingredients placed), card is claimed and player receives its VP

**Stage 2: Pixel-Art Board (Presentation)**
1. Player transfers tiles from the claimed card to their personal 6×6 board
2. Places each tile in a cell matching its colour
3. Progression toward game end: when all 36 cells are filled, board is complete

**Thematic narrative:** Gather ingredients → bake patisserie (claim card) → present on cake stand (board placement).

---

### 4. Game End Condition — NEW

**OLD:** Game ended when the last patisserie figure was claimed.

**NEW:** Game ends when the first player completes their 6×6 pixel-art board.

- Completing the board = filling all 36 cells with tiles matching the pattern colours
- That player scores a **first-place bonus** (amount TBD, suggest +10 VP or similar)
- All remaining players complete their current turn, then scoring begins
- Other players score based on whatever portion of their board they've filled + card VPs + cupcakes - penalties

---

### 5. Scoring System — MAJOR SIMPLIFICATION

**REMOVED:**
- Ingredient tracks (the 5 visible tracks on the player board)
- Symbol-based scoring (no symbols on cards, no symbols on kept tiles)
- Symbol multiplication (card symbols × kept tile symbols)
- Pattern completion bonuses

**KEPT:**
- Flat VP per card (assigned at design time based on card balance)
- Cupcake system (start with 5, -1 per dropped tile, 1 VP per remaining cupcake)
- Dropped tile penalty (-1 VP per unplaced tile)

**End-Game Scoring Formula:**
```
Total VP = Sum of claimed card VPs 
         + First-place bonus (if applicable)
         + Remaining cupcakes (1 VP each)
         - Dropped tiles penalty (1 VP per unplaced tile)
```

---

### 6. Removed Mechanics

- **Adjacency placement rules** — tiles can go anywhere on the board as long as colour matches
- **Perspective rule** — all players read cards the same way; no "your orientation" rule
- **Ingredient tracks** — no longer needed; ingredient selection happens only during sweep phase
- **Personal board asymmetric variants (Side B)** — simplify to single board design for now
- **Pre-printed border on boards** — boards are pure 6×6 grids with pixel-art patterns
- **"Keep 1 tile per card" system** — tiles are placed on board immediately after claiming card

---

### 7. Tile Placement on Cards

When a recipe card is completed:
- **Option A (Simpler):** All tiles from the card are immediately transferred to the board
- **Option B (More flexible):** Player chooses which tiles to keep; unused tiles become dropped tiles (cost 1 cupcake each)

**Recommend Option A for initial implementation** — simpler rules.

---

### 8. Dropped Tiles

**OLD:** Triangular penalty (-1, -2, -3...) and a dedicated "dropped tiles" card on the personal board.

**NEW:** Simple flat penalty.

- Any tile that doesn't match a cell colour on the player's board goes to "dropped tiles"
- Each dropped tile = -1 VP at end-game
- Each dropped tile also costs 1 cupcake immediately

---

### 9. Pixel-Art Board Designs

Each player receives a unique 6×6 board with a recognizable pixel-art pattern:

**Example design (Tiered Cake Stand):**
```
Caramel Caramel  Strawberry Strawberry Strawberry Strawberry
Caramel Strawberry Strawberry Lemon Lemon Strawberry
Strawberry Strawberry Lemon Lemon Lemon Strawberry
Chocolate Chocolate Almond Almond Almond Chocolate
Chocolate Chocolate Almond Almond Almond Chocolate
Caramel Caramel Caramel Caramel Caramel Almond
```

**Colour distribution:** Roughly 7–9 cells per colour (36 cells ÷ 5 colours ≈ 7.2 each).

**Thematic options for 5 unique designs:**
- Teapot
- Teacup and saucer
- Tiered cake stand (as above)
- Plate of pastries
- Sugar bowl / milk jug

---

### 10. Recipe Card Design

**Format:**
- Card title (e.g., "Lemon Drizzle Slice")
- 2–4 required ingredients with quantities (e.g., "2 Lemon, 1 Almond, 1 Chocolate")
- VP value (flat points, e.g., 3, 5, 7)
- Optional illustration/flavour text

**Removed from cards:**
- Colour patterns
- Symbol strips
- Position variants

---

## What Stays the Same

- **5 ingredient types:** Strawberry, Lemon, Chocolate, Almond, Caramel
- **5 colours (one per ingredient):** Red, Yellow, Brown, Tan, Gold
- **Cupcake currency:** 5 starting, -1 per dropped tile, 1 VP each at end
- **Tile sweeps:** Declare colour or ingredient, take consecutive matching tiles in one direction
- **Tile bag:** 100 tiles (5 colours × 5 ingredients = 25 unique types × 4 copies)
- **Market refill:** When 3+ lines are empty, refill trigger fires (player takes 2 bonus tiles)
- **2–4 player support:** Scaled by patisserie count (2 cards per player)

---

## Code Changes Checklist

### Player Board
- [ ] Replace 5×5 adjacency-based board with 6×6 colour-matching board
- [ ] Remove border tracking
- [ ] Remove adjacency validation logic
- [ ] Add pixel-art pattern data (6×6 colour grid per board variant)
- [ ] Simplify placement validation (just check: does tile colour match cell colour?)

### Card System
- [ ] Remove 3×2 pattern grid from cards
- [ ] Add ingredient list to cards (2–4 ingredients)
- [ ] Add flat VP value to cards
- [ ] Remove symbol strip / symbol data from cards
- [ ] Simplify card claiming (ingredient matching, not pattern matching)

### Scoring
- [ ] Remove ingredient track system entirely
- [ ] Remove symbol scoring / multiplication logic
- [ ] Implement flat-card-VP scoring
- [ ] Add first-place bonus (board completion)
- [ ] Simplify end-game calculation (card VPs + bonus + cupcakes - drops)

### Game End
- [ ] Change end trigger from "last figure claimed" to "first board completed"
- [ ] Add board completion check (all 36 cells filled)
- [ ] Ensure other players can finish their current turn

### Tiles & Placement
- [ ] Simplify tile placement validation (remove adjacency)
- [ ] Update dropped-tile logic (any unplaced tile = -1 VP)
- [ ] Confirm dropped-tile cost (1 cupcake per drop)

### UI/UX
- [ ] Update board display to show pixel-art pattern
- [ ] Add visual indication of board completion progress (% filled)
- [ ] Simplify card display (remove pattern grid, show ingredient list)
- [ ] Highlight first-place bonus announcement at game end

---

## Questions / TBD

1. **First-place bonus amount:** How many VP? Suggest +10, but balance TBD.
2. **Tile transfer mechanics:** Option A (all tiles auto-transfer) vs. Option B (player chooses)?
3. **Board variant count:** How many unique 6×6 pixel-art designs? (5 recommended, one per player count variant or aesthetic theme)
4. **Card balance:** What VP values per card? (Currently no data; balance in playtesting)
5. **Cupcake earning:** Any way to earn cupcakes during play, or just the starting 5?

---

## Summary of Player Experience

**Before:** Complex pattern-matching on board, recipe gathering, track advancement. Felt like three separate games.

**After:** Clear two-phase experience.
1. **Gather ingredients** (recipe cards) — simple ingredient matching
2. **Present them** (pixel-art board) — satisfying colour-matching puzzle with visual payoff
3. **Race to finish first** — clear win condition, exciting climax

**Theme is now integrated into mechanics:** You're baking and presenting, not just moving abstract tokens.
