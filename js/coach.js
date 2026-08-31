/* Turns one failed round's log into one short, specific thing to work on
   next — numbers pulled from the round that just happened, not generic
   advice. Reuses the same per-axis breakdown and phrasing the in-round
   popup already grades against (see scoring.js, i18n.js), so a tip here
   always agrees with what practice mode would have told you. */

import { CFG } from './config.js';
import { SPECIES } from './species.js';
import { t, plural, speciesName, weakNoteText } from './i18n.js';

const AXES = ['timing', 'point', 'angle', 'speed', 'pattern'];

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

/** Replays a round's cuts through the same combo/points formula the game
    itself scores with (see Game#finalize), with alternate qualities
    substituted in — how "would fixing these have been enough" gets
    answered without touching game state. */
function replayTotal(qualities) {
  let combo = 1, streak = 0, total = 0;
  for (const q of qualities) {
    if (q >= CFG.comboKeepAbove) {
      streak++;
      combo = Math.min(CFG.comboMax, 1 + streak * CFG.comboStep);
    } else if (q < CFG.comboBreakBelow) {
      combo = Math.max(1, combo - CFG.comboBreakLoss);
      streak = Math.max(0, Math.round((combo - 1) / CFG.comboStep));
    }
    total += Math.round(CFG.cutBase * (0.25 + q * 0.95) * combo);
  }
  return total;
}

/** A cut that neither built nor broke the combo: not bad enough to cost
    anything by itself, but not good enough to grow the multiplier every
    cut after it also rides on. The single most common way a round that
    "felt fine" still comes up short. */
function nearMissTip(roundLog) {
  const { quota, events, summary } = roundLog;
  const cuts = events.filter((e) => e.type === 'cut');
  const dead = cuts.filter((c) => c.quality >= CFG.comboBreakBelow && c.quality < CFG.comboKeepAbove);
  if (!dead.length) return null;
  const lifted = cuts.map((c) => (dead.includes(c) ? CFG.comboKeepAbove + 0.01 : c.quality));
  if (replayTotal(lifted) < quota) return null;
  return plural('coach.nearMiss', dead.length, { shortfall: Math.max(0, quota - summary.points) });
}

/** The species dragging the round's average down, and — averaging the
    same axis scores the live popup grades a single cut against — which
    part of the technique was consistently the problem. */
function weakSpeciesTip(roundLog) {
  const cuts = roundLog.events.filter((e) => e.type === 'cut');
  const bySpecies = new Map();
  for (const c of cuts) {
    if (!bySpecies.has(c.species)) bySpecies.set(c.species, []);
    bySpecies.get(c.species).push(c);
  }
  const overall = mean(cuts.map((c) => c.quality));
  let worst = null;
  for (const [species, list] of bySpecies) {
    if (list.length < 2) continue; // one bad cut proves nothing about the species
    const avg = mean(list.map((c) => c.quality));
    if (avg < 0.70 && avg < overall - 0.10 && (!worst || avg < worst.avg)) worst = { species, avg, list };
  }
  if (!worst) return null;

  const axisAvg = {};
  for (const axis of AXES) {
    const vals = worst.list.map((c) => c.parts[axis]).filter((v) => v != null);
    if (vals.length) axisAvg[axis] = mean(vals);
  }
  const ranked = Object.entries(axisAvg).sort((a, b) => a[1] - b[1]);
  if (!ranked.length || ranked[0][1] >= 0.75) return null;
  const [axis] = ranked[0];
  const sample = worst.list[0];
  const descriptor = axis === 'angle'
    ? { axis, measured: Math.round(mean(worst.list.map((c) => c.angleMeasured))), target: sample.angleTarget }
    : axis === 'speed' ? { axis, speedKey: sample.speedBand }
      : axis === 'pattern' ? { axis, patternKey: sample.pattern }
        : axis === 'timing' ? { axis, early: mean(worst.list.map((c) => c.parts.timing)) < 0.5 }
          : { axis };

  const sp = SPECIES.find((s) => s.id === worst.species);
  return t('coach.weakSpecies', {
    species: sp ? speciesName(sp) : worst.species,
    pct: Math.round(worst.avg * 100),
    detail: weakNoteText(descriptor),
  });
}

/** Turn one round's log into up to two coaching lines, already localized
    and ready to render. Empty for a cleared round or one with nothing
    worth flagging. */
export function coachTips(roundLog) {
  if (!roundLog?.summary || roundLog.summary.cleared) return [];
  const cuts = roundLog.events.filter((e) => e.type === 'cut');
  if (!cuts.length) return [];

  // One tip, not a report. Which species to go practise is the most
  // concrete thing to hand someone — the near-miss arithmetic is worth
  // having, but only when there is no single species to blame instead.
  const tip = weakSpeciesTip(roundLog) || nearMissTip(roundLog);
  if (tip) return [tip];

  // Nothing species-specific stood out — fall back to whatever cost the
  // most ground, in the order it usually matters most.
  const stings = roundLog.events.filter((e) => e.type === 'sting');
  const missed = roundLog.events.filter((e) => e.type === 'missed');
  if (stings.length) {
    return [plural('coach.stingCost', stings.length, { lost: stings.length * CFG.stingPenalty })];
  }
  if (missed.length) {
    return [plural('coach.missedCost', missed.length, {})];
  }
  return [t('coach.pace', { cuts: cuts.length, seconds: roundLog.summary.secondsUsed })];
}
