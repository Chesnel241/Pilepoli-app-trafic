import { test } from 'node:test';
import assert from 'node:assert/strict';
import { servesOf, normName } from '../src/reliability/serves.ts';
import { missionAndVia } from '../src/sources/prim.ts';
import type { RatedDeparture } from '../src/types.ts';

const T = Date.parse('2026-11-20T08:40:00Z');
const at = (m: number) => new Date(T + m * 60_000).toISOString();
const dep = (p: Partial<RatedDeparture>): RatedDeparture => ({
  journeyRef: 'j', lineRef: 'L', lineCode: 'B', destination: 'Saint-Rémy-lès-Chevreuse', aimedAt: at(2), expectedAt: at(2), recordedAt: at(0),
  reliability: 'direct', ageSeconds: 10, minutes: 2, range: null, label: '', ...p,
});
const rides = [
  { lineCode: 'B', mission: 'KOHL', direction: 'Saint-Rémy-lès-Chevreuse', departureAt: at(2), arrivalAt: at(30) },
  { lineCode: 'B', mission: 'KOHL', direction: 'Saint-Rémy-lès-Chevreuse', departureAt: at(17), arrivalAt: at(45) },
];

test('même mission, même heure : confirmé', () => {
  assert.equal(servesOf(dep({ mission: 'KOHL' }), rides), 'yes');
});
test('même heure sans mission : probable', () => {
  assert.equal(servesOf(dep({}), rides), 'probable');
});
test('autre mission sur la même ligne : ne s’arrête pas', () => {
  assert.equal(servesOf(dep({ mission: 'NOVO', expectedAt: at(8) }), rides), 'no');
});
test('autre branche ou sens inverse : ne s’arrête pas', () => {
  assert.equal(servesOf(dep({ destination: 'Aéroport CDG 2 TGV', expectedAt: at(9) }), rides), 'no');
});
test('autre ligne : ne mène pas à ta gare ; sans données : inconnu', () => {
  assert.equal(servesOf(dep({ lineCode: '4' }), rides), 'no');
  assert.equal(servesOf(dep({}), []), 'unknown');
});
test('même direction, horaire non retrouvé : on ne devine pas', () => {
  assert.equal(servesOf(dep({ expectedAt: at(9) }), rides), 'unknown');
});
test('noms comparés sans accents ni précisions', () => {
  assert.equal(normName("Mairie d'Ivry (Ivry-sur-Seine)"), 'mairie d ivry');
});
test('code mission et via lus dans SIRI', () => {
  assert.deepEqual(missionAndVia({ JourneyNote: [{ value: 'KOHL' }] }, { DestinationDisplay: [{ value: 'Robinson' }] }), { mission: 'KOHL' });
  assert.deepEqual(missionAndVia({}, { DestinationDisplay: [{ value: 'Créteil via Choisy' }] }), { via: 'Choisy' });
});
