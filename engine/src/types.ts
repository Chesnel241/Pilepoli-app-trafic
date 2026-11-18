/**
 * Types partagés du moteur Pile.
 * Règle d'or : on ne présente jamais une estimation comme un fait.
 * Chaque passage porte donc son statut de fiabilité et l'âge de sa dernière info.
 */

/** Niveau de confiance d'un passage, du plus sûr au moins sûr. */
export type Reliability =
  | 'direct' // info temps réel récente (< 60 s)
  | 'estime' // temps réel, mais un peu ancien (1 à 3 min)
  | 'pas_vu' // plus aucun signal depuis plus de 3 min
  | 'theorique' // aucun temps réel, seulement l'horaire prévu
  | 'supprime'; // l'opérateur annonce explicitement une suppression

export interface Departure {
  /** Identifiant de la course (permet de suivre un même véhicule d'un relevé à l'autre). */
  journeyRef: string;
  lineRef: string;
  lineCode: string;
  destination: string;
  direction?: string;
  /** Horaire prévu (ISO). */
  aimedAt: string | null;
  /** Horaire estimé en temps réel (ISO), absent si pas de temps réel. */
  expectedAt: string | null;
  /** Moment où l'opérateur a produit cette info (ISO). */
  recordedAt: string | null;
  /** Statut brut de l'opérateur (onTime, delayed, cancelled, departed...). */
  operatorStatus?: string;
  vehicleAtStop?: boolean;
  platform?: string;
}

export interface RatedDeparture extends Departure {
  reliability: Reliability;
  /** Âge de la dernière info en secondes (null si inconnu). */
  ageSeconds: number | null;
  /** Minutes avant le passage, selon la meilleure heure connue. */
  minutes: number | null;
  /** Fourchette honnête autour de `minutes`. */
  range: { min: number; max: number } | null;
  /** Texte court prêt à afficher (« En direct », « Pas vu depuis 4 min »...). */
  label: string;
}

export type Anomaly =
  | { kind: 'early'; journeyRef: string; lineCode: string; minutesEarly: number; at: string }
  | { kind: 'vanished'; journeyRef: string; lineCode: string; aimedAt: string | null; at: string }
  | { kind: 'stale_feed'; stopRef: string; ageSeconds: number; at: string };

export interface StopSnapshot {
  stopRef: string;
  fetchedAt: string;
  departures: RatedDeparture[];
  anomalies: Anomaly[];
  source: 'prim' | 'mock';
}

export type LegMode = 'walk' | 'metro' | 'rer' | 'train' | 'tram' | 'bus' | 'cable' | 'other';

export interface JourneyStop {
  name: string;
  at: string; // ISO
}

export interface JourneyLeg {
  mode: LegMode;
  /** Code affiché (B, A, 14, 38...). Vide pour la marche. */
  lineCode: string;
  lineColor: string;
  lineTextColor: string;
  direction: string;
  from: string;
  to: string;
  departureAt: string;
  arrivalAt: string;
  durationMin: number;
  stops: JourneyStop[];
  /** Conseils pratiques (tête de train, sortie...). */
  tips: string[];
}

export interface Journey {
  id: string;
  departureAt: string;
  arrivalAt: string;
  durationMin: number;
  transfers: number;
  legs: JourneyLeg[];
  /** Synthèse de fiabilité du trajet (le plus faible maillon). */
  reliability: Reliability;
  tag?: 'plus_fiable' | 'plus_rapide' | 'direct';
}

export interface Place {
  id: string;
  name: string;
  kind: string;
}
