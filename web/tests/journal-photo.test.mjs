import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorker } from '../worker.mjs';
import { localSyncDB } from '../scripts/local-sync-db.mjs';
import { cacheableAsset } from '../dist/offline-config.js';

const origin = 'https://test.example';
const jpeg = (size = 200) => { const bytes = new Uint8Array(size).fill(7); bytes.set([0xff, 0xd8, 0xff, 0xe0]); return Buffer.from(bytes).toString('base64'); };
function setup() {
  const DB = localSyncDB(), worker = createWorker({}, async () => { throw Error('no provider'); });
  const client = () => {
    let cookie = '';
    return async (path, method = 'GET', body) => {
      const response = await worker.fetch(new Request(origin + path, { method, headers: { ...(method === 'GET' ? {} : { Origin: origin }), ...(cookie ? { Cookie: cookie } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) }), { DB });
      const set = response.headers.get('Set-Cookie'); if (set) cookie = set.split(';')[0];
      return response;
    };
  };
  return { DB, client };
}
async function signedIn(client, name) {
  const call = client();
  assert.equal((await call('/api/auth/register', 'POST', { username: name, password: `pw-${crypto.randomUUID()}` })).status, 201);
  return call;
}
const addEntry = async (call, body = 'Slept badly') => (await (await call('/api/journal/entries', 'POST', { body })).json()).entry.id;
const photo = id => `/api/journal/entries/${id}/photo`;
const put = (call, id, image = jpeg(), size = { width: 480, height: 640 }) => call(photo(id), 'PUT', { image, ...size });

test('upload, fetch and delete a photo', async () => {
  const { client } = setup(), call = await signedIn(client, 'photo-one'), id = await addEntry(call);
  assert.equal((await put(call, id)).status, 201);
  const fetched = await call(photo(id));
  assert.equal(fetched.status, 200);
  assert.equal(fetched.headers.get('Content-Type'), 'image/jpeg');
  assert.equal(fetched.headers.get('Cache-Control'), 'private, no-store');
  assert.equal(Buffer.from(await fetched.arrayBuffer()).toString('base64'), jpeg());
  const list = await (await call('/api/journal/entries')).json();
  assert.equal(list.entries[0].hasPhoto, true);
  assert.equal(JSON.stringify(list).includes(jpeg()), false); // The list never inlines image data.
  assert.equal((await put(call, id, jpeg(300))).status, 201); // One photo per entry: replace.
  assert.equal((await call(photo(id), 'DELETE')).status, 200);
  assert.equal((await call(photo(id))).status, 404);
  assert.equal((await (await call('/api/journal/entries')).json()).entries[0].hasPhoto, false);
});

test('another user cannot read, replace or delete a photo', async () => {
  const { client } = setup(), owner = await signedIn(client, 'photo-owner'), other = await signedIn(client, 'photo-other'), id = await addEntry(owner);
  await put(owner, id);
  assert.equal((await other(photo(id))).status, 404);
  assert.equal((await put(other, id)).status, 404);
  assert.equal((await other(photo(id), 'DELETE')).status, 404);
  assert.equal((await owner(photo(id))).status, 200);
  assert.equal((await client()(photo(id))).status, 401);
});

test('oversize, non-JPEG and malformed uploads are rejected', async () => {
  const { client } = setup(), call = await signedIn(client, 'photo-bad'), id = await addEntry(call);
  assert.equal((await put(call, id, jpeg(300000))).status, 413);
  assert.equal((await put(call, id, jpeg(500000))).status, 413);
  assert.equal((await put(call, id, Buffer.from('\x89PNG\r\n\x1a\nxxxx').toString('base64'))).status, 415);
  assert.equal((await put(call, id, 'not base64!')).status, 400);
  assert.equal((await put(call, id, jpeg(), { width: 0, height: 10 })).status, 400);
  assert.equal((await call(photo(id), 'PUT', { image: jpeg(), width: 5, height: 5, extra: 1 })).status, 400);
  assert.equal((await call(photo(id))).status, 404);
});

test('deleting an entry or the whole journal removes its photos', async () => {
  const { DB, client } = setup(), call = await signedIn(client, 'photo-del'), first = await addEntry(call, 'one'), second = await addEntry(call, 'two');
  await put(call, first); await put(call, second);
  const count = () => DB.sqlite.prepare('SELECT COUNT(*) AS n FROM journal_photos').get().n;
  assert.equal(count(), 2);
  await call(`/api/journal/entries/${first}`, 'DELETE');
  assert.equal(count(), 1);
  await call('/api/journal/entries', 'DELETE');
  assert.equal(count(), 0);
});

test('photos per account are capped', async () => {
  const { client } = setup(), call = await signedIn(client, 'photo-cap');
  for (let index = 0; index < 60; index++) assert.equal((await put(call, await addEntry(call, `entry ${index}`))).status, 201);
  const extra = await addEntry(call, 'one more');
  assert.equal((await put(call, extra)).status, 409);
});

test('service worker never caches photo or journal API responses', () => {
  assert.equal(cacheableAsset(`${origin}/api/journal/entries/${crypto.randomUUID()}/photo`, origin), false);
  assert.equal(cacheableAsset(`${origin}/api/journal/entries`, origin), false);
});

test('history groups entries by local day, newest day first', async () => {
  const { groupByDay } = await import('../dist/journal-photo.js');
  const days = groupByDay([{ date: '2026-11-10T10:00:00' }, { date: '2026-11-12T10:00:00' }, { date: '2026-11-10T12:00:00' }]);
  assert.deepEqual(days.map(day => [day.day, day.items.length]), [['2026-11-12', 1], ['2026-11-10', 2]]);
});
