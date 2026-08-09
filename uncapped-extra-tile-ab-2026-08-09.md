# The uncapped extra tile - A/B, 9 August 2026

**The rule tested.** The sweep-step extra tile loses its once-per-turn allowance. A
player may buy as many tiles as they can pay for, at a flat 1 cupcake each. Nothing
else changes: same price, same step, same requirement that the board have room for
every tile bought on top of the ones already pending. All five other cupcake spends
stay once-per-turn.

**How it was run.** 1500 games per arm per player count, basic bot, both arms from
the same code. `maxtiles=1` restores the old rule exactly (verified: the buying
distribution in every baseline arm is 100% single purchases); `maxtiles=unlimited`
is the new one.

    node simulate.js 1500 4 basic maxtiles=1
    node simulate.js 1500 4 basic maxtiles=unlimited

Raw output: `sim-uncapped-tiles-2026-08-09-{2,3,4}p-{baseline,uncapped}.txt`

---

## Headline

| | 2p base | 2p unc | 3p base | 3p unc | 4p base | 4p unc |
|---|---|---|---|---|---|---|
| claim-step lock rate | 25.9% | **23.6%** | 25.7% | **22.4%** | 26.2% | **21.0%** |
| turns per player | 8.91 | **8.31** | 8.66 | **7.94** | 8.53 | **7.62** |
| claims per player | 6.61 | 6.35 | 6.44 | 6.16 | 6.30 | 6.01 |
| mean final score | 56.6 | 54.3 | 54.8 | 52.2 | 53.2 | 50.7 |
| last as % of winner | 80.0% | 77.7% | 70.0% | 66.8% | 63.2% | **60.7%** |
| extra tiles bought | 6585 | **10664** | 9673 | **16975** | 12723 | **24228** |
| cupcakes kept at end | 2.63 | 1.98 | 3.11 | 2.07 | 3.55 | **2.27** |
| games with a broke player | 17.8% | 29.0% | 22.5% | 39.5% | 21.9% | **46.3%** |
| games with 4+ unspent | 52.1% | 28.1% | 84.3% | 43.3% | 95.9% | **65.5%** |
| worst seat deviation | +2.1 | -1.1 | +3.3 | +3.7 | -2.2 | **+6.6** |

Every game at every count still ends on `boardFull`.

## 1. It does what it was meant to do

Card lock falls at every count, and the relief scales with the table: -2.3 points at
2p, -3.3 at 3p, **-5.2 at 4p**, where a quarter of locked claim steps stop being
locked. Players take it up readily - multi-buy turns are 29% / 33% / 36% of all
buying turns, and the biggest single turn bought 5 / 5 / 7 tiles.

That is a real answer to the dominant complaint. Six locked turns in ten are a player
one tile short of a card already on the row, and this is the only spend on the menu
that can hand them that tile.

## 2. It buys the clock forward, which is the cost nobody asked for

The game ends when somebody's board fills. Tiles are the clock, so a rule that sells
tiles sells the ending.

**Turns per player fall 6.7% / 8.3% / 10.7%.** At 4p that is most of a whole turn
gone from every player's game. Everything downstream follows: claims per player down,
mean score down 2.3-2.5 VP, and the stand - the biggest single scoring lane - down
1.6-1.9 VP because there are fewer turns to build it in.

So the trade is not "fluidity for free". It is fluidity for about a turn each and
about 5% of everyone's score. The game gets easier to play and smaller.

## 3. It widens the gap

Last-as-a-share-of-winner falls at every count: 80.0 → 77.7, 70.0 → 66.8, 63.2 → 60.7.
Absolute winner-minus-last rises. Both directions are wrong for a gateway game, and
the mechanism is easy to state: the player who is ahead converts cupcakes into board
faster, and the shorter game gives the player behind less room to recover. The two
effects compound.

## 4. It collapses the spend menu

Cupcake outlets, baseline → uncapped, 4p:

| spend | times bought | change |
|---|---|---|
| extra tile | 12723 → 24228 | **+90%** |
| move a tile | 7756 → 5108 | -34% |
| reserve a card | 7206 → 6095 | -15% |
| remove a plate | 718 → 442 | -38% |
| deal 2 cards | 870 → 798 | -8% |

The same pattern holds at 2p and 3p. The extra tile stops being one of five options
and becomes what a cupcake is *for*; every other spend is crowded out. The 9 August
argument for keeping the extra tile and the card deal side by side - two doors into
different rooms - survives on paper but is being priced out in practice.

## 5. It fixes the surplus, genuinely

This is the clear win. Cupcakes had no scarcity: 95.9% of 4p games ended with somebody
sitting on 4 or more, and a third of all influx was never spent. Uncapped, that falls
to 65.5%, holdings at game end drop from 3.55 to 2.27, and 46.3% of games now have a
player who ran out. Spend as a share of influx goes from 58.5% to 73.1%. The currency
finally bites.

## 6. It breaks seat fairness at 4p

Worst seat deviation goes from -2.2 to **+6.6 points**, far outside both the ±2 target
and the ±2.5 noise band. The staggered opening (2/3/4/5) exists to compensate seat 1
for sweeping a fuller market, and it works by letting later seats buy market access. If
access becomes buyable without limit, the compensation over-corrects - which is exactly
what the note beside `STARTING_CUPCAKES_BY_SEAT` predicts happens whenever the
underlying access changes. 2p improves (+2.1 → -1.1); 3p is unchanged within noise
(+3.3 → +3.7); 4p breaks.

If this rule ships, the stagger has to be re-tuned from scratch. It is not a small
follow-up.

---

## Caveats

- **Bot vision is a floor, not a ceiling.** `basicBot.decideExtraTile` grew a
  second-tile reach for this test (one greedy step, cascading), and it only ever buys
  to unlock a claim this turn. A human will see three-tile shapes it cannot, and will
  also buy tiles for the stand, for the Flavour of the Day, or to end the game on
  their terms. Every effect above should be read as an understatement.
- **The clock effect will be larger at a real table** for the same reason: a human who
  wants the game to end can now buy the ending.
- 1500 games per configuration. Scores, turns and lock rates are far outside noise;
  the seat figures carry a ±2.5 band, so only the 4p move is safely real.

## What to try next

Both are one flag on the existing seam, no engine change:

1. **`setMaxExtraTilesPerTurn(2)`** - probably keeps most of the lock relief (the
   distribution says 2-tile turns are the bulk of multi-buys: 3735 of 5689 at 4p) while
   halving the clock acceleration and the seat damage.
2. **`setMaxExtraTilesPerTurn(3)`** - the same question one notch looser.

The other candidate needs a small engine change rather than a flag: an **escalating
price** (1 / 2 / 3 for the first, second, third tile in a turn). That is the direct
answer to §4 - it keeps the big rearrangement possible on the turn it matters while
stopping a cupcake from being worth strictly more as a tile than as anything else.
