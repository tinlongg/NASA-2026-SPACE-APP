import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorker } from '../worker.mjs';
import { localSyncDB } from '../scripts/local-sync-db.mjs';
import { cleanReport } from '../stations.mjs';

const origin = 'https://test.example';
function setup() {
  const DB = localSyncDB(), worker = createWorker({}, async () => { throw Error('no provider'); });
  const request = async (path, { method = 'GET', body, cookie = '', token = '' } = {}) => worker.fetch(new Request(origin + path, { method, headers: { ...(method === 'GET' ? {} : { Origin: origin }), ...(cookie ? { Cookie: cookie } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) }), { DB });
  const account = async name => { const response = await request('/api/auth/register', { method: 'POST', body: { username: name, password: `pw-${crypto.randomUUID()}` } }); return response.headers.get('Set-Cookie').split(';')[0]; };
  return { DB, request, account };
}
const person = (id, status = 'moving', extra = {}) => ({ id, status, stillFor: 0, ...extra });

test('create a station, join with the code once, report, and see it as online', async () => {
  const { request, account } = setup(), cookie = await account('stn-admin');
  const created = await (await request('/api/stations', { method: 'POST', cookie, body: { name: 'Galley cam', room: 'galley' } })).json();
  assert.match(created.code, /^[A-HJKMNP-Z2-9]{6}$/);
  assert.equal((await request('/api/stations', { cookie })).status, 200);
  assert.equal((await (await request('/api/stations', { cookie })).json()).stations[0].waitingForCode, true);
  const joined = await request('/api/stations/join', { method: 'POST', body: { code: created.code.toLowerCase() } });
  assert.equal(joined.status, 200);
  const { token, stationId } = await joined.json();
  assert.match(token, /^[0-9a-f]{64}$/); assert.equal(stationId, created.station.id);
  assert.equal((await request('/api/stations/join', { method: 'POST', body: { code: created.code } })).status, 404, 'a code works once');
  const report = await request('/api/stations/report', { method: 'POST', token, body: { people: [person(1, 'still', { stillFor: 9.46, eyes: 'open', mouth: 'still', secret: 'x' })], fps: 11, model: 'full' } });
  assert.equal(report.status, 200);
  const station = (await (await request('/api/stations', { cookie })).json()).stations[0];
  assert.equal(station.paired, true); assert.equal(station.online, true); assert.equal(station.waitingForCode, false);
  assert.deepEqual(station.report.people[0], { id: 1, status: 'still', stillFor: 9.5, eyes: 'open', mouth: 'still' });
  assert.equal(JSON.stringify(station).includes(token), false);
});

test('only the owner sees or removes a station, and a removed phone is cut off', async () => {
  const { request, account } = setup(), cookie = await account('stn-owner'), other = await account('stn-other');
  const { station, code } = await (await request('/api/stations', { method: 'POST', cookie, body: { name: 'Lab', room: 'lab' } })).json();
  const { token } = await (await request('/api/stations/join', { method: 'POST', body: { code } })).json();
  assert.equal((await (await request('/api/stations', { cookie: other })).json()).stations.length, 0);
  assert.equal((await request(`/api/stations/${station.id}`, { method: 'DELETE', cookie: other })).status, 404);
  assert.equal((await request('/api/stations')).status, 401);
  assert.equal((await request(`/api/stations/${station.id}`, { method: 'DELETE', cookie })).status, 200);
  assert.equal((await request('/api/stations/report', { method: 'POST', token, body: { people: [] } })).status, 401);
});

test('invalid codes, rooms and reports are rejected', async () => {
  const { request, account } = setup(), cookie = await account('stn-bad');
  assert.equal((await request('/api/stations', { method: 'POST', cookie, body: { name: 'x', room: 'bathroom' } })).status, 400);
  assert.equal((await request('/api/stations', { method: 'POST', cookie, body: { name: '', room: 'lab' } })).status, 400);
  assert.equal((await request('/api/stations/join', { method: 'POST', body: { code: 'AB' } })).status, 400);
  assert.equal((await request('/api/stations/join', { method: 'POST', body: { code: 'ZZZZZZ' } })).status, 404);
  assert.equal((await request('/api/stations/report', { method: 'POST', token: 'a'.repeat(64), body: { people: [] } })).status, 401);
  assert.throws(() => cleanReport({ people: [{ id: 1, status: 'asleep' }] }));
  assert.throws(() => cleanReport({ people: Array.from({ length: 9 }, (_, index) => person(index + 1)) }));
  assert.throws(() => cleanReport({ people: [], alert: { personId: 1, kind: 'dead' } }));
});

test('a phone reports an alert and the admin sees it; at most 12 cameras', async () => {
  const { request, account } = setup(), cookie = await account('stn-alert');
  const { code } = await (await request('/api/stations', { method: 'POST', cookie, body: { name: 'Airlock', room: 'airlock' } })).json();
  const { token } = await (await request('/api/stations/join', { method: 'POST', body: { code } })).json();
  await request('/api/stations/report', { method: 'POST', token, body: { people: [person(2, 'alert', { stillFor: 45 })], alert: { personId: 2, kind: 'timeout' } } });
  const station = (await (await request('/api/stations', { cookie })).json()).stations[0];
  assert.equal(station.lastAlert.kind, 'timeout'); assert.equal(station.lastAlert.personId, 2);
  for (let index = 1; index < 12; index++) assert.equal((await request('/api/stations', { method: 'POST', cookie, body: { name: `Cam ${index}`, room: 'corridor' } })).status, 201);
  assert.equal((await request('/api/stations', { method: 'POST', cookie, body: { name: 'One too many', room: 'corridor' } })).status, 409);
});

test('setup messages pass between the admin and the phone, and a phone can be re-paired', async () => {
  const { request, account } = setup(), cookie = await account('stn-signal');
  const { station, code } = await (await request('/api/stations', { method: 'POST', cookie, body: { name: 'Gym', room: 'gym' } })).json();
  const { token } = await (await request('/api/stations/join', { method: 'POST', body: { code } })).json();
  assert.equal((await request(`/api/stations/${station.id}/signal`, { method: 'POST', cookie, body: { type: 'view' } })).status, 201);
  const polled = await (await request('/api/stations/report', { method: 'POST', token, body: { people: [] } })).json();
  assert.deepEqual(polled.signals, [{ type: 'view' }]);
  assert.deepEqual((await (await request('/api/stations/report', { method: 'POST', token, body: { people: [] } })).json()).signals, [], 'each message is delivered once');
  assert.equal((await request('/api/stations/signal', { method: 'POST', token, body: { type: 'offer', sdp: 'v=0...' } })).status, 201);
  const got = await (await request(`/api/stations/${station.id}/signal?after=0`, { cookie })).json();
  assert.equal(got.signals[0].type, 'offer');
  assert.deepEqual((await (await request(`/api/stations/${station.id}/signal?after=${got.signals[0].id}`, { cookie })).json()).signals, []);
  const again = await (await request(`/api/stations/${station.id}/code`, { method: 'POST', cookie })).json();
  assert.equal((await request('/api/stations/report', { method: 'POST', token, body: { people: [] } })).status, 401, 're-pairing cuts off the old phone');
  assert.equal((await request('/api/stations/join', { method: 'POST', body: { code: again.code } })).status, 200);
});
