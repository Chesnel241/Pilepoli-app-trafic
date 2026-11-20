import { datasetHeaders } from './datasets.ts';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

/**
 * Référentiel des lignes d'Île-de-France Mobilités (open data, sans clé).
 * Il traduit l'identifiant technique d'une ligne (C01375) en nom court (« 5 »),
 * couleurs officielles et mode de transport.
 * Rechargé une fois par jour, avec une copie locale pour démarrer hors ligne.
 */
const URL_LINES =
  'https://data.iledefrance-mobilites.fr/api/explore/v2.1/catalog/datasets/referentiel-des-lignes/exports/json';
const DAY = 24 * 3600_000;

export interface LineInfo {
  code: string;
  color: string;
  textColor: string;
  mode: string;
}

let lines = new Map<string, LineInfo>();

const pick = (row: Record<string, unknown>, ...keys: string[]) => {
  for (const k of keys) {
    const v = row[k] ?? row[k.toLowerCase()];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return undefined;
};
const hex = (v: string | undefined, fallback: string) => (v && /^[0-9a-f]{6}$/i.test(v.replace('#', '')) ? `#${v.replace('#', '').toUpperCase()}` : fallback);

/** Construit la table à partir des lignes du jeu de données (noms de colonnes tolérants). */
export function buildLines(rows: Record<string, unknown>[]): Map<string, LineInfo> {
  const map = new Map<string, LineInfo>();
  for (const r of rows) {
    const id = pick(r, 'ID_Line', 'id_line');
    const code = pick(r, 'ShortName_Line', 'shortname_line', 'Name_Line', 'name_line');
    if (!id || !code) continue;
    map.set(id, {
      code,
      color: hex(pick(r, 'ColourWeb_hexa', 'colourweb_hexa'), '#0E0F12'),
      textColor: hex(pick(r, 'TextColourWeb_hexa', 'textcolourweb_hexa'), '#FFFFFF'),
      mode: (pick(r, 'TransportMode', 'transportmode') ?? '').toLowerCase(),
    });
  }
  return map;
}

/** STIF:Line::C01375: → C01375 */
export const lineIdOf = (lineRef: string) => lineRef.split(':').filter(Boolean).pop() ?? lineRef;

export function lineInfo(lineRef: string): LineInfo | undefined {
  return lines.get(lineIdOf(lineRef));
}

export async function loadLines(cacheFile: string): Promise<void> {
  try {
    lines = buildLines(JSON.parse(await readFile(cacheFile, 'utf8')));
  } catch {
    /* pas encore de copie locale */
  }
  const refresh = async () => {
    try {
      const res = await fetch(URL_LINES, { headers: datasetHeaders(), signal: AbortSignal.timeout(30_000) });
      if (!res.ok) throw new Error(`référentiel des lignes : ${res.status}`);
      const rows = (await res.json()) as Record<string, unknown>[];
      const fresh = buildLines(rows);
      if (fresh.size > 0) {
        lines = fresh;
        await mkdir(dirname(cacheFile), { recursive: true });
        await writeFile(cacheFile, JSON.stringify(rows));
        console.log(`Référentiel des lignes chargé : ${fresh.size} lignes`);
      }
    } catch (e) {
      console.warn('Référentiel des lignes indisponible, codes bruts affichés :', e instanceof Error ? e.message : e);
    }
  };
  await refresh();
  setInterval(refresh, DAY).unref();
}
