/* The garden behind the plants. The static parts are baked into an
   offscreen canvas on resize; only the grass and light move per frame. */

import { CFG } from './config.js';
import { rand, lerp, TAU, hash01, withAlpha, mix, shade, desaturate } from './util.js';

/* Each mood is a time of day. `mute` and `dark` say how far its backdrop is
   pulled toward grey and toward shadow before anything is painted.

   The plants are the only fully saturated things on screen, and they are
   what the player actually has to read — a pink tulip, a white daisy, a
   violet orchid. Left at full strength a peach dawn or a pale noon sky
   sits in exactly the same corner of the colour wheel as those blooms and
   swallows them. So the bright daytime moods are held back hardest, dusk
   less, and night barely at all: it is already far from any petal colour
   and muting it would only turn the scene to mud. */
const MOODS = [
  {
    name: 'dawn',
    sunAt: [0.24, 0.70], rim: 0.85,
    sky: ['#f9d7a8', '#f2a99b', '#8f8fc4'], sun: '#fff3cf',
    hill: ['#4c6b57', '#3a5546'], soil: '#3a2c22', grass: '#4e8c56',
    cloud: '#ffe6d2', clouds: 5, mute: 0.28, dark: 0.1,
  },
  {
    name: 'noon',
    sunAt: [0.64, 0.20], rim: 0.22,
    sky: ['#8fd4f2', '#bfe7f7', '#e8f6df'], sun: '#fffbe8',
    hill: ['#5d9060', '#3f6f4a'], soil: '#42301f', grass: '#5aa860',
    cloud: '#ffffff', clouds: 6, mute: 0.3, dark: 0.12,
  },
  {
    name: 'gold',
    sunAt: [0.80, 0.64], rim: 1.00,
    sky: ['#ffd08a', '#ffb46b', '#c9788a'], sun: '#fff0c0',
    hill: ['#5a7d4c', '#3d5c40'], soil: '#3d2b1c', grass: '#6a9c4e',
    cloud: '#ffd9b4', clouds: 4, mute: 0.3, dark: 0.11,
  },
  {
    name: 'dusk',
    sunAt: [0.84, 0.76], rim: 0.80,
    sky: ['#4a4a8c', '#8f6aa8', '#e08a86'], sun: '#ffd9b8',
    hill: ['#33475a', '#26333f'], soil: '#2a2129', grass: '#3f7057',
    cloud: '#9c7fa8', clouds: 3, mute: 0.22, dark: 0.08,
  },
  {
    name: 'night',
    sunAt: [0.72, 0.28], rim: 0.35,
    sky: ['#131e3a', '#25325c', '#4a4270'], sun: '#dfe8ff',
    hill: ['#1d2c3a', '#141d28'], soil: '#1e1a20', grass: '#2f5c48',
    cloud: '#2a3350', clouds: 2, mute: 0.10, dark: 0.02,
  },
];

/* What every muted backdrop colour leans toward. */
const SHADOW = '#1d2620';

export class Scene {
  constructor(view) {
    this.view = view;
    this.mood = MOODS[1];
    this.bg = document.createElement('canvas');
    this.tufts = [];
    this.sun = { x: 0, y: 0 };
    this.light = { x: -0.45, y: -0.89, rim: 0.4, color: '#ffffff' };
  }

  setRound(round) {
    this.mood = MOODS[(round - 1) % MOODS.length];
    this.build();
  }

  /** A backdrop colour, held back so the plants stay the loudest thing. */
  back(c, extraMute = 0, extraDark = 0) {
    const m = this.mood;
    return mix(
      desaturate(c, Math.min(0.92, m.mute + extraMute)),
      SHADOW,
      Math.min(0.7, m.dark + extraDark),
    );
  }

  build() {
    const { w, h, dpr } = this.view;
    const m = this.mood;
    const c = this.bg;
    c.width = Math.max(1, Math.round(w * dpr));
    c.height = Math.max(1, Math.round(h * dpr));
    const ctx = c.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const groundY = h * CFG.groundY;
    const horizon = h * CFG.horizon;

    // Sky, muted harder toward the horizon — that lower band is where the
    // blooms actually hang, so it is the part that has to stay quiet.
    const sky = ctx.createLinearGradient(0, 0, 0, horizon + h * 0.12);
    sky.addColorStop(0, this.back(m.sky[0]));
    sky.addColorStop(0.55, this.back(m.sky[1], 0.05, 0.03));
    sky.addColorStop(1, this.back(m.sky[2], 0.10, 0.06));
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, horizon + h * 0.14);

    if (m.name === 'night') this.drawStars(ctx, w, horizon);

    // Sun / moon with a soft bloom. Where it hangs is the mood's own —
    // dawn low in the east, gold and dusk sinking in the west — and it is
    // the same position everything in the field is then lit from.
    const sx = w * m.sunAt[0], sy = horizon * m.sunAt[1], sr = Math.min(w, h) * 0.075;
    this.sun = { x: sx, y: sy };
    // Direction from the meadow toward the light, treated as parallel rays.
    const lx = sx - w * 0.5, ly = sy - groundY * 0.72;
    const ll = Math.hypot(lx, ly) || 1;
    this.light = { x: lx / ll, y: ly / ll, rim: m.rim, color: m.sun };

    const glow = ctx.createRadialGradient(sx, sy, sr * 0.4, sx, sy, sr * 5);
    glow.addColorStop(0, withAlpha(m.sun, 0.42));
    glow.addColorStop(1, withAlpha(m.sun, 0));
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, horizon + h * 0.2);
    ctx.fillStyle = withAlpha(m.sun, 0.94);
    ctx.beginPath(); ctx.arc(sx, sy, sr, 0, TAU); ctx.fill();

    this.drawClouds(ctx, w, h, horizon);

    // Rolling hills, back to front, each with a low line of scrub along
    // its ridge so the horizon has some texture rather than a bare curve.
    for (let layer = 0; layer < 3; layer++) {
      const y = horizon + layer * h * 0.045;
      const amp = h * (0.05 - layer * 0.012);
      const base = layer === 2 ? m.hill[1] : mix(m.hill[0], m.hill[1], layer / 2);
      const col = this.back(base, 0.04, 0.04 + layer * 0.03);

      const ridgeY = (x) => y
        - Math.sin(x / (w * (0.22 + layer * 0.1)) * TAU + layer * 2.1) * amp
        - Math.sin(x / (w * 0.07) + layer) * amp * 0.22;
      const ridge = [];
      for (let x = 0; x <= w; x += 10) ridge.push({ x, y: ridgeY(x) });
      // Land exactly on the right edge. A step that stops short leaves a
      // sliver of bare sky running down the side of the screen.
      if (ridge[ridge.length - 1].x < w) ridge.push({ x: w, y: ridgeY(w) });

      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(0, h);
      ctx.lineTo(0, ridge[0].y);
      for (const p of ridge) ctx.lineTo(p.x, p.y);
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fill();

      if (layer < 2) this.drawScrub(ctx, ridge, col, h, layer);
    }

    // Haze where the land meets the sky.
    const haze = ctx.createLinearGradient(0, horizon - h * 0.05, 0, horizon + h * 0.11);
    haze.addColorStop(0, withAlpha(m.sun, 0));
    haze.addColorStop(0.45, withAlpha(m.sun, 0.13));
    haze.addColorStop(1, withAlpha(m.sun, 0));
    ctx.fillStyle = haze;
    ctx.fillRect(0, horizon - h * 0.05, w, h * 0.16);

    // Meadow
    const mead = ctx.createLinearGradient(0, horizon + h * 0.08, 0, groundY + 4);
    mead.addColorStop(0, this.back(m.hill[1], 0.04, 0.06));
    mead.addColorStop(1, this.back(m.grass, 0.08, 0.06));
    ctx.fillStyle = mead;
    ctx.fillRect(0, horizon + h * 0.09, w, groundY - horizon - h * 0.09 + 6);

    // Faint distant blooms so the meadow is not flat.
    for (let i = 0; i < 90; i++) {
      const t = hash01(i * 2.3);
      const y = lerp(horizon + h * 0.11, groundY - 8, t * t);
      const x = hash01(i * 9.1) * w;
      const r = lerp(0.9, 3.0, t) * this.view.scale;
      ctx.fillStyle = hash01(i * 4.1) > 0.72
        ? `rgba(255,228,190,${0.08 + t * 0.14})`
        : `rgba(255,255,255,${0.07 + t * 0.13})`;
      ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    }

    // The meadow sinks into shadow as it comes forward. That is how the
    // light would fall anyway, and it is what keeps a pale bloom legible
    // against the field it is standing in.
    const depth = ctx.createLinearGradient(0, horizon + h * 0.06, 0, groundY + 6);
    depth.addColorStop(0, 'rgba(14,22,16,0)');
    depth.addColorStop(1, 'rgba(14,22,16,.30)');
    ctx.fillStyle = depth;
    ctx.fillRect(0, horizon + h * 0.06, w, groundY - horizon - h * 0.06 + 8);

    // Soil bed
    const soilCol = this.back(m.soil, 0.02, 0.02);
    const soil = ctx.createLinearGradient(0, groundY - 6, 0, h);
    soil.addColorStop(0, mix(this.back(m.grass, 0.08, 0.06), soilCol, 0.5));
    soil.addColorStop(0.3, soilCol);
    soil.addColorStop(1, mix(soilCol, '#000000', 0.25));
    ctx.fillStyle = soil;
    ctx.beginPath();
    ctx.moveTo(0, groundY);
    const soilY = (x) => groundY - 3 + Math.sin(x / 37) * 2.5 + hash01(x) * 2;
    for (let x = 0; x <= w; x += 16) ctx.lineTo(x, soilY(x));
    ctx.lineTo(w, soilY(w));
    ctx.lineTo(w, h); ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fill();

    // Pebbles and clods
    for (let i = 0; i < 34; i++) {
      const x = hash01(i * 4.7) * w;
      const y = groundY + 6 + hash01(i * 8.3) * (h - groundY - 8);
      const r = (1.4 + hash01(i * 2.9) * 3) * this.view.scale;
      ctx.fillStyle = `rgba(255,255,255,${0.04 + hash01(i) * 0.05})`;
      ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.65, hash01(i) * 3, 0, TAU); ctx.fill();
    }

    // Vignette
    const vg = ctx.createRadialGradient(w / 2, h * 0.45, Math.min(w, h) * 0.32, w / 2, h * 0.5, Math.max(w, h) * 0.78);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(4,8,6,.56)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);

    this.buildTufts();
  }

  /** Night sky, with a handful of the brighter stars given a soft glint. */
  drawStars(ctx, w, horizon) {
    for (let i = 0; i < 80; i++) {
      const x = hash01(i * 3.1) * w;
      const y = hash01(i * 7.7) * horizon * 0.92;
      const b = hash01(i * 11.3);
      const r = hash01(i * 5.5) * 1.3 + 0.35;
      if (b > 0.93) {
        const g = ctx.createRadialGradient(x, y, 0, x, y, r * 7);
        g.addColorStop(0, 'rgba(214,232,255,.45)');
        g.addColorStop(1, 'rgba(214,232,255,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(x, y, r * 7, 0, TAU); ctx.fill();
      }
      ctx.fillStyle = `rgba(255,253,244,${0.22 + b * 0.6})`;
      ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    }
  }

  /** Soft banks of cloud, built from overlapping feathered lobes. */
  drawClouds(ctx, w, h, horizon) {
    const m = this.mood;
    const col = this.back(m.cloud, 0.1, 0);
    for (let i = 0; i < m.clouds; i++) {
      const x = hash01(i * 12.7 + 3) * w * 1.1 - w * 0.05;
      const y = horizon * (0.16 + hash01(i * 5.3) * 0.6);
      const size = h * (0.020 + hash01(i * 8.9) * 0.026);
      const alpha = 0.16 + hash01(i * 2.7) * 0.18;
      for (let k = 0; k < 6; k++) {
        const f = k / 5 - 0.5;
        const lx = x + f * size * 6.4;
        const lr = size * (1 - Math.abs(f) * 1.25) + size * 0.35 * hash01(i * 30 + k);
        if (lr <= 0) continue;
        // Flattened in a scaled space, and the gradient reaches zero exactly
        // at the circle's edge — filling an ellipse with a round gradient
        // clips the falloff and leaves a visible straight seam.
        ctx.save();
        ctx.translate(lx, y);
        ctx.scale(1, 0.62);
        const g = ctx.createRadialGradient(0, 0, lr * 0.25, 0, 0, lr * 1.9);
        g.addColorStop(0, withAlpha(col, alpha));
        g.addColorStop(1, withAlpha(col, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(0, 0, lr * 1.9, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
    }
  }

  /* Scrub along a ridge, painted in the hill's own colour so it reads as a
     ragged treeline growing out of the silhouette. Tinting it darker just
     turns it into a row of floating dots. */
  drawScrub(ctx, ridge, colour, h, seed) {
    ctx.fillStyle = colour;
    const n = 34 + seed * 12;
    for (let i = 0; i < n; i++) {
      const f = hash01(seed * 41 + i * 3.7);
      const p = ridge[Math.min(ridge.length - 1, Math.floor(f * ridge.length))];
      const r = h * (0.005 + hash01(seed * 17 + i) * 0.006);
      ctx.beginPath();
      ctx.ellipse(p.x, p.y - r * 0.5, r * 1.15, r, 0, 0, TAU);
      ctx.fill();
    }
  }

  buildTufts() {
    const { w, h, scale } = this.view;
    const groundY = h * CFG.groundY;
    const grass = this.back(this.mood.grass, 0.06, 0.04);
    this.tufts = [];
    const n = Math.round(w / (8 / scale));
    for (let i = 0; i < n; i++) {
      // 0 sits at the back of the verge, 1 right under the player's thumb.
      const depth = Math.random();
      const tone = 0.5 + rand(0.5);
      this.tufts.push({
        x: (i / n) * w + rand(12, -12),
        y: groundY + rand(12, -6) + depth * 5 * scale,
        hgt: rand(34, 12) * scale * lerp(0.7, 1.15, depth),
        lean: rand(0.5, -0.5),
        ph: rand(TAU),
        depth,
        // Baked here rather than per frame: this runs once a round, the
        // draw loop runs sixty times a second.
        col: withAlpha(
          shade(grass, -32 + tone * 30 + depth * 22),
          lerp(0.55, 0.95, depth),
        ),
        lw: 2 * scale * tone * lerp(0.7, 1.15, depth),
      });
    }
    this.tufts.sort((a, b) => a.depth - b.depth);
    this.buildFringe();
  }

  /* Out-of-focus blades right at the bottom of the screen, drawn over
     everything. Costs almost nothing and buys real depth — but it is kept
     low and weighted to the edges, because a stem's cut band can sit close
     to the soil and must never end up hidden behind scenery. */
  buildFringe() {
    const { w, h, scale } = this.view;
    this.fringe = [];
    const n = Math.round(w / (26 / scale));
    for (let i = 0; i < n; i++) {
      const x = (i / n) * w + rand(18, -18);
      // Tallest at the edges, barely there across the middle of the field.
      const edge = Math.abs(x / w - 0.5) * 2;
      const reach = lerp(0.30, 1, edge * edge);
      this.fringe.push({
        x,
        y: h + 4 * scale,
        hgt: rand(78, 34) * scale * reach,
        lean: rand(0.6, -0.6),
        ph: rand(TAU),
        w: rand(9, 4) * scale,
        alpha: 0.30 + Math.random() * 0.22,
      });
    }
  }

  draw(ctx) {
    const { dpr } = this.view;
    ctx.drawImage(this.bg, 0, 0, this.bg.width / dpr, this.bg.height / dpr);
  }

  /** The out-of-focus fringe, drawn last of all — closest to the player. */
  drawFringe(ctx, time) {
    if (!this.fringe) return;
    ctx.save();
    ctx.lineCap = 'round';
    for (const f of this.fringe) {
      const sway = Math.sin(time / 1400 + f.ph) * 0.16;
      // Softened by stacking a couple of wide translucent passes rather than
      // a real blur: ctx.filter is unreliable on mobile Safari.
      for (let pass = 0; pass < 2; pass++) {
        ctx.strokeStyle = `rgba(8,16,12,${f.alpha * (pass ? 0.55 : 1)})`;
        ctx.lineWidth = f.w * (pass ? 2.1 : 1);
        ctx.beginPath();
        ctx.moveTo(f.x, f.y);
        ctx.quadraticCurveTo(
          f.x + (f.lean + sway) * f.hgt * 0.35, f.y - f.hgt * 0.6,
          f.x + (f.lean + sway) * f.hgt, f.y - f.hgt,
        );
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  /** Foreground grass, drawn over the plant bases. */
  drawGrass(ctx, time) {
    ctx.save();
    ctx.lineCap = 'round';
    for (const t of this.tufts) {
      const sway = Math.sin(time / 1100 + t.ph) * 0.22 * lerp(0.6, 1.2, t.depth);
      ctx.strokeStyle = t.col;
      ctx.lineWidth = t.lw;
      ctx.beginPath();
      ctx.moveTo(t.x, t.y);
      ctx.quadraticCurveTo(
        t.x + (t.lean + sway) * t.hgt * 0.4, t.y - t.hgt * 0.6,
        t.x + (t.lean + sway) * t.hgt, t.y - t.hgt,
      );
      ctx.stroke();
    }
    ctx.restore();
  }
}

export { MOODS };
