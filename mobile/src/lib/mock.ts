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
          departureAt: t(now, 0), arrivalAt: t(now, 3), durationMin: 3, stops: [], path: [[2.358, 48.8795], [2.3553, 48.8809]], tips: ["Entre par l'accès 6"] },
        { mode: 'rer', lineCode: 'B', lineColor: '#3C91DC', lineTextColor: '#FFFFFF', direction: 'Robinson / Saint-Rémy', from: 'Gare du Nord', to: 'Châtelet-Les Halles',
          departureAt: t(now, 3), arrivalAt: t(now, 7), durationMin: 4,
          stops: [{ name: 'Gare du Nord', at: t(now, 3), lon: 2.3553, lat: 48.8809 }, { name: 'Châtelet-Les Halles', at: t(now, 7), lon: 2.347, lat: 48.8619 }], path: [[2.3553, 48.8809], [2.3527, 48.8745], [2.3489, 48.8668], [2.347, 48.8619]], tips: ['Monte en tête de train'] },
        { mode: 'walk', lineCode: '', lineColor: '#0E0F12', lineTextColor: '#FFFFFF', direction: '', from: 'Châtelet-Les Halles', to: 'Châtelet-Les Halles',
          departureAt: t(now, 7), arrivalAt: t(now, 11), durationMin: 4, stops: [], tips: ['Suis le A rouge'] },
        { mode: 'rer', lineCode: 'A', lineColor: '#E3051C', lineTextColor: '#FFFFFF', direction: 'Ouest', from: 'Châtelet-Les Halles', to: 'La Défense', toId: 'stop_area:IDFM:mock-la-defense',
          departureAt: t(now, 11), arrivalAt: t(now, 24), durationMin: 13,
          stops: [
            { name: 'Châtelet-Les Halles', at: t(now, 11), lon: 2.347, lat: 48.8619 }, { name: 'Auber', at: t(now, 14), lon: 2.329, lat: 48.8721 },
            { name: 'Charles-de-Gaulle Étoile', at: t(now, 17), lon: 2.295, lat: 48.8738 }, { name: 'La Défense', at: t(now, 24), lon: 2.238, lat: 48.8919 },
          ], path: [[2.347, 48.8619], [2.3385, 48.8676], [2.329, 48.8721], [2.3105, 48.8732], [2.295, 48.8738], [2.2762, 48.8805], [2.2593, 48.8859], [2.238, 48.8919]], tips: ['Sortie 3, Grande Arche'] },
        { mode: 'walk', lineCode: '', lineColor: '#0E0F12', lineTextColor: '#FFFFFF', direction: '', from: 'La Défense', to: 'Destination',
          departureAt: t(now, 24), arrivalAt: t(now, 27), durationMin: 3, stops: [], path: [[2.238, 48.8919], [2.242, 48.8935]], tips: [] },
      ],
    },
    {
      id: 'local-varie', reliability: 'estime',
      departureAt: t(now, 0), arrivalAt: t(now, 31), durationMin: 31, transfers: 2,
      legs: [
        { mode: 'walk', lineCode: '', lineColor: '#0E0F12', lineTextColor: '#FFFFFF', direction: '', from: 'Ta position', to: 'Gare du Nord', departureAt: t(now, 0), arrivalAt: t(now, 3), durationMin: 3, stops: [], path: [[2.358, 48.8795], [2.3553, 48.8809]], tips: [] },
        { mode: 'metro', lineCode: '4', lineColor: '#CF009E', lineTextColor: '#FFFFFF', direction: 'Bagneux', from: 'Gare du Nord', to: 'Châtelet',
          departureAt: t(now, 3), arrivalAt: t(now, 9), durationMin: 6,
          stops: [{ name: 'Gare du Nord', at: t(now, 3), lon: 2.3553, lat: 48.8809 }, { name: 'Strasbourg Saint-Denis', at: t(now, 6), lon: 2.356, lat: 48.8695 }, { name: 'Châtelet', at: t(now, 9), lon: 2.347, lat: 48.8619 }],
          path: [[2.3553, 48.8809], [2.356, 48.8695], [2.347, 48.8619]], tips: [] },
        { mode: 'walk', lineCode: '', lineColor: '#0E0F12', lineTextColor: '#FFFFFF', direction: '', from: 'Châtelet', to: 'Châtelet', departureAt: t(now, 9), arrivalAt: t(now, 12), durationMin: 3, stops: [], path: [[2.347, 48.8619], [2.347, 48.8619]], tips: [] },
        { mode: 'metro', lineCode: '1', lineColor: '#FFCD00', lineTextColor: '#0E0F12', direction: 'La Défense', from: 'Châtelet', to: 'La Défense',
          departureAt: t(now, 12), arrivalAt: t(now, 24), durationMin: 12,
          stops: [{ name: 'Châtelet', at: t(now, 12), lon: 2.347, lat: 48.8619 }, { name: 'Concorde', at: t(now, 16), lon: 2.321, lat: 48.8656 }, { name: 'Charles de Gaulle Étoile', at: t(now, 19), lon: 2.295, lat: 48.8738 }, { name: 'La Défense', at: t(now, 24), lon: 2.238, lat: 48.8919 }],
          path: [[2.347, 48.8619], [2.321, 48.8656], [2.295, 48.8738], [2.238, 48.8919]], tips: [] },
        { mode: 'tram', lineCode: 'T2', lineColor: '#CF009E', lineTextColor: '#FFFFFF', direction: 'Porte de Versailles', from: 'La Défense', to: 'Belvédère',
          departureAt: t(now, 26), arrivalAt: t(now, 31), durationMin: 5,
          stops: [{ name: 'La Défense', at: t(now, 26), lon: 2.238, lat: 48.8919 }, { name: 'Puteaux', at: t(now, 28), lon: 2.2346, lat: 48.8835 }, { name: 'Belvédère', at: t(now, 31), lon: 2.2311, lat: 48.879 }],
          path: [[2.238, 48.8919], [2.2346, 48.8835], [2.2311, 48.879]], tips: [] },
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
