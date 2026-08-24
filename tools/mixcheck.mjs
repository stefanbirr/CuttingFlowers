/* Does the draw decide the round?

   The northstar (DESIGN.md) says skill has to matter more than what the
   field happens to deal. simulate.mjs answers the broad version of that
   with skillShare. This answers the narrow, specific one: holding skill
   fixed, can you predict a round's score from the species it dealt?

   Difficulty per species is taken from the runs themselves — the mean cut
   quality each species actually yielded — rather than guessed from its
   tolerances, so it reflects how hard the species is to play rather than
   how hard it looks on paper. Each run then gets an expected-quality score
   from its own mix, and we correlate that with what it actually scored.

   |r| near 0  the draw tells you nothing; skill decides.
   |r| near 1  the round was settled when the field was dealt.

   Usage: node tools/mixcheck.mjs [--rounds 5,8,10] [--skill 0.5] [--trials 120]
*/

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');

async function loadPlaywright() {
  try { return await import('playwright'); } catch {
    return import('/opt/node22/lib/node_modules/playwright/index.mjs');
  }
}

const argv = process.argv.slice(2);
const arg = (name, dflt) => {
  const i = argv.indexOf(name);
  return i === -1 ? dflt : argv[i + 1];
};
const rounds = String(arg('--rounds', '5,8,10')).split(',').map(Number);
const skills = String(arg('--skill', '0.5,0.75')).split(',').map(Number);
const trials = Number(arg('--trials', 120));
const seed = Number(arg('--seed', 4000));
const cfg = arg('--cfg', null);

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const server = createServer(async (req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  const f = join(ROOT, p === '/' ? '/index.html' : p);
  if (!f.startsWith(ROOT) || !existsSync(f)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': MIME[extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  res.end(await readFile(f));
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));

const { chromium } = await loadPlaywright();
const browser = await chromium.launch();

function pearson(xs, ys) {
  const n = xs.length;
  if (n < 3) return 0;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx, dy = ys[i] - my;
    sxy += dx * dy; sxx += dx * dx; syy += dy * dy;
  }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : 0;
}

try {
  // A phone held the way the game now enforces (see the .rotate-gate rules
  // and manifest orientation) — the harness has to measure the shape of
  // window players actually get.
  const page = await browser.newPage({ viewport: { width: 844, height: 390 } });
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html`, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.setItem('bloomblade.v1',
    JSON.stringify({ seenTutorial: true, sound: false, lang: 'en', bestRound: 10 })));
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.game);

  console.log('how much does the draw decide the round?');
  console.log(' skill  round      r   r^2  reading');
  console.log('------ ------ ------ ----- --------');

  for (const skill of skills) {
    for (const round of rounds) {
      const runs = await page.evaluate(async (o) => {
        const { runRound } = await import('/tools/bot.js');
        const out = [];
        for (let i = 0; i < o.trials; i++) {
          out.push(runRound(window.game, {
            round: o.round, skill: o.skill, seed: o.seed + i,
            cfg: o.cfg ? JSON.parse(o.cfg) : null,
          }));
        }
        return out;
      }, { round, skill, trials, seed, cfg });

      // Empirical difficulty: what each species actually yielded, pooled
      // over every run at this skill level.
      const perSpecies = new Map();
      for (const r of runs) {
        for (const [id, n] of Object.entries(r.mix)) {
          const e = perSpecies.get(id) || { spawns: 0 };
          e.spawns += n;
          perSpecies.set(id, e);
        }
      }
      // Quality is only recorded per cut overall, so difficulty is proxied
      // by how a run's mix leans against the pooled average composition.
      const totalSpawns = [...perSpecies.values()].reduce((a, b) => a + b.spawns, 0);
      const share = new Map([...perSpecies].map(([id, e]) => [id, e.spawns / totalSpawns]));

      // Per-species scores are fitted on one half of the runs and the
      // correlation measured on the other. Fitting and testing on the same
      // batch would hand ~11 free parameters to 120 points and manufacture
      // a strong correlation out of noise — it reported "draw decides" even
      // where the draw does nothing.
      const ids = [...share.keys()];
      const train = runs.filter((_, i) => i % 2 === 0);
      const test = runs.filter((_, i) => i % 2 === 1);

      const perId = new Map(ids.map((id) => [id, { sum: 0, w: 0 }]));
      for (const r of train) {
        const n = Object.values(r.mix).reduce((a, b) => a + b, 0) || 1;
        for (const [id, c] of Object.entries(r.mix)) {
          const e = perId.get(id);
          e.sum += r.pct * (c / n);
          e.w += c / n;
        }
      }
      const fallback = train.reduce((a, b) => a + b.pct, 0) / (train.length || 1);
      const idScore = new Map(ids.map((id) => {
        const e = perId.get(id);
        return [id, e.w > 0 ? e.sum / e.w : fallback];
      }));

      const xs = [], ys = [];
      for (const r of test) {
        const n = Object.values(r.mix).reduce((a, b) => a + b, 0);
        if (!n) continue;
        let expect = 0;
        for (const [id, c] of Object.entries(r.mix)) expect += (idScore.get(id) || fallback) * (c / n);
        xs.push(expect);
        ys.push(r.pct);
      }

      const r = pearson(xs, ys);
      const r2 = r * r;
      const reading = r2 < 0.10 ? 'skill decides'
        : r2 < 0.25 ? 'draw nudges'
          : r2 < 0.50 ? 'draw matters' : 'DRAW DECIDES';
      console.log(
        `${String(skill.toFixed(2)).padStart(6)} ${String(round).padStart(6)} `
        + `${r.toFixed(2).padStart(6)} ${r2.toFixed(2).padStart(5)}  ${reading}`,
      );
    }
  }
  console.log();
  console.log(`${trials} runs per cell.`);
} finally {
  await browser.close();
  server.close();
}
