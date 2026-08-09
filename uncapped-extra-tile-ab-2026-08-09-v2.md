# The uncapped extra tile - A/B, 9 August 2026 (v2)

Supersedes `uncapped-extra-tile-ab-2026-08-09.md`, which measured two arms. This
version adds a third: **the uncapped rule with every seat's opening purse cut by 1**,
asked as "can we just pay for the new freedom out of the starting cupcakes?"

The answer is no, and the reason is worth keeping: a flat cut is not a flat cut.

## The three arms

| arm | rule |
|---|---|
| **BASELINE** | one extra tile per turn, opening purse 2/3/4/5 at 4p |
| **UNCAPPED** | unlimited extra tiles at a flat 1 each, same purse |
| **UNCAPPED -1** | unlimited extra tiles, opening purse 1/2/3/4 at 4p |

1500 games per arm per player count, basic bot.

    node simulate.js 1500 4 basic maxtiles=1
    node simulate.js 1500 4 basic maxtiles=unlimited
    node simulate.js 1500 4 basic maxtiles=unlimited startminus=1

Raw output: `sim-uncapped-tiles-2026-08-09-{2,3,4}p-{baseline,uncapped,uncapped-start-minus1}.txt`

---

## Headline, 4 players

| | BASELINE | UNCAPPED | UNCAPPED -1 |
|---|---|---|---|
| claim-step lock rate | 26.2% | **21.0%** | 24.8% |
| turns per player | 8.53 | 7.62 | 7.89 |
| claims per player | 6.30 (min 3) | 6.01 (min 1) | 5.93 (**min 0**) |
| mean final score | 53.2 | 50.7 | **50.0** |
| last as % of winner | 63.2% | 60.7% | **58.4%** |
| cupcake influx/player | 8.55 | 8.46 | 7.39 |
| cupcakes kept at end | 3.55 | 2.27 | 1.94 |
| games with a broke player | 21.9% | 46.3% | **52.0%** |
| games with 4+ unspent | 95.9% | 65.5% | 47.6% |
| worst seat deviation | -2.2 | +6.6 | **-7.8** |

And the same three columns for the lock rate, which is what the whole change was for:

| | BASELINE | UNCAPPED | UNCAPPED -1 |
|---|---|---|---|
| 2p | 25.9% | 23.6% | **27.4%** |
| 3p | 25.7% | 22.4% | **26.4%** |
| 4p | 26.2% | 21.0% | 24.8% |

## 1. It gives back most of the benefit to buy back a little of the cost

At 4p the cut recovers **30% of the lost game length** (7.62 → 7.89 against a baseline
of 8.53) and hands back **73% of the lock relief** (21.0 → 24.8 against 26.2). That is
a bad exchange rate in the direction nobody wanted.

At 2p and 3p it is worse than bad. The lock rate ends up **higher than the capped rule
ever produced** - 27.4% against 25.9% at 2p, 26.4% against 25.7% at 3p. Two players
sitting down to the uncapped rule with a purse of 1/2 are more often stuck at the claim
step than they were under the old one-per-turn rule with 2/3.

The mechanism is competition inside a shrunken purse. Cupcakes bought 4684 moves at 4p
under this arm against 7756 in the baseline - a 40% collapse - because the tile is
bought first, at the sweep step, before the move is ever offered. Cutting the purse does
not make players buy fewer tiles in the moments that matter; it makes them arrive at the
claim step with nothing left for anything else.

## 2. Every other number moves the wrong way

- **Scores are the lowest of the three arms** at every count: 53.4 / 51.3 / 50.0 against
  a baseline 56.6 / 54.8 / 53.2.
- **The gap is the widest of the three arms** at every count. Last-as-a-share-of-winner
  reaches 58.4% at 4p, down from 63.2%.
- **A player can now finish having claimed nothing.** Minimum claims per player goes
  3 → 1 → **0** across the arms at 4p, and 3p shows the same 0. A gateway game that lets
  somebody sit down for eight turns and take no cards home has a failure state the other
  two arms do not have.
- **Scarcity tips into famine.** 52% of 4p games end with a broke player. The spend
  share of influx does not rise (73.8% against the uncapped arm's 73.1%), which says the
  extra cupcakes were not the thing being wasted - there is simply less of everything.

## 3. It makes the seat problem worse, because a flat cut is not flat

This is the finding worth keeping even if the arm is dropped.

| 4p seat | opening | UNCAPPED | UNCAPPED -1 |
|---|---|---|---|
| seat 1 | 2 → 1 | -2.5 | **-7.8** |
| seat 2 | 3 → 2 | -3.3 | -1.1 |
| seat 3 | 4 → 3 | -0.7 | +2.7 |
| seat 4 | 5 → 4 | **+6.6** | +6.2 |

Both uncapped arms favour the last seat. Cutting 1 from everybody does not touch that -
seat 4 stays at about +6 - but it takes **half of seat 1's opening purse and a fifth of
seat 4's**. The stagger exists to compensate seat 1 for sweeping a fuller market; a flat
subtraction is a proportionally uneven cut that eats the compensation from the bottom
up. Seat 1 falls from -2.5 to -7.8. At 3p the top seat goes from +3.7 to +8.3.

If the purse is going to fund the uncapped tile, the change has to be made to the
**differences** in the table, not to its level.

## Verdict

The -1 cut is a second lever pulled in the same direction as the first arm's costs. It
buys back a third of the game length and pays for it with three quarters of the lock
relief, the lowest scores of any arm, the widest winner-to-last gap of any arm, a new
zero-claim failure state, and a seat ladder further out of true than either other arm.

**It should not ship as the fix.** The two candidates from v1 stand:

1. `setMaxExtraTilesPerTurn(2)` or `(3)` - cap the clumping rather than starve the
   purse. The distribution says two-tile turns are the bulk of the benefit (3178 of
   4311 multi-buys at 4p in this arm; 3735 of 5689 in the uncapped one).
2. An **escalating price** (1 / 2 / 3 within a turn) - a small engine change, and the
   only candidate that directly addresses the spend menu collapsing into one option.

Both leave the opening purse alone, which the seat table currently depends on.

## Caveats

Unchanged from v1. Bot vision makes every effect here a floor: `decideExtraTile` only
buys to unlock a claim this turn and reaches two tiles deep. 1500 games per cell; seat
figures carry a ±2.5 noise band, so the -7.8 and +8.3 readings are real and the -1.1 is
not distinguishable from even.
