import { appendFile, mkdir, rename, stat } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { RatedDeparture, StopSnapshot } from '../types.ts';

/** Au-delà de cette taille, le journal brut est archivé (une seule archive gardée). */
const MAX_BYTES = 50 * 1024 * 1024;

/**
 * Historique des relevés.
 * - En mémoire : le dernier relevé par arrêt (pour détecter les anomalies au relevé suivant).
 * - Sur disque, seulement si HISTORY_LOG=1 : un journal JSONL brut, utile pour analyser à la main.
 *   Les prédictions, elles, viennent de store/stats.ts, compact et borné.
 * Aucune donnée personnelle n'est stockée ici.
 */
export class History {
  private last = new Map<string, RatedDeparture[]>();
  private writes = 0;

  constructor(private file: string, private logToDisk = false) {}

  previous(stopRef: string): RatedDeparture[] | undefined {
    return this.last.get(stopRef);
  }

  async record(snap: StopSnapshot): Promise<void> {
    this.last.set(snap.stopRef, snap.departures);
    if (this.last.size > 20_000) this.last.delete(this.last.keys().next().value as string);
    if (!this.logToDisk || snap.departures.length === 0) return;
    const lines = snap.departures.map((d) =>
      JSON.stringify({
        t: snap.fetchedAt, stop: snap.stopRef, line: d.lineRef, journey: d.journeyRef,
        aimed: d.aimedAt, expected: d.expectedAt, recorded: d.recordedAt, rel: d.reliability, src: snap.source,
      }),
    );
    await mkdir(dirname(this.file), { recursive: true });
    if (++this.writes % 200 === 0) {
      const size = await stat(this.file).then((s) => s.size).catch(() => 0);
      if (size > MAX_BYTES) await rename(this.file, `${this.file}.1`).catch(() => null);
    }
    await appendFile(this.file, lines.join('\n') + '\n', 'utf8');
  }
}
