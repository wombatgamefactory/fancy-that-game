# Fancy That! — Implementation Plan: New Scoring (Cake Stand + Flat VP)

**Source spec:** `build-changes-2026-07-16.md`
**Goal:** Replace multiplication scoring with cake-stand + flat card VP, end to end (data → engine → bots → UI → docs → simulation).

Work through the phases in order. Each phase ends with a verification step so we never carry a broken layer forward.

> **STATUS (16 July 2026): ALL 6 PHASES COMPLETE.** Implemented by Opus subagents, independently verified per phase. Results: `simulation-results-2026-07-16.md`. Outstanding: human click-through of the browser claim flow; bot placement strength is the blocking dependency for trustworthy balance data (bots reach ~1.9 claims/player vs the designed 8); nothing committed yet. Extra fixes beyond the plan: engine end-game stall when market+bag empty during a board-overflow finale; MCTS applyAction ignored its chosen claim action; simulate.js bonus-tile sub-phase stall.

---

## 0. Decisions — resolved with Dean, 16 July 2026

| #   | Question | Decision | Evidence |
| --- | -------- | -------- | -------- |
| D1  | **Which card data is authoritative?** | **CSV — confirmed.** 50 cards, VP 1–4, 119 total, matching the doc's distribution table. The updated `images/reward_card_layout.png` (16 July) agrees with the CSV on every spot-checked VP. | CSV + new layout PNG agree |
| D2  | **Ingredient symbols on cards?** | **None — confirmed.** The new layout PNG shows colour patterns + a VP wreath badge, no symbol strip. `images/reward_card_layout_ingredients.png` (dated 25 May) belongs to the never-adopted `DESIGN_UPDATE_2026-05-25.md` design — ignore it; consider archiving/deleting both stale files to prevent future confusion. | build-changes change #3 + new PNG |
| D3  | **Cupcakes 4 or 5?** Code says 5, design of record says 4. | **4.** | Dean, interview |
| D4  | **Bot depth this pass?** | **Shared core + crumb-aware MCTS.** basicBot gets the doc's baseline plate policy; MCTS explores plate-vs-crumb as tree actions so simulation can answer the D11 automatism question. Empty `greedyBot.js` is deleted. | Dean, interview |

**Pixel-art: eliminated (16 July).** Dean deprecated the pixel-art work. The WIP stash is dropped, `src/engine/game.js.backup` deleted, and the work now lives on branch **`cake-stand-scoring`** (created from `main`/`pixel-art`, which were identical). The untracked `images/pixel_board_*.png` files remain on disk — delete whenever convenient.

---

## Phase 1 — Data layer: CSV → `tiles.js`

**Files:** `generateCardsFromCSV.js`, `src/engine/tiles.js` (generated), `reward_cards.csv` (read-only input)

- [ ] 1.1 `generateCardsFromCSV.js`: read the CSV with **`latin1` encoding**, not `utf-8` — the file is cp1252 and card names carry `é`/`û` ("Chocolate-hazelnut praliné", "Crème brûlée"). Node has no cp1252 codec; latin1 is byte-identical for every character these names use. Current utf-8 read produces `�` (visible in tiles.js today — it happens to already be correct there only because it was generated from an older UTF-8 CSV).
- [ ] 1.2 Emit `vp` from CSV column `vp` (already populated 1–4 for all 50 cards). Drop `symbolCount` (currently derived from column `score`).
- [ ] 1.3 Rename the card's `ingredient` field to **`family`** (doc's suggestion, adopted — it prevents anyone wiring flavour back into scoring). Tile objects keep `ingredient`; that one is mechanically live (stand row locks).
- [ ] 1.4 Update the generated header comment (also fix the stale "400 tiles" claim — the bag is 25 types × 4 = 100).
- [ ] 1.5 Run the generator; eyeball `tiles.js`: 50 cards, accented names intact, every card has `vp` 1–4, no `symbolCount` anywhere.
- [ ] 1.6 **Verify:** quick node one-liner — assert card count 50, `sum(vp) === 119`, VP histogram matches the doc's table (5/15+16/4/10 across 1/2/3/4).

Patterns need no work: the CSV's 3×2 grids are already what `getPatternMatches` consumes.

---

## Phase 2 — Engine: `src/engine/game.js`

### 2.1 Player state (`createGame`, ~line 16)
- [ ] Remove `scoringPile: []`.
- [ ] Add:
  ```js
  stand: [
    { capacity: 4, ingredient: null, tiles: [] },  // bottom row
    { capacity: 3, ingredient: null, tiles: [] },
    { capacity: 2, ingredient: null, tiles: [] },
    { capacity: 1, ingredient: null, tiles: [] },  // top row
  ],
  crumbTray: [],
  ```
- [ ] `cupcakes: 5` → `cupcakes: 4` (decision D3).
- [ ] Export `const ROW_VALUES = [3, 6, 10, 15];` — every row shares the same cumulative prefix, truncated by capacity: `row.tiles.length ? ROW_VALUES[row.tiles.length - 1] : 0`.

### 2.2 `getLegalDestinations(player, tile)` — new export
Returns `[{type:'crumb'}, ...{type:'row', rowIndex}]`. Row is legal iff `tiles.length < capacity && (ingredient === null || ingredient === tile.ingredient)`. **Crumb is always included** — it is a real decision, never a fallback (spec is emphatic).

### 2.3 `claim()` (~line 196) gains a destination argument
```js
claim(gameState, cardId, removedBoardIndex, destination)
// destination = { type: 'row', rowIndex: 0..3 } | { type: 'crumb' }
```
- [ ] Validate destination via the same rule as `getLegalDestinations`; throw on an illegal row.
- [ ] Row placement: push tile; if `row.ingredient === null`, set it to `removedTile.ingredient` (permanent lock).
- [ ] Crumb: `player.crumbTray.push(removedTile)`.
- [ ] Everything else in claim (tart block `{type:'blocked'}`, card market refill, stats) is untouched.
- [ ] Update all three call sites in Phase 3/4 (`main.js:124`, `main.js:266`, `simulate.js:52`) — no back-compat shim; a missing destination should throw loudly.

### 2.4 `calculateFinalScores()` (~line 524) — full replacement
```js
export function calculateFinalScores(gameState) {
  for (const player of gameState.players) {
    let score = 0;
    for (const row of player.stand) {
      score += row.tiles.length ? ROW_VALUES[row.tiles.length - 1] : 0;
    }
    score += player.crumbTray.length;                       // Surplus: 1 point each
    for (const cardId of player.claimedCards) {
      score += REWARD_CARDS.find(c => c.id === cardId).vp;
    }
    score += player.cupcakes;
    player.score = score;
  }
}
```
The `INGREDIENTS` import may become unused in game.js — keep the re-export (bots use it) but drop dead usages.

### 2.5 Housekeeping comments (doc's divergences #2 and #3)
- [ ] Comment `endGameReason: 'boardOverflow'` as an implementation safety valve not present in the tabletop rules.
- [ ] Comment `TOTAL_GAME_CARDS`/`cardsNeededToEnd` as `8 tarts × player count` — the "last tart placed" end condition in disguise, and the live playtime tuning lever.

### 2.6 Verify
- [ ] Hand-check the doc's worked example: stand 4/2/1/0 tiles → 15+6+3+0, +2 crumbs, +15 card VP, +1 cupcake = **42**.
- [ ] Max stand = 34 when full.
- [ ] Attempting to plate a mismatched ingredient onto a locked row throws; crumb never throws.

---

## Phase 3 — Bots (`src/bots/`)

The doc calls this "the largest job, and the easiest to underestimate." The old brain — hoard one ingredient to pump a multiplier — is now actively wrong (concentration pays only +3/+3/+4/+5), and every bot faces a brand-new decision: **where to plate**.

### 3.1 `basicBot.js` — the shared brain (mctsBot imports from it)
- [ ] **New helper `decideDestination(player, tile)`** implementing the doc's baseline policy:
  1. A locked row matching `tile.ingredient` with space → extend it (prefer the row closest to completion — marginal value +3/+4/+5).
  2. Else, an empty row → lock it **only with supply confidence**: count that ingredient on the player's own board (future sacrifices come from there); lock the largest free row if board count ≥ ~2, smallest otherwise.
  3. Else → crumb. Also crumb when the only free rows are "too big to waste" and supply confidence is low.
- [ ] **`decideSweep` rewrite:** drop `ingredientSymbols`/multiplier trajectory. New value signal: colour sweeps score by pattern progress toward market cards (weight by card `vp`, not `symbolCount`); ingredient sweeps score by stand trajectory (tiles matching locked, unfilled rows).
- [ ] **`decideClaim` rewrite:** rank claimable cards by `vp` (was `symbolCount`). Tile-removal choice: prefer removing a tile whose ingredient extends a locked row (stand marginal value), penalise breaking colours still needed for market patterns (keep that existing logic). Return `{ cardId, removedBoardIndex, destination }`.
- [ ] `decideBonusTile` / `decidePlacements`: swap `symbolCount` weights for `vp`; placement logic otherwise stands.

### 3.2 `mctsBot.js`
- [ ] `cloneState`: deep-copy the new state — `stand: p.stand.map(r => ({...r, tiles: [...r.tiles]})), crumbTray: [...p.crumbTray]` (replacing `scoringPile`). **Miss this and MCTS corrupts real game state.**
- [ ] `getActionsForPhase` claim phase: actions become `{cardId, destination}` pairs — for each claimable card, one action per legal destination (≤5). This is what makes the bot *able to learn the crumb play*; do **not** collapse to auto-best-plate.
- [ ] `applyAction` claim branch: use the action's own card+destination (currently it oddly re-runs `greedyClaim` and ignores the chosen card — fix while here), with `removedBoardIndex` from the greedy removal heuristic.
- [ ] `evaluateState` rewrite: committed = stand row values + crumbs + Σ card `vp` + cupcakes (i.e. mirror `calculateFinalScores` on the live state); progress = pattern proximity weighted by card `vp`; trajectory = board tiles matching locked-but-unfilled rows. Opponent committed likewise.
- [ ] `ingredientPlacements` strategy: retarget from "highest claimed symbols" to "ingredients of locked, unfilled stand rows".
- [ ] Rollouts: `greedyClaim` now returns a destination, so rollouts inherit the crumb-aware policy automatically.

### 3.3 `fastBot.js`
- [ ] Same claim-signature change; import `decideDestination` from basicBot. Its sweep/placement logic has no symbol maths — light touch.

### 3.4 `randomBot.js`
- [ ] Only board-placement helper — likely no change; confirm nothing references removed state. (Its `decideClaim`-style logic lives in fastBot.)

### 3.5 `greedyBot.js`
- [ ] Empty file — **delete it**, and fix the doc-vs-reality naming: mctsBot's `greedyClaim` etc. are aliases of basicBot exports.

### 3.6 Verify
- [ ] `node simulate.js` (or its usual invocation) completes a full 2p and 4p game with every bot pairing, no throws.
- [ ] Spot-check a game log: at least one crumb placement occurs across a batch of games; stands never exceed capacity; locked rows never mix ingredients.

---

## Phase 4 — UI (`src/ui/board.js`, `src/ui/main.js`)

### 4.1 Claim flow gains a destination step (`main.js`)
- [ ] Human claim (`main.js:124`): after tile-removal selection, present destination choice — highlight legal rows + crumb tray; both choices commit as one `claim()` call. Crumb must be selectable even when plates are legal.
- [ ] AI claim (`main.js:266`): pass `claimDecision.destination` through.

### 4.2 Stand rendering (`board.js`)
- [ ] Render each player's stand: 4 rows of 4/3/2/1 plates (bottom→top), cumulative values **3/6/10/15** printed under plates (truncated per row), locked ingredient shown per row, crumb tray with count ("Surplus: 1 point" per the component art — see `images/cake-stand.png` for the physical layout).
- [ ] **Opponents' stands stay visible** — public readability is the point of the redesign. Not collapsed, not hover-only.
- [ ] Replace the scoring-pile panel and both symbol-maths score summaries (`board.js:~362`, `~1141`) with stand + crumb + card-VP breakdowns; fix the stats table cell at `board.js:1502` (`${p.scoringPile} tiles` — interpolates an array today).
- [ ] Card rendering: drop the symbol strip; add a **VP badge (1–4)**. Card `family` drives art/grouping only.

### 4.3 Verify
- [ ] Play a browser game vs a bot: claim → pick tile → pick destination (including deliberately crumbing with a legal plate available); watch locks appear; end-game score panel matches a hand-computed total.

---

## Phase 5 — Docs

- [ ] Regenerate `CLAUDE.md` from the rewritten design-of-record skill (`Cardboard\Fancy That\.claude\skills\fancy-that-game\Skill.md`) — the current copy still teaches multiplication scoring and `symbol = tiles − 1`.
- [ ] Same treatment for the repo's local copy `.claude/skills/fancy-that-game/skill.md`.
- [ ] Note the D3 cupcake resolution (4) and the boardOverflow safety-valve comment in whichever doc carries implementation notes.

---

## Phase 6 — Simulation: earn the data the tabletop can't

- [ ] `statsCollector`/`simulate.js`: log **claim counts per player alongside final scores** — claim-rate asymmetry is the suspected residual spread driver now that card VP scales linearly with claims.
- [ ] Run a few thousand games per player count. Report:
  - **Score spread (design issue D1):** does careless ~21 / sharp ~28 / ceiling 34 (stand only) hold? Distribution of total scores and win margins.
  - **Stand automatism (design issue D11):** pit the crumb-aware bot against a never-crumbs variant (trivially derivable by filtering destinations). If they score the same, the stand's decisions live at lock time only — design finding, not code bug.
  - **Card-vs-stand balance:** card VP per player vs stand score per player (expected roughly 16–20 vs ≤34).
- [ ] Write results into a short `simulation-results-<date>.md` for the design project.

---

## Explicitly NOT in scope (doc's "do not implement")

- Cupcake re-plate / promoting crumbs to plates — cupcakes still cannot touch the stand.
- VP band widening to 1–5, and the four high-VP "celebration" cards seen in the stale `reward_card_layout_ingredients.png` (25 May design, never adopted).
- Perfect Service / four-flavour bonuses.
- Tier-card draft module.
- Sweep, board, pattern matching, tart blocking, market sizes/refill, card market of 4, one claim per turn — all unchanged.
