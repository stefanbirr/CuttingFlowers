/* DOM chrome: screens, HUD, field guide, results panels. */

import { SPECIES } from './species.js';
import { drawStem, drawHead } from './draw.js';
import { clamp } from './util.js';

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

  setScore(v) { this.el.score.textContent = Math.round(v).toLocaleString(); },
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
    this.el.quotaText.textContent = k >= 1
      ? 'Goal met'
      : `Goal ${Math.round(quota).toLocaleString()}`;
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

  setBest(v) { this.el.bestScore.textContent = Math.round(v).toLocaleString(); },

  /* ── Practice mode ───────────────────────────────────────────── */

  /** Swap the goal/clock chrome for the species brief, or back again. */
  setPracticeMode(on, species) {
    this.el.hudPractice.classList.toggle('hidden', !on);
    document.querySelector('.hud-quota')?.classList.toggle('hidden', on);
    this.el.strikes.classList.toggle('hidden', on);
    // No clock and no round number when you are just drilling one species.
    this.el.hud.querySelector('.hud-right')?.classList.toggle('hidden', on);
    this.el.hud.querySelector('.hud-round')?.classList.toggle('hidden', on);
    if (on && species) {
      this.el.practiceName.textContent = species.name;
      this.el.practiceHint.textContent = species.hint;
      this.el.practiceStats.textContent = 'no cuts yet';
    }
  },

  setPracticeStats({ cuts, avg, best }) {
    this.el.practiceStats.textContent = cuts === 0
      ? 'no cuts yet'
      : `${cuts} cut${cuts === 1 ? '' : 's'} · avg ${Math.round(avg * 100)}% · best ${Math.round(best * 100)}%`;
  },

  /** Grid of every species you can practise on (weeds excluded). */
  buildPicker(onPick, dpr = window.devicePixelRatio || 1) {
    const grid = this.el.pickGrid;
    if (grid.childElementCount) return;
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
      name.textContent = sp.name;

      const tech = document.createElement('span');
      tech.className = 'pick-tech';
      tech.textContent = techLabel(sp.cut);

      btn.append(cv, name, tech);
      btn.addEventListener('click', () => onPick(sp));
      grid.appendChild(btn);
    }
  },

  /* ── Field guide ─────────────────────────────────────────────── */

  buildGuide(dpr = window.devicePixelRatio || 1) {
    const list = this.el.guideList;
    if (list.childElementCount) return;
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
        <div class="guide-name">${sp.name}<span class="tag ${sp.kind}">${sp.kind}</span></div>
        <div class="guide-hint">${sp.hint}</div>
        <div class="guide-specs">${specChips(sp)}</div>`;

      row.append(cv, body);
      list.appendChild(row);
    }
  },

  /* ── Results ─────────────────────────────────────────────────── */

  showBouquet({ round, title, result, roundPoints, actions }) {
    this.el.bouquetTitle.textContent = `Round ${round} — ${title}`;
    this.el.bouquetStars.innerHTML = [0, 1, 2, 3, 4].
      map((i) => `<span class="${i < result.stars ? '' : 'off'}">★</span>`).join('');

    const rows = [
      { label: 'Cuts this round', note: 'points banked in the field', value: roundPoints },
      ...result.rows,
    ];
    this.el.bouquetBreakdown.innerHTML = rows.map((r, i) => `
      <div class="bd-row" style="animation-delay:${i * 55}ms">
        <span class="bd-label">${r.label}</span>
        <span class="bd-note">${r.note}</span>
        <span class="bd-val ${r.value < 0 ? 'neg' : ''}">${r.value < 0 ? '' : '+'}${Math.round(r.value).toLocaleString()}</span>
      </div>`).join('');

    this.el.bouquetTotal.textContent = Math.round(roundPoints + result.total).toLocaleString();
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
    this.el.finalScore.textContent = Math.round(score).toLocaleString();
    this.el.finalSub.textContent = newBest
      ? 'A new personal best.'
      : `Reached round ${round} · best ${Math.round(best).toLocaleString()}`;
    this.show('screenOver');
  },
};

/** Ultra-short technique summary for the picker tiles. */
function techLabel(c) {
  const shape = { straight: 'straight', arc: 'curve', zigzag: 'zigzag', cross: 'cross-cut' }[c.pattern];
  const angle = c.angle == null ? 'any angle' : `${c.angle}°`;
  return `${angle} · ${shape}`;
}

function specChips(sp) {
  if (!sp.cut) return '<span class="spec">do not cut</span>';
  const c = sp.cut;
  const angle = c.angle == null ? 'any angle' : `${c.angle}° to stem`;
  const point = c.point < 0.2 ? 'cut low' : c.point < 0.42 ? 'cut mid' : 'cut high';
  const speed = { slow: 'slow', steady: 'steady', fast: 'fast' }[c.speed];
  const pattern = { straight: 'straight stroke', arc: 'curved sweep', zigzag: 'zigzag saw', cross: 'two crossing strokes' }[c.pattern];
  return [angle, point, speed, pattern, `${sp.value > 0 ? '+' : ''}${sp.value} pts`]
    .map((t) => `<span class="spec">${t}</span>`).join('');
}

/** Little portrait of a species for the field guide. */
function drawSpecimen(ctx, sp, dpr, W, H) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const baseY = H - 6, topY = H * 0.42;
  const pts = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    pts.push({ x: W / 2 + Math.sin(t * 1.6) * 3, y: baseY + (topY - baseY) * t });
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
