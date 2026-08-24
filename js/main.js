/* Bootstrap: wiring, the animation loop, and PWA plumbing. */

import { Game } from './game.js';
import { ui } from './ui.js';
import { sound } from './audio.js';
import { store } from './storage.js';
import { replayDurationMs } from './replay.js';
import { t, getLang, setLang, otherLangName, onLangChange } from './i18n.js';

const canvas = document.getElementById('stage');
const game = new Game(canvas);
window.game = game;

/* ── Screens & buttons ────────────────────────────────────────────── */

const on = (id, fn) => document.getElementById(id)?.addEventListener('click', () => { sound.ui(); fn(); });

on('btnPlay', () => {
  ui.hide('screenTitle');
  if (!store.get('seenTutorial')) {
    store.set('seenTutorial', true);
    ui.show('screenTutorial');
    document.querySelector('#screenTutorial [data-close]')
      .addEventListener('click', () => game.startRun(), { once: true });
  } else {
    game.startRun();
  }
});

on('btnPractice', () => {
  ui.buildPicker((species) => {
    sound.ui();
    ui.hide('screenPractice');
    ui.hide('screenTitle');
    game.startPractice(species);
  });
  ui.show('screenPractice');
});

on('btnLevels', () => {
  ui.buildLevels((round) => {
    sound.ui();
    ui.hide('screenLevels');
    ui.hide('screenTitle');
    game.startRun(round);
  });
  ui.show('screenLevels');
});

on('btnGuide', () => { ui.buildGuide(); ui.show('screenGuide'); });
on('btnTutorial', () => ui.show('screenTutorial'));
on('btnPause', () => game.pause());
on('btnResume', () => game.resume());
on('btnPauseGuide', () => { ui.buildGuide(); ui.show('screenGuide'); });
on('btnQuit', () => game.quit());
// Retry/home/next-round are built fresh onto #bouquetActions each time the
// round-result screen shows (see Game#showResults, ui.showRoundResult) —
// there's one merged screen now, so there's no second panel to dismiss.

const copyLogBtn = document.getElementById('btnCopyLog');
on('btnCopyLog', async () => {
  const text = game.buildLogText();
  let ok = true;
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Clipboard API can be blocked (older iOS Safari, some in-app
    // browsers); a hidden textarea + execCommand still works there.
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    } catch { ok = false; }
  }
  copyLogBtn.textContent = t(ok ? 'over.copyLogDone' : 'over.copyLog');
  copyLogBtn.disabled = ok;
  setTimeout(() => { copyLogBtn.textContent = t('over.copyLog'); copyLogBtn.disabled = false; }, 1600);
});

/* ── Cut replay ───────────────────────────────────────────────────── */

const replayPlayBtn = document.getElementById('btnReplayPlay');
let replayAnim = null;      // { raf } while the "play" animation is running
let replayCut = null;       // the cut currently shown in the detail view

function stopReplayAnim() {
  if (replayAnim) cancelAnimationFrame(replayAnim.raf);
  replayAnim = null;
  if (replayPlayBtn) { replayPlayBtn.textContent = t('replay.play'); replayPlayBtn.disabled = false; }
}

function pickCut(cutEvent) {
  stopReplayAnim();
  replayCut = cutEvent;
  ui.showReplayDetail(cutEvent);
}

function openReplayList() {
  stopReplayAnim();
  ui.buildReplayList(game.runLog, (cutEvent) => { sound.ui(); pickCut(cutEvent); });
}

on('btnReplay', () => { openReplayList(); ui.show('screenReplay'); });
on('btnReplayBack', openReplayList);
on('btnReplayClose', () => { stopReplayAnim(); ui.hide('screenReplay'); });

on('btnReplayPlay', () => {
  if (replayAnim || !replayCut) return;
  const cut = replayCut;
  const dur = Math.max(300, replayDurationMs(cut));
  replayPlayBtn.textContent = t('replay.playing');
  replayPlayBtn.disabled = true;
  const start = performance.now();
  const step = (now) => {
    const frac = Math.min(1, (now - start) / dur);
    ui.drawReplayCanvasFrame(cut, frac);
    if (frac >= 1) { stopReplayAnim(); return; }
    replayAnim = { raf: requestAnimationFrame(step) };
  };
  replayAnim = { raf: requestAnimationFrame(step) };
});

for (const btn of document.querySelectorAll('[data-close]')) {
  btn.addEventListener('click', () => { sound.ui(); ui.hide(btn.dataset.close); });
}

const soundBtn = document.getElementById('btnSound');
function paintSoundBtn() {
  soundBtn.textContent = t('title.sound', { state: t(store.get('sound') ? 'title.soundOn' : 'title.soundOff') });
}
soundBtn.addEventListener('click', () => {
  const next = !store.get('sound');
  store.set('sound', next);
  sound.setEnabled(next);
  paintSoundBtn();
  if (next) sound.ui();
});

/* ── Language ─────────────────────────────────────────────────────── */

const langBtn = document.getElementById('btnLang');
function paintLangBtn() { langBtn.textContent = otherLangName(); }
langBtn.addEventListener('click', () => {
  sound.ui();
  setLang(getLang() === 'en' ? 'de' : 'en');
});

let installPromptActive = false;
onLangChange(() => {
  ui.applyStaticText();
  paintSoundBtn();
  paintLangBtn();
  if (installPromptActive) paintInstallFineprint();
});

/* ── First touch unlocks audio ────────────────────────────────────── */

function firstGesture() {
  sound.unlock();
  sound.setEnabled(store.get('sound'));
  window.removeEventListener('pointerdown', firstGesture);
  window.removeEventListener('keydown', firstGesture);
}
window.addEventListener('pointerdown', firstGesture, { passive: true });
window.addEventListener('keydown', firstGesture, { passive: true });

/* ── Layout ───────────────────────────────────────────────────────── */

let resizeTimer = null;
function relayout() {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    game.resize();
    const landscapeSqueeze = window.innerHeight < 420 && window.innerWidth > window.innerHeight;
    ui.toggle('rotateNote', landscapeSqueeze);
  }, 90);
}
window.addEventListener('resize', relayout);
window.addEventListener('orientationchange', relayout);
if (window.visualViewport) window.visualViewport.addEventListener('resize', relayout);

document.addEventListener('visibilitychange', () => {
  if (document.hidden) game.pause();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' || e.key === 'p') {
    game.state === 'paused' ? game.resume() : game.pause();
  }
});

/* ── Loop ─────────────────────────────────────────────────────────── */

document.documentElement.lang = getLang();
ui.applyStaticText();
ui.setBest(store.get('best'));
paintSoundBtn();
paintLangBtn();
relayout();

// The rAF argument is a frame-display timestamp, which does not always track
// wall clock (headless and heavily throttled tabs drift). Everything else in
// the game measures with performance.now(), so the loop does too.
let loopFailed = false;
function loop() {
  // A throw inside frame() used to skip the re-arm below and stop the game
  // dead on its last drawn frame. Keep the loop alive so the next frame can
  // recover, and report the first failure rather than a flood of them.
  try {
    game.frame(performance.now());
  } catch (err) {
    if (!loopFailed) { loopFailed = true; console.error('frame failed', err); }
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

/* ── Service worker ───────────────────────────────────────────────── */

if ('serviceWorker' in navigator) {
  // If this tab was already controlled by an older worker, an update means
  // its cached JS modules are stale (only navigations refetch over the
  // network; module scripts don't). Reload once so the new code actually
  // runs instead of silently keeping the old version alive in this tab.
  const hadController = !!navigator.serviceWorker.controller;
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloaded) return;
    reloaded = true;
    window.location.reload();
  });
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => { /* offline support is a bonus */ });
  });
}

/* Keep the browser's own install prompt available on the title screen. */
let installEvent = null;
function paintInstallFineprint() {
  const p = document.querySelector('#screenTitle .fineprint');
  if (!p) return;
  p.textContent = t('title.installPrompt');
  p.style.cursor = 'pointer';
  p.style.color = '#a7e8a0';
}
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installEvent = e;
  installPromptActive = true;
  paintInstallFineprint();
  const p = document.querySelector('#screenTitle .fineprint');
  p?.addEventListener('click', async () => {
    if (!installEvent) return;
    installEvent.prompt();
    installEvent = null;
    installPromptActive = false;
    p.textContent = t('title.fineprint');
    p.style.color = '';
  });
});
