import type { Journey, LegMode } from './types';

/**
 * Géométrie du trajet pour la carte : un tracé horodaté, pour savoir où l'on est
 * à un instant donné (d'après les horaires), et pour recaler sur le GPS quand il est fiable.
 */
export type LonLat = [number, number];

export interface RouteSegment {
  mode: LegMode;
  color: string;
  points: LonLat[];
}

/** Un point du tracé, avec l'heure prévue de passage et la distance depuis le départ (m). */
interface TimedPoint { p: LonLat; t: number; d: number }

export interface Route {
  segments: RouteSegment[];
  timeline: TimedPoint[];
  length: number;
  bounds: { minLon: number; maxLon: number; minLat: number; maxLat: number };
}

const R = 6_371_000;
/** Distance approchée en mètres (suffisante à l'échelle d'une ville). */
export function meters(a: LonLat, b: LonLat): number {
  const x = ((b[0] - a[0]) * Math.PI / 180) * Math.cos(((a[1] + b[1]) / 2) * Math.PI / 180);
  const y = (b[1] - a[1]) * Math.PI / 180;
  return Math.hypot(x, y) * R;
}

function legPoints(leg: Journey['legs'][number]): LonLat[] {
  if (leg.path && leg.path.length >= 2) return leg.path;
  const fromStops = leg.stops.filter((s) => s.lat !== undefined && s.lon !== undefined).map((s) => [s.lon!, s.lat!] as LonLat);
  return fromStops.length >= 2 ? fromStops : [];
}

export function buildRoute(j: Journey): Route | null {
  const segments: RouteSegment[] = [];
  const timeline: TimedPoint[] = [];
  let dist = 0;
  for (const leg of j.legs) {
    const pts = legPoints(leg);
    if (pts.length < 2) continue;
    segments.push({ mode: leg.mode, color: leg.mode === 'walk' ? '#0E0F12' : leg.lineColor, points: pts });
    // Heure de passage répartie le long du tronçon, au prorata de la distance.
    const t0 = Date.parse(leg.departureAt), t1 = Date.parse(leg.arrivalAt);
    const lens = pts.slice(1).map((p, i) => meters(pts[i], p));
    const total = lens.reduce((a, b) => a + b, 0) || 1;
    let acc = 0;
    pts.forEach((p, i) => {
      if (i > 0) acc += lens[i - 1];
      timeline.push({ p, t: t0 + (t1 - t0) * (acc / total), d: dist + acc });
    });
    dist += total;
  }
  if (segments.length === 0) return null;
  const all = segments.flatMap((s) => s.points);
  return {
    segments, timeline, length: dist,
    bounds: {
      minLon: Math.min(...all.map((p) => p[0])), maxLon: Math.max(...all.map((p) => p[0])),
      minLat: Math.min(...all.map((p) => p[1])), maxLat: Math.max(...all.map((p) => p[1])),
    },
  };
}

/** Position prévue à l'instant `now`, d'après les horaires : point et part du trajet faite (0 à 1). */
export function estimatedAt(route: Route, now: number): { p: LonLat; fraction: number } {
  const tl = route.timeline;
  if (now <= tl[0].t) return { p: tl[0].p, fraction: 0 };
  const last = tl[tl.length - 1];
  if (now >= last.t) return { p: last.p, fraction: 1 };
  let i = 1;
  while (i < tl.length && tl[i].t < now) i++;
  const a = tl[i - 1], b = tl[i];
  const f = b.t === a.t ? 1 : (now - a.t) / (b.t - a.t);
  const p: LonLat = [a.p[0] + (b.p[0] - a.p[0]) * f, a.p[1] + (b.p[1] - a.p[1]) * f];
  return { p, fraction: (a.d + (b.d - a.d) * f) / (route.length || 1) };
}

/** Recale une position GPS sur le tracé : point le plus proche, écart en mètres, part du trajet faite. */
export function snap(route: Route, gps: LonLat): { p: LonLat; offset: number; fraction: number } {
  const tl = route.timeline;
  let best = { p: tl[0].p, offset: Infinity, fraction: 0 };
  for (let i = 1; i < tl.length; i++) {
    const a = tl[i - 1], b = tl[i];
    // Projection plane locale, en mètres.
    const ax = 0, ay = 0;
    const bx = meters([a.p[0], a.p[1]], [b.p[0], a.p[1]]) * Math.sign(b.p[0] - a.p[0]);
    const by = meters([a.p[0], a.p[1]], [a.p[0], b.p[1]]) * Math.sign(b.p[1] - a.p[1]);
    const gx = meters([a.p[0], a.p[1]], [gps[0], a.p[1]]) * Math.sign(gps[0] - a.p[0]);
    const gy = meters([a.p[0], a.p[1]], [a.p[0], gps[1]]) * Math.sign(gps[1] - a.p[1]);
    const len2 = (bx - ax) ** 2 + (by - ay) ** 2;
    const f = len2 === 0 ? 0 : Math.max(0, Math.min(1, (gx * bx + gy * by) / len2));
    const off = Math.hypot(gx - f * bx, gy - f * by);
    if (off < best.offset) {
      const p: LonLat = [a.p[0] + (b.p[0] - a.p[0]) * f, a.p[1] + (b.p[1] - a.p[1]) * f];
      best = { p, offset: off, fraction: (a.d + (b.d - a.d) * f) / (route.length || 1) };
    }
  }
  return best;
}

/** Projection simple (équirectangulaire corrigée) dans un rectangle w × h, avec une marge. */
export function projector(route: Route, w: number, h: number, pad = 14) {
  const { minLon, maxLon, minLat, maxLat } = route.bounds;
  const kx = Math.cos(((minLat + maxLat) / 2) * Math.PI / 180);
  const realX = (maxLon - minLon) * kx, realY = maxLat - minLat;
  // Échelle bornée : un trajet très court n'est pas zoomé à l'extrême.
  const scale = Math.min((w - 2 * pad) / Math.max(realX, 0.002), (h - 2 * pad) / Math.max(realY, 0.002));
  const ox = (w - realX * scale) / 2, oy = (h - realY * scale) / 2;
  return (p: LonLat): [number, number] => [
    ox + ((p[0] - minLon) * kx) * scale,
    h - (oy + (p[1] - minLat) * scale),
  ];
}
