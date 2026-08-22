/* DOM chrome: screens, HUD, field guide, results panels. */

import { CFG } from './config.js';
import { SPECIES } from './species.js';
import { drawStem, drawHead } from './draw.js';
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
    bouquetStars: $('bouquetStars'),
    bouquetBreakdown: $('bouquetBreakdown'),
    bouquetTotal: $('bouquetTotal'),
    bouquetActions: $('bouquetActions'),
    overTitle: $('overTitle'),
    overReason: $('overReason'),
    finalScore: $('finalScore'),
    finalSub: $('finalSub'),
    pickGrid: $('pickGrid'),
    levelGrid: $('levelGrid'),
    hudPractice: $('hudPractice'),
    practiceName: $('practiceName'),
    practiceHint: $('practiceHint'),
    practiceStats: $('practiceStats'),
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
    document.querySelector('.hud-quota')?.classList.toggle('hidden', on);
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
        : t('levels.goal', { n: fmtNum(Math.round(CFG.quotaBase * Math.pow(CFG.quotaGrowth, round - 1))) });

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

    set('levelsTitle', t('levels.title'));
    set('levelsSubtitle', t('levels.subtitle'));
    set('btnLevelsBack', t('levels.back'));

    set('pauseTitle', t('pause.title'));
    set('btnResume', t('pause.resume'));
    set('btnPauseGuide', t('pause.guide'));
    set('btnQuit', t('pause.quit'));

    set('bouquetTotalLabel', t('bouquet.total'));
    set('finalScoreLabel', t('over.total'));
    set('btnRetry', t('over.retry'));
    set('btnHome', t('over.home'));

    set('rotateText', t('rotate'));

    if (this._lastQuota) this.setQuota(this._lastQuota.score, this._lastQuota.quota);
  },

  /* ── Results ─────────────────────────────────────────────────── */

  showBouquet({ round, result, roundPoints, actions }) {
    const name = result.nameKey ? t(`bouquet.name.${result.nameKey}`) : '';
    this.el.bouquetTitle.textContent = t('bouquet.roundTitle', { round, name });
    this.el.bouquetStars.innerHTML = [0, 1, 2, 3, 4].
      map((i) => `<span class="${i < result.stars ? '' : 'off'}">★</span>`).join('');

    // Purely descriptive — every point already came from the cuts
    // themselves (see bouquet.js), so these rows carry no value badge.
    this.el.bouquetBreakdown.innerHTML = result.rows.map((r, i) => {
      const label = t(`bouquet.${r.labelKey}`);
      const note = r.noteN != null
        ? plural(`bouquet.${r.noteKey}`, r.noteN)
        : t(`bouquet.${r.noteKey}`, r.noteVars);
      return `
      <div class="bd-row" style="animation-delay:${i * 55}ms">
        <span class="bd-label">${label}</span>
        <span class="bd-note">${note}</span>
      </div>`;
    }).join('');

    this.el.bouquetTotal.textContent = fmtNum(roundPoints);
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

  showOver({ title, reason, score, round, best, newBest }) {
    this.el.overTitle.textContent = title;
    this.el.overReason.textContent = reason;
    this.el.finalScore.textContent = fmtNum(score);
    this.el.finalSub.textContent = newBest
      ? t('over.newBest')
      : t('over.reachedRound', { round, best: fmtNum(best) });
    this.show('screenOver');
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
  drawStem(ctx, pts, Math.min(5, sp.stem.width * 0.6), sp.stem.color, { taper: 0.7, seed: 3 });
  ctx.save();
  ctx.translate(pts[10].x, pts[10].y);
  const scale = Math.min(0.72, 26 / sp.head.size);
  drawHead(ctx, sp.head, {
    open: 1, wilt: 0, scale, seed: 1.3,
    palette: sp.head.colors,
  });
  ctx.restore();
}
