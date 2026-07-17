---
name: fancy-that-game
description: >
  Complete design reference for "Fancy That!" — an original gateway-weight tile
  placement and patisserie collection game currently in development. Use this
  skill whenever the user asks about this game's design, wants to develop any
  aspect of it further, or references the tile game, the reward cards, the
  sweep mechanic, the cake stand, the personal board, the tart tokens, the
  ingredient symbols, or any component of this design. Also trigger when the
  user wants to design ingredient symbols, patisserie illustrations, scoring
  icons, board layouts, or any other element of this specific game. This skill
  is the authoritative design document — always read it before responding to
  any question about this game.
---

# Fancy That! — Complete Design Document

**Design of record as of 16 July 2026.** This skill consolidates Rule book v2 (24 June 2026) as amended by `DESIGN_UPDATE_2026-07-10.md` (the cake stand) and the 16 July 2026 refinements (card VP 1–4, symbols off cards, flat stand board). Rule book v3 is still pending — when it is written, it should be written from this document.

Open design issues live in `DESIGN_REVIEW_2026-07-10.md`. Historical documents (`SKILL v1.md`, `DESIGN_UPDATE_2026-05-25.md`, `INGREDIENTS_DESIGN_NOTES.md`) describe abandoned designs and are marked as such — do not reason from them.

## Overview

A 2–4 player gateway-weight tile placement and patisserie collection game.

- **Target complexity:** Azul/Cascadia band (BGG ~1.8–2.3)
- **Stated play time:** 45–60 minutes (this overshoots the gateway band — see issue D3)
- **Players:** 2–4, ages 10+

**Theme:** Afternoon tea. Players sweep coloured tiles from a shared market, arrange them into patterns on a personal board, and claim patisserie reward cards. Claiming costs you: you break your own finished pattern, permanently block the vacated cell with a tart token, and plate the sacrificed tile onto your cake stand.

**The hook:** *Serving costs you, and builds your display.* Every claim breaks a pattern you just built, blocks a cell forever, and feeds one tile to a cake stand whose tiers each lock to a single flavour. Five flavours, four tiers — one flavour is always off the menu.

**The name plays on the double meaning of "fancy":**
- *A fancy* = a small decorative cake (fondant fancy, French fancy, fairy cake)
- *Fancy* (adjective) = elaborate, decorative, refined
- *To fancy* (verb) = to like, to want, to take a liking to
- *Fancy that!* = British exclamation of pleased surprise

**Tagline:** "A spot of strategy with your Afternoon Tea"

---

## The two currencies (read this first)

The single most important structural fact about the current design:

- **Colour is the claiming currency.** It lives on tiles and on reward cards. It does nothing else.
- **Ingredient (the tile's symbol) is the scoring currency.** It lives on tiles and on the cake stand. It does nothing else.

Reward cards carry **no ingredient symbols**. Symbols on cards were removed on 16 July 2026 because they conflated the two systems and confused players at the table. The sweep declaration is the one place the two currencies meet: declare a colour to build toward claims, declare an ingredient to stock future stand plates.

---

## Components

### Tiles (100 total)
- 5 colours × 5 ingredient symbols = 25 unique tile types × 4 copies = 100 tiles
- Each tile: a solid colour background + a small etched black ingredient symbol
- Held in a drawstring bag during play
- **22mm square, 9mm thick** (confirmed against printed coupons, July 2026). Older documents say 20mm — that figure is wrong and the 3D stand tolerances depend on 22×22×9.

**The 5 tile colours:** Yellow, Pink, Orange, Green, Blue. These are abstract pattern markers with no in-fiction meaning (as Azul's tiles are just colours).

**The 5 ingredient symbols (locked in):**
1. **Strawberry** — heart shape with leafy crown
2. **Lemon** — lemon slice viewed front-on showing segments
3. **Chocolate** — square divided into a 2×2 grid of cubes
4. **Almond** — pointed teardrop with central seam
5. **Caramel** — wrapped candy with twisted ends

Five distinct shape grammars, chosen so there is no silhouette confusion at 22mm from across a table. Each must read as a black-and-white etched silhouette on tiles and as a full-colour symbol on the cake stand.

**Colour and symbol are orthogonal** — every colour appears with every symbol. This is why the game currently fails colourblind accessibility (issue D5): the symbol cannot disambiguate colour.

### Reward cards (50 total)
Each card shows:
- A patisserie illustration
- A **colour pattern** — 1–4 coloured tile squares arranged in a small shape
- A printed **VP value from 1 to 4**

**VP is judged per pattern**, not derived mechanically from the square count. Two cards with the same number of squares may differ in VP if one pattern is meaningfully harder to build (colour mix, awkward shape). The 1–4 band is the design intent; the per-card assignment is an open task.

Cards carry **no ingredient symbols** and no symbol strip.

**Rotation rule:** any pattern may be matched in any rotation or reflection on your board.

### Personal player boards (4 total)
- 5×5 grid (25 cells)
- Dual-layer recessed boards so tiles slot in
- No pre-printed border in the current design

### Cake stand boards (4 total — one per player)
Four rows of plates in a tiered stand silhouette:

| Row | Plates | Cumulative values printed beneath |
|---|---|---|
| Bottom | 4 | 3 / 6 / 10 / 15 |
| Second | 3 | 3 / 6 / 10 |
| Third | 2 | 3 / 6 |
| Top | 1 | 3 |

10 plates total; maximum stand score 34.

**Two physical lines exist, both live:**

- **Flat printed board — the current playtest component.** `Cake Stand v1.psd`, `pieces\cake_stand_flat_print.svg`, generator `pieces\cake_stand_flat.py`. Zero assembly, so it sidesteps setup time entirely.
- **3D printed vertical display easel — the intended retail form.** A single stepped-cake-silhouette panel raked back ~18°, with open-fronted lipped slots (4/3/2/1) holding tiles **face-out** so the stand reads as a cake display across the table, plus a fold-under kickstand. Cumulative VP values are embossed on the panel beneath each slot — never on tiles. Decoration scheme is twee lace-doily (scalloped pierced rim, fan-lace cutwork, bead swags, rose sprigs). Parametric Blender build scripts live in `3D Print\scripts\`; **current build is `_v5`** (`build_stand_v5.py`). The panel must hug the slots exactly — a compact ziggurat, not full-width tiers.

The flat board keeps playtesting cheap, but note it also makes the setup-time issue (D10) *invisible* in testing while it remains live in the product — and if the flat board plays fine, whether the 3D stand earns its cost at all becomes a real question, since the table presence it buys is the whole of the P2/P3 argument.

### The crumb tray
Any open table space beside the stand. Not a printed component.

### Central market board (1)
- 6×6 grid (36 cells), dual-layer recessed
- 2-player games use only the 5×5 inner area

### Tokens
- **Tart tokens:** 8 per player in the game (2p = 16, 3p = 24, 4p = 32). Shared pool. Physical component count: 32.
- **Cupcake tokens:** 4 per player. Physical component count: 16.
- **Score pad:** simplified or deleted under stand scoring — the stand prints its own values.

---

## Setup

1. Shuffle the 50-card deck. Place the top 4 cards face-up in a row — this is the **card market**.
2. Place all 100 tiles in the bag. Draw tiles and fill every cell of the market board (6×6; 2-player games use the 5×5 inner area).
3. Each player takes a personal 5×5 board, a cake stand board, and 4 cupcake tokens, and clears space beside the stand for the crumb tray.
4. Count out **8 tart tokens per player** into a shared pool (e.g. 24 in a 3-player game).
5. Randomly determine the first player.

---

## Turn structure

Players take turns clockwise. On your turn, perform these steps in order.

### Step 1 — Sweep
- Choose any one row or column on the market board
- Declare either a **colour** or an **ingredient symbol**
- Take all tiles in that row or column matching your declaration
- You must take at least one tile — if nothing in your chosen line matches, choose again
- **Bonus tile:** if your sweep removes the very last tile from that row or column, completely clearing it, immediately take one additional tile from anywhere on the market board — any colour, any symbol. Triggers at most once per turn; does not chain.

### Step 2 — Place tiles
- Place all swept tiles onto your personal 5×5 board, in any empty cells
- **No adjacency requirement**
- All swept tiles must be placed this turn; no holding tiles between turns
- If you cannot place all your tiles, you may not take them from the market

### Step 3 — Claim (optional, maximum 1 per turn)
If tiles on your board form the colour pattern shown on any face-up card in the card market — correct shape and colours, in any rotation or reflection — you may claim it:

1. **Remove exactly one tile** from those that formed the matching pattern. You choose which.
2. **Place a tart token** in the vacated cell. That cell is permanently blocked for the rest of the game.
3. **Plate the removed tile** — place it immediately onto your cake stand or crumb tray (see below).
4. **Take the card** and place it beside your board.
5. **Refill the card market** — draw the top card of the deck face-up, returning the market to 4 cards.

The remaining tiles of the matched pattern stay on your board. Only one claim per turn, even if multiple patterns are complete.

### Step 4 — Refill the market board
Count the tiles remaining on the market board. If **6 or fewer** remain, draw from the bag and refill to 36. In a 2-player game, refill if fewer than 5 remain. If the bag is empty, do not refill — play continues with whatever remains.

### Cupcake tokens (any time on your turn)
Spend a cupcake token to move a tile — **or a tart token** (rule added 16 July 2026) — already on your board to any empty space on your board. Unspent cupcakes are worth 1 VP each at the end.

Tiles already plated on the stand can never move — the cupcake does not reach them. (A proposed "cupcake re-plate" would change this; proposed, not adopted — issue D8.)

---

## The cake stand

When you claim a card and remove a tile from your board, that tile goes **immediately** to one of:

- the **next empty plate** of any one row (rows fill left to right), provided that row is empty or already holds tiles of the **same ingredient symbol** — and, if empty, that no other row already holds that ingredient; or
- the **crumb tray**.

**The crumb tray is always a free choice.** You may send a tile there even when a legal plate is available — typically to avoid locking a row to an ingredient you don't want.

**The first tile placed on a row sets that row's ingredient for the rest of the game.** **An ingredient may only ever appear on one row** (rule clarified 16 July 2026): once any row is locked to an ingredient, that ingredient can never be placed on another row — when its row is full, further tiles of that ingredient can only go to the crumb tray. **Once placed, tiles never move** — plating is permanent.

Five ingredients, four rows: one flavour is always off the menu. Which flavour you abandon, and when each row locks, is the stand's strategic spine. It emerges entirely from component counts — zero extra rules.

---

## Scoring

At the end of the game, add:

- **Each row of your stand** scores the value printed beneath its **last filled plate** (an empty row scores 0)
- **Each crumb-tray tile** scores **1 VP**
- **Each claimed card** scores its **printed value (1–4 VP)**
- **Each unspent cupcake** scores **1 VP**

Highest total wins. **Tiebreaker:** most reward cards claimed. If still tied, share the victory.

There is no multiplication anywhere in scoring. The five per-ingredient multiplications from Rule book v2 were deleted on 10 July 2026 (issue D1).

**Worked example:** Bottom row holds 4 Almond tiles (15). Second row holds 2 Caramel tiles (6). Third row holds 1 Lemon tile (3). Top row empty (0). Two tiles in the crumb tray (2). Six claimed cards printing 2+3+1+4+2+3 (15). One unspent cupcake (1). Total: **42 VP**.

---

## End game

The game ends when **the last tart token is placed**. Complete the current round so every player has had an equal number of turns, then score.

The game also ends **immediately** when a player's board is **completely full of tiles and tarts at the start of their turn** (rule refined 16 July 2026). No further turns are needed for fairness — the turn order has come full circle, so every player has had an equal number of turns; score at once. Separately, if a mid-turn sweep yields more tiles than the player's remaining space, the game ends after every other player takes exactly one more turn.

The shared tart pool is the clock — 8 per player, visibly depleting, readable by everyone. Note that the pool is *shared*, not per-player: a fast claimer can take 10+ sacrifices while a slow player gets 4–5. This claim-rate asymmetry is the residual score-spread risk (logged under D1) — log claim counts per player in playtests.

---

## Design rationale (why the current design is shaped this way)

**Engelstein one-way flow:** tiles → board placement → claim → stand plate → end-game scoring. Nothing feeds back upstream. The stand is a terminal sink.

**The central tension:** colour sweeps build patterns (controlled colour, random ingredients). Ingredient sweeps stock the stand (controlled ingredient, mixed colours). A tile matching both your pattern need AND your row's locked flavour is a prize.

**Why the stand replaced multiplication scoring:** multiplication rewarded focus quadratically and produced blowouts. Stand marginal values run +3/+3/+4/+5 — the concentration premium is real but modest. Four scattered first-plates score 12 against 15 for a full bottom row. On paper: careless play ~21, sharp play ~28, ceiling 34.

**Focus and spread converge:** 8 well-played tiles score ~28 whether mono-ingredient across rows (15+10+3) or spread 4+3+1. The strategy is about *reliability of supply from a shared market*, not archetype choice.

**Commitment with a cushion:** permanence makes each plate a bet (Lost Cities-style promise), while cumulative partial credit means a stranded row still pays 3/6/10 — no all-or-nothing cliff.

**Scoring is public and physical:** stands fill visibly with printed values. Mid-game standings are readable across the table; end scoring is four numbers per player plus crumbs plus card VP.

**Non-mean interaction:** you can never directly destroy another player's progress. Competition is over market state and the race to claim cards.

**Table presence:** the cake stand is a signature component no shelf neighbour has, and it makes the hook visible in a 30-second demo rather than merely explainable.

**Positioning:** the cozy tile-placement band alongside Calico, Cascadia, Harmonies — but on the British craft / afternoon tea axis. Premium-component family box ($35–60, the Azul/Harmonies shelf). Publisher targets under consideration: Next Move, Libellud, Flatout/AEG, Blue Orange.

---

## Visual design notes

For any image generation, read the **fancy-that-art** skill — the house style is built from locked-in phrasing.

**Ingredient symbols etched on tiles:** bold solid black filled silhouette, no outlines, no shading, no internal detail beyond one or two strong negative-space cuts. Pictogram register — road sign, not illustration. Must read at 22mm from 80cm.

**Ingredient symbols in full colour (cake stand row markers, player aids):** same shape language, natural ingredient colours (red strawberry, yellow lemon, brown chocolate, tan almond, golden caramel), soft flat shading, minimal shadow, no heavy outlines.

**Card art:** painterly refined kawaii, cozy British tearoom, Beatrix Potter watercolour crossed with modern cookbook illustration. Never babyish, never glossy.

---

## Still to be designed

- **VP assignment per card** (1–4) across all 50 cards, judged by pattern difficulty
- **Colour pattern assignment** per card, and the distribution of pattern complexity across the deck
- Final colour palette values for Yellow/Pink/Orange/Green/Blue within the cozy tearoom system
- Cake stand board layout and print (flat prototype exists; retail form undecided)
- Whether the score pad survives at all
- Colourblind redundancy scheme (issue D5 — a brand requirement for parts of the target shelf)
- Between-game variance module — the tier-card draft is the live candidate (issue D2)
- Playtime trim into the ≤45-minute band (issue D3)
- Box insert design
- Subtitle confirmation

## Proposed but NOT adopted

- **Cupcake re-plate** — spend a cupcake to move a stand tile, or crumb tray → stand (D8 candidate)
- **Widening card VP to 1–5** if playtests show cards reading as mere tickets to a sacrifice (the stand is currently ~⅔ of a typical score)
- **Bonuses:** "Perfect Service" for a full stand; "all four rows different ingredients"
- **Tier-card draft module** — per-game variable row cards with printed constraints/bonuses, so different players want different ingredients (D2 candidate)

## Abandoned (do not resurrect without reading the history)

- **Ingredient symbols on cards + per-ingredient multiplication scoring** (Rule book v2; deleted 10 July 2026 — quadratic spreads, opacity, colour/symbol conflation)
- **Ingredient tracks on the player board** (9 May design)
- **The perspective rule** — cards read from each player's seated position (9 May design; superseded by the rotation/reflection rule)
- **Kawaii patisserie figures** as rule-bearing components (9 May design; table-presence gold but couldn't carry rules weight — a deluxe-edition upsell candidate)
- **Pixel-art colour-by-numbers board + ingredient-list recipe cards** (`DESIGN_UPDATE_2026-05-25.md`; never adopted)
- **Side B asymmetric player boards** (9 May design)
