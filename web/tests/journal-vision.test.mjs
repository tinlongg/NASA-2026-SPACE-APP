import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorker } from '../worker.mjs';
import { localSyncDB } from '../scripts/local-sync-db.mjs';

const origin = 'https://test.example';
const jpeg = () => { const bytes = new Uint8Array(200).fill(7); bytes.set([0xff, 0xd8, 0xff, 0xe0]); return Buffer.from(bytes).toString('base64'); };
function setup(reply = { choices: [{ message: { content: 'Lighting differs between the photos.' }, finish_reason: 'stop' }] }) {
  const DB = localSyncDB(), calls = [];
  const provider = async (url, init) => { calls.push({ url, body: JSON.parse(init.body), auth: init.headers.Authorization }); return new Response(JSON.stringify(reply), { status: reply.status || 200 }); };
  const worker = createWorker({}, provider);
  const client = () => {
    let cookie = '';
    return async (path, method = 'GET', body, env = { META_API_KEY: 'test-key' }) => {
      const response = await worker.fetch(new Request(origin + path, { method, headers: { ...(method === 'GET' ? {} : { Origin: origin }), ...(cookie ? { Cookie: cookie } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) }), { DB, ...env });
      const set = response.headers.get('Set-Cookie'); if (set) cookie = set.split(';')[0];
      return response;
    };
  };
  return { DB, calls, client };
}
async function user(client, name) {
  const call = client(); await call('/api/auth/register', 'POST', { username: name, password: `pw-${crypto.randomUUID()}` }); return call;
}
async function entryWithPhoto(call, date, withPhoto = true) {
  const { entry } = await (await call('/api/journal/entries', 'POST', { body: 'day ' + date, date })).json();
  if (withPhoto) await call(`/api/journal/entries/${entry.id}/photo`, 'PUT', { image: jpeg(), width: 4, height: 4 });
  return entry.id;
}

test('compare sends the entry photo and earlier photos, chosen by the server', async () => {
  const { calls, client } = setup(), call = await user(client, 'vision-a');
  await entryWithPhoto(call, '2026-11-01T10:00:00Z'); await entryWithPhoto(call, '2026-11-05T10:00:00Z'); await entryWithPhoto(call, '2026-11-08T10:00:00Z');
  const current = await entryWithPhoto(call, '2026-11-10T10:00:00Z');
  const response = await call('/api/journal/photos/compare', 'POST', { entryId: current, consent: true });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.deepEqual(result.compared, ['2026-11-01', '2026-11-08', '2026-11-10']); // oldest, most recent earlier, this one
  assert.match(result.notice, /Not a health assessment/);
  assert.equal(calls.length, 1);
  const content = calls[0].body.messages[1].content, images = content.filter(part => part.type === 'image_url');
  assert.equal(images.length, 3);
  assert.match(images[0].image_url.url, /^data:image\/jpeg;base64,/);
  assert.match(calls[0].body.messages[0].content, /Do not estimate weight/);
});

test('compare requires consent, sign-in, own photo, and an earlier photo', async () => {
  const { calls, client } = setup(), call = await user(client, 'vision-b'), other = await user(client, 'vision-c');
  const only = await entryWithPhoto(call, '2026-11-10T10:00:00Z'), plain = await entryWithPhoto(call, '2026-11-11T10:00:00Z', false);
  const post = (caller, body) => caller('/api/journal/photos/compare', 'POST', body);
  assert.equal((await post(call, { entryId: only })).status, 400);
  assert.equal((await post(call, { entryId: only, consent: true, images: ['x'] })).status, 400); // the browser cannot supply images
  assert.equal((await post(client(), { entryId: only, consent: true })).status, 401);
  assert.equal((await post(other, { entryId: only, consent: true })).status, 404);
  assert.equal((await post(call, { entryId: plain, consent: true })).status, 404);
  assert.equal((await post(call, { entryId: only, consent: true })).status, 409);
  assert.equal((await post(call, { entryId: only, consent: true }, undefined)).status, 409);
  assert.equal(calls.length, 0);
});

test('compare reports provider failure and a missing key without leaking details', async () => {
  const failing = setup({ status: 500, error: 'secret detail' }), call = await user(failing.client, 'vision-d');
  await entryWithPhoto(call, '2026-11-01T10:00:00Z'); const current = await entryWithPhoto(call, '2026-11-02T10:00:00Z');
  const response = await call('/api/journal/photos/compare', 'POST', { entryId: current, consent: true });
  assert.equal(response.status, 502); assert.equal((await response.text()).includes('secret detail'), false);
  assert.equal((await call('/api/journal/photos/compare', 'POST', { entryId: current, consent: true }, {})).status, 503);
});

test('camera look accepts only one live JPEG frame and never replay', async () => {
  const { calls, client } = setup(), call = client();
  const look = body => call('/api/coach/look', 'POST', body);
  assert.equal((await look({ source: 'replay', frame: jpeg() })).status, 400);
  assert.equal((await look({ source: 'live' })).status, 400);
  assert.equal((await look({ source: 'live', frame: Buffer.from('\x89PNG\r\n\x1a\nxxxx').toString('base64') })).status, 400);
  assert.equal((await look({ source: 'live', frame: jpeg(), extra: 1 })).status, 400);
  assert.equal(calls.length, 0);
  const ok = await look({ source: 'live', frame: jpeg() });
  assert.equal(ok.status, 200);
  const result = await ok.json();
  assert.match(result.note, /Lighting/);
  assert.match(calls[0].body.messages[0].content, /Never say the person is or is not responsive/);
  assert.equal(JSON.stringify(result).includes(jpeg()), false); // the frame is not echoed or stored
});

test('camera look failure leaves the caller able to continue', async () => {
  const { client } = setup({ status: 429 }), call = client();
  assert.equal((await call('/api/coach/look', 'POST', { source: 'live', frame: jpeg() })).status, 429);
});
