import test from 'node:test';
import assert from 'node:assert/strict';
import { VoiceActivity, bandLevel } from '../dist/voice-activity.js';

// Feeds one level per 100 ms and returns the last state.
function run(vad, levels, start = 0) {
  let state;
  levels.forEach((level, index) => { state = vad.update(start + index * 0.1, level).state; });
  return state;
}
const quiet = seconds => Array.from({ length: seconds * 10 }, (_, index) => -70 + (index % 3));

test('a quiet room stays quiet', () => {
  const vad = new VoiceActivity();
  assert.equal(run(vad, quiet(5)), 'quiet');
});

test('300 ms of speech 15 dB over the floor counts as speaking', () => {
  const vad = new VoiceActivity();
  run(vad, quiet(3));
  assert.equal(run(vad, [-55, -55, -55, -55], 3), 'speaking');
});

test('a single click does not count as speech', () => {
  const vad = new VoiceActivity();
  run(vad, quiet(3));
  assert.equal(run(vad, [-40, -70, -70], 3), 'quiet');
});

test('the floor adapts to steady fan noise', () => {
  const vad = new VoiceActivity();
  run(vad, quiet(2));
  const fan = Array.from({ length: 300 }, () => -52); // a pump switches on, 18 dB louder, and stays on
  run(vad, fan, 2);
  assert.equal(vad.update(32, -52).state, 'quiet');
  assert.equal(run(vad, [-35, -35, -35, -35], 32.1), 'speaking');
});

test('bandLevel averages power, not decibels', () => {
  assert.ok(Math.abs(bandLevel(new Float32Array([-20, -20]), 0, 1) + 20) < 1e-6);
  assert.ok(bandLevel(new Float32Array([-10, -100]), 0, 1) > -14);
});
