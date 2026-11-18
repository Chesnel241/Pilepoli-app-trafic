import type { Journey, JourneyLeg } from './types';

/** Trajet en cours, partagé entre les écrans (une seule source de vérité, sans librairie). */
let current: Journey | null = null;
let options: Journey[] = [];

export const trip = {
  setOptions(list: Journey[]) {
    options = list;
  },
  options: () => options,
  select(id: string) {
    current = options.find((j) => j.id === id) ?? null;
  },
  current: () => current,
};

export const hhmm = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

export const transitLegs = (j: Journey): JourneyLeg[] => j.legs.filter((l) => l.mode !== 'walk');

/** Arrêt de guidage : un arrêt réel du trajet, avec la ligne qui y passe et ce qu'il faut y faire. */
export interface GuideStop {
  name: string;
  at: number; // ms
  color: string;
  lineCode: string;
  direction: string;
  tags: string[];
  /** Le segment qui suit cet arrêt se fait à pied (correspondance). */
  walkAfter: boolean;
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
      if (first && leg.tips[0] && !leg.tips[0].startsWith('Sortie')) tags.push(leg.tips[0]);
      if (first && li > 0) tags.push(`Quai ${leg.lineCode}, vers ${leg.direction}`);
      const next = legs[li + 1];
      if (last && next) tags.push(`Change pour le ${next.lineCode}`);
      const isEnd = last && li === legs.length - 1;
      if (isEnd) leg.tips.filter((t) => t.startsWith('Sortie')).forEach((t) => tags.push(t.split(',')[0]));
      out.push({
        name: s.name,
        at: Date.parse(s.at),
        color: leg.lineColor,
        lineCode: leg.lineCode,
        direction: leg.direction,
        tags,
        walkAfter: last && !!next,
        end: isEnd,
      });
    });
  });
  return out;
}
