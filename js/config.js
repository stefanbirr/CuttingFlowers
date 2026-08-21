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
     dozen decent stems; by round 5 sloppy cutting will not keep up. */
  quotaBase: 950,
  quotaGrowth: 1.26,

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
};

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
