import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { rate, stillUpcoming } from './reliability/freshness.ts';
import { detectAnomalies } from './reliability/detect.ts';
import { History } from './store/history.ts';
import * as prim from './sources/prim.ts';
import * as mock from './sources/mock.ts';
import type { Departure, StopSnapshot } from './types.ts';
import { lineInfo, loadLines } from './sources/lines.ts';
import { fetchTraffic, mockTraffic, type LineTraffic } from './sources/traffic.ts';
import { fetchExits, mockExits, type Exit } from './sources/exits.ts';

const PORT = Number(process.env.PORT ?? 8787);
const API_KEY = process.env.PRIM_API_KEY ?? '';
const MODE: 'prim' | 'mock' = process.env.DATA_MODE === 'prim' && API_KEY ? 'prim' : 'mock';

if (process.env.DATA_MODE === 'prim' && !API_KEY) {
  console.warn('DATA_MODE=prim mais PRIM_API_KEY est vide : passage en données simulées.');
}

const history = new History(new URL('../data/observations.jsonl', import.meta.url).pathname);
loadLines(new URL('../data/lines.json', import.meta.url).pathname);

/** Remplace le code technique par le vrai nom de ligne et ses couleurs. */
function withLine(d: Departure): Departure {
  const info = lineInfo(d.lineRef);
  return info ? { ...d, lineCode: info.code, lineColor: info.color, lineTextColor: info.textColor, mode: info.mode } : d;
}

/** Petit cache pour respecter les quotas PRIM : un même arrêt n'est pas réinterrogé avant 20 s. */
const cache = new Map<string, { at: number; snap: StopSnapshot }>();
const CACHE_MS = 20_000;

async function stopSnapshot(stopRef: string): Promise<StopSnapshot> {
  const hit = cache.get(stopRef);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.snap;

  const now = Date.now();
  const raw = MODE === 'prim' ? await prim.stopMonitoring(stopRef, API_KEY) : mock.mockDepartures(stopRef, now);
  const departures = raw
    .filter((d) => stillUpcoming(d, now))
    .map(withLine)
    .map((d) => rate(d, now))
    .sort((a, b) => (a.minutes ?? 999) - (b.minutes ?? 999));
  const snap: StopSnapshot = {
    stopRef,
    fetchedAt: new Date(now).toISOString(),
    departures,
    anomalies: detectAnomalies(stopRef, history.previous(stopRef), departures, now),
    source: MODE,
  };
  await history.record(snap).catch((e) => console.error('Historique non écrit :', e.message));
  cache.set(stopRef, { at: now, snap });
  return snap;
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(JSON.stringify(body));
}

/** Info trafic : un seul appel PRIM par minute, partagé entre tous les utilisateurs. */
let trafficCache: { at: number; lines: LineTraffic[]; error?: string } | null = null;
async function traffic(): Promise<{ lines: LineTraffic[]; fetchedAt: string; error?: string }> {
  if (!trafficCache || Date.now() - trafficCache.at > 60_000) {
    if (MODE === 'mock') trafficCache = { at: Date.now(), lines: mockTraffic() };
    else {
      try {
        trafficCache = { at: Date.now(), lines: await fetchTraffic(API_KEY) };
      } catch (e: any) {
        // 401/403 : l'abonnement « Messages Info Trafic » manque sur le compte PRIM.
        const why = e?.status === 401 || e?.status === 403 ? 'abonnement' : 'indisponible';
        console.warn(e?.message ?? e);
        trafficCache = { at: Date.now(), lines: trafficCache?.lines ?? [], error: why };
      }
    }
  }
  return { lines: trafficCache.lines, fetchedAt: new Date(trafficCache.at).toISOString(), error: trafficCache.error };
}

/** Sorties : elles changent rarement, on les garde 24 h par gare. */
const exitsCache = new Map<string, { at: number; exits: Exit[] }>();
async function exits(areaNumber: string): Promise<Exit[]> {
  const hit = exitsCache.get(areaNumber);
  if (hit && Date.now() - hit.at < 24 * 3600_000) return hit.exits;
  let list: Exit[] = [];
  if (MODE === 'mock') list = mockExits();
  else {
    try { list = await fetchExits(areaNumber); } catch (e: any) { console.warn('Sorties indisponibles :', e?.message ?? e); }
  }
  exitsCache.set(areaNumber, { at: Date.now(), exits: list });
  return list;
}

async function route(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const parts = url.pathname.split('/').filter(Boolean);

  if (req.method === 'OPTIONS') return send(res, 204, null);
  if (req.method !== 'GET') return send(res, 405, { error: 'Méthode non autorisée' });

  if (url.pathname === '/health') return send(res, 200, { ok: true, mode: MODE });

  // GET /traffic : état de toutes les lignes et perturbations en cours
  if (url.pathname === '/traffic') return send(res, 200, await traffic());

  // GET /nearby?lon=..&lat=.. : arrêts autour de soi, avec leurs prochains passages
  if (url.pathname === '/nearby') {
    const lon = Number(url.searchParams.get('lon')), lat = Number(url.searchParams.get('lat'));
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return send(res, 400, { error: 'lon et lat obligatoires' });
    const list = MODE === 'prim' ? await prim.nearby(lon, lat, API_KEY) : mock.mockNearby();
    const top = list.slice(0, 3);
    const snaps = await Promise.all(top.map((st) => stopSnapshot(st.stopRef).catch(() => null)));
    return send(res, 200, {
      stops: top.map((st, i) => ({ ...st, departures: snaps[i]?.departures.slice(0, 4) ?? [] })),
      source: MODE,
    });
  }

  // GET /stops/:areaNumber/exits : sorties d'une gare (ex. /stops/71410/exits)
  if (parts[0] === 'stops' && parts[2] === 'exits' && parts[1]) {
    const n = decodeURIComponent(parts[1]).split(':').filter(Boolean).pop() ?? '';
    return send(res, 200, { exits: await exits(n), source: MODE });
  }

  // GET /stops/:stopRef/departures   ex. /stops/STIF:StopArea:SP:71410:/departures
  if (parts[0] === 'stops' && parts[2] === 'departures' && parts[1]) {
    return send(res, 200, await stopSnapshot(decodeURIComponent(parts[1])));
  }

  // GET /journeys?from=...&to=...
  if (url.pathname === '/journeys') {
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');
    if (!from || !to) return send(res, 400, { error: 'Paramètres from et to obligatoires' });
    const list = MODE === 'prim' ? await prim.journeys(from, to, API_KEY) : mock.mockJourneys();
    return send(res, 200, { journeys: list, source: MODE });
  }

  // GET /places?q=...
  if (url.pathname === '/places') {
    const q = url.searchParams.get('q') ?? '';
    const list = MODE === 'prim' ? await prim.places(q, API_KEY) : mock.mockPlaces(q);
    return send(res, 200, { places: list, source: MODE });
  }

  return send(res, 404, { error: 'Route inconnue' });
}

createServer((req, res) => {
  route(req, res).catch((e) => {
    const status = e instanceof prim.PrimError ? 502 : 500;
    console.error(e instanceof Error ? e.message : e);
    send(res, status, { error: status === 502 ? 'Source PRIM indisponible' : 'Erreur interne' });
  });
}).listen(PORT, () => {
  console.log(`Moteur Pilepoil prêt sur http://localhost:${PORT} (données : ${MODE === 'prim' ? 'PRIM' : 'simulées'})`);
});
