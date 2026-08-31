/* Blade input: captures the swipe, hands the game one segment at a time
   for slicing, and measures what the stroke actually did — direction and
   speed at the moment of contact, and the overall shape of the gesture. */

import { CFG } from './config.js';
import { clamp, resample, turnBetween, TAU } from './util.js';

const TRAIL_MS = 190;

export class Blade {
  constructor(canvas, view) {
    this.canvas = canvas;
    this.view = view;
    this.points = [];        // current logical stroke: {x, y, t}
    this.trail = [];         // visual ribbon, decays independently
    this.strokeId = 0;
    this.active = false;
    this.pointerId = null;
    this.onSegment = null;   // (a, b, strokeId) => void
    this.onStrokeEnd = null; // (strokeId) => void
    this.enabled = false;
    this._bind();
  }

  _bind() {
    const c = this.canvas;
    const opts = { passive: false };
    c.addEventListener('pointerdown', (e) => this._down(e), opts);
    c.addEventListener('pointermove', (e) => this._move(e), opts);
    c.addEventListener('pointerup', (e) => this._up(e), opts);
    c.addEventListener('pointercancel', (e) => this._up(e), opts);
    // Belt and braces against iOS gestures.
    c.addEventListener('touchstart', (e) => e.preventDefault(), opts);
    c.addEventListener('touchmove', (e) => e.preventDefault(), opts);
    c.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  _pos(e) {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top, t: performance.now() };
  }

  _down(e) {
    if (!this.enabled || this.active) return;
    this.pointerId = e.pointerId;
    this.active = true;
    this.strokeId++;
    this.points = [this._pos(e)];
    // Capture keeps the stroke alive if the finger crosses HUD chrome or
    // slips past the edge of the canvas mid-swipe.
    try { this.canvas.setPointerCapture(e.pointerId); } catch { /* not supported */ }
    e.preventDefault();
  }

  _move(e) {
    if (!this.enabled) return;
    const p = this._pos(e);
    if (!this.active || e.pointerId !== this.pointerId) return;
    e.preventDefault();

    // Coalesced events give a much truer speed reading on 120 Hz screens,
    // but the list is empty for synthetic events — fall back to the event.
    let raw = e.getCoalescedEvents ? e.getCoalescedEvents() : null;
    if (!raw || raw.length === 0) raw = [e];
    for (const ev of raw) {
      const q = raw.length > 1 ? this._pos(ev) : p;
      const prev = this.points[this.points.length - 1];
      if (!prev) { this.points.push(q); continue; }
      if (Math.hypot(q.x - prev.x, q.y - prev.y) < 1.2) continue;
      this.points.push(q);
      this.trail.push(q);
      if (this.points.length > CFG.strokeMaxPoints) this.points.shift();
      if (this.onSegment) this.onSegment(prev, q, this.strokeId);
    }
  }

  _up(e) {
    if (!this.active || (e.pointerId != null && e.pointerId !== this.pointerId)) return;
    try { this.canvas.releasePointerCapture(e.pointerId); } catch { /* already gone */ }
    this.active = false;
    this.pointerId = null;
    if (this.onStrokeEnd) this.onStrokeEnd(this.strokeId);
  }

  release() {
    if (!this.active) return;
    this.active = false;
    this.pointerId = null;
    if (this.onStrokeEnd) this.onStrokeEnd(this.strokeId);
  }

  update(now) {
    while (this.trail.length && now - this.trail[0].t > TRAIL_MS) this.trail.shift();
  }

  /** Blade direction around a stroke index, over a short window.
      Wider than it looks necessary: a short baseline on a real touchscreen
      turns ordinary finger jitter into a large angular error, since the
      same few pixels of perpendicular wobble matter far more over a short
      distance than a long one. */
  dirAt(index, radius = 6) {
    const p = this.points;
    if (p.length < 2) return { x: 1, y: 0 };
    const a = p[clamp(index - radius, 0, p.length - 1)];
    const b = p[clamp(index + radius, 0, p.length - 1)];
    let dx = b.x - a.x, dy = b.y - a.y;
    if (Math.hypot(dx, dy) < 2) {
      const a2 = p[clamp(index - 1, 0, p.length - 1)];
      const b2 = p[clamp(index + 1, 0, p.length - 1)];
      dx = b2.x - a2.x; dy = b2.y - a2.y;
    }
    const l = Math.hypot(dx, dy) || 1;
    return { x: dx / l, y: dy / l };
  }

  /** Speed around a stroke index, in screen heights per second. */
  speedAt(index, windowMs = 70) {
    const p = this.points;
    if (p.length < 2) return 0;
    const i = clamp(index, 0, p.length - 1);
    const t0 = p[i].t;
    let lo = i, hi = i;
    while (lo > 0 && t0 - p[lo - 1].t < windowMs) lo--;
    while (hi < p.length - 1 && p[hi + 1].t - t0 < windowMs) hi++;
    if (hi === lo) { lo = Math.max(0, i - 1); hi = Math.min(p.length - 1, i + 1); }
    let dist = 0;
    for (let k = lo + 1; k <= hi; k++) dist += Math.hypot(p[k].x - p[k - 1].x, p[k].y - p[k - 1].y);
    const dur = Math.max(8, p[hi].t - p[lo].t);
    // Against the scale everything is drawn at, not the screen's height —
    // see CFG.speedRef for why that difference matters on a rotation.
    return (dist / dur) * 1000 / (CFG.speedRef * this.view.scale);
  }

  /** Index of the most recently pushed point. */
  get head() { return this.points.length - 1; }

  /** Snapshot of the whole stroke's shape. */
  shape() {
    return analyseShape(this.points, this.view.scale);
  }

  draw(ctx, now) {
    const tr = this.trail;
    if (tr.length < 2) return;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalCompositeOperation = 'lighter';
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 1; i < tr.length; i++) {
        const age = (now - tr[i].t) / TRAIL_MS;
        const k = clamp(1 - age, 0, 1);
        ctx.beginPath();
        ctx.moveTo(tr[i - 1].x, tr[i - 1].y);
        ctx.lineTo(tr[i].x, tr[i].y);
        if (pass === 0) {
          ctx.strokeStyle = `rgba(120,220,160,${0.16 * k})`;
          ctx.lineWidth = (16 + 12 * k) * this.view.scale;
        } else {
          ctx.strokeStyle = `rgba(232,255,240,${0.85 * k})`;
          ctx.lineWidth = (1.5 + 4.2 * k) * this.view.scale;
        }
        ctx.stroke();
      }
    }
    ctx.restore();
  }
}

/* ── Gesture shape analysis ──────────────────────────────────────── */

/** Redraw a stroke as a fixed number of evenly spaced points along its own
    length, then smooth it lightly. Pointer jitter is per-sample and
    uncorrelated, so averaging neighbours removes it while leaving real
    curvature alone. Everything measured off this is a property of the
    shape rather than of how many samples the stroke happened to produce —
    which is decided by swipe speed, not by how the stroke looked. */
function normalisePath(points, n = 32) {
  if (points.length < 2) return null;
  const cum = [0];
  for (let i = 1; i < points.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y));
  }
  const total = cum[cum.length - 1];
  if (total < 1e-6) return null;

  const even = [];
  let j = 0;
  for (let k = 0; k < n; k++) {
    const target = (total * k) / (n - 1);
    while (j < points.length - 2 && cum[j + 1] < target) j++;
    const seg = (cum[j + 1] - cum[j]) || 1;
    const f = clamp((target - cum[j]) / seg, 0, 1);
    even.push({
      x: points[j].x + (points[j + 1].x - points[j].x) * f,
      y: points[j].y + (points[j + 1].y - points[j].y) * f,
    });
  }
  return even.map((p, i) => {
    const a = even[Math.max(0, i - 1)];
    const b = even[Math.min(even.length - 1, i + 1)];
    return { x: (a.x + p.x * 2 + b.x) / 4, y: (a.y + p.y * 2 + b.y) / 4 };
  });
}

/** How far the stroke wandered off the straight line joining its own ends,
    and how much of its travel actually got it anywhere. Both are ratios of
    the stroke's own size, so they say the same thing about a gesture
    whether it was flicked in four samples or dragged in sixty. */
function strayness(points) {
  const pts = normalisePath(points);
  // No stroke to speak of: treat it as trivially clean rather than punish
  // a cut the slicer only registered on a couple of samples.
  if (!pts) return { strayRatio: 0, efficiency: 1 };
  const p0 = pts[0], pN = pts[pts.length - 1];
  const dx = pN.x - p0.x, dy = pN.y - p0.y;
  const chord = Math.hypot(dx, dy);
  // Ended up back where it started — there is no line to be straight along.
  if (chord < 1) return { strayRatio: 1, efficiency: 0 };

  let walked = 0;
  for (let i = 1; i < pts.length; i++) {
    walked += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  }
  const ux = dx / chord, uy = dy / chord;
  let sum = 0;
  for (const p of pts) {
    const off = (p.x - p0.x) * -uy + (p.y - p0.y) * ux;
    sum += off * off;
  }
  return {
    strayRatio: Math.sqrt(sum / pts.length) / chord,
    efficiency: chord / Math.max(walked, chord),
  };
}

/**
 * Reduce a stroke to a few numbers describing its shape.
 * @returns {{absTurn:number, netTurn:number, reversals:number, span:number,
 *            strayRatio:number, efficiency:number, kind:string}}
 */
export function analyseShape(points, scale = 1) {
  const pts = resample(points, 13 * scale);
  const { strayRatio, efficiency } = strayness(points);
  const out = {
    absTurn: 0, netTurn: 0, reversals: 0, span: 0, dirNet: null,
    strayRatio, efficiency, kind: 'straight',
  };
  if (pts.length < 3) {
    if (pts.length === 2) out.span = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
    return out;
  }
  const dx = pts[pts.length - 1].x - pts[0].x;
  const dy = pts[pts.length - 1].y - pts[0].y;
  out.span = Math.hypot(dx, dy);
  if (out.span > 1) out.dirNet = { x: dx / out.span, y: dy / out.span };

  const turns = [];
  for (let i = 1; i < pts.length - 1; i++) {
    const ax = pts[i].x - pts[i - 1].x, ay = pts[i].y - pts[i - 1].y;
    const bx = pts[i + 1].x - pts[i].x, by = pts[i + 1].y - pts[i].y;
    if (Math.hypot(ax, ay) < 1 || Math.hypot(bx, by) < 1) continue;
    const d = turnBetween(ax, ay, bx, by);
    turns.push(d);
    out.absTurn += Math.abs(d);
    out.netTurn += d;
  }

  // A reversal needs a real swing back, not sensor jitter.
  let runSign = 0, runMag = 0;
  const swings = [];
  for (const d of turns) {
    const s = Math.sign(d);
    if (s === runSign || runSign === 0) { runSign = s || runSign; runMag += Math.abs(d); }
    else { swings.push({ sign: runSign, mag: runMag }); runSign = s; runMag = Math.abs(d); }
  }
  swings.push({ sign: runSign, mag: runMag });
  const strong = swings.filter((s) => s.mag > 0.42);
  out.reversals = Math.max(0, strong.length - 1);

  if (out.reversals >= 2 && out.absTurn > 1.5) out.kind = 'zigzag';
  else if (out.absTurn < 0.55) out.kind = 'straight';
  else if (out.reversals <= 1 && Math.abs(out.netTurn) > 0.5 &&
           out.absTurn - Math.abs(out.netTurn) < 0.85) out.kind = 'arc';
  else out.kind = 'loose';
  return out;
}

/** 0..1 for how well a stroke matches the demanded pattern. */
export function patternScore(required, shape) {
  switch (required) {
    // Judged on whether the stroke looks like a straight line, not on how
    // much the hand turned getting there. Summed turning was the old test
    // and it graded sampling density rather than shape: the very same line
    // scored 100% flicked and 8% drawn slowly, because a slower swipe emits
    // more points and each one carries a little pointer jitter to add up.
    case 'straight': {
      const off = clamp((shape.strayRatio - 0.035) / 0.16, 0, 1);   // wandered off its own line
      const back = clamp((0.985 - shape.efficiency) / 0.16, 0, 1);  // doubled back on itself
      return clamp(1 - Math.max(off, back), 0.08, 1);
    }

    case 'arc': {
      const bend = Math.abs(shape.netTurn);
      const wobble = shape.absTurn - bend;                 // curve should be smooth
      const amount = bend < 0.5 ? bend / 0.5
        : bend > 2.9 ? clamp(1 - (bend - 2.9) / 1.6, 0, 1) : 1;
      const smooth = clamp(1 - wobble / 1.1, 0, 1);
      const penalty = shape.reversals >= 2 ? 0.45 : 1;
      return clamp(amount * 0.62 + smooth * 0.38, 0, 1) * penalty;
    }

    case 'zigzag': {
      const r = clamp((shape.reversals - 1) / 2, 0, 1);    // 2 reversals ≈ half, 3+ full
      const energy = clamp(shape.absTurn / 3.2, 0, 1);
      return clamp(r * 0.6 + energy * 0.4, 0.05, 1);
    }

    case 'cross': {
      // Judged across two strokes; per-stroke we only ask for cleanliness,
      // and a little looser than a demanded straight cut.
      const off = clamp((shape.strayRatio - 0.05) / 0.20, 0, 1);
      const back = clamp((0.98 - shape.efficiency) / 0.18, 0, 1);
      return clamp(1 - Math.max(off, back), 0.1, 1);
    }

    default:
      return 1;
  }
}

/** Extra term for a cross-cut: the two strokes should meet near square. */
export function crossScore(dirA, dirB) {
  const dot = Math.abs(dirA.x * dirB.x + dirA.y * dirB.y);
  const ang = (Math.acos(clamp(dot, 0, 1)) * 180) / Math.PI;  // 0..90
  return clamp(1 - Math.abs(90 - ang) / 55, 0, 1);
}

export { TAU };
