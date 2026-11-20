import type { GuideStop } from './trip';
import { localExit, minutesWord, t } from './i18n';

/**
 * Calcule l'état du guidage à un instant donné, sans rien demander au voyageur.
 * v0.1 : basé sur les horaires du trajet (temps réel du calculateur).
 * v0.2 : la position GPS et les capteurs du téléphone viendront confirmer ou corriger cet état.
 */
export type Phase = 'before' | 'at' | 'moving' | 'walking' | 'arrived';

export interface GuideState {
  phase: Phase;
  /** Index de l'arrêt courant (ou du dernier arrêt passé). */
  at: number;
  /** Avancement sur le segment en cours, de 0 à 1. */
  progress: number;
  /** Arrêt mis en avant (panneau de gare). */
  signIdx: number;
  card: { badge: string; badgeColor: string; badgeText: string; kicker: string; title: string; sub: string; pct: number };
  /** Données du grand affichage pas à pas (lisible de loin, pour tout le monde). */
  big: {
    /** Grand chiffre : minutes avant l'action (null = maintenant). */
    minutes: number | null;
    /** Ce que le chiffre compte : « avant de descendre », « avant ton train »… */
    minutesLabel: string;
    /** Arrêts restants avant de descendre. */
    stopsLeft?: number;
    /** Le prochain arrêt, pour se repérer par la fenêtre. */
    nextStop?: string;
    /** Où descendre / où aller. */
    target?: string;
    direction?: string;
    /** Phrase lue à voix haute. */
    speech: string;
  };
}

const DWELL_MS = 30_000; // temps passé « à quai » avant de considérer le train reparti
const short = (name: string) => name.split('-')[0].trim();
const mins = (ms: number) => Math.max(1, Math.round(ms / 60_000));

export function computeGuide(stops: GuideStop[], now: number): GuideState {
  const n = stops.length;
  const start = stops[0]?.at ?? now;
  const end = stops[n - 1]?.at ?? now;
  const pct = Math.min(1, Math.max(0, (now - start) / Math.max(1, end - start)));
  const rawExit = stops[n - 1]?.exit;
  const exit = rawExit ? localExit(rawExit) : undefined;
  const exitLower = exit ? exit.charAt(0).toLowerCase() + exit.slice(1) : '';

  if (n === 0 || now >= end) {
    const name = stops[n - 1]?.name ?? t('g.destination');
    return {
      phase: 'arrived', at: Math.max(0, n - 1), progress: 1, signIdx: Math.max(0, n - 1),
      card: { badge: exit ? exit.replace(/^\D+/, '') || '✓' : '✓', badgeColor: '#C8FF2E', badgeText: '#0E0F12', kicker: t('g.arrived'), title: exit ? t('g.takeExit', { exit: exitLower }) : t('g.arrived'), sub: stops[n - 1]?.name ?? '', pct: 1 },
      big: { minutes: null, minutesLabel: '', target: stops[n - 1]?.name, speech: t('g.arrivedSpeech', { name }) + (exit ? t('g.exitSpeech', { exit: exitLower }) : '') },
    };
  }

  const first = stops[0];
  if (now < start) {
    const m = mins(start - now);
    return {
      phase: 'before', at: 0, progress: 0, signIdx: 0,
      card: { badge: first.lineCode, badgeColor: first.color, badgeText: '#FFFFFF', kicker: t('g.towards', { dir: first.direction }), title: t('g.board', { line: first.lineCode }), sub: t('g.trainIn', { n: m }) + (first.tags[0] ? `, ${first.tags[0].charAt(0).toLowerCase()}${first.tags[0].slice(1)}` : ''), pct: 0 },
      big: {
        minutes: m, minutesLabel: t('g.beforeTrain'), direction: first.direction, target: first.name,
        speech: t('g.beforeSpeech', { line: first.lineCode, dir: first.direction, mins: minutesWord(m) }),
      },
    };
  }

  let i = 0;
  while (i + 1 < n && stops[i + 1].at <= now) i++;
  const cur = stops[i];
  const next = stops[i + 1];
  const progress = Math.min(1, Math.max(0, (now - cur.at) / Math.max(1, next.at - cur.at)));

  if (now - cur.at < DWELL_MS) {
    const title = cur.walkAfter ? t('g.getOffHere') : i === 0 ? t('g.board', { line: cur.lineCode }) : t('g.stopAt', { name: short(cur.name) });
    const sub = cur.walkAfter ? t('g.changeFor', { line: next.lineCode }) : i === 0 ? t('g.atPlatform') : t('g.stayIn');
    return {
      phase: 'at', at: i, progress: 0, signIdx: i,
      card: { badge: cur.lineCode, badgeColor: cur.color, badgeText: '#FFFFFF', kicker: cur.name, title, sub, pct },
      big: { minutes: null, minutesLabel: t('g.now'), target: cur.name, nextStop: next?.name, speech: `${title}. ${sub}.` },
    };
  }

  if (cur.walkAfter) {
    const m = mins(next.at - now);
    return {
      phase: 'walking', at: i, progress, signIdx: i + 1,
      card: { badge: next.lineCode, badgeColor: next.color, badgeText: '#FFFFFF', kicker: t('g.connection'), title: t('g.joinPlatform', { line: next.lineCode }), sub: t('g.walkSub', { where: next.platform ?? t('g.followSigns'), n: m }), pct },
      big: {
        minutes: m, minutesLabel: t('g.beforeTrain'), direction: next.direction, target: next.lineCode,
        speech: t('g.walkSpeech', { line: next.lineCode, dir: next.direction, mins: minutesWord(m) }),
      },
    };
  }

  let target = i + 1;
  while (target < n - 1 && !stops[target].walkAfter) target++;
  const count = target - i;
  const isNext = target === i + 1;
  const m = mins(stops[target].at - now);
  return {
    phase: 'moving', at: i, progress, signIdx: i + 1,
    card: {
      badge: cur.lineCode, badgeColor: cur.color, badgeText: '#FFFFFF',
      kicker: isNext ? t('g.nextStop') : t('g.towards', { dir: cur.direction }),
      title: isNext ? t('g.itsNext') : t('g.getOffAt', { name: short(stops[target].name) }),
      sub: isNext ? t('g.getOffIn', { name: short(stops[target].name), n: m }) : t('g.inStops', { n: m, count }),
      pct,
    },
    big: {
      minutes: m, minutesLabel: t('g.beforeGetOff'), stopsLeft: count,
      nextStop: next.name, target: stops[target].name, direction: cur.direction,
      speech: isNext ? t('g.prepareSpeech', { name: stops[target].name }) : t('g.staySpeech', { name: stops[target].name, count, mins: minutesWord(m) }),
    },
  };
}

/** Démo : instants clés du trajet, pour avancer d'étape en étape. */
export function nextDemoInstant(stops: GuideStop[], now: number): number | null {
  const moments = stops
    .flatMap((s, i) => (i === 0 || s.walkAfter ? [s.at - 20_000, s.at + 5000, s.at + DWELL_MS + 1000] : [s.at - 20_000, s.at + DWELL_MS + 1000]))
    .sort((a, b) => a - b);
  return moments.find((m) => m > now + 1000) ?? null;
}
