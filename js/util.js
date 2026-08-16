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

export function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = clamp(((n >> 16) & 255) + amt, 0, 255);
  const g = clamp(((n >> 8) & 255) + amt, 0, 255);
  const b = clamp((n & 255) + amt, 0, 255);
  return `rgb(${r|0},${g|0},${b|0})`;
}

export function withAlpha(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
