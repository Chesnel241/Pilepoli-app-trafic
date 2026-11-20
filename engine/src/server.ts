import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { rate, stillUpcoming } from './reliability/freshness.ts';
import { detectAnomalies } from './reliability/detect.ts';
import { History } from './store/history.ts';
import { Stats } from './store/stats.ts';
import { RateLimiter, TtlCache, cleanQuery, clientIp, coords, isEndpoint, isRef } from './http/guard.ts';
import * as prim from './sources/prim.ts';
import * as mock from './sources/mock.ts';
import type { Departure, Journey, Place, StopSnapshot } from './types.ts';
import { lineInfo, loadLines } from './sources/lines.ts';
import { fetchTraffic, mockTraffic, type LineTraffic } from './sources/traffic.ts';
import { fetchExits, mockExits, type Exit } from './sources/exits.ts';

const PORT = Number(process.env.PORT ?? 8787);
const HOST = process.env.HOST ?? '0.0.0.0';
const VERSION = '0.3.0';
/** Derrière Nginx : faire confiance à X-Forwarded-For pour l'adresse réelle du client. */
const TRUST_PROXY = process.env.TRUST_PROXY === '1';
/** Facultatif : jeton anti-abus attendu dans l'en-tête x-pilepoil-key (ce n'est pas un secret fort, il est dans l'appli). */
const ACCESS_TOKEN = process.env.ACCESS_TOKEN?.trim() ?? '';
const RATE_PER_MIN = Number(process.env.RATE_PER_MIN ?? 120);
const API_KEY = process.env.PRIM_API_KEY ?? '';
const MODE: 'prim' | 'mock' = process.env.DATA_MODE === 'prim' && API_KEY ? 'prim' : 'mock';

if (process.env.DATA_MODE === 'prim' && !API_KEY) {
  console.warn('DATA_MODE=prim mais PRIM_API_KEY est vide : passage en données simulées.');
}

const DATA_DIR = process.env.DATA_DIR ?? new URL('../data/', import.meta.url).pathname;
const history = new History(`${DATA_DIR}/observations.jsonl`, process.env.HISTORY_LOG === '1');
const stats = new Stats(`${DATA_DIR}/stats.json`);
await stats.load();
const saveTimer = setInterval(() => stats.save().catch((e) => console.error('Stats non écrites :', e.message)), 5 * 60_000);
saveTimer.unref();
loadLines(`${DATA_DIR}/lines.json`);

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
    .map((d) => {
      const r = rate(d, now);
      const aimed = d.aimedAt ? Date.parse(d.aimedAt) : NaN;
      const prediction = Number.isNaN(aimed) ? undefined : stats.predict(d.lineRef, stopRef, aimed);
      if (prediction) return { ...r, prediction };
      // Données simulées : une fausse prédiction sur une ligne, pour voir l'affichage en démo.
      if (MODE === 'mock' && r.mode !== 'bus' && r.lineCode.length === 1) return { ...r, prediction: { typicalDelayMin: 2, badDayDelayMin: 6, samples: 40 } };
      return r;
    })
    .sort((a, b) => (a.minutes ?? 999) - (b.minutes ?? 999));
  stats.observe(stopRef, departures, now);
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
    // L'appli mobile n'a pas besoin de CORS ; on ne l'ouvre que si ALLOWED_ORIGIN est défini (version web).
    ...(process.env.ALLOWED_ORIGIN ? { 'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN, Vary: 'Origin' } : {}),
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Cache-Control': 'no-store',
    'Cross-Origin-Resource-Policy': 'same-site',
  });
  res.end(body === null ? undefined : JSON.stringify(body));
}

const limiter = new RateLimiter(RATE_PER_MIN, Math.max(20, Math.round(RATE_PER_MIN / 2)));
const placesCache = new TtlCache<Place[]>(10 * 60_000);
const journeysCache = new TtlCache<Journey[]>(30_000, 500);
const nearbyCache = new TtlCache<Awaited<ReturnType<typeof prim.nearby>>>(5 * 60_000, 2000);

function tokenOk(req: IncomingMessage): boolean {
  if (!ACCESS_TOKEN) return true;
  const got = Buffer.from(String(req.headers['x-pilepoil-key'] ?? ''));
  const want = Buffer.from(ACCESS_TOKEN);
  return got.length === want.length && timingSafeEqual(got, want);
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
  if ((req.url ?? '').length > 512) return send(res, 414, { error: 'Requête trop longue' });

  if (url.pathname === '/health') return send(res, 200, { ok: true, mode: MODE, version: VERSION });

  if (!tokenOk(req)) return send(res, 401, { error: 'Clé client absente ou invalide' });
  if (!limiter.allow(clientIp(req, TRUST_PROXY))) return send(res, 429, { error: 'Trop de requêtes, réessaie dans un instant' });

  // GET /traffic : état de toutes les lignes et perturbations en cours
  if (url.pathname === '/traffic') return send(res, 200, await traffic());

  // GET /nearby?lon=..&lat=.. : arrêts autour de soi, avec leurs prochains passages
  if (url.pathname === '/nearby') {
    const c = coords(url.searchParams.get('lon'), url.searchParams.get('lat'));
    if (!c) return send(res, 400, { error: 'lon et lat obligatoires' });
    // Arrondi à ~100 m : deux voisins partagent le même appel, et la position exacte n'est pas gardée.
    const key = `${c.lon.toFixed(3)};${c.lat.toFixed(3)}`;
    const list = MODE === 'prim' ? await nearbyCache.wrap(key, () => prim.nearby(Number(c.lon.toFixed(3)), Number(c.lat.toFixed(3)), API_KEY)) : mock.mockNearby();
    const top = list.slice(0, 3);
    const snaps = await Promise.all(top.map((st) => stopSnapshot(st.stopRef).catch(() => null)));
    return send(res, 200, {
      stops: top.map((st, i) => ({ ...st, departures: snaps[i]?.departures.slice(0, 4) ?? [], anomalies: snaps[i]?.anomalies ?? [] })),
      source: MODE,
    });
  }

  // GET /stops/:areaNumber/exits : sorties d'une gare (ex. /stops/71410/exits)
  if (parts[0] === 'stops' && parts[2] === 'exits' && parts[1]) {
    const raw = decodeURIComponent(parts[1]);
    if (!isRef(raw)) return send(res, 400, { error: 'Identifiant de gare invalide' });
    const n = raw.split(':').filter(Boolean).pop() ?? '';
    return send(res, 200, { exits: await exits(n), source: MODE });
  }

  // GET /stops/:stopRef/departures   ex. /stops/STIF:StopArea:SP:71410:/departures
  if (parts[0] === 'stops' && parts[2] === 'departures' && parts[1]) {
    const ref = decodeURIComponent(parts[1]);
    if (!isRef(ref)) return send(res, 400, { error: "Identifiant d'arrêt invalide" });
    return send(res, 200, await stopSnapshot(ref));
  }

  // GET /journeys?from=...&to=...
  if (url.pathname === '/journeys') {
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');
    if (!isEndpoint(from) || !isEndpoint(to)) return send(res, 400, { error: 'Paramètres from et to obligatoires' });
    const list = MODE === 'prim' ? await journeysCache.wrap(`${from}>${to}`, () => prim.journeys(from, to, API_KEY)) : mock.mockJourneys();
    return send(res, 200, { journeys: list, source: MODE });
  }

  // GET /places?q=...
  if (url.pathname === '/places') {
    const q = cleanQuery(url.searchParams.get('q'));
    if (!q) return send(res, 200, { places: [], source: MODE });
    const list = MODE === 'prim' ? await placesCache.wrap(q.toLowerCase(), () => prim.places(q, API_KEY)) : mock.mockPlaces(q);
    return send(res, 200, { places: list, source: MODE });
  }

  return send(res, 404, { error: 'Route inconnue' });
}

const server = createServer((req, res) => {
  route(req, res).catch((e) => {
    const status = e instanceof prim.PrimError ? 502 : 500;
    console.error(e instanceof Error ? e.message : e);
    if (!res.headersSent) send(res, status, { error: status === 502 ? 'Source PRIM indisponible' : 'Erreur interne' });
  });
});
server.requestTimeout = 20_000;
server.headersTimeout = 10_000;
server.keepAliveTimeout = 5_000;
server.listen(PORT, HOST, () => {
  console.log(`Moteur Pilepoil ${VERSION} prêt sur http://${HOST}:${PORT} (données : ${MODE === 'prim' ? 'PRIM' : 'simulées'})`);
  if (ACCESS_TOKEN) console.log('Clé client exigée (ACCESS_TOKEN)');
});

/** Arrêt propre (docker stop, Ctrl+C) : on termine les requêtes et on sauvegarde ce qu'on a appris. */
async function shutdown(signal: string) {
  console.log(`${signal} reçu, arrêt du moteur…`);
  server.close();
  await stats.save().catch((e) => console.error('Stats non écrites :', e.message));
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
