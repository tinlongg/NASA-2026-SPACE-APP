import test from 'node:test';
import assert from 'node:assert/strict';
import { InactivityDetector, measurePose, bodyShape, shapeChange, STILL_SECONDS } from '../dist/detector.js';
import { REPLAYS, replayMeasurement } from '../dist/fixtures.js';

for (const [kind, fixture] of Object.entries(REPLAYS)) {
  test(`UI replay: ${fixture.label} produces ${fixture.expected} event(s)`, () => {
    for (const fps of [10, 15, 30, 60]) {
      const detector = new InactivityDetector(); const detections = [];
      for (let frame = 0; frame <= fixture.duration * fps; frame++) {
        const result = detector.process(frame / fps, replayMeasurement(kind, frame / fps));
        if (result) detections.push(result);
      }
      assert.equal(detections.length, fixture.expected, `${fps} FPS`);
    }
  });
}

const body = (dx = 0, wrist = 0) => ({ points: { 11: [0.4 + dx, 0.3], 12: [0.6 + dx, 0.3], 23: [0.45 + dx, 0.6], 24: [0.55 + dx, 0.6], 15: [0.3 + dx, 0.5 - wrist] } });

test('stillness for the threshold raises one event, and movement re-arms it', () => {
  const detector = new InactivityDetector();
  for (let time = 0; time < STILL_SECONDS; time += 0.5) assert.equal(detector.process(time, body()), null);
  const event = detector.process(STILL_SECONDS, body());
  assert.equal(event.stillFor, STILL_SECONDS);
  assert.equal(detector.process(STILL_SECONDS + 5, body()), null, 'one event per still period');
  assert.equal(detector.process(STILL_SECONDS + 6, body(0, 0.2)), null, 'a reach counts as movement');
  assert.ok(detector.process(STILL_SECONDS * 2 + 6, body(0, 0.2)), 'still again after moving');
});

test('drifting and rotating with a frozen shape is still not movement', () => {
  const a = bodyShape(body().points), b = bodyShape(Object.fromEntries(Object.entries(body(0.2).points).map(([i, [x, y]]) => [i, [0.5 + (y - 0.45), 0.45 - (x - 0.5)]])));
  assert.ok(shapeChange(a, b) < 0.01);
  assert.ok(shapeChange(a, bodyShape(body(0, 0.2).points)) > 0.25);
});

test('losing the pose resets the timer; a brief gap does not', () => {
  const detector = new InactivityDetector();
  detector.process(0, body()); detector.process(10, body());
  detector.process(10.5, null); detector.process(11, body());
  assert.ok(detector.process(STILL_SECONDS, body()), 'short gap kept the timer');
  detector.reset(); detector.process(0, body()); detector.process(10, null); detector.process(13, null);
  assert.equal(detector.process(STILL_SECONDS + 1, body()), null, 'long gap restarted it');
  assert.equal(detector.stillFor(STILL_SECONDS + 1), 0);
});

test('measurement keeps confident joints and rejects a missing torso', () => {
  const landmarks = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 1 }));
  landmarks[11].y = landmarks[12].y = 0.2; landmarks[11].x = 0.4; landmarks[12].x = 0.6;
  landmarks[15].visibility = 0.4;
  const measurement = measurePose(landmarks, 4 / 3);
  assert.ok(measurement.points[11] && !measurement.points[15]);
  assert.deepEqual(measurement.points[23], [0.5 * 4 / 3, 0.5]);
  landmarks[24].visibility = 0.1;
  const upper = measurePose(landmarks, 4 / 3); // hips hidden: shoulders still give an upper-body measurement
  assert.equal(upper.upper, true); assert.ok(upper.points[11] && !upper.points[24]);
  landmarks[12].visibility = 0.1; assert.equal(measurePose(landmarks, 4 / 3), null);
});

const seated = (arm = 0, dx = 0) => ({ upper: true, points: { 0: [0.5 + dx, 0.3], 11: [0.4 + dx, 0.45], 12: [0.6 + dx, 0.45], 15: [0.35 + dx, 0.7 - arm] } });

test('a seated person (hips hidden) is tracked and alerts after stillness', () => {
  const detector = new InactivityDetector();
  for (let time = 0; time < STILL_SECONDS; time += 0.5) assert.equal(detector.process(time, seated()), null);
  const event = detector.process(STILL_SECONDS, seated());
  assert.equal(event.upper, true);
  assert.equal(detector.process(STILL_SECONDS + 1, seated(0.4)), null, 'a reach restarts the timer');
});

test('typing-sized hand movement while seated is not stillness', () => {
  const detector = new InactivityDetector(); let alerts = 0;
  for (let time = 0; time < 60; time += 0.25) if (detector.process(time, seated(Math.round(time) % 2 ? 0.15 : 0))) alerts++;
  assert.equal(alerts, 0);
});

test('sitting down or standing up counts as movement', () => {
  const detector = new InactivityDetector();
  for (let time = 0; time < 10; time += 0.5) detector.process(time, body());
  assert.equal(detector.process(10, seated()), null);
  for (let time = 10.5; time < 10 + STILL_SECONDS - 0.5; time += 0.5) assert.equal(detector.process(time, seated()), null, 'timer restarted when the tracking mode changed');
  assert.ok(detector.process(10 + STILL_SECONDS, seated()));
});
