import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorker, parseWatch } from '../worker.mjs';

const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 6]).toString('base64');
const env = { META_API_KEY: 'test-only-secret' };
const request = (body, origin = 'https://crew.test') => new Request('https://crew.test/api/coach/watch', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const valid = () => ({ source: 'live', faces: [jpeg, jpeg, jpeg], body: jpeg, stillFor: 6.2 });

test('live watch sends the screenshots to MUSE and returns only typed fields', async () => {
  let sent;
  const worker = createWorker({}, async (url, options) => {
    sent = JSON.parse(options.body);
    return Response.json({ choices: [{ finish_reason: 'stop', message: { reasoning_content: 'Compared lips.', content: 'Sure: {"personVisible":true,"mouthMoving":true,"headOrBodyMoving":false,"eyes":"open","face":"Lips part between shots.","body":"Seated.","thinking":"Shot 2 differs.","extra":"drop me"}' } }] });
  });
  const response = await worker.fetch(request(valid()), env);
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.mouthMoving, true); assert.equal(data.headOrBodyMoving, false); assert.equal(data.eyes, 'open');
  assert.equal(data.reasoning, 'Compared lips.'); assert.equal(data.extra, undefined);
  assert.equal(sent.messages[1].content.filter(part => part.type === 'image_url').length, 4);
  assert.ok(!JSON.stringify(data).includes(env.META_API_KEY));
});

test('live watch rejects replay, wrong origin, too few screenshots and non-JPEG data', async () => {
  const worker = createWorker({}, () => { throw new Error('Must not call provider'); });
  assert.equal((await worker.fetch(request({ ...valid(), source: 'replay' }), env)).status, 400);
  assert.equal((await worker.fetch(request(valid(), 'https://evil.test'), env)).status, 403);
  assert.equal((await worker.fetch(request({ ...valid(), faces: [jpeg] }), env)).status, 400);
  assert.equal((await worker.fetch(request({ ...valid(), faces: ['aGVsbG8=', jpeg] }), env)).status, 400);
  assert.equal((await worker.fetch(request({ ...valid(), note: 'x' }), env)).status, 400);
  assert.equal((await worker.fetch(request(valid()), {})).status, 503);
});

test('parseWatch tolerates prose around the JSON and defaults unknown values', () => {
  assert.equal(parseWatch('no json here'), null);
  assert.deepEqual(parseWatch('{"mouthMoving":"yes","eyes":"squinting"}'), { personVisible: false, mouthMoving: false, headOrBodyMoving: false, eyes: 'unclear', face: '', body: '', thinking: '' });
});
