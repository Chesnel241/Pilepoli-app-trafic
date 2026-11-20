/**
 * Géométrie de base pour la navigation, sans dépendance : distances, caps, projection sur un tracé.
 * Coordonnées en [lon, lat]. Précision largement suffisante à l'échelle d'une ville.
 */
export type LonLat = [number, number];

const R = 6_371_000;
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

export function meters(a: LonLat, b: LonLat): number {
  const x = rad(b[0] - a[0]) * Math.cos(rad((a[1] + b[1]) / 2));
  const y = rad(b[1] - a[1]);
  return Math.hypot(x, y) * R;
}

/** Cap de a vers b, en degrés (0 = nord, 90 = est). */
export function bearing(a: LonLat, b: LonLat): number {
  const φ1 = rad(a[1]), φ2 = rad(b[1]), Δλ = rad(b[0] - a[0]);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

/** Écart signé le plus court entre deux angles, dans ]-180, 180]. */
export function angleDiff(to: number, from: number): number {
  let d = ((to - from) % 360 + 540) % 360 - 180;
  if (d === -180) d = 180;
  return d;
}

/** Longueurs cumulées d'un tracé. */
export function cumulative(path: LonLat[]): number[] {
  const out = [0];
  for (let i = 1; i < path.length; i++) out.push(out[i - 1] + meters(path[i - 1], path[i]));
  return out;
}

export interface Snap { point: LonLat; along: number; offset: number; seg: number }

/** Point du tracé le plus proche de p : position, distance parcourue depuis le début, écart latéral. */
export function snapTo(path: LonLat[], cum: number[], p: LonLat): Snap {
  let best: Snap = { point: path[0], along: 0, offset: Infinity, seg: 0 };
  const k = Math.cos(rad(p[1]));
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i];
    const ax = (a[0] - p[0]) * k, ay = a[1] - p[1];
    const bx = (b[0] - p[0]) * k, by = b[1] - p[1];
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const f = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
    const q: LonLat = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
    const off = meters(q, p);
    if (off < best.offset) best = { point: q, along: cum[i - 1] + (cum[i] - cum[i - 1]) * f, offset: off, seg: i - 1 };
  }
  return best;
}

/** Point situé à `along` mètres du début du tracé. */
export function pointAt(path: LonLat[], cum: number[], along: number): LonLat {
  if (along <= 0) return path[0];
  const total = cum[cum.length - 1];
  if (along >= total) return path[path.length - 1];
  let i = 1;
  while (i < cum.length && cum[i] < along) i++;
  const f = (along - cum[i - 1]) / Math.max(1e-9, cum[i] - cum[i - 1]);
  const a = path[i - 1], b = path[i];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
}
