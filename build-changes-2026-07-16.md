# Fancy That! — Build Changes for the JavaScript Implementation

**Date:** 16 July 2026
**Audience:** the `fancy-that-game` JS project (`Cardboard\github\fancy-that-game`)
**Design of record:** the `fancy-that-game` skill in the design project (`Cardboard\Fancy That\.claude\skills\fancy-that-game\Skill.md`), rewritten 16 July 2026
**Supersedes for build purposes:** `CLAUDE.md` in the JS repo (describes multiplication scoring — now wrong), `DESIGN_UPDATE_2026-05-25.md` (never adopted), `RULES_SUMMARY.txt` (stale)

---

## TL;DR — the four changes

1. **Scoring is no longer multiplication.** The five per-ingredient multiplications are deleted outright.
2. **Cards carry a flat 1–4 VP.** The VP is already in `reward_cards.csv` (column `vp`) — it does not need to be invented.
3. **Cards have no ingredient symbols.** `symbolCount` is dead. `card.ingredient` is now flavour only, with no mechanical effect.
4. **A new component: the cake stand.** Sacrificed tiles are no longer a flat `scoringPile` — they are placed onto a 4-row stand with ingredient-locked rows, or onto a crumb tray.

The sweep, the board, pattern matching, tart blocking, and the end condition are **unchanged**. This is a scoring-layer change, not a core-loop change — but it is invasive, because the bots evaluate positions using the scoring function.

---

## Why these changes were made

Useful context for judging edge cases:

- **Multiplication had to go** because it rewarded focus quadratically and produced blowout scores — a focused player would lap a spread player, and losing never felt close.
- **Symbols came off the cards** because they *confused players at the table*, not merely because they were redundant. Cards used colour (the claiming currency) and ingredient (the scoring currency) simultaneously, and players conflated the two.
- **The clean split now is:** colour is the claiming currency and lives on tiles + cards. Ingredient is the scoring currency and lives on tiles + the stand. The sweep declaration is the only place they meet.

If you hit an ambiguity, resolve it in the direction that keeps those two currencies separate.

---

## The new rules in full

### Reward cards

Each card shows a patisserie illustration, a **colour pattern** (1–4 coloured squares in a small shape), and a printed **VP value from 1 to 4**.

VP is **judged per pattern by difficulty — not derived from the square count.** Do not compute it. The deck's real distribution proves the point:

| Pattern squares | VP awarded | Cards |
|---|---|---|
| 2 | 1 | 5 |
| 3 | 2 | 15 |
| 4 | 2 | 16 |
| 4 | 3 | 4 |
| 4 | 4 | 10 |

Total card VP available in the 50-card deck: **119**. Note the 4-square cards spread across 2, 3 and 4 VP — same size, different difficulty.

No card scores 0. Cards carry no ingredient symbols and no symbol strip.

Claiming, rotation and reflection matching are all unchanged.

### The cake stand (new)

Each player has a cake stand of four rows:

| Row | Plates | Cumulative values |
|---|---|---|
| Bottom | 4 | 3 / 6 / 10 / 15 |
| Second | 3 | 3 / 6 / 10 |
| Third | 2 | 3 / 6 |
| Top | 1 | 3 |

10 plates total. Maximum stand score **34**.

**When a card is claimed and a tile removed from the board, that tile goes immediately to either:**

- the **next empty plate of any one row** (rows fill left to right), if that row is empty *or* already holds tiles of the **same ingredient**; or
- the **crumb tray**.

**Rules that matter for implementation:**

- The first tile on a row **locks that row's ingredient permanently**.
- Two rows may share an ingredient.
- **Tiles never move once placed.** Cupcakes cannot reach them.
- **The crumb tray is always a legal choice**, even when a legal plate exists. This is not a fallback for unplaceable tiles — it is a real decision, usually taken to avoid locking a row to an unwanted ingredient. **Do not implement it as an automatic fallback.** If you auto-place whenever a legal plate exists, you delete one of the stand's only two decisions and the bots will never learn the crumb play.
- Every claim produces exactly one plated-or-crumbed tile, so a tile always has a legal destination (the crumb tray). There is no "stuck" state.

Five ingredients, four rows: one flavour is always off the menu.

### Scoring (replaces `calculateFinalScores` entirely)

```
total = sum over rows of (value printed under the row's last filled tile, 0 if empty)
      + 1 per crumb-tray tile
      + printed VP (1–4) of each claimed card
      + 1 per unspent cupcake
```

Tiebreak: most reward cards claimed; if still tied, shared victory.

**Worked example:** bottom row 4× almond (15) + second row 2× caramel (6) + third row 1× lemon (3) + top row empty (0) + 2 crumbs (2) + cards 2+3+1+4+2+3 (15) + 1 cupcake (1) = **42**.

---

## Code changes

### 1. `src/engine/tiles.js` — card data

`REWARD_CARDS` currently carries `symbolCount` and `ingredient`:

```js
{ id: 2, name: 'Tarte au citron', ingredient: 'lemon', pattern: [...], symbolCount: 1 },
```

- **Remove `symbolCount`** — it has no meaning in the new design.
- **Add `vp`** — take it from `reward_cards.csv` column `vp`; it is already populated 1–4 for all 50 cards.
- **Keep `ingredient`, but it is now cosmetic** — it is the card's thematic family (10 per ingredient) used for art and grouping. It must have **zero** effect on scoring or legality. Consider renaming to `family` to prevent it being wired back into scoring by mistake.

`generateCardsFromCSV.js` should be updated to emit `vp` and drop `symbolCount`. The CSV is **cp1252-encoded, not UTF-8** (card names contain `é`, e.g. "Chocolate-hazelnut praliné") — decode accordingly or the parse throws.

### 2. `src/engine/game.js` — player state

```js
// remove:
scoringPile: [],

// add:
stand: [
  { capacity: 4, ingredient: null, tiles: [] },  // bottom row
  { capacity: 3, ingredient: null, tiles: [] },
  { capacity: 2, ingredient: null, tiles: [] },
  { capacity: 1, ingredient: null, tiles: [] },  // top row
],
crumbTray: [],
```

Suggested constant: `const ROW_VALUES = [3, 6, 10, 15];`

All four rows share the same cumulative prefix, truncated by capacity — so one lookup serves every row: `tiles.length ? ROW_VALUES[tiles.length - 1] : 0`.

### 3. `src/engine/game.js` — `claimCard`

The claim currently ends with `player.scoringPile.push(removedTile)` (~line 222). It now needs a **destination argument**, because plating is a player decision made at claim time:

```js
claimCard(gameState, cardId, removedBoardIndex, destination)
// destination = { type: 'row', rowIndex: 0..3 } | { type: 'crumb' }
```

Legality check for a row destination:

```js
const row = player.stand[destination.rowIndex];
const ok = row.tiles.length < row.capacity
        && (row.ingredient === null || row.ingredient === removedTile.ingredient);
```

On placement, if `row.ingredient === null`, set it to `removedTile.ingredient` — that is the permanent lock. A crumb destination is always legal.

You will likely want a helper the UI and bots share:

```js
getLegalDestinations(player, tile)  // → always includes {type:'crumb'}
```

### 4. `src/engine/game.js` — `calculateFinalScores`

Replace the whole function (currently ~lines 524–545). The nested `INGREDIENTS` loop and `cardSymbols * pileCount` go away:

```js
export function calculateFinalScores(gameState) {
  for (const player of gameState.players) {
    let score = 0;
    for (const row of player.stand) {
      score += row.tiles.length ? ROW_VALUES[row.tiles.length - 1] : 0;
    }
    score += player.crumbTray.length;
    for (const cardId of player.claimedCards) {
      score += REWARD_CARDS.find(c => c.id === cardId).vp;
    }
    score += player.cupcakes;
    player.score = score;
  }
}
```

### 5. `src/bots/*.js` — **the largest job, and the easiest to underestimate**

Every bot's evaluation is built on multiplication scoring, and the bots now also face a decision they have never had to make: **where to plate**. This is not a mechanical port.

- `mctsBot.js` and `greedyBot.js` need new evaluation functions. The old heuristic — hoard one ingredient to pump a multiplier — is now actively wrong; concentration pays only +3/+3/+4/+5.
- Every bot needs a plate-destination policy. A bot that always takes the highest-value legal plate will never crumb, and will lock its bottom row to whatever flavour it happens to sacrifice first. That plays badly *and* it silently removes the crumb decision from any balance data you collect.
- Suggested baseline heuristic for a simple bot: extend a matching locked row when one exists; otherwise lock the largest free row only if you have supply confidence in that ingredient; otherwise crumb.

### 6. UI (`src/ui/board.js`, `src/ui/main.js`)

- Render a stand per player: 4 rows of 4/3/2/1 plates, values printed beneath, locked ingredient shown per row.
- The claim flow gains a step: after choosing which tile to remove, the player chooses a destination. Both choices are part of one claim.
- Remove symbol-strip rendering from cards; render a VP badge (1–4) instead.
- The stand is meant to be **publicly readable** — the whole point of the redesign was making scoring visible mid-game. Opponents' stands should be visible, not collapsed.

### 7. `CLAUDE.md` in the JS repo

Stale and actively misleading — line 45 still says players "collect removed tiles that multiply their end-game scores", and line 99 states `Symbol count = tiles − 1`. Both are dead. It should be regenerated from the rewritten `fancy-that-game` skill. The repo's own `.claude/skills/fancy-that-game/skill.md` is a separate stale copy and needs the same treatment.

---

## What has NOT changed

Don't touch these — they are correct as built:

- The sweep (row/column, declare colour or ingredient, take all matching, bonus tile on clearing a line)
- 5×5 personal board, no adjacency requirement, must place all swept tiles or forgo the sweep
- Pattern matching with rotation and reflection
- Tart tokens permanently blocking the vacated cell
- Market sizes (5×5 for 2p, 6×6 for 3p+) and refill thresholds
- Card market of 4, refilled on claim
- Max one claim per turn
- Cupcakes moving a tile **on the board** (they still cannot touch the stand)

---

## Pre-existing divergences I noticed (not caused by this change)

Worth resolving while you are in here, but decide deliberately — I have not changed the design docs to match, because these may be intentional implementation choices:

1. **`cupcakes: 5` in `createGame`** (`game.js:24`), but Rule book v2 and the design of record both say **4 per player**. One of the two is wrong.
2. **`endGameReason: 'boardOverflow'`** with `remainingTurnsInEndGame` exists in the engine but appears in no design document. If it is a real rule it needs documenting; if it is a safety valve for a state the tabletop game can't reach, that's fine, but it should be commented as such.
3. **`TOTAL_GAME_CARDS = 16` / 24 / 32** is the end condition, expressed as cards claimed. The tabletop rule is "the game ends when the last tart is placed", with 8 tarts per player. Since every claim places exactly one tart, these are **equivalent** — 16/24/32 = 8 × player count. No change needed, but the naming hides the equivalence; a comment would help, and if the tart count is ever tuned (it is a live lever for the playtime issue), this constant is what moves.

---

## Open design questions — do not implement

These are proposed but **not adopted**. Don't build them speculatively:

- **Cupcake re-plate** — spending a cupcake to move a stand tile, or promote a crumb to a plate. Under consideration; currently cupcakes cannot touch the stand.
- **Widening card VP to 1–5** — only if playtests show cards reading as mere tickets to a sacrifice.
- **Full-stand "Perfect Service" bonus**, or a bonus for four differently-flavoured rows.
- **Tier-card draft module** — per-game variable row constraints, the leading candidate for between-game variance.

---

## Where the simulator could earn its keep

The JS build has bots and a `statsCollector`, which makes it the cheapest way to answer questions the tabletop can't yet. The design review has open issues that are really just numbers:

- **Score spread (issue D1).** The paper estimate is careless ~21 / sharp ~28 / ceiling 34 before card VP. A few thousand bot games would confirm or kill that. Specifically: **log claim counts per player alongside final scores** — the tart pool is *shared*, so a fast claimer can take 10+ sacrifices while a slow player gets 4–5, and card VP now scales linearly with claims. That claim-rate asymmetry is the suspected residual spread driver, and it is the thing multiplication's removal did *not* fix.
- **Stand placement automatism (issue D11).** Because every row shares the 3/6/10/15 prefix, extending a locked matching row weakly dominates opening a new one (+3/+4/+5 vs +3). If a bot that never crumbs scores the same as one that crumbs well, that confirms the concern — the stand's decisions live at lock time only.
- **Card-vs-stand balance.** The stand is ~⅔ of a typical score. With 119 VP in the deck and ~8 claims per player, card VP contributes roughly 16–20 per player against a stand ceiling of 34. If the ratio is off, card VP band is the dial.

---

## Checklist

- [ ] `tiles.js`: drop `symbolCount`, add `vp` from CSV, demote `ingredient` to cosmetic (consider renaming `family`)
- [ ] `generateCardsFromCSV.js`: emit `vp`, drop `symbolCount`, decode CSV as cp1252
- [ ] `game.js`: replace `scoringPile` with `stand` + `crumbTray`
- [ ] `game.js`: `claimCard` takes a destination; enforce capacity + ingredient lock; set lock on first tile
- [ ] `game.js`: add `getLegalDestinations`, always including crumb
- [ ] `game.js`: rewrite `calculateFinalScores`
- [ ] Bots: new evaluation + plate-destination policy (all five bots)
- [ ] UI: render stands, VP badges; add destination step to claim flow; drop symbol strips
- [ ] Regenerate `CLAUDE.md` and the repo's `fancy-that-game` skill copy
- [ ] Resolve the cupcake 4-vs-5 discrepancy
- [ ] Simulate: score spread + claim counts per player
