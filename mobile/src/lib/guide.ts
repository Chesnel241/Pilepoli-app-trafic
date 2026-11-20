import type { GuideStop } from './trip';

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
  const exit = stops[n - 1]?.tags.find((t) => t.startsWith('Sortie'));

  if (n === 0 || now >= end) {
    return {
      phase: 'arrived', at: Math.max(0, n - 1), progress: 1, signIdx: Math.max(0, n - 1),
      card: { badge: exit ? exit.replace('Sortie ', '') : '✓', badgeColor: '#C8FF2E', badgeText: '#0E0F12', kicker: 'Tu es arrivé', title: exit ? `Prends la ${exit.toLowerCase()}` : 'Tu es arrivé', sub: stops[n - 1]?.name ?? '', pct: 1 },
      big: { minutes: null, minutesLabel: '', target: stops[n - 1]?.name, speech: `Tu es arrivé à ${stops[n - 1]?.name ?? 'destination'}.${exit ? ` Prends la ${exit.toLowerCase()}.` : ''}` },
    };
  }

  const first = stops[0];
  if (now < start) {
    return {
      phase: 'before', at: 0, progress: 0, signIdx: 0,
      card: { badge: first.lineCode, badgeColor: first.color, badgeText: '#FFFFFF', kicker: `Vers ${first.direction}`, title: `Monte dans le ${first.lineCode}`, sub: `Train dans ${mins(start - now)} min${first.tags[0] ? `, ${first.tags[0].toLowerCase()}` : ''}`, pct: 0 },
      big: {
        minutes: mins(start - now), minutesLabel: 'avant ton train', direction: first.direction, target: first.name,
        speech: `Va au quai de la ligne ${first.lineCode}, direction ${first.direction}. Ton train arrive dans ${mins(start - now)} minutes.`,
      },
    };
  }

  let i = 0;
  while (i + 1 < n && stops[i + 1].at <= now) i++;
  const cur = stops[i];
  const next = stops[i + 1];
  const progress = Math.min(1, Math.max(0, (now - cur.at) / Math.max(1, next.at - cur.at)));

  if (now - cur.at < DWELL_MS) {
    const title = cur.walkAfter ? 'Descends ici' : i === 0 ? `Monte dans le ${cur.lineCode}` : `Arrêt ${short(cur.name)}`;
    const sub = cur.walkAfter ? `Change pour le ${next.lineCode}` : i === 0 ? 'Il est à quai' : 'Reste dans le train';
    return {
      phase: 'at', at: i, progress: 0, signIdx: i,
      card: { badge: cur.lineCode, badgeColor: cur.color, badgeText: '#FFFFFF', kicker: cur.name, title, sub, pct },
      big: {
        minutes: null, minutesLabel: 'maintenant', target: cur.name, nextStop: next?.name,
        speech: `${title}. ${sub}.`,
      },
    };
  }

  if (cur.walkAfter) {
    return {
      phase: 'walking', at: i, progress, signIdx: i + 1,
      card: { badge: next.lineCode, badgeColor: next.color, badgeText: '#FFFFFF', kicker: 'Correspondance', title: `Rejoins le quai du ${next.lineCode}`, sub: `${next.tags.find((t) => t.startsWith('Quai')) ?? 'Suis les panneaux'}, train dans ${mins(next.at - now)} min`, pct },
      big: {
        minutes: mins(next.at - now), minutesLabel: 'avant ton train', direction: next.direction, target: next.lineCode,
        speech: `Change pour la ligne ${next.lineCode}, direction ${next.direction}. Suis les panneaux. Ton train part dans ${mins(next.at - now)} minutes.`,
      },
    };
  }

  let target = i + 1;
  while (target < n - 1 && !stops[target].walkAfter) target++;
  const count = target - i;
  const isNext = target === i + 1;
  return {
    phase: 'moving', at: i, progress, signIdx: i + 1,
    card: {
      badge: cur.lineCode, badgeColor: cur.color, badgeText: '#FFFFFF',
      kicker: isNext ? 'Prochain arrêt' : `Vers ${cur.direction}`,
      title: isNext ? 'C’est le prochain !' : `Descends à ${short(stops[target].name)}`,
      sub: isNext ? `Descends à ${short(stops[target].name)} dans ${mins(stops[target].at - now)} min` : `Dans ${mins(stops[target].at - now)} min, ${count} arrêts`,
      pct,
    },
    big: {
      minutes: mins(stops[target].at - now), minutesLabel: 'avant de descendre', stopsLeft: count,
      nextStop: next.name, target: stops[target].name, direction: cur.direction,
      speech: isNext
        ? `Prépare-toi. Tu descends au prochain arrêt, ${stops[target].name}.`
        : `Reste dans le train. Tu descends à ${stops[target].name}, dans ${count} arrêts, environ ${mins(stops[target].at - now)} minutes.`,
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
