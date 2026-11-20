import { lineInfo } from './lines.ts';
import { navitiaDate } from './prim.ts';

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
  /** Début et fin (ISO, UTC). */
  start?: string;
  end?: string;
  /** Pas encore en cours (travaux prévus…) : affiché, mais ne colore pas la ligne aujourd'hui. */
  upcoming?: boolean;
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

/**
 * La perturbation touche-t-elle toute la ligne, ou seulement quelques arrêts ou un tronçon ?
 * « Arrêt non desservi » (NO_SERVICE sur un arrêt) n'est pas une ligne interrompue.
 */
function wholeLine(d: any): boolean {
  const objs: any[] = d?.impacted_objects ?? [];
  if (objs.length === 0) return true; // sans détail, on suit l'opérateur
  return objs.some((o) => o?.pt_object?.embedded_type === 'line' && !o.impacted_section && !(o.impacted_stops?.length));
}

export function levelOf(d: any): TrafficLevel {
  const effect = String(d?.severity?.effect ?? '').toUpperCase();
  const name = String(d?.severity?.name ?? '').toLowerCase();
  const text = `${d?.cause ?? ''} ${name} ${(d?.messages ?? []).map((m: any) => m?.text ?? '').join(' ')}`.toLowerCase();
  const blocking = effect === 'NO_SERVICE' || name.includes('bloqu') || name.includes('interromp');
  if (blocking && wholeLine(d)) return 'interrompu';
  if (text.includes('travaux')) return 'travaux';
  if (blocking || ['SIGNIFICANT_DELAYS', 'REDUCED_SERVICE', 'DETOUR', 'MODIFIED_SERVICE', 'STOP_MOVED'].includes(effect) || name.includes('perturb')) return 'perturbe';
  return 'info';
}

/** Dates Navitia en heure de Paris (« 20261123T040000 ») → ISO UTC, quel que soit le fuseau du serveur. */
const navDate = (s?: string) => (s && /^\d{8}T\d{6}$/.test(s) ? navitiaDate(s) : undefined);

/** En cours maintenant ? D'après les périodes d'application, sinon d'après le statut Navitia. */
function activeNow(d: any, now: number): boolean {
  const periods: any[] = d?.application_periods ?? [];
  if (periods.length) {
    return periods.some((p) => {
      const b = Date.parse(navDate(p.begin) ?? ''), e = Date.parse(navDate(p.end) ?? '');
      return (Number.isNaN(b) || b <= now) && (Number.isNaN(e) || now < e);
    });
  }
  return d?.status !== 'future';
}

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
      const upcoming = !activeNow(d, now);
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
        ...(upcoming ? { upcoming: true } : {}),
      });
    }
    const rawId = String(line.id ?? '').split(':').pop() ?? '';
    const info = lineInfo(rawId);
    // Ce qui se passe maintenant d'abord, le plus grave en tête ; les travaux à venir ensuite.
    disruptions.sort((a, b) => Number(!!a.upcoming) - Number(!!b.upcoming) || RANK[b.level] - RANK[a.level]);
    const current = disruptions.filter((d) => !d.upcoming);
    out.push({
      lineId: rawId,
      // Le référentiel IDFM donne le nom que voient les voyageurs (« 272 ») ; Navitia peut renvoyer un code technique.
      code: info?.code ?? line.code ?? rawId,
      color: info?.color ?? (line.color ? `#${line.color}` : '#0E0F12'),
      textColor: info?.textColor ?? (line.text_color ? `#${line.text_color}` : '#FFFFFF'),
      mode: String(info?.mode ?? line.commercial_mode?.name ?? '').toLowerCase(),
      // Seules les perturbations en cours colorent la ligne ; des travaux à venir restent une simple info.
      level: current[0]?.level ?? (disruptions.length ? 'info' : 'ok'),
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
