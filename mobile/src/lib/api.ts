import { useEffect, useState } from 'react';
import { localDepartures, localJourneys, localTraffic } from './mock';
import type { Exit, Journey, NearbyStop, Place, StopSnapshot, TrafficReport } from './types';

/**
 * Client du moteur Pilepoil.
 * En développement (ou démo), si le moteur est injoignable, on bascule sur des données simulées,
 * et l'interface l'indique (source = 'local'). En production, jamais de fausses données :
 * on dit simplement qu'on est hors connexion. On ne cache jamais d'où vient l'info.
 */
const ENGINE = (process.env.EXPO_PUBLIC_ENGINE_URL ?? 'http://localhost:8787').replace(/\/+$/, '');
/** Clé anti-abus facultative (même valeur que ACCESS_TOKEN côté moteur). */
const ENGINE_KEY = process.env.EXPO_PUBLIC_ENGINE_KEY ?? '';
export const ALLOW_LOCAL = __DEV__ || process.env.EXPO_PUBLIC_DEMO === '1';

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
    if (!res.ok) throw new Error(`Moteur : ${res.status}`);
    return (await res.json()) as T;
  } catch (e) {
    // Une erreur HTTP (4xx/5xx) n'est pas une coupure réseau ; un abandon ou un échec de fetch, si.
    if (!(e instanceof Error && e.message.startsWith('Moteur'))) setOnline(false);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchDepartures(stopRef: string): Promise<StopSnapshot> {
  try {
    return await get<StopSnapshot>(`/stops/${encodeURIComponent(stopRef)}/departures`);
  } catch {
    if (ALLOW_LOCAL) return localDepartures(stopRef);
    return { stopRef, fetchedAt: new Date().toISOString(), departures: [], anomalies: [], source: 'offline' };
  }
}

export async function fetchJourneys(from: string, to: string): Promise<{ journeys: Journey[]; source: string }> {
  try {
    return await get(`/journeys?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
  } catch {
    return ALLOW_LOCAL ? { journeys: localJourneys(), source: 'local' } : { journeys: [], source: 'offline' };
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
    if (ALLOW_LOCAL) return { lines: localTraffic(), fetchedAt: new Date().toISOString(), source: 'local' };
    return { lines: [], fetchedAt: new Date().toISOString(), source: 'offline', error: 'offline' };
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
