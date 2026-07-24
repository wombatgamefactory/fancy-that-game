# Fancy That! — Rule changes of 24 July 2026 (handoff for the JS implementation)

Audience: the project building the JS version of the game. This document lists **only
what changed** on 24 July 2026. Everything not mentioned here is unchanged from the
21 July state (`DESIGN_CHANGES_2026-07-21_JS_HANDOFF.md`). Full rationale lives in
`DESIGN_UPDATE_2026-07-24.md`; the design of record is the `fancy-that-game` skill.

Headline: the tile market no longer refreshes automatically — players refresh it by
playing their Fresh Pot of Tea card, which now resets **both** markets and no longer
costs the sweep. The cupcake cap is gone.

---

## 1. Tile-market auto-refill — DELETED

**Remove** the end-of-turn refill check ("if 6 or fewer tiles remain — fewer than 5
at 2p — refill to 36"). There is no automatic tile refill of any kind.

The tile market now refills in exactly two ways:

1. The tea refresh (§2, step d).
2. The backstop (§5).

## 2. Fresh Pot of Tea card — new procedure (replaces the 21 July §4 flow)

Timing change: the card is played at the **start of the turn, before Step 1**, and
the player then takes their **full normal turn** (sweep, place, claim). It no longer
replaces Steps 1–2. Still optional, still once per game per player, still discarded
on use, still 0 VP unused.

Procedure, in this exact order:

- **(a) Reserve round** — starting with the active player and proceeding clockwise,
  each player may reserve 1 card from the card market into their personal reserve.
  The reserve limit of 1 applies; a player whose reserve is full passes. (No
  discard-to-swap.)
- **(b) Unconditional flush** — move all unreserved market cards to
  `cardDiscardPile`, deal 4 new cards from the deck (reshuffle rule as before).
  Every tea produces a fully fresh card market regardless of how many were reserved.
- **(c) Cupcake pot** — the **active player only** gains 1 cupcake per cupcake
  symbol currently visible on the tile market (see §3). No cap check — see §4.
- **(d) Tile refill** — fill **every empty cell** of the tile market from the bag.
  If the bag runs dry mid-refill, fill what you can and continue.
- **(e)** Discard the Tea card.

Then the normal turn runs from Step 1.

**Deleted:** the flat +1 cupcake for playing the card (the pot replaces it), and the
"tea replaces the sweep / turn continues from Step 3" flow.

Note (c) must run **before** (d) — the refill covers the symbols. Steps (a)/(b)
don't touch tiles, so their order relative to (c) is immaterial, but keep the listed
order for UI clarity.

Unchanged: the active player may claim a card they reserved during this same tea
(reserved-card claims still skip the card-market refill).

## 3. Cupcake symbols on the market board — new

- **4 cells** of the 6×6 market board carry a printed cupcake symbol. A symbol is
  **visible** when its cell is empty (no tile on it).
- **Positions are not final** — make them a config constant (list of cell coords),
  not hardcoded logic. Physical intent: symmetric pattern. The 2-player layout (5×5
  inner area) is an open question — whether all 4 symbols fall inside it or 2p
  accepts a smaller maximum pot. Config should therefore support per-player-count
  symbol sets. Placeholder until final art: any symmetric 4 within the inner area.
- Pot size: max 4, typical 2–3 at a sensible tea moment.
- No mid-turn triggers: symbols do nothing when uncovered by a sweep. They are only
  read at tea step (c).

## 4. Cupcake cap — DELETED

- **Remove the hard cap of 4** and every forfeiture branch (the 21 July §2
  "cupcake gain only if below cap" check on cupcake plates, and any cap check on
  tea gains). All cupcake gains now always pay.
- Influx self-bounds: 2 starting + up to 4 (tea pot) + up to 4 (cupcake plates) =
  10 lifetime max, realistically 5–7.
- Starting cupcakes stay **2**. All four uses unchanged (move tile / move tart /
  re-ice during a claim / keep for 1 VP).
- The 21 July metrics item "cupcake-forfeit events" is obsolete — replace with
  logging each player's total cupcake influx (see metrics below).

## 5. Backstop refresh — new rule

*If a player cannot make any legal sweep, refresh the tile market for free (no
cupcakes).*

Implementation note: a sweep is legal whenever at least one tile is anywhere on the
market (pick its line, declare its colour). So the backstop condition reduces to
**tile market completely empty at the start of Step 1**. Fire it automatically at
that point: fill every cell from the bag, award nothing, proceed with the sweep. If
the bag is also empty, no refill happens — the game continues (and will end on the
tart clock or a full board as usual). If the player opens with a tea card, the tea
refill makes the backstop moot that turn.

Expected frequency: near zero. Log every firing — see metrics.

---

## Engine/simulation implications

- **Constants:** cupcake symbol cell positions (per player count, config-driven);
  delete the refill threshold constants (6 / 5) and the cupcake cap constant.
- **State:** no new per-player state beyond the existing `teaCardUsed` /
  `reservedCard`; add nothing for symbols (visibility derives from cell emptiness).
- **AI heuristics need real work on tea timing** — this is the interesting new
  decision. Inputs: current pot size (empty symbol cells), quality of the current
  market for the player's needs (a fresh market is swept by the tea player first,
  so tea is strongest when the player also wants new tiles), and the risk that an
  opponent fires first and takes the pot. The old heuristic shape ("tea costs my
  sweep, only when desperate") is dead — tea is now pure upside gated by timing.
- **Reserve heuristics:** every tea now offers all players a reserve decision, so
  reserves will be far more common than under the 21 July rules.

## Metrics to log per simulated/real game

The 21 July metrics list stands except item 4 (forfeits — obsolete) and item 5,
which is superseded by the following:

1. **Tea timing:** turn number each Tea card fires, and the pot size collected.
   Target: teas spread through the game. Failure mode: everyone hoards until the
   board is nearly empty (grinding, tiny sweeps) or everyone fires early (pot ~0,
   late-game drought).
2. **Backstop firings** (count + turn number). More than ~1 per game means the
   player-driven refresh isn't covering tile supply — at 2p the fix is dealing 2
   Tea cards each, never reinstating the threshold.
3. **Late-game droughts:** turns where a player's best sweep is 1 junk tile, after
   all Tea cards are spent.
4. **Claims from reserves** as a fraction of all claims (reserve traffic is up;
   feeds the claim-pressure/game-length watch).
5. **Deck reshuffles per game** — now expected at 4p (each tea consumes 4+ cards),
   not a corner case.
6. **Cupcake influx per player** (total gained, by source: start / pot / plates)
   and re-icing frequency — the wild is looser with the cap gone; the tuning knob
   remains card VP, never the cupcake rules.
