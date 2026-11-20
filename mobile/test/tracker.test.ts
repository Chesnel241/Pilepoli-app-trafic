import { test } from 'node:test';
import assert from 'node:assert/strict';
import { advance, buildModel, initTrack, type Input } from '../src/lib/tracker.ts';
import { walkPlan, walkStatus, turnKind } from '../src/lib/walk.ts';
import type { Journey } from '../src/lib/types.ts';

const T0 = Date.parse('2026-11-20T08:00:00Z');
const at = (m: number) => new Date(T0 + m * 60_000).toISOString();
// Marche 300 m vers la gare A, puis train A → B → C (1,6 km), sur un axe est-ouest.
const A: [number, number] = [2.3000, 48.8500], B: [number, number] = [2.3110, 48.8500], C: [number, number] = [2.3220, 48.8500];
const start: [number, number] = [2.2959, 48.8500];
const journey: Journey = {
  id: 'j', departureAt: at(0), arrivalAt: at(12), durationMin: 12, transfers: 0, reliability: 'direct',
  legs: [
    { mode: 'walk', lineCode: '', lineColor: '#000', lineTextColor: '#fff', direction: '', from: 'Ici', to: 'Gare A', departureAt: at(0), arrivalAt: at(4), durationMin: 4, stops: [], path: [start, A], tips: [] },
    { mode: 'rer', lineCode: 'B', lineColor: '#3C91DC', lineTextColor: '#fff', direction: 'C', from: 'Gare A', to: 'Gare C', departureAt: at(6), arrivalAt: at(10), durationMin: 4,
      stops: [{ name: 'Gare A', at: at(6), lon: A[0], lat: A[1] }, { name: 'Gare B', at: at(8), lon: B[0], lat: B[1] }, { name: 'Gare C', at: at(10), lon: C[0], lat: C[1] }],
      path: [A, B, C], tips: [] },
  ],
};
const model = buildModel(journey);
const fix = (p: [number, number], tMs: number, speed = 1.2) => ({ p, accuracy: 10, speed, at: tMs });
const run = (inputs: Input[]) => inputs.reduce((t, i) => advance(model, t, i), initTrack(model, inputs[0].now));

test('le temps qui passe sans bouger ne fait PAS avancer le trajet', () => {
  const inputs: Input[] = [];
  for (let s = 0; s <= 15 * 60; s += 5) inputs.push({ now: T0 + s * 1000, fix: fix(start, T0 + s * 1000, 0), gps: 'granted' });
  const t = run(inputs);
  assert.equal(t.sub, 'walk', 'toujours à pied au point de départ');
  assert.equal(t.step, 0);
});

test('à pied jusqu’à la gare, puis attente sur le quai tant qu’on n’est pas monté', () => {
  const inputs: Input[] = [];
  for (let s = 0; s <= 240; s += 5) {
    const f = Math.min(1, s / 230);
    const p: [number, number] = [start[0] + (A[0] - start[0]) * f, start[1]];
    inputs.push({ now: T0 + s * 1000, fix: fix(p, T0 + s * 1000), gps: 'granted' });
  }
  let t = run(inputs);
  assert.equal(t.sub, 'wait', 'arrivé à la gare');
  // 10 minutes sur le quai, GPS présent et immobile : on n'est pas monté.
  for (let s = 245; s <= 845; s += 5) t = advance(model, t, { now: T0 + s * 1000, fix: fix(A, T0 + s * 1000, 0), gps: 'granted' });
  assert.equal(t.sub, 'wait');
});

test('montée prouvée par le déplacement le long de la ligne, puis arrêt par arrêt au GPS', () => {
  let t = initTrack(model, T0);
  t = advance(model, t, { now: T0, fix: fix(A, T0, 0), gps: 'granted' }); // déjà à la gare
  assert.equal(t.sub, 'wait');
  const now1 = T0 + 7 * 60_000;
  const mid: [number, number] = [2.3060, 48.85]; // ~440 m après A
  t = advance(model, t, { now: now1, fix: fix(mid, now1, 12), gps: 'granted' });
  assert.equal(t.sub, 'ride');
  assert.equal(t.source, 'gps');
  // À la gare B (en retard d'une minute sur l'horaire) : l'instant virtuel correspond à B, pas à l'horloge.
  const now2 = T0 + 9 * 60_000;
  t = advance(model, t, { now: now2, fix: fix(B, now2, 10), gps: 'granted' });
  assert.ok(Math.abs(t.virtual - Date.parse(at(8))) < 5_000);
  assert.ok(t.shift > 50_000, 'retard réel mesuré');
});

test('souterrain : signal perdu après l’heure réelle de départ, on suit les horaires décalés et on le dit', () => {
  let t = initTrack(model, T0);
  t = advance(model, t, { now: T0, fix: fix(A, T0, 0), gps: 'granted' });
  const dep = T0 + 7 * 60_000; // le train part en réalité 1 min après l'horaire
  t = advance(model, t, { now: dep - 10_000, fix: null, gps: 'granted', departure: dep });
  t = advance(model, t, { now: dep + 60_000, fix: null, gps: 'granted', departure: dep });
  assert.equal(t.sub, 'ride');
  assert.equal(t.source, 'estime');
  assert.ok(Math.abs(t.shift - 60_000) < 15_000, 'décalé sur l’heure réelle de départ');
});

test('mauvais sens détecté', () => {
  let t = initTrack(model, T0);
  t = advance(model, t, { now: T0, fix: fix(A, T0, 0), gps: 'granted' });
  t = advance(model, t, { now: T0 + 400_000, fix: fix(B, T0 + 400_000, 12), gps: 'granted' });
  t = advance(model, t, { now: T0 + 460_000, fix: fix([2.3050, 48.85], T0 + 460_000, 12), gps: 'granted' });
  assert.equal(t.alert, 'wrongway');
});

test('guidage à pied : prochain virage, cap, arrivée', () => {
  const plan = walkPlan({ to: 'Gare', path: [[2.30, 48.85], [2.302, 48.85], [2.302, 48.852]], walk: [
    { name: 'Rue A', length: 146, turn: 0, at: [2.30, 48.85] }, { name: 'Rue B', length: 222, turn: -90, at: [2.302, 48.85] },
  ] })!;
  const s = walkStatus(plan, [2.3005, 48.85], 10);
  assert.equal(s.next?.kind, 'left');
  assert.equal(s.next?.name, 'Rue B');
  assert.ok(Math.abs(s.heading - 90) < 10, 'marcher vers l’est');
  assert.ok(walkStatus(plan, [2.302, 48.85195], 8).arrived);
  assert.equal(turnKind(170), 'uturn');
});
