import { privacyHtml, privacyReady } from './legal.ts';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { rate, stillUpcoming } from './reliability/freshness.ts';
import { detectAnomalies } from './reliability/detect.ts';
import { annotateServes } from './reliability/serves.ts';
import { History } from './store/history.ts';
import { Stats } from './store/stats.ts';
import { RateLimiter, TtlCache, cleanQuery, clientIp, coords, isEndpoint, isRef, normEndpoint } from './http/guard.ts';
import * as prim from './sources/prim.ts';
import type { Departure, Journey, Place, StopSnapshot } from './types.ts';
import { lineInfo, lineList, linesCount, loadLines } from './sources/lines.ts';
import { fetchTraffic, type LineTraffic } from './sources/traffic.ts';
import { fetchExits, type Exit } from './sources/exits.ts';

const PORT = Number(process.env.PORT ?? 8787);
const HOST = process.env.HOST ?? '0.0.0.0';
const VERSION = '0.3.0';
/** Derrière Nginx : faire confiance à X-Forwarded-For pour l'adresse réelle du client. */
const TRUST_PROXY = process.env.TRUST_PROXY === '1';
/** Facultatif : jeton anti-abus attendu dans l'en-tête x-pilepoil-key (ce n'est pas un secret fort, il est dans l'appli). */
const ACCESS_TOKEN = process.env.ACCESS_TOKEN?.trim() ?? '';
const RATE_PER_MIN = Number(process.env.RATE_PER_MIN ?? 120);
const API_KEY = process.env.PRIM_API_KEY ?? '';
const MODE = 'prim' as const;

// Pas de clé, pas de moteur : on ne sert jamais de données inventées.
if (!API_KEY) {
  console.error('PRIM_API_KEY manquante : ajoute ta clé PRIM dans engine/.env (voir .env.example). Arrêt.');
  process.exit(1);
}

/** Dernier succès et dernier échec PRIM, pour /health et la supervision. */
const primStatus = { lastOk: 0, lastError: 0, lastStatus: 0 as number | undefined, quota: false };
function primOk() { primStatus.lastOk = Date.now(); }
function primFail(e: unknown) {
  primStatus.lastError = Date.now();
  primStatus.lastStatus = (e as { status?: number })?.status;
  primStatus.quota = primStatus.lastStatus === 429;
}
/** Enveloppe chaque appel PRIM pour suivre sa santé. */
async function call<T>(p: Promise<T>): Promise<T> {
  try { const v = await p; primOk(); return v; } catch (e) { primFail(e); throw e; }
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
  const raw = await call(prim.stopMonitoring(stopRef, API_KEY));
  const departures = raw
    .filter((d) => stillUpcoming(d, now))
    .map(withLine)
    .map((d) => {
      const r = rate(d, now);
      const aimed = d.aimedAt ? Date.parse(d.aimedAt) : NaN;
      const prediction = Number.isNaN(aimed) ? undefined : stats.predict(d.lineRef, stopRef, aimed);
      return prediction ? { ...r, prediction } : r;
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
const directCache = new TtlCache<prim.DirectRide[]>(60_000, 2000);
const walkCache = new TtlCache<Awaited<ReturnType<typeof prim.walkTo>>>(5 * 60_000, 2000);
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
    try {
      trafficCache = { at: Date.now(), lines: await call(fetchTraffic(API_KEY)) };
    } catch (e: any) {
      // 401/403 : l'abonnement « Messages Info Trafic » manque sur le compte PRIM. 429 : quota du jour atteint.
      const why = e?.status === 401 || e?.status === 403 ? 'abonnement' : e?.status === 429 ? 'quota' : 'indisponible';
      console.warn(e?.message ?? e);
      // On garde les dernières lignes connues, mais on dit qu'elles ne sont plus à jour.
      trafficCache = { at: trafficCache?.at ?? Date.now(), lines: trafficCache?.lines ?? [], error: why };
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
  try { list = await fetchExits(areaNumber); } catch (e: any) { console.warn('Sorties indisponibles :', e?.message ?? e); }
  exitsCache.set(areaNumber, { at: Date.now(), exits: list });
  return list;
}

async function route(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const parts = url.pathname.split('/').filter(Boolean);

  if (req.method === 'OPTIONS') return send(res, 204, null);
  if (req.method !== 'GET') return send(res, 405, { error: 'Méthode non autorisée' });
  if ((req.url ?? '').length > 512) return send(res, 414, { error: 'Requête trop longue' });

  // GET /confidentialite : la politique de confidentialité, publique (lien des fiches App Store et Google Play).
  if (url.pathname === '/confidentialite' || url.pathname === '/privacy') {
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'",
      'Cache-Control': 'public, max-age=3600',
    });
    return res.end(privacyHtml);
  }

  // GET /health : l'état du moteur et de sa source, pour la supervision (pas de donnée sensible).
  if (url.pathname === '/health') {
    const primUp = primStatus.lastOk >= primStatus.lastError || primStatus.lastOk === 0;
    return send(res, 200, {
      ok: true, mode: MODE, version: VERSION, privacyReady,
      prim: { up: primUp, quotaReached: primStatus.quota, lastOk: primStatus.lastOk ? new Date(primStatus.lastOk).toISOString() : null },
      lines: linesCount(),
    });
  }

  if (!tokenOk(req)) return send(res, 401, { error: 'Clé client absente ou invalide' });
  if (!limiter.allow(clientIp(req, TRUST_PROXY))) return send(res, 429, { error: 'Trop de requêtes, réessaie dans un instant' });

  // GET /lines : toutes les lignes ferrées, tram et câble (pour les grilles Trafic), depuis le référentiel IDFM
  if (url.pathname === '/lines') {
    const list = lineList(['metro', 'rail', 'tram', 'funicular', 'cableway']).map((l) => ({
      id: l.id, code: l.code, color: l.color, textColor: l.textColor, mode: l.mode, submode: l.submode, name: l.name,
    }));
    return send(res, 200, { lines: list });
  }

  // GET /traffic : état de toutes les lignes et perturbations en cours
  if (url.pathname === '/traffic') return send(res, 200, await traffic());

  // GET /nearby?lon=..&lat=.. : arrêts autour de soi, avec leurs prochains passages
  if (url.pathname === '/nearby') {
    const c = coords(url.searchParams.get('lon'), url.searchParams.get('lat'));
    if (!c) return send(res, 400, { error: 'lon et lat obligatoires' });
    // Arrondi à ~100 m : deux voisins partagent le même appel, et la position exacte n'est pas gardée.
    const key = `${c.lon.toFixed(3)};${c.lat.toFixed(3)}`;
    const list = await nearbyCache.wrap(key, () => call(prim.nearby(Number(c.lon.toFixed(3)), Number(c.lat.toFixed(3)), API_KEY)));
    // Les 5 plus proches : assez pour la carte, sans épuiser le quota (chaque arrêt est en cache 20 s).
    const top = list.slice(0, 5);
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
    const snap = await stopSnapshot(ref);
    // ?to=stop_area:IDFM:… : chaque passage dit s'il s'arrête à cette gare.
    const to = url.searchParams.get('to');
    if (to && isRef(to)) {
      const from = `stop_area:IDFM:${ref.split(':').filter(Boolean).pop()}`;
      const rides = await directCache.wrap(`${from}>${to}`, () => call(prim.direct(from, to, API_KEY))).catch(() => [] as prim.DirectRide[]);
      return send(res, 200, { ...snap, to, departures: annotateServes(snap.departures, rides), direct: rides.slice(0, 6) });
    }
    return send(res, 200, snap);
  }

  // GET /journeys?from=...&to=...
  if (url.pathname === '/journeys') {
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');
    if (!isEndpoint(from) || !isEndpoint(to)) return send(res, 400, { error: 'Paramètres from et to obligatoires' });
    const a = normEndpoint(from), b = normEndpoint(to);
    const list = await journeysCache.wrap(`${a}>${b}`, () => call(prim.journeys(a, b, API_KEY)));
    return send(res, 200, { journeys: list, source: MODE });
  }

  // GET /walk?from=lon;lat&to=… : itinéraire piéton détaillé (tracé + consignes rue par rue)
  if (url.pathname === '/walk') {
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');
    if (!isEndpoint(from) || !isEndpoint(to)) return send(res, 400, { error: 'Paramètres from et to obligatoires' });
    const a = normEndpoint(from), b = normEndpoint(to);
    // Arrondi du départ à ~10 m pour partager le cache entre deux recalculs rapprochés.
    const key = `${a.replace(/(\d+\.\d{4})\d+/g, '$1')}>${b}`;
    const leg = await walkCache.wrap(key, () => call(prim.walkTo(a, b, API_KEY)));
    return send(res, leg ? 200 : 404, leg ? { leg } : { error: 'Pas d’itinéraire à pied' });
  }

  // GET /places?q=...
  if (url.pathname === '/places') {
    const q = cleanQuery(url.searchParams.get('q'));
    if (!q) return send(res, 200, { places: [], source: MODE });
    const list = await placesCache.wrap(q.toLowerCase(), () => call(prim.places(q, API_KEY)));
    return send(res, 200, { places: list, source: MODE });
  }

  return send(res, 404, { error: 'Route inconnue' });
}

const server = createServer((req, res) => {
  route(req, res).catch((e) => {
    const quota = e instanceof prim.PrimError && e.status === 429;
    const status = quota ? 503 : e instanceof prim.PrimError || e?.name === 'TimeoutError' ? 502 : 500;
    console.error(e instanceof Error ? e.message : e);
    if (!res.headersSent) {
      if (quota) res.setHeader('Retry-After', '300');
      send(res, status, { error: quota ? 'quota' : status === 502 ? 'Source PRIM indisponible' : 'Erreur interne' });
    }
  });
});
server.requestTimeout = 20_000;
server.headersTimeout = 10_000;
server.keepAliveTimeout = 5_000;
server.listen(PORT, HOST, () => {
  console.log(`Moteur Pilepoil ${VERSION} prêt sur http://${HOST}:${PORT} (données : PRIM, temps réel)`);
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
