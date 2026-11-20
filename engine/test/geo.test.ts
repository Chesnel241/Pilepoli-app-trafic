import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coordOf, simplify } from '../src/geo/simplify.ts';
import { parseJourneys } from '../src/sources/prim.ts';

test('simplify : garde les extrémités, borne le nombre de points', () => {
  const line = Array.from({ length: 500 }, (_, i) => [2.3 + i * 0.0001, 48.8 + Math.sin(i / 20) * 0.002]);
  const out = simplify(line, 40)!;
  assert.ok(out.length <= 40 && out.length >= 2);
  assert.deepEqual(out[0], [2.3, 48.8]);
  assert.equal(out[out.length - 1][0], Math.round((2.3 + 499 * 0.0001) * 1e5) / 1e5);
  assert.equal(simplify('n’importe quoi'), undefined);
  assert.equal(coordOf({ lat: '0', lon: '0' }), undefined);
});

test('parseJourneys : coordonnées des arrêts et tracé', () => {
  const [j] = parseJourneys({ journeys: [{ departure_date_time: '20261120T100000', arrival_date_time: '20261120T101000', duration: 600, sections: [{
    type: 'public_transport', duration: 600, departure_date_time: '20261120T100000', arrival_date_time: '20261120T101000',
    display_informations: { physical_mode: 'Navette fluviale', code: 'N1' },
    geojson: { type: 'LineString', coordinates: [[2.35, 48.85], [2.36, 48.86], [2.37, 48.87]] },
    stop_date_times: [{ stop_point: { name: 'A', coord: { lat: '48.85', lon: '2.35' } }, departure_date_time: '20261120T100000' }],
  }] }] });
  assert.equal(j.legs[0].mode, 'boat');
  assert.equal(j.legs[0].stops[0].lat, 48.85);
  assert.ok(j.legs[0].path && j.legs[0].path.length >= 2);
});
