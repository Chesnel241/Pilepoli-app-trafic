import { localDepartures, localJourneys, localTraffic } from './mock';
import type { Exit, Journey, NearbyStop, Place, StopSnapshot, TrafficReport } from './types';

/**
 * Client du moteur Pilepoil.
 * Si le moteur est injoignable, on bascule sur des données locales simulées,
 * et l'interface l'indique (source = 'local') : on ne cache jamais d'où vient l'info.
 */
const ENGINE = process.env.EXPO_PUBLIC_ENGINE_URL ?? 'http://localhost:8787';

async function get<T>(path: string): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  try {
    const res = await fetch(ENGINE + path, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`Moteur : ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchDepartures(stopRef: string): Promise<StopSnapshot> {
  try {
    return await get<StopSnapshot>(`/stops/${encodeURIComponent(stopRef)}/departures`);
  } catch {
    return localDepartures(stopRef);
  }
}

export async function fetchJourneys(from: string, to: string): Promise<{ journeys: Journey[]; source: string }> {
  try {
    return await get(`/journeys?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
  } catch {
    return { journeys: localJourneys(), source: 'local' };
  }
}

export async function searchPlaces(q: string): Promise<Place[]> {
  try {
    const r = await get<{ places: Place[] }>(`/places?q=${encodeURIComponent(q)}`);
    return r.places;
  } catch {
    return [];
  }
}

export async function fetchTraffic(): Promise<TrafficReport> {
  try {
    return await get<TrafficReport>('/traffic');
  } catch {
    return { lines: localTraffic(), fetchedAt: new Date().toISOString(), source: 'local' };
  }
}

/** Arrêts autour d'une position. null si le moteur ne répond pas (l'accueil se rabat alors sur l'arrêt de démo). */
export async function fetchNearby(lon: number, lat: number): Promise<NearbyStop[] | null> {
  try {
    const r = await get<{ stops: NearbyStop[] }>(`/nearby?lon=${lon}&lat=${lat}`);
    return r.stops;
  } catch {
    return null;
  }
}

export async function fetchExits(areaNumber: string): Promise<Exit[]> {
  try {
    const r = await get<{ exits: Exit[] }>(`/stops/${encodeURIComponent(areaNumber)}/exits`);
    return r.exits;
  } catch {
    return [];
  }
}
