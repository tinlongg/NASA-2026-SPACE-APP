import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorker } from '../worker.mjs';
import { handleCalls, cllValidPhone, cllMask, cllVariables, cllConfigured, cllPlace } from '../calls.mjs';
import { notifyCircle } from '../circle.mjs';
import { localSyncDB } from '../scripts/local-sync-db.mjs';

const origin = 'https://test.example', secrets = { ELEVENLABS_API_KEY: 'test-key', ELEVENLABS_ALERT_AGENT_ID: 'agent_alert', ELEVENLABS_PHONE_NUMBER_ID: 'phnum_test' };
function setup(env = {}) {
  const DB = localSyncDB(), worker = createWorker({}, async () => { throw Error('no provider'); }), calls = [];
  const fetcher = async (url, init) => { calls.push({ url, init, body: JSON.parse(init.body) }); return Response.json({ success: true, conversation_id: 'c1', callSid: 's1' }); };
  const request = async (path, { method = 'GET', body, cookie = '' } = {}) => worker.fetch(new Request(origin + path, { method, headers: { ...(method === 'GET' ? {} : { Origin: origin }), ...(cookie ? { Cookie: cookie } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) }), { DB, ...env });
  const account = async name => { const response = await request('/api/auth/register', { method: 'POST', body: { username: name, password: `pw-${crypto.randomUUID()}` } }); return response.headers.get('Set-Cookie').split(';')[0]; };
  return { DB, request, account, calls, fetcher, env: { DB, ...secrets, ...env } };
}

test('phone numbers must be E.164 and the agent gets only the four script variables', () => {
  for (const good of ['+13464604152', '+442071234567']) assert.equal(cllValidPhone(good), true, good);
  for (const bad of ['3464604152', '+0123456789', '+1 346', '++13464604152', 'call me', '', null]) assert.equal(cllValidPhone(bad), false, String(bad));
  assert.equal(cllMask('+13464604152'), '••• 4152');
  assert.deepEqual(cllVariables({ kind: 'timeout', person: 'Person 2', room: 'Destiny', camera: 'Lab phone', secret: 'x' }), { person: 'Person 2', room: 'Destiny', camera: 'Lab phone', what_happened: 'They did not answer the check-in.' });
  assert.equal(cllVariables({}).what_happened, 'They may need help.');
  assert.equal(cllConfigured({}), false); assert.equal(cllConfigured(secrets), true);
});

test('you can only save your own number, with consent, and it is shown masked', async () => {
  const { request, account, DB } = setup(), cookie = await account('call-a'), other = await account('call-b');
  assert.equal((await request('/api/calls/me', { method: 'PUT', cookie, body: { phone: '+13464604152' } })).status, 400, 'consent is required');
  assert.equal((await request('/api/calls/me', { method: 'PUT', cookie, body: { phone: '12345', consent: true } })).status, 400);
  const saved = await (await request('/api/calls/me', { method: 'PUT', cookie, body: { phone: '+1 (346) 460-4152', consent: true } })).json();
  assert.deepEqual(saved, { number: '••• 4152', enabled: true });
  assert.equal((await (await request('/api/calls/me', { cookie })).json()).number, '••• 4152');
  assert.equal((await (await request('/api/calls/me', { cookie: other })).json()).number, null, 'nobody sees another person\'s number');
  assert.equal(JSON.stringify(await (await request('/api/calls/me', { cookie })).json()).includes('3464604152'), false);
  assert.equal((await request('/api/calls/me')).status, 401);
  assert.equal(DB.sqlite.prepare('SELECT phone FROM call_contacts').get().phone, '+13464604152');
  assert.equal((await request('/api/calls/me', { method: 'DELETE', cookie })).status, 200);
  assert.equal(DB.sqlite.prepare('SELECT COUNT(*) AS n FROM call_contacts').get().n, 0);
});

test('cllPlace posts the documented ElevenLabs body and survives failures', async () => {
  const { calls, fetcher } = setup();
  assert.equal(await cllPlace(secrets, '+13464604152', { kind: 'help', person: 'Person 3', room: 'Quest airlock', camera: 'Airlock phone' }, fetcher), 'placed');
  const { url, init, body } = calls[0];
  assert.equal(url, 'https://api.elevenlabs.io/v1/convai/twilio/outbound-call'); assert.equal(init.headers['xi-api-key'], 'test-key');
  assert.deepEqual([body.agent_id, body.agent_phone_number_id, body.to_number], ['agent_alert', 'phnum_test', '+13464604152']);
  assert.deepEqual(body.conversation_initiation_client_data.dynamic_variables, { person: 'Person 3', room: 'Quest airlock', camera: 'Airlock phone', what_happened: 'They asked for help.' });
  assert.equal(await cllPlace(secrets, '+1', {}, async () => new Response('', { status: 500 })), 'failed');
  assert.equal(await cllPlace(secrets, '+1', {}, async () => Response.json({ success: false })), 'failed');
  assert.equal(await cllPlace(secrets, '+1', {}, async () => { throw Error('offline'); }), 'failed');
  assert.equal(await cllPlace({}, '+1', {}, fetcher), 'failed');
});

test('a serious alert calls only opted-in circle members, every time, with no cooldown or cap', async () => {
  const { request, account, DB, calls, fetcher, env } = setup(), owner = await account('call-o'), friend = await account('call-f'), quiet = await account('call-q');
  await request('/api/circle', { method: 'POST', cookie: owner, body: { name: 'Crew' } });
  const { code } = await (await request('/api/circle/invite', { method: 'POST', cookie: owner })).json();
  await request('/api/circle/join', { method: 'POST', cookie: friend, body: { code } });
  const { code: second } = await (await request('/api/circle/invite', { method: 'POST', cookie: owner })).json();
  await request('/api/circle/join', { method: 'POST', cookie: quiet, body: { code: second } });
  await request('/api/calls/me', { method: 'PUT', cookie: owner, body: { phone: '+15550000001', consent: true } });
  await request('/api/calls/me', { method: 'PUT', cookie: friend, body: { phone: '+15550000002', consent: true } }); // call-q never opts in
  const ownerId = DB.sqlite.prepare('SELECT id FROM users WHERE username = ?').get('call-o').id;
  const alert = { title: 'Alert', body: 'x', call: { kind: 'timeout', person: 'Person 1', room: 'Destiny', camera: 'Lab' } };
  assert.equal((await notifyCircle(env, ownerId, alert, fetcher)).called, 2);
  assert.deepEqual(calls.map(call => call.body.to_number).sort(), ['+15550000001', '+15550000002']);
  for (let again = 0; again < 8; again++) assert.equal((await notifyCircle(env, ownerId, alert, fetcher)).called, 2, 'no cooldown and no daily cap');
  assert.equal((await notifyCircle(env, ownerId, { title: 'Alert', body: 'x' }, fetcher)).called, 0, 'an alert without call details never rings');
  assert.equal((await notifyCircle({ DB }, ownerId, alert, fetcher)).called, 0, 'nothing rings unless calls are configured');
});

test('a test call goes only to your own saved number and can be repeated', async () => {
  const { request, account, DB, calls, fetcher, env } = setup(), cookie = await account('call-t');
  const direct = path => handleCalls(new Request(origin + path, { method: 'POST', headers: { Origin: origin, Cookie: cookie } }), env, fetcher);
  assert.equal((await direct('/api/calls/test')).status, 404, 'save a number first');
  await request('/api/calls/me', { method: 'PUT', cookie, body: { phone: '+15550000003', consent: true } });
  assert.equal((await direct('/api/calls/test')).status, 201);
  assert.equal(calls.length, 1); assert.equal(calls[0].body.to_number, '+15550000003'); assert.equal(calls[0].body.conversation_initiation_client_data.dynamic_variables.what_happened, 'This is a test call. Nothing is wrong.');
  assert.equal((await direct('/api/calls/test')).status, 201, 'no wait between tests');
  assert.equal((await handleCalls(new Request(origin + '/api/calls/test', { method: 'POST', headers: { Origin: origin, Cookie: cookie } }), { DB }, fetcher)).status, 503, 'not configured');
  const failing = await handleCalls(new Request(origin + '/api/calls/test', { method: 'POST', headers: { Origin: origin, Cookie: cookie } }), env, async () => new Response('', { status: 500 }));
  DB.sqlite.prepare('DELETE FROM call_log').run();
  assert.equal((await handleCalls(new Request(origin + '/api/calls/test', { method: 'POST', headers: { Origin: origin, Cookie: cookie } }), env, async () => new Response('', { status: 500 }))).status, 502);
  assert.equal(failing.status, 502);
});
