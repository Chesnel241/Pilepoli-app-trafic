import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classify, rate, weakest, stillUpcoming } from '../src/reliability/freshness.ts';
import { buildLines, lineIdOf } from '../src/sources/lines.ts';
import { detectAnomalies } from '../src/reliability/detect.ts';
import { parseStopMonitoring, navitiaDate } from '../src/sources/prim.ts';
import type { Departure } from '../src/types.ts';

const NOW = Date.parse('2026-11-18T20:15:00Z');
const at = (sec: number) => new Date(NOW + sec * 1000).toISOString();

const base: Departure = {
  journeyRef: 'j1', lineRef: 'L', lineCode: '38', destination: 'X',
  aimedAt: at(300), expectedAt: at(300), recordedAt: at(-20),
};

test('info récente = en direct', () => {
  assert.equal(classify(base, NOW).reliability, 'direct');
});

test('info de 2 min = estimé, de 5 min = pas vu', () => {
  assert.equal(classify({ ...base, recordedAt: at(-120) }, NOW).reliability, 'estime');
  assert.equal(classify({ ...base, recordedAt: at(-300) }, NOW).reliability, 'pas_vu');
});

test('sans heure temps réel = horaire prévu, jamais « en direct »', () => {
  assert.equal(classify({ ...base, expectedAt: null }, NOW).reliability, 'theorique');
});

test('suppression annoncée par l’opérateur', () => {
  assert.equal(classify({ ...base, operatorStatus: 'cancelled' }, NOW).reliability, 'supprime');
});

test('la fourchette s’élargit quand l’info vieillit', () => {
  const fresh = rate(base, NOW).range!;
  const old = rate({ ...base, recordedAt: at(-400) }, NOW).range!;
  assert.ok(old.max - old.min > fresh.max - fresh.min);
  assert.equal(rate({ ...base, recordedAt: at(-400) }, NOW).label, 'Pas vu depuis 7 min');
});

test('le maillon le plus faible donne la fiabilité du trajet', () => {
  assert.equal(weakest(['direct', 'estime', 'direct']), 'estime');
  assert.equal(weakest(['direct', 'pas_vu']), 'pas_vu');
});

test('détecte un passage en avance', () => {
  const d = rate({ ...base, aimedAt: at(600), expectedAt: at(300) }, NOW);
  const a = detectAnomalies('S', undefined, [d], NOW);
  assert.deepEqual(a.map((x) => x.kind), ['early']);
});

test('course disparue avant son heure = à vérifier, pas « supprimée »', () => {
  const prev = [rate(base, NOW)];
  const a = detectAnomalies('S', prev, [], NOW);
  assert.equal(a[0]?.kind, 'vanished');
});

test('une course déjà passée qui disparaît n’est pas une anomalie', () => {
  const prev = [rate({ ...base, aimedAt: at(-30), expectedAt: at(-30) }, NOW)];
  assert.equal(detectAnomalies('S', prev, [], NOW).length, 0);
});

test('lecture d’une réponse SIRI Lite PRIM', () => {
  const json = {
    Siri: { ServiceDelivery: { StopMonitoringDelivery: [{ MonitoredStopVisit: [{
      RecordedAtTime: at(-10),
      MonitoredVehicleJourney: {
        LineRef: { value: 'STIF:Line::C01743:' },
        FramedVehicleJourneyRef: { DatedVehicleJourneyRef: 'RATP:VJ:1' },
        DestinationName: [{ value: 'Robinson' }],
        MonitoredCall: { AimedDepartureTime: at(180), ExpectedDepartureTime: at(240), DepartureStatus: 'delayed', ArrivalPlatformName: { value: '2' } },
      },
    }] }] } },
  };
  const [d] = parseStopMonitoring(json);
  assert.equal(d.journeyRef, 'RATP:VJ:1');
  assert.equal(d.destination, 'Robinson');
  assert.equal(d.platform, '2');
  assert.equal(rate(d, NOW).reliability, 'direct');
});

test('dates Navitia converties en heure de Paris', () => {
  assert.equal(navitiaDate('20261118T211500'), '2026-11-18T20:15:00.000Z'); // hiver, UTC+1
  assert.equal(navitiaDate('20260715T090000'), '2026-07-15T07:00:00.000Z'); // été, UTC+2
});

test('un passage parti depuis plus d’une minute disparaît de la liste', () => {
  assert.equal(stillUpcoming({ ...base, expectedAt: at(-30) }, NOW), true);
  assert.equal(stillUpcoming({ ...base, expectedAt: at(-540) }, NOW), false);
});

test('référentiel des lignes : code brut traduit en nom et couleurs', () => {
  const map = buildLines([
    { id_line: 'C01375', shortname_line: '5', colourweb_hexa: 'FF7E2E', textcolourweb_hexa: '000000', transportmode: 'metro' },
    { ID_Line: 'C01743', ShortName_Line: 'B', ColourWeb_hexa: '5291CE', TextColourWeb_hexa: 'FFFFFF', TransportMode: 'rail' },
  ]);
  assert.equal(lineIdOf('STIF:Line::C01375:'), 'C01375');
  assert.deepEqual(map.get('C01375'), { code: '5', color: '#FF7E2E', textColor: '#000000', mode: 'metro' });
  assert.equal(map.get('C01743')?.code, 'B');
});
