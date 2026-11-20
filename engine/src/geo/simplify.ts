/**
 * Simplification de tracés (Ramer-Douglas-Peucker), pour envoyer au téléphone
 * une forme fidèle mais légère : quelques dizaines de points par tronçon au lieu de centaines.
 * Coordonnées en [lon, lat], arrondies à 5 décimales (~1 m).
 */
export type LonLat = [number, number];

function perpDist(p: LonLat, a: LonLat, b: LonLat): number {
  const [x, y] = p, [x1, y1] = a, [x2, y2] = b;
  const dx = x2 - x1, dy = y2 - y1;
  if (dx === 0 && dy === 0) return Math.hypot(x - x1, y - y1);
  const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy));
}

function rdp(points: LonLat[], eps: number): LonLat[] {
  if (points.length < 3) return points;
  let max = 0, idx = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const d = perpDist(points[i], points[0], points[points.length - 1]);
    if (d > max) { max = d; idx = i; }
  }
  if (max <= eps) return [points[0], points[points.length - 1]];
  return [...rdp(points.slice(0, idx + 1), eps).slice(0, -1), ...rdp(points.slice(idx), eps)];
}

const round = (v: number) => Math.round(v * 1e5) / 1e5;

/** Tracé propre et borné : jamais plus de `max` points. */
export function simplify(raw: unknown, max = 60): LonLat[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const pts = raw
    .filter((p): p is [number, number] => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]))
    .map((p) => [round(Number(p[0])), round(Number(p[1]))] as LonLat);
  if (pts.length < 2) return undefined;
  let eps = 0.00012; // ~10 m
  let out = rdp(pts, eps);
  while (out.length > max && eps < 0.01) { eps *= 2; out = rdp(pts, eps); }
  return out;
}

export function coordOf(c: any): { lat: number; lon: number } | undefined {
  const lat = Number(c?.lat), lon = Number(c?.lon);
  return Number.isFinite(lat) && Number.isFinite(lon) && (lat !== 0 || lon !== 0) ? { lat: round(lat), lon: round(lon) } : undefined;
}
