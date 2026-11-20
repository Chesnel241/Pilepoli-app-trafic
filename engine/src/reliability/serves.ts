import type { DirectRide } from '../sources/prim.ts';
import type { RatedDeparture } from '../types.ts';

/**
 * « Ce passage s'arrête-t-il à ma gare ? »
 * On croise les passages temps réel (SIRI) avec les trajets directs du calculateur (Navitia),
 * qui ne contiennent que les trains et bus qui desservent vraiment la destination.
 *
 * Règles, de la plus sûre à la moins sûre :
 * - même ligne, même code mission, heure à 2 min près  → yes (confirmé)
 * - même ligne, heure à 2 min près, pas de mission     → probable
 * - code mission connu mais absent des missions qui y vont → no
 * - autre direction (sens inverse, autre branche)     → no
 * - sinon                                             → unknown (on le dit, on ne devine pas)
 */
const WINDOW_MS = 2 * 60_000;

/** « Mairie d'Ivry (Ivry-sur-Seine) » → « mairie d ivry » : pour comparer des noms de terminus. */
export const normName = (s: string) => s
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/\(.*?\)/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const sameName = (a: string, b: string) => {
  const x = normName(a), y = normName(b);
  return !!x && !!y && (x === y || x.includes(y) || y.includes(x));
};

const isMission = (v?: string) => !!v && /^[A-Z]{4}$/.test(v);

export function annotateServes(deps: RatedDeparture[], rides: DirectRide[]): RatedDeparture[] {
  return deps.map((d) => ({ ...d, serves: servesOf(d, rides) }));
}

export function servesOf(d: RatedDeparture, rides: DirectRide[]): NonNullable<RatedDeparture['serves']> {
  if (rides.length === 0) return 'unknown';
  const line = rides.filter((r) => r.lineCode.toLowerCase() === d.lineCode.toLowerCase());
  if (line.length === 0) return 'no'; // cette ligne ne mène pas directement à ta gare
  const t = Date.parse(d.expectedAt ?? d.aimedAt ?? '');
  const missions = new Set(line.map((r) => r.mission).filter(isMission));

  if (isMission(d.mission) && missions.size > 0 && !missions.has(d.mission!)) return 'no';

  const near = Number.isNaN(t) ? [] : line
    .map((r) => ({ r, gap: Math.abs(Date.parse(r.departureAt) - t) }))
    .filter((x) => x.gap <= WINDOW_MS)
    .sort((a, b) => a.gap - b.gap);
  if (near.length) {
    const sameMission = isMission(d.mission) && near.some((x) => x.r.mission === d.mission);
    return sameMission ? 'yes' : 'probable';
  }

  // Pas d'horaire concordant : si ce passage va dans une autre direction que tous ceux qui desservent ta gare,
  // c'est le sens inverse ou l'autre branche.
  const goodDirections = line.map((r) => r.direction).filter(Boolean);
  if (goodDirections.length && !goodDirections.some((dir) => sameName(dir, d.destination) || (d.direction && sameName(dir, d.direction)))) return 'no';
  if (isMission(d.mission) && missions.has(d.mission!)) return 'probable';
  return 'unknown';
}
