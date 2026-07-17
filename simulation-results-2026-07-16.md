# Fancy That! — Phase 6 Simulation Study

**Date:** 2026-07-16
**Branch:** cake-stand-scoring
**Scope:** Three open design questions (D1 score spread, D11 stand-placement automatism, card-vs-stand balance) under the cake-stand + flat-card-VP scoring model.

---

## Methodology

### Engine & scoring model under test
- `src/engine/game.js` as shipped on this branch. Cake-stand rows score the shared cumulative prefix `ROW_VALUES = [3, 6, 10, 15]` truncated by row capacity `[4, 3, 2, 1]`; crumb tray = 1 VP/tile; claimed cards = flat `card.vp`; unspent cupcakes = 1 VP each (players start with **4** cupcakes).
- No repo source file was modified. All simulation code lives in the scratchpad and imports the repo modules read-only.

### Bots
- **All batches use `basicBot`** (the shipped heuristic bot) in self-play. `basicBot` decides sweep by summed card-VP colour demand, places tiles greedily toward market patterns, **always skips the move phase** (never spends cupcakes), and claims the highest-VP matchable card.
- The game driver is a copy of `simulate.js`'s loop shape, including the `bonusTileAvailable` sub-phase.

### Known bot weakness (governs how far these results can be trusted)
The bots are **weak at completing patterns**. Across all player counts a claimable card exists on only **~15–17 %** of claim phases, so a player claims only **~1.6–1.9 cards per game** — versus the **8 claims/player the game is *designed* around**. Every conclusion below is therefore drawn from the *low-claim* regime. Where a question genuinely lives in the *high-claim* regime (D11 in particular), the data can only speak to the sparse regime and this is flagged explicitly.

A second artifact: because `basicBot` always skips the move phase, **every player ends with all 4 cupcakes**, so 4 flat VP is baked into every score. This inflates the cupcake component and is not representative of human play.

### Game counts & seeds
- **Q1:** 2,500 games each at 2p / 3p / 4p (5,000 / 7,500 / 10,000 player-results).
- **Q2:** 2,500 games per policy pairing (2p mirror, alternating seats), plus a baseline-vs-baseline control.
- **Q3:** derived from the Q1 batches.
- **No fixed seeds** — `Math.random()` throughout (bag shuffle, deck shuffle, tie-break jitter). Batch sizes are large enough that Monte-Carlo noise on the reported means is small (≈0.1 VP).
- Optional MCTS sanity sample: see the note at the end of Q1.

---

## Q1 — Score spread (design issue D1)

Paper estimate was careless ~21 / sharp ~28 / stand ceiling 34 *before* card VP. **Bots never reach that band** because they claim so few cards; observed totals (stand + crumbs + cards + 4 cupcakes) sit around 12–14.

### Per-player final-score distribution and game shape

| Metric | 2p | 3p | 4p |
|---|---|---|---|
| Score mean | 13.78 | 12.99 | 12.22 |
| Score sd | 6.47 | 6.16 | 5.99 |
| Score min | 4 | 4 | 4 |
| Score p25 | 9 | 9 | 9 |
| Score median | 14 | 13 | 11 |
| Score p75 | 18 | 17 | 16 |
| Score max | 42 | 43 | 39 |
| Win margin (mean) | 6.47 | 5.22 | 4.54 |
| Win margin (median) | 5 | 5 | 4 |
| Mean claims / player | 1.91 | 1.74 | 1.59 |
| Claims sd | 1.24 | 1.16 | 1.13 |
| Max claims by any player | 7 | 7 | 6 |
| Game length (turns, mean) | 22.8 | 32.6 | 43.2 |
| Game length (turns, min–max) | 14–34 | 22–56 | 30–57 |
| Claim availability (claimable / claim phases) | 16.7 % | 16.5 % | 14.8 % |
| End reason | boardOverflow ×2500 | boardOverflow ×2500 | boardOverflow ×2487, marketTiles ×13 |

### Claim-count → score correlation (the suspected spread driver)

| Correlation of claims vs final score | 2p | 3p | 4p |
|---|---|---|---|
| Pooled Pearson r (all player-results) | 0.983 | 0.982 | 0.982 |
| Mean within-game r (across seats) | 0.998* | 0.981 | 0.976 |
| 2p paired-difference r (seat claim-margin vs score-margin) | 0.976 | — | — |

\* For 2 players a within-game correlation over two points is mathematically ±1, so it is degenerate; the paired-difference r (0.976) is the meaningful 2p measure.

### Finding

**The score spread is almost entirely a claim-count spread, and the shared tart pool makes it self-reinforcing.** The within-game correlation between how many cards a player claims and their final score is essentially perfect (r ≈ 0.98 at every player count). A player who claims one more card than a rival almost always finishes ahead, and by a predictable amount. The end-game is *always* the board-overflow safety valve (2p/3p: 100 %; 4p: 99.5 %) — **the documented `cardMarket` end condition never fires**, because bots claim far too slowly for the deck to run out. Games therefore end when someone's 5×5 board clogs, not when the tart supply is exhausted.

This directly confirms the D1 suspicion: with a shared card market, **claim-rate asymmetry is the residual spread driver**. But the honest read is that *at current bot strength the spread is dominated by who stumbles into a completable pattern first*, not by depth of play — the mean of ~1.9 claims is so low that a single extra claim (worth ~2 card VP plus a stand tile) swings the game. Win margins (mean 4.5–6.5) are large relative to the ~13 mean score. Whether the *designed* 8-claim game still shows this much spread cannot be answered until bots can actually complete patterns.

**Optional MCTS sanity sample (2p; MCTS is slow — ~14 s/game at `mcts-1`, ~41 s/game at `mcts-2` — so these are spot checks, not batches):**

| Bot | Games | Mean score | Mean claims | Claim availability | Max claims | Games reaching 8 claims |
|---|---|---|---|---|---|---|
| basicBot (2p, from Q1) | 2500 | 13.78 | 1.91 | 16.7 % | 7 | 0 |
| mctsBot `mcts-1` (60 iters) | 15 | 17.2 | 2.53 | 15.6 % | 6 | 0 |
| mctsBot `mcts-2` (200 iters) | 3 | 15.0 | 2.17 | 15.7 % | 4 | 0 |

`mctsBot` only searches the *sweep* decision; its placement and claim logic are the same greedy routines. Better sweeping does lift mean claims (~1.9 → ~2.5) and score (~14 → ~17) by collecting more useful tiles — but **claim availability per claim-phase stays flat at ~15.6 %, and no MCTS game reaches 8 claims either.** The pattern-completion ceiling is a **placement** problem, and search over sweeps does not lift it.

---

## Q2 — Stand-placement automatism (design issue D11)

The concern: because every stand row shares the `3/6/10/15` prefix, extending a locked matching row weakly dominates, so the stand's real decisions may live only at *lock time*. Four destination policies were run head-to-head vs the shipped baseline (2p mirror, alternating seats, 2,500 games each; the only thing swapped is the destination of the removed tile — card choice and removed-cell choice stay identical). Policies:

- **(a) baseline** — `basicBot.decideDestination` as shipped.
- **(b) greedy-best-plate** — always the highest-marginal-value legal plate, never crumb (crumb only when forced).
- **(c) random-legal** — uniform over `getLegalDestinations`.
- **(d) crumb-happy** — extend a locked matching row if possible; open a new row only while fewer than two rows are locked; otherwise crumb.

| Challenger policy | Challenger mean | Baseline mean | Challenger win rate | Baseline win rate | Tie rate | Δ (chal − base) |
|---|---|---|---|---|---|---|
| baseline (control) | 13.81 | 13.76 | 45.4 % | 44.8 % | 9.8 % | +0.05 |
| **(b) greedy-best-plate** | 13.89 | 13.88 | 45.1 % | 45.6 % | 9.3 % | +0.01 |
| **(c) random-legal** | 12.57 | 13.62 | 39.5 % | 50.9 % | 9.6 % | **−1.05** |
| **(d) crumb-happy** | 13.81 | 13.89 | 44.8 % | 44.6 % | 10.6 % | −0.08 |

### Finding

**Automatism concern CONFIRMED in the observed (low-claim) regime — with the predicted caveat.** Three of the four "sensible" policies are statistically identical: baseline, greedy-best-plate and crumb-happy all land within **0.1 VP** of each other and split games ~50/50. Only the deliberately-bad **random-legal** loses, and only by **~1.05 VP** (win rate 39.5 % vs 50.9 %) — the penalty for occasionally crumbing a tile that could have extended a row.

This matches the D11 hypothesis: greedy-best-plate ≈ baseline confirms that *extending the best locked row weakly dominates*, so the destination decision carries almost no information once you are not actively throwing points away. crumb-happy ≈ baseline for a second reason — at ~1.9 claims/player, players almost **never open more than two rows anyway**, so "refuse to open rows after two locks" essentially never binds.

**Crucial honesty caveat:** D11 is fundamentally a question about the *high-claim* regime, where rows fill up and the concentration-vs-spread tradeoff has teeth. Bots placing only ~1.6–1.9 tiles on the stand per game cannot exercise that tradeoff at all. So this result confirms the automatism *only where few tiles are banked*. The ~1 VP that random-legal loses on ~2 misplaced tiles would scale roughly linearly with claim count — at the designed 8 claims/player, destination discipline could plausibly be worth **4–5 VP**, which would *refute* the "decisions barely matter" reading. The data touches D11 but cannot settle it until bots complete patterns.

---

## Q3 — Card-vs-stand balance

Expected: stand ≈ 2/3 of a typical score; card VP 16–20/player at ~8 claims. Observed component means per player (VP):

| Component | 2p | 3p | 4p |
|---|---|---|---|
| Stand (cake-stand rows) | 5.84 | 5.31 | 4.82 |
| Crumb tray | 0.001 | 0.000 | 0.000 |
| Card VP (flat) | 3.94 | 3.68 | 3.39 |
| Cupcakes (all 4 unspent) | 4.00 | 4.00 | 4.00 |
| **Total** | **13.78** | **12.99** | **12.22** |
| Stand : Card ratio | 1.48 : 1 | 1.44 : 1 | 1.42 : 1 |
| Stand tiles banked / player | 1.91 | 1.74 | 1.59 |
| Card VP per claim | 2.06 | 2.12 | 2.14 |

### Observed shares (of total)
- **2p:** stand 42 %, card 29 %, cupcakes 29 %, crumbs ~0 %.
- **3p:** stand 41 %, card 28 %, cupcakes 31 %.
- **4p:** stand 39 %, card 28 %, cupcakes 33 %.

### Extrapolation to the designed 8 claims/player

Card VP per claim is stable at **~2.1** across player counts. At the designed **8 claims/player**:

> projected card VP ≈ 8 × 2.1 ≈ **16.5 – 17.1 VP/player**

which lands squarely in the designer's **16–20 VP** target band. So the *card VP band is well-calibrated for the intended claim volume* — the flat `card.vp` values are fine; the problem is purely that bots don't reach 8 claims.

**Stand at 8 claims — not observed, reasoned.** `gamesWith8 = 0`: **no bot game at any player count produced a player with 8 claims** (max was 7 at 2p/3p, 6 at 4p), so the stand-at-8 figure cannot be measured empirically here. Reasoning from `ROW_VALUES`: 8 tiles distributed optimally over capacities `[4,3,2,1]` (e.g. 4+3+1) score `15+10+3 = 28` on the stand — *if* the player draws enough of the right ingredients to fill those rows, which real ingredient supply will not always allow. A sharp 8-claim player would therefore be roughly **stand 28 + card 17 + cupcakes (fewer, if spent) ≈ 45**, giving a stand share of **~60 %** — close to the designed "stand ≈ 2/3" target, and stand : card ≈ **1.6 : 1**.

### Finding

**At the intended claim volume the balance looks right on paper (stand ~60 %, card ~17 VP), but the *observed* balance is distorted by two bot artifacts:** (1) far too few claims, which shrinks both stand and card components toward zero, and (2) cupcakes never being spent, which parks a flat 4 VP (~30 % of the current total) into every score. The stand:card ratio observed now (~1.45:1) is close to the projected 1.6:1, so the two components appear proportioned correctly — but this cannot be trusted as a *balance* verdict while cupcakes are inert and claim counts are a quarter of design intent. **The crumb tray is effectively unused** (baseline crumbs ~0), so its 1-VP-per-tile value is currently doing no work in the economy.

---

## Caveats & recommended next steps

1. **Bot placement strength is the blocking dependency for every balance conclusion.** The single most valuable next step is a bot that can *build toward and complete patterns* (look-ahead placement that reserves board cells for a target card, rather than greedy per-tile scoring). Until claim rates rise from ~1.8 to near the designed ~8, none of D1 / D11 / card-vs-stand can be answered in the regime the game is actually tuned for. MCTS does **not** help here — it only searches sweeps; placement and claim stay greedy.

2. **The `cardMarket` end condition never triggers under bot play.** Games always end via the board-overflow safety valve (or, rarely at 4p, market-tile exhaustion). If human games also rarely reach deck exhaustion, the 8-claims-per-player design assumption — and the `cardsNeededToEnd` lever (16 / 24 / 32) — should be revisited against real claim rates. Board overflow, described in-code as a "safety valve, not a documented tabletop rule," is currently the *primary* end condition; that deserves design attention.

3. **Cupcakes are inert in simulation.** `basicBot` never spends them, so 4 flat VP (~30 % of score) is a constant. A bot that uses the move phase is needed before the stand/card/cupcake split can be read as a real balance signal, and before the move-for-a-cupcake mechanic can be evaluated at all.

4. **The crumb tray is unused.** With sensible destination policies crumbs stay near zero, so the crumb tray's 1-VP-per-tile line is currently vestigial. Either it needs to be a live strategic option in more board states, or the design should accept it as a rare fallback only.

5. **Design levers the data actually touches:**
   - **Card VP band (`card.vp`):** *well-calibrated* for 8 claims (projected 16–17 VP). No change indicated.
   - **`ROW_VALUES` = [3,6,10,15]:** the shared prefix is exactly what makes destination choice near-automatic in the low-claim regime (Q2). If the designer wants stand *placement* to be a live decision rather than a lock-time-only decision, the prefix would need to be made less uniformly dominant (e.g. steeper marginal gains that reward commitment, or per-row differentiation) — but test this only after bots can bank enough tiles to exercise it.
   - **Tart count per player (`cardsNeededToEnd`) / end conditions:** revisit once realistic claim rates are known; the current value is never the binding end condition in silico.

6. **Statistical note:** batches are 2,500 games; reported means carry Monte-Carlo error on the order of 0.1 VP, so the sub-0.1-VP gaps between baseline, greedy-best-plate and crumb-happy in Q2 are genuinely "no measurable difference," while random-legal's ~1 VP deficit is real.

---

*Simulation scripts: scratchpad only (not committed). This file is the sole repo artifact of Phase 6.*
