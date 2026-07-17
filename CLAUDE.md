# Fancy That! — Board Game Engine

## What this project is
A 100% JavaScript engine for the 2–4 player gateway tile-placement game
"Fancy That!" by Dean Morris. Pure JS — no Python, no server, no build step.
Runs in the browser (watch/play mode) and headlessly via Node (simulation mode).

**The authoritative design document is the `fancy-that-game` skill**
(`.claude/skills/fancy-that-game/skill.md`, synced from the design project at
`Cardboard\Fancy That\.claude\skills\fancy-that-game\Skill.md`). Read it before
reasoning about rules. This file carries only the build-relevant summary and the
implementation's known divergences.

## Architecture
- src/engine/game.js       — pure game logic (no DOM references ever)
- src/engine/tiles.js      — GENERATED from reward_cards.csv by generateCardsFromCSV.js; card data, tile bag, constants
- src/engine/statsCollector.js — simulation statistics
- src/bots/basicBot.js     — shared heuristic brain (sweep/place/claim/destination); other bots import from it
- src/bots/mctsBot.js      — MCTS bot (difficulties mcts-1..4), uses basicBot for rollouts
- src/bots/fastBot.js      — cheap heuristic bot used by the simulator
- src/bots/randomBot.js    — random placement helper
- src/ui/board.js          — DOM rendering (the ONLY file that touches the DOM)
- src/ui/main.js           — game-flow orchestration for the browser
- simulate.js              — Node headless runner (`node simulate.js`)
- generateCardsFromCSV.js  — regenerates src/engine/tiles.js from reward_cards.csv (cp1252 — read as latin1)
- index.html + style.css   — browser entry point

CRITICAL: game.js and bots must be pure (zero DOM). board.js is the only file
that touches the DOM.

## Rules summary (as built — design of record 16 July 2026)

**Two currencies, never conflated:** colour is the claiming currency (tiles +
cards); ingredient is the scoring currency (tiles + cake stand). Cards carry NO
ingredient symbols. A card's `family` field is cosmetic only — it must never
affect scoring or legality.

- **Tiles:** 5 colours × 5 ingredients × 4 copies = 100. Market board 6×6
  (2p uses 5×5). Refill from bag when ≤6 tiles remain (2p: ≤5).
- **Turn:** sweep a row/column declaring a colour OR ingredient (take all
  matches, ≥1; clearing the line grants 1 bonus tile from anywhere, once, no
  chain) → place all swept tiles anywhere on your 5×5 board → optional cupcake
  move (1 tile OR 1 tart token, once per turn, costs 1 of your 4 cupcakes) →
  optional claim (max 1) → refill market.
- **Claim:** board tiles match a market card's colour pattern in any rotation/
  reflection → remove exactly 1 pattern tile, the vacated cell is permanently
  blocked (tart token), place the removed tile on your cake stand or crumb
  tray, take the card, refill the card market to 4.
- **Cake stand:** 4 rows, capacities 4/3/2/1 (bottom→top), cumulative values
  `ROW_VALUES = [3,6,10,15]` truncated per row (max 34). First tile on a row
  locks it to that ingredient forever; **one row per ingredient** — once an
  ingredient is locked to any row it can never be placed on another, so when
  its row is full further tiles of that ingredient can only crumb; tiles never
  move once plated; the crumb tray (1 VP/tile) is ALWAYS a legal choice, never
  an auto-fallback.
- **Scoring:** stand row values (value under last filled plate) + 1/crumb +
  printed card VP (1–4; deck of 50 totals 119) + 1/unspent cupcake. NO
  multiplication anywhere. Tiebreak: most cards claimed, then shared victory.
- **End:** three ways. (1) The tart pool runs out — 8 claims × player count
  (`cardsNeededToEnd` = 16/24/32). (2) A player's board is completely full
  (tiles + tarts) at the START of their turn → game ends IMMEDIATELY
  (`boardFull`, checked in refill's turn rotation; fair because the turn order
  has come full circle). (3) A mid-turn sweep yields more tiles than the
  player's remaining space → every other player gets exactly one more turn
  (`boardOverflow`, checked on entry to the place phase). Rules confirmed
  16 July 2026.

## Known implementation divergences from the design of record
Deliberate or pending decisions — keep this list honest when touching the code:

1. **Final round:** tabletop rule completes the round so all players get equal
   turns after the last tart; the engine ends immediately when the last claim
   happens. Affects seat fairness in simulations.
2. **2p refill threshold:** design says "fewer than 5" (≤4); engine uses ≤5.
3. **Cupcake timing:** design says "any time on your turn"; engine restricts to
   a move phase between place and claim, once per turn.

## Working notes
- `reward_cards.csv` is cp1252-encoded (é/û in card names) — always read with
  latin1, never utf-8. tiles.js is generated; never hand-edit it.
- Bot claim decisions return `{cardId, removedBoardIndex, destination}`;
  `claim()` requires the destination argument and throws without it.
- `simulate.js` prints score/stand/crumb/end-reason reports. Bots were
  overhauled 17 July 2026: pattern-aware placement via `getPatternWindows`
  (game.js), window-demand sweep/bonus ranking (`rankSweeps`/`rankBonusTiles`),
  and a cupcake-move heuristic (`decideMove`). Basic bot now claims ~6.5
  cards/player in 2p (was ~2); mcts-2 beats basic ~47 vs 32 pts. NOTE:
  `place()` pairs placements[i] with pendingSweepTiles[i] BY INDEX — any bot
  that reorders tiles must keep placements aligned to the original order.
