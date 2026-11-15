// The crew circle: people who are told when an alert is raised, like a family-safety circle. One account
// owns a circle and invites others with a one-time code. Alerts reach members three ways: a Web Push
// message (works with the site closed), a feed that open pages poll, and the owner's own page.
// Alert text carries only a station name, a person number and what happened: no video, no names.
import { accountUser } from './account.mjs';
import { wpSend, wpConfigured } from './webpush.mjs';
import { callMembers } from './calls.mjs';

const CRC_MAX_MEMBERS = 20, CRC_INVITE_MS = 24 * 3600000, CRC_ALERT_KEEP_MS = 24 * 3600000, CRC_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const crcJSON = (value, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
const crcError = (status, message) => Object.assign(new Error(message), { status });
const crcDB = env => { if (!env.DB) throw crcError(503, 'Circles need the account database.'); return env.DB.withSession ? env.DB.withSession('first-primary') : env.DB; };
async function crcDigest(text) { return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))].map(byte => byte.toString(16).padStart(2, '0')).join(''); }
const crcCode = () => [...crypto.getRandomValues(new Uint8Array(8))].map(byte => CRC_ALPHABET[byte % CRC_ALPHABET.length]).join('');
async function crcRead(request, limit) {
  if (!(request.headers.get('Content-Type') || '').startsWith('application/json')) throw crcError(415, 'Send JSON.');
  const reader = request.body?.getReader(); if (!reader) throw crcError(400, 'Send JSON.');
  const chunks = []; let size = 0;
  while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > limit) { await reader.cancel(); throw crcError(413, 'Request is too large.'); } chunks.push(value); }
  const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  let parsed; try { parsed = JSON.parse(new TextDecoder().decode(bytes)); } catch { throw crcError(400, 'Invalid JSON.'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw crcError(400, 'Send a JSON object.');
  return parsed;
}
const crcText = (value, max) => typeof value === 'string' ? value.trim().slice(0, max) : '';

/** Records an alert for the circle owned by `ownerId` and pushes it to every member's devices. */
export async function notifyCircle(env, ownerId, { title, body, call }, fetcher = fetch) {
  const db = crcDB(env), circle = await db.prepare('SELECT id FROM circles WHERE owner_id = ?').bind(ownerId).first();
  if (!circle) return { recorded: false, sent: 0 };
  await db.prepare('DELETE FROM circle_alerts WHERE created < ?').bind(Date.now() - CRC_ALERT_KEEP_MS).run();
  await db.prepare('INSERT INTO circle_alerts (circle_id, created, title, body) VALUES (?, ?, ?, ?)').bind(circle.id, Date.now(), title, body).run();
  let sent = 0;
  if (wpConfigured(env)) {
    const { results } = await db.prepare('SELECT s.id AS id, s.endpoint AS endpoint, s.p256dh AS p256dh, s.auth AS auth FROM push_subscriptions s WHERE s.user_id = ? OR s.user_id IN (SELECT user_id FROM circle_members WHERE circle_id = ?)').bind(ownerId, circle.id).all();
    for (const subscription of results) {
      const outcome = await wpSend(env, subscription, { title, body, tag: 'crewsafety-alert', url: '/' }, fetcher);
      if (outcome === 'sent') sent++; else if (outcome === 'gone') await db.prepare('DELETE FROM push_subscriptions WHERE id = ?').bind(subscription.id).run();
    }
  }
  // Serious alerts (help, or no answer to the check-in) also ring the members who opted in to phone calls.
  let called = 0;
  if (call) { const { results } = await db.prepare('SELECT user_id FROM circle_members WHERE circle_id = ?').bind(circle.id).all(); called = await callMembers(env, [ownerId, ...results.map(row => row.user_id)], call, fetcher).catch(() => 0); }
  return { recorded: true, sent, called };
}

export async function handleCircle(request, env, fetcher = fetch) {
  const url = new URL(request.url), path = url.pathname, method = request.method;
  if (!path.startsWith('/api/circle') && !path.startsWith('/api/push/')) return null;
  try {
    if (method !== 'GET' && request.headers.get('Origin') !== url.origin) throw crcError(403, 'Use circles on this website.');
    if (path === '/api/push/key' && method === 'GET') return crcJSON({ configured: wpConfigured(env), key: env.VAPID_PUBLIC_KEY || null });
    const db = crcDB(env), user = await accountUser(request, env);
    if (!user) throw crcError(401, 'Sign in to use your crew circle.');

    if (path === '/api/push/subscribe' && method === 'POST') {
      const body = await crcRead(request, 2048), keys = body.keys || {};
      let endpoint; try { endpoint = new URL(body.endpoint); } catch { throw crcError(400, 'Invalid push subscription.'); }
      if (endpoint.protocol !== 'https:' || typeof keys.p256dh !== 'string' || typeof keys.auth !== 'string' || keys.p256dh.length > 200 || keys.auth.length > 50 || body.endpoint.length > 1000) throw crcError(400, 'Invalid push subscription.');
      await db.prepare('INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, created) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth').bind(crypto.randomUUID(), user.id, body.endpoint, keys.p256dh, keys.auth, Date.now()).run();
      return crcJSON({ subscribed: true }, 201);
    }
    if (path === '/api/push/subscribe' && method === 'DELETE') {
      const body = await crcRead(request, 1200); await db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?').bind(String(body.endpoint || ''), user.id).run();
      return crcJSON({ subscribed: false });
    }

    const mine = await db.prepare('SELECT id, name, owner_id FROM circles WHERE owner_id = ?').bind(user.id).first();
    const joined = await db.prepare('SELECT c.id AS id, c.name AS name FROM circles c JOIN circle_members m ON m.circle_id = c.id WHERE m.user_id = ?').bind(user.id).all();
    if (path === '/api/circle' && method === 'GET') {
      const members = async circleId => (await db.prepare('SELECT u.id AS id, u.username AS username FROM circle_members m JOIN users u ON u.id = m.user_id WHERE m.circle_id = ? ORDER BY m.joined').bind(circleId).all()).results.map(row => ({ id: row.id, username: row.username }));
      return crcJSON({ owned: mine ? { id: mine.id, name: mine.name, members: await members(mine.id) } : null, memberOf: joined.results.map(row => ({ id: row.id, name: row.name })), push: { configured: wpConfigured(env), key: env.VAPID_PUBLIC_KEY || null }, you: { id: user.id, username: user.username } });
    }
    if (path === '/api/circle' && method === 'POST') {
      if (mine) throw crcError(409, 'You already have a circle.');
      const name = crcText((await crcRead(request, 512)).name, 40); if (!name) throw crcError(400, 'Give the circle a name.');
      await db.prepare('INSERT INTO circles (id, owner_id, name, created) VALUES (?, ?, ?, ?)').bind(crypto.randomUUID(), user.id, name, Date.now()).run();
      return crcJSON({ created: true }, 201);
    }
    if (path === '/api/circle/invite' && method === 'POST') {
      if (!mine) throw crcError(404, 'Create your circle first.');
      const code = crcCode(); await db.prepare('DELETE FROM circle_invites WHERE expires < ?').bind(Date.now()).run();
      await db.prepare('INSERT INTO circle_invites (code_hash, circle_id, expires) VALUES (?, ?, ?)').bind(await crcDigest(code), mine.id, Date.now() + CRC_INVITE_MS).run();
      return crcJSON({ code, expiresInHours: CRC_INVITE_MS / 3600000 }, 201);
    }
    if (path === '/api/circle/join' && method === 'POST') {
      const code = crcText((await crcRead(request, 256)).code, 16).toUpperCase().replace(/[^A-Z0-9]/g, '');
      const invite = code.length === 8 ? await db.prepare('SELECT circle_id FROM circle_invites WHERE code_hash = ? AND expires > ?').bind(await crcDigest(code), Date.now()).first() : null;
      if (!invite) throw crcError(404, 'That invite is wrong or has expired.');
      const circle = await db.prepare('SELECT id, owner_id, name FROM circles WHERE id = ?').bind(invite.circle_id).first();
      if (circle.owner_id === user.id) throw crcError(409, 'This is your own circle.');
      const count = await db.prepare('SELECT COUNT(*) AS n FROM circle_members WHERE circle_id = ?').bind(circle.id).first();
      if (count.n >= CRC_MAX_MEMBERS) throw crcError(409, 'This circle is full.');
      await db.prepare('INSERT OR IGNORE INTO circle_members (circle_id, user_id, joined) VALUES (?, ?, ?)').bind(circle.id, user.id, Date.now()).run();
      await db.prepare('DELETE FROM circle_invites WHERE code_hash = ?').bind(await crcDigest(code)).run(); // each invite works once
      return crcJSON({ joined: true, circle: circle.name });
    }
    const memberMatch = path.match(/^\/api\/circle\/members\/([0-9a-f-]{36})$/);
    if (memberMatch && method === 'DELETE') { // the owner removes someone, or you leave a circle
      const target = memberMatch[1].toLowerCase();
      if (target === user.id) { await db.prepare('DELETE FROM circle_members WHERE user_id = ?').bind(user.id).run(); return crcJSON({ removed: true }); }
      if (!mine) throw crcError(404, 'Member not found.');
      await db.prepare('DELETE FROM circle_members WHERE circle_id = ? AND user_id = ?').bind(mine.id, target).run(); return crcJSON({ removed: true });
    }
    if (path === '/api/circle/alerts' && method === 'GET') { // what open pages poll
      const after = Number(url.searchParams.get('after')) || 0;
      const circles = [...(mine ? [mine.id] : []), ...joined.results.map(row => row.id)];
      if (!circles.length) return crcJSON({ alerts: [], latest: after });
      const marks = circles.map(() => '?').join(',');
      const { results } = await db.prepare(`SELECT id, created, title, body FROM circle_alerts WHERE circle_id IN (${marks}) AND id > ? ORDER BY id LIMIT 20`).bind(...circles, after).all();
      const latest = (await db.prepare(`SELECT MAX(id) AS id FROM circle_alerts WHERE circle_id IN (${marks})`).bind(...circles).first()).id ?? 0;
      return crcJSON({ alerts: results.map(row => ({ id: row.id, at: row.created, title: row.title, body: row.body })), latest });
    }
    if ((path === '/api/circle/alert' || path === '/api/circle/test') && method === 'POST') {
      if (!mine) throw crcError(404, 'Create your circle first.');
      const body = path === '/api/circle/test' ? {} : await crcRead(request, 1024);
      const title = path === '/api/circle/test' ? 'CrewSafety test alert' : crcText(body.title, 80), text = path === '/api/circle/test' ? 'This is a test. Nothing is wrong.' : crcText(body.body, 200);
      if (!title || !text) throw crcError(400, 'Send a title and a message.');
      const kind = path !== '/api/circle/test' && ['help', 'timeout', 'still'].includes(body.callKind) ? body.callKind : null; // only serious alerts ring phones
      return crcJSON(await notifyCircle(env, user.id, { title, body: text, ...(kind ? { call: { kind, person: crcText(body.person, 40), room: crcText(body.room, 40), camera: crcText(body.camera, 40) } } : {}) }, fetcher), 201);
    }
    throw crcError(405, 'Unsupported circle operation.');
  } catch (error) { return crcJSON({ error: error.status ? error.message : 'Circles are temporarily unavailable.' }, error.status || 503); }
}
