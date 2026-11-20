import { datasetHeaders } from './datasets.ts';
/**
 * Sorties (accès) des gares, à partir de l'open data d'IDFM (sans clé) :
 *   zone de correspondance (l'arrêt affiché) → zones d'arrêt (zones-d-arrets)
 *   → accès rattachés (relations-acces) → description de l'accès (acces).
 * Les noms de colonnes de ces jeux ont déjà changé par le passé : on les détecte
 * au lieu de les coder en dur, et tout échec renvoie une liste vide (jamais d'invention).
 */
const ODS = 'https://data.iledefrance-mobilites.fr/api/explore/v2.1/catalog/datasets';

export interface Exit {
  id: string;
  name: string;
  /** Numéro de sortie s'il apparaît dans le nom (« Sortie 3 », « Accès 2 »). */
  number?: string;
  lat?: number;
  lon?: number;
  accessible?: boolean;
}

async function records(ds: string, where: string, limit = 100): Promise<any[]> {
  const url = new URL(`${ODS}/${ds}/records`);
  url.searchParams.set('where', where);
  url.searchParams.set('limit', String(limit));
  const res = await fetch(url, { headers: datasetHeaders(), signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`${ds} : ${res.status}`);
  return ((await res.json()) as any).results ?? [];
}

/** Trouve le nom réel d'une colonne d'après un motif (zdcid, zdc_id, ZdCId…). */
const field = (row: any, re: RegExp) => Object.keys(row ?? {}).find((k) => re.test(k));

/** Essaie une égalité numérique puis texte (le type de colonne varie selon les jeux). */
async function whereEq(ds: string, col: string, values: string[]): Promise<any[]> {
  if (values.length === 0) return [];
  const list = (q: boolean) => values.map((v) => (q ? `"${v}"` : v)).join(',');
  try {
    return await records(ds, `${col} IN (${list(false)})`);
  } catch {
    return records(ds, `${col} IN (${list(true)})`);
  }
}

export function exitNumber(name: string): string | undefined {
  const m = /(?:sortie|acc[eè]s)\s*(?:n[°o]\s*)?(\d+[a-z]?)/i.exec(name);
  return m?.[1];
}

export function toExit(row: any): Exit | null {
  const idK = field(row, /^acc_?id$/i);
  const nameK = field(row, /^acc_?name$/i) ?? field(row, /name/i);
  if (!idK || !nameK) return null;
  const name = String(row[nameK]).trim();
  const geo = row.geo_point_2d ?? row.accgeopoint ?? null;
  const accK = field(row, /access/i);
  return {
    id: String(row[idK]),
    name,
    number: exitNumber(name),
    lat: typeof geo?.lat === 'number' ? geo.lat : undefined,
    lon: typeof geo?.lon === 'number' ? geo.lon : undefined,
    accessible: accK ? /^(1|true|oui|yes)$/i.test(String(row[accK])) : undefined,
  };
}

export async function fetchExits(stopAreaNumber: string): Promise<Exit[]> {
  // 1. Les zones d'arrêt de cette zone de correspondance.
  const probe = await records('zones-d-arrets', '1=1', 1);
  const zdcK = field(probe[0], /^zdc_?id$/i);
  const zdaK = field(probe[0], /^zda_?id$/i);
  if (!zdcK || !zdaK) return [];
  const zdas = (await whereEq('zones-d-arrets', zdcK, [stopAreaNumber])).map((r) => String(r[zdaK]));
  // La zone affichée peut aussi être directement une zone d'arrêt.
  zdas.push(stopAreaNumber);

  // 2. Les accès rattachés.
  const probeRel = await records('relations-acces', '1=1', 1);
  const relZda = field(probeRel[0], /^zda_?id$/i);
  const relAcc = field(probeRel[0], /^acc_?id$/i);
  if (!relZda || !relAcc) return [];
  const accIds = [...new Set((await whereEq('relations-acces', relZda, zdas)).map((r) => String(r[relAcc])))];

  // 3. Leur description.
  const probeAcc = await records('acces', '1=1', 1);
  const accK = field(probeAcc[0], /^acc_?id$/i);
  if (!accK || accIds.length === 0) return [];
  const rows = await whereEq('acces', accK, accIds.slice(0, 100));
  return rows
    .map(toExit)
    .filter((e): e is Exit => !!e)
    .sort((a, b) => (Number(a.number ?? 999) - Number(b.number ?? 999)) || a.name.localeCompare(b.name, 'fr'));
}
