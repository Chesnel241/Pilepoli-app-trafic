import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Stats, MIN_SAMPLES, bucketOf } from '../src/store/stats.ts';
import { RateLimiter, cleanQuery, isEndpoint, isRef, normEndpoint } from '../src/http/guard.ts';
import type { RatedDeparture } from '../src/types.ts';

const dep = (journeyRef: string, aimed: number, delaySec: number, now: number): RatedDeparture => {
  const expected = aimed + delaySec * 1000;
  return {
    journeyRef, lineRef: 'L1', lineCode: '1', destination: 'X',
    aimedAt: new Date(aimed).toISOString(), expectedAt: new Date(expected).toISOString(), recordedAt: new Date(now).toISOString(),
    reliability: 'direct', ageSeconds: 5, minutes: Math.max(0, Math.round((expected - now) / 60000)), range: null, label: '',
  };
};

test('heure de Paris : un lundi 8 h UTC+1 tombe en semaine, 8 h', () => {
  assert.deepEqual(bucketOf(Date.parse('2026-11-23T07:30:00Z')), { day: 'sem', hour: 8 });
  assert.equal(bucketOf(Date.parse('2026-11-22T12:00:00Z')).day, 'dim');
});

test('une course partie après son heure enrichit l’historique ; pas de prédiction sous le seuil', () => {
  const st = new Stats('/tmp/pilepoil-test-stats.json');
  const base = Date.parse('2026-11-23T07:00:00Z');
  for (let i = 0; i < MIN_SAMPLES; i++) {
    const aimed = base + i * 7 * 24 * 3600_000; // même lundi, même heure, semaines successives
    const now = aimed + 60_000; // à 2 min de son heure réelle
    st.observe('S', [dep(`j${i}`, aimed, 180, now)], now); // 3 min de retard, vu 1 min avant
    if (i === MIN_SAMPLES - 2) assert.equal(st.predict('L1', 'S', aimed), undefined);
    st.observe('S', [], aimed + 8 * 60_000); // disparue après son heure : partie
  }
  const p = st.predict('L1', 'S', base);
  assert.ok(p);
  assert.equal(p.typicalDelayMin, 3);
  assert.equal(p.samples, MIN_SAMPLES);
});

test('une course qui disparaît avant son heure n’est pas comptée comme un passage', () => {
  const st = new Stats('/tmp/x.json');
  const aimed = Date.parse('2026-11-23T07:00:00Z');
  for (let i = 0; i < MIN_SAMPLES; i++) {
    st.observe('S', [dep(`k${i}`, aimed, 0, aimed - 120_000)], aimed - 120_000);
    st.observe('S', [], aimed - 110_000);
  }
  assert.equal(st.predict('L1', 'S', aimed), undefined);
});

test('garde-fous : identifiants, recherche, débit', () => {
  assert.ok(isRef('STIF:StopArea:SP:71410:'));
  assert.ok(!isRef('../etc/passwd?x=1'));
  assert.ok(isEndpoint('2.35;48.88'));
  assert.ok(!isEndpoint('2.35;48.88;evil'));
  // Coordonnées brutes d'un iPhone (13 décimales) : acceptées puis arrondies.
  assert.ok(isEndpoint('2.4123456789012;48.7312345678901'));
  assert.equal(normEndpoint('2.4123456789012;48.7312345678901'), '2.412346;48.731235');
  assert.equal(normEndpoint('stop_area:IDFM:71410'), 'stop_area:IDFM:71410');
  assert.equal(cleanQuery('a'), null);
  assert.equal(cleanQuery('  gare\u0000 du nord '), 'gare  du nord');
  const rl = new RateLimiter(60, 2);
  assert.ok(rl.allow('ip', 0));
  assert.ok(rl.allow('ip', 0));
  assert.ok(!rl.allow('ip', 0));
  assert.ok(rl.allow('ip', 1000));
});
