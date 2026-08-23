/* Balance harness: runs the scripted player (tools/bot.js) over whatever
   rounds and skill levels you name, and prints what it found.

   One browser is launched for the whole batch and every round is played on
   a virtual clock, so a run that used to cost 45 seconds of wall time now
   costs milliseconds. That is the difference between checking one tuning
   guess and sweeping a dozen.

   Usage:
     node tools/simulate.mjs                                  # default sweep
     node tools/simulate.mjs --rounds 7,8,9,10 --skill 0.75
     node tools/simulate.mjs --rounds 8 --skill 0.4,0.6,0.8 --trials 12
     node tools/simulate.mjs --skill 0.75 --trials 20 --json

   Seeds are derived from --seed, so two invocations with the same flags
   compare identical spawn sequences — which is the whole point when you
   are trying to tell a tuning change apart from spawn luck. */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');

async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    // Container install lives outside the project's module resolution.
    return import('/opt/node22/lib/node_modules/playwright/index.mjs');
  }
}

/* ── Args ─────────────────────────────────────────────────────────── */

function parseArgs(argv) {
  const out = {
    rounds: [1, 3, 5, 7, 8, 9, 10],
    skill: [0.75],
    trials: 8,
    seed: 1000,
    json: false,
    quiet: false,
    cfg: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const nums = (v) => v.split(',').map(Number).filter((n) => !Number.isNaN(n));
    if (a === '--rounds') out.rounds = nums(argv[++i]);
    else if (a === '--skill') out.skill = nums(argv[++i]);
    else if (a === '--trials') out.trials = Number(argv[++i]);
    else if (a === '--seed') out.seed = Number(argv[++i]);
    else if (a === '--cfg') out.cfg = JSON.parse(argv[++i]);
    else if (a === '--json') out.json = true;
    else if (a === '--quiet') out.quiet = true;
  }
  return out;
}

/* ── Static server ────────────────────────────────────────────────── */

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
};

function serve(root) {
  return new Promise((ok) => {
    const server = createServer(async (req, res) => {
      const path = decodeURIComponent(req.url.split('?')[0]);
      const file = join(root, path === '/' ? '/index.html' : path);
      if (!file.startsWith(root) || !existsSync(file)) { res.writeHead(404); res.end(); return; }
      try {
        const body = await readFile(file);
        res.writeHead(200, {
          'Content-Type': MIME[extname(file)] || 'application/octet-stream',
          'Cache-Control': 'no-store',
        });
        res.end(body);
      } catch { res.writeHead(500); res.end(); }
    });
    server.listen(0, '127.0.0.1', () => ok({ server, port: server.address().port }));
  });
}

/* ── Stats ────────────────────────────────────────────────────────── */

const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
function median(a) {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
const pct = (v) => `${(v * 100).toFixed(0)}%`;

/* Does skill decide the round, or does the draw?

   `skillShare` is eta-squared: of all the variation in scores across every
   run of a round, the fraction explained by which bot played rather than
   by which seed it drew. Above 0.5 means skill is the bigger factor; the
   closer to 1, the more the game rewards the player over the shuffle.

   `ordered` pairs runs by seed and asks how often the better bot actually
   beat the worse one on the same starting field. It is the blunter, more
   human reading of the same question. */
function analyseSkillVsLuck(cells) {
  const all = [];
  for (const c of cells) for (const r of c.runs) all.push(r.pct);
  if (all.length < 2) return { skillShare: 0, ordered: 0 };

  const grand = mean(all);
  const totalSS = all.reduce((s, v) => s + (v - grand) ** 2, 0);
  let betweenSS = 0;
  for (const c of cells) {
    const m = mean(c.runs.map((r) => r.pct));
    betweenSS += c.runs.length * (m - grand) ** 2;
  }

  const ladder = [...cells].sort((a, b) => a.skill - b.skill);
  let ok = 0, pairs = 0;
  for (let i = 1; i < ladder.length; i++) {
    const lower = new Map(ladder[i - 1].runs.map((r) => [r.seed, r.pct]));
    for (const hi of ladder[i].runs) {
      if (!lower.has(hi.seed)) continue;
      pairs++;
      if (hi.pct > lower.get(hi.seed)) ok++;
    }
  }

  return {
    skillShare: totalSS > 0 ? betweenSS / totalSS : 0,
    ordered: pairs ? ok / pairs : 0,
  };
}

/* ── Main ─────────────────────────────────────────────────────────── */

const args = parseArgs(process.argv.slice(2));
const { chromium } = await loadPlaywright();
const { server, port } = await serve(ROOT);
const browser = await chromium.launch();

try {
  const page = await browser.newPage({ viewport: { width: 393, height: 839 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e.message)));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });

  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.setItem('bloomblade.v1',
    JSON.stringify({ seenTutorial: true, sound: false, lang: 'en', bestRound: 10 })));
  await page.reload({ waitUntil: 'networkidle' });
  await page.evaluate(() => document.getElementById('screenTitle').classList.add('hidden'));
  await page.waitForFunction(() => !!window.game);

  const started = Date.now();
  const rows = [];

  for (const skill of args.skill) {
    for (const round of args.rounds) {
      // The whole batch for one cell runs inside a single evaluate: no
      // per-frame round trip to Node, which is what made the old harness slow.
      const runs = await page.evaluate(async ({ round, skill, trials, seed, cfg }) => {
        const { runRound } = await import('/tools/bot.js');
        const out = [];
        for (let i = 0; i < trials; i++) {
          out.push(runRound(window.game, { round, skill, seed: seed + i, cfg }));
        }
        return out;
      }, { round, skill, trials: args.trials, seed: args.seed, cfg: args.cfg });

      const pcts = runs.map((r) => r.pct);
      const cleared = runs.filter((r) => r.cleared).length;
      rows.push({
        round, skill,
        quota: runs[0].quota,
        clearRate: cleared / runs.length,
        meanPct: mean(pcts),
        medianPct: median(pcts),
        minPct: Math.min(...pcts),
        maxPct: Math.max(...pcts),
        meanCuts: mean(runs.map((r) => r.cuts)),
        meanQuality: mean(runs.map((r) => r.avgQuality)),
        meanStrikes: mean(runs.map((r) => r.strikes)),
        runs,
      });
    }
  }

  const elapsed = (Date.now() - started) / 1000;

  if (args.json) {
    console.log(JSON.stringify({ args, rows }, null, 2));
  } else {
    const head = ['skill', 'round', 'quota', 'clear', 'median', 'mean', 'min', 'max', 'cuts', 'qual', 'stk'];
    const w = [6, 6, 7, 6, 7, 6, 5, 5, 6, 6, 5];
    const line = (cells) => cells.map((c, i) => String(c).padStart(w[i])).join(' ');
    const w2 = [6, 10, 8];
    const line2 = (cells) => cells.map((c, i) => String(c).padStart(w2[i])).join(' ');
    console.log(line(head));
    console.log(w.map((n) => '-'.repeat(n)).join(' '));
    let lastSkill = null;
    for (const r of rows) {
      if (lastSkill !== null && r.skill !== lastSkill) console.log();
      lastSkill = r.skill;
      console.log(line([
        r.skill.toFixed(2), r.round, r.quota, pct(r.clearRate),
        pct(r.medianPct), pct(r.meanPct), pct(r.minPct), pct(r.maxPct),
        r.meanCuts.toFixed(1), r.meanQuality.toFixed(2), r.meanStrikes.toFixed(1),
      ]));
    }
    if (args.skill.length > 1) {
      console.log();
      console.log('skill vs luck   (skillShare > 50% means skill decides the round)');
      console.log(line2(['round', 'skillShare', 'ordered']));
      console.log('------ ---------- --------');
      for (const round of args.rounds) {
        const cells = rows.filter((r) => r.round === round);
        const a = analyseSkillVsLuck(cells);
        console.log(line2([round, pct(a.skillShare), pct(a.ordered)]));
      }
    }

    const totalRuns = rows.reduce((n, r) => n + r.runs.length, 0);
    console.log();
    console.log(`${totalRuns} rounds simulated in ${elapsed.toFixed(1)}s `
      + `(${(elapsed * 1000 / totalRuns).toFixed(0)}ms each)`);
  }

  if (errs.length) {
    console.error('\npage errors:');
    for (const e of [...new Set(errs)].slice(0, 10)) console.error('  ' + e);
    process.exitCode = 1;
  }
} finally {
  await browser.close();
  server.close();
}
