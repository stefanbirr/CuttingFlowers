/* Every plant in the game: how it looks, how long it lives, and the
   technique it demands.

   `cut.angle`   — degrees between the blade line and the stem line.
                   90 = straight across, 45 = florist's diagonal,
                   30 = long shallow slant. `null` = angle is not judged.
   `cut.point`   — where on the stem the blade should land: 0 at the soil,
                   1 at the head. Low numbers give long stems for the vase.
   `cut.speed`   — 'slow' | 'steady' | 'fast' (see CFG.speeds).
   `cut.pattern` — 'straight' | 'arc' | 'zigzag' | 'cross'.
*/

export const SPECIES = [
  /* ── Round 1: two flowers, and the first weed ─────────────────────── */
  {
    id: 'tulip',
    name: 'Tulip',
    kind: 'flower',
    lifespan: 9600,
    unlock: 1,
    weight: 1.0,
    stem: { min: 0.46, max: 0.66, width: 5.4, color: '#4f9a54', lean: 0.10, leaves: 2 },
    head: { type: 'cup', size: 30, petals: 6, colors: ['#f2542d', '#ff8a53', '#ffb37a'], alts: [
      ['#e94f7c', '#ff87ab', '#ffc0d4'], ['#f3c53f', '#ffdd7a', '#fff0bd'], ['#b34ee0', '#d78bf5', '#eec4fb'],
    ] },
    cut: { angle: 90, angleTol: 20, point: 0.34, pointTol: 0.17, speed: 'slow', pattern: 'straight' },
    hint: 'Soft hollow stem — one slow, straight cut across the middle.',
  },
  {
    id: 'daisy',
    name: 'Ox-eye Daisy',
    kind: 'flower',
    lifespan: 7600,
    unlock: 1,
    weight: 1.0,
    stem: { min: 0.34, max: 0.50, width: 3.0, color: '#5aa860', lean: 0.22, leaves: 1 },
    head: { type: 'disc', size: 24, petals: 13, colors: ['#fbfdf2', '#e7eede'], centre: '#ffd166' },
    cut: { angle: null, angleTol: 0, point: 0.55, pointTol: 0.24, speed: 'fast', pattern: 'straight' },
    hint: 'Wiry and forgiving — any angle, just snap it high and quick.',
  },
  {
    id: 'nettle',
    name: 'Stinging Nettle',
    kind: 'hazard',
    lifespan: 8200,
    unlock: 1,
    weight: 0.55,
    stem: { min: 0.36, max: 0.54, width: 4.4, color: '#3f6b3a', lean: 0.14, leaves: 0 },
    head: { type: 'nettle', size: 26, colors: ['#4b7d42', '#6f9c58', '#96b06f'] },
    cut: null,
    hint: 'Weed. Never cut it — three stings end the round.',
  },

  /* ── Round 2 ───────────────────────────────────────────────────────── */
  {
    id: 'fern',
    name: 'Fern Frond',
    kind: 'green',
    lifespan: 10500,
    unlock: 2,
    weight: 0.85,
    stem: { min: 0.40, max: 0.56, width: 3.6, color: '#3f7f45', lean: 0.30, leaves: 0 },
    head: { type: 'frond', size: 34, pairs: 8, colors: ['#4e9c56', '#6fbf73'] },
    cut: { angle: 90, angleTol: 26, point: 0.10, pointTol: 0.18, speed: 'steady', pattern: 'straight' },
    hint: 'Filler green — take it right down at the base for a long frond.',
  },

  /* ── Round 3: technique starts to matter ─────────────────────────── */
  {
    id: 'rose',
    name: 'Garden Rose',
    kind: 'flower',
    lifespan: 10200,
    unlock: 3,
    weight: 1.0,
    stem: { min: 0.52, max: 0.72, width: 6.4, color: '#3f7a44', lean: 0.08, leaves: 3, thorns: true },
    head: { type: 'rosette', size: 30, petals: 11, colors: ['#c62a55', '#e4436f', '#ff7ea3'], alts: [
      ['#d8542f', '#f47b45', '#ffb17a'], ['#c9b8d6', '#efe4f2', '#fdf7fb'], ['#b8143d', '#dc2b57', '#f4708f'],
    ] },
    cut: { angle: 45, angleTol: 15, point: 0.13, pointTol: 0.13, speed: 'steady', pattern: 'straight' },
    hint: 'Woody cane: a 45° slant low down so it can drink. Mind the thorns.',
  },

  /* ── Round 4 ───────────────────────────────────────────────────────── */
  {
    id: 'eucalyptus',
    name: 'Eucalyptus',
    kind: 'green',
    lifespan: 11000,
    unlock: 4,
    weight: 0.8,
    stem: { min: 0.44, max: 0.62, width: 4.2, color: '#7d9c86', lean: 0.26, leaves: 0 },
    head: { type: 'sprig', size: 30, pairs: 7, colors: ['#8fb9a8', '#b6d3c4', '#6f9c86'] },
    cut: { angle: 45, angleTol: 20, point: 0.16, pointTol: 0.16, speed: 'steady', pattern: 'arc' },
    hint: 'Bendy silver sprig — sweep the blade through it in a curve.',
  },

  /* ── Round 5: force and precision ─────────────────────────────────── */
  {
    id: 'sunflower',
    name: 'Sunflower',
    kind: 'flower',
    lifespan: 11500,
    unlock: 5,
    weight: 0.85,
    stem: { min: 0.58, max: 0.76, width: 9.0, color: '#5f8b3e', lean: 0.05, leaves: 2 },
    head: { type: 'disc', size: 42, petals: 19, colors: ['#ffc93c', '#ffab2e'], centre: '#5a3c1e' },
    cut: { angle: 90, angleTol: 22, point: 0.10, pointTol: 0.13, speed: 'fast', pattern: 'straight' },
    hint: 'Thick fibrous stalk — one fast, square chop at the bottom.',
  },

  /* ── Round 6 ───────────────────────────────────────────────────────── */
  {
    id: 'lavender',
    name: 'Lavender',
    kind: 'flower',
    lifespan: 8600,
    unlock: 6,
    weight: 0.95,
    stem: { min: 0.42, max: 0.58, width: 3.2, color: '#7f9a6b', lean: 0.18, leaves: 0 },
    head: { type: 'spike', size: 34, beads: 9, colors: ['#7b6ae0', '#a493ff', '#cfc4ff'] },
    cut: { angle: 30, angleTol: 15, point: 0.24, pointTol: 0.15, speed: 'fast', pattern: 'straight' },
    hint: 'Cut on a long shallow slant, fast, before the scent fades.',
  },

  /* ── Round 7: sawing ───────────────────────────────────────────────── */
  {
    id: 'pampas',
    name: 'Pampas Grass',
    kind: 'green',
    lifespan: 12000,
    unlock: 7,
    weight: 0.75,
    stem: { min: 0.56, max: 0.74, width: 4.0, color: '#a89b6d', lean: 0.20, leaves: 0 },
    head: { type: 'plume', size: 46, colors: ['#e6d3a3', '#f4e8c9', '#cbb98a'] },
    cut: { angle: 90, angleTol: 30, point: 0.09, pointTol: 0.16, speed: 'steady', pattern: 'zigzag' },
    hint: 'Tough and stringy — saw through it with a zigzag stroke.',
  },

  /* ── Round 8: a second, thornier weed ─────────────────────────────── */
  {
    id: 'bramble',
    name: 'Bramble',
    kind: 'hazard',
    lifespan: 9000,
    unlock: 8,
    weight: 0.5,
    stem: { min: 0.44, max: 0.64, width: 5.0, color: '#6a5170', lean: 0.32, leaves: 0, thorns: true },
    head: { type: 'bramble', size: 24, colors: ['#4b3a5c', '#7d6690', '#241a2e'] },
    cut: null,
    hint: 'Thorny runner. Leave it standing.',
  },

  /* ── Round 9: the curve ────────────────────────────────────────────── */
  {
    id: 'orchid',
    name: 'Orchid Spray',
    kind: 'flower',
    lifespan: 9200,
    unlock: 9,
    weight: 0.8,
    stem: { min: 0.50, max: 0.70, width: 3.4, color: '#5c8f63', lean: 0.34, leaves: 1 },
    head: { type: 'orchid', size: 26, blooms: 3, colors: ['#c084fc', '#e9b8ff', '#fbe3ff'], throat: '#f7c948' },
    cut: { angle: 60, angleTol: 14, point: 0.20, pointTol: 0.12, speed: 'slow', pattern: 'arc' },
    hint: 'Fragile arching cane — a slow, curving stroke or it shatters.',
  },

  /* ── Round 10: two strokes — the full field guide ─────────────────── */
  {
    id: 'hydrangea',
    name: 'Hydrangea',
    kind: 'flower',
    lifespan: 11800,
    unlock: 10,
    weight: 0.8,
    stem: { min: 0.48, max: 0.66, width: 7.4, color: '#4a7d4f', lean: 0.07, leaves: 2 },
    head: { type: 'pom', size: 38, florets: 15, colors: ['#7ec8e3', '#a5d8ff', '#cfe9ff'], alts: [
      ['#d98cb3', '#f0b6d0', '#fbdcea'], ['#9b8de0', '#bdb2f5', '#ded8fc'],
    ] },
    cut: { angle: 45, angleTol: 18, point: 0.14, pointTol: 0.13, speed: 'steady', pattern: 'cross' },
    hint: 'Woody: slice it, then split the stem with a second crossing stroke.',
  },
];

export const BY_ID = Object.fromEntries(SPECIES.map((s) => [s.id, s]));

/** Species available on a given round, weighted for the spawner. */
export function poolForRound(round) {
  const avail = SPECIES.filter((s) => s.unlock <= round);
  // Hazards ramp up so early rounds stay welcoming.
  return avail.map((s) => ({
    species: s,
    weight: s.kind === 'hazard'
      ? s.weight * Math.min(1, 0.45 + 0.2 * (round - s.unlock))
      : s.weight,
  }));
}

export function pickSpecies(pool, rng = Math.random) {
  const total = pool.reduce((n, p) => n + p.weight, 0);
  let r = rng() * total;
  for (const p of pool) {
    r -= p.weight;
    if (r <= 0) return p.species;
  }
  return pool[pool.length - 1].species;
}
