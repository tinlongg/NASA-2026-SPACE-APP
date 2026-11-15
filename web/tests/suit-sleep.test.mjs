import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorker } from '../worker.mjs';
import { localSyncDB } from '../scripts/local-sync-db.mjs';

const origin = 'https://test.example';
const jpeg = () => { const bytes = new Uint8Array(200).fill(7); bytes.set([0xff, 0xd8, 0xff, 0xe0]); return Buffer.from(bytes).toString('base64'); };
function setup() {
  const DB = localSyncDB(), calls = [];
  const provider = async (url, init) => { calls.push(JSON.parse(init.body)); return new Response(JSON.stringify({ choices: [{ message: { content: 'Visible lighting differs.' }, finish_reason: 'stop' }] })); };
  const worker = createWorker({}, provider);
  const client = () => {
    let cookie = '';
    return async (path, method = 'GET', body) => {
      const response = await worker.fetch(new Request(origin + path, { method, headers: { ...(method === 'GET' ? {} : { Origin: origin }), ...(cookie ? { Cookie: cookie } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) }), { DB, META_API_KEY: 'test-key' });
      const set = response.headers.get('Set-Cookie'); if (set) cookie = set.split(';')[0];
      return response;
    };
  };
  return { calls, client };
}
const user = async (client, name) => { const call = client(); await call('/api/auth/register', 'POST', { username: name, password: `pw-${crypto.randomUUID()}` }); return call; };

test('entries store optional self-reported sleep hours', async () => {
  const { client } = setup(), call = await user(client, 'sleep-a');
  assert.equal((await call('/api/journal/entries', 'POST', { body: 'Rough night', sleepHours: 4.55 })).status, 201);
  await call('/api/journal/entries', 'POST', { body: 'No number' });
  const list = (await (await call('/api/journal/entries')).json()).entries;
  assert.deepEqual(list.map(entry => entry.sleepHours).sort(), [4.6, null].sort());
  for (const bad of [25, -1, '7']) assert.equal((await call('/api/journal/entries', 'POST', { body: 'x', sleepHours: bad })).status, 400);
});

test('photo comparison passes logged sleep as context only', async () => {
  const { calls, client } = setup(), call = await user(client, 'sleep-b');
  const add = async (date, sleepHours) => { const { entry } = await (await call('/api/journal/entries', 'POST', { body: 'x', date, sleepHours })).json(); await call(`/api/journal/entries/${entry.id}/photo`, 'PUT', { image: jpeg(), width: 4, height: 4 }); return entry.id; };
  await add('2026-11-01T10:00:00Z', 8); const current = await add('2026-11-10T10:00:00Z', 4.5);
  const result = await (await call('/api/journal/photos/compare', 'POST', { entryId: current, consent: true })).json();
  assert.deepEqual(result.sleepHours, [8, 4.5]);
  const body = calls[0], labels = body.messages[1].content.filter(part => part.type === 'text').map(part => part.text).join('|');
  assert.match(labels, /person logged 4.5 hours of sleep/);
  assert.match(body.messages[0].content, /never say that sleep/);
});

const items = status => [{ id: 'bladder', status }, { id: 'shell', status }];
test('suit checks: overall state, history cap of five shown, isolation and validation', async () => {
  const { client } = setup(), call = await user(client, 'suit-a'), other = await user(client, 'suit-b');
  const post = (caller, body) => caller('/api/suit/checks', 'POST', body);
  assert.equal((await (await post(call, { items: items('pass') })).json()).check.overall, 'ready');
  assert.equal((await (await post(call, { items: [{ id: 'a', status: 'pass' }, { id: 'b', status: 'unchecked' }] })).json()).check.overall, 'incomplete');
  assert.equal((await (await post(call, { items: [{ id: 'a', status: 'pass' }, { id: 'b', status: 'fail', note: 'Tear near seam' }] })).json()).check.overall, 'not-ready');
  for (let index = 0; index < 5; index++) await post(call, { items: items('pass') });
  assert.equal((await (await call('/api/suit/checks')).json()).checks.length, 5);
  assert.equal((await (await other('/api/suit/checks')).json()).checks.length, 0);
  for (const body of [{ items: [] }, { items: [{ id: 'A B', status: 'pass' }] }, { items: [{ id: 'a', status: 'maybe' }] }, { items: [{ id: 'a', status: 'pass' }, { id: 'a', status: 'pass' }] }, { items: items('pass'), extra: 1 }, { items: [{ id: 'a', status: 'pass', note: 'x'.repeat(301) }] }]) assert.equal((await post(call, body)).status, 400);
  assert.equal((await client()('/api/suit/checks')).status, 401);
});

test('suit check history keeps only the newest 50 per user', async () => {
  const { client } = setup(), call = await user(client, 'suit-cap');
  for (let index = 0; index < 52; index++) assert.equal((await call('/api/suit/checks', 'POST', { items: items('pass') })).status, 201);
  assert.equal((await (await call('/api/suit/checks')).json()).checks.length, 5);
});

test('suit readiness logic', async () => {
  const { overallState, ITEMS, GROUPS } = await import('../dist/suit-layers.js');
  assert.equal(overallState(['pass', 'pass']), 'ready');
  assert.equal(overallState(['pass', 'unchecked']), 'incomplete');
  assert.equal(overallState(['pass', 'unchecked', 'fail']), 'not-ready');
  assert.equal(overallState([]), 'incomplete');
  assert.equal(new Set(ITEMS.map(item => item.id)).size, ITEMS.length);
  assert.ok(GROUPS.every(group => group.items.every(item => /^[a-z0-9-]{1,40}$/.test(item.id) && item.inspect)));
});
