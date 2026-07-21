# Fancy That! — Rule changes of 21 July 2026 (handoff for the JS implementation)

Audience: the project building the JS version of the game. This document lists **only
what changed** on 21 July 2026, following the 20 July playtest. Everything not
mentioned here is unchanged from the design of record (the `fancy-that-game` skill,
17 July 2026 state: tea round, personal reserve, re-icing cupcake wild, deck
reshuffle). Full rationale lives in `DESIGN_UPDATE_2026-07-21.md`.

---

## 1. Cake stand scoring — escalating per-tile values

**Replaces** the flat cumulative values (3/6/10/15 · 3/6/10 · 3/6 · 3, max 34).

Each tile added to a row is worth the per-tile amount below. The board prints the
**cumulative** totals, and the existing scoring rule is unchanged: at game end each
row scores the cumulative value printed beneath its **last filled plate** (empty row
scores 0).

| Row    | Plates | Per-tile values | Printed cumulative |
| ------ | ------ | --------------- | ------------------ |
| Top    | 1      | 5               | 5                  |
| Third  | 2      | 4, 5            | 4 / 9              |
| Second | 3      | 3, 4, 5         | 3 / 7 / 12         |
| Bottom | 4      | 2, 4, 8, 12     | 2 / 6 / 14 / 26    |

- Maximum stand score: **52** (theoretical; ~30 realized for a typical ~7 platings).
- All other stand rules unchanged: rows fill left to right, first tile locks the
  row's ingredient, one ingredient per row across the whole stand, plating is
  permanent, crumb tray always a free choice at 1 VP per tile.
- Design intent (matters for AI heuristics): row *entry* value falls with row length
  (5/4/3/2), row *depth* pays escalating amounts — short rows are safe with a low
  ceiling, the bottom row is a gamble with a huge one. Focus deliberately beats
  spread now: four scattered first-plates = 14 vs 26 for one full bottom row.
- Board art reference: `images\cake_stand.png`.

## 2. Cupcake plates — new cupcake gain on the stand

Four plates print a cupcake icon: the **second plate of each multi-plate row**, and
the **top row's single plate**.

- When a player plates a tile onto a cupcake plate, they immediately gain **1 cupcake
  from the supply — only if currently below the hard cap of 4**.
- **A gain at cap is forfeited.** Nothing is owed later; the trigger is consumed by
  covering the plate.
- Implementation shape: fire on the plating event, keyed by (row, plateIndex) —
  bottom[1], second[1], third[1], top[0] (0-indexed).
- Do **not** implement the first-tile variant (cupcake on the opening plate of each
  row). It was physically playtested 20 July and rejected as too generous — it
  rewarded spreading across rows, the opposite of what the new scoring incentivises.

## 3. Starting cupcakes: 4 → 2

- Each player now starts with **2 cupcakes** (setup change only).
- The hard cap stays **4**. All four cupcake uses unchanged (move tile / move tart /
  re-ice one tile's colour during a claim / keep for 1 VP), tea-round gain unchanged.
- Tuning note: if playtests show the early game too rigid on 2, the knob is starting
  with 3 — never raise the cap.

## 4. Card VP rebalance — adopted in principle, values pending

- The 1–4 VP band is being retired. Working target: a band of roughly **2–6
  averaging ~4**, judged per pattern by difficulty as before.
- Balancing rule that produced the target: realized card total ≈ realized stand
  total (~30 each; "50/50 felt per claim" — every claim pays card VP + one plate's
  marginal value, and the new plate marginals average ~4–5).
- **JS implication: keep per-card VP data-driven.** Current deck data (1–4) is stale;
  new per-card values will follow as a separate deliverable. Don't hardcode the band.

---

## Engine/simulation implications

- **Constants:** stand value table (per-tile and cumulative), cupcake-plate positions,
  starting cupcakes = 2.
- **New logic:** cupcake gain on plating (cap-checked, silently forfeited at cap).
- **AI heuristics need revisiting:** plating choice is now value-sensitive (it was
  near-neutral under flat values). The top plate (5 VP + cupcake) is the strongest
  single plating; the bottom row only wins if it gets deep. Anything that assumed
  score ranges also shifts — typical totals roughly double to ~60–70.
- **Metrics to log per simulated/real game** (these decide the next tuning round):
  1. Per-player claim counts and final score spread (blowout check — the
     concentration premium is back by design; blowout knob is the bottom row's tail,
     e.g. per-tile 2/4/6/9, never the structure).
  2. Card VP total vs stand total per player (target ≈ 50/50 realized).
  3. How often the top row is a player's *first* plating (watch for it becoming
     automatic; if so the fix is moving its cupcake, not touching the 5).
  4. Cupcake-forfeit events (gains attempted at cap).
  5. Existing 17 July watch items still stand: tea-round fire rate (~2–3/game
     target), re-icing frequency (the wild got stronger — claim VP rose and cupcakes
     flow more freely), deck burn at 4p.
