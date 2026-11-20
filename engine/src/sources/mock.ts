import type { Departure, Journey, Place } from '../types.ts';

/**
 * Données simulées, calées sur la maquette (Gare du Nord → La Défense).
 * Elles servent tant qu'il n'y a pas de clé PRIM, et pour les démos.
 * Les horaires sont recalculés par rapport à « maintenant » à chaque appel.
 */
const iso = (now: number, deltaMin: number) => new Date(now + deltaMin * 60_000).toISOString();
const ago = (now: number, seconds: number) => new Date(now - seconds * 1000).toISOString();

export function mockDepartures(stopRef: string, now: number = Date.now()): Departure[] {
  const base: Departure[] = [
    {
      journeyRef: 'mock-B-1', lineRef: 'mock:B', lineCode: 'B', lineColor: '#3C91DC', lineTextColor: '#FFFFFF', mode: 'rer', destination: 'Robinson', direction: 'Sud',
      aimedAt: iso(now, 3), expectedAt: iso(now, 3), recordedAt: ago(now, 15), operatorStatus: 'onTime', platform: '2',
    },
    {
      journeyRef: 'mock-38-1', lineRef: 'mock:38', lineCode: '38', lineColor: '#82C8E6', lineTextColor: '#0E0F12', mode: 'bus', destination: "Porte d'Orléans",
      aimedAt: iso(now, 6), expectedAt: iso(now, 7), recordedAt: ago(now, 110), operatorStatus: 'delayed',
    },
    {
      journeyRef: 'mock-302-1', lineRef: 'mock:302', lineCode: '302', lineColor: '#6E6E6E', lineTextColor: '#FFFFFF', mode: 'bus', destination: 'Stains',
      aimedAt: iso(now, 2), expectedAt: iso(now, 2), recordedAt: ago(now, 720),
    },
    {
      journeyRef: 'mock-B-2', lineRef: 'mock:B', lineCode: 'B', lineColor: '#3C91DC', lineTextColor: '#FFFFFF', mode: 'rer', destination: 'Aéroport CDG 2', direction: 'Nord',
      aimedAt: iso(now, 5), expectedAt: null, recordedAt: null,
    },
  ];
  return [...base, ...(EXTRA[stopRef]?.(now) ?? [])]
    .filter((d) => !EXTRA[stopRef] || !/^mock-(38|302)/.test(d.journeyRef))
    .map((d) => ({ ...d, journeyRef: `${stopRef}:${d.journeyRef}` }));
}

/** Quelques lignes en plus selon l'arrêt simulé, pour que la carte « Autour de toi » ait l'air vraie. */
const EXTRA: Record<string, (now: number) => Departure[]> = {
  'STIF:StopArea:SP:mock-mag:': (now) => [
    { journeyRef: 'mock-E-1', lineRef: 'mock:E', lineCode: 'E', lineColor: '#C04191', lineTextColor: '#FFFFFF', mode: 'rer', destination: 'Nanterre', aimedAt: iso(now, 4), expectedAt: iso(now, 4), recordedAt: ago(now, 20) },
  ],
  'STIF:StopArea:SP:mock-est:': (now) => [
    { journeyRef: 'mock-4-1', lineRef: 'mock:4', lineCode: '4', lineColor: '#CF009E', lineTextColor: '#FFFFFF', mode: 'metro', destination: 'Bagneux', aimedAt: iso(now, 2), expectedAt: iso(now, 2), recordedAt: ago(now, 10) },
    { journeyRef: 'mock-7-1', lineRef: 'mock:7', lineCode: '7', lineColor: '#FA9ABA', lineTextColor: '#0E0F12', mode: 'metro', destination: 'Villejuif', aimedAt: iso(now, 3), expectedAt: iso(now, 3), recordedAt: ago(now, 30) },
  ],
  'STIF:StopArea:SP:mock-laf:': (now) => [
    { journeyRef: 'mock-7b-1', lineRef: 'mock:7', lineCode: '7', lineColor: '#FA9ABA', lineTextColor: '#0E0F12', mode: 'metro', destination: 'La Courneuve', aimedAt: iso(now, 5), expectedAt: iso(now, 6), recordedAt: ago(now, 40) },
  ],
};

export function mockJourneys(now: number = Date.now()): Journey[] {
  const t = (m: number) => iso(now, m);
  return [
    {
      id: 'mock-fiable', tag: 'plus_fiable', reliability: 'direct',
      departureAt: t(0), arrivalAt: t(27), durationMin: 27, transfers: 1,
      legs: [
        { mode: 'walk', lineCode: '', lineColor: '#0E0F12', lineTextColor: '#FFFFFF', direction: '', from: 'Ta position', to: 'Gare du Nord',
          departureAt: t(0), arrivalAt: t(3), durationMin: 3, stops: [], path: [[2.358, 48.8795], [2.3553, 48.8809]], tips: ["Entre par l'accès 6"] },
        { mode: 'rer', lineCode: 'B', lineColor: '#3C91DC', lineTextColor: '#FFFFFF', direction: 'Robinson / Saint-Rémy', from: 'Gare du Nord', to: 'Châtelet-Les Halles',
          departureAt: t(3), arrivalAt: t(7), durationMin: 4,
          stops: [{ name: 'Gare du Nord', at: t(3), lon: 2.3553, lat: 48.8809 }, { name: 'Châtelet-Les Halles', at: t(7), lon: 2.347, lat: 48.8619 }],
          path: [[2.3553, 48.8809], [2.3527, 48.8745], [2.3489, 48.8668], [2.347, 48.8619]],
          tips: ['Monte en tête de train'] },
        { mode: 'walk', lineCode: '', lineColor: '#0E0F12', lineTextColor: '#FFFFFF', direction: '', from: 'Châtelet-Les Halles', to: 'Châtelet-Les Halles',
          departureAt: t(7), arrivalAt: t(11), durationMin: 4, stops: [], path: [[2.347, 48.8619], [2.3468, 48.8617]], tips: ['Suis le A rouge'] },
        { mode: 'rer', lineCode: 'A', lineColor: '#E3051C', lineTextColor: '#FFFFFF', direction: 'Ouest', from: 'Châtelet-Les Halles', to: 'La Défense', toId: 'stop_area:IDFM:mock-la-defense',
          departureAt: t(11), arrivalAt: t(24), durationMin: 13,
          stops: [
            { name: 'Châtelet-Les Halles', at: t(11), lon: 2.347, lat: 48.8619 }, { name: 'Auber', at: t(14), lon: 2.329, lat: 48.8721 },
            { name: 'Charles-de-Gaulle Étoile', at: t(17), lon: 2.295, lat: 48.8738 }, { name: 'La Défense', at: t(24), lon: 2.238, lat: 48.8919 },
          ],
          path: [[2.347, 48.8619], [2.3385, 48.8676], [2.329, 48.8721], [2.3105, 48.8732], [2.295, 48.8738], [2.2762, 48.8805], [2.2593, 48.8859], [2.238, 48.8919]],
          tips: ['Sortie 3, Grande Arche'] },
        { mode: 'walk', lineCode: '', lineColor: '#0E0F12', lineTextColor: '#FFFFFF', direction: '', from: 'La Défense', to: 'Destination',
          departureAt: t(24), arrivalAt: t(27), durationMin: 3, stops: [], path: [[2.238, 48.8919], [2.242, 48.8935]], tips: [] },
      ],
    },
    {
      id: 'mock-varie', reliability: 'estime',
      departureAt: t(0), arrivalAt: t(31), durationMin: 31, transfers: 2,
      legs: [
        { mode: 'walk', lineCode: '', lineColor: '#0E0F12', lineTextColor: '#FFFFFF', direction: '', from: 'Ta position', to: 'Gare du Nord', departureAt: t(0), arrivalAt: t(3), durationMin: 3, stops: [], path: [[2.358, 48.8795], [2.3553, 48.8809]], tips: [] },
        { mode: 'metro', lineCode: '4', lineColor: '#CF009E', lineTextColor: '#FFFFFF', direction: 'Bagneux', from: 'Gare du Nord', to: 'Châtelet',
          departureAt: t(3), arrivalAt: t(9), durationMin: 6,
          stops: [{ name: 'Gare du Nord', at: t(3), lon: 2.3553, lat: 48.8809 }, { name: 'Strasbourg Saint-Denis', at: t(6), lon: 2.356, lat: 48.8695 }, { name: 'Châtelet', at: t(9), lon: 2.347, lat: 48.8619 }],
          path: [[2.3553, 48.8809], [2.356, 48.8695], [2.347, 48.8619]], tips: [] },
        { mode: 'walk', lineCode: '', lineColor: '#0E0F12', lineTextColor: '#FFFFFF', direction: '', from: 'Châtelet', to: 'Châtelet', departureAt: t(9), arrivalAt: t(12), durationMin: 3, stops: [], path: [[2.347, 48.8619], [2.347, 48.8619]], tips: [] },
        { mode: 'metro', lineCode: '1', lineColor: '#FFCD00', lineTextColor: '#0E0F12', direction: 'La Défense', from: 'Châtelet', to: 'La Défense',
          departureAt: t(12), arrivalAt: t(24), durationMin: 12,
          stops: [{ name: 'Châtelet', at: t(12), lon: 2.347, lat: 48.8619 }, { name: 'Concorde', at: t(16), lon: 2.321, lat: 48.8656 }, { name: 'Charles de Gaulle Étoile', at: t(19), lon: 2.295, lat: 48.8738 }, { name: 'La Défense', at: t(24), lon: 2.238, lat: 48.8919 }],
          path: [[2.347, 48.8619], [2.321, 48.8656], [2.295, 48.8738], [2.238, 48.8919]], tips: [] },
        { mode: 'tram', lineCode: 'T2', lineColor: '#CF009E', lineTextColor: '#FFFFFF', direction: 'Porte de Versailles', from: 'La Défense', to: 'Belvédère',
          departureAt: t(26), arrivalAt: t(31), durationMin: 5,
          stops: [{ name: 'La Défense', at: t(26), lon: 2.238, lat: 48.8919 }, { name: 'Puteaux', at: t(28), lon: 2.2346, lat: 48.8835 }, { name: 'Belvédère', at: t(31), lon: 2.2311, lat: 48.879 }],
          path: [[2.238, 48.8919], [2.2346, 48.8835], [2.2311, 48.879]], tips: [] },
      ],
    },
    {
      id: 'mock-direct', tag: 'direct', reliability: 'pas_vu',
      departureAt: t(1), arrivalAt: t(24), durationMin: 23, transfers: 0,
      legs: [
        { mode: 'rer', lineCode: 'E', lineColor: '#C04191', lineTextColor: '#FFFFFF', direction: 'Nanterre', from: 'Magenta', to: 'La Défense',
          departureAt: t(4), arrivalAt: t(20), durationMin: 16,
          stops: [{ name: 'Magenta', at: t(4), lon: 2.3567, lat: 48.8822 }, { name: 'La Défense', at: t(20), lon: 2.238, lat: 48.8919 }], path: [[2.3567, 48.8822], [2.3, 48.879], [2.238, 48.8919]], tips: [] },
      ],
    },
  ];
}

export function mockPlaces(q: string): Place[] {
  const all: Place[] = [
    { id: 'mock:gare-du-nord', name: 'Gare du Nord', kind: 'stop_area' },
    { id: 'mock:la-defense', name: 'La Défense', kind: 'stop_area' },
    { id: 'mock:chatelet', name: 'Châtelet-Les Halles', kind: 'stop_area' },
    { id: 'mock:republique', name: 'République', kind: 'stop_area' },
  ];
  const s = q.trim().toLowerCase();
  return s ? all.filter((p) => p.name.toLowerCase().includes(s)) : all;
}

export function mockNearby() {
  return [
    { stopRef: 'STIF:StopArea:SP:mock-gdn:', placeId: 'mock:gare-du-nord', areaNumber: 'mock-gdn', name: 'Gare du Nord', distance: 140, lat: 48.8809, lon: 2.3553 },
    { stopRef: 'STIF:StopArea:SP:mock-laf:', placeId: 'mock:lafayette', areaNumber: 'mock-laf', name: 'Lafayette', distance: 320, lat: 48.8768, lon: 2.3532 },
    { stopRef: 'STIF:StopArea:SP:mock-mag:', placeId: 'mock:magenta', areaNumber: 'mock-mag', name: 'Magenta', distance: 260, lat: 48.8822, lon: 2.3567 },
    { stopRef: 'STIF:StopArea:SP:mock-est:', placeId: 'mock:gare-de-l-est', areaNumber: 'mock-est', name: "Gare de l'Est", distance: 480, lat: 48.8763, lon: 2.3589 },
  ];
}
