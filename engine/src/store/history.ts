import { appendFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { RatedDeparture, StopSnapshot } from '../types.ts';

/**
 * Historique des relevés.
 * - En mémoire : le dernier relevé par arrêt (pour détecter les anomalies au relevé suivant).
 * - Sur disque : un fichier JSONL, une ligne par passage observé, base des futures prédictions.
 * Aucune donnée personnelle n'est stockée ici.
 */
export class History {
  private last = new Map<string, RatedDeparture[]>();

  constructor(private file: string) {}

  previous(stopRef: string): RatedDeparture[] | undefined {
    return this.last.get(stopRef);
  }

  async record(snap: StopSnapshot): Promise<void> {
    this.last.set(snap.stopRef, snap.departures);
    const lines = snap.departures.map((d) =>
      JSON.stringify({
        t: snap.fetchedAt,
        stop: snap.stopRef,
        line: d.lineRef,
        journey: d.journeyRef,
        aimed: d.aimedAt,
        expected: d.expectedAt,
        recorded: d.recordedAt,
        rel: d.reliability,
        src: snap.source,
      }),
    );
    if (lines.length === 0) return;
    await mkdir(dirname(this.file), { recursive: true });
    await appendFile(this.file, lines.join('\n') + '\n', 'utf8');
  }
}
