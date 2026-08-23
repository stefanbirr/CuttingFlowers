/* A scripted player, for balance testing.

   Not part of the game: nothing in index.html or the service worker's
   precache list points at this file, so it never reaches a real player.
   Tests import it into the page and let it drive the real Game through the
   real Blade — the same pointer stream, the same gesture analysis, the same
   scoring — so what it measures is what a person would actually get.

   `skill` (0..1) is the only dial. Every axis of a cut scales off it: the
   blade angle, where along the stem it lands, how fast the swipe travels,
   the moment it fires, how faithfully it traces an arc or a saw, how long
   it dithers before committing, and how often it swings at a weed by
   mistake. 0 flails, ~0.5 is a plausible novice, 1 is about as well as the
   geometry can be played.

   Runs are deterministic given a seed, which is the point: two tuning
   passes can be compared on identical spawn sequences instead of arguing
   with spawn luck. */

import { CFG } from '../js/config.js';
import { clamp, TAU, segIntersect } from '../js/util.js';

/* ── Determinism ──────────────────────────────────────────────────── */

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* Box–Muller, clamped: an unbounded tail would now and then produce a
   freak swipe that says nothing about the skill level being measured. */
function gauss(rng) {
  let u = 0, v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  const g = Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v);
  return clamp(g, -2.5, 2.5);
}

/* ── How wrong each axis goes at skill 0 ──────────────────────────── */

/* Sized against the tolerances in species.js and CFG.toleranceSlack, so
   that a skill-0 bot is reliably butchering cuts and a skill-1 bot is
   inside every window with room to spare. Tuned by sweeping skill and
   checking the grade mix comes out monotonic — see tools/simulate.mjs. */
const ERR = {
  angleDeg: 24,     // vs angleTol 14..30 (times CFG.toleranceSlack)
  point: 0.15,      // vs pointTol 0.12..0.24 (times CFG.toleranceSlack)
  speedLog: 0.55,   // multiplicative, so a bad swipe is 2-3x off the band
  life: 0.15,       // vs a target window 0.56..0.82 wide
  reactionMs: 420,  // dithering before committing to a cut
  weedGrab: 0.22,   // chance of swinging at a hazard, at skill 0
};

/* Where in the bloom's life to aim the cut.

   CFG.timingWindow is flat-topped: anywhere inside it scores full marks.
   So the best play is not the middle but the near edge — cut the moment a
   stem is ripe and the blade is free for the next one. A weaker player
   drifts later and hesitates, which costs throughput as well as accuracy.
   Sitting on the centre would cap the bot's ceiling for no scoring gain:
   skill 1 ended up cutting fewer stems than skill 0.8 and scoring worse. */
function aimLife(e) {
  const w = CFG.timingWindow;
  return w.lo + (w.hi - w.lo) * (0.04 + 0.34 * e);
}

export class Bot {
  constructor(game, { skill = 0.8, rng = Math.random, dt = 1000 / 60 } = {}) {
    this.game = game;
    this.skill = clamp(skill, 0, 1);
    this.e = 1 - this.skill;      // error scale
    this.rng = rng;
    this.dt = dt;
    this.target = null;
    this.stroke = null;
    this.pendingCross = null;
    this.gapUntil = 0;
    this.stats = { swipes: 0, weedSwipes: 0, abandoned: 0, heldOff: 0 };
  }

  /* ── Per-frame ──────────────────────────────────────────────────── */

  think(now) {
    const g = this.game;
    if (g.state !== 'playing') return;

    if (this.stroke) { this.advanceStroke(now); return; }
    if (now < this.gapUntil) return;

    // The second half of a cross-cut, still owed from the last stroke.
    if (this.pendingCross) {
      this.beginStroke(this.pendingCross, { crossSecond: true });
      this.pendingCross = null;
      return;
    }

    if (!this.targetStillGood()) this.pickTarget(now);
    const tg = this.target;
    if (!tg) return;

    const f = tg.flower;
    if (now >= tg.readyAt && f.life >= tg.life) {
      const plan = this.planStroke(f);
      if (!plan) {
        // Nothing clean at this bloom yet; look again shortly. The target
        // is kept, so it stays on watch as the weeds age out.
        this.gapUntil = now + 70;
        return;
      }
      this.beginStroke(plan);
      this.target = null;
    }
  }

  targetStillGood() {
    const tg = this.target;
    if (!tg) return false;
    const f = tg.flower;
    if (f.state !== 'alive') { this.target = null; return false; }
    // Withered past saving while we were waiting on it.
    if (f.life > 0.95) { this.stats.abandoned++; this.target = null; return false; }
    return true;
  }

  pickTarget(now) {
    const g = this.game;
    const e = this.e;
    const live = g.flowers.filter((f) => f.state === 'alive' && f.grown > 0.35 && f.life < 0.92);
    if (!live.length) { this.target = null; return; }

    const blooms = live.filter((f) => !f.isHazard);
    const weeds = live.filter((f) => f.isHazard);

    const aim = aimLife(e);

    let f = null;
    if (weeds.length && this.rng() < ERR.weedGrab * e * e) {
      f = weeds[Math.floor(this.rng() * weeds.length)];
    } else if (blooms.length) {
      if (this.rng() < 0.45 * e) {
        // Poor prioritising: grabs whatever catches the eye.
        f = blooms[Math.floor(this.rng() * blooms.length)];
      } else {
        // Work the oldest stem first. It is the one about to wither, and
        // clearing it soonest frees the slot for the next sprout — the
        // field's throughput, not the blade's, is what caps a late round.
        f = blooms.reduce((best, c) => (c.life > best.life ? c : best));
      }
    }
    if (!f) { this.target = null; return; }

    // Nothing new sprouts while the field is full, so when every slot is
    // taken a strong player takes the cut a little early rather than let
    // the whole field idle waiting on one bloom. CFG.timingGate is
    // forgiving enough that the few points lost are worth far less than
    // the extra stem the freed slot buys — late rounds are capped by the
    // field's throughput, not by the blade.
    // Counted the way spawn() counts it — every living stem, including the
    // ones still too small to be worth cutting, since those hold slots too.
    const holding = g.flowers.filter((x) => x.state === 'alive').length;
    const crowded = holding >= g.maxAliveForRound();
    const urgency = crowded ? 0.07 * this.skill : 0;

    const cut = f.species.cut;
    const life = cut
      ? clamp(aim - urgency + gauss(this.rng) * ERR.life * e, 0.15, 0.97)
      : 0.5;

    this.target = {
      flower: f,
      life,
      readyAt: now + this.rng() * ERR.reactionMs * e,
    };
  }

  /* ── Planning a swipe ───────────────────────────────────────────── */

  /** One candidate swipe: a height on the stem and which way the blade
      leans. Mirroring negates the angle, which reads as the same angle to
      the stem (scoring measures it undirected) while sweeping different
      ground — so it is free to try. */
  makePlan(f, cutT, mirror, spec) {
    const at = f.pointAt(cutT);
    const dir = f.dirAt(cutT);
    const rad = ((mirror ? -spec.angleDeg : spec.angleDeg) * Math.PI) / 180;
    return {
      at,
      dir,
      axis: {
        x: dir.x * Math.cos(rad) - dir.y * Math.sin(rad),
        y: dir.x * Math.sin(rad) + dir.y * Math.cos(rad),
      },
      speed: spec.speed,
      pattern: spec.pattern,
      fidelity: spec.fidelity,
      cross: spec.pattern === 'cross',
    };
  }

  /** Returns a swipe, or null to hold off because every line is fouled. */
  planStroke(f) {
    const e = this.e;
    const rng = this.rng;
    const cut = f.species.cut;

    // Read the stem's geometry now, at fire time — it is still swaying, and
    // a player aims at where it is rather than where it was.
    const wantT = cut ? cut.point : 0.5;
    const cutT = clamp(wantT + gauss(rng) * ERR.point * e, 0.04, 0.96);

    // Blade angle, measured against the stem the way scoring measures it.
    const band = CFG.speeds[(cut && cut.speed) || 'steady'];
    const mid = (band.lo + band.hi) / 2;
    const spec = {
      angleDeg: (cut && cut.angle != null ? cut.angle : 90) + gauss(rng) * ERR.angleDeg * e,
      // Speed as a multiplicative miss, so a bad swipe lands well outside
      // the band rather than just at its edge.
      speed: mid * Math.exp(gauss(rng) * ERR.speedLog * e),
      pattern: cut ? cut.pattern : 'straight',
      // How faithfully the shape gets traced. Low skill flattens an arc and
      // drops legs off a saw, which is how patternScore reads a botched try.
      fidelity: clamp(1 - 0.95 * e + gauss(rng) * 0.16 * e, 0, 1.1),
    };

    const base = this.makePlan(f, cutT, false, spec);
    if (f.isHazard) return base;

    // Whether the danger is noticed at all scales with skill.
    if (rng() >= this.skill) return base;
    if (!this.pathHitsHazard(this.buildPath(base))) return base;

    // A swipe reaches a long way past its target, and clipping a nettle
    // ends rounds — so look for a line that misses. Mirror first, since
    // that costs nothing, then give ground on the cut height, nearest
    // offsets first: a slightly mistimed height beats a strike.
    for (const dt of [0, 0.09, -0.09, 0.18, -0.18]) {
      for (const mirror of [true, false]) {
        if (dt === 0 && !mirror) continue;          // that was `base`
        const cand = this.makePlan(f, clamp(cutT + dt, 0.05, 0.95), mirror, spec);
        if (!this.pathHitsHazard(this.buildPath(cand))) return cand;
      }
    }

    // Every line is fouled. Wait for the weeds to move on — unless the
    // bloom is about to be lost, in which case take the cut and the risk.
    this.stats.heldOff++;
    return f.life > 0.86 ? base : null;
  }

  /** Would this swipe cut through a weed on its way past the target? */
  pathHitsHazard(pts) {
    const weeds = this.game.flowers.filter((f) => f.isHazard && f.state === 'alive');
    if (!weeds.length) return false;

    // Bounding box first. This runs for every candidate line of every cut,
    // so the full segment-by-segment test is worth avoiding when the weed
    // is nowhere near the swipe.
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of pts) {
      if (p.x < x0) x0 = p.x;
      if (p.x > x1) x1 = p.x;
      if (p.y < y0) y0 = p.y;
      if (p.y > y1) y1 = p.y;
    }

    for (const w of weeds) {
      const wp = w.pts;
      let wx0 = Infinity, wy0 = Infinity, wx1 = -Infinity, wy1 = -Infinity;
      for (const p of wp) {
        if (p.x < wx0) wx0 = p.x;
        if (p.x > wx1) wx1 = p.x;
        if (p.y < wy0) wy0 = p.y;
        if (p.y > wy1) wy1 = p.y;
      }
      if (wx1 < x0 || wx0 > x1 || wy1 < y0 || wy0 > y1) continue;

      for (let i = 1; i < pts.length; i++) {
        for (let k = 1; k < wp.length; k++) {
          if (segIntersect(pts[i - 1], pts[i], wp[k - 1], wp[k])) return true;
        }
      }
    }
    return false;
  }

  /** Points for one stroke, spaced so the measured speed comes out right. */
  buildPath(plan, { crossSecond = false } = {}) {
    const view = this.game.view;
    const s = view.scale;
    // Blade speed is read in screen-heights per second, and samples land one
    // simulated frame apart, so spacing is what sets the measured speed.
    const perSample = Math.max(2, plan.speed * view.h * (this.dt / 1000));
    const wantLen = clamp(perSample * 7, 70 * s, 330 * s);
    const samples = clamp(Math.round(wantLen / perSample), 4, 32);
    const L = samples * perSample;

    let axis = plan.axis;
    if (crossSecond) {
      // Square to the first stroke: crossScore wants the two near 90°, and
      // against the stem both then read as the same undirected angle.
      axis = { x: -axis.y, y: axis.x };
    }
    const perp = { x: -axis.y, y: axis.x };

    const pts = [];
    const pattern = crossSecond ? 'straight' : plan.pattern;

    if (pattern === 'arc') {
      // A clean bow. analyseShape reads total turning as the sweep, and
      // patternScore wants it between 0.5 and 2.9 rad with little wobble.
      const sweep = clamp(1.5 * plan.fidelity, 0.05, 2.6);
      const R = L / (2 * Math.sin(sweep / 2) || 1e-6);
      const half = sweep / 2;
      for (let i = 0; i <= samples; i++) {
        const a = -half + sweep * (i / samples);
        // Measured from the apex, so the arc's midpoint lands on the cut
        // point and its tangent there is the intended blade angle. Anchoring
        // the *chord* instead leaves the curve bulging a fifth of its length
        // clear of the stem, and a well-traced arc then misses outright.
        pts.push({ u: R * Math.sin(a), v: R * (Math.cos(a) - 1) });
      }
    } else if (pattern === 'zigzag') {
      // Enough legs for 3 reversals when traced well, fewer when not.
      const legs = plan.fidelity > 0.62 ? 5 : plan.fidelity > 0.34 ? 3 : 2;
      const amp = 0.10 * L * clamp(plan.fidelity, 0.15, 1);
      for (let i = 0; i <= legs; i++) {
        pts.push({ u: -L / 2 + L * (i / legs), v: (i % 2 ? amp : -amp) });
      }
    } else {
      for (let i = 0; i <= samples; i++) {
        pts.push({ u: -L / 2 + L * (i / samples), v: 0 });
      }
    }

    // Nudge the whole path half a sample along its own axis. Sample points
    // otherwise sit at exact multiples of the spacing from the centre, so a
    // perfectly aimed swipe puts a *vertex* precisely on the stem — and a
    // crossing exactly at a shared endpoint can fall outside segIntersect's
    // 0..1 range on both adjoining segments at once and register as a miss.
    // A real hand never lands on the mathematical point; without this the
    // bot's hit rate collapsed at high skill (37 swipes for 11 cuts).
    const phase = perSample * 0.5;
    return pts.map((p) => ({
      x: plan.at.x + axis.x * (p.u + phase) + perp.x * p.v,
      y: plan.at.y + axis.y * (p.u + phase) + perp.y * p.v,
    }));
  }

  /* ── Executing a swipe ──────────────────────────────────────────── */

  beginStroke(plan, opts = {}) {
    const pts = this.buildPath(plan, opts);
    this.stroke = { pts, i: 0, plan, second: !!opts.crossSecond };
    this.stats.swipes++;
  }

  advanceStroke(now) {
    const b = this.game.blade;
    const s = this.stroke;
    const p = s.pts[Math.min(s.i, s.pts.length - 1)];
    const ev = { clientX: p.x, clientY: p.y, pointerId: 1, preventDefault() {} };

    // Straight at the Blade's handlers rather than through synthetic DOM
    // events: same code path, same measurements, none of the per-event
    // overhead that would dominate a few hundred thousand simulated frames.
    if (s.i === 0) b._down(ev);
    else if (s.i < s.pts.length) b._move(ev);
    else {
      b._up(ev);
      this.stroke = null;
      if (s.plan.cross && !s.second) {
        // Second half of the X, well inside CFG.crossWindow.
        this.pendingCross = s.plan;
        this.gapUntil = now + 120;
      } else {
        this.gapUntil = now + 40 + this.rng() * 90 * this.e;
      }
      return;
    }
    s.i++;
  }
}

/* ── Running a round ──────────────────────────────────────────────── */

/**
 * Play one round to its end as fast as the CPU allows and report what
 * happened. Time is virtual: the clock the game reads is stepped by hand,
 * so a 45-second round costs milliseconds and never waits on anything.
 */
export function runRound(game, {
  round = 1,
  skill = 0.8,
  seed = 1,
  render = false,
  fps = 60,
  maxSeconds = 120,
  cfg = null,
} = {}) {
  const realRandom = Math.random;
  const realNow = performance.now;
  const realRender = game.render;

  // Tuning values can be patched for the length of one run, so a sweep is
  // a loop rather than an edit-and-rerun. One level deep is enough for the
  // things worth sweeping (spawnBag, wind, quota…) and keeps the restore
  // honest — anything deeper would need a real clone to put back.
  const cfgSaved = [];
  if (cfg) {
    for (const [k, v] of Object.entries(cfg)) {
      cfgSaved.push([k, CFG[k]]);
      CFG[k] = (v && typeof v === 'object' && !Array.isArray(v))
        ? { ...CFG[k], ...v }
        : v;
    }
  }

  const dt = 1000 / fps;
  let vnow = 0;
  const qualities = [];
  const grades = {};
  const mix = {};          // what the field actually dealt this run
  let spawned = 0;

  const realFinalize = game.finalize;
  const realSpawn = game.spawn;

  try {
    // Two independent streams. Everything random in the game funnels
    // through Math.random — spawn choice, position, palettes, wind phase —
    // so seeding that is what makes a run reproducible. The bot draws from
    // its own stream instead of sharing, or a change in how many decisions
    // it happens to make would shift the world's draws too, and two skill
    // levels on the same seed would no longer start from the same field.
    const rng = mulberry32(seed);
    const botRng = mulberry32((Math.imul(seed, 2654435761) ^ 0x9E3779B9) >>> 0);
    Math.random = rng;
    performance.now = () => vnow;
    if (!render) game.render = () => {};

    game.finalize = function patched(rec) {
      realFinalize.call(this, rec);
      const g = this.lastGrade;
      if (g) {
        qualities.push(+g.quality.toFixed(3));
        grades[g.grade.key] = (grades[g.grade.key] || 0) + 1;
      }
    };
    game.spawn = function patched(...args) {
      const before = this.flowers.length;
      realSpawn.apply(this, args);
      if (this.flowers.length > before) {
        spawned++;
        const id = this.flowers[this.flowers.length - 1].species.id;
        mix[id] = (mix[id] || 0) + 1;
      }
    };

    game.startRun(round);
    // Wipe every scrap of carried-over state that the clock touches.
    // game.time is never reset by startRound and it drives the wind phase,
    // so without this a run depends on how long the page happened to sit
    // idle beforehand and on how many rounds ran before it — which would
    // quietly make the seed a lie.
    game.time = 0;
    game.last = vnow;
    game.blade.points.length = 0;
    game.blade.trail.length = 0;
    game.blade.active = false;
    game.blade.pointerId = null;
    // Pollen survives fx.reset(), and a drifting mote calls rand() when it
    // wraps off the top of the screen. That shares the one random stream
    // with spawning, so leftover pollen from a previous round would shift
    // every later draw and quietly desync an otherwise identical run.
    game.fx.seedPollen(Math.round(22 * game.view.scale));

    const bot = new Bot(game, { skill, rng: botRng, dt });

    const limit = maxSeconds * 1000;
    // Run past the whistle: endRound leaves the game 'binding', and it is
    // beginBouquet a beat later that decides whether the round was cleared.
    while (vnow < limit && game.state !== 'bouquet' && game.state !== 'over') {
      vnow += dt;
      bot.think(vnow);
      game.frame(vnow);
    }

    const avg = qualities.length
      ? qualities.reduce((a, b) => a + b, 0) / qualities.length : 0;

    return {
      round,
      skill,
      seed,
      points: game.roundPoints,
      quota: game.quota,
      pct: game.quota ? game.roundPoints / game.quota : 0,
      cleared: !!game.cleared,
      cuts: game.cutCount,
      strikes: game.strikes,
      spawned,
      mix,
      swipes: bot.stats.swipes,
      abandoned: bot.stats.abandoned,
      heldOff: bot.stats.heldOff,
      avgQuality: +avg.toFixed(3),
      grades,
      secondsUsed: +(vnow / 1000).toFixed(1),
      endReason: game.endReason,
    };
  } finally {
    Math.random = realRandom;
    performance.now = realNow;
    game.render = realRender;
    game.finalize = realFinalize;
    game.spawn = realSpawn;
    for (const [k, v] of cfgSaved) CFG[k] = v;
  }
}
