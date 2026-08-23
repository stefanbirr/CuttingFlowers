# Bloom & Blade — design northstar

## Skill has to matter more than luck

**A better player must score better. When a round goes badly it should be
because of something the player did, not something the field dealt them.**

This is the rule everything else is tuned around. Where a change would make
the game prettier, or more varied, or more surprising, but weaker on this,
this wins.

It does not mean removing randomness. A field that dealt the same hand every
round would be dead. It means randomness sets the *texture* of a round, never
its *outcome* — the draw decides what the next minute feels like, the player
decides how it goes.

### Why it needed writing down

The game drifted away from this once already, quietly, in several places at
once, and none of it looked like a bug:

- Species were worth different points, so *which* flowers you drew mattered
  as much as how well you cut them.
- Spawns were drawn independently, so one round in six dealt a run of the
  fussy species and was simply harder, for no reason the player could see.
- The round quota kept compounding at 26% a round after the field had stopped
  getting more generous, so late rounds asked for a rate no player could
  supply.
- A single bad cut wiped the whole combo multiplier, so *where* a mistake
  landed in a round mattered more than how many you made.

Each was defensible on its own. Together they meant a round's outcome was
mostly decided by things outside the player's hands.

### How it is enforced now

- **Every cuttable stem is worth the same** (`CFG.cutBase`). Technique
  decides the score; the species decides only how hard that technique is.
- **Spawning has a memory** (`SpeciesBag`, `CFG.spawnBag`). A species that
  just appeared is unlikely to appear again straight away, and recovers over
  the following spawns. Never impossible — the field is a loaded shuffle, not
  a rota — but a round's mix stays near the mix it is meant to be.
- **The quota tracks what the field can actually supply**
  (`quotaForRound`). It follows the growth of `maxAlive` and the spawn rate,
  and flattens when they do.
- **A bad cut costs ground, not everything** (`CFG.comboBreakLoss`). Losing a
  streak still stings without erasing a dozen good cuts before it.
- **Weeds cost lines, not stems** (`CFG.hazards`). `maxAlive` counts flowers
  only, so how much there is to harvest never depends on how many nettles
  turned up. What a weed takes is ground a swipe has to miss on its
  follow-through — a cost skill can answer.

## The difficulty dial

`CFG.hazards.weightCap` is the intended lever for late-round difficulty. It
thickens the field with weeds, which costs the player clean lines rather than
harvest, so it makes a round harder without making it more arbitrary.

It is strong, and it is deliberately shipped at the balance the quota curve
was tuned against rather than at a harder default. Measured over 720 rounds
at four skill levels:

| `weightCap` | top player clears r8 | clears r10 |
|------------:|---------------------:|-----------:|
|    1.0 (now) |                 63% |        68% |
|         1.6 |                 47% |        47% |
|         2.6 |                 38% |        47% |

Skill still decided the round at every setting (its share of the variance
held at 43–69%), so a harder default is a legitimate thing to want — but the
quota has to come down with it, or late rounds become unclearable for
everyone rather than merely demanding.

Worth knowing when tuning it: weeds still compete with flowers for *space*
via `CFG.spawnClearance`, and a bot that has to hunt for a clean line loses
time doing it. So raising weed pressure does cost some harvest indirectly,
even though weeds no longer hold a harvest slot outright.

## How to check it

Two tools, both driving the real game through the real blade. Rounds run on a
virtual clock, so a full sweep is seconds, not hours.

```sh
# Skill ladder + the headline numbers.
node tools/simulate.mjs --rounds 5,8,10 --skill 0.25,0.5,0.75,1.0 --trials 60

# Does the species draw predict the score, holding skill fixed?
node tools/mixcheck.mjs --rounds 5,8,10 --skill 0.5,0.75 --trials 300

# Try a tuning change without editing anything.
node tools/simulate.mjs --rounds 8 --skill 0.5,1.0 --cfg '{"comboBreakLoss":0.6}'
```

`simulate.mjs` reports two numbers per round:

- **skillShare** — of all the variation in scores, the share explained by
  *which bot played* rather than *which seed it drew*. Above 50% means skill
  is the larger factor.
- **ordered** — how often the better bot actually beat the worse one on the
  same starting field. The blunter reading of the same question.

`mixcheck.mjs` answers the narrower question the northstar names directly:
with skill held fixed, how well does the species mix predict the score? It
fits per-species difficulty on half the runs and measures on the other half —
fitting and testing on the same batch hands eleven free parameters to a few
hundred points and manufactures a correlation out of noise.

### Where it stands

Measured over 720 simulated rounds at four skill levels:

| round | skillShare | ordered (adjacent) |
|------:|-----------:|-------------------:|
|     5 |        40% |                76% |
|     8 |        60% |                78% |
|    10 |        60% |                78% |

A clearly better player wins essentially always. Between neighbouring skill
levels a quarter-step apart it is about three times in four, which is roughly
what that gap should buy.

Unresolved: `mixcheck.mjs` currently reports the species draw correlating with
the score at r ≈ 0.65–0.88, not the r ≈ 0.1–0.2 an earlier note in this file
claimed. The same numbers come out of the code from before the two-speed
change, so it is not a regression — either the tool drifted or the earlier
figure was read off something else. Worth settling before trusting either.

### Two things worth knowing before you read those numbers

**A round ends the moment its quota is met.** So on a round a player clears
comfortably, extra skill has nowhere to go in the score and `skillShare`
collapses — round 3 reads 29%, which looks alarming and is not. Skill is
still there, expressed as speed: with both bots clearing, the better one
clears faster about three times in four (36.1s → 31.0s). Judge easy rounds on
time, not points.

**Low-skill runs are swingy by nature**, which drags `skillShare` down from
the bottom end. A sloppy player striking out at ten seconds and a sloppy
player surviving to the whistle are far apart, and that gap is mostly theirs.
Consistency is part of what skill buys.

### A finding this contradicts, on purpose

Cutting slightly *before* the bloom window costs about 7% of a cut's quality
(`CFG.timingGate` is forgiving) but frees a spawn slot sooner — and late
rounds are capped by the field's throughput, not the blade. So rushing is
measurably better than waiting for the perfect moment, which undercuts the
"wait for the bloom" mechanic. It is not a fairness problem, so it is not
covered by the rule above, but it is worth fixing when the timing window is
next revisited.

## Two cut speeds, and what that cost

`CFG.speeds` had three bands. The middle one asked the player to tell "steady"
from its neighbours by feel, which no thumb does reliably, so it read as noise
rather than as technique. It is gone; the five species that used it were split
between slow and fast.

That change is not free. Measured at skill 1.0 over 400 rounds, it dropped the
top bot's clear rate on rounds 8 and 10 from 65%/68% to 51%/51% — the same
cuts, slightly less of the round's time budget left over. `quotaBase` came down
950 → 880 to put it back (63%/60%). If the bands are ever retuned, expect the
quota to move with them.

One combination is worth avoiding on its own merits: **fast plus zigzag**.
Sawing is a repeated motion, and asking for it at whip speed cost about five
points of clear rate by itself. Pampas grass is a slow saw for that reason.
