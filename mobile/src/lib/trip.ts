import AsyncStorage from '@react-native-async-storage/async-storage';
import { isExitTip, localExit, t } from './i18n';
import type { Journey, JourneyLeg, LegMode } from './types';

export interface Endpoints { from: string; fromName: string; to: string; toName: string }

/** Trajet en cours, partagé entre les écrans (une seule source de vérité, sans librairie). */
let current: Journey | null = null;
let options: Journey[] = [];
let endpoints: Endpoints | null = null;

const KEY = 'pilepoil_active_trip';
/** Un trajet terminé depuis plus de 15 min n'est plus proposé à la reprise. */
const RESUME_GRACE_MS = 15 * 60_000;

export const trip = {
  setOptions(list: Journey[]) {
    options = list;
  },
  options: () => options,
  setEndpoints(e: Endpoints) {
    endpoints = e;
  },
  endpoints: () => endpoints,
  select(id: string) {
    current = options.find((j) => j.id === id) ?? null;
  },
  current: () => current,
  /** Go : le trajet est gardé sur le téléphone, pour continuer même sans réseau ou après un redémarrage. */
  start() {
    if (!current) return;
    AsyncStorage.setItem(KEY, JSON.stringify({ journey: current, endpoints })).catch(() => null);
  },
  /** Recalcul : un nouveau trajet remplace l'ancien, sans repasser par l'écran de choix. */
  replace(j: Journey) {
    current = j;
    trip.start();
  },
  /** Trajet commencé et pas encore terminé, s'il y en a un. */
  async stored(): Promise<{ journey: Journey; endpoints: Endpoints | null } | null> {
    try {
      const raw = await AsyncStorage.getItem(KEY);
      if (!raw) return null;
      const v = JSON.parse(raw) as { journey: Journey; endpoints: Endpoints | null };
      if (Date.parse(v.journey.arrivalAt) + RESUME_GRACE_MS < Date.now()) {
        await AsyncStorage.removeItem(KEY);
        return null;
      }
      return v;
    } catch {
      return null;
    }
  },
  resume(v: { journey: Journey; endpoints: Endpoints | null }) {
    current = v.journey;
    endpoints = v.endpoints;
  },
  clear() {
    AsyncStorage.removeItem(KEY).catch(() => null);
  },
};

export const hhmm = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

export const transitLegs = (j: Journey): JourneyLeg[] => j.legs.filter((l) => l.mode !== 'walk');

/** Arrêt de guidage : un arrêt réel du trajet, avec la ligne qui y passe et ce qu'il faut y faire. */
export interface GuideStop {
  name: string;
  /** Mode du tronçon qui part de cet arrêt (métro, bus, tram…), pour l'animation. */
  mode: LegMode;
  lat?: number;
  lon?: number;
  at: number; // ms
  color: string;
  lineCode: string;
  direction: string;
  tags: string[];
  /** Le segment qui suit cet arrêt se fait à pied (correspondance). */
  walkAfter: boolean;
  /** Durée de marche prévue après cet arrêt, en minutes (si correspondance). */
  walkMin?: number;
  /** Quai à rejoindre en arrivant à cet arrêt par une correspondance (« Quai 14, vers Olympiades »). */
  platform?: string;
  /** Sortie à prendre, sur le dernier arrêt (« Sortie 3 »). */
  exit?: string;
  end: boolean;
}

export function guideStops(j: Journey): GuideStop[] {
  const legs = transitLegs(j);
  const out: GuideStop[] = [];
  legs.forEach((leg, li) => {
    leg.stops.forEach((s, si) => {
      const first = si === 0;
      const last = si === leg.stops.length - 1;
      const tags: string[] = [];
      if (first && leg.tips[0] && !isExitTip(leg.tips[0])) tags.push(leg.tips[0]);
      const platform = first && li > 0 ? t('g.platformTag', { line: leg.lineCode, dir: leg.direction }) : undefined;
      if (platform) tags.push(platform);
      const next = legs[li + 1];
      if (last && next) tags.push(t('g.changeTag', { line: next.lineCode }));
      const isEnd = last && li === legs.length - 1;
      const exit = isEnd ? leg.tips.find(isExitTip)?.split(',')[0].trim() : undefined;
      if (exit) tags.push(localExit(exit));
      const legIdx = j.legs.indexOf(leg);
      const walkLeg = last && next ? j.legs.slice(legIdx + 1, j.legs.indexOf(next)).find((l) => l.mode === 'walk') : undefined;
      out.push({
        name: s.name,
        mode: leg.mode,
        lat: s.lat,
        lon: s.lon,
        at: Date.parse(s.at),
        color: leg.lineColor,
        lineCode: leg.lineCode,
        direction: leg.direction,
        tags,
        walkAfter: last && !!next,
        walkMin: walkLeg?.durationMin,
        platform,
        exit,
        end: isEnd,
      });
    });
  });
  return out;
}
