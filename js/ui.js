/* DOM chrome: screens, HUD, field guide, results panels. */

import { CFG, quotaForRound } from './config.js';
import { SPECIES } from './species.js';
import { drawStem, drawHead } from './draw.js';
import { drawReplay, drawReplayFrame } from './replay.js';
import { clamp } from './util.js';
import { store } from './storage.js';
import {
  t, plural, fmtNum, speciesName, speciesHint, kindLabel,
  angleLabel, pointBandLabel, speedLabelShort, patternLabelShort, patternLabelLong,
} from './i18n.js';

const $ = (id) => document.getElementById(id);

export const ui = {
  el: {
    hud: $('hud'),
    score: $('hudScore'),
    round: $('hudRound'),
    time: $('hudTime'),
    quotaFill: $('quotaFill'),
    quotaText: $('quotaText'),
    combo: $('hudCombo'),
    comboValue: $('comboValue'),
    basket: $('basketCount'),
    strikes: $('strikes'),
    bestScore: $('bestScore'),
    guideList: $('guideList'),
    bouquetTitle: $('bouquetTitle'),
    resultStatus: $('resultStatus'),
    resultPoints: $('resultPoints'),
    bouquetActions: $('bouquetActions'),
    overCoach: $('overCoach'),
    btnReplay: $('btnReplay'),
    replayTitle: $('replayTitle'),
    replayList: $('replayList'),
    replayDetail: $('replayDetail'),
    replayCanvas: $('replayCanvas'),
    replayReadout: $('replayReadout'),
    replayLegendIdeal: $('replayLegendIdeal'),
    replayLegendActual: $('replayLegendActual'),
    pickGrid: $('pickGrid'),
    levelGrid: $('levelGrid'),
    hudPractice: $('hudPractice'),
    practiceName: $('practiceName'),
    practiceHint: $('practiceHint'),
    practiceStats: $('practiceStats'),
    introKicker: $('introKicker'),
    introName: $('introName'),
    introSpecimen: $('introSpecimen'),
    introSpecs: $('introSpecs'),
    introHint: $('introHint'),
    btnIntroPractice: $('btnIntroPractice'),
    introPracticeHint: $('introPracticeHint'),
    btnIntroStart: $('btnIntroStart'),
  },

  show(id) { $(id)?.classList.remove('hidden'); },
  hide(id) { $(id)?.classList.add('hidden'); },
  toggle(id, on) { $(id)?.classList.toggle('hidden', !on); },

  showHud(on) {
    this.el.hud.classList.toggle('hidden', !on);
    this.el.hud.setAttribute('aria-hidden', String(!on));
  },

  setScore(v) { this.el.score.textContent = fmtNum(v); },
  setRound(v) { this.el.round.textContent = v; },
  setBasket(v) { this.el.basket.textContent = v; },

  setTime(sec) {
    this.el.time.textContent = Math.max(0, Math.ceil(sec));
    this.el.time.classList.toggle('urgent', sec <= 10);
  },

  setQuota(score, quota) {
    const k = clamp(score / quota, 0, 1);
    this.el.quotaFill.style.width = `${k * 100}%`;
    this.el.quotaFill.classList.toggle('met', k >= 1);
    this.el.quotaText.textContent = k >= 1 ? t('hud.goalMet') : t('hud.goal', { n: fmtNum(quota) });
    this._lastQuota = { score, quota };
  },

  setCombo(mult) {
    const on = mult > 1.01;
    this.el.combo.classList.toggle('on', on);
    if (on) this.el.comboValue.textContent = `×${mult.toFixed(2).replace(/0$/, '')}`;
  },

  setStrikes(used, total) {
    const box = this.el.strikes;
    if (box.childElementCount !== total) {
      box.innerHTML = '';
      for (let i = 0; i < total; i++) {
        const d = document.createElement('span');
        d.className = 'strike-dot';
        box.appendChild(d);
      }
    }
    [...box.children].forEach((d, i) => d.classList.toggle('used', i < used));
  },

  setBest(v) { this.el.bestScore.textContent = fmtNum(v); },

  /* ── Practice mode ───────────────────────────────────────────── */

  /** Swap the goal/clock chrome for the species brief, or back again. */
  setPracticeMode(on, species) {
    this.el.hudPractice.classList.toggle('hidden', !on);
    document.getElementById('quotaProgress')?.classList.toggle('hidden', on);
    this.el.strikes.classList.toggle('hidden', on);
    // No clock and no round number when you are just drilling one species.
    this.el.hud.querySelector('.hud-right')?.classList.toggle('hidden', on);
    this.el.hud.querySelector('.hud-round')?.classList.toggle('hidden', on);
    this._practiceSpecies = on ? species : null;
    if (on && species) {
      this.el.practiceName.textContent = speciesName(species);
      this.el.practiceHint.textContent = speciesHint(species);
      this.el.practiceStats.textContent = t('practice.noCuts');
    }
  },

  /* ── New-species intro ───────────────────────────────────────── */

  /** Beat one: a centered panel announcing the round's fresh species —
      a specimen portrait, technique chips, the hint, and the button that
      drops into the practice beat. Kept in step with a language switch
      via applyStaticText(). */
  showIntroPreview(species, dpr = window.devicePixelRatio || 1) {
    this._introSpecies = species;
    this._introPhase = 'preview';
    this.el.introKicker.textContent = t('intro.kicker');
    this.el.introName.textContent = speciesName(species);
    this.el.introSpecs.innerHTML = specChips(species);
    this.el.introHint.textContent = speciesHint(species);
    this.el.btnIntroPractice.textContent = t('intro.practiceBtn');

    const cv = this.el.introSpecimen;
    const W = 120, H = 150;
    cv.width = W * dpr; cv.height = H * dpr;
    cv.style.width = `${W}px`; cv.style.height = `${H}px`;
    drawSpecimen(cv.getContext('2d'), species, dpr, W, H);

    this.show('screenIntro');
  },

  /** Beat two: the panel is gone, one stem is on the field, and this
      floating hint + Start-round button sit over it. */
  showIntroPractice() {
    this._introPhase = 'practice';
    this.el.introPracticeHint.textContent = t('intro.tryCut');
    this.el.btnIntroStart.textContent = t('intro.start');
    this.hide('screenIntro');
    this.show('introPractice');
  },

  clearIntro() {
    this._introSpecies = null;
    this._introPhase = null;
    this.hide('screenIntro');
    this.hide('introPractice');
  },

  setPracticeStats({ cuts, avg, best }) {
    this.el.practiceStats.textContent = cuts === 0
      ? t('practice.noCuts')
      : plural('practice.stats', cuts, { avg: Math.round(avg * 100), best: Math.round(best * 100) });
  },

  /** Grid of every species you can practise on (weeds excluded). */
  buildPicker(onPick, dpr = window.devicePixelRatio || 1) {
    const grid = this.el.pickGrid;
    grid.innerHTML = '';
    for (const sp of SPECIES) {
      if (!sp.cut) continue;
      const btn = document.createElement('button');
      btn.className = 'pick-item';
      btn.type = 'button';

      const cv = document.createElement('canvas');
      const W = 52, H = 62;
      cv.width = W * dpr; cv.height = H * dpr;
      cv.style.width = `${W}px`; cv.style.height = `${H}px`;
      drawSpecimen(cv.getContext('2d'), sp, dpr, W, H);

      const name = document.createElement('span');
      name.className = 'pick-name';
      name.textContent = speciesName(sp);

      const tech = document.createElement('span');
      tech.className = 'pick-tech';
      tech.textContent = techLabel(sp.cut);

      btn.append(cv, name, tech);
      btn.addEventListener('click', () => onPick(sp));
      grid.appendChild(btn);
    }
  },

  /** Grid of every round unlocked so far, plus the next one to reach —
      picking one jumps straight into a fresh run starting there. */
  buildLevels(onPick) {
    const grid = this.el.levelGrid;
    grid.innerHTML = '';
    const maxRound = Math.max(...SPECIES.map((sp) => sp.unlock));
    const unlockedThrough = Math.max(1, (store.get('bestRound') || 0) + 1);
    for (let round = 1; round <= maxRound; round++) {
      const locked = round > unlockedThrough;
      const btn = document.createElement('button');
      btn.className = `pick-item${locked ? ' locked' : ''}`;
      btn.type = 'button';
      btn.disabled = locked;

      const name = document.createElement('span');
      name.className = 'pick-name level-num';
      name.textContent = t('levels.round', { n: round });

      const tech = document.createElement('span');
      tech.className = 'pick-tech';
      tech.textContent = locked
        ? t('levels.locked', { n: unlockedThrough })
        : t('levels.goal', { n: fmtNum(quotaForRound(round)) });

      btn.append(name, tech);
      if (!locked) btn.addEventListener('click', () => onPick(round));
      grid.appendChild(btn);
    }
  },

  /* ── Field guide ─────────────────────────────────────────────── */

  buildGuide(dpr = window.devicePixelRatio || 1) {
    const list = this.el.guideList;
    list.innerHTML = '';
    for (const sp of SPECIES) {
      const row = document.createElement('div');
      row.className = 'guide-item';

      const cv = document.createElement('canvas');
      const W = 62, H = 76;
      cv.width = W * dpr; cv.height = H * dpr;
      cv.style.width = `${W}px`; cv.style.height = `${H}px`;
      drawSpecimen(cv.getContext('2d'), sp, dpr, W, H);

      const body = document.createElement('div');
      body.className = 'guide-body';
      body.innerHTML = `
        <div class="guide-name">${speciesName(sp)}<span class="tag ${sp.kind}">${kindLabel(sp.kind)}</span></div>
        <div class="guide-hint">${speciesHint(sp)}</div>
        <div class="guide-specs">${specChips(sp)}</div>`;

      row.append(cv, body);
      list.appendChild(row);
    }
  },

  /* ── Static chrome (titles, buttons, tutorial steps) ──────────── */

  /** Every fixed piece of UI text, applied on load and on language switch.
      Screens the player has not opened yet (guide, picker) rebuild lazily
      the next time they open — see main.js. */
  applyStaticText() {
    const set = (id, text) => { const el = $(id); if (el) el.textContent = text; };

    set('hudLabelScore', t('hud.score'));
    set('hudLabelRound', t('hud.round'));
    set('hudLabelTime', t('hud.time'));
    set('comboLabel', t('hud.combo'));
    set('basketLabel', t('hud.stems'));

    $('tagline').innerHTML = t('title.tagline'); // contains a <br>, so innerHTML not textContent
    set('bestLineLabel', t('title.bestLine'));
    set('btnPlay', t('title.play'));
    set('btnPractice', t('title.practice'));
    set('btnLevels', t('title.levels'));
    set('btnGuide', t('title.guide'));
    set('btnTutorial', t('title.tutorial'));
    set('fineprint', t('title.fineprint'));

    set('tutorialTitle', t('tutorial.title'));
    const list = $('howtoList');
    if (list) list.innerHTML = t('tutorial.steps').map((s) => `<li>${s}</li>`).join('');
    set('btnTutorialClose', t('tutorial.gotIt'));

    set('guideTitle', t('guide.title'));
    set('btnGuideBack', t('guide.back'));

    set('practiceTitle', t('practice.title'));
    set('practiceSubtitle', t('practice.subtitle'));
    set('btnPracticeBack', t('practice.back'));
    if (this._practiceSpecies) this.setPracticeMode(true, this._practiceSpecies);
    if (this._introSpecies && this._introPhase === 'preview') this.showIntroPreview(this._introSpecies);
    else if (this._introSpecies && this._introPhase === 'practice') this.showIntroPractice();

    set('levelsTitle', t('levels.title'));
    set('levelsSubtitle', t('levels.subtitle'));
    set('btnLevelsBack', t('levels.back'));

    set('pauseTitle', t('pause.title'));
    set('btnResume', t('pause.resume'));
    set('btnPauseGuide', t('pause.guide'));
    set('btnQuit', t('pause.quit'));

    set('btnCopyLog', t('over.copyLog'));
    set('btnReplay', t('over.replay'));
    set('replayTitle', t('replay.title'));
    set('replayLegendIdeal', t('replay.legendIdeal'));
    set('replayLegendActual', t('replay.legendActual'));
    set('btnReplayBack', t('replay.back'));
    set('btnReplayPlay', t('replay.play'));
    set('btnReplayClose', t('replay.close'));

    set('rotateText', t('rotate'));

    if (this._lastQuota) this.setQuota(this._lastQuota.score, this._lastQuota.quota);
  },

  /* ── Round result ────────────────────────────────────────────── */

  /** One screen for how a round ended, cleared or not. A clear needs
      nothing more than saying so — the goal/points comparison earns its
      place only on a miss, where it's the headline, with any coaching
      (coachTips, coach.js) right underneath it. */
  showRoundResult({ round, cleared, points, quota, stung = false, tips = [], actions }) {
    this.el.bouquetTitle.textContent = t('bouquet.roundTitle', { round });
    this.el.resultStatus.textContent = t(cleared ? 'result.cleared' : 'result.notCleared');
    this.el.resultStatus.className = `result-status ${cleared ? 'cleared' : 'failed'}`;

    if (cleared) {
      this.el.resultPoints.innerHTML = '';
    } else {
      const pct = quota ? clamp(points / quota, 0, 1) : 0;
      this.el.resultPoints.innerHTML = `
        <div class="result-row"><span>${t('result.goal')}</span><strong>${fmtNum(quota)}</strong></div>
        <div class="result-row"><span>${t('result.reached')}</span><strong>${fmtNum(points)}</strong></div>
        <div class="result-bar"><div class="result-bar-fill" style="width:${Math.round(pct * 100)}%"></div></div>
        ${stung ? `<p class="result-note">${t('result.stung')}</p>` : ''}`;
    }

    this.el.overCoach.innerHTML = tips.map((tip) => `<p class="coach-tip">${tip}</p>`).join('');

    this.el.bouquetActions.innerHTML = '';
    for (const a of actions) {
      const b = document.createElement('button');
      b.className = `btn ${a.primary ? 'primary' : ''}`;
      b.textContent = a.label;
      b.addEventListener('click', a.onClick, { once: true });
      this.el.bouquetActions.appendChild(b);
    }
    this.show('screenBouquet');
  },

  /* ── Replay ──────────────────────────────────────────────────── */

  /** The pick list: every cut this run that has a recorded stroke to show,
      grouped by round when there was more than one. `onPick(cutEvent)` is
      called with the log entry for whichever row was tapped. */
  buildReplayList(runLog, onPick) {
    const list = this.el.replayList;
    list.innerHTML = '';
    const rounds = runLog?.rounds || [];
    const multi = rounds.length > 1;
    let any = false;
    for (const r of rounds) {
      const cuts = r.events.filter((e) => e.type === 'cut' && e.replayPath);
      if (!cuts.length) continue;
      if (multi) {
        const h = document.createElement('div');
        h.className = 'replay-round-head';
        h.textContent = t('replay.round', { round: r.round });
        list.appendChild(h);
      }
      for (const e of cuts) {
        any = true;
        const grade = CFG.grades.find((g) => g.key === e.grade) || CFG.grades[CFG.grades.length - 1];
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'replay-item';
        row.innerHTML = `
          <span class="replay-item-dot" style="background:${grade.color}"></span>
          <span class="replay-item-body">
            <span class="replay-item-name">${speciesName(SPECIES.find((s) => s.id === e.species) || { id: e.species, name: e.species })}</span>
            <span class="replay-item-grade">${t(`grade.${e.grade}`)} · ${Math.round(e.quality * 100)}%</span>
          </span>`;
        row.addEventListener('click', () => onPick(e));
        list.appendChild(row);
      }
    }
    this.toggle('replayList', true);
    this.toggle('replayDetail', false);
    if (!any) list.innerHTML = `<p class="replay-empty">${t('replay.empty')}</p>`;
  },

  /** The comparison view for one cut: static overlay plus the readout. The
      "play" animation redraws the canvas itself frame by frame — see
      main.js, which owns that loop and calls back into drawReplayFrame. */
  showReplayDetail(cutEvent) {
    this.toggle('replayList', false);
    this.toggle('replayDetail', true);
    const sp = SPECIES.find((s) => s.id === cutEvent.species) || { id: cutEvent.species, name: cutEvent.species };
    const p = cutEvent.parts;
    const axis = (label, val, extra = '') =>
      `<span class="replay-axis">${label} <b>${Math.round(val * 100)}%</b>${extra}</span>`;
    this.el.replayReadout.innerHTML = `
      <div class="replay-readout-head">${speciesName(sp)} — ${t(`grade.${cutEvent.grade}`)} (${Math.round(cutEvent.quality * 100)}%)</div>
      <div class="replay-axes">
        ${axis(t('replay.axis.timing'), p.timing)}
        ${axis(t('replay.axis.point'), p.point)}
        ${p.angle == null ? '' : axis(t('replay.axis.angle'), p.angle, ` (${cutEvent.angleMeasured}° ${t('replay.of')} ${cutEvent.angleTarget}°)`)}
        ${axis(t('replay.axis.speed'), p.speed, ` (${cutEvent.speedMeasured} · ${speedLabelShort(cutEvent.speedBand)})`)}
        ${axis(t('replay.axis.pattern'), p.pattern)}
      </div>`;
    const canvas = this.el.replayCanvas;
    drawReplay(canvas.getContext('2d'), canvas.width, canvas.height, cutEvent);
  },

  drawReplayCanvasFrame(cutEvent, frac) {
    const canvas = this.el.replayCanvas;
    drawReplayFrame(canvas.getContext('2d'), canvas.width, canvas.height, cutEvent, frac);
  },

  drawReplayCanvasStatic(cutEvent) {
    const canvas = this.el.replayCanvas;
    drawReplay(canvas.getContext('2d'), canvas.width, canvas.height, cutEvent);
  },
};

/** Ultra-short technique summary for the picker tiles. */
function techLabel(c) {
  const angle = c.angle == null ? t('angle.any') : `${c.angle}°`;
  return `${angle} · ${patternLabelShort(c.pattern)}`;
}

function specChips(sp) {
  if (!sp.cut) return `<span class="spec">${t('guide.doNotCut')}</span>`;
  const c = sp.cut;
  return [
    angleLabel(c.angle),
    pointBandLabel(c.point),
    speedLabelShort(c.speed),
    patternLabelLong(c.pattern),
  ].map((s) => `<span class="spec">${s}</span>`).join('');
}

/** Little portrait of a species for the field guide. */
function drawSpecimen(ctx, sp, dpr, W, H) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const baseY = H - 6, topY = H * 0.42;
  const pts = [];
  for (let i = 0; i <= 10; i++) {
    const f = i / 10;
    pts.push({ x: W / 2 + Math.sin(f * 1.6) * 3, y: baseY + (topY - baseY) * f });
  }
  // No rim or halo on the specimens: these sit on a flat dark panel that
  // already separates them, and the shading only muddies them at this size.
  drawStem(ctx, pts, Math.min(5, sp.stem.width * 0.6), sp.stem.color,
    { taper: 0.7, seed: 3, rim: false });
  ctx.save();
  ctx.translate(pts[10].x, pts[10].y);
  const scale = Math.min(0.72, 26 / sp.head.size);
  drawHead(ctx, sp.head, {
    open: 1, wilt: 0, scale, seed: 1.3,
    palette: sp.head.colors,
    halo: false,
  });
  ctx.restore();
}
