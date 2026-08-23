/* Central tuning. Anything a designer would fiddle with lives here. */

export const CFG = {
  /* Layout — fractions of the canvas height unless noted. */
  groundY: 0.86,          // where stems meet the soil
  horizon: 0.52,          // sky/hill split
  maxStemH: 0.60,         // tallest a stem may reach, as a fraction of height
  headScale: 1.8,         // blooms are drawn well above life size so they are thumb-sized

  /* Round pacing */
  roundSeconds: 45,
  strikesAllowed: 3,
  baseSpawnGap: 1150,     // ms between sprouts on round 1
  spawnGapFloor: 460,     // fastest we ever spawn
  spawnGapDecay: 0.90,    // multiplied per round
  /* Random spread on each gap, as a fraction either side. Some jitter keeps
     the field from ticking like a metronome; too much and how many stems a
     round even offers becomes its own lottery, on top of everything else
     the player is already being asked to handle. */
  spawnGapJitter: 0.25,
  maxAlive: 2,            // cap on round 1, so blades have room to work
  maxAliveStep: 3,        // rounds between each +1 to the cap
  maxAliveCap: 4,         // cap never climbs past this
  lifespanScale: 1.0,     // shrinks with round number
  lifespanFloor: 0.62,

  /* Spacing: new stems only sprout where their canopy clears its neighbours
     by this many screen-heights, so an accidental swipe can't clip the
     flower next door. Measured edge-to-edge between head radii. */
  spawnClearance: 0.15,
  /* Later rounds may pack a little tighter, or the field starves and the
     quota becomes unreachable. Multiplier on the clearance, per round. */
  clearanceEase: 0.06,
  clearanceFloor: 0.55,

  /* Every cuttable stem is worth the same base score — technique decides
     the rest, not which species you happened to draw. A "clean" cut lands
     right around cutBase; a butchered one drops toward its floor; a
     flawless one clears it. */
  cutBase: 100,
  /* Flat cost of stinging any weed, regardless of which one. */
  stingPenalty: 100,

  /* Quota to clear a round: grows super-linearly. Round 1 wants roughly a
     dozen decent stems; by round 5 sloppy cutting will not keep up.

     That 26%-per-round growth is only fair while the field itself is
     getting more generous at close to that rate — and it is, but only
     through round 7. maxAlive climbs from 2 to 4 over rounds 1-7 (see
     maxAliveStep/maxAliveCap below) and the spawn gap keeps shrinking, so
     both how many stems can be on screen and how fast they arrive are
     rising together, roughly tracking the quota. Once maxAlive hits its
     cap at round 7, only the spawn gap keeps improving — and it is most
     of the way to its own floor by then — so a target that kept
     compounding at 26% would be asking for a scoring rate the field can no
     longer physically supply, not a harder round. Confirmed empirically: a
     bot that cuts at the right angle, point and speed and never touches a
     hazard cleared rounds 1-7 at 100-113% of quota, then round 10 at just
     39% under the old single-rate curve. quotaGrowthLate is deliberately
     held under the ~10%/round the spawn gap alone can still buy, since the
     quota is a hard pass/fail and spawn luck (species mix, layout) varies
     run to run — the margin is there so an unlucky round is still winnable
     on skill, not just a lucky one. */
  quotaBase: 950,
  quotaGrowth: 1.26,
  quotaGrowthLate: 1.08,
  quotaPlateauRound: 7,   // the round maxAlive first reaches maxAliveCap

  /* Wind. A gust travels across the meadow rather than every stem drifting
     on its own clock, so the field leans together the way a real one does.
     Amplitudes stay small: the stem you are aiming at is the stem you cut,
     so anything livelier would just make the blade harder to place. */
  wind: {
    breeze: 0.017,      // per-stem idle drift, keeps stems from moving in lockstep
    gust: 0.025,        // extra lean at the crest of a passing gust
    waves: 1.35,        // gust crests visible across the field at once
    period: 5200,       // ms for a crest to cross the whole meadow
    headLag: 90,        // ms the (heavy) head trails behind its stem
    lagTilt: 3.2,       // how far that lag tips the bloom
  },

  /* The beat the game holds on an immaculate cut, and how far time slows
     during it. Kept brief so the round keeps its rhythm. */
  slowmoMs: 190,
  slowmoScale: 0.34,

  /* How the field decides what to sprout next.

     Drawing each spawn independently lets the same species turn up three
     or four times in a row, and a round that happens to deal a run of the
     narrow-tolerance ones is simply a harder round through no fault of the
     player. That cuts against the one rule this game is tuned around: a
     better player should score better (see DESIGN.md).

     So a species that has just appeared has its weight knocked down and
     then recovers over the following spawns. Never to zero — the field
     should still feel like it is being dealt, not cycled through a fixed
     rota — but enough that the mix a round hands you stays close to the
     mix it is supposed to. */
  spawnBag: {
    repeat: 0.30,     // weight multiplier applied to a species right after it spawns
    recovery: 0.34,   // fraction of the way back to full weight, per later spawn
  },

  /* Weeds.

     They are budgeted apart from the harvest: `maxAlive` counts flowers
     only, so how much there is to cut never depends on how many nettles the
     field happened to deal. What weeds cost you is *lines* — every one on
     screen is more ground a swipe has to miss on its follow-through — and
     that is a cost skill can answer, unlike simply being handed less to cut.

     Which makes their number a difficulty dial rather than a tax: how many
     may stand at once is fixed per round, so late rounds get a thicker,
     more hemmed-in field on purpose. Only *where* and *when* they appear is
     left to chance. */
  hazards: {
    useSlots: false,   // true puts weeds back in competition for maxAlive
    aliveBase: 1,      // weeds allowed to stand together on round 1
    aliveStep: 4,      // rounds between each extra weed permitted
    aliveCap: 3,
    /* Spawn weight multiplier, by rounds since that weed unlocked: eases in
       so a new weed never arrives in force. This is the dial for late
       difficulty — raising weightCap costs the player lines to cut through,
       never stems to cut, which is the kind of pressure skill can answer.

       It is potent, so it is set here at the balance the quota curve was
       tuned against rather than to a harder default. Measured, four skill
       levels, 720 rounds: at cap 1.0 a top player clears round 8 63% of the
       time; at 1.6 that falls to 47%, and at 2.6 to 38%, with round 10
       going 68% -> 47%. Skill still decides the round throughout — skill's
       share of the variance held at 43-69% — so a harder default is a fair
       thing to want, but the quota has to come down with it. */
    weightBase: 0.45,
    weightStep: 0.2,
    weightCap: 1.0,
  },

  /* Practice: one chosen flower at a time, dead centre, no clock. */
  practiceRespawn: 700,   // ms of calm after a cut before the next sprouts

  /* Where the "+points / grade" popup appears: a fixed height near the top
     of the screen (fraction of view height) rather than at the cut, so it
     reads clearly no matter how tall the stem was or where you swiped. */
  feedbackY: 0.32,

  /* Gesture analysis */
  strokeMaxPoints: 220,
  strokeIdleMs: 130,      // a pause this long ends the logical stroke
  finalizeDelay: 520,     // ms after a cut before we grade it (waits for the stroke to finish)
  crossWindow: 900,       // ms allowed between the two strokes of a cross-cut
  minSliceSpeed: 0.25,    // screen-heights/s below which the blade does not bite

  /* Speed bands, in screen-heights per second. Widened from the original
     tuning — real thumbs on real glass land off-centre in the band far
     more often than a mouse-driven test ever does. */
  speeds: {
    slow:   { min: 0.14, lo: 0.36, hi: 1.35, max: 2.15 },
    steady: { min: 0.55, lo: 1.10, hi: 2.95, max: 4.20 },
    fast:   { min: 1.55, lo: 2.55, hi: 7.40, max: 10.40 },
  },

  /* How much each part of the *technique* counts. Re-normalised when a
     species has no angle requirement. Timing is not in here: it gates the
     whole cut instead (see `timingGate`), because a flawless cut through a
     closed bud is still a ruined flower. */
  weights: { point: 0.30, angle: 0.28, speed: 0.18, pattern: 0.24 },

  /* quality = mean × (worstPull …1) × (timingGate …1)
     A mistimed or one-axis-bad cut should read as "not your best," not as
     a wipeout — the multiplicative floors below keep a merely-okay cut in
     "Good" territory instead of crushing it into "Ragged". */
  timingGate: 0.55,       // score kept when the moment is completely wrong
  worstPull: 0.15,        // share of the score held hostage by the weakest criterion

  /* Extra headroom on every species' angle/point tolerance, on top of the
     numbers in species.js — a blanket buffer for real touch imprecision
     that a synthetic mouse swipe never has to fight. */
  toleranceSlack: 1.4,

  /* The bloom-timing target window: life fraction, and how forgiving the
     falloff either side of it is. Shared by scoring and the ring guide so
     the picture never lies about what actually scores well. */
  timingWindow: { lo: 0.56, hi: 0.82, tol: 0.22 },

  /* `key` is the translation lookup (see i18n.js grade.*); no display text
     lives here so this file stays language-agnostic. */
  grades: [
    { min: 0.93, key: 'immaculate', color: '#ffe9a3', shake: 9 },
    { min: 0.80, key: 'clean',      color: '#a7e8a0', shake: 6 },
    { min: 0.62, key: 'good',       color: '#cfe0cc', shake: 4 },
    { min: 0.40, key: 'ragged',     color: '#e8c98a', shake: 3 },
    { min: -1,   key: 'butchered',  color: '#ff9d92', shake: 2 },
  ],

  comboStep: 0.15,        // multiplier gained per good cut
  comboMax: 3.0,
  comboKeepAbove: 0.62,   // quality needed to build the combo
  comboBreakBelow: 0.40,  // quality that snaps it
  /* What a bad cut costs off the multiplier. A full wipe made one slip
     decide a run: from 3x it took a dozen clean cuts to climb back, so a
     round's score turned on where the mistakes happened to fall rather
     than on how many there were. Losing ground still stings without
     erasing everything earned before it. Set at or above comboMax - 1 to
     restore the old all-or-nothing behaviour. */
  comboBreakLoss: 1.0,
};

/** The points needed to clear a round — two growth rates spliced at
    quotaPlateauRound, where maxAlive stops climbing (see CFG.quotaGrowth's
    comment for why the split exists). */
export function quotaForRound(round) {
  const { quotaBase, quotaGrowth, quotaGrowthLate, quotaPlateauRound } = CFG;
  if (round <= quotaPlateauRound) {
    return Math.round(quotaBase * Math.pow(quotaGrowth, round - 1));
  }
  const atPlateau = quotaBase * Math.pow(quotaGrowth, quotaPlateauRound - 1);
  return Math.round(atPlateau * Math.pow(quotaGrowthLate, round - quotaPlateauRound));
}

/* Life-cycle phase boundaries, as fractions of a stem's lifespan. */
export const PHASE = {
  sprout: 0.00,
  grow:   0.16,
  bud:    0.44,
  bloom:  0.56,
  peak:   0.68,
  wilt:   0.82,
  dead:   0.95,
};
