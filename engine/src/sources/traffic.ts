import { lineInfo } from './lines.ts';

/**
 * Info trafic : API « Calculateur IDFM, Messages Info Trafic (v2) » (Navitia line_reports).
 * Demande un abonnement à cette API sur PRIM, en plus de la clé.
 * On regroupe les perturbations par ligne et on garde un texte court, lisible.
 */
const URL_REPORTS = 'https://prim.iledefrance-mobilites.fr/marketplace/v2/navitia/line_reports/line_reports';

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

const RANK: Record<TrafficLevel, number> = { ok: 0, info: 1, travaux: 2, perturbe: 3, interrompu: 4 };

/** Texte brut à partir d'un message parfois en HTML. */
export function plain(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, '’').replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
}

function levelOf(d: any): TrafficLevel {
  const effect = String(d?.severity?.effect ?? '').toUpperCase();
  const name = String(d?.severity?.name ?? '').toLowerCase();
  const cause = String(d?.cause ?? '').toLowerCase();
  if (effect === 'NO_SERVICE' || name.includes('bloqu') || name.includes('interromp')) return 'interrompu';
  if (cause.includes('travaux') || name.includes('travaux')) return 'travaux';
  if (['SIGNIFICANT_DELAYS', 'REDUCED_SERVICE', 'DETOUR', 'MODIFIED_SERVICE', 'STOP_MOVED'].includes(effect) || name.includes('perturb')) return 'perturbe';
  return 'info';
}

const navDate = (s?: string) => {
  const m = s && /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})/.exec(s);
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}` : undefined;
};

/** Transforme la réponse line_reports en état par ligne. Fonction pure, testable. */
export function parseLineReports(json: any, now: number = Date.now()): LineTraffic[] {
  const byId = new Map<string, any>();
  for (const d of json?.disruptions ?? []) byId.set(d.id, d);
  const out: LineTraffic[] = [];
  for (const r of json?.line_reports ?? []) {
    const line = r.line ?? {};
    const ids = new Set<string>([
      ...(line.links ?? []).filter((l: any) => l.type === 'disruption').map((l: any) => l.id),
      ...(r.pt_objects ?? []).flatMap((o: any) => (o.links ?? o[o.embedded_type]?.links ?? []).filter((l: any) => l.type === 'disruption').map((l: any) => l.id)),
    ]);
    const disruptions: Disruption[] = [];
    for (const id of ids) {
      const d = byId.get(id);
      if (!d || d.status === 'past') continue;
      const period = (d.application_periods ?? []).find((p: any) => !p.end || Date.parse(navDate(p.end) ?? '') > now) ?? d.application_periods?.[0];
      const msgs = d.messages ?? [];
      const short = msgs.find((m: any) => (m.channel?.types ?? []).includes('title')) ?? msgs[0];
      const long = msgs.find((m: any) => (m.channel?.types ?? []).some((t: string) => t === 'web' || t === 'mobile')) ?? msgs[0];
      disruptions.push({
        id,
        level: levelOf(d),
        title: plain(short?.text ?? d.severity?.name ?? 'Information'),
        message: plain(long?.text ?? ''),
        start: navDate(period?.begin),
        end: navDate(period?.end),
      });
    }
    const rawId = String(line.id ?? '').split(':').pop() ?? '';
    const info = lineInfo(rawId);
    disruptions.sort((a, b) => RANK[b.level] - RANK[a.level]);
    out.push({
      lineId: rawId,
      code: line.code ?? info?.code ?? rawId,
      color: line.color ? `#${line.color}` : info?.color ?? '#0E0F12',
      textColor: line.text_color ? `#${line.text_color}` : info?.textColor ?? '#FFFFFF',
      mode: String(line.commercial_mode?.name ?? info?.mode ?? '').toLowerCase(),
      level: disruptions[0]?.level ?? 'ok',
      disruptions,
    });
  }
  return out.sort((a, b) => RANK[b.level] - RANK[a.level]);
}

export async function fetchTraffic(apiKey: string): Promise<LineTraffic[]> {
  const url = new URL(URL_REPORTS);
  url.searchParams.set('count', '1000');
  const res = await fetch(url, { headers: { apikey: apiKey, Accept: 'application/json' }, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw Object.assign(new Error(`Info trafic : ${res.status}`), { status: res.status });
  return parseLineReports(await res.json());
}

export function mockTraffic(): LineTraffic[] {
  return [
    { lineId: 'mock-E', code: 'E', color: '#C04191', textColor: '#FFFFFF', mode: 'rer', level: 'perturbe',
      disruptions: [{ id: 'm1', level: 'perturbe', title: 'Trafic perturbé entre Magenta et Nanterre', message: 'Incident technique. Trains supprimés, prévoir un temps de parcours allongé.' }] },
    { lineId: 'mock-13', code: '13', color: '#6EC4E8', textColor: '#0E0F12', mode: 'metro', level: 'travaux',
      disruptions: [{ id: 'm2', level: 'travaux', title: 'Travaux ce week-end', message: 'Station Varenne fermée samedi et dimanche.' }] },
  ];
}
