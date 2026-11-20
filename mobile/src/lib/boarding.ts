import { useEffect, useState } from 'react';
import { fetchDepartures, stopRefOf } from './api';
import type { DirectRide, JourneyLeg, RatedDeparture } from './types';

/**
 * « Ton train » : parmi les passages en direct à ta gare de départ, lequel est le tien,
 * lequel est le piège (même ligne, mais il ne s'arrête pas à ta gare), et le suivant si tu rates le tien.
 */
export interface Boarding {
  mine?: RatedDeparture;
  /** Passe avant le tien sur la même ligne et ne s'arrête pas à ta gare. */
  trap?: RatedDeparture;
  /** Le suivant qui s'arrête aussi à ta gare. */
  next?: { at: string; mission?: string };
  /** MONTE : le tien est à quai. ATTENDS : le piège est à quai, le tien arrive après. */
  action?: 'board' | 'wait';
  loadedAt?: number;
}

const goes = (d: RatedDeparture) => d.serves === 'yes' || d.serves === 'probable';
const timeOf = (d: RatedDeparture) => Date.parse(d.expectedAt ?? d.aimedAt ?? '');

export function pickBoarding(leg: JourneyLeg, deps: RatedDeparture[], direct: DirectRide[] = [], now = Date.now()): Boarding {
  const same = deps.filter((d) => d.lineCode.toLowerCase() === leg.lineCode.toLowerCase()).sort((a, b) => timeOf(a) - timeOf(b));
  const planned = Date.parse(leg.departureAt);
  // Le tien : celui que le calcul d'itinéraire a choisi (même mission, heure proche), sinon le prochain qui va à ta gare.
  const byPlan = same
    .filter((d) => goes(d) || d.serves === undefined)
    .filter((d) => Math.abs(timeOf(d) - planned) <= 3 * 60_000)
    .sort((a, b) => Number(b.mission === leg.mission) - Number(a.mission === leg.mission) || Math.abs(timeOf(a) - planned) - Math.abs(timeOf(b) - planned))[0];
  const mine = byPlan ?? same.find((d) => goes(d) && timeOf(d) >= now - 60_000);
  const mineAt = mine ? timeOf(mine) : Infinity;
  const trap = same.find((d) => d.serves === 'no' && timeOf(d) < mineAt && timeOf(d) >= now - 60_000 && (d.minutes ?? 99) <= 15);
  const nextDep = same.find((d) => goes(d) && timeOf(d) > mineAt + 30_000);
  const nextRide = direct.find((r) => r.lineCode.toLowerCase() === leg.lineCode.toLowerCase() && Date.parse(r.departureAt) > mineAt + 30_000);
  const next = nextDep
    ? { at: nextDep.expectedAt ?? nextDep.aimedAt ?? '', mission: nextDep.mission }
    : nextRide ? { at: nextRide.departureAt, mission: nextRide.mission } : undefined;
  const atPlatform = (d?: RatedDeparture) => !!d && (d.vehicleAtStop || (d.minutes ?? 99) <= 0);
  const action = atPlatform(mine) ? 'board' : atPlatform(trap) ? 'wait' : undefined;
  return { mine, trap, next, action, loadedAt: now };
}

/** Suit en direct le tronçon à prendre (toutes les 20 s), tant que `active` est vrai. */
export function useBoarding(leg: JourneyLeg | undefined, active: boolean): Boarding | null {
  const [b, setB] = useState<Boarding | null>(null);
  useEffect(() => {
    setB(null);
    if (!leg || !active || !leg.fromId || !leg.toId) return;
    let alive = true;
    const load = async () => {
      const snap = await fetchDepartures(stopRefOf(leg.fromId!), leg.toId);
      if (!alive || snap.source === 'offline') return;
      setB(pickBoarding(leg, snap.departures, snap.direct));
    };
    load();
    const id = setInterval(load, 20_000);
    return () => { alive = false; clearInterval(id); };
  }, [leg?.fromId, leg?.toId, leg?.departureAt, active]);
  return b;
}
