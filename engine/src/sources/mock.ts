import type { Departure, Journey, Place } from '../types.ts';

/**
 * Données simulées, calées sur la maquette (Gare du Nord → La Défense).
 * Elles servent tant qu'il n'y a pas de clé PRIM, et pour les démos.
 * Les horaires sont recalculés par rapport à « maintenant » à chaque appel.
 */
const iso = (now: number, deltaMin: number) => new Date(now + deltaMin * 60_000).toISOString();
const ago = (now: number, seconds: number) => new Date(now - seconds * 1000).toISOString();

export function mockDepartures(stopRef: string, now: number = Date.now()): Departure[] {
  return [
    {
      journeyRef: 'mock-B-1', lineRef: 'mock:B', lineCode: 'B', destination: 'Robinson', direction: 'Sud',
      aimedAt: iso(now, 3), expectedAt: iso(now, 3), recordedAt: ago(now, 15), operatorStatus: 'onTime', platform: '2',
    },
    {
      journeyRef: 'mock-38-1', lineRef: 'mock:38', lineCode: '38', destination: "Porte d'Orléans",
      aimedAt: iso(now, 6), expectedAt: iso(now, 7), recordedAt: ago(now, 110), operatorStatus: 'delayed',
    },
    {
      journeyRef: 'mock-302-1', lineRef: 'mock:302', lineCode: '302', destination: 'Stains',
      aimedAt: iso(now, 2), expectedAt: iso(now, 2), recordedAt: ago(now, 720),
    },
    {
      journeyRef: 'mock-B-2', lineRef: 'mock:B', lineCode: 'B', destination: 'Aéroport CDG 2', direction: 'Nord',
      aimedAt: iso(now, 5), expectedAt: null, recordedAt: null,
    },
  ].map((d) => ({ ...d, journeyRef: `${stopRef}:${d.journeyRef}` }));
}

export function mockJourneys(now: number = Date.now()): Journey[] {
  const t = (m: number) => iso(now, m);
  return [
    {
      id: 'mock-fiable', tag: 'plus_fiable', reliability: 'direct',
      departureAt: t(0), arrivalAt: t(27), durationMin: 27, transfers: 1,
      legs: [
        { mode: 'walk', lineCode: '', lineColor: '#0E0F12', lineTextColor: '#FFFFFF', direction: '', from: 'Ta position', to: 'Gare du Nord',
          departureAt: t(0), arrivalAt: t(3), durationMin: 3, stops: [], tips: ["Entre par l'accès 6"] },
        { mode: 'rer', lineCode: 'B', lineColor: '#3C91DC', lineTextColor: '#FFFFFF', direction: 'Robinson / Saint-Rémy', from: 'Gare du Nord', to: 'Châtelet-Les Halles',
          departureAt: t(3), arrivalAt: t(7), durationMin: 4,
          stops: [{ name: 'Gare du Nord', at: t(3) }, { name: 'Châtelet-Les Halles', at: t(7) }],
          tips: ['Monte en tête de train'] },
        { mode: 'walk', lineCode: '', lineColor: '#0E0F12', lineTextColor: '#FFFFFF', direction: '', from: 'Châtelet-Les Halles', to: 'Châtelet-Les Halles',
          departureAt: t(7), arrivalAt: t(11), durationMin: 4, stops: [], tips: ['Suis le A rouge'] },
        { mode: 'rer', lineCode: 'A', lineColor: '#E3051C', lineTextColor: '#FFFFFF', direction: 'Ouest', from: 'Châtelet-Les Halles', to: 'La Défense',
          departureAt: t(11), arrivalAt: t(24), durationMin: 13,
          stops: [
            { name: 'Châtelet-Les Halles', at: t(11) }, { name: 'Auber', at: t(14) },
            { name: 'Charles-de-Gaulle Étoile', at: t(17) }, { name: 'La Défense', at: t(24) },
          ],
          tips: ['Sortie 3, Grande Arche'] },
        { mode: 'walk', lineCode: '', lineColor: '#0E0F12', lineTextColor: '#FFFFFF', direction: '', from: 'La Défense', to: 'Destination',
          departureAt: t(24), arrivalAt: t(27), durationMin: 3, stops: [], tips: [] },
      ],
    },
    {
      id: 'mock-direct', tag: 'direct', reliability: 'pas_vu',
      departureAt: t(1), arrivalAt: t(24), durationMin: 23, transfers: 0,
      legs: [
        { mode: 'rer', lineCode: 'E', lineColor: '#C04191', lineTextColor: '#FFFFFF', direction: 'Nanterre', from: 'Magenta', to: 'La Défense',
          departureAt: t(4), arrivalAt: t(20), durationMin: 16,
          stops: [{ name: 'Magenta', at: t(4) }, { name: 'La Défense', at: t(20) }], tips: [] },
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
