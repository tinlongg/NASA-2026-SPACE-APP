import test from 'node:test';
import assert from 'node:assert/strict';
import { visibilityGroups, missingTorso, FramingMonitor } from '../dist/camera-health.js';
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
  assert.deepEqual(missingTorso(visibilityGroups(pose({ 24: 0.2 }))), []); // hips alone no longer block tracking
  assert.deepEqual(missingTorso(visibilityGroups(pose({ 12: 0.2 }))), ['shoulders']);
  assert.deepEqual(missingTorso(null), ['shoulders']);
});

test('framing guidance appears only after the shoulders are missing for more than 2 seconds', () => {
  const monitor = new FramingMonitor(), bad = visibilityGroups(pose({ 11: 0, 12: 0 })), good = visibilityGroups(pose({}));
  assert.equal(monitor.update(0, bad), null);
  assert.equal(monitor.update(2, bad), null);
  assert.equal(monitor.update(2.1, bad), 'Move so your shoulders are visible');
  assert.equal(monitor.update(3, good), null);        // recovers, and the timer restarts
  assert.equal(monitor.update(4, bad), null);
  assert.equal(monitor.update(10, visibilityGroups(pose({ 23: 0, 24: 0 }))), null, 'hidden hips need no guidance');
});

test('every offered pose model can be cached, and preparation covers lite and full', () => {
  const origin = 'https://test.example';
  for (const url of Object.values(POSE_MODELS)) assert.ok(cacheableAsset(url, origin));
  assert.ok(MODEL_ASSETS.includes(POSE_MODELS.lite) && MODEL_ASSETS.includes(POSE_MODELS.full));
  assert.equal(MODEL_ASSETS.includes(POSE_MODELS.heavy), false);
});

test('the worker serves the recorded alert voice as audio with the right bytes', async () => {
  const { readFile } = await import('node:fs/promises');
  const { loadAssets } = await import('../scripts/build.mjs');
  const { createWorker } = await import('../worker.mjs');
  const worker = createWorker(await loadAssets());
  for (const name of ['web-alert.mp3', 'web-checkin.mp3']) {
    const response = await worker.fetch(new Request(`https://test.example/voice/${name}`));
    assert.equal(response.status, 200, name);
    assert.equal(response.headers.get('Content-Type'), 'audio/mpeg');
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), await readFile(new URL(`../dist/voice/${name}`, import.meta.url)));
  }
});
