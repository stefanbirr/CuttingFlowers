/* Procedural plant rendering.

   Every head is drawn in local space: the origin is where the head meets
   the stem, and the plant grows towards -y. Callers rotate/scale first.
   Sharing these renderers means a stem looks the same in the field, in
   flight, and in the finished bouquet. */

import { TAU, hash01, shade, withAlpha, clamp, lerp } from './util.js';

/* ── Light ────────────────────────────────────────────────────────── */

/* One directional light for the whole scene, set from wherever the sun or
   moon hangs in the current mood (see scene.js). It lives at module scope
   because it behaves like a shader uniform: every plant in a frame is lit
   by the same sun, and threading it through each call would be noise.

   `x`/`y` point from the world toward the light. `rim` is how strongly the
   blooms are backlit — high when the sun sits low and behind them. */
let LIGHT = { x: -0.45, y: -0.89, rim: 0.4, color: '#ffffff' };

export function setLight(l) { LIGHT = { ...LIGHT, ...l }; }
export function getLight() { return LIGHT; }

function rotateVec(v, a) {
  const c = Math.cos(a), s = Math.sin(a);
  return { x: v.x * c - v.y * s, y: v.x * s + v.y * c };
}

/* ── Stem ─────────────────────────────────────────────────────────── */

export function drawStem(ctx, pts, width, color, opts = {}) {
  if (pts.length < 2) return;
  const { taper = 0.55, glow = 0, thorns = false, seed = 0, rim = true } = opts;

  if (glow > 0) {
    ctx.save();
    ctx.strokeStyle = withAlpha('#a7e8a0', glow * 0.5);
    ctx.lineWidth = width + 8;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    strokePath(ctx, pts);
    ctx.restore();
  }

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // A dark rim under the body. A green stem stands on a green meadow, so
  // without this it dissolves into the field on the brighter moods.
  if (rim) {
    ctx.strokeStyle = 'rgba(10,20,12,.32)';
    ctx.lineWidth = width + 2.4;
    strokePath(ctx, pts);
  }

  // Body, drawn in segments so it can taper toward the top.
  for (let i = 1; i < pts.length; i++) {
    const t = i / (pts.length - 1);
    ctx.beginPath();
    ctx.moveTo(pts[i - 1].x, pts[i - 1].y);
    ctx.lineTo(pts[i].x, pts[i].y);
    ctx.lineWidth = width * lerp(1, taper, t);
    ctx.strokeStyle = color;
    ctx.stroke();
  }

  // Lit and shaded edges tracked along the stem's own normal, so the
  // roundness survives a stem that leans or curves. Which side catches the
  // light follows the sun rather than being pinned to one side.
  const lit = LIGHT.x >= 0 ? 1 : -1;
  stemEdge(ctx, pts, width, taper, lit * 0.26, withAlpha('#ffffff', 0.22), 0.26);
  stemEdge(ctx, pts, width, taper, lit * -0.30, 'rgba(0,0,0,.16)', 0.20);

  if (thorns) {
    ctx.fillStyle = shade(color, -34);
    for (let i = 2; i < pts.length - 1; i += 3) {
      const p = pts[i], q = pts[i - 1];
      const dx = p.x - q.x, dy = p.y - q.y;
      const len = Math.hypot(dx, dy) || 1;
      const side = hash01(seed + i) > 0.5 ? 1 : -1;
      const nx = (-dy / len) * side, ny = (dx / len) * side;
      const s = width * 0.9;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + nx * s - (dx / len) * s * 0.5, p.y + ny * s - (dy / len) * s * 0.5);
      ctx.lineTo(p.x + (dx / len) * s * 0.4, p.y + (dy / len) * s * 0.4);
      ctx.closePath();
      ctx.fill();
    }
  }
}

function strokePath(ctx, pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.stroke();
}

/* The pale face left where the blade went through. Small, but it is the
   only direct evidence of the angle you actually cut at — and the angle is
   most of what the game is asking you to get right. */
export function drawCutFace(ctx, x, y, bladeAngle, width, color) {
  const half = width * 0.6;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(bladeAngle);
  ctx.lineCap = 'round';
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1.3, width * 0.4);
  ctx.beginPath();
  ctx.moveTo(-half, 0);
  ctx.lineTo(half, 0);
  ctx.stroke();
  // A wet glint along the top edge of the fresh cut.
  ctx.strokeStyle = withAlpha('#ffffff', 0.5);
  ctx.lineWidth = Math.max(0.7, width * 0.16);
  ctx.beginPath();
  ctx.moveTo(-half * 0.72, -width * 0.1);
  ctx.lineTo(half * 0.72, -width * 0.1);
  ctx.stroke();
  ctx.restore();
}

/** A line running parallel to the stem, `offset` half-widths to one side. */
function stemEdge(ctx, pts, width, taper, offset, style, widthMul) {
  ctx.beginPath();
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const here = width * lerp(1, taper, i / (pts.length - 1));
    const x = pts[i].x + (-dy / len) * here * offset;
    const y = pts[i].y + (dx / len) * here * offset;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.lineWidth = Math.max(0.8, width * widthMul);
  ctx.strokeStyle = style;
  ctx.stroke();
}

/** Leaves hung off the stem at fractions along its length. */
export function drawLeaves(ctx, pts, count, color, scale, seed = 0) {
  if (!count) return;
  for (let i = 0; i < count; i++) {
    const f = 0.28 + (i / count) * 0.5;
    const idx = clamp(Math.round(f * (pts.length - 1)), 1, pts.length - 2);
    const p = pts[idx], q = pts[idx - 1];
    const side = hash01(seed + i * 7.3) > 0.5 ? 1 : -1;
    const stemAng = Math.atan2(p.y - q.y, p.x - q.x);
    const len = scale * (16 + hash01(seed + i) * 8);
    const droop = 0.26 + hash01(seed + i * 2.1) * 0.2;
    // A leaf hanging on the sunward side of the stem catches the light;
    // one on the far side sits in the stem's own shadow.
    const facing = (side > 0) === (LIGHT.x > 0);
    const leafCol = shade(color, facing ? 12 : -18);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(stemAng + side * (0.7 + hash01(seed + i * 3) * 0.4));

    // Blade: a leaf lifted at the base and dipping toward its tip.
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(len * 0.45, -len * droop, len, len * 0.06);
    ctx.quadraticCurveTo(len * 0.5, len * droop * 0.85, 0, 0);
    const g = ctx.createLinearGradient(0, 0, len, 0);
    g.addColorStop(0, shade(leafCol, -20));
    g.addColorStop(0.6, leafCol);
    g.addColorStop(1, shade(leafCol, 12));
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = withAlpha('#0a140c', 0.28);
    ctx.lineWidth = Math.max(0.6, scale * 0.5);
    ctx.stroke();

    // Midrib, following the same dip as the blade.
    ctx.strokeStyle = withAlpha('#ffffff', 0.16);
    ctx.lineWidth = Math.max(0.6, scale * 0.6);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(len * 0.5, len * droop * 0.12, len * 0.94, len * 0.05);
    ctx.stroke();
    ctx.restore();
  }
}

/* ── Heads ────────────────────────────────────────────────────────── */

/**
 * @param {object} o  { open: 0..1 bloom, wilt: 0..1, scale, seed, palette,
 *                      halo: draw the separation pool behind the head,
 *                      headAngle: rotation already applied to the context,
 *                        so the scene light can be resolved into head space }
 */
export function drawHead(ctx, head, o) {
  const fn = HEADS[head.type];
  if (!fn) return;
  // The caller has already rotated the context onto the stem tip; undo that
  // rotation to learn which way the sun lies from the bloom's point of view.
  const L = rotateVec(LIGHT, -(o.headAngle || 0));
  if (o.halo !== false) headHalo(ctx, head, o);
  fn(ctx, head, o, L);
  if (o.halo !== false && LIGHT.rim > 0.02) headRim(ctx, head, o, L);
}

/* A wash of light across the sunward face of the bloom. At dawn and dusk
   the sun sits low and behind the meadow, and catching that on the petals
   is what sells the hour — without it every mood lights the same way. */
function headRim(ctx, head, o, L) {
  const s = o.scale * head.size;
  const m = HEAD_MASS[head.type] || { y: -0.55, r: 0.9 };
  const r = s * m.r * lerp(0.7, 1, o.open);
  if (r <= 1) return;
  const cy = s * m.y;
  const strength = LIGHT.rim * (1 - o.wilt * 0.5);
  // Pooled toward the sun and faded radially rather than clipped to the
  // bloom's outline: a hard clip leaves a visible disc edge printed on the
  // sky, and the soft spill reads as haze around a backlit flower anyway.
  const ox = L.x * r * 0.55, oy = cy + L.y * r * 0.55;
  const g = ctx.createRadialGradient(ox, oy, 0, ox, oy, r * 1.15);
  g.addColorStop(0, withAlpha(LIGHT.color, 0.34 * strength));
  g.addColorStop(0.55, withAlpha(LIGHT.color, 0.12 * strength));
  g.addColorStop(1, withAlpha(LIGHT.color, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(ox, oy, r * 1.15, 0, TAU);
  ctx.fill();
}

/* Roughly where each head type's mass sits in local space, in fractions of
   its drawn size — used to place the halo behind it. */
const HEAD_MASS = {
  cup: { y: -0.50, r: 0.78 },
  rosette: { y: -0.55, r: 0.95 },
  disc: { y: -0.85, r: 1.05 },
  spike: { y: -0.50, r: 0.55 },
  pom: { y: -0.55, r: 0.80 },
  orchid: { y: -0.90, r: 1.00 },
  frond: { y: -0.60, r: 0.80 },
  sprig: { y: -0.65, r: 0.75 },
  plume: { y: -0.55, r: 0.70 },
  nettle: { y: -0.60, r: 0.85 },
  bramble: { y: -0.60, r: 0.80 },
};

/* A soft pool of shade behind the bloom. The sky cycles from a pale noon
   blue to a peach dawn to near-black night, so a petal colour that reads
   cleanly against one mood can sink into another — this gives every head
   its own backing to sit on, whatever is behind it. */
function headHalo(ctx, head, o) {
  const s = o.scale * head.size;
  const m = HEAD_MASS[head.type] || { y: -0.55, r: 0.9 };
  const r = s * m.r * lerp(0.7, 1, o.open);
  if (r <= 0.5) return;
  const cy = s * m.y;
  const g = ctx.createRadialGradient(0, cy, r * 0.1, 0, cy, r);
  g.addColorStop(0, 'rgba(10,16,12,.42)');
  g.addColorStop(0.5, 'rgba(10,16,12,.26)');
  g.addColorStop(1, 'rgba(10,16,12,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, cy, r, 0, TAU);
  ctx.fill();
}

function petalPath(ctx, len, wid, curl = 0.35) {
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(wid, -len * curl, wid * 0.8, -len * 0.85, 0, -len);
  ctx.bezierCurveTo(-wid * 0.8, -len * 0.85, -wid, -len * curl, 0, 0);
  ctx.closePath();
}

/* A petal with some volume in it, shaded along the light rather than along
   its own axis: a petal turned away from the sun genuinely sits in shadow,
   which is what makes a ring of them read as a dome instead of a rosette
   of flat spokes. Outlined too, so neighbours stay distinct.

   `L` is the light direction in this petal's own rotated space. */
function fillPetal(ctx, len, wid, curl, color, L, edgeWidth = 0) {
  petalPath(ctx, len, wid, curl);
  const cy = -len * 0.5;
  const ex = L.x * len * 0.62, ey = L.y * len * 0.62;
  const g = ctx.createLinearGradient(-ex, cy - ey, ex, cy + ey);
  g.addColorStop(0, shade(color, -34));
  g.addColorStop(0.5, color);
  g.addColorStop(1, shade(color, 26));
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = withAlpha(shade(color, -70), 0.4);
  ctx.lineWidth = edgeWidth || Math.max(0.5, len * 0.035);
  ctx.stroke();
}

const HEADS = {
  /* Tulip: a tight cup that splays as it opens and gapes when it wilts. */
  cup(ctx, head, o, L) {
    const s = o.scale * head.size;
    const p = o.palette;
    const spread = lerp(0.06, 0.55, o.open) + o.wilt * 0.75;
    const n = head.petals;
    for (let i = 0; i < n; i++) {
      const f = n === 1 ? 0 : i / (n - 1) - 0.5;
      const ang = f * spread * 2;
      const depth = 1 - Math.abs(f) * 0.35;
      ctx.save();
      ctx.rotate(ang);
      fillPetal(ctx, s * depth, s * 0.34, 0.5, i % 2 ? p[1] : p[0], rotateVec(L, -ang));
      ctx.restore();
    }
    // The inner petal, catching a little light down the throat of the cup.
    ctx.save();
    ctx.fillStyle = withAlpha(p[2] || p[1], 0.55);
    petalPath(ctx, s * 0.62, s * 0.2, 0.5);
    ctx.fill();
    ctx.fillStyle = withAlpha('#ffffff', 0.18);
    petalPath(ctx, s * 0.42, s * 0.1, 0.5);
    ctx.fill();
    ctx.restore();
  },

  /* Rose: rings of petals, the outer ones unfurling first. */
  rosette(ctx, head, o, L) {
    const s = o.scale * head.size;
    const p = o.palette;
    const rings = 3;
    ctx.translate(0, -s * 0.55);
    for (let r = rings - 1; r >= 0; r--) {
      const ringOpen = clamp((o.open - r * 0.16) / 0.55, 0, 1);
      if (ringOpen <= 0) continue;
      const rad = s * (0.28 + r * 0.26) * ringOpen;
      const n = 5 + r * 3;
      const droop = o.wilt * 0.5;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + r * 0.6 + o.seed * 0.9;
        ctx.save();
        ctx.rotate(a);
        ctx.translate(0, -rad * 0.35);
        ctx.rotate(droop * 0.8);
        // Outer rings sit in the shade of the ones above them.
        const petal = shade(p[Math.min(p.length - 1, 2 - r)], -8 * r);
        fillPetal(ctx, rad * (1 + droop * 0.3), rad * 0.62, 0.55, petal,
          rotateVec(L, -(a + droop * 0.8)));
        ctx.restore();
      }
    }
    ctx.fillStyle = withAlpha(p[0], 0.9);
    ctx.beginPath();
    ctx.arc(0, 0, s * 0.16 * o.open, 0, TAU);
    ctx.fill();
    ctx.fillStyle = withAlpha('#000000', 0.22);
    ctx.beginPath();
    ctx.arc(0, 0, s * 0.09 * o.open, 0, TAU);
    ctx.fill();
  },

  /* Daisy / sunflower: ray florets around a disc. */
  disc(ctx, head, o, L) {
    const s = o.scale * head.size;
    const p = o.palette;
    const n = head.petals;
    ctx.translate(0, -s * 0.85);
    const rayLen = s * lerp(0.25, 1, o.open);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + o.seed;
      const droop = o.wilt * (0.35 + hash01(o.seed * 40 + i) * 0.5);
      ctx.save();
      ctx.rotate(a);
      ctx.translate(0, -s * 0.28);
      ctx.rotate(droop);
      fillPetal(ctx, rayLen * (1 - o.wilt * 0.25), s * 0.16, 0.3,
        i % 3 === 0 ? (p[1] || p[0]) : p[0], rotateVec(L, -(a + droop)));
      ctx.restore();
    }
    const cr = s * 0.32;
    const g = ctx.createRadialGradient(L.x * cr * 0.34, L.y * cr * 0.34, cr * 0.1, 0, 0, cr);
    g.addColorStop(0, shade(head.centre, 46));
    g.addColorStop(0.72, head.centre);
    g.addColorStop(1, shade(head.centre, -26));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, cr, 0, TAU); ctx.fill();

    // Seeds on a sunflower spiral — the same 137.5° step a real head uses.
    const seeds = 26;
    for (let i = 0; i < seeds; i++) {
      const a = i * 2.399, r = cr * 0.8 * Math.sqrt(i / seeds);
      const sr = cr * 0.085 * (1 - r / (cr * 1.6));
      ctx.fillStyle = withAlpha('#000000', 0.16 + 0.14 * (r / cr));
      ctx.beginPath();
      ctx.arc(Math.cos(a) * r, Math.sin(a) * r, sr, 0, TAU);
      ctx.fill();
    }
    ctx.strokeStyle = withAlpha('#000000', 0.22);
    ctx.lineWidth = Math.max(0.6, cr * 0.07);
    ctx.beginPath(); ctx.arc(0, 0, cr, 0, TAU); ctx.stroke();
  },

  /* Lavender: a tapering column of buds. */
  spike(ctx, head, o) {
    const s = o.scale * head.size;
    const p = o.palette;
    const n = head.beads;
    const grown = Math.max(1, Math.round(n * lerp(0.35, 1, o.open)));

    // Stalk first, so the buds sit in front of it rather than on it.
    ctx.strokeStyle = withAlpha(p[2] || p[1], 0.55);
    ctx.lineWidth = s * 0.05;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -s * (grown / n)); ctx.stroke();

    for (let i = 0; i < grown; i++) {
      const t = i / n;
      const y = -s * t;
      const w = s * 0.16 * (1 - t * 0.65);
      for (const side of [-1, 1]) {
        const tilt = side * 0.4 + o.wilt * 0.4;
        ctx.fillStyle = i % 2 ? p[1] : p[0];
        ctx.beginPath();
        ctx.ellipse(side * w * 0.9, y, w, w * 1.35, tilt, 0, TAU);
        ctx.fill();
        ctx.fillStyle = withAlpha('#ffffff', 0.2);
        ctx.beginPath();
        ctx.ellipse(side * w * 0.9 - w * 0.22, y - w * 0.34, w * 0.4, w * 0.52, tilt, 0, TAU);
        ctx.fill();
      }
    }
  },

  /* Hydrangea: a ball of four-petal florets. */
  pom(ctx, head, o, L) {
    const s = o.scale * head.size;
    const p = o.palette;
    const rad = s * 0.5 * lerp(0.4, 1, o.open);
    ctx.translate(0, -s * 0.55);
    for (let i = 0; i < head.florets; i++) {
      const a = i * 2.399 + o.seed * 3;
      const r = rad * Math.sqrt((i + 0.5) / head.florets);
      const fx = Math.cos(a) * r, fy = Math.sin(a) * r * 0.88;
      const fs = s * 0.15 * (1 - o.wilt * 0.2);
      ctx.save();
      ctx.translate(fx, fy);
      ctx.rotate(a);
      // Florets deeper in the ball sit further into shadow, and the face of
      // the ball turned toward the sun is brighter than the far side.
      const depth = 1 - 0.3 * (r / (rad || 1));
      const toward = rad > 0 ? (fx * L.x + fy * L.y) / rad : 0;
      const petal = shade(p[i % p.length], -34 * (1 - depth) + toward * 18);
      for (let k = 0; k < 4; k++) {
        ctx.save();
        ctx.rotate((k / 4) * TAU);
        ctx.beginPath();
        ctx.ellipse(0, -fs * 0.7, fs * 0.5, fs * 0.75, 0, 0, TAU);
        ctx.fillStyle = petal;
        ctx.fill();
        ctx.strokeStyle = withAlpha(shade(petal, -60), 0.35);
        ctx.lineWidth = Math.max(0.4, fs * 0.08);
        ctx.stroke();
        ctx.restore();
      }
      ctx.fillStyle = withAlpha('#ffffff', 0.6);
      ctx.beginPath(); ctx.arc(0, 0, fs * 0.2, 0, TAU); ctx.fill();
      ctx.restore();
    }
  },

  /* Orchid: a few big blooms stepping up the cane. */
  orchid(ctx, head, o) {
    const s = o.scale * head.size;
    const p = o.palette;
    const shown = Math.max(1, Math.round(head.blooms * lerp(0.34, 1, o.open)));
    for (let b = 0; b < shown; b++) {
      const y = -s * (0.35 + b * 0.85);
      const x = (b % 2 ? 1 : -1) * s * 0.28;
      const bs = s * (0.85 - b * 0.12);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(o.wilt * 0.5 * (b % 2 ? 1 : -1));
      for (let i = 0; i < 5; i++) {
        ctx.save();
        ctx.rotate((i / 5) * TAU + 0.4);
        const petal = i < 3 ? p[0] : p[1];
        const g = ctx.createLinearGradient(0, 0, 0, -bs * 0.86);
        g.addColorStop(0, shade(petal, -26));
        g.addColorStop(1, shade(petal, 16));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(0, -bs * 0.42, bs * 0.24, bs * 0.44, 0, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = withAlpha(shade(petal, -70), 0.34);
        ctx.lineWidth = Math.max(0.4, bs * 0.03);
        ctx.stroke();
        ctx.restore();
      }
      ctx.fillStyle = p[2];
      ctx.beginPath(); ctx.ellipse(0, 0, bs * 0.2, bs * 0.24, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = head.throat;
      ctx.beginPath(); ctx.arc(0, 0, bs * 0.1, 0, TAU); ctx.fill();
      ctx.fillStyle = withAlpha('#000000', 0.3);
      ctx.beginPath(); ctx.arc(0, -bs * 0.02, bs * 0.045, 0, TAU); ctx.fill();
      ctx.restore();
    }
  },

  /* Fern: a rachis with paired pinnae. */
  frond(ctx, head, o) {
    const s = o.scale * head.size;
    const [dark, light] = head.colors;
    const n = head.pairs;
    const len = s * lerp(0.4, 1.4, o.open);
    ctx.strokeStyle = dark;
    ctx.lineWidth = Math.max(1, s * 0.045);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -len); ctx.stroke();
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const y = -len * (0.08 + t * 0.9);
      const w = s * 0.52 * (1 - t * 0.8) * (1 - o.wilt * 0.25);
      for (const side of [-1, 1]) {
        ctx.save();
        ctx.translate(0, y);
        ctx.rotate(side * (1.15 - t * 0.35) + o.wilt * 0.3 * side);
        ctx.fillStyle = i % 2 ? light : dark;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(w * 0.55, -w * 0.28, w, 0);
        ctx.quadraticCurveTo(w * 0.55, w * 0.22, 0, 0);
        ctx.fill();
        ctx.restore();
      }
    }
  },

  /* Eucalyptus: round coin leaves alternating up the sprig. */
  sprig(ctx, head, o, L) {
    const s = o.scale * head.size;
    const p = head.colors;
    const n = head.pairs;
    const len = s * lerp(0.5, 1.5, o.open);
    ctx.strokeStyle = p[2];
    ctx.lineWidth = Math.max(1, s * 0.05);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(s * 0.18, -len * 0.5, s * 0.05, -len);
    ctx.stroke();
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const y = -len * t;
      const x = s * 0.18 * Math.sin(t * Math.PI);
      const side = i % 2 ? 1 : -1;
      const r = s * 0.24 * (1 - t * 0.45) * (1 - o.wilt * 0.15);
      ctx.save();
      ctx.translate(x + side * r * 0.85, y);
      ctx.rotate(side * 0.4 + o.wilt * 0.3);
      const coin = i % 3 === 0 ? p[1] : p[0];
      const g = ctx.createRadialGradient(L.x * r * 0.34, L.y * r * 0.34, r * 0.1, 0, 0, r);
      g.addColorStop(0, shade(coin, 26));
      g.addColorStop(1, shade(coin, -14));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.ellipse(0, 0, r, r * 0.85, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = withAlpha(shade(coin, -60), 0.4);
      ctx.lineWidth = Math.max(0.5, r * 0.1);
      ctx.stroke();
      ctx.strokeStyle = withAlpha('#ffffff', 0.28);
      ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(-r * 0.7, 0); ctx.lineTo(r * 0.7, 0); ctx.stroke();
      ctx.restore();
    }
  },

  /* Pampas: a soft feathery plume. */
  plume(ctx, head, o) {
    const s = o.scale * head.size;
    const p = head.colors;
    const len = s * lerp(0.45, 1.15, o.open);
    ctx.lineCap = 'round';
    for (let i = 0; i < 42; i++) {
      const t = hash01(o.seed * 90 + i);
      const y = -len * (0.1 + t * 0.9);
      const spread = s * 0.42 * Math.sin((1 - t) * Math.PI * 0.85);
      const side = i % 2 ? 1 : -1;
      const wob = (hash01(i * 3.7) - 0.5) * 0.5;
      ctx.strokeStyle = withAlpha(p[i % 3], 0.55 + hash01(i) * 0.4);
      ctx.lineWidth = s * 0.035;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.quadraticCurveTo(
        side * spread * 0.55, y - s * 0.1,
        side * spread * (1 + wob), y - s * (0.05 + o.wilt * 0.12),
      );
      ctx.stroke();
    }
    ctx.strokeStyle = withAlpha(p[2], 0.7);
    ctx.lineWidth = s * 0.05;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -len); ctx.stroke();
  },

  /* Nettle: drab serrated leaf pairs. Deliberately unappealing. */
  nettle(ctx, head, o) {
    const s = o.scale * head.size;
    const p = head.colors;
    const tiers = 3;
    for (let i = 0; i < tiers; i++) {
      const y = -s * (0.25 + i * 0.5);
      const w = s * 0.62 * (1 - i * 0.18);
      for (const side of [-1, 1]) {
        ctx.save();
        ctx.translate(0, y);
        ctx.rotate(side * 0.55 + o.wilt * 0.2 * side);
        ctx.fillStyle = p[i % p.length];
        ctx.beginPath();
        ctx.moveTo(0, 0);
        const steps = 5;
        for (let k = 1; k <= steps; k++) {
          const f = k / steps;
          ctx.lineTo(side * w * f, -w * 0.24 * Math.sin(f * Math.PI) - (k % 2 ? w * 0.08 : 0));
        }
        for (let k = steps; k >= 0; k--) {
          const f = k / steps;
          ctx.lineTo(side * w * f, w * 0.2 * Math.sin(f * Math.PI) + (k % 2 ? w * 0.07 : 0));
        }
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }
    ctx.strokeStyle = withAlpha('#dff0c0', 0.6);
    ctx.lineWidth = 1;
    for (let i = 0; i < 10; i++) {
      const y = -s * hash01(o.seed * 12 + i) * 1.4;
      const side = i % 2 ? 1 : -1;
      ctx.beginPath();
      ctx.moveTo(side * s * 0.06, y);
      ctx.lineTo(side * s * 0.2, y - s * 0.09);
      ctx.stroke();
    }
  },

  /* Bramble: dark thorny runner with a couple of berries. */
  bramble(ctx, head, o) {
    const s = o.scale * head.size;
    const p = head.colors;
    ctx.strokeStyle = p[0];
    ctx.lineWidth = s * 0.14;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(s * 0.7, -s * 0.5, s * 0.35, -s * 1.15);
    ctx.stroke();
    for (let i = 0; i < 3; i++) {
      const t = 0.3 + i * 0.28;
      const x = s * (0.55 * Math.sin(t * 2.2));
      const y = -s * 1.15 * t;
      ctx.fillStyle = p[1];
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(i * 1.1);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(s * 0.3, -s * 0.2, s * 0.5, 0);
      ctx.quadraticCurveTo(s * 0.3, s * 0.18, 0, 0);
      ctx.fill();
      ctx.restore();
    }
    for (let i = 0; i < 4; i++) {
      const a = i * 1.7;
      ctx.fillStyle = p[2];
      ctx.beginPath();
      ctx.arc(s * (0.3 + 0.16 * Math.cos(a)), -s * (0.85 + 0.16 * Math.sin(a)), s * 0.11, 0, TAU);
      ctx.fill();
    }
  },
};

/** Pick a colour set for an instance (some species have variants). */
export function pickPalette(species) {
  const base = species.head.colors;
  const alts = species.head.alts;
  if (!alts || Math.random() < 0.45) return base;
  return alts[Math.floor(Math.random() * alts.length)];
}
