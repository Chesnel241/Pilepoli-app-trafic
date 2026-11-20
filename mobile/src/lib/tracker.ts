import { cumulative, meters, snapTo, type LonLat } from './geo';
import { walkPlan, walkStatus, type WalkPlan } from './walk';
import type { Journey, JourneyLeg } from './types';

/**
 * Le suivi réel du trajet. Règle d'or : le trajet n'avance que sur preuve.
 * - À pied : la position GPS sur le chemin ; arrivée quand on est vraiment à la gare.
 * - Sur le quai : on attend tant qu'on n'a pas la preuve qu'on est monté (on s'éloigne vite le long de la ligne,
 *   ou le signal disparaît dans le souterrain après l'heure réelle de départ).
 * - À bord : la position GPS le long de la ligne quand on l'a (surface), sinon les horaires DÉCALÉS sur l'heure réelle
 *   de montée, et c'est dit à l'écran (« estimé »).
 * Fonctions pures : testées sans téléphone.
 */
export interface RideStop { name: string; at: number; p?: LonLat; along: number }

export type Step =
  | { kind: 'walk'; leg: JourneyLeg; plan: WalkPlan | null; scheduledEnd: number }
  | { kind: 'ride'; leg: JourneyLeg; path: LonLat[]; cum: number[]; stops: RideStop[] };

export interface Fix { p: LonLat; accuracy: number | null; speed: number | null; at: number }

export interface Track {
  step: number;
  sub: 'walk' | 'wait' | 'ride' | 'done';
  /** À pied : mètres parcourus sur le chemin. */
  along: number;
  stepStartedAt: number;
  /** À bord : heure réelle de montée, et décalage réel par rapport aux horaires (ms). */
  boardedAt?: number;
  shift: number;
  maxAlong: number;
  source: 'gps' | 'estime';
  lostSince?: number;
  offSince?: number;
  nearEndSince?: number;
  alert?: 'offroute' | 'wrongway' | 'wrongtrain';
  /** L'instant des horaires qui correspond à là où tu es vraiment (pour l'affichage arrêt par arrêt). */
  virtual: number;
  /** Instant de la mise à jour précédente. */
  tick?: number;
  /** « Pas encore monté » touché : on ne suppose plus la montée sur simple perte de signal avant cette heure. */
  noGuessUntil?: number;
  /** La montée a été supposée (signal perdu), pas constatée. */
  guessed?: boolean;
}

export interface Input {
  now: number;
  fix: Fix | null;
  gps: 'granted' | 'denied';
  /** Heure réelle (temps réel) du départ de ton train, si on l'a trouvé au quai. */
  departure?: number;
}

const FRESH_MS = 20_000;
const WALK_MS = 1.25; // m/s

export function buildModel(j: Journey): Step[] {
  return j.legs.map((leg): Step => {
    if (leg.mode === 'walk') return { kind: 'walk', leg, plan: walkPlan(leg), scheduledEnd: Date.parse(leg.arrivalAt) };
    const pts: LonLat[] = leg.path && leg.path.length >= 2
      ? leg.path
      : leg.stops.filter((s) => s.lon !== undefined && s.lat !== undefined).map((s) => [s.lon!, s.lat!] as LonLat);
    const path = pts.length >= 2 ? pts : [];
    const cum = path.length ? cumulative(path) : [];
    let last = 0;
    const stops = leg.stops.map((s) => {
      const p: LonLat | undefined = s.lon !== undefined && s.lat !== undefined ? [s.lon, s.lat] : undefined;
      const along = p && path.length ? Math.max(last, snapTo(path, cum, p).along) : last;
      last = along;
      return { name: s.name, at: Date.parse(s.at), p, along };
    });
    return { kind: 'ride', leg, path, cum, stops };
  }).filter((s) => s.kind === 'ride' ? s.stops.length >= 2 : true);
}

/** Heure prévue de passage à une position le long de la ligne (interpolée entre deux arrêts). */
export function timeAtAlong(stops: RideStop[], along: number): number {
  if (along <= stops[0].along) return stops[0].at;
  for (let i = 1; i < stops.length; i++) {
    if (along <= stops[i].along) {
      const a = stops[i - 1], b = stops[i];
      const f = (along - a.along) / Math.max(1, b.along - a.along);
      return a.at + (b.at - a.at) * f;
    }
  }
  return stops[stops.length - 1].at;
}

const fresh = (input: Input) => !!input.fix && input.now - input.fix.at < FRESH_MS && (input.fix.accuracy ?? 0) < 80;

function enter(model: Step[], index: number, now: number, prev: Track): Track {
  if (index >= model.length) return { ...prev, step: model.length - 1, sub: 'done', alert: undefined, virtual: now };
  const st = model[index];
  return {
    ...prev, step: index, sub: st.kind === 'walk' ? 'walk' : 'wait', along: 0, stepStartedAt: now, maxAlong: 0,
    boardedAt: undefined, offSince: undefined, nearEndSince: undefined, alert: undefined,
    shift: st.kind === 'ride' ? prev.shift : 0,
  };
}

export function initTrack(model: Step[], now: number): Track {
  const base: Track = { step: 0, sub: 'walk', along: 0, stepStartedAt: now, shift: 0, maxAlong: 0, source: 'estime', virtual: now };
  return withVirtual(model, enter(model, 0, now, base), now);
}

/** Instant « horaires » à afficher pour l'état courant (voir computeGuide). */
function withVirtual(model: Step[], t: Track, now: number): Track {
  if (t.sub === 'done') return { ...t, virtual: Number.MAX_SAFE_INTEGER };
  const next = model.slice(t.step).find((s) => s.kind === 'ride') as Extract<Step, { kind: 'ride' }> | undefined;
  const st = model[t.step];
  if (st.kind === 'ride' && t.sub === 'ride') return t;
  // À pied ou sur le quai : on se place juste avant le départ du prochain train, sans jamais avancer plus vite.
  const prevRide = model.slice(0, t.step).reverse().find((s) => s.kind === 'ride') as Extract<Step, { kind: 'ride' }> | undefined;
  const floor = prevRide ? prevRide.stops[prevRide.stops.length - 1].at + 35_000 : -Infinity;
  const target = next ? next.stops[0].at - 60_000 : now;
  return { ...t, virtual: Math.max(floor, Math.min(target, now)) };
}

export function advance(model: Step[], t: Track, input: Input): Track {
  if (t.sub === 'done' || model.length === 0) return t;
  const { now } = input;
  const ok = fresh(input);
  const fix = input.fix;
  const elapsed = Math.max(0, Math.min(10_000, now - (t.tick ?? now)));
  let n: Track = { ...t, tick: now, lostSince: ok ? undefined : t.lostSince ?? now, source: ok ? 'gps' : 'estime' };
  const st = model[n.step];

  if (st.kind === 'walk') {
    const plan = st.plan;
    if (ok && plan) {
      const w = walkStatus(plan, fix!.p, fix!.accuracy, n.along);
      n.along = w.along;
      n.offSince = w.onRoute ? undefined : n.offSince ?? now;
      n.alert = n.offSince && now - n.offSince > 12_000 ? 'offroute' : undefined;
      if (w.arrived) return withVirtual(model, enter(model, n.step + 1, now, n), now);
    } else {
      // Sans position : on avance au pas d'un piéton, à partir de là où on t'a vu pour la dernière fois.
      const length = plan?.length ?? st.leg.durationMin * 60 * WALK_MS;
      const lostFor = n.lostSince ? now - n.lostSince : 0;
      const refusedOrLong = input.gps === 'denied' || !plan || lostFor > 180_000;
      if (refusedOrLong) n.along = Math.min(length, n.along + (WALK_MS * elapsed) / 1000);
      // Signal perdu tout près de la gare : tu y es entré.
      if (input.gps === 'granted' && lostFor > 25_000 && length - n.along < 180) return withVirtual(model, enter(model, n.step + 1, now, n), now);
      if (n.along >= length - 5) return withVirtual(model, enter(model, n.step + 1, now, n), now);
    }
    return withVirtual(model, n, now);
  }

  // Tronçon en transport.
  const stops = st.stops;
  const first = stops[0], last = stops[stops.length - 1];
  const snap = ok && st.path.length ? snapTo(st.path, st.cum, fix!.p) : null;

  if (n.sub === 'wait') {
    const departure = input.departure ?? first.at;
    let boarded: number | undefined;
    if (snap && snap.offset < 150 && snap.along - first.along > 250) boarded = now - ((snap.along - first.along) / 10) * 1000;
    else if (snap && snap.offset < 120 && (fix!.speed ?? 0) > 5 && snap.along > first.along + 50) boarded = now - 15_000;
    else if (!ok && input.gps === 'granted' && n.lostSince && now - n.lostSince > 45_000 && now > departure - 30_000 && now > (n.noGuessUntil ?? 0)) boarded = Math.max(departure, n.lostSince);
    else if (input.gps === 'denied' && now >= departure) boarded = departure;
    if (boarded === undefined) return withVirtual(model, n, now);
    n = { ...n, sub: 'ride', boardedAt: boarded, shift: boarded - first.at, maxAlong: snap?.along ?? first.along, guessed: !snap };
  }

  // À bord.
  if (snap && snap.offset < 200) {
    const v = timeAtAlong(stops, snap.along);
    n.virtual = v;
    n.shift = now - v;
    if (snap.along < n.maxAlong - 300) n.alert = 'wrongway';
    else if (n.alert === 'wrongway' || n.alert === 'wrongtrain') n.alert = undefined;
    n.maxAlong = Math.max(n.maxAlong, snap.along);
    n.offSince = undefined;
  } else {
    if (snap && snap.offset > 500 && (fix!.speed ?? 0) > 4) {
      n.offSince = n.offSince ?? now;
      if (now - n.offSince > 20_000) n.alert = 'wrongtrain';
    }
    n.virtual = now - n.shift;
  }
  n.virtual = Math.min(n.virtual, last.at + 40_000);

  // Descente : à la gare d'arrivée et immobile (ou déjà reparti à pied), ou heure réelle estimée dépassée sans GPS.
  const nearLast = ok && last.p ? meters(fix!.p, last.p) < 150 : false;
  if (nearLast && ((fix!.speed ?? 0) < 2 || (snap && snap.along >= last.along - 30))) {
    n.nearEndSince = n.nearEndSince ?? now;
    n.virtual = Math.max(n.virtual, last.at);
    if (now - n.nearEndSince > 20_000) return withVirtual(model, enter(model, n.step + 1, now, n), now);
  } else if (!ok && n.virtual >= last.at + 35_000) {
    return withVirtual(model, enter(model, n.step + 1, now, n), now);
  } else {
    n.nearEndSince = undefined;
  }
  return n;
}

/** « Pas encore monté » : retour sur le quai, sans supposer de nouveau la montée avant le prochain train. */
export function notBoarded(model: Step[], t: Track, now: number, nextDeparture?: number): Track {
  if (t.sub !== 'ride') return t;
  return withVirtual(model, { ...t, sub: 'wait', boardedAt: undefined, guessed: false, lostSince: undefined, noGuessUntil: Math.max(now + 3 * 60_000, (nextDeparture ?? 0) - 30_000) }, now);
}
