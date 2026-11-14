import test from 'node:test';
import assert from 'node:assert/strict';
import { FallDetector, measurePose } from '../dist/detector.js';

test('rapid drop and sustained horizontal posture emits one event', () => {
  const detector = new FallDetector();
  detector.process(0, { hipY: 0.6, angle: 0 });
  assert.equal(detector.process(0.5, { hipY: 0.3, angle: 85 }), null);
  assert.equal(detector.process(2.4, { hipY: 0.3, angle: 85 }), null);
  assert.equal(detector.process(2.5, { hipY: 0.3, angle: 85 }).drop, 0.3);
  assert.equal(detector.process(3, { hipY: 0.3, angle: 85 }), null);
  detector.process(3.1, { hipY: 0.6, angle: 0 });
  assert.equal(detector.process(3.5, { hipY: 0.3, angle: 85 }), null);
  assert.equal(detector.process(6, { hipY: 0.3, angle: 85 }), null);
});
test('upright, slow descent and recovery do not alert', () => {
  const detector = new FallDetector();
  for (let time = 0; time < 5; time += 0.1) assert.equal(detector.process(time, { hipY: 0.6, angle: 5 }), null);
  assert.equal(detector.process(7, { hipY: 0.3, angle: 80 }), null);
  detector.reset(); detector.process(0, { hipY: 0.6, angle: 0 }); detector.process(0.5, { hipY: 0.3, angle: 85 });
  detector.process(1, { hipY: 0.6, angle: 0 });
  assert.equal(detector.process(4, { hipY: 0.6, angle: 0 }), null);
});
test('lost pose cancels hold, including a gap ending on a valid pose', () => {
  const detector = new FallDetector(); detector.process(0, { hipY: 0.6, angle: 0 }); detector.process(0.5, { hipY: 0.3, angle: 85 }); detector.process(0.6, null);
  assert.equal(detector.process(3, { hipY: 0.3, angle: 85 }), null);
});
test('measurement converts image coordinates and rejects low confidence', () => {
  const pose = Array.from({length:33}, () => ({x:0.5,y:0.5,visibility:1})); pose[11].y = pose[12].y = 0.2;
  assert.deepEqual(measurePose(pose, 16/9), {hipY:0.5,angle:0});
  pose[11].visibility = 0.1; assert.equal(measurePose(pose,16/9),null);
});
