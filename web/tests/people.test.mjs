import test from 'node:test';
import assert from 'node:assert/strict';
import { PersonTracker, personCentre, nearestIndex, blendshapeScores, eyeReading, MouthActivity, faceBox, cropRect } from '../dist/people.js';

test('ids stay with people as they move and swap order', () => {
  const tracker = new PersonTracker();
  assert.deepEqual(tracker.update(0, [[0.2, 0.5], [0.8, 0.5]]), [1, 2]);
  assert.deepEqual(tracker.update(0.1, [[0.82, 0.5], [0.21, 0.52]]), [2, 1], 'order in the frame does not change identity');
  assert.deepEqual(tracker.update(0.2, [[0.5, 0.5], [0.22, 0.5], [0.82, 0.5]]), [3, 1, 2], 'a new person gets a new id');
});

test('a person who leaves is forgotten after a few seconds and a newcomer gets a fresh id', () => {
  const tracker = new PersonTracker({ forgetSeconds: 3 });
  tracker.update(0, [[0.3, 0.5]]);
  tracker.update(1, []);
  assert.deepEqual(tracker.update(2, [[0.3, 0.5]]), [1], 'back within the window keeps the id');
  tracker.update(3, []); tracker.update(7, []);
  assert.deepEqual(tracker.gone, [1]);
  assert.deepEqual(tracker.update(8, [[0.3, 0.5]]), [2]);
});

test('person centre and nearest matching', () => {
  const landmarks = Array.from({ length: 33 }, () => ({ x: 0, y: 0, visibility: 0.9 }));
  landmarks[11] = { x: 0.4, y: 0.4, visibility: 0.9 }; landmarks[12] = { x: 0.6, y: 0.4, visibility: 0.9 };
  assert.deepEqual(personCentre(landmarks), [0.5, 0.4]);
  assert.equal(personCentre(null), null);
  assert.equal(nearestIndex([0.52, 0.42], [[0.1, 0.1], [0.5, 0.4]]), 1);
  assert.equal(nearestIndex([0.9, 0.9], [[0.1, 0.1]]), -1);
});

test('eye reading from blink scores', () => {
  const scores = blendshapeScores([{ categoryName: 'eyeBlinkLeft', score: 0.1 }, { categoryName: 'eyeBlinkRight', score: 0.15 }]);
  assert.equal(eyeReading(scores).state, 'open');
  assert.equal(eyeReading({ eyeBlinkLeft: 0.9, eyeBlinkRight: 0.8 }).state, 'closed');
  assert.equal(eyeReading({ eyeBlinkLeft: 0.9, eyeBlinkRight: 0.1 }).state, 'unclear');
  assert.equal(eyeReading(null).state, 'unknown');
});

test('mouth activity needs movement over a window, and says unknown without data', () => {
  const mouth = new MouthActivity();
  for (let t = 0; t < 1; t += 0.25) mouth.update(t, { jawOpen: 0.05 });
  assert.equal(mouth.update(1, { jawOpen: 0.05 }).state, 'still');
  const talking = new MouthActivity(); let last;
  for (let t = 0; t < 2; t += 0.2) last = talking.update(t, { jawOpen: Math.round(t * 5) % 2 ? 0.3 : 0.02 });
  assert.equal(last.state, 'moving');
  assert.equal(new MouthActivity().update(0, null).state, 'unknown');
  assert.equal(new MouthActivity().update(0, { jawOpen: 0.1 }).state, 'unknown', 'too few samples yet');
});

test('face box and crop stay inside the frame with the requested aspect', () => {
  const landmarks = [{ x: 0.45, y: 0.3 }, { x: 0.55, y: 0.45 }];
  const box = faceBox(landmarks);
  assert.ok(box.x < 0.45 && box.width > 0.1);
  const crop = cropRect({ x: 0.9, y: 0.0, width: 0.2, height: 0.2 }, 640, 480);
  assert.ok(crop.x >= 0 && crop.y >= 0 && crop.x + crop.width <= 640 && crop.y + crop.height <= 480);
  assert.ok(Math.abs(crop.width / crop.height - 4 / 3) < 1e-6);
  assert.equal(faceBox([]), null);
});

import { describePerson } from '../dist/people.js';
test('person readings are plain statements, never conclusions about condition', () => {
  const base = { tracked: true, upper: false, motion: 0.31, threshold: 0.25, stillFor: 0, stillSeconds: 15, alerted: false, eyes: { state: 'open' }, mouth: { state: 'moving' } };
  assert.deepEqual(describePerson(base), ['Tracking the full body.', 'Moving: largest joint change 0.31.', 'Eyes look open.', 'The mouth is moving (on device).']);
  const still = describePerson({ ...base, upper: true, stillFor: 9.4, eyes: { state: 'closed' }, mouth: { state: 'still' } });
  assert.ok(still.includes('Tracking the upper body only (hips are not visible).') && still.includes('Still for 9 s. An alert is raised at 15 s without movement.') && still.includes('Eyes look closed.'));
  assert.match(describePerson({ ...base, alerted: true, stillFor: 15.2 })[1], /Alert raised.*15 s/);
  assert.deepEqual(describePerson({ ...base, tracked: false }), ['Not tracked right now. Shoulders need to be visible.']);
  assert.match(describePerson({ ...base, replay: true })[2], /not available in synthetic replays/);
  const text = describePerson(base).join(' ') + describePerson({ ...base, alerted: true }).join(' ');
  assert.doesNotMatch(text, /unconscious|asleep|unresponsive|injured|dead|sick/i);
});

test('every browser module the app imports is served by the Worker and cached by the shell', async () => {
  const { readFile } = await import('node:fs/promises');
  const { loadAssets } = await import('../scripts/build.mjs');
  const { SHELL_ASSETS } = await import('../dist/offline-config.js');
  const assets = await loadAssets();
  for (const file of ['app.js', 'camera-health.js', 'people.js', 'voice-answer.js', 'voice-agent.js', 'checkin.js', 'camera.js', 'stations-ui.js', 'iss-3d.js', 'circle-ui.js', 'detector.js', 'fixtures.js', 'journal-photo.js', 'suit-layers.js', 'account.js']) {
    const source = await readFile(new URL(`../dist/${file}`, import.meta.url), 'utf8');
    for (const [, path] of source.matchAll(/from '\.\/([\w.-]+)'/g)) {
      assert.ok(assets[`/${path}`], `${file} imports ./${path}, which the Worker does not serve`);
      assert.ok(SHELL_ASSETS.includes(`/${path}`), `${file} imports ./${path}, which is not in the offline shell`);
    }
  }
});

import { BlinkDetector } from '../dist/people.js';
import { InactivityDetector } from '../dist/detector.js';
test('a blink is open, then closed, then open again', () => {
  const blink = new BlinkDetector(), score = value => ({ eyeBlinkLeft: value, eyeBlinkRight: value });
  assert.equal(blink.update(score(0.05)), false);
  assert.equal(blink.update(score(0.7)), false);
  assert.equal(blink.update(score(0.1)), true);
  assert.equal(blink.update(score(0.1)), false);
  const staysClosed = new BlinkDetector(); staysClosed.update(score(0.05)); staysClosed.update(score(0.9));
  assert.equal(staysClosed.update(score(0.9)), false, 'eyes held shut are not a blink');
  assert.equal(new BlinkDetector().update(null), false);
});

test('facial activity restarts the stillness timer and the alert waits for 15 more seconds', () => {
  const body = { points: { 11: [0.4, 0.3], 12: [0.6, 0.3], 23: [0.45, 0.6], 24: [0.55, 0.6] } };
  const detector = new InactivityDetector();
  for (let time = 0; time < 14; time += 0.5) assert.equal(detector.process(time, body), null);
  detector.noteActivity(14);                                   // the person spoke
  for (let time = 14; time < 28.5; time += 0.5) assert.equal(detector.process(time, body), null, `no alert at ${time}`);
  assert.ok(detector.process(29, body), 'alert after 15 s with no activity at all');
  assert.equal(new InactivityDetector().noteActivity(5), undefined, 'ignored when nobody is tracked');
});

import { lipAperture, MouthMotion } from '../dist/people.js';
const lips = gap => { const points = []; points[61] = { x: 0.4, y: 0.7 }; points[291] = { x: 0.6, y: 0.7 }; points[13] = { x: 0.5, y: 0.7 - gap / 2 }; points[14] = { x: 0.5, y: 0.7 + gap / 2 }; return points; };
test('lip aperture is the inner gap over mouth width', () => {
  assert.ok(Math.abs(lipAperture(lips(0.02)) - 0.1) < 1e-9);
  assert.ok(lipAperture(lips(0.06)) > lipAperture(lips(0.002)));
  assert.equal(lipAperture([]), null);
});
test('mouth motion: talking lips move, a still mouth and head-only motion do not', () => {
  const talking = new MouthMotion(); let state;
  for (let index = 0; index < 12; index++) state = talking.update(index * 0.12, [0.02, 0.15, 0.06, 0.2][index % 4], 0.01).state;
  assert.equal(state, 'moving');
  const still = new MouthMotion();
  for (let index = 0; index < 12; index++) state = still.update(index * 0.12, 0.02 + (index % 2) * 0.004, 0.01 + (index % 2) * 0.002).state;
  assert.equal(state, 'still');
  const mouthing = new MouthMotion(); // lip gap hidden, but the lip patch changes more than the nose patch
  for (let index = 0; index < 10; index++) state = mouthing.update(index * 0.12, null, 0.005).state;
  for (let index = 10; index < 16; index++) state = mouthing.update(index * 0.12, null, 0.08).state;
  assert.equal(state, 'moving');
  assert.equal(new MouthMotion().update(0, null, null).state, 'unknown');
});

test('camera noise around a still mouth does not count as talking', () => {
  const mouth = new MouthMotion();
  let state;
  // A still face: the lip gap wobbles by 0.02 and the lip patch has a noisy spike every third frame.
  for (let index = 0; index < 40; index++) state = mouth.update(index * 0.15, 0.1 + (index % 2) * 0.02, index % 3 === 0 ? 0.05 : 0.012).state;
  assert.equal(state, 'still');
  // Real talking: the lip gap opens and closes by 0.1.
  for (let index = 40; index < 50; index++) state = mouth.update(index * 0.15, 0.1 + (index % 2) * 0.1, 0.012).state;
  assert.equal(state, 'moving');
});
