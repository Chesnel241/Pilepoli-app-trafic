import type { Reliability } from '../theme';

/** Miroir des types exposés par le moteur (engine/src/types.ts). */
export interface RatedDeparture {
  journeyRef: string;
  lineCode: string;
  lineColor?: string;
  lineTextColor?: string;
  mode?: string;
  destination: string;
  direction?: string;
  aimedAt: string | null;
  expectedAt: string | null;
  platform?: string;
  reliability: Reliability;
  ageSeconds: number | null;
  minutes: number | null;
  range: { min: number; max: number } | null;
  label: string;
  /** Ce que l'historique dit de cette ligne ici, à cette heure (absent si pas assez d'observations). */
  prediction?: { typicalDelayMin: number; badDayDelayMin: number; samples: number };
}

export type Anomaly =
  | { kind: 'early'; journeyRef: string; lineCode: string; minutesEarly: number; at: string }
  | { kind: 'vanished'; journeyRef: string; lineCode: string; aimedAt: string | null; at: string }
  | { kind: 'stale_feed'; stopRef: string; ageSeconds: number; at: string };

export interface StopSnapshot {
  stopRef: string;
  fetchedAt: string;
  departures: RatedDeparture[];
  anomalies?: Anomaly[];
  source: 'prim' | 'mock' | 'local' | 'offline';
}

export type LegMode = 'walk' | 'metro' | 'rer' | 'train' | 'tram' | 'bus' | 'cable' | 'boat' | 'other';

export interface JourneyLeg {
  mode: LegMode;
  lineCode: string;
  lineColor: string;
  lineTextColor: string;
  direction: string;
  from: string;
  to: string;
  toId?: string;
  departureAt: string;
  arrivalAt: string;
  durationMin: number;
  stops: { name: string; at: string; lat?: number; lon?: number }[];
  /** Tracé simplifié en [lon, lat]. */
  path?: [number, number][];
  tips: string[];
}

export interface Journey {
  id: string;
  departureAt: string;
  arrivalAt: string;
  durationMin: number;
  transfers: number;
  legs: JourneyLeg[];
  reliability: Reliability;
  tag?: 'plus_fiable' | 'plus_rapide' | 'direct';
}

export interface Place {
  id: string;
  name: string;
  kind: string;
}

export type TrafficLevel = 'ok' | 'info' | 'travaux' | 'perturbe' | 'interrompu';

export interface Disruption {
  id: string;
  level: TrafficLevel;
  title: string;
  message: string;
  start?: string;
  end?: string;
}

export interface LineTraffic {
  lineId: string;
  code: string;
  color: string;
  textColor: string;
  mode: string;
  level: TrafficLevel;
  disruptions: Disruption[];
}

export interface TrafficReport {
  lines: LineTraffic[];
  fetchedAt: string;
  /** « abonnement » : l'API Messages Info Trafic n'est pas activée sur le compte PRIM. */
  error?: string;
  source?: string;
}

export interface NearbyStop {
  anomalies?: Anomaly[];
  stopRef: string;
  placeId: string;
  areaNumber: string;
  name: string;
  distance: number;
  departures: RatedDeparture[];
}

export interface Exit {
  id: string;
  name: string;
  number?: string;
  accessible?: boolean;
}
