/* Binding the round's harvest into a bouquet: composition scoring plus
   the animated arrangement drawn on the canvas. */

import { CFG } from './config.js';
import { clamp, lerp, rand, TAU, tolScore, smoothstep } from './util.js';
import { drawStem, drawHead } from './draw.js';

/* ── Scoring ──────────────────────────────────────────────────────── */

/* Rows carry a translation key + interpolation vars rather than baked
   English text — ui.js renders them through i18n at display time, so a
   language switch never needs this scoring pass to run again. */
export function scoreBouquet(stems, { stings = 0 } = {}) {
  const B = CFG.bouquet;
  const rows = [];
  const n = stems.length;

  if (n === 0) {
    return {
      rows: [{ labelKey: 'row.emptyLabel', noteKey: 'row.emptyNote', value: 0 }],
      total: 0, stars: 0, nameKey: null,
    };
  }

  const avgQ = stems.reduce((s, x) => s + x.quality, 0) / n;
  const craft = Math.round(avgQ * 320);
  rows.push({ labelKey: 'row.craft', noteKey: 'row.craftNote', noteVars: { pct: Math.round(avgQ * 100) }, value: craft });

  const fullRatio = n / B.idealSize;
  const fullness = Math.round(220 * (fullRatio <= 1 ? fullRatio : clamp(1 - (fullRatio - 1) * 0.35, 0.55, 1)));
  rows.push({ labelKey: 'row.fullness', noteKey: 'row.fullnessNote', noteN: n, value: fullness });

  const greens = stems.filter((s) => s.species.kind === 'green').length;
  const ratio = greens / n;
  const foliage = Math.round(160 * tolScore(ratio - B.idealGreenRatio, 0.24));
  rows.push({
    labelKey: 'row.foliage',
    noteKey: greens === 0 ? 'row.foliageNone' : 'row.foliageNote',
    noteVars: { pct: Math.round(ratio * 100) },
    value: foliage,
  });

  const kinds = new Set(stems.map((s) => s.species.id));
  const variety = Math.min(6, kinds.size) * B.varietyBonus;
  rows.push({ labelKey: 'row.variety', noteKey: 'row.varietyNote', noteN: kinds.size, value: variety });

  const lens = stems.map((s) => s.stemLen);
  const mean = lens.reduce((a, b) => a + b, 0) / n;
  const dev = Math.sqrt(lens.reduce((a, b) => a + (b - mean) ** 2, 0) / n) / (mean || 1);
  const harmony = Math.round(B.stemHarmonyMax * clamp(1 - dev / 0.8, 0, 1));
  rows.push({
    labelKey: 'row.harmony',
    noteKey: dev < 0.18 ? 'row.harmonyEven' : 'row.harmonyUneven',
    value: harmony,
  });

  const fresh = stems.reduce((s, x) => s + (x.timing ?? 0), 0) / n;
  const freshness = Math.round(160 * fresh);
  rows.push({ labelKey: 'row.freshness', noteKey: 'row.freshnessNote', noteVars: { pct: Math.round(fresh * 100) }, value: freshness });

  if (stings === 0) rows.push({ labelKey: 'row.unstung', noteKey: 'row.unstungNote', value: 150 });
  else rows.push({ labelKey: 'row.stings', noteKey: 'row.stingsNote', noteN: stings, value: -120 * stings });

  const total = rows.reduce((s, r) => s + r.value, 0);
  const stars = clamp(Math.round((total / 1150) * 5), 0, 5);
  return { rows, total, stars, avgQ, nameKey: bouquetNameKey(stems, avgQ) };
}

function bouquetNameKey(stems, avgQ) {
  const n = stems.length;
  const kinds = new Set(stems.map((s) => s.species.id)).size;
  const greens = stems.filter((s) => s.species.kind === 'green').length / n;
  if (n <= 3) return 'sprig';
  if (avgQ > 0.88 && n >= 10) return 'masterpiece';
  if (kinds >= 5) return 'cottage';
  if (greens > 0.5) return 'foliage';
  if (greens < 0.1) return 'allBlooms';
  if (avgQ < 0.45) return 'rustic';
  return 'handsome';
}

/* ── Arrangement ──────────────────────────────────────────────────── */

export class Bouquet {
  constructor(view, stems) {
    this.view = view;
    this.stems = stems.slice(0, 22);
    this.age = 0;
    this.layout();
  }

  layout() {
    const { w, h } = this.view;
    // The results panel owns the bottom half, so the binding point sits high
    // enough that even the shortest bloom clears it.
    this.bind = { x: w / 2, y: h * 0.46 };
    this.maxLen = Math.min(h * 0.30, w * 0.62);

    // Greens first (they sit at the back and edges), then blooms by quality
    // so the best cut sits proudly in the middle.
    const greens = this.stems.filter((s) => s.species.kind === 'green');
    const blooms = this.stems.filter((s) => s.species.kind !== 'green')
      .sort((a, b) => b.quality - a.quality);

    const order = [...greens, ...blooms];
    const n = order.length || 1;
    const spread = clamp(0.30 + n * 0.022, 0.34, 0.78);

    this.items = order.map((s, i) => {
      // Fan out from the middle: 0, +1, -1, +2, -2 …
      const rank = i < greens.length ? i : i - greens.length;
      const group = i < greens.length ? greens.length : blooms.length;
      const fanIdx = centreOut(rank, group);
      const f = group <= 1 ? 0 : fanIdx / ((group - 1) / 2);
      const back = i < greens.length;
      // Greens splay wider and frame the blooms gathered in the middle.
      const a = f * spread * (back ? 1.25 : 0.72);
      const lenScale = clamp(s.stemLen / (this.view.h * 0.28), 0.74, 1.16);
      // Shorter towards the edges gives the classic domed posy; a little
      // jitter stops heads at the same angle from stacking into one blob.
      const dome = 1 - Math.abs(f) * (back ? 0.08 : 0.26);
      const angle = a + rand(0.04, -0.04);
      let len = this.maxLen * lenScale * (back ? 1.05 : 1) * dome * rand(1.06, 0.94);
      // Keep the widest stems (and their heads) inside the screen.
      const reach = (w * 0.40) / Math.max(0.12, Math.abs(Math.sin(angle)));
      len = Math.min(len, reach);
      return {
        stem: s,
        angle,
        len,
        bow: rand(0.1, -0.1) + f * 0.12,
        nudge: rand(7, -7) * this.view.scale,
        delay: i * 70,
        back,
        seed: s.seed,
      };
    });

    // Back layer painted first.
    this.items.sort((a, b) => (a.back === b.back ? 0 : a.back ? -1 : 1));
    this.buildMs = n * 70 + 700;
  }

  update(dt) { this.age += dt; }

  get progress() { return clamp(this.age / this.buildMs, 0, 1); }

  draw(ctx) {
    const { scale } = this.view;
    const b = this.bind;

    for (const it of this.items) {
      const k = smoothstep(clamp((this.age - it.delay) / 460, 0, 1));
      if (k <= 0) continue;
      const len = it.len * k;
      const dir = { x: Math.sin(it.angle), y: -Math.cos(it.angle) };
      const perp = { x: -dir.y, y: dir.x };
      const ox = perp.x * it.nudge, oy = perp.y * it.nudge;
      const pts = [];
      for (let i = 0; i <= 10; i++) {
        const t = i / 10;
        const bow = Math.sin(t * Math.PI) * it.bow * len;
        pts.push({
          x: b.x + ox * (1 - t) + dir.x * len * t + perp.x * bow,
          y: b.y + oy * (1 - t) + dir.y * len * t + perp.y * bow,
        });
      }
      const s = it.stem;
      ctx.save();
      // Back layer sits slightly behind in tone. Alpha rather than
      // ctx.filter, which is patchy on mobile Safari.
      ctx.globalAlpha = k * (it.back ? 0.86 : 1);
      drawStem(ctx, pts, s.width ?? 4 * scale, s.species.stem.color, { taper: 0.75, seed: it.seed });
      const tip = pts[10], prev = pts[9];
      ctx.translate(tip.x, tip.y);
      ctx.rotate(Math.atan2(tip.y - prev.y, tip.x - prev.x) + Math.PI / 2);
      // Heads sit a touch smaller here than in the field so a full bouquet
      // does not turn into one solid mass of petals.
      const hs = (s.headScale ?? scale) * 0.82 * lerp(0.86, 1.06, s.quality);
      drawHead(ctx, s.species.head, {
        open: Math.max(0.85, s.open ?? 1), wilt: (s.wilt ?? 0) * 0.5,
        scale: hs, seed: it.seed, palette: s.palette,
      });
      ctx.restore();
    }

    this.drawWrap(ctx);
  }

  drawWrap(ctx) {
    if (!this.items.length) return;
    const wrapK = smoothstep(clamp((this.age - this.items.length * 70 - 120) / 420, 0, 1));
    if (wrapK <= 0) return;
    const { scale, h } = this.view;
    const b = this.bind;
    const wW = Math.min(h * 0.10, this.view.w * 0.2) * wrapK;
    const wH = h * 0.14;

    ctx.save();
    ctx.translate(b.x, b.y);

    // Kraft paper cone
    const g = ctx.createLinearGradient(-wW, 0, wW, 0);
    g.addColorStop(0, '#b08a5f');
    g.addColorStop(0.45, '#e2c294');
    g.addColorStop(1, '#96714a');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-wW, -wH * 0.55);
    ctx.quadraticCurveTo(-wW * 0.5, -wH * 0.72, 0, -wH * 0.62);
    ctx.quadraticCurveTo(wW * 0.5, -wH * 0.72, wW, -wH * 0.55);
    ctx.lineTo(wW * 0.34, wH * 0.5);
    ctx.quadraticCurveTo(0, wH * 0.62, -wW * 0.34, wH * 0.5);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = 'rgba(90,64,40,.35)';
    ctx.lineWidth = 1.2 * scale;
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(wW * 0.32 * i, -wH * 0.6);
      ctx.lineTo(wW * 0.13 * i, wH * 0.5);
      ctx.stroke();
    }

    // Ribbon
    const rk = smoothstep(clamp((this.age - this.items.length * 70 - 380) / 380, 0, 1));
    if (rk > 0) {
      ctx.globalAlpha = rk;
      ctx.fillStyle = '#d9536f';
      ctx.beginPath();
      ctx.roundRect
        ? ctx.roundRect(-wW * 0.95, -wH * 0.06, wW * 1.9, wH * 0.15, wH * 0.05)
        : ctx.rect(-wW * 0.95, -wH * 0.06, wW * 1.9, wH * 0.15);
      ctx.fill();
      const bow = wW * 0.42 * rk;
      ctx.fillStyle = '#e8748c';
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(side * bow, -bow * 0.8, side * bow * 1.1, bow * 0.12);
        ctx.quadraticCurveTo(side * bow * 0.5, bow * 0.3, 0, 0);
        ctx.fill();
      }
      ctx.fillStyle = '#c94a63';
      ctx.beginPath(); ctx.arc(0, 0, wW * 0.11, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }
}

function centreOut(i, n) {
  // 0, +1, -1, +2, -2 … so the first item lands in the middle of the fan.
  const step = Math.ceil(i / 2);
  return (i % 2 ? 1 : -1) * step;
}
