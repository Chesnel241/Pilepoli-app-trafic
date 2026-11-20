import { useEffect, useState } from 'react';
import type { Exit, Journey, NearbyStop, NetworkLine, Place, StopSnapshot, TrafficReport } from './types';

/**
 * Client du moteur Pilepoil. Uniquement des données réelles (PRIM, Île-de-France Mobilités).
 * Si le moteur est injoignable ou que la source ne répond pas, on le dit clairement :
 * jamais de données inventées pour remplir l'écran.
 */
const ENGINE = (process.env.EXPO_PUBLIC_ENGINE_URL ?? 'http://localhost:8787').replace(/\/+$/, '');
/** Clé anti-abus facultative (même valeur que ACCESS_TOKEN côté moteur). */
const ENGINE_KEY = process.env.EXPO_PUBLIC_ENGINE_KEY ?? '';
if (!__DEV__ && /localhost|127\.0\.0\.1/.test(ENGINE)) {
  console.error('EXPO_PUBLIC_ENGINE_URL pointe vers localhost dans un build de production : vérifie eas.json.');
}

/** Pourquoi une réponse est vide : pas de réseau, source indisponible, ou quota PRIM du jour atteint. */
export type Failure = 'offline' | 'unavailable' | 'quota';
class EngineError extends Error {
  constructor(readonly failure: Failure) { super(failure); }
}
const failureOf = (e: unknown): Failure => (e instanceof EngineError ? e.failure : 'offline');

/** État de la connexion au moteur, partagé par tous les écrans. */
let online = true;
const listeners = new Set<(v: boolean) => void>();
function setOnline(v: boolean) {
  if (v === online) return;
  online = v;
  listeners.forEach((l) => l(v));
}
export const isOnline = () => online;
export function useOnline(): boolean {
  const [v, setV] = useState(online);
  useEffect(() => {
    listeners.add(setV);
    return () => { listeners.delete(setV); };
  }, []);
  return v;
}

async function get<T>(path: string): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(ENGINE + path, {
      signal: ctrl.signal,
      headers: ENGINE_KEY ? { 'x-pilepoil-key': ENGINE_KEY } : undefined,
    });
    setOnline(true);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new EngineError(res.status === 503 && body?.error === 'quota' ? 'quota' : 'unavailable');
    }
    return (await res.json()) as T;
  } catch (e) {
    // Une erreur HTTP (4xx/5xx) n'est pas une coupure réseau ; un abandon ou un échec de fetch, si.
    if (!(e instanceof EngineError)) setOnline(false);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/** Passages d'un arrêt ; avec `to` (stop_area:IDFM:…), chaque passage dit s'il s'arrête à cette gare. */
export async function fetchDepartures(stopRef: string, to?: string): Promise<StopSnapshot> {
  try {
    return await get<StopSnapshot>(`/stops/${encodeURIComponent(stopRef)}/departures${to ? `?to=${encodeURIComponent(to)}` : ''}`);
  } catch (e) {
    return { stopRef, fetchedAt: new Date().toISOString(), departures: [], anomalies: [], source: 'offline', failure: failureOf(e) };
  }
}

export async function fetchJourneys(from: string, to: string): Promise<{ journeys: Journey[]; source: string; failure?: Failure }> {
  try {
    return await get(`/journeys?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
  } catch (e) {
    return { journeys: [], source: 'offline', failure: failureOf(e) };
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
  } catch (e) {
    return { lines: [], fetchedAt: new Date().toISOString(), source: 'offline', error: failureOf(e) };
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

/** Lignes du réseau (métro, RER, Transilien, tram, câble), gardées en mémoire pour la session. */
let linesMemo: NetworkLine[] | null = null;
export async function fetchLines(): Promise<NetworkLine[]> {
  if (linesMemo) return linesMemo;
  try {
    const r = await get<{ lines: NetworkLine[] }>('/lines');
    if (r.lines.length) linesMemo = r.lines;
    return r.lines;
  } catch {
    return [];
  }
}

/** stop_area:IDFM:71410 → STIF:StopArea:SP:71410: (référence des prochains passages). */
export const stopRefOf = (placeId: string) => `STIF:StopArea:SP:${placeId.split(':').pop()}:`;
