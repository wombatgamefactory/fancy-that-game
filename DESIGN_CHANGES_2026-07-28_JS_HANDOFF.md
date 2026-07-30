# Fancy That! - Rule changes of 28 July 2026 (handoff for the JS implementation)

Audience: the project building the JS version of the game. This document lists **only
what changed** on 28 July 2026. Everything not mentioned here is unchanged from the
24 July state (`DESIGN_CHANGES_2026-07-24_JS_HANDOFF.md`). Rationale for §1-§4 lives
in `DESIGN_UPDATE_2026-07-28.md`; §5-§6 were decided in the afternoon design session
and a design-update addendum will follow. The design of record is the
`fancy-that-game` skill.

Headline: the Fresh Pot of Tea **card is deleted**. The refresh is now a repeatable
start-of-turn option, gated on 2+ visible cupcake symbols, and its tile step is a
**full flush** (all market tiles back into the bag). The market board is **5x5 at
all player counts**. The card market no longer refills on claim - instead **a card
is dealt at the end of every turn**, the row grows without a cap, and the tea flush
is the only thing that resets it to 4.

All changes are adopted pending playtest.

---

## 1. Market board: 6x6 becomes 5x5

- **25 cells at all player counts.** Delete the 2-player inner-area logic entirely
  (board size, sweep-line restrictions, per-player-count symbol sets).
- Sweep geometry: 10 lines (5 rows + 5 columns), 5 cells per line.
- Setup fills all 25 cells from the bag as before.

## 2. Fresh Pot of Tea card - DELETED

- Remove the component, the setup deal, the `teaCardUsed` per-player state, the
  play-the-card action, and the "unused Tea cards score 0" scoring line.
- The refresh option (§3) replaces it. The market board art will carry the printed
  trigger ("2 cupcakes showing? Order a fresh pot of tea") - UI should surface the
  option the same way, as a persistent affordance rather than a held card.

## 3. The refresh: repeatable, board-gated, full flush

At the **start of a player's turn, before Step 1**, if **2 or more cupcake symbols
are visible** on the market board, that player may order a fresh pot of tea:

- **(a) Reserve round** - starting with the active player, clockwise, each player
  may reserve 1 card from the card market (reserve limit of 1; pass if full).
  Unchanged from 24 July.
- **(b) Flush the cards** - move ALL unreserved market cards to `cardDiscardPile`
  and deal exactly **4** new cards. Note: under §5 the row may hold more than 4
  cards at this point - flush them all regardless of count; the deal-back is
  always 4. This is the only mechanism that shrinks the card row.
- **(c) Cupcake reward** - the active player gains 1 cupcake per visible symbol.
  Minimum 2 (the gate), maximum 4. Must run **before** (d).
- **(d) Full tile flush** - return **every tile still on the market board to the
  bag**, shuffle, then draw and fill all 25 cells. If the bag runs dry, fill what
  you can. (This replaces the 24 July "fill every empty cell" step - the survivors
  no longer survive.)

Then the player takes their full normal turn (sweep, place, claim - including a
card reserved in step (a)).

- **No per-game or per-player limit.** The gate is self-resetting: a full board
  covers all 4 symbols.
- **Threshold is a config constant** (`refreshThreshold = 2`). The tuning knob if
  refreshes fire too often is raising it to 3 - never additional rules.
- **Backstop, reworked:** an empty tile market shows all 4 symbols, so the refresh
  is always available there. Replace the 24 July free-refill backstop with:
  **if the tile market is empty at the start of a turn, the refresh is mandatory**
  (it is the only way to have a legal sweep). It is a normal refresh in every way,
  including the 4-cupcake reward. Yes, this means whoever empties the board gifts
  the next player the maximum reward - that gift/deny choice is intended.

## 4. Cupcake symbols - single placement set

- One config set of 4 cells for all player counts (the per-player-count config
  from 24 July §3 is void).
- Positions remain a graphics decision. Recommended placeholder, chosen so that no
  two symbols share a row or column (no single sweep can expose two) and with 90
  degree rotational symmetry, avoiding the centre cell: **(1,2), (2,5), (5,4),
  (4,1)** in 1-indexed (row, column). Keep it a config constant.

## 5. Card market rework: deal on every turn, no refill on claim - NEW

- **DELETE the claim-refill rule** (Step 3's "draw the top card of the deck to
  return the market to 4 cards"). Claims now simply remove the card.
- **NEW end-of-turn step: deal 1 card from the deck to the card row.** Every turn,
  unconditionally - whether or not the player claimed, refreshed, or both. The
  existing discard-reshuffle rule covers deck exhaustion.
- **No cap on the row size.** The row floats: setup deals 4, grows by 1 on every
  claimless turn, stays level on claim turns, and only the tea flush (§3b) resets
  it to 4. Expected range roughly 4-10; the opening (before claims start and while
  the tea gate is still locked) is the unregulated window and may run higher.
- **Setup card count is a config constant** (`initialMarketCards = 4`). If opening
  sprawl proves silly in playtesting, the knob is dealing 2 or 3 at setup - the
  row grows on its own - never a cap.
- Reserved-card claims are unchanged (no market interaction); the end-of-turn deal
  happens regardless of what kind of claim was made.
- Design intent, for whoever writes the AI: the ever-growing row is the staleness
  valve. A market nobody can claim from grows by 1 card per turn until somebody
  can - no trigger, no condition. Caps were considered and rejected because any
  cap recreates the frozen-market failure at the cap. The always-deal (rather
  than deal-only-when-not-claiming) guarantees a player who cannot claim always
  sees at least one new card by their next turn, even if opponents claim every
  card they reveal.

## 6. One claim per turn - CONFIRMED, plus a pre-agreed variant flag

- The maximum of 1 claim per turn **stands**. Players persistently assume
  otherwise, so the UI should reject a second claim with a clear message rather
  than greying out silently.
- Pre-agreed escalation if playtests show real frustration (not yet adopted):
  extra claims beyond the first cost **1 cupcake each**. Build this behind a
  config flag (`extraClaimCupcakeCost = null` for disallowed, or a number) so
  simulation can A/B it. Do not enable it by default.

---

## Engine/simulation implications

- **Constants:** board size 25; `refreshThreshold` (2); `initialMarketCards` (4);
  single cupcake-symbol cell set; `extraClaimCupcakeCost` (null). Delete the Tea
  card constants and the per-player-count symbol sets.
- **State:** delete `teaCardUsed`. The card row becomes variable-length - remove
  any market-size-4 invariants. No new state for the refresh gate (visibility
  derives from cell emptiness, as before).
- **Refresh timing is the AI's biggest new decision.** Inputs: how well the
  current tile market suits the player (a flush destroys it - the refresh is now
  destructive, not additive), reward size (visible symbols), denial value (the
  flush can wipe a line an opponent is building toward, and the flusher sweeps
  the fresh market first), and the race (waiting for a bigger reward risks
  another player firing first).
- **Symbol steering:** a player can guarantee exposing a symbol by declaring the
  colour of the tile sitting on a symbol cell. A competent AI should value sweeps
  partly by whether they advance (or gift) the refresh unlock.
- **Card row:** the end-of-turn deal is automatic - no decision. Claim heuristics
  should account for the row growing when players do not claim (waiting is
  cheaper than before) and for claimed cards not being replaced (taking a card
  now shrinks the visible pool).

## Metrics to log per simulated/real game

The 24 July metrics list is superseded by the following:

1. **Refresh cadence:** turn number of each refresh, symbols visible at firing,
   reward collected, and which player fired it. Target: spread through the game,
   realistic firing around 3 symbols. Failure modes: firing at every legal
   opportunity (raise threshold to 3) or a bad-for-everyone market sitting
   unflushed while players wait each other out.
2. **Mandatory (empty-board) refreshes** - count and turn numbers. Should be rare.
3. **Card row size:** per-turn row size; max, mean, size when the first claim
   occurs, and size at game end. Feeds the `initialMarketCards` knob.
4. **Card-lock incidence:** turns on which a player had no legal claim against
   the whole row, and longest streak per player. The 27 July lock (all cards
   requiring one colour absent from market and boards) should be structurally
   impossible to sustain now - verify.
5. **Multi-match frequency:** turns on which a player could legally have claimed
   2 or more cards. Feeds the one-claim-per-turn / `extraClaimCupcakeCost`
   question.
6. **Claims from reserves** as a fraction of all claims, and reserve-round time
   cost (real games) - the fallback if the round drags is flusher-only reserves.
7. **Deck reshuffles per game** - now routine at all counts (roughly 1 card per
   turn plus flush burn).
8. **Cupcake economy:** per-player influx by source (start / refresh reward /
   cupcake plates), spend by use, and end-game kept-cupcake VP. If kept cupcakes
   become a top-three scoring category, the knob is the payout, not the trigger.
   Also log whether the 16-token supply ever empties.
9. **Bag skew:** colour distribution of flushed-back tiles versus the bag - does
   a colour nobody wants keep recirculating and reappearing?
10. **Per-player claim counts and final score spread** (standing D1 watch), and
    game length (standing D3 watch - time real sessions).
