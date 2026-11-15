import test from 'node:test';
import assert from 'node:assert/strict';
import { visibilityGroups, missingTorso, FramingMonitor, RestPause } from '../dist/camera-health.js';
import { POSE_MODELS, MODEL_ASSETS, cacheableAsset } from '../dist/offline-config.js';

const pose = overrides => { const landmarks = Array.from({ length: 33 }, () => ({ visibility: 0.9 })); for (const [index, visibility] of Object.entries(overrides)) landmarks[index] = { visibility }; return landmarks; };

test('visibility is reported per body group using the lowest landmark', () => {
  const groups = visibilityGroups(pose({ 23: 0.1, 14: 0.4 }));
  assert.equal(groups.hips, 0.1);
  assert.equal(groups.arms, 0.4);
  assert.equal(groups.shoulders, 0.9);
  assert.equal(visibilityGroups(null), null);
});

test('missing torso parts follow the detector threshold', () => {
  assert.deepEqual(missingTorso(visibilityGroups(pose({}))), []);
  assert.deepEqual(missingTorso(visibilityGroups(pose({ 24: 0.2 }))), ['hips']);
  assert.deepEqual(missingTorso(null), ['shoulders', 'hips']);
});

test('framing guidance appears only after shoulders or hips are missing for more than 2 seconds', () => {
  const monitor = new FramingMonitor(), bad = visibilityGroups(pose({ 23: 0, 24: 0 })), good = visibilityGroups(pose({}));
  assert.equal(monitor.update(0, bad), null);
  assert.equal(monitor.update(2, bad), null);
  assert.equal(monitor.update(2.1, bad), 'Move back so your hips are visible');
  assert.equal(monitor.update(3, good), null);        // recovers, and the timer restarts
  assert.equal(monitor.update(4, bad), null);
  assert.equal(new FramingMonitor().update(0, null), null);
  const both = new FramingMonitor(); both.update(0, null);
  assert.equal(both.update(5, null), 'Move back so your shoulders and hips are visible');
});

test('rest pause ends by itself and reports the time left', () => {
  const pause = new RestPause();
  assert.equal(pause.isPaused(0), false);
  pause.start(1000, 15);
  assert.equal(pause.isPaused(1000 + 14 * 60000), true);
  assert.equal(pause.remainingSeconds(1000 + 14 * 60000), 60);
  assert.equal(pause.isPaused(1000 + 15 * 60000), false);
  pause.start(0, 30); pause.clear();
  assert.equal(pause.isPaused(1), false);
});

test('every offered pose model can be cached, and preparation covers lite and full', () => {
  const origin = 'https://test.example';
  for (const url of Object.values(POSE_MODELS)) assert.ok(cacheableAsset(url, origin));
  assert.ok(MODEL_ASSETS.includes(POSE_MODELS.lite) && MODEL_ASSETS.includes(POSE_MODELS.full));
  assert.equal(MODEL_ASSETS.includes(POSE_MODELS.heavy), false);
});
