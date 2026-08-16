/* The garden behind the plants. The static parts are baked into an
   offscreen canvas on resize; only the grass and light move per frame. */

import { CFG } from './config.js';
import { rand, lerp, TAU, hash01, withAlpha } from './util.js';

const MOODS = [
  { name: 'dawn',  sky: ['#f9d7a8', '#f2a99b', '#8f8fc4'], sun: '#fff3cf', hill: ['#4c6b57', '#3a5546'], soil: '#3a2c22', grass: '#4e8c56' },
  { name: 'noon',  sky: ['#8fd4f2', '#bfe7f7', '#e8f6df'], sun: '#fffbe8', hill: ['#5d9060', '#3f6f4a'], soil: '#42301f', grass: '#5aa860' },
  { name: 'gold',  sky: ['#ffd08a', '#ffb46b', '#c9788a'], sun: '#fff0c0', hill: ['#5a7d4c', '#3d5c40'], soil: '#3d2b1c', grass: '#6a9c4e' },
  { name: 'dusk',  sky: ['#4a4a8c', '#8f6aa8', '#e08a86'], sun: '#ffd9b8', hill: ['#33475a', '#26333f'], soil: '#2a2129', grass: '#3f7057' },
  { name: 'night', sky: ['#131e3a', '#25325c', '#4a4270'], sun: '#dfe8ff', hill: ['#1d2c3a', '#141d28'], soil: '#1e1a20', grass: '#2f5c48' },
];

export class Scene {
  constructor(view) {
    this.view = view;
    this.mood = MOODS[1];
    this.bg = document.createElement('canvas');
    this.tufts = [];
  }

  setRound(round) {
    this.mood = MOODS[(round - 1) % MOODS.length];
    this.build();
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

    // Sky
    const sky = ctx.createLinearGradient(0, 0, 0, horizon + h * 0.12);
    sky.addColorStop(0, m.sky[0]);
    sky.addColorStop(0.55, m.sky[1]);
    sky.addColorStop(1, m.sky[2]);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, horizon + h * 0.14);

    // Sun / moon with a soft bloom
    const sx = w * 0.72, sy = horizon * 0.36, sr = Math.min(w, h) * 0.075;
    const glow = ctx.createRadialGradient(sx, sy, sr * 0.4, sx, sy, sr * 5);
    glow.addColorStop(0, withAlpha(m.sun, 0.55));
    glow.addColorStop(1, withAlpha(m.sun, 0));
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, horizon + h * 0.2);
    ctx.fillStyle = m.sun;
    ctx.beginPath(); ctx.arc(sx, sy, sr, 0, TAU); ctx.fill();

    if (m.name === 'night') {
      for (let i = 0; i < 60; i++) {
        const x = hash01(i * 3.1) * w, y = hash01(i * 7.7) * horizon * 0.9;
        ctx.fillStyle = `rgba(255,255,255,${0.2 + hash01(i * 11.3) * 0.6})`;
        ctx.beginPath(); ctx.arc(x, y, hash01(i * 5.5) * 1.4 + 0.4, 0, TAU); ctx.fill();
      }
    }

    // Rolling hills, back to front
    for (let layer = 0; layer < 3; layer++) {
      const y = horizon + layer * h * 0.045;
      const amp = h * (0.05 - layer * 0.012);
      const col = layer === 2 ? m.hill[1] : lerpHex(m.hill[0], m.hill[1], layer / 2);
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(0, h);
      ctx.lineTo(0, y);
      for (let x = 0; x <= w; x += 12) {
        const yy = y - Math.sin(x / (w * (0.22 + layer * 0.1)) * TAU + layer * 2.1) * amp
                     - Math.sin(x / (w * 0.07) + layer) * amp * 0.22;
        ctx.lineTo(x, yy);
      }
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fill();
    }

    // Meadow
    const mead = ctx.createLinearGradient(0, horizon + h * 0.08, 0, groundY + 4);
    mead.addColorStop(0, m.hill[1]);
    mead.addColorStop(1, m.grass);
    ctx.fillStyle = mead;
    ctx.fillRect(0, horizon + h * 0.09, w, groundY - horizon - h * 0.09 + 6);

    // Faint distant blooms so the meadow is not flat
    for (let i = 0; i < 70; i++) {
      const t = hash01(i * 2.3);
      const y = lerp(horizon + h * 0.11, groundY - 8, t * t);
      const x = hash01(i * 9.1) * w;
      const r = lerp(1, 3.2, t) * this.view.scale;
      ctx.fillStyle = `rgba(255,255,255,${0.10 + t * 0.16})`;
      ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    }

    // Soil bed
    const soil = ctx.createLinearGradient(0, groundY - 6, 0, h);
    soil.addColorStop(0, lerpHex(m.grass, m.soil, 0.5));
    soil.addColorStop(0.3, m.soil);
    soil.addColorStop(1, lerpHex(m.soil, '#000000', 0.22));
    ctx.fillStyle = soil;
    ctx.beginPath();
    ctx.moveTo(0, groundY);
    for (let x = 0; x <= w; x += 16) {
      ctx.lineTo(x, groundY - 3 + Math.sin(x / 37) * 2.5 + hash01(x) * 2);
    }
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
    const vg = ctx.createRadialGradient(w / 2, h * 0.45, Math.min(w, h) * 0.35, w / 2, h * 0.5, Math.max(w, h) * 0.78);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(4,8,6,.5)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);

    this.buildTufts();
  }

  buildTufts() {
    const { w, h, scale } = this.view;
    const groundY = h * CFG.groundY;
    this.tufts = [];
    const n = Math.round(w / (11 / scale));
    for (let i = 0; i < n; i++) {
      this.tufts.push({
        x: (i / n) * w + rand(10, -10),
        y: groundY + rand(10, -4),
        hgt: rand(34, 12) * scale,
        lean: rand(0.5, -0.5),
        ph: rand(TAU),
        shade: 0.5 + rand(0.5),
      });
    }
  }

  draw(ctx, time) {
    const { w, h, dpr } = this.view;
    ctx.drawImage(this.bg, 0, 0, this.bg.width / dpr, this.bg.height / dpr);
  }

  /** Foreground grass, drawn over the plant bases. */
  drawGrass(ctx, time) {
    const m = this.mood;
    ctx.save();
    ctx.lineCap = 'round';
    for (const t of this.tufts) {
      const sway = Math.sin(time / 1100 + t.ph) * 0.22;
      ctx.strokeStyle = withAlpha(shadeHex(m.grass, -18 + t.shade * 26), 0.9);
      ctx.lineWidth = 2 * this.view.scale * t.shade;
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

function lerpHex(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const r = lerp((pa >> 16) & 255, (pb >> 16) & 255, t);
  const g = lerp((pa >> 8) & 255, (pb >> 8) & 255, t);
  const c = lerp(pa & 255, pb & 255, t);
  return `rgb(${r | 0},${g | 0},${c | 0})`;
}

function shadeHex(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, ((n >> 16) & 255) + amt));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt));
  const b = Math.max(0, Math.min(255, (n & 255) + amt));
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

export { MOODS };
