/* Persisted preferences and records. Fails quietly in private modes. */

const KEY = 'bloomblade.v1';

const DEFAULTS = {
  best: 0,
  bestRound: 0,
  sound: true,
  seenTutorial: false,
  harvested: 0,
  immaculate: 0,
  lang: null,   // null = not chosen yet; i18n falls back to the browser's language
};

function read() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch {
    return { ...DEFAULTS };
  }
}

let state = read();

export const store = {
  get all() { return state; },
  get(k) { return state[k]; },
  set(k, v) {
    state[k] = v;
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* ignore */ }
  },
  bump(k, by = 1) { this.set(k, (state[k] || 0) + by); },
  recordRun(score, round) {
    if (score > state.best) this.set('best', score);
    if (round > state.bestRound) this.set('bestRound', round);
  },
};
