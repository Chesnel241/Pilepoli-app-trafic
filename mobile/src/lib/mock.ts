import type { Journey, LineTraffic, StopSnapshot } from './types';

/**
 * Données de secours quand le moteur ne répond pas (même scénario que la maquette).
 * Horaires recalculés par rapport à maintenant.
 */
const t = (now: number, m: number) => new Date(now + m * 60_000).toISOString();

export function localJourneys(now = Date.now()): Journey[] {
  return [
    {
      id: 'local-fiable', tag: 'plus_fiable', reliability: 'direct',
      departureAt: t(now, 0), arrivalAt: t(now, 27), durationMin: 27, transfers: 1,
      legs: [
        { mode: 'walk', lineCode: '', lineColor: '#0E0F12', lineTextColor: '#FFFFFF', direction: '', from: 'Ta position', to: 'Gare du Nord',
          departureAt: t(now, 0), arrivalAt: t(now, 3), durationMin: 3, stops: [], tips: ["Entre par l'accès 6"] },
        { mode: 'rer', lineCode: 'B', lineColor: '#3C91DC', lineTextColor: '#FFFFFF', direction: 'Robinson / Saint-Rémy', from: 'Gare du Nord', to: 'Châtelet-Les Halles',
          departureAt: t(now, 3), arrivalAt: t(now, 7), durationMin: 4,
          stops: [{ name: 'Gare du Nord', at: t(now, 3) }, { name: 'Châtelet-Les Halles', at: t(now, 7) }], tips: ['Monte en tête de train'] },
        { mode: 'walk', lineCode: '', lineColor: '#0E0F12', lineTextColor: '#FFFFFF', direction: '', from: 'Châtelet-Les Halles', to: 'Châtelet-Les Halles',
          departureAt: t(now, 7), arrivalAt: t(now, 11), durationMin: 4, stops: [], tips: ['Suis le A rouge'] },
        { mode: 'rer', lineCode: 'A', lineColor: '#E3051C', lineTextColor: '#FFFFFF', direction: 'Ouest', from: 'Châtelet-Les Halles', to: 'La Défense', toId: 'stop_area:IDFM:mock-la-defense',
          departureAt: t(now, 11), arrivalAt: t(now, 24), durationMin: 13,
          stops: [
            { name: 'Châtelet-Les Halles', at: t(now, 11) }, { name: 'Auber', at: t(now, 14) },
            { name: 'Charles-de-Gaulle Étoile', at: t(now, 17) }, { name: 'La Défense', at: t(now, 24) },
          ], tips: ['Sortie 3, Grande Arche'] },
        { mode: 'walk', lineCode: '', lineColor: '#0E0F12', lineTextColor: '#FFFFFF', direction: '', from: 'La Défense', to: 'Destination',
          departureAt: t(now, 24), arrivalAt: t(now, 27), durationMin: 3, stops: [], tips: [] },
      ],
    },
    {
      id: 'local-direct', tag: 'direct', reliability: 'pas_vu',
      departureAt: t(now, 1), arrivalAt: t(now, 24), durationMin: 23, transfers: 0,
      legs: [
        { mode: 'rer', lineCode: 'E', lineColor: '#C04191', lineTextColor: '#FFFFFF', direction: 'Nanterre', from: 'Magenta', to: 'La Défense',
          departureAt: t(now, 4), arrivalAt: t(now, 20), durationMin: 16,
          stops: [{ name: 'Magenta', at: t(now, 4) }, { name: 'La Défense', at: t(now, 20) }], tips: [] },
      ],
    },
  ];
}

export function localDepartures(stopRef: string): StopSnapshot {
  return {
    stopRef, fetchedAt: new Date().toISOString(), source: 'local',
    departures: [
      { journeyRef: 'l1', lineCode: 'B', destination: 'Robinson', direction: 'Sud', aimedAt: null, expectedAt: null, reliability: 'direct', ageSeconds: 15, minutes: 3, range: { min: 3, max: 4 }, label: 'En direct' },
      { journeyRef: 'l2', lineCode: '38', destination: "Porte d'Orléans", aimedAt: null, expectedAt: null, reliability: 'estime', ageSeconds: 110, minutes: 7, range: { min: 5, max: 9 }, label: 'Estimé' },
      { journeyRef: 'l3', lineCode: '302', destination: 'Stains', aimedAt: null, expectedAt: null, reliability: 'pas_vu', ageSeconds: 720, minutes: null, range: null, label: 'Pas vu depuis 12 min' },
    ],
  };
}

export function localTraffic(): LineTraffic[] {
  return [
    { lineId: 'l-E', code: 'E', color: '#C04191', textColor: '#FFFFFF', mode: 'rer', level: 'perturbe',
      disruptions: [{ id: 'l1', level: 'perturbe', title: 'Trafic perturbé entre Magenta et Nanterre', message: 'Incident technique. Prévoir un temps de parcours allongé.' }] },
  ];
}
