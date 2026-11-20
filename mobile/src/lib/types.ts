import type { Reliability } from '../theme';

/** Miroir des types exposés par le moteur (engine/src/types.ts). */
export interface RatedDeparture {
  journeyRef: string;
  lineCode: string;
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
}

export interface StopSnapshot {
  stopRef: string;
  fetchedAt: string;
  departures: RatedDeparture[];
  source: 'prim' | 'mock' | 'local';
}

export type LegMode = 'walk' | 'metro' | 'rer' | 'train' | 'tram' | 'bus' | 'cable' | 'other';

export interface JourneyLeg {
  mode: LegMode;
  lineCode: string;
  lineColor: string;
  lineTextColor: string;
  direction: string;
  from: string;
  to: string;
  departureAt: string;
  arrivalAt: string;
  durationMin: number;
  stops: { name: string; at: string }[];
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
