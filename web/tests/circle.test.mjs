import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorker } from '../worker.mjs';
import { handleCircle, notifyCircle } from '../circle.mjs';
import { localSyncDB } from '../scripts/local-sync-db.mjs';
import { wpB64 } from '../webpush.mjs';

const origin = 'https://test.example';
async function vapid() {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign']), jwk = await crypto.subtle.exportKey('jwk', pair.privateKey), raw = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
  return { VAPID_PUBLIC_KEY: wpB64.encode(raw), VAPID_PRIVATE_KEY: jwk.d, VAPID_SUBJECT: 'mailto:ops@example.com' };
}
async function subscription(endpoint) {
  const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  return { endpoint, keys: { p256dh: wpB64.encode(new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey))), auth: wpB64.encode(crypto.getRandomValues(new Uint8Array(16))) } };
}
function setup(extraEnv = {}) {
  const DB = localSyncDB(), worker = createWorker({}, async () => { throw Error('no provider'); });
  const request = async (path, { method = 'GET', body, cookie = '' } = {}) => worker.fetch(new Request(origin + path, { method, headers: { ...(method === 'GET' ? {} : { Origin: origin }), ...(cookie ? { Cookie: cookie } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) }), { DB, ...extraEnv });
  const account = async name => { const response = await request('/api/auth/register', { method: 'POST', body: { username: name, password: `pw-${crypto.randomUUID()}` } }); return response.headers.get('Set-Cookie').split(';')[0]; };
  return { DB, request, account };
}

test('create a circle, invite someone with a one-time code, and see members', async () => {
  const { request, account } = setup(), owner = await account('crc-owner'), friend = await account('crc-friend');
  assert.equal((await request('/api/circle', { method: 'POST', cookie: owner, body: { name: 'Family' } })).status, 201);
  assert.equal((await request('/api/circle', { method: 'POST', cookie: owner, body: { name: 'Again' } })).status, 409);
  const { code } = await (await request('/api/circle/invite', { method: 'POST', cookie: owner })).json();
  assert.match(code, /^[A-HJKMNP-Z2-9]{8}$/);
  assert.equal((await request('/api/circle/join', { method: 'POST', cookie: owner, body: { code } })).status, 409, 'not your own circle');
  assert.equal((await request('/api/circle/join', { method: 'POST', cookie: friend, body: { code: code.toLowerCase() } })).status, 200);
  assert.equal((await request('/api/circle/join', { method: 'POST', cookie: friend, body: { code } })).status, 404, 'an invite works once');
  const view = await (await request('/api/circle', { cookie: owner })).json();
  assert.deepEqual(view.owned.members.map(member => member.username), ['crc-friend']);
  assert.equal((await (await request('/api/circle', { cookie: friend })).json()).memberOf[0].name, 'Family');
  const friendId = view.owned.members[0].id;
  assert.equal((await request(`/api/circle/members/${friendId}`, { method: 'DELETE', cookie: owner })).status, 200);
  assert.equal((await (await request('/api/circle', { cookie: owner })).json()).owned.members.length, 0);
  assert.equal((await request('/api/circle')).status, 401);
  assert.equal((await request('/api/circle/join', { method: 'POST', cookie: friend, body: { code: 'ZZZZZZZZ' } })).status, 404);
});

test('an alert reaches the owner and every member through the feed, and nobody else', async () => {
  const { request, account } = setup(), owner = await account('crc-a'), friend = await account('crc-b'), stranger = await account('crc-c');
  await request('/api/circle', { method: 'POST', cookie: owner, body: { name: 'Crew' } });
  const { code } = await (await request('/api/circle/invite', { method: 'POST', cookie: owner })).json();
  await request('/api/circle/join', { method: 'POST', cookie: friend, body: { code } });
  assert.equal((await request('/api/circle/alert', { method: 'POST', cookie: owner, body: { title: 'Alert: Galley', body: 'Person 2 asked for help' } })).status, 201);
  for (const cookie of [owner, friend]) { const feed = await (await request('/api/circle/alerts?after=0', { cookie })).json(); assert.equal(feed.alerts[0].title, 'Alert: Galley'); assert.equal((await (await request(`/api/circle/alerts?after=${feed.latest}`, { cookie })).json()).alerts.length, 0); }
  assert.deepEqual((await (await request('/api/circle/alerts?after=0', { cookie: stranger })).json()).alerts, []);
  assert.equal((await request('/api/circle/alert', { method: 'POST', cookie: friend, body: { title: 'x', body: 'y' } })).status, 404, 'only the owner raises alerts');
  assert.equal((await request('/api/circle/alert', { method: 'POST', cookie: owner, body: { title: '', body: 'y' } })).status, 400);
});

test('push subscriptions are validated, stored once per device and removable', async () => {
  const { request, account, DB } = setup(await vapid()), cookie = await account('crc-push');
  assert.equal((await (await request('/api/push/key')).json()).configured, true);
  const sub = await subscription('https://push.example/send/abc');
  assert.equal((await request('/api/push/subscribe', { method: 'POST', cookie, body: sub })).status, 201);
  assert.equal((await request('/api/push/subscribe', { method: 'POST', cookie, body: sub })).status, 201);
  assert.equal(DB.sqlite.prepare('SELECT COUNT(*) AS n FROM push_subscriptions').get().n, 1);
  for (const bad of [{ endpoint: 'http://insecure.example/x', keys: sub.keys }, { endpoint: 'not a url', keys: sub.keys }, { endpoint: sub.endpoint, keys: {} }]) assert.equal((await request('/api/push/subscribe', { method: 'POST', cookie, body: bad })).status, 400);
  assert.equal((await request('/api/push/subscribe', { method: 'DELETE', cookie, body: { endpoint: sub.endpoint } })).status, 200);
  assert.equal(DB.sqlite.prepare('SELECT COUNT(*) AS n FROM push_subscriptions').get().n, 0);
  assert.equal((await (await setup().request('/api/push/key')).json()).configured, false);
});

test('notifyCircle pushes to the owner and members, drops dead subscriptions, and skips other circles', async () => {
  const keys = await vapid(), { request, account, DB } = setup(keys), owner = await account('crc-n1'), friend = await account('crc-n2'), other = await account('crc-n3');
  await request('/api/circle', { method: 'POST', cookie: owner, body: { name: 'Crew' } });
  const { code } = await (await request('/api/circle/invite', { method: 'POST', cookie: owner })).json();
  await request('/api/circle/join', { method: 'POST', cookie: friend, body: { code } });
  const endpoints = { owner: 'https://push.example/owner', friend: 'https://push.example/friend', gone: 'https://push.example/gone', stranger: 'https://push.example/stranger' };
  await request('/api/push/subscribe', { method: 'POST', cookie: owner, body: await subscription(endpoints.owner) });
  await request('/api/push/subscribe', { method: 'POST', cookie: friend, body: await subscription(endpoints.friend) });
  await request('/api/push/subscribe', { method: 'POST', cookie: friend, body: await subscription(endpoints.gone) });
  await request('/api/push/subscribe', { method: 'POST', cookie: other, body: await subscription(endpoints.stranger) });
  const ownerId = DB.sqlite.prepare('SELECT id FROM users WHERE username = ?').get('crc-n1').id, calls = [];
  const result = await notifyCircle({ DB, ...keys }, ownerId, { title: 'Alert: Lab', body: 'Person 1 did not answer' }, async (url, init) => { calls.push(url); return new Response('', { status: url === endpoints.gone ? 410 : 201 }); });
  assert.deepEqual(result, { recorded: true, sent: 2, called: 0 });
  assert.deepEqual(calls.sort(), [endpoints.friend, endpoints.gone, endpoints.owner].sort());
  assert.equal(DB.sqlite.prepare('SELECT COUNT(*) AS n FROM push_subscriptions WHERE endpoint = ?').get(endpoints.gone).n, 0, 'a gone subscription is removed');
  assert.deepEqual(await notifyCircle({ DB }, 'nobody', { title: 'x', body: 'y' }), { recorded: false, sent: 0 });
});

test('a station alert notifies the owner’s circle', async () => {
  const { request, account, DB } = setup(), owner = await account('crc-st'), friend = await account('crc-st2');
  await request('/api/circle', { method: 'POST', cookie: owner, body: { name: 'Crew' } });
  const { code: invite } = await (await request('/api/circle/invite', { method: 'POST', cookie: owner })).json();
  await request('/api/circle/join', { method: 'POST', cookie: friend, body: { code: invite } });
  const { code } = await (await request('/api/stations', { method: 'POST', cookie: owner, body: { name: 'Quest phone', room: 'quest' } })).json();
  const { token } = await (await request('/api/stations/join', { method: 'POST', body: { code } })).json();
  const response = await createWorker({}, async () => { throw Error('x'); }).fetch(new Request(origin + '/api/stations/report', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ people: [{ id: 3, status: 'alert', stillFor: 40 }], alert: { personId: 3, kind: 'help' } }) }), { DB });
  assert.equal(response.status, 200);
  const feed = await (await request('/api/circle/alerts?after=0', { cookie: friend })).json();
  assert.equal(feed.alerts[0].title, 'Alert: Quest phone');
  assert.match(feed.alerts[0].body, /Quest airlock: Person 3 asked for help/);
});
