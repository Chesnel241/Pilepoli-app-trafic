import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { RatedDeparture } from '../types.ts';

/**
 * Prédictions : ce que Pilepoil a appris des passages réels.
 *
 * Principe, volontairement simple et vérifiable :
 * 1. Tant qu'une course approche (moins de 3 min) avec une info temps réel fraîche,
 *    on retient son dernier retard observé (heure estimée moins heure prévue).
 * 2. Quand elle disparaît de l'affichage après son heure de passage, elle est partie :
 *    son dernier retard rejoint l'historique de sa « case » (ligne, arrêt, type de jour, heure).
 * 3. Pour une case, on donne le retard médian et le retard « mauvais jour » (80e centile),
 *    seulement s'il y a assez d'observations. Sinon, on ne dit rien.
 *
 * Aucune donnée personnelle : seulement des horaires de véhicules.
 */

export interface Prediction {
  /** Retard habituel, en minutes (médiane). Négatif = en avance. */
  typicalDelayMin: number;
  /** Retard d'un mauvais jour (8 fois sur 10, on fait mieux que ça). */
  badDayDelayMin: number;
  samples: number;
}

/** Observations minimales avant d'oser une prédiction. */
export const MIN_SAMPLES = 8;
/** On garde les N dernières observations par case : l'historique récent compte plus que l'ancien. */
const KEEP = 120;
/** Retard au-delà duquel on considère que c'est une donnée aberrante (erreur de flux). */
const OUTLIER_SEC = 90 * 60;

type DayType = 'sem' | 'sam' | 'dim';

const parisParts = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', weekday: 'short', hour: '2-digit', hourCycle: 'h23' });

/** Case horaire d'un instant, à l'heure de Paris. */
export function bucketOf(ms: number): { day: DayType; hour: number } {
  const parts = parisParts.formatToParts(new Date(ms));
  const wd = parts.find((p) => p.type === 'weekday')?.value ?? '';
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const day: DayType = wd.startsWith('sam') ? 'sam' : wd.startsWith('dim') ? 'dim' : 'sem';
  return { day, hour };
}

export function keyOf(lineRef: string, stopRef: string, ms: number): string {
  const b = bucketOf(ms);
  return `${lineRef}|${stopRef}|${b.day}|${b.hour}`;
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export class Stats {
  private buckets = new Map<string, number[]>();
  /** Courses en approche : dernier retard vu (s), heure de passage prévue et case. */
  private pending = new Map<string, { delay: number; due: number; key: string }>();
  private dirty = false;

  constructor(private file: string) {}

  async load(): Promise<void> {
    try {
      const raw = JSON.parse(await readFile(this.file, 'utf8')) as Record<string, number[]>;
      for (const [k, v] of Object.entries(raw)) if (Array.isArray(v)) this.buckets.set(k, v.slice(-KEEP));
      console.log(`Historique des retards chargé : ${this.buckets.size} cases`);
    } catch {
      /* premier démarrage : rien à charger */
    }
  }

  async save(): Promise<void> {
    if (!this.dirty) return;
    await mkdir(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    await writeFile(tmp, JSON.stringify(Object.fromEntries(this.buckets)), 'utf8');
    await rename(tmp, this.file); // écriture atomique : jamais de fichier à moitié écrit
    this.dirty = false;
  }

  /** À appeler à chaque relevé d'un arrêt. */
  observe(stopRef: string, departures: RatedDeparture[], now: number): void {
    const seen = new Set<string>();
    for (const d of departures) {
      const id = `${stopRef}|${d.journeyRef}`;
      seen.add(id);
      if (d.reliability !== 'direct' || !d.aimedAt || !d.expectedAt || d.minutes === null || d.minutes > 3) continue;
      const aimed = Date.parse(d.aimedAt), expected = Date.parse(d.expectedAt);
      if (Number.isNaN(aimed) || Number.isNaN(expected)) continue;
      this.pending.set(id, { delay: (expected - aimed) / 1000, due: expected, key: keyOf(d.lineRef, stopRef, aimed) });
    }
    // Les courses suivies qui ont disparu après leur heure sont parties : on enregistre leur retard.
    for (const [id, p] of this.pending) {
      if (!id.startsWith(`${stopRef}|`) || seen.has(id)) continue;
      this.pending.delete(id);
      if (now < p.due - 60_000) continue; // disparue AVANT l'heure : ce n'est pas un passage, on ne conclut rien
      this.add(p.key, p.delay);
    }
    // Ménage : une course en attente depuis plus d'une heure n'apprendra plus rien.
    if (this.pending.size > 5000) {
      for (const [id, p] of this.pending) if (now - p.due > 3600_000) this.pending.delete(id);
    }
  }

  add(key: string, delaySec: number): void {
    if (!Number.isFinite(delaySec) || Math.abs(delaySec) > OUTLIER_SEC) return;
    const list = this.buckets.get(key) ?? [];
    list.push(Math.round(delaySec));
    if (list.length > KEEP) list.splice(0, list.length - KEEP);
    this.buckets.set(key, list);
    this.dirty = true;
  }

  predict(lineRef: string, stopRef: string, aimedMs: number): Prediction | undefined {
    const list = this.buckets.get(keyOf(lineRef, stopRef, aimedMs));
    if (!list || list.length < MIN_SAMPLES) return undefined;
    const sorted = [...list].sort((a, b) => a - b);
    return {
      typicalDelayMin: Math.round(quantile(sorted, 0.5) / 60),
      badDayDelayMin: Math.round(quantile(sorted, 0.8) / 60),
      samples: list.length,
    };
  }
}
