/* Draws one recorded cut against the guide shape it was judged on — the
   ideal stroke and the actual one, in the same frame (see
   buildReplayPath in game.js for how a recording gets there). A static
   overlay for comparison, plus a scrub-able animation of the actual
   swipe so speed is something you can watch, not just read as a number. */

import { CFG } from './config.js';
import { patternPath } from './flower.js';
import { withAlpha, TAU } from './util.js';

const IDEAL_COLOR = '#ffe9a3';
const ACTUAL_COLOR = '#7fd4ff';

function drawIdeal(ctx, cut) {
  const { replayR: R, replayThick: thick } = CFG;
  ctx.save();
  ctx.strokeStyle = withAlpha(IDEAL_COLOR, 0.85);
  ctx.lineWidth = 2.6;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (cut.angleFree) ctx.setLineDash([6, 6]);
  patternPath(ctx, cut.pattern, R, thick);
  ctx.stroke();
  ctx.setLineDash([]);

  // The tolerance band the point score is judged against, so a replay
  // that looks "off centre" against the guide line can be read against
  // the same slab the live game showed while it was happening.
  ctx.fillStyle = withAlpha('#ffffff', 0.05);
  ctx.fillRect(-R, -thick / 2, R * 2, thick);
  ctx.restore();
}

/** The actual stroke, in full — used for the static "here's what you did"
    overlay. `upTo` (0..1) trims it for the scrub animation. */
function drawActual(ctx, path, upTo = 1) {
  if (!path || path.length < 2) return;
  const n = Math.max(2, Math.round(path.length * clamp01(upTo)));
  ctx.save();
  ctx.strokeStyle = ACTUAL_COLOR;
  ctx.lineWidth = 3.2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(path[0].x, path[0].y);
  for (let i = 1; i < n; i++) ctx.lineTo(path[i].x, path[i].y);
  ctx.stroke();

  // Start dot, arrowhead at the leading end — which way it went matters
  // as much as its shape.
  ctx.fillStyle = ACTUAL_COLOR;
  ctx.beginPath();
  ctx.arc(path[0].x, path[0].y, 4, 0, TAU);
  ctx.fill();

  if (n >= 2) {
    const a = path[n - 2], b = path[n - 1];
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    ctx.translate(b.x, b.y);
    ctx.rotate(ang);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-9, -5);
    ctx.lineTo(-9, 5);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

/** Full static comparison: guide + the whole recorded stroke. */
export function drawReplay(ctx, w, h, cutEvent) {
  ctx.clearRect(0, 0, w, h);
  ctx.save();
  ctx.translate(w / 2, h / 2);
  drawCrosshair(ctx);
  drawIdeal(ctx, cutEvent);
  drawActual(ctx, cutEvent.replayPath, 1);
  ctx.restore();
}

/** Same scene, with the actual stroke trimmed to `frac` (0..1) of its
    recorded duration — the frame the "play" animation steps through. */
export function drawReplayFrame(ctx, w, h, cutEvent, frac) {
  ctx.clearRect(0, 0, w, h);
  ctx.save();
  ctx.translate(w / 2, h / 2);
  drawCrosshair(ctx);
  drawIdeal(ctx, cutEvent);
  drawActual(ctx, cutEvent.replayPath, pathFractionForTime(cutEvent.replayPath, frac));
  ctx.restore();
}

/** The animation plays back in real recorded time, not point-count, so a
    slow careful draw and a fast whipped snap still feel like themselves. */
function pathFractionForTime(path, frac) {
  if (!path || path.length < 2) return frac;
  const total = path[path.length - 1].t || 1;
  const targetT = total * clamp01(frac);
  let i = 0;
  while (i < path.length && path[i].t <= targetT) i++;
  return i / path.length;
}

export function replayDurationMs(cutEvent) {
  const path = cutEvent.replayPath;
  if (!path || path.length < 2) return 0;
  return path[path.length - 1].t || 0;
}

function drawCrosshair(ctx) {
  ctx.save();
  ctx.strokeStyle = withAlpha('#ffffff', 0.10);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-CFG.replayR * 1.3, 0); ctx.lineTo(CFG.replayR * 1.3, 0);
  ctx.stroke();
  ctx.restore();
}
