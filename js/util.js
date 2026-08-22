/* Small maths + geometry helpers shared across the game. */

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => (b === a ? 0 : (v - a) / (b - a));
export const smoothstep = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
export const rand = (a = 1, b = 0) => b + Math.random() * (a - b);
export const randInt = (a, b) => Math.floor(rand(b + 1, a));
export const choice = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const TAU = Math.PI * 2;

/** 1 at zero error, falling to ~0.1 at `tol`, tail beyond. */
export function tolScore(err, tol) {
  if (tol <= 0) return err === 0 ? 1 : 0;
  const x = Math.abs(err) / tol;
  return Math.exp(-2.3 * x * x);
}

/** Quadratic bezier point. */
export function qPoint(p0, p1, p2, t) {
  const u = 1 - t;
  return {
    x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
    y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
  };
}

/** Quadratic bezier tangent (not normalised). */
export function qTangent(p0, p1, p2, t) {
  const u = 1 - t;
  return {
    x: 2 * u * (p1.x - p0.x) + 2 * t * (p2.x - p1.x),
    y: 2 * u * (p1.y - p0.y) + 2 * t * (p2.y - p1.y),
  };
}

/** Segment/segment intersection. Returns {x, y, t, u} or null. */
export function segIntersect(a1, a2, b1, b2) {
  const rx = a2.x - a1.x, ry = a2.y - a1.y;
  const sx = b2.x - b1.x, sy = b2.y - b1.y;
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-9) return null;
  const qpx = b1.x - a1.x, qpy = b1.y - a1.y;
  const t = (qpx * sy - qpy * sx) / den;
  const u = (qpx * ry - qpy * rx) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { x: a1.x + t * rx, y: a1.y + t * ry, t, u };
}

/** Smallest angle in [0,90] between two undirected lines given as vectors. */
export function lineAngleBetween(ax, ay, bx, by) {
  const a = Math.atan2(ay, ax);
  const b = Math.atan2(by, bx);
  let d = Math.abs(a - b) % Math.PI;
  if (d > Math.PI / 2) d = Math.PI - d;
  return (d * 180) / Math.PI;
}

/** Signed turn from vector a to vector b, in radians, wrapped to ±π. */
export function turnBetween(ax, ay, bx, by) {
  let d = Math.atan2(by, bx) - Math.atan2(ay, ax);
  while (d > Math.PI) d -= TAU;
  while (d < -Math.PI) d += TAU;
  return d;
}

/** Resample a polyline to roughly even spacing. */
export function resample(points, step) {
  if (points.length < 2) return points.slice();
  const out = [points[0]];
  let carry = 0;
  for (let i = 1; i < points.length; i++) {
    const a = out[out.length - 1], b = points[i];
    let dx = b.x - a.x, dy = b.y - a.y;
    let dist = Math.hypot(dx, dy) + carry;
    if (dist < step) { carry = dist; continue; }
    carry = 0;
    out.push(b);
  }
  if (out[out.length - 1] !== points[points.length - 1]) out.push(points[points.length - 1]);
  return out;
}

/** Deterministic 0..1 hash — handy for stable per-entity jitter. */
export function hash01(n) {
  const x = Math.sin(n * 127.1) * 43758.5453;
  return x - Math.floor(x);
}

/* ── Colour ───────────────────────────────────────────────────────── */

/* Each helper accepts '#rgb', '#rrggbb', 'rgb(…)' or 'rgba(…)' and returns
   a css string, so results can be fed back through them without anyone
   having to track which format a colour is currently in. */

function parseColor(c) {
  if (typeof c !== 'string') return { r: 0, g: 0, b: 0, a: 1 };
  if (c[0] === '#') {
    let hex = c.slice(1);
    if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    const n = parseInt(hex, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 };
  }
  const m = c.match(/-?[\d.]+/g);
  if (!m || m.length < 3) return { r: 0, g: 0, b: 0, a: 1 };
  return { r: +m[0], g: +m[1], b: +m[2], a: m[3] === undefined ? 1 : +m[3] };
}

const css = (r, g, b, a = 1) => (a >= 1
  ? `rgb(${r | 0},${g | 0},${b | 0})`
  : `rgba(${r | 0},${g | 0},${b | 0},${a})`);

export function shade(c, amt) {
  const { r, g, b, a } = parseColor(c);
  return css(clamp(r + amt, 0, 255), clamp(g + amt, 0, 255), clamp(b + amt, 0, 255), a);
}

export function withAlpha(c, a) {
  const { r, g, b } = parseColor(c);
  return `rgba(${r | 0},${g | 0},${b | 0},${a})`;
}

export function mix(a, b, t) {
  const pa = parseColor(a), pb = parseColor(b);
  return css(lerp(pa.r, pb.r, t), lerp(pa.g, pb.g, t), lerp(pa.b, pb.b, t), lerp(pa.a, pb.a, t));
}

/** Slide a colour toward its own grey. 0 = untouched, 1 = fully greyscale. */
export function desaturate(c, amount) {
  const { r, g, b, a } = parseColor(c);
  const y = 0.299 * r + 0.587 * g + 0.114 * b;
  return css(lerp(r, y, amount), lerp(g, y, amount), lerp(b, y, amount), a);
}
