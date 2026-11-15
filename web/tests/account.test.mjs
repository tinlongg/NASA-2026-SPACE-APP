import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorker } from '../worker.mjs';
import { localSyncDB } from '../scripts/local-sync-db.mjs';
import { embedText, encodeVector, decodeVector, cosine, VEC_DIM } from '../account.mjs';

const origin = 'https://test.example';
const secret = () => `pw-${crypto.randomUUID()}`; // Generated per run; never a real credential.
function setup(provider = async () => { throw Error('no provider'); }) {
  const DB = localSyncDB(), worker = createWorker({}, provider);
  const client = () => {
    let cookie = '';
    return async (path, method = 'GET', body, { from = origin, env = {} } = {}) => {
      const response = await worker.fetch(new Request(origin + path, { method, headers: { ...(method === 'GET' ? {} : { Origin: from }), ...(cookie ? { Cookie: cookie } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) }), { DB, ...env });
      const set = response.headers.get('Set-Cookie');
      if (set) cookie = set.split(';')[0].endsWith('=') ? '' : set.split(';')[0];
      return response;
    };
  };
  return { DB, client };
}

test('register, session cookie, logout and login', async () => {
  const { DB, client } = setup(), call = client(), password = secret();
  assert.deepEqual(await (await call('/api/auth/me')).json(), { available: true, user: null });
  const created = await call('/api/auth/register', 'POST', { username: 'Ada.Crew', password });
  assert.equal(created.status, 201);
  const cookie = created.headers.get('Set-Cookie');
  assert.match(cookie, /^cs_session=[a-f0-9]{64}; Path=\/; HttpOnly; SameSite=Strict; Max-Age=604800; Secure$/);
  assert.deepEqual((await (await call('/api/auth/me')).json()).user, { username: 'ada.crew' });
  const stored = DB.sqlite.prepare('SELECT * FROM users').get(), session = DB.sqlite.prepare('SELECT token FROM auth_sessions').get();
  assert.equal(JSON.stringify(stored).includes(password), false); // Only a salted hash is stored.
  assert.equal(cookie.includes(session.token), false); // Only a digest of the session token is stored.
  assert.equal((await call('/api/auth/logout', 'POST')).status, 200);
  assert.equal((await (await call('/api/auth/me')).json()).user, null);
  assert.equal((await call('/api/auth/login', 'POST', { username: 'ada.crew', password: password + 'x' })).status, 401);
  assert.equal((await call('/api/auth/login', 'POST', { username: 'nobody', password })).status, 401);
  assert.equal((await call('/api/auth/login', 'POST', { username: 'ADA.crew', password })).status, 200);
  assert.equal((await client()('/api/auth/register', 'POST', { username: 'ada.crew', password })).status, 409);
});

test('account input, origin and storage checks', async () => {
  const { client } = setup(), call = client(), password = secret();
  for (const body of [{ username: 'ab', password }, { username: 'ok-name', password: 'short' }, { username: 'bad name', password }, { username: 'ok-name', password, admin: true }]) assert.equal((await call('/api/auth/register', 'POST', body)).status, 400);
  assert.equal((await call('/api/auth/register', 'POST', { username: 'ok-name', password }, { from: 'https://other.example' })).status, 403);
  assert.equal((await call('/api/journal/entries')).status, 401);
  assert.equal((await call('/api/journal/entries', 'POST', { body: 'hello' })).status, 401);
  const worker = createWorker();
  assert.equal((await worker.fetch(new Request(origin + '/api/auth/login', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'ok-name', password }) }), {})).status, 503);
  assert.deepEqual(await (await worker.fetch(new Request(origin + '/api/auth/me'), {})).json(), { available: false, user: null });
});

test('repeated password attempts are throttled', async () => {
  const { client } = setup(), call = client(), password = secret();
  let last;
  for (let index = 0; index < 11; index++) last = await call('/api/auth/login', 'POST', { username: 'ghost', password });
  assert.equal(last.status, 429);
});

test('embeddings are normalised, deterministic and survive storage encoding', () => {
  const a = embedText('I barely slept and feel exhausted'), again = embedText('I barely slept and feel exhausted');
  assert.equal(a.length, VEC_DIM); assert.deepEqual(a, again);
  assert.ok(Math.abs(Math.hypot(...a) - 1) < 1e-5);
  assert.ok(cosine(a, decodeVector(encodeVector(a))) > 0.995);
  assert.equal(Math.hypot(...embedText('')), 0);
  const tired = cosine(a, embedText('So tired today, no rest last night')), meal = cosine(a, embedText('Dinner with the crew was great fun'));
  assert.ok(tired > 0.2, `related wording should clear the recall threshold (${tired})`);
  assert.ok(tired > meal + 0.1, `related ${tired} vs unrelated ${meal}`);
});

test('journal entries are indexed per user and searched by similarity', async () => {
  const { DB, client } = setup(), ada = client(), ben = client();
  await ada('/api/auth/register', 'POST', { username: 'ada', password: secret() });
  await ben('/api/auth/register', 'POST', { username: 'ben', password: secret() });
  const entries = ['Slept badly again, exhausted all shift.', 'Great workout on the treadmill this morning.', 'Missing my family; called home after dinner.'];
  for (const [index, body] of entries.entries()) assert.equal((await ada('/api/journal/entries', 'POST', { body, date: new Date(Date.UTC(2026, 10, index + 1)).toISOString() })).status, 201);
  await ben('/api/journal/entries', 'POST', { body: 'I am so tired and need sleep.' });
  const listed = await (await ada('/api/journal/entries')).json();
  assert.deepEqual(listed.entries.map(entry => entry.body), entries.toReversed());
  assert.equal(listed.index.dimensions, VEC_DIM);
  assert.equal(DB.sqlite.prepare('SELECT embedding FROM journal_entries').get().embedding.length, 684); // 512 bytes, base64
  const found = await (await ada('/api/journal/search', 'POST', { query: 'feeling tired, not enough sleep' })).json();
  assert.equal(found.matches[0].body, entries[0]);
  assert.ok(found.matches.every(match => entries.includes(match.body)), 'never returns another user\'s entries');
  assert.equal((await (await ada('/api/journal/search', 'POST', { query: 'quantum chromodynamics lattice' })).json()).matches.length, 0);
  for (const body of [{ body: '' }, { body: 'x'.repeat(10001) }, { body: 'ok', date: 'tomorrow' }, { body: 'ok', embedding: 'client supplied' }]) assert.equal((await ada('/api/journal/entries', 'POST', body)).status, 400);
  assert.equal((await ben(`/api/journal/entries/${listed.entries[0].id}`, 'DELETE')).status, 404);
  assert.equal((await ada(`/api/journal/entries/${listed.entries[0].id}`, 'DELETE')).status, 200);
  assert.equal((await ada('/api/journal/entries', 'DELETE')).status, 200);
  assert.equal((await (await ada('/api/journal/entries')).json()).entries.length, 0);
  assert.equal((await (await ben('/api/journal/entries')).json()).entries.length, 1);
});

test('rows from an older embedder are re-embedded on recall', async () => {
  const { DB, client } = setup(), call = client();
  await call('/api/auth/register', 'POST', { username: 'ada', password: secret() });
  await call('/api/journal/entries', 'POST', { body: 'Slept badly again, exhausted all shift.' });
  DB.sqlite.prepare("UPDATE journal_entries SET model = 'old', embedding = ?").run(encodeVector(new Float32Array(VEC_DIM)));
  assert.equal((await (await call('/api/journal/search', 'POST', { query: 'tired and sleepy' })).json()).matches.length, 1);
  assert.equal(DB.sqlite.prepare('SELECT model FROM journal_entries').get().model, 'hashed-lexical-v1');
});

test('collective MUSE history stays owner-scoped, chronological and deletion-safe', async () => {
  let sent, duringGeneration=async()=>{};
  const feedback={message:'You have described feeling low more than once, and enjoyed a workout.',suggestions:['Check in with a trusted person.'],question:'What helped during the better day?'};
  const { DB, client } = setup(async (url, options) => { sent=JSON.parse(options.body);await duringGeneration();return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({...feedback,summary:'hidden',sentiment:-1})}}]}); });
  const ada=client(), ben=client(), env={env:{META_API_KEY:'test-key'}};
  const target=crypto.randomUUID();
  assert.equal((await ada('/api/journal/analyze','POST',{entryId:target,consent:true},env)).status,401);
  await ada('/api/auth/register','POST',{username:'ada',password:secret()});
  await ben('/api/auth/register','POST',{username:'ben',password:secret()});
  const benEntry=(await (await ben('/api/journal/entries','POST',{body:'BEN PRIVATE'})).json()).entry;
  assert.equal((await ada('/api/journal/analyze','POST',{entryId:benEntry.id,consent:true},env)).status,404);
  const bodies=['old note','sad again','Great workout today!','sad again'], entries=[];
  for(const [index,body] of bodies.entries()) entries.push((await (await ada('/api/journal/entries','POST',{body,date:new Date(Date.now()-[20,3,2,0][index]*86400000).toISOString()})).json()).entry);
  const input={entryId:entries.at(-1).id,consent:true};
  assert.equal((await ada('/api/journal/analyze','POST',{...input,history:[]},env)).status,400);
  const response=await ada('/api/journal/analyze','POST',input,env),result=await response.json();
  assert.equal(response.status,200);
  assert.deepEqual(JSON.parse(sent.messages[1].content).entries.map(e=>e.text),bodies.slice(1));
  assert.equal(result.context.entryCount,3);assert.doesNotMatch(JSON.stringify(result),/hidden|sentiment|summary|score|BEN/);
  let saved=(await (await ada('/api/journal/entries')).json()).entries;
  assert.deepEqual(saved[0].reflection,result);
  assert.doesNotMatch(DB.sqlite.prepare('SELECT reflection FROM journal_entries WHERE id = ?').get(input.entryId).reflection,/hidden|sentiment|summary|score/);
  await ada('/api/journal/entries/'+entries[1].id,'DELETE');
  assert.equal((await (await ada('/api/journal/entries')).json()).entries[0].reflection,null);
  // Delete a contextual entry while the provider is running: don't store stale feedback.
  duringGeneration=()=>ada('/api/journal/entries/'+entries[2].id,'DELETE');
  assert.equal((await ada('/api/journal/analyze','POST',input,env)).status,409);
  assert.equal((await (await ada('/api/journal/entries')).json()).entries[0].reflection,null);
  const failure=await ada('/api/journal/analyze','POST',input);assert.equal(failure.status,503);
  assert.ok((await (await ada('/api/journal/entries')).json()).entries.some(e=>e.id===input.entryId),'provider failure preserves saved entry');
});
