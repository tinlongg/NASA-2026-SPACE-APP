import test from 'node:test';
import assert from 'node:assert/strict';
import { CheckIns, RAISES_ALERT } from '../dist/checkin.js';

test('no answer in time ends as a timeout, which raises the alert', () => {
  const checkIns = new CheckIns({ seconds: 30 });
  assert.equal(checkIns.start(1, { name: 'p1' }, 0), true);
  assert.equal(checkIns.start(1, {}, 1000), false, 'one check-in per person');
  assert.deepEqual(checkIns.tick(29000, () => true), []);
  assert.equal(checkIns.remaining(1, 20000), 10);
  const [ended] = checkIns.tick(30000, () => true);
  assert.deepEqual([ended.id, ended.outcome, ended.info.name], [1, 'timeout', 'p1']);
  assert.equal(RAISES_ALERT[ended.outcome], true);
  assert.equal(checkIns.size, 0);
});

test('saying okay or moving again ends it quietly; asking for help raises the alert', () => {
  const checkIns = new CheckIns();
  checkIns.start(1, {}, 0); checkIns.start(2, {}, 0); checkIns.start(3, {}, 0);
  assert.equal(checkIns.answer(1, 'ok').outcome, 'ok');
  assert.equal(checkIns.answer(2, 'help').outcome, 'help');
  assert.equal(checkIns.answer(2, 'ok'), null, 'already closed');
  assert.equal(checkIns.answer(3, 'none'), null, 'silence is not an answer');
  const [moved] = checkIns.tick(5000, () => false);
  assert.equal(moved.outcome, 'moved');
  assert.deepEqual([RAISES_ALERT.ok, RAISES_ALERT.moved, RAISES_ALERT.help], [false, false, true]);
});

test('check-ins for different people run independently and can all be cancelled', () => {
  const checkIns = new CheckIns({ seconds: 10 });
  checkIns.start(1, 'a', 0); checkIns.start(2, 'b', 5000);
  const ended = checkIns.tick(10000, () => true);
  assert.deepEqual(ended.map(item => item.id), [1]);
  assert.equal(checkIns.has(2), true);
  assert.deepEqual(checkIns.cancelAll(), ['b']);
  assert.equal(checkIns.size, 0);
});
