import { bearing, cumulative, meters, pointAt, snapTo, type LonLat } from './geo';
import type { JourneyLeg } from './types';

/**
 * Le guidage à pied, en fonctions pures (testables) : où en est-on sur le chemin, quel est le prochain virage,
 * vers où pointer la flèche, est-on sorti du chemin, est-on arrivé.
 */
export interface Turn { along: number; name: string; turn: number }

export interface WalkPlan {
  path: LonLat[];
  cum: number[];
  length: number;
  turns: Turn[];
  to: string;
  end: LonLat;
}

export type TurnKind = 'straight' | 'slightLeft' | 'left' | 'sharpLeft' | 'slightRight' | 'right' | 'sharpRight' | 'uturn';

export function turnKind(turn: number): TurnKind {
  const a = Math.abs(turn);
  if (a < 25) return 'straight';
  if (a >= 160) return 'uturn';
  const side = turn < 0 ? 'Left' : 'Right';
  if (a < 60) return `slight${side}` as TurnKind;
  if (a < 135) return side === 'Left' ? 'left' : 'right';
  return `sharp${side}` as TurnKind;
}

export function walkPlan(leg: Pick<JourneyLeg, 'path' | 'walk' | 'to' | 'length'>): WalkPlan | null {
  const path = leg.path;
  if (!path || path.length < 2) return null;
  const cum = cumulative(path);
  const length = cum[cum.length - 1];
  const turns: Turn[] = [];
  const items = leg.walk ?? [];
  // Position de chaque consigne sur le tracé : par sa coordonnée si on l'a, sinon par les longueurs cumulées.
  const declared = items.reduce((a, w) => a + w.length, 0) || length;
  let acc = 0;
  for (const w of items) {
    const along = w.at ? snapTo(path, cum, w.at).along : (acc / declared) * length;
    turns.push({ along, name: w.name, turn: w.turn });
    acc += w.length;
  }
  return { path, cum, length, turns, to: leg.to, end: path[path.length - 1] };
}

export interface WalkStatus {
  along: number;
  remaining: number;
  offset: number;
  onRoute: boolean;
  arrived: boolean;
  /** Rue en cours. */
  street?: string;
  /** Prochain vrai virage (along = position absolue sur le chemin, angle = virage signé). */
  next?: { inMeters: number; kind: TurnKind; name: string; along: number; angle: number };
  /** Le virage d'après, s'il arrive moins de 60 m après le prochain (« Puis à droite »). */
  after?: { kind: TurnKind; gap: number };
  /** Cap vers lequel marcher maintenant (point du chemin ~25 m devant). */
  heading: number;
}

/** Écart au-delà duquel on considère que tu es sorti du chemin (en tenant compte de la précision GPS). */
export const OFF_ROUTE_M = 40;

export function walkStatus(plan: WalkPlan, p: LonLat, accuracy: number | null, prevAlong = 0): WalkStatus {
  const snap = snapTo(plan.path, plan.cum, p);
  // On ne recule pas à cause d'un saut du GPS : on accepte un petit recul seulement.
  const along = snap.along < prevAlong - 25 ? snap.along : Math.max(snap.along, prevAlong - 5);
  const remaining = Math.max(0, plan.length - along);
  const tolerance = Math.max(OFF_ROUTE_M, Math.min(80, (accuracy ?? 20) * 1.2));
  const distEnd = meters(p, plan.end);
  const arrived = distEnd < Math.max(20, Math.min(40, accuracy ?? 20)) || (remaining < 15 && snap.offset < tolerance);
  const current = [...plan.turns].reverse().find((t) => t.along <= along + 5);
  const nextTurn = plan.turns.find((t) => t.along > along + 5 && Math.abs(t.turn) >= 25);
  const afterTurn = nextTurn ? plan.turns.find((t) => t.along > nextTurn.along + 3 && Math.abs(t.turn) >= 25) : undefined;
  // Cap : vers un point du chemin un peu devant ; si on est loin du chemin, droit vers le chemin.
  const ahead = snap.offset > tolerance ? snap.point : pointAt(plan.path, plan.cum, Math.min(plan.length, along + 25));
  return {
    along, remaining, offset: snap.offset, onRoute: snap.offset <= tolerance, arrived,
    street: current?.name || undefined,
    next: nextTurn ? { inMeters: Math.max(0, Math.round(nextTurn.along - along)), kind: turnKind(nextTurn.turn), name: nextTurn.name, along: nextTurn.along, angle: nextTurn.turn } : undefined,
    after: nextTurn && afterTurn && afterTurn.along - nextTurn.along < 60 ? { kind: turnKind(afterTurn.turn), gap: Math.round(afterTurn.along - nextTurn.along) } : undefined,
    heading: bearing(p, ahead),
  };
}

/** Durée de marche restante, à 1,25 m/s (allure moyenne en ville, feux compris). */
export const walkMinutes = (m: number) => Math.max(1, Math.round(m / 1.25 / 60));

/** Arrondi lisible en marchant : par 10 m au-dessus de 100 m, par 5 m de 30 à 100 m, au mètre en dessous. */
export function roundWalk(m: number): number {
  if (m > 100) return Math.round(m / 10) * 10;
  if (m >= 30) return Math.round(m / 5) * 5;
  return Math.max(0, Math.round(m));
}

/** Angle de pliage de la tête de flèche pour un type de virage. */
export const bendOf: Record<TurnKind, number> = {
  straight: 0, slightLeft: -35, left: -90, sharpLeft: -135, slightRight: 35, right: 90, sharpRight: 135, uturn: 180,
};
