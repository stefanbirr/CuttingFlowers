/* A single plant: its life cycle, its geometry, the guide overlay that
   teaches its technique, and the piece that comes away when it is cut. */

import { CFG, PHASE } from './config.js';
import {
  clamp, lerp, invLerp, smoothstep, rand, TAU, qPoint, qTangent,
  segIntersect, tolScore, withAlpha, shade, mix, hash01,
} from './util.js';
import { drawStem, drawLeaves, drawHead, drawCutFace, pickPalette, getLight } from './draw.js';

const SAMPLES = 18;

export class Flower {
  constructor(species, x, view, round = 1) {
    this.species = species;
    this.view = view;
    this.baseX = x;
    this.baseY = view.groundY + rand(6, -4);
    this.palette = pickPalette(species);
    this.seed = Math.random() * 100;

    const st = species.stem;
    this.maxLen = rand(st.max, st.min) * CFG.maxStemH * view.h;
    this.lean = rand(st.lean, -st.lean);
    this.bow = rand(0.16, -0.16) + this.lean * 0.4;
    this.width = st.width * view.scale;
    // Slender stems whip about in the wind; a sunflower's thick stalk barely
    // notices it. Keyed off the species' own drawn width.
    this.flex = clamp(5 / st.width, 0.55, 1.7);

    const slow = Math.max(CFG.lifespanFloor, Math.pow(0.95, round - 1));
    this.lifespan = species.lifespan * slow;
    this.age = 0;
    this.life = 0;

    this.headScale = view.scale * CFG.headScale;
    this.headSize = species.head.size * this.headScale;

    this.state = 'alive';        // alive → stub (cut) | missed (withered) | gone
    this.crossFirst = null;      // first stroke of a cross-cut, awaiting its partner
    this.flash = 0;
    this.swayPhase = Math.random() * TAU;
    this.pts = [];
    this.updateGeometry(0);
  }

  get isHazard() { return this.species.kind === 'hazard'; }

  /* ── Life cycle ─────────────────────────────────────────────────── */

  update(dt, time) {
    if (this.state === 'alive') {
      this.age += dt;
      this.life = this.age / this.lifespan;
      if (this.life >= 1) {
        this.state = this.isHazard ? 'gone' : 'missed';
        return;
      }
    } else if (this.state === 'stub') {
      this.stubAge += dt;
      if (this.stubAge > 900) this.state = 'gone';
    }
    this.flash = Math.max(0, this.flash - dt / 220);
    this.updateGeometry(time);
  }

  /** Openness of the bloom, 0..1. */
  get open() {
    return smoothstep(invLerp(PHASE.bud, PHASE.peak, this.life));
  }

  get wilt() {
    return smoothstep(invLerp(PHASE.wilt, 1.0, this.life));
  }

  /** How far the stem has extended, 0..1. */
  get grown() {
    const g = smoothstep(clamp(invLerp(PHASE.sprout, PHASE.bud, this.life), 0, 1));
    return g * (1 - this.wilt * 0.06);
  }

  /** 1 while the bloom is at its best, tailing off either side. */
  get timingQuality() {
    const { lo, hi, tol } = CFG.timingWindow;
    const l = this.life;
    if (l >= lo && l <= hi) return 1;
    return tolScore(l < lo ? lo - l : l - hi, tol);
  }

  /** Should the technique guide be visible yet? */
  get guideAlpha() {
    if (this.isHazard || this.state !== 'alive') return 0;
    const inFade = smoothstep(invLerp(PHASE.bud * 0.75, PHASE.bloom, this.life));
    const outFade = 1 - smoothstep(invLerp(0.88, 1.0, this.life));
    return clamp(inFade * outFade, 0, 1);
  }

  /* ── Geometry ───────────────────────────────────────────────────── */

  /** How far this stem is leaning at a given moment. */
  swayAt(time) {
    const w = CFG.wind;
    // The gust's phase depends on where the stem stands, so neighbours lean
    // together and the crest visibly travels across the meadow.
    const phase = (this.baseX / (this.view.w || 1)) * w.waves - time / w.period;
    const gust = Math.sin(phase * TAU);
    const breeze = Math.sin(time / 900 + this.swayPhase);
    return (gust * w.gust + breeze * w.breeze + breeze * this.wilt * 0.05) * this.flex;
  }

  updateGeometry(time) {
    const len = this.maxLen * this.grown;
    this.len = len;
    const sway = this.swayAt(time);
    const droop = this.wilt * 0.28;

    const p0 = { x: this.baseX, y: this.baseY };
    const dx = this.lean + sway + droop * 0.5;
    const tip = { x: p0.x + dx * len, y: p0.y - len * (1 - droop * 0.22) };
    const mid = { x: (p0.x + tip.x) / 2, y: (p0.y + tip.y) / 2 };
    const nx = -(tip.y - p0.y), ny = tip.x - p0.x;
    const nl = Math.hypot(nx, ny) || 1;
    const bowAmt = (this.bow + sway * 0.6) * len * 0.5;
    const ctrl = { x: mid.x + (nx / nl) * bowAmt, y: mid.y + (ny / nl) * bowAmt };

    this.p0 = p0; this.p1 = ctrl; this.p2 = tip;
    const pts = this.pts;
    pts.length = 0;
    for (let i = 0; i <= SAMPLES; i++) pts.push(qPoint(p0, ctrl, tip, i / SAMPLES));

    const tan = qTangent(p0, ctrl, tip, 1);
    // The head is the heavy end: it arrives where the stem was a moment ago,
    // not where it is now. Comparing against the sway a little in the past
    // gives that lag without having to carry any velocity state around.
    const lag = sway - this.swayAt(time - CFG.wind.headLag);
    this.tipAngle = Math.atan2(tan.y, tan.x) + Math.PI / 2 - lag * CFG.wind.lagTilt;
  }

  pointAt(t) { return qPoint(this.p0, this.p1, this.p2, t); }

  /** Unit tangent of the stem at parameter t. */
  dirAt(t) {
    const d = qTangent(this.p0, this.p1, this.p2, t);
    const l = Math.hypot(d.x, d.y) || 1;
    return { x: d.x / l, y: d.y / l };
  }

  /** Heading of the stem at parameter t, in radians. */
  dirAngle(t) {
    const d = this.dirAt(t);
    return Math.atan2(d.y, d.x);
  }

  /* ── Slicing ────────────────────────────────────────────────────── */

  /** Test one blade segment against the stem. Returns {x, y, t} or null. */
  sliceTest(a, b) {
    if (this.state !== 'alive') return null;
    if (this.grown < 0.12) return null;
    const pts = this.pts;
    for (let i = 1; i < pts.length; i++) {
      const hit = segIntersect(a, b, pts[i - 1], pts[i]);
      if (hit) {
        const t = (i - 1 + hit.u) / SAMPLES;
        return { x: hit.x, y: hit.y, t };
      }
    }
    return null;
  }

  /** Split the plant, returning the harvested piece (head + upper stem).
      `bladeAngle` is the direction the blade travelled, so both halves can
      show the same slanted face where it went through. */
  sever(t, bladeAngle = 0) {
    // Kept in world orientation. The stub stays put so it reads directly,
    // and the flying piece is drawn inside its own spin, which turns the
    // face with it exactly as it should.
    this.cutAngle = bladeAngle;
    const cutPt = this.pointAt(t);
    const rel = [];
    for (let i = 0; i <= 10; i++) {
      const p = this.pointAt(lerp(t, 1, i / 10));
      rel.push({ x: p.x - cutPt.x, y: p.y - cutPt.y });
    }
    this.stubT = t;
    this.stubAge = 0;
    this.state = 'stub';
    return new CutPiece(this, rel, cutPt);
  }

  /* ── Drawing ────────────────────────────────────────────────────── */

  draw(ctx) {
    if (this.state === 'gone') return;
    const sp = this.species;
    const s = this.view.scale;

    if (this.state === 'stub') {
      const fade = 1 - this.stubAge / 900;
      ctx.save();
      ctx.globalAlpha = fade;
      const n = Math.max(2, Math.round(this.stubT * SAMPLES));
      const stub = this.pts.slice(0, n + 1);
      drawStem(ctx, stub, this.width, shade(sp.stem.color, -10),
        { taper: 0.9, seed: this.seed });
      const end = stub[stub.length - 1];
      drawCutFace(ctx, end.x, end.y, this.cutAngle ?? 0, this.width,
        shade(sp.stem.color, 46));
      ctx.restore();
      return;
    }

    const grown = this.grown;
    if (grown <= 0.01) return;
    const headScale = this.headScale * smoothstep(clamp(invLerp(0.05, PHASE.bud, this.life), 0, 1));

    ctx.save();
    // Soil shadow, thrown away from wherever the sun happens to be. A low
    // sun at dawn or dusk rakes it out long across the ground.
    const L = getLight();
    const stretch = 1 + (1 - Math.abs(L.y)) * 2.6;
    ctx.fillStyle = 'rgba(0,0,0,.22)';
    ctx.beginPath();
    ctx.ellipse(
      this.baseX - L.x * this.width * stretch * 1.1, this.baseY + 3,
      this.width * 1.9 * stretch, this.width * 0.7,
      0, 0, TAU,
    );
    ctx.fill();

    const wiltCol = this.wilt > 0
      ? mix(sp.stem.color, '#8a7a4b', this.wilt * 0.8)
      : sp.stem.color;
    drawStem(ctx, this.pts, this.width, wiltCol, {
      taper: 0.6,
      glow: this.flash,
      thorns: !!sp.stem.thorns && grown > 0.5,
      seed: this.seed,
    });
    drawLeaves(ctx, this.pts, sp.stem.leaves || 0, mix(wiltCol, '#7fd48a', 0.25), s * grown, this.seed);

    // A half-made cross-cut leaves a visible nick in the stem.
    if (this.scoreMark != null) {
      const m = this.pointAt(this.scoreMark);
      const d = this.dirAt(this.scoreMark);
      ctx.save();
      ctx.translate(m.x, m.y);
      ctx.rotate(Math.atan2(d.y, d.x) + Math.PI / 2);
      ctx.strokeStyle = 'rgba(255,244,214,.9)';
      ctx.lineWidth = 2 * s;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-this.width * 0.9, 0);
      ctx.lineTo(this.width * 0.9, 0);
      ctx.stroke();
      ctx.restore();
    }

    if (headScale > 0.01) {
      ctx.save();
      ctx.translate(this.p2.x, this.p2.y);
      ctx.rotate(this.tipAngle);
      ctx.globalAlpha = 1 - this.wilt * 0.35;
      drawHead(ctx, sp.head, {
        open: this.open,
        wilt: this.wilt,
        scale: headScale,
        seed: this.seed,
        palette: this.palette,
        headAngle: this.tipAngle,
      });
      ctx.restore();
    }
    ctx.restore();
  }

  /** Bloom ring + technique band. Drawn after all plants so cues stay legible. */
  drawGuide(ctx) {
    if (this.state !== 'alive') return;
    const s = this.view.scale;

    if (!this.isHazard && this.life > PHASE.bud * 0.7) this.drawRing(ctx, s);

    const a = this.guideAlpha;
    if (a <= 0.02 || !this.species.cut) return;
    this.drawBand(ctx, a, s);
  }

  drawRing(ctx, s) {
    // Centre the ring on the bloom itself, which sits above the stem tip.
    const half = this.headSize * 0.5;
    const cx = this.p2.x + Math.sin(this.tipAngle) * half;
    const cy = this.p2.y - Math.cos(this.tipAngle) * half;
    const r = half + 14 * s;
    const { lo, hi } = CFG.timingWindow;
    const start = -Math.PI / 2;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.lineCap = 'butt';

    // Target window
    ctx.strokeStyle = 'rgba(167,232,160,.30)';
    ctx.lineWidth = 5 * s;
    ctx.beginPath();
    ctx.arc(0, 0, r, start + lo * TAU, start + hi * TAU);
    ctx.stroke();

    // Progress
    const q = this.timingQuality;
    ctx.strokeStyle = this.life > PHASE.wilt
      ? `rgba(255,146,110,${0.85})`
      : `rgba(${lerp(255, 167, q)|0},${lerp(212, 232, q)|0},${lerp(121, 160, q)|0},.9)`;
    ctx.lineWidth = 2.6 * s;
    ctx.beginPath();
    ctx.arc(0, 0, r, start, start + clamp(this.life, 0, 1) * TAU);
    ctx.stroke();

    if (q > 0.95) {
      ctx.strokeStyle = 'rgba(255,255,255,.34)';
      ctx.lineWidth = 1.1 * s;
      ctx.beginPath();
      ctx.arc(0, 0, r + 4 * s, start, start + TAU);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawBand(ctx, alpha, s) {
    const cut = this.species.cut;
    const t = cut.point;
    const p = this.pointAt(t);
    const u = this.dirAt(t);
    const stemAng = Math.atan2(u.y, u.x);
    const bladeAng = stemAng + ((cut.angle == null ? 90 : cut.angle) * Math.PI) / 180;

    const R = 26 * s + this.headSize * 0.22;
    const thick = clamp(cut.pointTol * this.len * 0.85, 8 * s, 28 * s);
    const ready = this.timingQuality;
    const hot = 0.35 + ready * 0.65;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(p.x, p.y);
    ctx.rotate(bladeAng);

    // Tolerance slab: how far off the cut point you may be.
    ctx.fillStyle = `rgba(255,255,255,${0.06 + ready * 0.07})`;
    ctx.beginPath();
    roundRect(ctx, -R, -thick / 2, R * 2, thick, thick / 2);
    ctx.fill();

    // The stroke you are meant to trace.
    const col = cut.angle == null ? '#cfe0cc' : '#ffe9a3';
    ctx.strokeStyle = withAlpha(col, hot);
    ctx.lineWidth = 2.4 * s;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (cut.angle == null) ctx.setLineDash([5 * s, 5 * s]);
    patternPath(ctx, cut.pattern, R, thick);
    ctx.stroke();
    ctx.setLineDash([]);

    // Speed: one dot slow, two steady, three a snap.
    const dots = { slow: 1, steady: 2, fast: 3 }[cut.speed] || 1;
    ctx.fillStyle = withAlpha(col, hot * 0.95);
    for (let i = 0; i < dots; i++) {
      ctx.beginPath();
      ctx.arc(R + (5 + i * 6) * s, 0, 2.1 * s, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }
}

/* Every guide shape passes through its own origin, so a player who traces
   it lands the blade on the marked cut point at the marked angle. */
function patternPath(ctx, pattern, R, thick) {
  ctx.beginPath();
  switch (pattern) {
    case 'arc': {
      // Endpoints lifted, vertex on the origin: the curve's midpoint sits
      // exactly on the stem and its tangent there is the demanded angle.
      const b = Math.max(thick * 1.15, R * 0.3);
      ctx.moveTo(-R, b);
      ctx.quadraticCurveTo(0, -b, R, b);
      break;
    }
    case 'zigzag': {
      // Triangle wave with a zero crossing in the middle.
      const a = Math.max(thick * 0.8, R * 0.22);
      const q = R / 4;
      ctx.moveTo(-R, 0);
      const ys = [a, 0, -a, 0, a, 0, -a, 0];
      for (let i = 1; i <= 8; i++) ctx.lineTo(-R + q * i, ys[i - 1]);
      break;
    }
    case 'cross':
      ctx.moveTo(-R, 0); ctx.lineTo(R, 0);
      ctx.moveTo(0, -R * 0.72); ctx.lineTo(0, R * 0.72);
      break;
    default:
      ctx.moveTo(-R, 0); ctx.lineTo(R, 0);
  }
}

function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/* ── The harvested piece ──────────────────────────────────────────── */

export class CutPiece {
  constructor(flower, relPts, at) {
    this.species = flower.species;
    this.palette = flower.palette;
    this.seed = flower.seed;
    this.rel = relPts;
    this.width = flower.width;
    this.open = flower.open;
    this.wilt = flower.wilt;
    this.headScale = flower.headScale;
    this.tipOffset = flower.tipAngle - Math.atan2(
      relPts[relPts.length - 1].y - relPts[relPts.length - 2].y,
      relPts[relPts.length - 1].x - relPts[relPts.length - 2].x,
    );
    this.stemLen = flower.len * (1 - flower.stubT);
    this.cutAngle = flower.cutAngle ?? 0;
    this.x = at.x; this.y = at.y;
    this.rot = 0;
    this.age = 0;
    this.done = false;
    this.collected = false;
    this.quality = 0;
    this.target = null;
  }

  launch(vx, vy, spin) {
    this.vx = vx; this.vy = vy; this.spin = spin;
  }

  update(dt, target) {
    this.age += dt;
    const d = dt / 1000;
    if (this.age < 420) {
      this.x += this.vx * d;
      this.y += this.vy * d;
      this.vy += 1500 * d;
      this.rot += this.spin * d;
    } else {
      // Drawn to the basket.
      const k = Math.min(1, (this.age - 420) / 480);
      const e = k * k * (3 - 2 * k);
      this.x = lerp(this.x, target.x, 0.14 + e * 0.18);
      this.y = lerp(this.y, target.y, 0.14 + e * 0.18);
      this.rot *= 0.92;
      this.scale = 1 - e * 0.85;
      if (k >= 1) { this.done = true; this.collected = true; }
    }
  }

  draw(ctx) {
    if (this.done) return;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rot);
    const sc = this.scale ?? 1;
    ctx.scale(sc, sc);
    ctx.globalAlpha = clamp(sc * 1.4, 0, 1);
    drawStem(ctx, this.rel, this.width, this.species.stem.color, { taper: 0.7, seed: this.seed });
    drawLeaves(ctx, this.rel, Math.min(1, this.species.stem.leaves || 0),
      this.species.stem.color, this.headScale, this.seed);
    // rel[0] is the cut end, which is where this piece came away.
    drawCutFace(ctx, this.rel[0].x, this.rel[0].y, this.cutAngle, this.width,
      shade(this.species.stem.color, 46));
    const tip = this.rel[this.rel.length - 1];
    const prev = this.rel[this.rel.length - 2];
    const headAngle = Math.atan2(tip.y - prev.y, tip.x - prev.x) + Math.PI / 2;
    ctx.translate(tip.x, tip.y);
    ctx.rotate(headAngle);
    drawHead(ctx, this.species.head, {
      open: this.open, wilt: this.wilt, scale: this.headScale,
      seed: this.seed, palette: this.palette,
      // The piece is tumbling, so its own spin counts toward where the sun
      // falls on it as much as the angle of the stem it is still attached to.
      headAngle: headAngle + this.rot,
    });
    ctx.restore();
  }
}
