import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { tursoDB } from '../turso-db.mjs';
import { createWorker } from '../worker.mjs';

const folder = new URL('../drizzle/', import.meta.url);
const migrations = readdirSync(folder).filter(name => name.endsWith('.sql')).sort().map(name => [name, readFileSync(new URL(name, folder), 'utf8')]);

test('the Turso adapter runs every migration once and answers like D1', async () => {
  const DB = tursoDB({ url: ':memory:', migrations });
  const row = await DB.prepare('SELECT COUNT(*) AS n FROM local_migrations').bind().first();
  assert.equal(row.n, migrations.length);
  await DB.migrate();
  assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM local_migrations').first()).n, migrations.length);
  const run = await DB.prepare('INSERT INTO crew_sessions (token,expires,state,revision) VALUES (?,?,NULL,0)').bind('t1', Date.now() + 1000).run();
  assert.equal(run.meta.changes, 1);
  assert.deepEqual((await DB.prepare('SELECT token, revision FROM crew_sessions').all()).results, [{ token: 't1', revision: 0 }]);
  assert.equal(await DB.prepare('SELECT * FROM crew_sessions WHERE token = ?').bind('none').first(), null);
  await assert.rejects(DB.batch([DB.prepare('INSERT INTO crew_sessions (token,expires,state,revision) VALUES (?,?,NULL,0)').bind('t2', 1), DB.prepare('INSERT INTO crew_sessions (token,expires,state,revision) VALUES (?,?,NULL,0)').bind('t1', 1)]));
  assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM crew_sessions').first()).n, 1, 'a failed batch changes nothing');
});

test('phone pairing and website alerts work on the Turso adapter', async () => {
  const DB = tursoDB({ url: ':memory:', migrations }), worker = createWorker();
  const call = async (path, method = 'GET', code, body) => worker.fetch(new Request('https://x.test/sync/' + path, { method,
    headers: { ...(code ? { Authorization: 'Bearer ' + code } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) }), { DB });
  const { pairingCode: code } = await (await call('sessions', 'POST')).json();
  const m = '11111111-1111-4111-8111-111111111111';
  const state = { deviceID: '33333333-3333-4333-8333-333333333333', monitoredCrewMemberID: m, crew: [{ id: m, displayName: 'A', role: 'x', status: 'nominal', lastUpdated: Date.now() }], events: [], telemetry: [] };
  assert.equal((await call('state', 'PUT', code, state)).status, 200);
  assert.equal((await call('alert', 'POST', code, { id: 'p1-1-alert', person: 'Person 1', kind: 'alert', reason: 'test' })).status, 200);
  assert.deepEqual((await (await call('state', 'PUT', code, state)).json()).snapshot.websiteAlerts.map(a => a.id), ['p1-1-alert']);
});
