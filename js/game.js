/* Game state machine: spawning, slicing, grading, rounds and bouquets. */

import { CFG, quotaForRound } from './config.js';
import { SPECIES, SpeciesBag } from './species.js';
import { Flower } from './flower.js';
import { Blade, patternScore, crossScore } from './gesture.js';
import { gradeCut, weakestPart } from './scoring.js';
import { Scene } from './scene.js';
import { setLight } from './draw.js';
import { Particles } from './particles.js';
import { Bouquet } from './bouquet.js';
import { coachTips } from './coach.js';
import { sound } from './audio.js';
import { store } from './storage.js';
import { ui } from './ui.js';
import { t, gradeName, weakNoteText, fmtNum } from './i18n.js';
import { clamp, lerp, rand } from './util.js';

/** Turn a recorded stroke into the frame the replay screen draws against:
    origin at the cut point, rotated so the *demanded* blade angle is the
    local x-axis — a perfectly-aimed cut is a flat horizontal line, and any
    tilt in the drawn path is exactly the angle the player missed by. Also
    rescaled so it fills roughly the same width as the guide shape, since
    the recording happened at whatever pixel scale that device was — a
    phone and a tablet should compare the same way. Returns null when no
    usable stroke was captured (rare: only the fallback mid-swipe snapshot
    survived, and it was a single point). */
function buildReplayPath(rec, cut) {
  const raw = rec.rawPath?.length >= 2 ? rec.rawPath : rec.fallbackPath;
  if (!raw || raw.length < 2) return null;
  const stemDir = rec.stemDir;
  const stemAng = Math.atan2(stemDir.y, stemDir.x);
  const idealAngle = stemAng + ((cut.angle == null ? 90 : cut.angle) * Math.PI) / 180;
  const c = Math.cos(-idealAngle), s = Math.sin(-idealAngle);
  const t0 = raw[0].t;
  const local = raw.map((p) => {
    const dx = p.x - rec.x, dy = p.y - rec.y;
    return { x: dx * c - dy * s, y: dx * s + dy * c, t: p.t - t0 };
  });
  const last = local[local.length - 1];
  const span = Math.max(1, Math.hypot(last.x - local[0].x, last.y - local[0].y));
  const scale = clamp((CFG.replayR * 1.7) / span, 0.4, 3.5);
  return local.map((p) => ({ x: +(p.x * scale).toFixed(1), y: +(p.y * scale).toFixed(1), t: p.t }));
}

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
    this.slowmo = 0;
    this.flowers = [];
    this.pieces = [];
    this.pending = [];
    this.harvest = [];
    this.total = 0;
    this.round = 1;
    this.last = 0;
    this.time = 0;
    this.pool = new SpeciesBag(3);
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
    // Off the narrow side of the window, whichever that currently is. The
    // old reference was a portrait phone (min(w/420, h/760)), so rotating
    // one dropped scale onto its floor and shrank every bloom; keying off
    // min(w,h) gives a phone the same scale held either way (0.936 vs
    // 0.929) and leaves portrait exactly where it was.
    v.scale = clamp(Math.min(w, h) / 420, 0.68, 1.65);
    v.groundY = h * CFG.groundY;

    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    this.basket = { x: w - 40 * v.scale, y: 44 * v.scale };
    this.locateBasket();
    this.scene.build();
    this.fx.seedPollen(Math.round(22 * v.scale));
    if (this.bouquet) this.bouquet.layout();
  }

  /** Petals fly toward wherever the stem counter actually sits in the HUD
      (top strip, moved there to stop it overlapping flowers down by the
      field edge) — read its real position instead of hardcoding one. Only
      works once the HUD is actually laid out and visible, so resize() also
      sets a same-shaped fallback for the window before a round starts. */
  locateBasket() {
    const basketEl = document.querySelector('.hud-basket');
    if (!basketEl) return;
    const r = basketEl.getBoundingClientRect();
    if (r.width) this.basket = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  /* ── Round lifecycle ────────────────────────────────────────────── */

  startRun(round = 1) {
    this.mode = 'run';
    this.total = 0;
    this.round = round;
    // Every round played this run, for buildLogText() — reset here rather
    // than in startRound() so it survives from one round into the next.
    this.runLog = { rounds: [] };
    this.startRound();
  }

  /** Another go at the round that just ended the run, rather than back to
      the first. The score starts from zero — it is a fresh attempt at that
      round, not a continuation of the run that died on it. */
  retry() {
    this.startRun(this.round);
  }

  /** Drill one species: a single stem in the middle, no clock, no quota. */
  startPractice(species) {
    this.mode = 'practice';
    this.practiceSpecies = species;
    this.practiceCuts = 0;
    this.practiceSum = 0;
    this.practiceBest = 0;
    this.total = 0;
    this.round = 1;
    this.startRound();
    ui.setPracticeMode(true, species);
    ui.setPracticeStats({ cuts: 0, avg: 0, best: 0 });
  }

  startRound() {
    // Every path into a new round dismisses whatever result screen the
    // previous one left up — retry and level-select included, not just
    // the explicit "next round" button.
    ui.hide('screenBouquet');
    this.state = 'playing';
    this.flowers.length = 0;
    this.pieces.length = 0;
    this.pending.length = 0;
    this.harvest = [];
    this.fx.reset();
    this.bouquet = null;

    this.roundPoints = 0;
    this.slowmo = 0;
    this.strikes = 0;
    this.stungCount = 0;
    this.streak = 0;
    this.combo = 1;
    this.cutCount = 0;
    this.timeLeft = CFG.roundSeconds * 1000;
    this.spawnIn = 500;
    this.quota = quotaForRound(this.round);
    this.pool = new SpeciesBag(this.round);
    this.lastTickSecond = 99;

    // Practice has no quota to diagnose against, so it keeps no log.
    this.roundStartTime = this.time;
    this.roundLog = this.mode === 'run' ? { round: this.round, quota: this.quota, events: [] } : null;

    this.scene.setRound(this.round);
    this.blade.enabled = true;

    ui.showHud(true);
    this.locateBasket();
    ui.setPracticeMode(this.mode === 'practice', this.practiceSpecies);
    ui.setScore(this.total);
    ui.setRound(this.round);
    ui.setBasket(0);
    ui.setQuota(0, this.quota);
    ui.setCombo(1);
    ui.setStrikes(0, CFG.strikesAllowed);
    ui.setTime(CFG.roundSeconds);

    const introSpecies = this.introForRound();
    if (introSpecies) this.enterIntro(introSpecies);
  }

  /** The species this round is the first to unlock, if it is worth a
      teaching beat: a cuttable plant (weeds are the tutorial's job), not
      shown before, and not one the player already met by clearing past
      this round on an earlier run. Rounds 1's starters are the tutorial's
      ground, so it begins at round 2. */
  introForRound() {
    if (this.mode !== 'run' || this.round < 2) return null;
    if ((store.get('bestRound') || 0) >= this.round) return null;
    const sp = SPECIES.find((s) => s.unlock === this.round && s.cut);
    if (!sp || store.introSeen(sp.id)) return null;
    return sp;
  }

  /** Beat one: a centered panel announcing the species. The round is fully
      set up already (clock, quota, score) but none of it ticks outside the
      'playing' state, so it simply waits. No stem yet, no blade. */
  enterIntro(species) {
    this.introSpecies = species;
    this.introPhase = 'preview';
    this.state = 'intro';
    this.blade.enabled = false;
    this.flowers.length = 0;
    this.pieces.length = 0;
    this.pending.length = 0;
    this.slowmo = 0;
    ui.showHud(false);
    ui.showIntroPreview(species);
  }

  /** Beat two: dismiss the panel, sprout one pre-bloomed stem to rehearse
      the cut on, guide and ring both showing. A big Start-round button
      floats over it. */
  beginIntroPractice() {
    if (this.state !== 'intro' || this.introPhase !== 'preview') return;
    this.introPhase = 'practice';
    this.spawnIn = 150;
    this.blade.enabled = true;
    ui.showIntroPractice();
  }

  /** Leave the intro and run the round for real. */
  beginRoundFromIntro() {
    if (this.state !== 'intro') return;
    store.markIntroSeen(this.introSpecies.id);
    this.introSpecies = null;
    this.introPhase = null;
    ui.clearIntro();
    this.flowers.length = 0;
    this.pieces.length = 0;
    this.pending.length = 0;
    this.slowmo = 0;
    this.spawnIn = 500;
    // The round log's clock starts now, not back when the intro opened; and
    // reset the frame clock so the first live frame does not bill the round
    // for however long the player lingered on the intro.
    this.roundStartTime = this.time;
    this.last = performance.now();
    this.state = 'playing';
    this.blade.enabled = true;
    ui.showHud(true);
    this.locateBasket();
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
    this.mode = 'run';
    this.blade.enabled = false;
    this.flowers.length = 0;
    this.pieces.length = 0;
    this.fx.reset();
    this.introSpecies = null;
    this.introPhase = null;
    ui.showHud(false);
    ui.setPracticeMode(false);
    ui.clearIntro();
    ui.hide('screenPause');
    ui.hide('screenBouquet');
    ui.setBest(store.get('best'));
    ui.show('screenTitle');
  }

  /* ── Spawning ───────────────────────────────────────────────────── */

  spawnGap() {
    const g = CFG.baseSpawnGap * Math.pow(CFG.spawnGapDecay, this.round - 1);
    const j = CFG.spawnGapJitter;
    return Math.max(CFG.spawnGapFloor, g) * rand(1 + j, 1 - j);
  }

  /** How many stems may stand at once, easing up a little each round. */
  maxAliveForRound() {
    return Math.min(CFG.maxAlive + Math.floor((this.round - 1) / CFG.maxAliveStep), CFG.maxAliveCap);
  }

  /** How many weeds may stand together this round. Fixed per round, so the
      pressure is designed rather than dealt. */
  maxHazardsForRound() {
    const h = CFG.hazards;
    return Math.min(h.aliveCap, h.aliveBase + Math.floor((this.round - 1) / h.aliveStep));
  }

  /** Required gap between canopies, relaxing slowly as rounds get harder. */
  clearanceForRound() {
    const ease = Math.max(CFG.clearanceFloor, 1 - (this.round - 1) * CFG.clearanceEase);
    return CFG.spawnClearance * this.view.scale * ease;
  }

  spawn(ambient = false) {
    const alive = this.flowers.filter((f) => f.state === 'alive');

    // Practice and the intro's practice beat: exactly one chosen stem,
    // dead centre, replaced only once the last has been cut (or withered).
    const introPractice = this.state === 'intro' && this.introPhase === 'practice';
    if (this.mode === 'practice' || introPractice) {
      if (alive.length > 0) return;
      const sp = introPractice ? this.introSpecies : this.practiceSpecies;
      // The intro stem sprouts straight into its bloom window so the guide
      // is lit and it can be cut at once.
      const f = new Flower(sp, this.view.w / 2, this.view, introPractice ? this.round : 1);
      if (introPractice) f.age = f.lifespan * 0.60;
      this.flowers.push(f);
      sound.sprout();
      return;
    }

    const hazardsUp = alive.reduce((n, f) => n + (f.isHazard ? 1 : 0), 0);
    // maxAlive is the harvest budget. Weeds are counted against it only if
    // they are set to compete for it; otherwise what there is to cut stays
    // the same however many nettles are standing.
    const holding = CFG.hazards.useSlots ? alive.length : alive.length - hazardsUp;
    if (!ambient && holding >= this.maxAliveForRound()) return;

    const species = this.pool.draw(Math.random, {
      skipHazards: ambient || hazardsUp >= this.maxHazardsForRound(),
    });
    // Head radius accounts for the oversized bloom art (CFG.headScale), not
    // just the stem's footprint, so canopies actually clear each other.
    const headR = species.head.size * this.view.scale * CFG.headScale * 0.5;
    const margin = 22 * this.view.scale + headR;
    const clearance = this.clearanceForRound();
    // A weed only needs to not visually overlap — reserving it a flower's
    // worth of personal space is what let a full hazard field lock new
    // flowers out entirely (see CFG.hazards.clearanceFactor).
    const hazardClearance = clearance * CFG.hazards.clearanceFactor;

    // score(x): margin left over after the tightest neighbour, judging
    // each against its own required gap rather than one shared distance —
    // a weed and a flower are no longer the same kind of close.
    let best = null, bestScore = -Infinity;
    for (let i = 0; i < 14; i++) {
      const x = rand(this.view.w - margin, margin);
      let score = Infinity;
      for (const f of alive) {
        const need = f.isHazard ? hazardClearance : clearance;
        score = Math.min(score, Math.abs(f.baseX - x) - headR - f.headSize * 0.5 - need);
      }
      if (score > bestScore) { bestScore = score; best = x; }
      if (score > 0) break;
    }
    // Nowhere clear enough to sprout without crowding a neighbour — sit
    // this tick out rather than cram two canopies together.
    if (!ambient && alive.length > 0 && bestScore < 0) return;

    // Recorded only now that it is really in the ground — see SpeciesBag.draw.
    this.pool.sprouted(species);
    this.flowers.push(new Flower(species, best, this.view, ambient ? 1 : this.round));
    if (!ambient) sound.sprout();
  }

  /** Knock the multiplier back after a botched cut or a stem left to
      wither. Costs ground rather than everything — see CFG.comboBreakLoss.
      The streak is kept in step with the multiplier so building resumes
      from where it dropped to, not from scratch. */
  breakCombo() {
    this.combo = Math.max(1, this.combo - CFG.comboBreakLoss);
    this.streak = Math.max(0, Math.round((this.combo - 1) / CFG.comboStep));
  }

  /** One line in the current round's diagnostic log (see buildLogText).
      A no-op outside a scored run — see startRound. Records state *after*
      the event, which is what a reader wants: what did this leave me with. */
  logEvent(type, extra = {}) {
    if (!this.roundLog) return;
    this.roundLog.events.push({
      t: +((this.time - this.roundStartTime) / 1000).toFixed(1),
      type,
      total: this.roundPoints,
      combo: +this.combo.toFixed(2),
      streak: this.streak,
      ...extra,
    });
  }

  /** Where the "+points" popup lands: a fixed height near the top of the
      screen, but still under the x you cut at so it reads as a response
      to that specific action. Clamped off the edges for centred text. */
  feedbackPos(x) {
    const margin = 90 * this.view.scale;
    return {
      x: clamp(x, margin, this.view.w - margin),
      y: this.view.h * CFG.feedbackY,
    };
  }

  /* ── Slicing ────────────────────────────────────────────────────── */

  onBladeSegment(a, b, strokeId) {
    if (this.state !== 'playing' && this.state !== 'intro') return;
    const now = performance.now();
    const speed = this.blade.speedAt(this.blade.head);
    if (speed < CFG.minSliceSpeed) return;

    for (const f of this.flowers) {
      if (this.state !== 'playing' && this.state !== 'intro') break;
      if (f.state !== 'alive') continue;
      if (f.lastStroke === strokeId) continue;
      const hit = f.sliceTest(a, b);
      if (!hit) continue;

      f.lastStroke = strokeId;
      f.flash = 1;

      if (f.isHazard) { this.sting(f, hit); continue; }

      const dir = this.blade.dirAt(this.blade.head);
      const rec = {
        flower: f, strokeId, t: hit.t, x: hit.x, y: hit.y,
        dir, speed, time: now,
        stemDir: f.dirAt(hit.t),
        timing: f.timingQuality, life: f.life,
        fallbackShape: this.blade.shape(),
        // Best-effort in case the stroke never reaches onStrokeEnd before
        // finalizeDelay — a mid-swipe snapshot, not the full gesture, but
        // still something to show on the replay screen rather than nothing.
        fallbackPath: this.blade.points.slice(),
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
    const piece = f.sever(rec.t, Math.atan2(rec.dir.y, rec.dir.x));
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
    const pts = -CFG.stingPenalty;
    this.roundPoints = Math.max(0, this.roundPoints + pts);
    this.stungCount = (this.stungCount || 0) + 1;
    this.logEvent('sting', { species: f.species.id, pts, strikes: this.strikes });

    this.fx.burst(hit.x, hit.y, ['#4b7d42', '#96b06f', '#2f4a2b'], 16, { power: 1.1 });
    const fp = this.feedbackPos(hit.x);
    this.fx.label(fp.x, fp.y, `${pts}`, '#ff9d92', { sub: t('label.stung'), size: 20 });
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
    // The full gesture, follow-through and all — captured now because the
    // very next stroke overwrites blade.points, and this is the one moment
    // guaranteed to still hold the stroke that was just judged.
    const path = this.blade.points.slice();
    for (const rec of this.pending) {
      if (rec.strokeId === strokeId && !rec.graded) { rec.shape = shape; rec.rawPath = path; }
    }
    for (const f of this.flowers) {
      if (f.crossFirst && f.crossFirst.strokeId === strokeId) { f.crossFirst.shape = shape; f.crossFirst.rawPath = path; }
    }
  }

  /** Turn a recorded cut into points, a popup and a stem for the bouquet. */
  finalize(rec) {
    rec.graded = true;
    const f = rec.flower;
    const cut = f.species.cut;
    const shape = rec.shape || rec.fallbackShape;
    // The intro beat grades a cut and shows the breakdown, but it counts
    // for nothing: no points, no combo, no log, no stem in the basket.
    const intro = this.state === 'intro';

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
    if (!intro) {
      if (q >= CFG.comboKeepAbove) {
        this.streak++;
        this.combo = Math.min(CFG.comboMax, 1 + this.streak * CFG.comboStep);
        if (this.streak > 1) sound.combo(this.streak);
      } else if (q < CFG.comboBreakBelow) {
        this.breakCombo();
      }
    }

    const pts = intro ? 0 : Math.round(CFG.cutBase * (0.25 + q * 0.95) * this.combo);
    if (!intro) {
      this.roundPoints += pts;
      this.cutCount++;
      // Same four axes the in-round popup already grades against (see
      // weakestPart in scoring.js) — round tracks which one, this keeps all
      // of them, so a pattern across many cuts can be told apart from noise.
      this.logEvent('cut', {
        species: f.species.id,
        quality: +q.toFixed(2),
        grade: res.grade.key,
        pts,
        parts: {
          timing: +res.parts.timing.toFixed(2),
          point: +res.parts.point.toFixed(2),
          angle: cut.angle == null ? null : +res.parts.angle.toFixed(2),
          speed: +res.parts.speed.toFixed(2),
          pattern: +res.parts.pattern.toFixed(2),
        },
        angleMeasured: cut.angle == null ? null : Math.round(res.parts.angleDeg ?? 0),
        angleTarget: cut.angle,
        speedMeasured: +rec.speed.toFixed(2),
        speedBand: cut.speed,
        pattern: cut.pattern,
        angleFree: cut.angle == null,
        replayPath: buildReplayPath(rec, cut),
      });
    }

    const piece = rec.piece;
    piece.quality = q;
    piece.grade = res.grade;

    const gx = piece.x, gy = piece.y;
    // Practice and the intro keep the full technique breakdown so you can
    // see exactly what to fix; a real round just shows the grade so cuts
    // stay quick to read while stems keep flying.
    const showBreakdown = this.mode === 'practice' || intro;
    const weak = (showBreakdown && q < 0.8) ? weakestPart(cut, res.parts) : null;
    const grade = gradeName(res.grade);
    const fp = this.feedbackPos(gx);
    this.fx.label(fp.x, fp.y, intro ? grade : `+${pts}`, res.grade.color, {
      sub: weak ? (intro ? weakNoteText(weak) : `${grade} · ${weakNoteText(weak)}`) : (intro ? '' : grade),
      size: lerp(15, 22, q),
    });
    this.fx.burst(gx, gy, [...f.palette, '#ffffff'], Math.round(5 + q * 14), { power: 0.6 + q * 0.7 });
    this.fx.kick(res.grade.shake);

    sound.snip(q);
    if (q >= 0.93) {
      sound.perfect();
      store.bump('immaculate');
      // Hang on the moment just long enough to see it. Short by design —
      // the round is on a clock and the rhythm matters more than the flourish.
      this.slowmo = CFG.slowmoMs;
    }
    if (navigator.vibrate) navigator.vibrate(q > 0.8 ? [8, 24, 12] : 14);

    if (!intro) {
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

    if (this.mode === 'practice') {
      this.practiceCuts++;
      this.practiceSum += q;
      this.practiceBest = Math.max(this.practiceBest, q);
      ui.setPracticeStats({
        cuts: this.practiceCuts,
        avg: this.practiceSum / this.practiceCuts,
        best: this.practiceBest,
      });
    }
  }

  /* ── Update ─────────────────────────────────────────────────────── */

  update(dt, now) {
    this.fx.update(dt, this.time);
    this.blade.update(now);

    if (this.state === 'playing') {
      const practice = this.mode === 'practice';

      if (!practice) {
        this.timeLeft -= dt;
        const secs = this.timeLeft / 1000;
        ui.setTime(secs);
        const whole = Math.ceil(secs);
        if (whole !== this.lastTickSecond && whole <= 5 && whole > 0) {
          this.lastTickSecond = whole;
          sound.tick(true);
        }
      }

      this.spawnIn -= dt;
      if (this.spawnIn <= 0) {
        this.spawn();
        if (!practice && this.round >= 7 && Math.random() < 0.16) this.spawn();
        this.spawnIn = practice ? CFG.practiceRespawn : this.spawnGap();
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
          this.breakCombo();
          this.logEvent('missed', { species: f.species.id });
          ui.setCombo(this.combo);
          const tip = f.p2;
          this.fx.burst(tip.x, tip.y, [...f.palette, '#8a7a4b'], 7, { power: 0.4 });
          this.fx.label(tip.x, tip.y, t('label.wilted'), '#c8b48a', { size: 13, ttl: 750 });
          sound.wither();
        }
      }
      this.flowers = this.flowers.filter((f) => f.state !== 'gone');

      this.finalizePending(now);

      if (!practice && this.roundPoints >= this.quota) this.endRound('cleared');
      else if (!practice && this.timeLeft <= 0) this.endRound('time');
    } else if (this.state === 'intro') {
      // The announcement beat is a still frame; the practice beat runs one
      // pre-bloomed stem with no clock and no quota — an un-cut stem just
      // wilts and is replaced at no cost.
      if (this.introPhase === 'practice') {
        this.spawnIn -= dt;
        if (this.spawnIn <= 0) { this.spawn(); this.spawnIn = CFG.practiceRespawn; }
        for (const f of this.flowers) {
          f.update(dt, this.time);
          if (f.state === 'missed') f.state = 'gone';
        }
        this.flowers = this.flowers.filter((f) => f.state !== 'gone');
        this.finalizePending(now);
      }
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

  /** Grade every pending cut whose stroke has finished (or waited out
      finalizeDelay). Shared by the live round and the intro beat. */
  finalizePending(now) {
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const rec = this.pending[i];
      if (rec.graded) { this.pending.splice(i, 1); continue; }
      const strokeOver = this.blade.strokeId !== rec.strokeId || !this.blade.active;
      if (rec.shape || strokeOver || now - rec.time > CFG.finalizeDelay) {
        if (!rec.shape && this.blade.strokeId === rec.strokeId) {
          rec.shape = this.blade.shape();
          rec.rawPath = this.blade.points.slice();
        }
        this.finalize(rec);
        this.pending.splice(i, 1);
      }
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

    this.total += this.roundPoints;

    this.cleared = this.roundPoints >= this.quota && this.endReason !== 'stung';
    this.panelShown = false;

    if (this.roundLog) {
      this.roundLog.summary = {
        cleared: this.cleared,
        endReason: this.endReason,
        points: this.roundPoints,
        cuts: this.cutCount,
        strikes: this.strikes,
        finalCombo: +this.combo.toFixed(2),
        secondsUsed: +((this.time - this.roundStartTime) / 1000).toFixed(1),
      };
      this.runLog.rounds.push(this.roundLog);
    }
  }

  /** A plain-text account of every round played this run — cut by cut, in
      the order it happened — meant to be pasted somewhere for someone else
      to read, not shown in-game. Deliberately not localized: it is a
      diagnostic document, not UI. */
  buildLogText() {
    const lines = [`Bloom & Blade run log — ${new Date().toLocaleString()}`];
    for (const r of this.runLog?.rounds || []) {
      const s = r.summary;
      const pct = r.quota ? Math.round((100 * s.points) / r.quota) : 0;
      lines.push('');
      lines.push(
        `Round ${r.round} · goal ${fmtNum(r.quota)} · `
        + `${s.cleared ? 'CLEARED' : `FAILED (${s.endReason})`} · `
        + `${fmtNum(s.points)}/${fmtNum(r.quota)} (${pct}%) · ${s.cuts} cuts · `
        + `${s.strikes} sting${s.strikes === 1 ? '' : 's'} · final combo ${s.finalCombo} · `
        + `${s.secondsUsed}s used`,
      );
      for (const e of r.events) {
        const at = `  t=${e.t.toFixed(1)}s`.padEnd(10);
        const state = `combo=${e.combo.toFixed(2)} streak=${e.streak}  total=${fmtNum(e.total)}`;
        if (e.type === 'cut') {
          lines.push(`${at}CUT    ${e.species.padEnd(11)} q=${e.quality.toFixed(2)} ${e.grade.padEnd(10)} +${e.pts} pts  ${state}`);
          const p = e.parts;
          const axes = [
            `timing=${p.timing.toFixed(2)}`,
            `point=${p.point.toFixed(2)}`,
            p.angle == null ? 'angle=n/a' : `angle=${p.angle.toFixed(2)} (${e.angleMeasured}° of ${e.angleTarget}°)`,
            `speed=${p.speed.toFixed(2)} (${e.speedMeasured} ${e.speedBand}-band)`,
            `pattern=${p.pattern.toFixed(2)}`,
          ];
          lines.push(`${' '.repeat(10)}${axes.join('  ')}`);
        } else if (e.type === 'sting') {
          lines.push(`${at}STING  ${e.species.padEnd(11)} ${' '.repeat(21)}${e.pts} pts  ${state}`);
        } else if (e.type === 'missed') {
          lines.push(`${at}MISSED ${e.species.padEnd(11)} withered, never cut${' '.repeat(6)}${state}`);
        }
      }
    }
    lines.push('');
    lines.push(`Run total: ${fmtNum(this.total)} over ${this.runLog?.rounds.length || 0} round(s)`);
    return lines.join('\n');
  }

  /** Reveal the results once the arrangement has actually finished building.
      One screen either way: a cleared round offers Next round; one that
      isn't ends the run right here, with the same bookkeeping gameOver()
      used to do (best score, which round level select unlocks next) folded
      in, and coachTips (coach.js) standing in for a breakdown of why. */
  showResults() {
    this.panelShown = true;

    if (this.cleared) {
      ui.showRoundResult({
        round: this.round, cleared: true,
        points: this.roundPoints, quota: this.quota,
        actions: [{ label: t('bouquet.nextRound', { round: this.round + 1 }), primary: true, onClick: () => this.nextRound() }],
      });
      return;
    }

    // The highest round actually unlocked for level select is the one
    // before this — round - 1, never the round that just failed.
    store.recordRun(this.total, this.round - 1);
    sound.fail();

    ui.showRoundResult({
      round: this.round, cleared: false, stung: this.endReason === 'stung',
      points: this.roundPoints, quota: this.quota,
      tips: coachTips(this.roundLog),
      actions: [
        { label: t('over.retry'), primary: true, onClick: () => this.retry() },
        { label: t('over.home'), primary: false, onClick: () => this.quit() },
      ],
    });
  }

  nextRound() {
    this.round++;
    this.bouquet = null;
    this.startRound();
  }

  /* ── Render ─────────────────────────────────────────────────────── */

  render(now) {
    const ctx = this.ctx;
    const v = this.view;
    ctx.save();
    if (this.fx.shake > 0.2) {
      ctx.translate(rand(this.fx.shake, -this.fx.shake), rand(this.fx.shake, -this.fx.shake));
    }

    // Every plant this frame is lit by whatever hangs in this round's sky.
    setLight(this.scene.light);

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
      if (this.state === 'playing' || this.state === 'paused' || this.state === 'intro') {
        const ring = this.mode === 'practice' || this.state === 'intro';
        for (const f of list) f.drawGuide(ctx, { ring });
      }
      this.drawBasket(ctx);
    }

    this.fx.draw(ctx);
    this.blade.draw(ctx, now);
    // Closest thing to the player, so it goes over the plants and the blade
    // — but under the score popups, which have to stay readable.
    if (!this.bouquet) this.scene.drawFringe(ctx, this.time);
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
    let dt = Math.min(50, now - (this.last || now));
    this.last = now;

    // An immaculate cut briefly slows the world. The clock slows with it,
    // which is the point: a perfect cut buys back a sliver of the round.
    if (this.slowmo > 0) {
      this.slowmo = Math.max(0, this.slowmo - dt);
      const k = this.slowmo / CFG.slowmoMs;
      dt *= lerp(1, CFG.slowmoScale, k * k);
    }

    if (this.state !== 'paused') this.time += dt;

    if (this.state === 'binding') {
      this.bindTimer -= dt;
      if (this.bindTimer <= 0) this.beginBouquet();
    }

    this.update(this.state === 'paused' ? 0 : dt, now);
    this.render(now);
  }
}
