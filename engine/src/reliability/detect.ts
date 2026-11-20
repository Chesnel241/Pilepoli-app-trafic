import type { Anomaly, RatedDeparture } from '../types.ts';

/**
 * Détection d'anomalies en comparant deux relevés successifs d'un même arrêt.
 * Pas d'IA ici : des règles simples, vérifiables, qu'on affinera avec l'historique.
 */

/** Seuil à partir duquel un passage est considéré « en avance ». */
export const EARLY_MIN = 2;

export function detectAnomalies(
  stopRef: string,
  previous: RatedDeparture[] | undefined,
  current: RatedDeparture[],
  now: number = Date.now(),
): Anomaly[] {
  const at = new Date(now).toISOString();
  const out: Anomaly[] = [];

  // 1. Passage en avance : l'heure temps réel est nettement avant l'horaire prévu.
  for (const d of current) {
    if (!d.aimedAt || !d.expectedAt) continue;
    const early = (Date.parse(d.aimedAt) - Date.parse(d.expectedAt)) / 60000;
    if (early >= EARLY_MIN) {
      out.push({ kind: 'early', journeyRef: d.journeyRef, lineCode: d.lineCode, minutesEarly: Math.round(early), at });
    }
  }

  // 2. Course disparue : présente au relevé précédent, absente maintenant, alors qu'elle n'aurait pas dû passer.
  //    Ce n'est PAS une preuve de suppression : on la signale comme « à vérifier ».
  if (previous) {
    const ids = new Set(current.map((d) => d.journeyRef));
    for (const p of previous) {
      if (ids.has(p.journeyRef)) continue;
      const due = Date.parse(p.expectedAt ?? p.aimedAt ?? '');
      const stillUpcoming = !Number.isNaN(due) && due - now > 60_000;
      if (stillUpcoming) {
        out.push({ kind: 'vanished', journeyRef: p.journeyRef, lineCode: p.lineCode, aimedAt: p.aimedAt, at });
      }
    }
  }

  // 3. Flux figé : toutes les infos de l'arrêt sont anciennes.
  const ages = current.map((d) => d.ageSeconds).filter((a): a is number => a !== null);
  if (ages.length > 0 && Math.min(...ages) > 300) {
    out.push({ kind: 'stale_feed', stopRef, ageSeconds: Math.min(...ages), at });
  }

  return out;
}
