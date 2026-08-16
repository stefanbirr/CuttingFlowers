/* Tiny synthesised sound bank — no asset downloads, works offline. */

const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21];

class Sound {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.noise = null;
    this.enabled = true;
    this.unlocked = false;
  }

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { this.enabled = false; return; }
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(this.ctx.destination);

    const len = Math.floor(this.ctx.sampleRate * 0.4);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;
  }

  unlock() {
    this.init();
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    this.unlocked = true;
  }

  setEnabled(on) {
    this.enabled = on;
    if (this.master) this.master.gain.value = on ? 0.55 : 0;
  }

  get t() { return this.ctx.currentTime; }

  _ok() { return this.enabled && this.ctx && this.unlocked; }

  _env(node, t0, a, d, peak = 1) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak), t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);
    node.connect(g);
    g.connect(this.master);
    return g;
  }

  tone(freq, { type = 'sine', at = 0, a = 0.008, d = 0.22, gain = 0.25, slide = 0 } = {}) {
    if (!this._ok()) return;
    const t0 = this.t + at;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t0 + a + d);
    this._env(o, t0, a, d, gain);
    o.start(t0);
    o.stop(t0 + a + d + 0.05);
  }

  hiss({ at = 0, d = 0.09, gain = 0.3, freq = 2400, q = 1.2, type = 'bandpass', sweep = 1 } = {}) {
    if (!this._ok()) return;
    const t0 = this.t + at;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t0);
    if (sweep !== 1) f.frequency.exponentialRampToValueAtTime(Math.max(80, freq * sweep), t0 + d);
    f.Q.value = q;
    src.connect(f);
    this._env(f, t0, 0.004, d, gain);
    src.start(t0);
    src.stop(t0 + d + 0.08);
  }

  /* ── Game events ─────────────────────────────────────────────── */

  snip(quality = 0.7) {
    const bright = 1400 + quality * 3400;
    this.hiss({ freq: bright, q: 1.4, d: 0.07, gain: 0.22 + quality * 0.14, sweep: 0.45 });
    this.tone(320 + quality * 260, { type: 'triangle', d: 0.09, gain: 0.10, slide: 0.6 });
    if (quality > 0.8) this.tone(1560, { type: 'sine', at: 0.05, d: 0.34, gain: 0.11, a: 0.005 });
  }

  perfect() {
    [0, 4, 7, 12].forEach((s, i) =>
      this.tone(660 * Math.pow(2, s / 12), { type: 'sine', at: i * 0.055, d: 0.4, gain: 0.13 }));
  }

  sprout() {
    this.tone(300, { type: 'sine', d: 0.16, gain: 0.05, slide: 1.7 });
  }

  wither() {
    this.tone(220, { type: 'sine', d: 0.4, gain: 0.09, slide: 0.45 });
    this.hiss({ freq: 500, d: 0.22, gain: 0.06, sweep: 0.4 });
  }

  sting() {
    this.hiss({ freq: 900, q: 0.6, d: 0.3, gain: 0.3, type: 'lowpass', sweep: 0.3 });
    this.tone(120, { type: 'sawtooth', d: 0.32, gain: 0.16, slide: 0.5 });
  }

  combo(n) {
    const step = PENTA[Math.min(PENTA.length - 1, n)];
    this.tone(520 * Math.pow(2, step / 12), { type: 'triangle', d: 0.26, gain: 0.12 });
  }

  bind() {
    [0, 4, 7, 11, 14].forEach((s, i) =>
      this.tone(392 * Math.pow(2, s / 12), { type: 'sine', at: i * 0.09, d: 0.7, gain: 0.12 }));
  }

  fail() {
    [0, -3, -7].forEach((s, i) =>
      this.tone(300 * Math.pow(2, s / 12), { type: 'triangle', at: i * 0.14, d: 0.5, gain: 0.13 }));
  }

  tick(urgent = false) {
    this.tone(urgent ? 900 : 640, { type: 'square', d: 0.05, gain: urgent ? 0.07 : 0.035 });
  }

  ui() {
    this.tone(560, { type: 'sine', d: 0.08, gain: 0.09 });
  }
}

export const sound = new Sound();
