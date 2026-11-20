import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLineReports, plain } from '../src/sources/traffic.ts';
import { parseNearby, stopRefOf } from '../src/sources/prim.ts';
import { exitNumber, toExit } from '../src/sources/exits.ts';

const NOW = Date.parse('2026-11-20T12:00:00Z');

test('line_reports : perturbations regroupées par ligne, la plus grave d’abord', () => {
  const json = {
    disruptions: [
      { id: 'd1', status: 'active', severity: { effect: 'SIGNIFICANT_DELAYS', name: 'perturbée' },
        messages: [{ text: 'Trafic perturbé', channel: { types: ['title'] } }, { text: '<p>Incident technique&nbsp;à Magenta.</p>', channel: { types: ['web'] } }],
        application_periods: [{ begin: '20261120T080000', end: '20261120T230000' }] },
      { id: 'd2', status: 'past', severity: { effect: 'NO_SERVICE' }, messages: [{ text: 'vieux' }] },
      { id: 'd3', status: 'future', cause: 'travaux', severity: { effect: 'OTHER_EFFECT', name: 'Travaux' }, messages: [{ text: 'Travaux samedi' }] },
    ],
    line_reports: [
      { line: { id: 'line:IDFM:C01729', code: 'E', color: 'C04191', text_color: 'FFFFFF', commercial_mode: { name: 'RER' }, links: [{ type: 'disruption', id: 'd1' }, { type: 'disruption', id: 'd2' }] } },
      { line: { id: 'line:IDFM:C01383', code: '13', color: '6EC4E8', commercial_mode: { name: 'Métro' }, links: [{ type: 'disruption', id: 'd3' }] } },
    ],
  };
  const lines = parseLineReports(json, NOW);
  assert.equal(lines[0].code, 'E');
  assert.equal(lines[0].level, 'perturbe');
  assert.equal(lines[0].disruptions.length, 1, 'la perturbation passée est ignorée');
  assert.equal(lines[0].disruptions[0].message, 'Incident technique à Magenta.');
  assert.equal(lines[1].level, 'info', 'des travaux à venir ne colorent pas la ligne aujourd’hui');
  assert.equal(lines[1].disruptions[0].upcoming, true);
  assert.equal(lines[1].color, '#6EC4E8');
});

test('message HTML nettoyé', () => {
  assert.equal(plain('<b>Ligne&nbsp;5</b><br/>Reprise prévue'), 'Ligne 5\nReprise prévue');
});

test('arrêts proches : identifiants Navitia et SIRI', () => {
  const stops = parseNearby({ places_nearby: [
    { id: 'stop_area:IDFM:71410', embedded_type: 'stop_area', distance: '132.4', stop_area: { name: 'Gare du Nord' } },
    { id: 'poi:1', embedded_type: 'poi', distance: '10' },
  ] });
  assert.equal(stops.length, 1);
  assert.deepEqual(stops[0], { stopRef: 'STIF:StopArea:SP:71410:', placeId: 'stop_area:IDFM:71410', areaNumber: '71410', name: 'Gare du Nord', distance: 132 });
  assert.equal(stopRefOf('stop_area:IDFM:1'), 'STIF:StopArea:SP:1:');
});

test('sorties : numéro lu dans le nom, colonnes détectées', () => {
  assert.equal(exitNumber('Sortie 3 - Grande Arche'), '3');
  assert.equal(exitNumber('Accès n°12 rue de Rivoli'), '12');
  assert.equal(exitNumber('Parvis'), undefined);
  const e = toExit({ accid: 4521, accname: 'Sortie 2 - Boulevard', geo_point_2d: { lat: 48.88, lon: 2.35 } });
  assert.deepEqual(e, { id: '4521', name: 'Sortie 2 - Boulevard', number: '2', lat: 48.88, lon: 2.35, accessible: undefined });
});

test('arrêt non desservi : la ligne est perturbée, pas interrompue ; travaux reconnus ; dates en UTC', () => {
  const json = {
    disruptions: [
      { id: 'a', status: 'active', cause: 'travaux', severity: { effect: 'NO_SERVICE', name: 'bloquante' },
        impacted_objects: [{ pt_object: { embedded_type: 'stop_point' } }],
        messages: [{ text: 'Bus 272 : Travaux - Arrêt(s) non desservi(s)', channel: { types: ['title'] } }],
        application_periods: [{ begin: '20261120T040000', end: '20261219T033000' }] },
      { id: 'b', status: 'active', severity: { effect: 'NO_SERVICE', name: 'bloquante' },
        impacted_objects: [{ pt_object: { embedded_type: 'line' } }], messages: [{ text: 'Trafic interrompu' }] },
    ],
    line_reports: [
      { line: { id: 'line:IDFM:C00298', code: '6401', links: [{ type: 'disruption', id: 'a' }] } },
      { line: { id: 'line:IDFM:C01371', code: '1', links: [{ type: 'disruption', id: 'b' }] } },
    ],
  };
  const lines = parseLineReports(json, NOW);
  const bus = lines.find((l) => l.lineId === 'C00298')!;
  assert.equal(bus.level, 'travaux');
  assert.equal(bus.disruptions[0].start, '2026-11-20T03:00:00.000Z');
  assert.equal(lines.find((l) => l.lineId === 'C01371')!.level, 'interrompu');
});
