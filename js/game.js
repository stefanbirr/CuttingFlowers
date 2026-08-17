/* Game state machine: spawning, slicing, grading, rounds and bouquets. */

import { CFG } from './config.js';
import { poolForRound, pickSpecies } from './species.js';
import { Flower } from './flower.js';
import { Blade, patternScore, crossScore } from './gesture.js';
import { gradeCut, weakestPart } from './scoring.js';
import { Scene } from './scene.js';
import { Particles } from './particles.js';
import { Bouquet, scoreBouquet } from './bouquet.js';
import { sound } from './audio.js';
import { store } from './storage.js';
import { ui } from './ui.js';
import { clamp, lerp, rand } from './util.js';

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.view = { w: 1, h: 1, dpr: 1, scale: 1, groundY: 1 };
    this.scene = new Scene(this.view);
    this.fx = new Particles(this.view);
    this.blade = new Blade(canvas, this.view);
    this.blade.onSegment = (a, b, id) => this.onBladeSegment(a, b, id);
    this.blade.onStrokeEnd = (id) => this.onStrokeEnd(id);

    this.state = 'menu';
    this.flowers = [];
    this.pieces = [];
    this.pending = [];
    this.harvest = [];
    this.total = 0;
    this.round = 1;
    this.last = 0;
    this.time = 0;
    this.pool = poolForRound(3);
    this.spawnIn = 300;

    this.resize();
    this.scene.setRound(1);
    this.fx.seedPollen();
  }

  /* ── Viewport ───────────────────────────────────────────────────── */

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const v = this.view;
    v.w = w; v.h = h; v.dpr = dpr;
    v.scale = clamp(Math.min(w / 420, h / 760), 0.68, 1.65);
    v.groundY = h * CFG.groundY;

    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    this.basket = { x: w - 40 * v.scale, y: h - 44 * v.scale };
    this.scene.build();
    this.fx.seedPollen(Math.round(22 * v.scale));
    if (this.bouquet) this.bouquet.layout();
  }

  /* ── Round lifecycle ────────────────────────────────────────────── */

  startRun() {
    this.total = 0;
    this.round = 1;
    this.startRound();
  }

  startRound() {
    this.state = 'playing';
    this.flowers.length = 0;
    this.pieces.length = 0;
    this.pending.length = 0;
    this.harvest = [];
    this.fx.reset();
    this.bouquet = null;

    this.roundPoints = 0;
    this.strikes = 0;
    this.stungCount = 0;
    this.streak = 0;
    this.combo = 1;
    this.cutCount = 0;
    this.timeLeft = CFG.roundSeconds * 1000;
    this.spawnIn = 500;
    this.quota = Math.round(CFG.quotaBase * Math.pow(CFG.quotaGrowth, this.round - 1));
    this.pool = poolForRound(this.round);
    this.lastTickSecond = 99;

    this.scene.setRound(this.round);
    this.blade.enabled = true;

    ui.showHud(true);
    ui.setScore(this.total);
    ui.setRound(this.round);
    ui.setBasket(0);
    ui.setQuota(0, this.quota);
    ui.setCombo(1);
    ui.setStrikes(0, CFG.strikesAllowed);
    ui.setTime(CFG.roundSeconds);
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.blade.enabled = false;
    this.blade.release();
    ui.show('screenPause');
  }

  resume() {
    if (this.state !== 'paused') return;
    ui.hide('screenPause');
    this.state = 'playing';
    this.blade.enabled = true;
    this.last = performance.now();
  }

  quit() {
    this.state = 'menu';
    this.blade.enabled = false;
    this.flowers.length = 0;
    this.pieces.length = 0;
    this.fx.reset();
    ui.showHud(false);
    ui.hide('screenPause');
    ui.setBest(store.get('best'));
    ui.show('screenTitle');
  }

  /* ── Spawning ───────────────────────────────────────────────────── */

  spawnGap() {
    const g = CFG.baseSpawnGap * Math.pow(CFG.spawnGapDecay, this.round - 1);
    return Math.max(CFG.spawnGapFloor, g) * rand(1.25, 0.75);
  }

  /** How many stems may stand at once, easing up a little each round. */
  maxAliveForRound() {
    return Math.min(CFG.maxAlive + Math.floor((this.round - 1) / CFG.maxAliveStep), CFG.maxAliveCap);
  }

  spawn(ambient = false) {
    const alive = this.flowers.filter((f) => f.state === 'alive');
    if (!ambient && alive.length >= this.maxAliveForRound()) return;

    const species = ambient
      ? pickSpecies(this.pool.filter((p) => p.species.kind !== 'hazard'))
      : pickSpecies(this.pool);
    // Head radius accounts for the oversized bloom art (CFG.headScale), not
    // just the stem's footprint, so canopies actually clear each other.
    const headR = species.head.size * this.view.scale * CFG.headScale * 0.5;
    const margin = 22 * this.view.scale + headR;
    const clearance = CFG.spawnClearance * this.view.h;

    let best = null, bestGap = -1;
    for (let i = 0; i < 10; i++) {
      const x = rand(this.view.w - margin, margin);
      let gap = Infinity;
      for (const f of alive) gap = Math.min(gap, Math.abs(f.baseX - x) - headR - f.headSize * 0.5);
      if (gap > bestGap) { bestGap = gap; best = x; }
      if (gap > clearance) break;
    }
    // Nowhere clear enough to sprout without crowding a neighbour — sit
    // this tick out rather than cram two canopies together.
    if (!ambient && alive.length > 0 && bestGap < clearance) return;

    this.flowers.push(new Flower(species, best, this.view, ambient ? 1 : this.round));
    if (!ambient) sound.sprout();
  }

  /* ── Slicing ────────────────────────────────────────────────────── */

  onBladeSegment(a, b, strokeId) {
    if (this.state !== 'playing') return;
    const now = performance.now();
    const speed = this.blade.speedAt(this.blade.head);
    if (speed < CFG.minSliceSpeed) return;

    for (const f of this.flowers) {
      if (this.state !== 'playing') break;
      if (f.state !== 'alive') continue;
      if (f.lastStroke === strokeId) continue;
      const hit = f.sliceTest(a, b);
      if (!hit) continue;

      f.lastStroke = strokeId;
      f.flash = 1;

      if (f.isHazard) { this.sting(f, hit); continue; }

      const dir = this.blade.dirAt(this.blade.head, 3);
      const rec = {
        flower: f, strokeId, t: hit.t, x: hit.x, y: hit.y,
        dir, speed, time: now,
        stemDir: f.dirAt(hit.t),
        timing: f.timingQuality, life: f.life,
        fallbackShape: this.blade.shape(),
      };

      if (f.species.cut.pattern === 'cross' && !f.crossFirst) {
        // Score the stem, wait for the crossing stroke.
        f.crossFirst = rec;
        f.scoreMark = hit.t;
        f.lastStroke = strokeId;
        sound.hiss({ freq: 900, d: 0.05, gain: 0.14, sweep: 0.6 });
        this.fx.burst(hit.x, hit.y, ['#cfe0cc', '#a7e8a0'], 5, { power: 0.5, kind: 'spark' });
        continue;
      }

      if (f.crossFirst) {
        if (f.crossFirst.strokeId === strokeId) continue;
        rec.cross = crossScore(f.crossFirst.dir, dir);
        rec.t = (rec.t + f.crossFirst.t) / 2;
        rec.speed = (rec.speed + f.crossFirst.speed) / 2;
      }

      this.severNow(rec);
    }
  }

  severNow(rec) {
    const f = rec.flower;
    const piece = f.sever(rec.t);
    const push = 320 * this.view.scale;
    piece.launch(
      rec.dir.x * push * rand(1.2, 0.6) + rand(60, -60),
      Math.min(-160, rec.dir.y * push) * rand(1.1, 0.7),
      rand(7, -7),
    );
    this.pieces.push(piece);
    rec.piece = piece;
    rec.severed = true;
    this.pending.push(rec);

    this.fx.burst(rec.x, rec.y, [f.species.stem.color, '#dff5d6'], 8, { power: 0.7, kind: 'spark' });
    this.fx.kick(3);
  }

  sting(f, hit) {
    f.state = 'gone';
    this.strikes++;
    this.streak = 0;
    this.combo = 1;
    const pts = f.species.value;
    this.roundPoints = Math.max(0, this.roundPoints + pts);
    this.stungCount = (this.stungCount || 0) + 1;

    this.fx.burst(hit.x, hit.y, ['#4b7d42', '#96b06f', '#2f4a2b'], 16, { power: 1.1 });
    this.fx.label(hit.x, hit.y - 26, `${pts}`, '#ff9d92', { sub: 'stung!', size: 20 });
    this.fx.kick(14);
    sound.sting();
    if (navigator.vibrate) navigator.vibrate([26, 40, 26]);

    ui.setStrikes(this.strikes, CFG.strikesAllowed);
    ui.setCombo(1);
    ui.setQuota(this.roundPoints, this.quota);

    if (this.strikes >= CFG.strikesAllowed) this.endRound('stung');
  }

  onStrokeEnd(strokeId) {
    const shape = this.blade.shape();
    for (const rec of this.pending) {
      if (rec.strokeId === strokeId && !rec.graded) rec.shape = shape;
    }
    for (const f of this.flowers) {
      if (f.crossFirst && f.crossFirst.strokeId === strokeId) f.crossFirst.shape = shape;
    }
  }

  /** Turn a recorded cut into points, a popup and a stem for the bouquet. */
  finalize(rec) {
    rec.graded = true;
    const f = rec.flower;
    const cut = f.species.cut;
    const shape = rec.shape || rec.fallbackShape;

    // A sawing stroke has no meaningful instantaneous angle — judge it by
    // where the whole stroke travelled instead.
    const bladeDir = cut.pattern === 'zigzag' && shape?.dirNet ? shape.dirNet : rec.dir;

    const res = gradeCut(cut, {
      timing: rec.timing,
      cutT: rec.t,
      bladeDir,
      stemDir: rec.stemDir || f.dirAt(rec.t),
      speed: rec.speed,
      pattern: rec.pattern ?? patternScore(cut.pattern, shape),
      cross: rec.cross,
    });
    this.lastGrade = res;

    const q = res.quality;
    if (q >= CFG.comboKeepAbove) {
      this.streak++;
      this.combo = Math.min(CFG.comboMax, 1 + this.streak * CFG.comboStep);
      if (this.streak > 1) sound.combo(this.streak);
    } else if (q < CFG.comboBreakBelow) {
      this.streak = 0;
      this.combo = 1;
    }

    const pts = Math.round(f.species.value * (0.25 + q * 0.95) * this.combo);
    this.roundPoints += pts;
    this.cutCount++;

    const piece = rec.piece;
    piece.quality = q;
    piece.grade = res.grade;

    const gx = piece.x, gy = piece.y;
    const weak = q < 0.8 ? weakestPart(cut, res.parts) : null;
    this.fx.label(gx, gy - 20 * this.view.scale, `+${pts}`, res.grade.color, {
      sub: weak ? `${res.grade.name} · ${weak.note}` : res.grade.name,
      size: lerp(15, 22, q),
    });
    this.fx.burst(gx, gy, [...f.palette, '#ffffff'], Math.round(5 + q * 14), { power: 0.6 + q * 0.7 });
    this.fx.kick(res.grade.shake);

    sound.snip(q);
    if (q >= 0.93) { sound.perfect(); store.bump('immaculate'); }
    if (navigator.vibrate) navigator.vibrate(q > 0.8 ? [8, 24, 12] : 14);

    this.harvest.push({
      species: f.species,
      palette: f.palette,
      seed: f.seed,
      width: f.width,
      headScale: f.headScale,
      open: Math.max(0.8, f.open),
      wilt: f.wilt,
      stemLen: piece.stemLen,
      quality: q,
      timing: rec.timing,
    });

    store.bump('harvested');
    ui.setBasket(this.harvest.length);
    ui.setCombo(this.combo);
    ui.setQuota(this.roundPoints, this.quota);
    ui.setScore(this.total + this.roundPoints);
  }

  /* ── Update ─────────────────────────────────────────────────────── */

  update(dt, now) {
    this.fx.update(dt, this.time);
    this.blade.update(now);

    if (this.state === 'playing') {
      this.timeLeft -= dt;
      const secs = this.timeLeft / 1000;
      ui.setTime(secs);
      const whole = Math.ceil(secs);
      if (whole !== this.lastTickSecond && whole <= 5 && whole > 0) {
        this.lastTickSecond = whole;
        sound.tick(true);
      }

      this.spawnIn -= dt;
      if (this.spawnIn <= 0) {
        this.spawn();
        if (this.round >= 7 && Math.random() < 0.16) this.spawn();
        this.spawnIn = this.spawnGap();
      }

      for (const f of this.flowers) {
        f.update(dt, this.time);

        // A cross-cut that never got its second stroke: take it badly.
        if (f.crossFirst && !f.crossFirst.severed && now - f.crossFirst.time > CFG.crossWindow) {
          const rec = f.crossFirst;
          rec.cross = 0;
          rec.pattern = 0.12;
          f.scoreMark = null;
          if (f.state === 'alive') this.severNow(rec);
          f.crossFirst = null;
        }

        if (f.state === 'missed') {
          f.state = 'gone';
          this.streak = 0;
          this.combo = 1;
          ui.setCombo(1);
          const tip = f.p2;
          this.fx.burst(tip.x, tip.y, [...f.palette, '#8a7a4b'], 7, { power: 0.4 });
          this.fx.label(tip.x, tip.y, 'wilted', '#c8b48a', { size: 13, ttl: 750 });
          sound.wither();
        }
      }
      this.flowers = this.flowers.filter((f) => f.state !== 'gone');

      for (let i = this.pending.length - 1; i >= 0; i--) {
        const rec = this.pending[i];
        if (rec.graded) { this.pending.splice(i, 1); continue; }
        const strokeOver = this.blade.strokeId !== rec.strokeId || !this.blade.active;
        if (rec.shape || strokeOver || now - rec.time > CFG.finalizeDelay) {
          if (!rec.shape && this.blade.strokeId === rec.strokeId) rec.shape = this.blade.shape();
          this.finalize(rec);
          this.pending.splice(i, 1);
        }
      }

      if (this.timeLeft <= 0) this.endRound('time');
    } else if (this.state === 'menu') {
      // A quiet garden keeps growing behind the title.
      this.spawnIn -= dt;
      if (this.spawnIn <= 0) {
        if (this.flowers.length < 3) this.spawn(true);
        this.spawnIn = rand(2600, 900);
      }
      for (const f of this.flowers) {
        f.update(dt, this.time);
        if (f.state === 'missed') {
          const tip = f.p2;
          this.fx.burst(tip.x, tip.y, [...f.palette], 6, { power: 0.35 });
          f.state = 'gone';
        }
      }
      this.flowers = this.flowers.filter((f) => f.state !== 'gone');
    } else {
      for (const f of this.flowers) f.update(0, this.time);
    }

    for (let i = this.pieces.length - 1; i >= 0; i--) {
      const p = this.pieces[i];
      p.update(dt, this.basket);
      if (p.done) {
        this.pieces.splice(i, 1);
        if (p.collected) {
          this.fx.burst(this.basket.x, this.basket.y, [...p.palette], 5, { power: 0.35, kind: 'spark' });
        }
      }
    }

    if (this.state === 'bouquet' && this.bouquet) {
      this.bouquet.update(dt);
      if (!this.panelShown && this.bouquet.age >= this.bouquet.buildMs) this.showResults();
    }
  }

  /* ── End of round ───────────────────────────────────────────────── */

  endRound(reason) {
    if (this.state !== 'playing') return;
    this.blade.enabled = false;
    this.blade.release();

    // Grade anything still in flight so nothing is lost.
    for (const rec of this.pending) if (!rec.graded) this.finalize(rec);
    this.pending.length = 0;

    this.state = 'binding';
    this.bindTimer = 700;
    this.endReason = reason;
    ui.showHud(false);
  }

  beginBouquet() {
    this.state = 'bouquet';
    this.flowers.length = 0;
    this.pieces.length = 0;
    this.bouquet = new Bouquet(this.view, this.harvest);
    sound.bind();

    const result = scoreBouquet(this.harvest, { stings: this.stungCount || 0 });
    this.lastResult = result;
    const roundTotal = this.roundPoints + result.total;
    this.total += roundTotal;

    const cleared = roundTotal >= this.quota && this.endReason !== 'stung';
    this.cleared = cleared;
    this.panelShown = false;
  }

  /** Reveal the results once the arrangement has actually finished building. */
  showResults() {
    this.panelShown = true;
    const result = this.lastResult;
    const actions = this.cleared
      ? [{ label: `On to round ${this.round + 1}`, primary: true, onClick: () => this.nextRound() }]
      : [{ label: 'See the result', primary: true, onClick: () => this.gameOver() }];
    ui.showBouquet({
      round: this.round,
      title: result.name || 'bouquet',
      result,
      roundPoints: this.roundPoints,
      actions,
    });
  }

  nextRound() {
    ui.hide('screenBouquet');
    this.round++;
    this.bouquet = null;
    this.startRound();
  }

  gameOver() {
    ui.hide('screenBouquet');
    this.state = 'over';
    this.bouquet = null;
    const best = store.get('best');
    const newBest = this.total > best;
    store.recordRun(this.total, this.round);

    const reason = this.endReason === 'stung'
      ? `Three stings in round ${this.round}. The nettles win this time.`
      : `Round ${this.round} needed ${this.quota.toLocaleString()} points — you bound ${(this.roundPoints + (this.lastResult?.total || 0)).toLocaleString()}.`;

    sound.fail();
    ui.showOver({
      title: newBest ? 'A record harvest' : 'Run over',
      reason, score: this.total, round: this.round, best: Math.max(best, this.total), newBest,
    });
  }

  /* ── Render ─────────────────────────────────────────────────────── */

  render(now) {
    const ctx = this.ctx;
    const v = this.view;
    ctx.save();
    if (this.fx.shake > 0.2) {
      ctx.translate(rand(this.fx.shake, -this.fx.shake), rand(this.fx.shake, -this.fx.shake));
    }

    this.scene.draw(ctx, this.time);
    this.fx.drawPollen(ctx);

    if (this.state === 'bouquet' || this.state === 'binding') {
      ctx.fillStyle = 'rgba(8,14,10,.42)';
      ctx.fillRect(-20, -20, v.w + 40, v.h + 40);
    }

    if (this.bouquet) {
      this.bouquet.draw(ctx);
    } else {
      const list = [...this.flowers].sort((a, b) => a.baseY - b.baseY);
      for (const f of list) f.draw(ctx);
      this.scene.drawGrass(ctx, this.time);
      for (const p of this.pieces) p.draw(ctx);
      if (this.state === 'playing' || this.state === 'paused') {
        for (const f of list) f.drawGuide(ctx);
      }
      this.drawBasket(ctx);
    }

    this.fx.draw(ctx);
    this.blade.draw(ctx, now);
    this.fx.drawLabels(ctx);
    ctx.restore();
  }

  drawBasket(ctx) {
    if (this.state !== 'playing' && this.state !== 'binding') return;
    const { x, y } = this.basket;
    const s = this.view.scale;
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = '#d8c39a';
    ctx.lineWidth = 2 * s;
    ctx.beginPath();
    ctx.moveTo(x - 15 * s, y - 12 * s);
    ctx.lineTo(x + 15 * s, y - 12 * s);
    ctx.lineTo(x + 10 * s, y + 12 * s);
    ctx.lineTo(x - 10 * s, y + 12 * s);
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(x, y - 12 * s, 15 * s, 4 * s, 0, Math.PI, 0);
    ctx.stroke();
    ctx.restore();
  }

  /* ── Main tick ──────────────────────────────────────────────────── */

  frame(now) {
    const dt = Math.min(50, now - (this.last || now));
    this.last = now;
    if (this.state !== 'paused') this.time += dt;

    if (this.state === 'binding') {
      this.bindTimer -= dt;
      if (this.bindTimer <= 0) this.beginBouquet();
    }

    this.update(this.state === 'paused' ? 0 : dt, now);
    this.render(now);
  }
}
