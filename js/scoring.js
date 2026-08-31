/* Turning one swipe into a grade. */

import { CFG } from './config.js';
import { clamp, tolScore, lineAngleBetween } from './util.js';

/** 1 inside the band, ramping to a floor outside it. */
export function speedScore(band, v) {
  const b = CFG.speeds[band];
  if (!b) return 1;
  if (v >= b.lo && v <= b.hi) return 1;
  if (v < b.lo) return clamp((v - b.min) / (b.lo - b.min), 0, 1) * 0.92 + 0.08;
  return clamp((b.max - v) / (b.max - b.hi), 0, 1) * 0.92 + 0.08;
}

/**
 * Grade a single harvest.
 * @param {object} cut  species.cut spec
 * @param {object} m    measurements: {timing, cutT, bladeDir, stemDir, speed, pattern, cross}
 */
export function gradeCut(cut, m) {
  const parts = {};
  const w = { ...CFG.weights };

  parts.timing = clamp(m.timing, 0, 1);
  parts.point = tolScore(m.cutT - cut.point, cut.pointTol * CFG.toleranceSlack);
  parts.speed = speedScore(cut.speed, m.speed);

  if (cut.angle == null) {
    parts.angle = 1;
    w.angle = 0;
  } else {
    const measured = lineAngleBetween(m.bladeDir.x, m.bladeDir.y, m.stemDir.x, m.stemDir.y);
    parts.angle = tolScore(measured - cut.angle, cut.angleTol * CFG.toleranceSlack);
    parts.angleDeg = measured;
  }

  parts.pattern = clamp(m.pattern, 0, 1);
  if (cut.pattern === 'cross') parts.pattern = clamp(parts.pattern * 0.4 + (m.cross ?? 0) * 0.6, 0, 1);
  // Straight is the default stroke, so it counts for less; a demanded
  // curve, saw or cross is the whole point of that species.
  w.pattern *= cut.pattern === 'straight' ? 0.72 : 1.4;

  const total = w.point + w.angle + w.speed + w.pattern;
  const mean = (parts.point * w.point + parts.angle * w.angle +
                parts.speed * w.speed + parts.pattern * w.pattern) / total;

  // Getting three things right does not excuse the fourth.
  const judged = [parts.point, parts.speed, parts.pattern];
  if (cut.angle != null) judged.push(parts.angle);
  const worst = Math.min(...judged);
  const pull = (1 - CFG.worstPull) + CFG.worstPull * worst;

  // And none of it matters if the bloom was not ready.
  const gate = CFG.timingGate + (1 - CFG.timingGate) * parts.timing;

  const quality = clamp(mean * pull * gate, 0, 1);
  return { quality, parts, weights: w, mean, worst, gate, grade: gradeInfo(quality) };
}

export function gradeInfo(q) {
  return CFG.grades.find((g) => q >= g.min) || CFG.grades[CFG.grades.length - 1];
}

/** The single biggest thing the player got wrong — a translatable
    descriptor for the popup hint; i18n.weakNoteText() renders the text. */
export function weakestPart(cut, parts) {
  const named = [
    ['timing', parts.timing, { axis: 'timing', early: parts.timing < 0.5 }],
    ['point', parts.point, { axis: 'point' }],
    ['angle', parts.angle, cut.angle != null
      ? { axis: 'angle', measured: Math.round(parts.angleDeg ?? 0), target: cut.angle } : null],
    ['speed', parts.speed, { axis: 'speed', speedKey: cut.speed }],
    ['pattern', parts.pattern, { axis: 'pattern', patternKey: cut.pattern }],
  ].filter(([, , d]) => d);

  named.sort((a, b) => a[1] - b[1]);
  const [, val, descriptor] = named[0];
  return val > 0.72 ? null : descriptor;
}
