import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorker, validateInput } from '../worker.mjs';

function input() { return { question: 'Explain this replay.', snapshot: { source: 'replay', capturedAt: new Date().toISOString(), measurement: { angle: 85, hipY: 0.22 }, detection: { drop: 0.28, angle: 85, duration: 0.5, held: 2 } } }; }
function request(body = input(), origin = 'https://crew.test') { return new Request('https://crew.test/api/coach/analyze', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); }
const env = { META_API_KEY: 'test-only-secret' };

test('server calls Meta with bounded pose data and never sends unknown fields', async () => {
  let sent;
  const worker = createWorker({}, async (url, options) => {
    sent = { url, options, body: JSON.parse(options.body) };
    return Response.json({ choices: [{ message: { content: 'This is synthetic replay data.' }, finish_reason: 'stop' }] });
  });
  const body = input(); body.snapshot.frame = 'do-not-forward'; body.journal = 'private';
  const response = await worker.fetch(request(body), env);
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.answer, 'This is synthetic replay data.');
  assert.equal(result.grounded, false);
  assert.equal(sent.url, 'https://api.meta.ai/v1/chat/completions');
  assert.equal(sent.options.headers.Authorization, 'Bearer test-only-secret');
  assert.equal(sent.body.model, 'muse-spark-1.3');
  assert.equal(sent.body.messages[0].role, 'developer');
  assert.ok(!sent.options.body.includes('do-not-forward'));
  assert.ok(!sent.options.body.includes('private'));
  assert.ok(!JSON.stringify(result).includes(env.META_API_KEY));
});
test('missing secrets, wrong origin and invalid input do not call Meta', async () => {
  const worker = createWorker({}, () => { throw new Error('Must not call provider'); });
  assert.equal((await worker.fetch(request(), {})).status, 503);
  assert.equal((await worker.fetch(request(input(), 'https://other.test'), env)).status, 403);
  const body = input(); body.snapshot.measurement.angle = 500;
  assert.equal((await worker.fetch(request(body), env)).status, 400);
  body.question = 'x'.repeat(9000);
  assert.equal((await worker.fetch(request(body), env)).status, 400);
});
test('provider failures are sanitized and incomplete replies are rejected', async () => {
  for (const status of [401, 403, 429, 500]) {
    const worker = createWorker({}, async () => new Response('secret provider diagnostics', { status }));
    const result = await worker.fetch(request(), env);
    assert.equal(result.status, status === 429 ? 429 : 502);
    assert.ok(!(await result.text()).includes('secret provider diagnostics'));
  }
  const worker = createWorker({}, async () => Response.json({ choices: [{ message: { content: 'partial' }, finish_reason: 'length' }] }));
  assert.equal((await worker.fetch(request(), env)).status, 502);
});
test('network failures and invalid provider JSON yield actionable errors', async () => {
  const unavailable = createWorker({}, async () => { throw new Error('timeout'); });
  assert.equal((await unavailable.fetch(request(), env)).status, 504);
  const invalid = createWorker({}, async () => new Response('not json'));
  assert.equal((await invalid.fetch(request(), env)).status, 502);
});
test('request throttling stops repeated requests before another provider call', async () => {
  let calls = 0;
  const worker = createWorker({}, async () => { calls++; return Response.json({ choices: [{ message: { content: 'Synthetic replay.' }, finish_reason: 'stop' }] }); });
  for (let index = 0; index < 5; index++) assert.equal((await worker.fetch(request(), env)).status, 200);
  assert.equal((await worker.fetch(request(), env)).status, 429);
  assert.equal(calls, 5);
});
test('status and assets expose no credential or arbitrary server file', async () => {
  const worker = createWorker({ '/index.html': { body: '<h1>Camera</h1>', type: 'text/html' } });
  const status = await worker.fetch(new Request('https://crew.test/api/coach/status'), env);
  assert.deepEqual(await status.json(), { configured: true, model: 'muse-spark-1.3' });
  assert.equal(await (await worker.fetch(new Request('https://crew.test/'), env)).text(), '<h1>Camera</h1>');
  assert.equal((await worker.fetch(new Request('https://crew.test/worker.mjs'), env)).status, 404);
});
test('no-pose and stale observations are explicit, not invented', () => {
  const body = input(); body.snapshot = { source: 'none', capturedAt: null, measurement: null, detection: null };
  assert.equal(validateInput(body).snapshot.measurement, null);
  body.snapshot.measurement = { angle: 0, hipY: 0.5 };
  assert.equal(validateInput(body), null);
  const stale = input(); stale.snapshot.capturedAt = '2020-01-01T00:00:00.000Z';
  assert.equal(validateInput(stale).snapshot.capturedAt, stale.snapshot.capturedAt);
});
