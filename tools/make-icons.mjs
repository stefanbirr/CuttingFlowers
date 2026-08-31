/* Generates the PWA icon set from a small signed-distance scene, so the
   repo carries no binary source art. Run: node tools/make-icons.mjs */

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'icons');

/* ── Tiny raster with analytic anti-aliasing ─────────────────────── */

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

function canvas(size) {
  return { size, px: new Float32Array(size * size * 3) };
}

function fillBackground(c, inner, outer) {
  const { size, px } = c;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size - 0.5, v = (y + 0.5) / size - 0.5;
      const d = clamp(Math.hypot(u, v) / 0.72, 0, 1);
      const i = (y * size + x) * 3;
      for (let k = 0; k < 3; k++) px[i + k] = inner[k] + (outer[k] - inner[k]) * d * d;
    }
  }
}

/** Paint a shape given a signed-distance function in 0..1 space. */
function paint(c, sdf, color, alpha = 1, softness = 1) {
  const { size, px } = c;
  const feather = softness / size;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size, v = (y + 0.5) / size;
      const d = sdf(u, v);
      if (d > feather) continue;
      const cov = clamp(0.5 - d / (2 * feather), 0, 1) * alpha;
      if (cov <= 0) continue;
      const i = (y * size + x) * 3;
      for (let k = 0; k < 3; k++) px[i + k] += (color[k] - px[i + k]) * cov;
    }
  }
}

const circle = (cx, cy, r) => (x, y) => Math.hypot(x - cx, y - cy) - r;

const segment = (x0, y0, x1, y1, w) => (x, y) => {
  const dx = x1 - x0, dy = y1 - y0;
  const t = clamp(((x - x0) * dx + (y - y0) * dy) / (dx * dx + dy * dy || 1), 0, 1);
  return Math.hypot(x - (x0 + dx * t), y - (y0 + dy * t)) - w / 2;
};

const ellipse = (cx, cy, rx, ry, rot) => (x, y) => {
  const co = Math.cos(-rot), si = Math.sin(-rot);
  const px = (x - cx) * co - (y - cy) * si;
  const py = (x - cx) * si + (y - cy) * co;
  const k = Math.hypot(px / rx, py / ry);
  return (k - 1) * Math.min(rx, ry);
};

/* ── The mark: a bloom with a blade streak through the stem ──────── */

function scene(size, { pad = 0 } = {}) {
  const c = canvas(size);
  fillBackground(c, [0.13, 0.20, 0.15], [0.05, 0.09, 0.06]);

  // Map design space into a padded box (maskable icons need a safe zone).
  const s = 1 - pad * 2;
  const M = (x, y) => [pad + x * s, pad + y * s];
  const sd = (fn) => (x, y) => fn((x - pad) / s, (y - pad) / s) * s;

  // Soft light behind the bloom
  paint(c, sd(circle(0.5, 0.4, 0.34)), [0.22, 0.34, 0.24], 0.55, 26);

  // Stem and leaf
  paint(c, sd(segment(0.47, 0.90, 0.5, 0.5, 0.055)), [0.24, 0.52, 0.28]);
  paint(c, sd(ellipse(0.34, 0.83, 0.13, 0.055, -0.40)), [0.30, 0.62, 0.34]);
  paint(c, sd(ellipse(0.64, 0.88, 0.11, 0.048, 0.38)), [0.26, 0.55, 0.30]);

  // Petals
  const petals = 6;
  for (let i = 0; i < petals; i++) {
    const a = (i / petals) * Math.PI * 2 - Math.PI / 2;
    const cx = 0.5 + Math.cos(a) * 0.115;
    const cy = 0.40 + Math.sin(a) * 0.115;
    const tint = i % 2 ? [1.0, 0.55, 0.70] : [0.90, 0.33, 0.52];
    paint(c, sd(ellipse(cx, cy, 0.105, 0.075, a)), tint);
  }
  paint(c, sd(circle(0.5, 0.40, 0.068)), [1.0, 0.83, 0.47]);
  paint(c, sd(circle(0.485, 0.385, 0.030)), [1.0, 0.93, 0.72], 0.8);

  // Blade streak through the stem — wide glow, bright core.
  paint(c, sd(segment(0.09, 0.83, 0.91, 0.53, 0.12)), [0.72, 0.95, 0.80], 0.20, 12);
  paint(c, sd(segment(0.12, 0.82, 0.88, 0.54, 0.028)), [0.95, 1.0, 0.96], 0.95);
  paint(c, sd(circle(0.88, 0.54, 0.028)), [1.0, 1.0, 1.0], 0.9);

  return c;
}

/* ── PNG encoding ────────────────────────────────────────────────── */

const CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(c) {
  const { size, px } = c;
  const raw = Buffer.alloc(size * (size * 3 + 1));
  let o = 0;
  for (let y = 0; y < size; y++) {
    raw[o++] = 0;
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 3;
      for (let k = 0; k < 3; k++) raw[o++] = Math.round(clamp(px[i + k], 0, 1) * 255);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ── Go ──────────────────────────────────────────────────────────── */

mkdirSync(OUT, { recursive: true });
const jobs = [
  ['icon-192.png', 192, 0.06],
  ['icon-512.png', 512, 0.06],
  ['icon-maskable-192.png', 192, 0.19],
  ['icon-maskable-512.png', 512, 0.19],
  ['apple-touch-icon.png', 180, 0.08],
  ['favicon-32.png', 32, 0.04],
];
for (const [name, size, pad] of jobs) {
  writeFileSync(join(OUT, name), encodePng(scene(size, { pad })));
  console.log('wrote', name, `${size}×${size}`);
}
