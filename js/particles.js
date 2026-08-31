/* Petals, sparks, drifting pollen and floating score labels. */

import { rand, randInt, clamp, TAU, withAlpha, shade } from './util.js';
import { petalPath } from './draw.js';

export class Particles {
  constructor(view) {
    this.view = view;
    this.bits = [];
    this.labels = [];
    this.pollen = [];
    this.shake = 0;
    this.shakeDecay = 0;
  }

  reset() { this.bits.length = 0; this.labels.length = 0; this.shake = 0; }

  seedPollen(n = 26) {
    this.pollen.length = 0;
    for (let i = 0; i < n; i++) {
      this.pollen.push({
        x: rand(this.view.w), y: rand(this.view.h),
        r: rand(2.2, 0.7) * this.view.scale,
        sp: rand(14, 4), ph: rand(TAU), a: rand(0.35, 0.08),
      });
    }
  }

  burst(x, y, colors, n = 14, opts = {}) {
    const s = this.view.scale;
    const { power = 1, spread = TAU, dir = -Math.PI / 2, kind = 'petal' } = opts;
    for (let i = 0; i < n; i++) {
      const a = dir + rand(spread / 2, -spread / 2);
      const v = rand(320, 90) * power * s;
      this.bits.push({
        kind, x, y,
        vx: Math.cos(a) * v, vy: Math.sin(a) * v,
        rot: rand(TAU), spin: rand(9, -9),
        size: (kind === 'spark' ? rand(3.4, 1.2) : rand(8, 3.5)) * s,
        color: colors[randInt(0, colors.length - 1)],
        life: 0, ttl: rand(1100, 520),
        drag: kind === 'spark' ? 0.90 : 0.965,
        grav: kind === 'spark' ? 240 : 620,
      });
    }
  }

  label(x, y, text, color, opts = {}) {
    this.labels.push({
      x, y, text, color,
      size: (opts.size ?? 17) * this.view.scale,
      sub: opts.sub || '',
      life: 0, ttl: opts.ttl ?? 1000,
      vy: opts.vy ?? -46 * this.view.scale,
      bold: opts.bold !== false,
    });
  }

  kick(amount) {
    this.shake = Math.max(this.shake, amount * this.view.scale);
  }

  update(dt, time) {
    const d = dt / 1000;
    this.time = time;
    for (let i = this.bits.length - 1; i >= 0; i--) {
      const b = this.bits[i];
      b.life += dt;
      if (b.life > b.ttl) { this.bits.splice(i, 1); continue; }
      b.x += b.vx * d; b.y += b.vy * d;
      b.vy += b.grav * d;
      b.vx *= Math.pow(b.drag, dt / 16);
      b.rot += b.spin * d;
    }
    for (let i = this.labels.length - 1; i >= 0; i--) {
      const l = this.labels[i];
      l.life += dt;
      if (l.life > l.ttl) { this.labels.splice(i, 1); continue; }
      l.y += l.vy * d;
      l.vy *= Math.pow(0.94, dt / 16);
    }
    for (const p of this.pollen) {
      p.y -= p.sp * d * this.view.scale;
      p.x += Math.sin(time / 1400 + p.ph) * 14 * d * this.view.scale;
      if (p.y < -10) { p.y = this.view.h + 10; p.x = rand(this.view.w); }
    }
    this.shake *= Math.pow(0.86, dt / 16);
    if (this.shake < 0.2) this.shake = 0;
  }

  drawPollen(ctx) {
    const t = this.time || 0;
    ctx.save();
    for (const p of this.pollen) {
      // Each mote catches the light on its own cycle. Motionless specks at a
      // fixed opacity read as dust on the lens; a slow flicker reads as air.
      const twinkle = 0.72 + 0.28 * Math.sin(t / 620 + p.ph * 2.3);
      ctx.fillStyle = `rgba(255,246,205,${p.a * twinkle})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  draw(ctx) {
    ctx.save();
    for (const b of this.bits) {
      const k = 1 - b.life / b.ttl;
      ctx.globalAlpha = clamp(k * 1.6, 0, 1);
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.rot);
      if (b.kind === 'spark') {
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = b.color;
        ctx.beginPath(); ctx.arc(0, 0, b.size * k, 0, TAU); ctx.fill();
      } else {
        // A torn-off petal, not a blob: the same outline the blooms are
        // built from, squashed across its short axis as it turns so it
        // reads as tumbling through edge-on rather than spinning flat.
        // Edge-on twice a turn, straight off its own rotation: physically
        // what a tumbling petal does, and it costs no extra random draw —
        // which matters because the game's stream is seeded for the balance
        // harness, and one more draw per particle shifts every later spawn.
        const edge = Math.abs(Math.cos(b.rot));
        const len = b.size * 2.1;
        ctx.translate(0, len * 0.5);
        ctx.scale(clamp(0.2 + edge * 0.8, 0.12, 1), 1);
        // Darker as it turns away, so a drift of petals has some depth.
        ctx.fillStyle = edge > 0.5 ? b.color : shade(b.color, -26);
        petalPath(ctx, len, b.size * 0.78, 0.45);
        ctx.fill();
      }
      ctx.restore();
    }
    ctx.restore();
  }

  drawLabels(ctx) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const l of this.labels) {
      const k = l.life / l.ttl;
      const pop = k < 0.12 ? 0.7 + (k / 0.12) * 0.4 : 1;
      ctx.globalAlpha = clamp((1 - k) * 2.2, 0, 1);
      ctx.save();
      ctx.translate(l.x, l.y);
      ctx.scale(pop, pop);
      ctx.font = `${l.bold ? '800' : '600'} ${l.size}px ui-rounded, "SF Pro Rounded", system-ui, sans-serif`;
      ctx.lineWidth = 4 * this.view.scale;
      ctx.strokeStyle = 'rgba(6,12,8,.75)';
      ctx.strokeText(l.text, 0, 0);
      ctx.fillStyle = l.color;
      ctx.fillText(l.text, 0, 0);
      if (l.sub) {
        ctx.font = `600 ${l.size * 0.62}px ui-rounded, system-ui, sans-serif`;
        ctx.strokeText(l.sub, 0, l.size * 0.95);
        ctx.fillStyle = withAlpha('#ffffff', 0.75);
        ctx.fillText(l.sub, 0, l.size * 0.95);
      }
      ctx.restore();
    }
    ctx.restore();
  }
}
