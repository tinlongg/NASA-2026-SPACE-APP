import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.document ??= { getElementById: () => null, createElement: () => ({}) };
const { healthLines } = await import('../dist/crew-sync.js');

test('health lines describe numbers against ranges and never judge them', () => {
  const lines = healthLines({ key: 'heartRate', value: 71.4, usualLow: 60, usualHigh: 78, standing: 'within', astronautLow: 66.4, astronautHigh: 82.8, astronautStanding: 'above' });
  assert.equal(lines.title, 'Heart rate'); assert.equal(lines.value, '71 bpm');
  assert.equal(lines.own, 'Within their usual range (60–78 bpm)');
  assert.match(lines.astro, /^Above the range reported for astronauts in flight \(66–83 bpm\)$/);
  assert.doesNotMatch(JSON.stringify(lines), /good|bad|healthy|normal|safe|risk/i);
});

test('missing pieces say so instead of inventing numbers', () => {
  const lines = healthLines({ key: 'bloodOxygen', value: null, usualLow: null, usualHigh: null, standing: null, astronautLow: null, astronautHigh: null, astronautStanding: null });
  assert.equal(lines.value, 'No recent reading'); assert.equal(lines.own, 'Not enough earlier days for a usual range'); assert.equal(lines.astro, null);
  assert.equal(healthLines({ key: 'respiratoryRate', value: 13.26 }).value, '13.3 breaths/min');
  assert.equal(healthLines({ key: 'bloodOxygen', value: 97 }).value, '97%');
});
