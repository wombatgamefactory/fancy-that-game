# The uncapped extra tile - retuning the opening purse, 9 August 2026 (v3)

Follows `uncapped-extra-tile-ab-2026-08-09-v2.md`. v1 measured the uncapped rule,
v2 showed that cutting every seat by one is not the fix. This version finds the
opening table the uncapped rule actually wants, and settles it on 3,000-game runs.

**Recommendation: 2p 2/3, 3p 2/3/3, 4p 2/3/3/3.** Seat 1 takes 2, everyone else
takes 3. The 2-player table is unchanged from the shipped game.

---

## The two knobs, which turn out to be independent

Everything measured on 9 August separates cleanly:

- **SPREAD** (top seat minus bottom seat) sets seat fairness, at about **1.4 VP of
  score gradient per cupcake of spread**, measured consistently at 2p, 3p and 4p.
  It does not care what level it sits at.
- **LEVEL** (how many cupcakes in total) sets the economy - tiles bought, hence game
  length, lock rate and end-of-game surplus. It has almost no effect on fairness.

That is why the v2 experiment failed. Cutting every seat by one moved the level,
which was not the problem, and left the spread - which was - untouched. And it did
so unevenly, taking half of seat 1's purse and a fifth of seat 4's.

Under the capped rule the game needed a 3-cupcake spread at 4p (2/3/4/5). Under the
uncapped rule a cupcake buys unlimited market access, so **1 cupcake of spread now
does what 3 used to**. The correct shape is a single step at seat 1, not a ladder.

## The candidates, 3,000 games each

### 4 players

| table | total | worst seat | gradient | turns/pl | lock | 4+ unspent | mean score |
|---|---|---|---|---|---|---|---|
| 2/3/4/5 *(current)* | 14 | **+6.6** | -3.32 | 7.62 | 21.0% | 65.5% | 50.7 |
| 3/4/4/4 | 15 | -3.2 | +1.15 | 7.57 | 20.4% | 65.1% | 50.9 |
| 3/4/4/5 | 16 | +2.3 | -0.49 | 7.51 | 19.7% | **71.3%** | 50.9 |
| **2/3/3/3** | **11** | **+2.1** | **+0.31** | **7.82** | 23.3% | **50.1%** | 50.5 |
| *capped 2/3/4/5, for reference* | 14 | -2.2 | +0.89 | 8.53 | 26.2% | 95.9% | 53.2 |

### 3 players

| table | total | worst seat | gradient | turns/pl | lock | 4+ unspent |
|---|---|---|---|---|---|---|
| 2/3/4 *(current)* | 9 | +3.7 | -1.63 | 7.94 | 22.4% | 43.3% |
| 3/4/4 | 11 | -1.7 | +0.22 | 7.76 | 20.5% | 53.8% |
| **2/3/3** | **8** | **-0.4** | -0.39 | **8.01** | 23.5% | **37.2%** |

### 2 players

| table | total | worst seat | gradient | turns/pl | lock | 4+ unspent |
|---|---|---|---|---|---|---|
| **2/3** *(current)* | 5 | **-0.9** | -0.49 | **8.32** | 24.0% | **26.0%** |
| 3/4 | 7 | +0.3 | +0.14 | 8.04 | 21.0% | 38.0% |

The 1500-game figures for the current tables come from the v1/v2 runs; every
candidate row is 3,000 games. Noise band on a seat's win share at 3,000 games is
about ±1.6 points at 4p.

## Why the poorer table wins

Both shapes fix the seat gradient - that is the spread doing its work, and it is
why 2/3/3/3 and 3/4/4/4 read within a point of each other on gradient. The level is
what separates them, and it separates them in favour of the poorer table on three
of the four things the uncapped rule broke:

- **Seat fairness** is better at 3p (-0.4 against -1.7) and much better at 4p (+2.1
  against -3.2). The richer table over-corrects the seat it used to over-pay.
- **Game length** is longer at every count - 8.32 / 8.01 / 7.82 against 8.04 / 7.76 /
  7.57 - recovering about a fifth of what uncapping cost. The richer tables spend the
  extra cupcakes on tiles, and tiles are the clock.
- **The surplus stays fixed.** Games ending with somebody holding 4 or more spare:
  50.1% at 4p against 65.1% for 3/4/4/4 and 71.3% for 3/4/4/5. The richer tables walk
  the game back toward the 95.9% surplus that uncapping had just cured.

The one thing the richer table does better is **card lock**: 20.4% against 23.3% at
4p, about 3 points at every count. That is the relief the whole change was made for,
so it is not nothing - but the uncapped rule with the poorer table still delivers
23.3% against the capped game's 26.2%, which is 56% of the available relief kept.

Mean score and winner-to-last are a wash between the two (0.4 VP and 1 point).

## The one thing the cupcake table cannot fix

**Seat 2 at four players reads +2.1 to +2.4 in every table tested** - at 3 starting
cupcakes and at 4, in a ladder and in a step. Four different tables, same bulge. That
says it is structural rather than an artefact of the opening purse, and no value in
this table will move it. It should be looked at on its own terms rather than chased
with cupcakes; the marginal ±2 readings at 4p are all this seat.

## Verification note

`setStartingCupcakesTable()` is a new runtime seam in game.js. Before it existed, the
only way to A/B this constant was `ab-startcupcakes-2026-08-07.mjs`, which rewrites
game.js with a regex, runs a child process and restores the file in a finally block -
a harness that leaves the shipped rule corrupted if interrupted. The seam makes a
candidate table a command-line argument:

    node simulate.js 3000 4 basic maxtiles=unlimited starttable=2,3,3,3

Screening sweep: `ab-startcupcakes-uncapped-2026-08-09.mjs` (800 games per cell,
screened on score gradient because a seat's win share is too noisy at that sample).

## Caveats

Unchanged. Bot vision makes every uncapped figure a floor. The seat readings carry a
±1.6 band at 3,000 games, so +2.1 is real but marginal, and the difference between
-0.4 and +0.3 is not a difference.
