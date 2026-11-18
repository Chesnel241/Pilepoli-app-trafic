import type { Departure, RatedDeparture, Reliability } from '../types.ts';

/**
 * Seuils de fraîcheur, en secondes.
 * Au-delà de DIRECT_MAX on ne dit plus « en direct » ; au-delà d'ESTIME_MAX on dit « pas vu ».
 * Ces valeurs sont un point de départ : elles seront ajustées ligne par ligne avec l'historique.
 */
export const DIRECT_MAX = 60;
export const ESTIME_MAX = 180;

const CANCELLED = new Set(['cancelled', 'canceled']);

const ms = (iso: string | null | undefined): number | null => {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
};

/** Classe un passage selon la fraîcheur de son info. Fonction pure, testable. */
export function classify(dep: Departure, now: number): { reliability: Reliability; ageSeconds: number | null } {
  if (dep.operatorStatus && CANCELLED.has(dep.operatorStatus.toLowerCase())) {
    return { reliability: 'supprime', ageSeconds: ageOf(dep, now) };
  }
  if (!dep.expectedAt) {
    return { reliability: 'theorique', ageSeconds: ageOf(dep, now) };
  }
  const age = ageOf(dep, now);
  if (age === null) return { reliability: 'estime', ageSeconds: null };
  if (age <= DIRECT_MAX) return { reliability: 'direct', ageSeconds: age };
  if (age <= ESTIME_MAX) return { reliability: 'estime', ageSeconds: age };
  return { reliability: 'pas_vu', ageSeconds: age };
}

function ageOf(dep: Departure, now: number): number | null {
  const rec = ms(dep.recordedAt);
  if (rec === null) return null;
  return Math.max(0, Math.round((now - rec) / 1000));
}

/**
 * Fourchette honnête autour de l'heure annoncée.
 * Plus l'info est vieille, plus la fourchette s'élargit (1 min de plus par minute d'ancienneté, plafonnée).
 */
export function uncertaintyRange(minutes: number, reliability: Reliability, ageSeconds: number | null) {
  if (reliability === 'supprime') return null;
  let spread: number;
  switch (reliability) {
    case 'direct':
      spread = 0.5;
      break;
    case 'estime':
      spread = 1 + (ageSeconds ?? 120) / 120;
      break;
    case 'pas_vu':
      spread = Math.min(2 + (ageSeconds ?? 300) / 60, 10);
      break;
    default:
      spread = 3; // horaire théorique seul : on reste prudent
  }
  return { min: Math.max(0, Math.round(minutes - spread)), max: Math.round(minutes + spread) };
}

export function labelFor(reliability: Reliability, ageSeconds: number | null): string {
  switch (reliability) {
    case 'direct':
      return 'En direct';
    case 'estime':
      return 'Estimé';
    case 'pas_vu':
      return ageSeconds ? `Pas vu depuis ${Math.round(ageSeconds / 60)} min` : 'Pas vu';
    case 'theorique':
      return 'Horaire prévu';
    case 'supprime':
      return 'Supprimé';
  }
}

export function rate(dep: Departure, now: number = Date.now()): RatedDeparture {
  const { reliability, ageSeconds } = classify(dep, now);
  const best = ms(dep.expectedAt) ?? ms(dep.aimedAt);
  const minutes = best === null ? null : Math.max(0, Math.round((best - now) / 60000));
  return {
    ...dep,
    reliability,
    ageSeconds,
    minutes,
    range: minutes === null ? null : uncertaintyRange(minutes, reliability, ageSeconds),
    label: labelFor(reliability, ageSeconds),
  };
}

const ORDER: Reliability[] = ['direct', 'estime', 'theorique', 'pas_vu', 'supprime'];

/** Le maillon le plus faible donne la fiabilité d'un trajet. */
export function weakest(list: Reliability[]): Reliability {
  return list.reduce<Reliability>((acc, r) => (ORDER.indexOf(r) > ORDER.indexOf(acc) ? r : acc), 'direct');
}
