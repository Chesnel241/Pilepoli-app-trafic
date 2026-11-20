import { coordOf, simplify } from '../geo/simplify.ts';
import type { Departure, Journey, JourneyLeg, LegMode, Place } from '../types.ts';
import { weakest } from '../reliability/freshness.ts';

/**
 * Client PRIM (Île-de-France Mobilités).
 * - Prochains passages : SIRI Lite « stop-monitoring »
 * - Itinéraires et lieux : calculateur Navitia v2
 * La clé API passe dans l'en-tête `apikey`. Elle ne doit jamais être loggée.
 */
const BASE = 'https://prim.iledefrance-mobilites.fr/marketplace';

export class PrimError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

async function get(path: string, params: Record<string, string | number>, apiKey: string): Promise<any> {
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const res = await fetch(url, {
    headers: { apikey: apiKey, Accept: 'application/json', 'Accept-Encoding': 'gzip' },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new PrimError(`PRIM ${path} a répondu ${res.status}`, res.status);
  return res.json();
}

/* ---------- Prochains passages (SIRI Lite) ---------- */

const val = (x: any): string | undefined => (Array.isArray(x) ? x[0]?.value : x?.value) ?? undefined;

export function parseStopMonitoring(json: any): Departure[] {
  const deliveries = json?.Siri?.ServiceDelivery?.StopMonitoringDelivery ?? [];
  const visits: any[] = deliveries.flatMap((d: any) => d?.MonitoredStopVisit ?? []);
  return visits.map((v) => {
    const mvj = v.MonitoredVehicleJourney ?? {};
    const call = mvj.MonitoredCall ?? {};
    const lineRef: string = val(mvj.LineRef) ?? '';
    return {
      journeyRef: mvj.FramedVehicleJourneyRef?.DatedVehicleJourneyRef ?? v.ItemIdentifier ?? '',
      lineRef,
      lineCode: val(mvj.PublishedLineName) ?? lineRef.split(':').filter(Boolean).pop() ?? '?',
      destination: val(call.DestinationDisplay) ?? val(mvj.DestinationName) ?? '',
      direction: val(mvj.DirectionName),
      aimedAt: call.AimedDepartureTime ?? call.AimedArrivalTime ?? null,
      expectedAt: call.ExpectedDepartureTime ?? call.ExpectedArrivalTime ?? null,
      recordedAt: v.RecordedAtTime ?? null,
      operatorStatus: call.DepartureStatus ?? call.ArrivalStatus,
      vehicleAtStop: call.VehicleAtStop,
      platform: val(call.ArrivalPlatformName) ?? val(call.DeparturePlatformName),
    } satisfies Departure;
  });
}

export async function stopMonitoring(stopRef: string, apiKey: string): Promise<Departure[]> {
  return parseStopMonitoring(await get('/stop-monitoring', { MonitoringRef: stopRef }, apiKey));
}

/* ---------- Itinéraires et lieux (Navitia v2) ---------- */

/** Navitia renvoie des dates « 20261118T211500 » en heure locale de Paris. */
export function navitiaDate(s: string): string {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/.exec(s);
  if (!m) return s;
  const [, y, mo, d, h, mi, se] = m;
  // Décalage Paris : +01:00 en hiver, +02:00 en été (dernier dimanche de mars / octobre).
  const naive = Date.UTC(+y, +mo - 1, +d, +h, +mi, +se);
  const offset = parisOffsetHours(naive);
  return new Date(naive - offset * 3600_000).toISOString();
}

function parisOffsetHours(utcGuess: number): number {
  const y = new Date(utcGuess).getUTCFullYear();
  const lastSunday = (month: number) => {
    const d = new Date(Date.UTC(y, month + 1, 0));
    d.setUTCDate(d.getUTCDate() - d.getUTCDay());
    return d.getTime() + 3600_000; // 01:00 UTC
  };
  return utcGuess >= lastSunday(2) && utcGuess < lastSunday(9) ? 2 : 1;
}

function modeOf(section: any): LegMode {
  if (section.type !== 'public_transport') return 'walk';
  const pm = String(section.display_informations?.physical_mode ?? '').toLowerCase();
  if (pm.includes('métro') || pm.includes('metro')) return 'metro';
  if (pm.includes('rer')) return 'rer';
  if (pm.includes('train')) return 'train';
  if (pm.includes('tram')) return 'tram';
  if (pm.includes('bus')) return 'bus';
  if (pm.includes('câble') || pm.includes('cable') || pm.includes('téléphérique') || pm.includes('funiculaire')) return 'cable';
  if (pm.includes('bateau') || pm.includes('navette fluviale') || pm.includes('ferry') || pm.includes('boat')) return 'boat';
  return 'other';
}

export function parseJourneys(json: any): Journey[] {
  const journeys: any[] = json?.journeys ?? [];
  return journeys.map((j, idx) => {
    const legs: JourneyLeg[] = (j.sections ?? [])
      .filter((s: any) => ['public_transport', 'street_network', 'transfer'].includes(s.type) && (s.duration ?? 0) > 0)
      .map((s: any): JourneyLeg => {
        const di = s.display_informations ?? {};
        return {
          mode: modeOf(s),
          lineCode: di.code ?? '',
          lineColor: di.color ? `#${di.color}` : '#0E0F12',
          lineTextColor: di.text_color ? `#${di.text_color}` : '#FFFFFF',
          direction: di.direction ?? '',
          from: s.from?.name ?? '',
          to: s.to?.name ?? '',
          toId: s.to?.stop_point?.stop_area?.id ?? (s.to?.embedded_type === 'stop_area' ? s.to?.id : undefined),
          departureAt: navitiaDate(s.departure_date_time),
          arrivalAt: navitiaDate(s.arrival_date_time),
          durationMin: Math.round((s.duration ?? 0) / 60),
          stops: (s.stop_date_times ?? []).map((st: any) => ({
            name: st.stop_point?.name ?? '',
            at: navitiaDate(st.departure_date_time ?? st.arrival_date_time),
            ...coordOf(st.stop_point?.coord),
          })),
          path: simplify(s.geojson?.coordinates),
          tips: [],
        };
      });
    const realtime = (j.sections ?? []).some((s: any) => s.data_freshness === 'realtime');
    return {
      id: `j${idx}`,
      departureAt: navitiaDate(j.departure_date_time),
      arrivalAt: navitiaDate(j.arrival_date_time),
      durationMin: Math.round((j.duration ?? 0) / 60),
      transfers: j.nb_transfers ?? 0,
      legs,
      // Le calculateur ne donne qu'un indicateur global : on l'affine ensuite avec nos propres relevés.
      reliability: weakest([realtime ? 'direct' : 'theorique']),
    };
  });
}

export async function journeys(from: string, to: string, apiKey: string): Promise<Journey[]> {
  return parseJourneys(await get('/v2/navitia/journeys', { from, to, count: 3, data_freshness: 'realtime' }, apiKey));
}

export async function places(q: string, apiKey: string): Promise<Place[]> {
  const json = await get('/v2/navitia/places', { q, count: 8 }, apiKey);
  return (json?.places ?? []).map((p: any) => ({ id: p.id, name: p.name, kind: p.embedded_type }));
}

/* ---------- Arrêts proches (Navitia places_nearby) ---------- */

export interface NearbyStop {
  /** Référence SIRI pour les prochains passages (STIF:StopArea:SP:71410:). */
  stopRef: string;
  /** Identifiant Navitia (stop_area:IDFM:71410), utile pour les itinéraires. */
  placeId: string;
  /** Numéro de la zone (71410), utile pour les sorties. */
  areaNumber: string;
  name: string;
  distance: number;
  lat?: number;
  lon?: number;
}

/** stop_area:IDFM:71410 → STIF:StopArea:SP:71410: */
export const stopRefOf = (placeId: string) => `STIF:StopArea:SP:${placeId.split(':').pop()}:`;

export function parseNearby(json: any): NearbyStop[] {
  return (json?.places_nearby ?? [])
    .filter((p: any) => p.embedded_type === 'stop_area' && typeof p.id === 'string')
    .map((p: any) => ({
      stopRef: stopRefOf(p.id),
      placeId: p.id,
      areaNumber: p.id.split(':').pop(),
      name: p.stop_area?.name ?? p.name ?? '',
      distance: Math.round(Number(p.distance ?? 0)),
      ...coordOf(p.stop_area?.coord),
    }));
}

export async function nearby(lon: number, lat: number, apiKey: string): Promise<NearbyStop[]> {
  const json = await get(`/v2/navitia/coord/${lon};${lat}/places_nearby`, { 'type[]': 'stop_area', distance: 700, count: 8 }, apiKey);
  return parseNearby(json);
}
