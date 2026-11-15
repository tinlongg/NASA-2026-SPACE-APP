// Accounts and the per-user journal vector index. Self-contained (no imports) because
// scripts/build.mjs concatenates this file into the deployed Worker.
//
// Auth: PBKDF2-SHA256 password hashes, opaque session tokens stored only as SHA-256
// digests, HttpOnly SameSite=Strict cookie, same-origin check on every write.
// Vector index: each synced journal entry is embedded into a 512-dimension vector and
// stored in D1 next to its text; search is exact cosine similarity over one user's rows.

const ACCT_COOKIE = 'cs_session';
const ACCT_SESSION_MS = 7 * 86400000;
const ACCT_ITERATIONS = 100000; // Workers' WebCrypto rejects PBKDF2 above 100,000 iterations.
const ACCT_MAX_USERS = 5000;
const ACCT_MAX_ENTRIES = 500;
const ACCT_MAX_ENTRY = 10000;
const ACCT_MAX_SUIT_CHECKS = 50;
const ACCT_MAX_PHOTOS = 60, ACCT_PHOTO_BODY = 400000, ACCT_PHOTO_BYTES = 280000;

// Deployment-only bootstrap: salted hash and immutable user ID, never a plaintext password.
export function missionAdminConfig(env) {
  try {
    const config = JSON.parse(env.MISSION_ADMIN_ACCOUNT || 'null');
    return config && /^[a-f0-9-]{36}$/.test(config.id) && /^[a-z0-9._-]{3,30}$/.test(config.username) && /^[a-f0-9]{32}$/.test(config.salt) && /^[a-f0-9]{64}$/.test(config.hash) ? config : null;
  } catch { return null; }
}

const acctJSON = (value, status = 200, headers = {}) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers } });
const acctError = (status, message) => Object.assign(new Error(message), { status });
const acctHex = bytes => [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');
const acctUnhex = text => new Uint8Array(text.match(/../g).map(pair => parseInt(pair, 16)));
const acctDigest = async text => acctHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
const acctDB = env => { if (!env.DB) throw acctError(503, 'Account storage is unavailable on this server.'); return env.DB.withSession ? env.DB.withSession('first-primary') : env.DB; };

async function acctPasswordHash(password, saltHex) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  return acctHex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: acctUnhex(saltHex), iterations: ACCT_ITERATIONS }, key, 256));
}
function acctSameText(a, b) {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index++) difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return difference === 0;
}
async function acctReadJSON(request, limit) {
  if (!(request.headers.get('Content-Type') || '').startsWith('application/json')) throw acctError(415, 'Send JSON.');
  if (!request.body) throw acctError(400, 'Send JSON.');
  const reader = request.body.getReader(), chunks = []; let size = 0;
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.byteLength;
    if (size > limit) { await reader.cancel(); throw acctError(413, 'Request is too large.'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  let parsed;
  try { parsed = JSON.parse(new TextDecoder().decode(bytes)); } catch { throw acctError(400, 'Invalid JSON.'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw acctError(400, 'Send a JSON object.');
  return parsed;
}
function acctOnlyKeys(object, keys) { return Object.keys(object).every(key => keys.includes(key)); }
function acctCookie(request, value, maxAge) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${ACCT_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}
function acctToken(request) {
  return (request.headers.get('Cookie') || '').match(new RegExp(`(?:^|;\\s*)${ACCT_COOKIE}=([a-f0-9]{64})(?:;|$)`))?.[1] || null;
}

/** The signed-in user for this request, or null. Never throws for a missing database. */
export async function accountUser(request, env) {
  const token = acctToken(request);
  if (!token || !env.DB) return null;
  const row = await acctDB(env).prepare('SELECT users.id AS id, users.username AS username FROM auth_sessions JOIN users ON users.id = auth_sessions.user_id WHERE auth_sessions.token = ? AND auth_sessions.expires > ?').bind(await acctDigest(token), Date.now()).first();
  return row ? { id: row.id, username: row.username, ...(row.id===missionAdminConfig(env)?.id?{role:'admin'}:{}) } : null;
}

// ---------------------------------------------------------------------------
// Embeddings. A deterministic hashed bag of features: stemmed words, a small
// wellness concept map (so "exhausted" lands near "tired"), word pairs and character
// trigrams, signed-hashed into VEC_DIM dimensions and L2-normalised. It runs inside the
// Worker with no model download or third-party call, so journal text never leaves
// the server just to be indexed. It matches wording and listed concepts; it is not
// a neural semantic model. Swap embedText and bump VEC_MODEL to change that: rows
// carry the model name and are re-embedded lazily when it differs.
// ---------------------------------------------------------------------------
export const VEC_DIM = 512;
export const VEC_MODEL = 'hashed-lexical-v1';
const VEC_STOP = new Set('a an and are as at be been but by did do does for from had has have he her his i if in into is it its me my of on or our she so than that the their them then there these they this to was we were what when which who will with you your am im just really very today got get also about been being out up down over not no'.split(' '));
const VEC_CONCEPTS = {
  sleep: 'sleep slept sleeping asleep tired exhausted fatigue fatigued rest rested nap insomnia awake drowsy sleepy bed woke',
  workload: 'work working task tasks schedule deadline deadlines busy shift overtime workload meeting meetings backlog',
  exercise: 'exercise exercised workout run running ran training gym treadmill lifting cardio stretch stretching bike',
  isolation: 'alone lonely loneliness isolated isolation homesick miss missing apart distant',
  family: 'family home partner wife husband kids children mom dad mother father friend friends parents call called',
  food: 'food meal meals eat ate eating dinner lunch breakfast hungry snack appetite coffee',
  crew: 'crew crewmate crewmates team teammate together commander colleague colleagues argument conflict',
  stress: 'stress stressed stressful pressure overwhelmed worried worry anxious anxiety nervous tense panic',
  body: 'pain ache aches headache sore nausea nauseous dizzy sick back neck stiff cramp',
  mood_low: 'sad down unhappy upset depressed miserable crying cried frustrated angry annoyed irritated bummed',
  mood_high: 'happy glad great good excited proud grateful calm relaxed joy joyful fun laughed content',
};
const VEC_CONCEPT_SLOT = new Map(Object.keys(VEC_CONCEPTS).map((concept, slot) => [concept, slot]));
const VEC_CONCEPT_OF = new Map(Object.entries(VEC_CONCEPTS).flatMap(([concept, words]) => words.split(' ').map(word => [word, concept])));
function vecStem(word) {
  if (word.length > 5 && word.endsWith('ing')) return word.slice(0, -3);
  if (word.length > 4 && word.endsWith('ed')) return word.slice(0, -2);
  if (word.length > 4 && word.endsWith('ly')) return word.slice(0, -2);
  if (word.length > 4 && word.endsWith('es')) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}
function vecHash(text) { // FNV-1a, 32-bit
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) { hash ^= text.charCodeAt(index); hash = Math.imul(hash, 0x01000193); }
  return hash >>> 0;
}
export function embedText(text) {
  const words = (String(text).slice(0, ACCT_MAX_ENTRY).toLowerCase().replaceAll('’', "'").match(/[\p{L}\p{N}]+(?:'[\p{L}]+)?/gu) || []).map(word => word.replaceAll("'", ''));
  const WEIGHT = { w: 1, c: 1.5, b: 0.5, t: 0.2 }; // word, concept, word pair, character trigram
  const counts = new Map();
  const add = feature => counts.set(feature, (counts.get(feature) || 0) + 1);
  let previous = null;
  for (const word of words) {
    if (VEC_STOP.has(word) || word.length < 2) { previous = null; continue; }
    const stem = vecStem(word);
    add(`w:${stem}`);
    const concept = VEC_CONCEPT_OF.get(word) || VEC_CONCEPT_OF.get(stem);
    if (concept) add(`c:${concept}`);
    if (previous) add(`b:${previous}_${stem}`);
    if (word.length >= 5) for (let index = 0; index <= word.length - 3; index++) add(`t:${word.slice(index, index + 3)}`);
    previous = stem;
  }
  const vector = new Float32Array(VEC_DIM);
  for (const [feature, count] of counts) { // Signed feature hashing with sublinear term frequency.
    const value = (1 + Math.log(count)) * WEIGHT[feature[0]];
    // Concepts own the first dimensions outright; everything else is hashed into the rest.
    if (feature[0] === 'c') { vector[VEC_CONCEPT_SLOT.get(feature.slice(2))] += value; continue; }
    const hash = vecHash(feature), reserved = VEC_CONCEPT_SLOT.size;
    vector[reserved + hash % (VEC_DIM - reserved)] += ((hash >>> 16) & 1 ? 1 : -1) * value;
  }
  let norm = 0; for (const value of vector) norm += value * value;
  norm = Math.sqrt(norm);
  if (norm) for (let index = 0; index < VEC_DIM; index++) vector[index] /= norm;
  return vector;
}
/** Vectors are stored as base64 of one signed byte per dimension: portable across D1 and local SQLite. */
export function encodeVector(vector) {
  let binary = '';
  for (const value of vector) binary += String.fromCharCode(Math.max(-127, Math.min(127, Math.round(value * 127))) & 255);
  return btoa(binary);
}
export function decodeVector(text) {
  const binary = atob(text), vector = new Int8Array(binary.length);
  for (let index = 0; index < binary.length; index++) vector[index] = binary.charCodeAt(index) << 24 >> 24;
  return vector;
}
export function cosine(a, b) {
  if (a.length !== b.length) return 0;
  let dot = 0, aa = 0, bb = 0;
  for (let index = 0; index < a.length; index++) { dot += a[index] * b[index]; aa += a[index] * a[index]; bb += b[index] * b[index]; }
  return aa && bb ? dot / Math.sqrt(aa * bb) : 0;
}

/**
 * Nearest journal entries for one user. Exact scan: a user holds at most 500 vectors of
 * 512 bytes, so an approximate index would add complexity without saving time.
 */
export async function journalRecall(env, userId, text, { limit = 3, minimum = 0.2, excludeBody = null } = {}) {
  const db = acctDB(env), query = embedText(text);
  const { results } = await db.prepare('SELECT id, created, body, embedding, model FROM journal_entries WHERE user_id = ? ORDER BY created DESC LIMIT ?').bind(userId, ACCT_MAX_ENTRIES).all();
  const scored = [];
  for (const row of results) {
    if (excludeBody != null && row.body.trim() === excludeBody.trim()) continue;
    let embedding = row.embedding;
    if (row.model !== VEC_MODEL) { // Re-embed rows written by an older embedder.
      embedding = encodeVector(embedText(row.body));
      await db.prepare('UPDATE journal_entries SET embedding = ?, model = ? WHERE id = ?').bind(embedding, VEC_MODEL, row.id).run();
    }
    const score = cosine(query, decodeVector(embedding));
    if (score >= minimum) scored.push({ id: row.id, date: new Date(row.created).toISOString(), body: row.body, score: Number(score.toFixed(3)) });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}

/** The entry's photo plus up to two earlier photos (oldest and most recent) for the same user. */
export async function journalPhotosForCompare(env, userId, entryId) {
  const db = acctDB(env);
  const current = await db.prepare('SELECT e.created AS date, e.sleep_hours, p.mime, p.data FROM journal_entries e JOIN journal_photos p ON p.entry_id = e.id WHERE e.id = ? AND e.user_id = ?').bind(entryId.toLowerCase(), userId).first();
  if (!current) return null;
  const { results } = await db.prepare('SELECT e.created AS date, e.sleep_hours, p.mime, p.data FROM journal_entries e JOIN journal_photos p ON p.entry_id = e.id WHERE e.user_id = ? AND e.created < ? ORDER BY e.created ASC').bind(userId, current.date).all();
  const earlier = results.length > 1 ? [results[0], results.at(-1)] : results;
  return { current, earlier };
}

export function createAccounts() {
  const attempts = new Map(); let windowStart = 0;
  const allowAttempt = request => { // Best-effort, per isolate: slows password guessing.
    const now = Date.now();
    if (now - windowStart >= 60000) { windowStart = now; attempts.clear(); }
    const visitor = request.headers.get('CF-Connecting-IP') || 'shared';
    const count = attempts.get(visitor) || 0;
    if (count >= 10) return false;
    attempts.set(visitor, count + 1); return true;
  };
  async function startSession(request, db, user, status) {
    const token = acctHex(crypto.getRandomValues(new Uint8Array(32))), now = Date.now();
    await db.batch([
      db.prepare('DELETE FROM auth_sessions WHERE expires < ?').bind(now),
      db.prepare('INSERT INTO auth_sessions (token, user_id, expires) VALUES (?, ?, ?)').bind(await acctDigest(token), user.id, now + ACCT_SESSION_MS),
    ]);
    return acctJSON({ user: { username: user.username, ...(user.role?{role:user.role}:{}) } }, status, { 'Set-Cookie': acctCookie(request, token, ACCT_SESSION_MS / 1000) });
  }
  function credentials(body) {
    if (!acctOnlyKeys(body, ['username', 'password']) || typeof body.username !== 'string' || typeof body.password !== 'string') throw acctError(400, 'Send a username and password.');
    const username = body.username.trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9_.-]{2,31}$/.test(username)) throw acctError(400, 'Usernames are 3–32 characters: letters, numbers, dot, dash or underscore.');
    if (body.password.length < 8 || body.password.length > 200) throw acctError(400, 'Passwords are 8–200 characters.');
    return { username, password: body.password };
  }

  /** Handles /api/auth/* and the journal store routes; returns null for anything else. */
  return async function handleAccount(request, env) {
    const url = new URL(request.url), path = url.pathname, method = request.method;
    const entryMatch = path.match(/^\/api\/journal\/entries\/([0-9a-f-]{36})$/), photoMatch = path.match(/^\/api\/journal\/entries\/([0-9a-f-]{36})\/photo$/);
    if (!path.startsWith('/api/auth/') && path !== '/api/journal/entries' && path !== '/api/journal/search' && path !== '/api/suit/checks' && !entryMatch && !photoMatch) return null;
    try {
      if (method !== 'GET' && request.headers.get('Origin') !== url.origin) throw acctError(403, 'Use accounts on this website.');
      if (path === '/api/auth/me' && method === 'GET') return acctJSON({ available: Boolean(env.DB), user: await accountUser(request, env).then(user => user && { username: user.username, ...(user.role?{role:user.role}:{}) }) });
      const db = acctDB(env);

      if (path === '/api/auth/register' && method === 'POST') {
        const { username, password } = credentials(await acctReadJSON(request, 2048));
        if (!allowAttempt(request)) throw acctError(429, 'Too many attempts. Wait a minute and try again.');
        if (username === missionAdminConfig(env)?.username) throw acctError(409, 'This account is already provisioned. Use Sign in.');
        const salt = acctHex(crypto.getRandomValues(new Uint8Array(16))), user = { id: crypto.randomUUID(), username };
        let created;
        try { created = await db.prepare('INSERT INTO users (id, username, salt, hash, created) SELECT ?, ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM users) < ?').bind(user.id, username, salt, await acctPasswordHash(password, salt), Date.now(), ACCT_MAX_USERS).run(); }
        catch { throw acctError(409, 'That username is taken.'); }
        if (!created.meta.changes) throw acctError(429, 'Account capacity reached for this prototype.');
        return startSession(request, db, user, 201);
      }
      if (path === '/api/auth/login' && method === 'POST') {
        const { username, password } = credentials(await acctReadJSON(request, 2048));
        if (!allowAttempt(request)) throw acctError(429, 'Too many attempts. Wait a minute and try again.');
        const provisioned = missionAdminConfig(env);
        if (provisioned && username === provisioned.username) {
          await db.prepare('INSERT OR IGNORE INTO users (id, username, salt, hash, created) VALUES (?,?,?,?,?)').bind(provisioned.id, provisioned.username, provisioned.salt, provisioned.hash, Date.now()).run();
        }
        const row = await db.prepare('SELECT id, username, salt, hash FROM users WHERE username = ?').bind(username).first();
        // Hash even for unknown names so timing does not reveal which usernames exist.
        const hash = await acctPasswordHash(password, row?.salt || '00000000000000000000000000000000');
        if (!row || !acctSameText(hash, row.hash)) throw acctError(401, 'Incorrect username or password.');
        return startSession(request, db, {...row,...(row.id===missionAdminConfig(env)?.id?{role:'admin'}:{})}, 200);
      }
      if (path === '/api/auth/logout' && method === 'POST') {
        const token = acctToken(request);
        if (token) await db.prepare('DELETE FROM auth_sessions WHERE token = ?').bind(await acctDigest(token)).run();
        return acctJSON({ user: null }, 200, { 'Set-Cookie': acctCookie(request, '', 0) });
      }
      if (path.startsWith('/api/auth/')) throw acctError(405, 'Unsupported account operation.');

      const user = await accountUser(request, env);
      if (!user) throw acctError(401, 'Sign in to use your account journal.');
      if (path === '/api/journal/entries' && method === 'GET') {
        const { results } = await db.prepare('SELECT e.id, e.created, e.body, e.sleep_hours, (SELECT 1 FROM journal_photos p WHERE p.entry_id = e.id) AS has_photo FROM journal_entries e WHERE e.user_id = ? ORDER BY e.created DESC LIMIT ?').bind(user.id, ACCT_MAX_ENTRIES).all();
        return acctJSON({ entries: results.map(row => ({ id: row.id, date: new Date(row.created).toISOString(), body: row.body, hasPhoto: Boolean(row.has_photo), sleepHours: row.sleep_hours ?? null })), index: { model: VEC_MODEL, dimensions: VEC_DIM, limit: ACCT_MAX_ENTRIES } });
      }
      if (path === '/api/journal/entries' && method === 'POST') {
        const body = await acctReadJSON(request, 49152);
        if (!acctOnlyKeys(body, ['body', 'date', 'sleepHours']) || typeof body.body !== 'string' || !body.body.trim() || body.body.length > ACCT_MAX_ENTRY) throw acctError(400, 'Send one entry of up to 10,000 characters.');
        let created = Date.now();
        if (body.date !== undefined) { // Lets a browser upload entries it saved earlier, with their dates.
          created = typeof body.date === 'string' && body.date.length <= 40 ? Date.parse(body.date) : NaN;
          if (!Number.isFinite(created) || created > Date.now() + 60000 || created < 0) throw acctError(400, 'Invalid entry date.');
        }
        let sleepHours = null;
        if (body.sleepHours !== undefined && body.sleepHours !== null) {
          if (typeof body.sleepHours !== 'number' || !Number.isFinite(body.sleepHours) || body.sleepHours < 0 || body.sleepHours > 24) throw acctError(400, 'Sleep hours must be a number from 0 to 24.');
          sleepHours = Math.round(body.sleepHours * 10) / 10;
        }
        const entry = { id: crypto.randomUUID(), date: new Date(created).toISOString(), body: body.body.trim(), sleepHours };
        const saved = await db.prepare('INSERT INTO journal_entries (id, user_id, created, body, embedding, model, sleep_hours) SELECT ?, ?, ?, ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM journal_entries WHERE user_id = ?) < ?').bind(entry.id, user.id, created, entry.body, encodeVector(embedText(entry.body)), VEC_MODEL, sleepHours, user.id, ACCT_MAX_ENTRIES).run();
        if (!saved.meta.changes) throw acctError(409, `Your account journal is full (${ACCT_MAX_ENTRIES} entries). Delete some first.`);
        return acctJSON({ entry }, 201);
      }
      if (photoMatch) {
        const entryId = photoMatch[1].toLowerCase();
        if (!await db.prepare('SELECT id FROM journal_entries WHERE id = ? AND user_id = ?').bind(entryId, user.id).first()) throw acctError(404, 'Entry not found.');
        if (method === 'GET') {
          const row = await db.prepare('SELECT mime, data FROM journal_photos WHERE entry_id = ? AND user_id = ?').bind(entryId, user.id).first();
          if (!row) throw acctError(404, 'No photo on this entry.');
          return new Response(Uint8Array.from(atob(row.data), char => char.charCodeAt(0)), { headers: { 'Content-Type': row.mime, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
        }
        if (method === 'DELETE') {
          await db.prepare('DELETE FROM journal_photos WHERE entry_id = ? AND user_id = ?').bind(entryId, user.id).run();
          return acctJSON({ deleted: true });
        }
        if (method === 'PUT') {
          const body = await acctReadJSON(request, ACCT_PHOTO_BODY);
          if (!acctOnlyKeys(body, ['image', 'width', 'height']) || typeof body.image !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(body.image)) throw acctError(400, 'Send a base64 JPEG as image, with width and height.');
          const { width, height } = body;
          if (![width, height].every(value => Number.isInteger(value) && value > 0 && value <= 4096)) throw acctError(400, 'Send the photo width and height.');
          let bytes; try { bytes = Uint8Array.from(atob(body.image), char => char.charCodeAt(0)); } catch { throw acctError(400, 'Invalid image data.'); }
          if (bytes.length > ACCT_PHOTO_BYTES) throw acctError(413, 'Photo is too large.');
          if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) throw acctError(415, 'Only JPEG photos are accepted.');
          const replaced = await db.prepare('SELECT 1 AS found FROM journal_photos WHERE entry_id = ?').bind(entryId).first();
          if (replaced) await db.prepare('DELETE FROM journal_photos WHERE entry_id = ?').bind(entryId).run();
          const saved = await db.prepare('INSERT INTO journal_photos (id, user_id, entry_id, created, mime, width, height, data) SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM journal_photos WHERE user_id = ?) < ?').bind(crypto.randomUUID(), user.id, entryId, Date.now(), 'image/jpeg', width, height, body.image, user.id, ACCT_MAX_PHOTOS).run();
          if (!saved.meta.changes) throw acctError(409, `Your account has ${ACCT_MAX_PHOTOS} photos. Delete some first.`);
          return acctJSON({ photo: { width, height } }, 201);
        }
        throw acctError(405, 'Unsupported photo operation.');
      }
      if (path === '/api/journal/entries' && method === 'DELETE') {
        await db.prepare('DELETE FROM journal_photos WHERE user_id = ?').bind(user.id).run();
        await db.prepare('DELETE FROM journal_entries WHERE user_id = ?').bind(user.id).run();
        return acctJSON({ deleted: true });
      }
      if (entryMatch && method === 'DELETE') {
        const removed = await db.prepare('DELETE FROM journal_entries WHERE id = ? AND user_id = ?').bind(entryMatch[1].toLowerCase(), user.id).run();
        if (!removed.meta.changes) throw acctError(404, 'Entry not found.');
        await db.prepare('DELETE FROM journal_photos WHERE entry_id = ? AND user_id = ?').bind(entryMatch[1].toLowerCase(), user.id).run();
        return acctJSON({ deleted: true });
      }
      if (path === '/api/suit/checks') {
        if (method === 'GET') {
          const { results } = await db.prepare('SELECT id, created, overall, items FROM suit_checks WHERE user_id = ? ORDER BY created DESC LIMIT 5').bind(user.id).all();
          return acctJSON({ checks: results.map(row => ({ id: row.id, date: new Date(row.created).toISOString(), overall: row.overall, items: JSON.parse(row.items) })) });
        }
        if (method === 'POST') {
          const body = await acctReadJSON(request, 16384);
          if (!acctOnlyKeys(body, ['items']) || !Array.isArray(body.items) || !body.items.length || body.items.length > 40) throw acctError(400, 'Send between 1 and 40 suit check items.');
          const seen = new Set(), items = body.items.map(item => {
            if (!item || typeof item !== 'object' || !acctOnlyKeys(item, ['id', 'status', 'note']) || typeof item.id !== 'string' || !/^[a-z0-9-]{1,40}$/.test(item.id) || seen.has(item.id) || !['pass', 'fail', 'unchecked'].includes(item.status) || (item.note !== undefined && (typeof item.note !== 'string' || item.note.length > 300))) throw acctError(400, 'Invalid suit check item.');
            seen.add(item.id); return { id: item.id, status: item.status, note: (item.note || '').trim() };
          });
          const overall = items.some(item => item.status === 'fail') ? 'not-ready' : items.every(item => item.status === 'pass') ? 'ready' : 'incomplete';
          const check = { id: crypto.randomUUID(), date: new Date().toISOString(), overall, items };
          const saved = await db.prepare('INSERT INTO suit_checks (id, user_id, created, overall, items) SELECT ?, ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM suit_checks WHERE user_id = ?) < ?').bind(check.id, user.id, Date.parse(check.date), overall, JSON.stringify(items), user.id, ACCT_MAX_SUIT_CHECKS).run();
          if (!saved.meta.changes) { // Keep the newest inspections: drop the oldest, then insert.
            await db.prepare('DELETE FROM suit_checks WHERE id = (SELECT id FROM suit_checks WHERE user_id = ? ORDER BY created ASC LIMIT 1)').bind(user.id).run();
            await db.prepare('INSERT INTO suit_checks (id, user_id, created, overall, items) VALUES (?, ?, ?, ?, ?)').bind(check.id, user.id, Date.parse(check.date), overall, JSON.stringify(items)).run();
          }
          return acctJSON({ check }, 201);
        }
        throw acctError(405, 'Unsupported suit check operation.');
      }
      if (path === '/api/journal/search' && method === 'POST') {
        const body = await acctReadJSON(request, 4096);
        if (!acctOnlyKeys(body, ['query']) || typeof body.query !== 'string' || !body.query.trim() || body.query.length > 500) throw acctError(400, 'Send a search of up to 500 characters.');
        const matches = await journalRecall(env, user.id, body.query, { limit: 5, minimum: 0.15 });
        return acctJSON({ matches, index: { model: VEC_MODEL, dimensions: VEC_DIM } });
      }
      throw acctError(405, 'Unsupported journal operation.');
    } catch (error) { return acctJSON({ error: error.status ? error.message : 'Accounts are temporarily unavailable.' }, error.status || 503); }
  };
}
