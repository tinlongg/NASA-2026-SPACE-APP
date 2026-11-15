// Stations: phones paired as cameras. An account creates a station (a name and a room), shows its
// one-time join code, and a phone enters the code on /camera to receive a device token. The phone
// finds people on the device and reports only a small status summary (no video, no joints) here;
// live video, if the admin asks for it, goes phone to browser over WebRTC with this server only
// passing the setup messages. Self-contained: names are prefixed so the Worker bundle can concatenate it.
import { accountUser } from './account.mjs';
import { notifyCircle } from './circle.mjs';

const STN_MAX_STATIONS = 12, STN_CODE_MS = 15 * 60000, STN_ONLINE_MS = 12000, STN_SIGNAL_MS = 2 * 60000;
export const STN_ROOMS = ['zvezda', 'zarya', 'unity', 'destiny', 'columbus', 'kibo', 'tranquility', 'cupola', 'quest']; // the ISS modules where cameras may go (Harmony holds the crew quarters: private)
const STN_ROOM_NAMES = { zvezda: 'Zvezda', zarya: 'Zarya', unity: 'Unity', destiny: 'Destiny', columbus: 'Columbus', kibo: 'Kibo', tranquility: 'Tranquility', cupola: 'Cupola', quest: 'Quest airlock' };
const STN_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no look-alike characters
const STN_STATUS = ['moving', 'still', 'alert', 'checking', 'untracked'];
const stnJSON = (value, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
const stnError = (status, message) => Object.assign(new Error(message), { status });
const stnHex = bytes => [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
async function stnDigest(text) { return stnHex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))); }
const stnDB = env => { if (!env.DB) throw stnError(503, 'Stations need the account database.'); return env.DB.withSession ? env.DB.withSession('first-primary') : env.DB; };
const stnJoinCode = () => { const bytes = crypto.getRandomValues(new Uint8Array(6)); return [...bytes].map(byte => STN_ALPHABET[byte % STN_ALPHABET.length]).join(''); };
const stnNumber = (value, minimum, maximum) => typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum;

async function stnReadJSON(request, limit) {
  if (!(request.headers.get('Content-Type') || '').startsWith('application/json')) throw stnError(415, 'Send JSON.');
  const reader = request.body?.getReader(); if (!reader) throw stnError(400, 'Send JSON.');
  const chunks = []; let size = 0;
  while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > limit) { await reader.cancel(); throw stnError(413, 'Request is too large.'); } chunks.push(value); }
  const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  let parsed; try { parsed = JSON.parse(new TextDecoder().decode(bytes)); } catch { throw stnError(400, 'Invalid JSON.'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw stnError(400, 'Send a JSON object.');
  return parsed;
}

/** Validates a phone's report. Only small, named fields survive; everything else is dropped. */
export function cleanReport(body) {
  if (!Array.isArray(body.people) || body.people.length > 8) throw stnError(400, 'Send up to 8 people.');
  const people = body.people.map(person => {
    if (!person || typeof person !== 'object' || !Number.isInteger(person.id) || person.id < 1 || person.id > 9999 || !STN_STATUS.includes(person.status)) throw stnError(400, 'Invalid person in report.');
    const clean = { id: person.id, status: person.status, stillFor: stnNumber(person.stillFor, 0, 86400) ? Math.round(person.stillFor * 10) / 10 : 0 };
    if (['open', 'closed', 'unclear', 'unknown'].includes(person.eyes)) clean.eyes = person.eyes;
    if (['moving', 'still', 'unknown'].includes(person.mouth)) clean.mouth = person.mouth;
    if (person.upper === true) clean.upper = true;
    if (stnNumber(person.secondsLeft, 0, 600)) clean.secondsLeft = Math.round(person.secondsLeft);
    return clean;
  });
  const report = { people, fps: stnNumber(body.fps, 0, 120) ? Math.round(body.fps) : null, model: ['lite', 'full', 'heavy'].includes(body.model) ? body.model : null };
  let alert = null;
  if (body.alert !== undefined && body.alert !== null) {
    const a = body.alert;
    if (typeof a !== 'object' || !Number.isInteger(a.personId) || !['help', 'timeout'].includes(a.kind)) throw stnError(400, 'Invalid alert.');
    alert = { personId: a.personId, kind: a.kind };
  }
  return { report, alert };
}

export async function handleStations(request, env) {
  const url = new URL(request.url), path = url.pathname, method = request.method;
  if (!path.startsWith('/api/stations')) return null;
  try {
    if (method !== 'GET' && request.headers.get('Origin') !== url.origin && !request.headers.get('Authorization')) throw stnError(403, 'Use stations on this website.');
    const db = stnDB(env);

    // ---- Phone side: join with a code, then report and exchange setup messages with the device token.
    if (path === '/api/stations/join' && method === 'POST') {
      const body = await stnReadJSON(request, 512), code = typeof body.code === 'string' ? body.code.toUpperCase().replace(/[^A-Z0-9]/g, '') : '';
      if (code.length !== 6) throw stnError(400, 'Enter the 6-character code.');
      const station = await db.prepare('SELECT id, name, room FROM stations WHERE join_code = ? AND join_expires > ?').bind(await stnDigest(code), Date.now()).first();
      if (!station) throw stnError(404, 'That code is wrong or has expired. Ask for a new one.');
      const token = stnHex(crypto.getRandomValues(new Uint8Array(32)));
      await db.prepare('UPDATE stations SET join_code = NULL, join_expires = NULL, device_hash = ?, last_seen = ? WHERE id = ?').bind(await stnDigest(token), Date.now(), station.id).run();
      return stnJSON({ stationId: station.id, name: station.name, room: station.room, token });
    }
    const bearer = (request.headers.get('Authorization') || '').match(/^Bearer ([0-9a-f]{64})$/);
    if (bearer) {
      const device = await db.prepare('SELECT id, owner_id, name, room FROM stations WHERE device_hash = ?').bind(await stnDigest(bearer[1])).first();
      if (!device) throw stnError(401, 'This camera was removed. Pair it again.');
      if (path === '/api/stations/report' && method === 'POST') {
        const { report, alert } = cleanReport(await stnReadJSON(request, 4096)), now = Date.now();
        await db.prepare('UPDATE stations SET report = ?, last_seen = ? WHERE id = ?').bind(JSON.stringify({ ...report, at: now }), now, device.id).run();
        if (alert) await db.prepare('UPDATE stations SET last_alert = ? WHERE id = ?').bind(JSON.stringify({ ...alert, at: now }), device.id).run();
        if (alert) await notifyCircle(env, device.owner_id, { title: `Alert: ${device.name}`, body: `${STN_ROOM_NAMES[device.room] || device.room}: Person ${alert.personId} ${alert.kind === 'help' ? 'asked for help' : 'did not answer the check-in'}. Go to them now.` }).catch(() => {});
        await db.prepare('DELETE FROM station_signals WHERE created < ?').bind(now - STN_SIGNAL_MS).run();
        const { results } = await db.prepare('SELECT id, payload FROM station_signals WHERE station_id = ? AND to_device = 1 ORDER BY id').bind(device.id).all();
        if (results.length) await db.prepare('DELETE FROM station_signals WHERE station_id = ? AND to_device = 1 AND id <= ?').bind(device.id, results.at(-1).id).run();
        return stnJSON({ ok: true, alert: Boolean(alert), signals: results.map(row => JSON.parse(row.payload)) });
      }
      if (path === '/api/stations/signal' && method === 'POST') { // phone to admin: offer and candidates
        const body = await stnReadJSON(request, 12000);
        if (typeof body.type !== 'string' || body.type.length > 20) throw stnError(400, 'Invalid signal.');
        await db.prepare('INSERT INTO station_signals (station_id, to_device, payload, created) VALUES (?, 0, ?, ?)').bind(device.id, JSON.stringify(body), Date.now()).run();
        return stnJSON({ ok: true }, 201);
      }
      throw stnError(405, 'Unsupported camera operation.');
    }

    // ---- Admin side: needs the website account that owns the stations.
    const user = await accountUser(request, env);
    if (!user) throw stnError(401, 'Sign in to manage stations.');
    const idMatch = path.match(/^\/api\/stations\/([0-9a-f-]{36})(\/code|\/signal)?$/);
    if (path === '/api/stations' && method === 'GET') {
      const { results } = await db.prepare('SELECT id, name, room, join_code, join_expires, device_hash, last_seen, report, last_alert FROM stations WHERE owner_id = ? ORDER BY created').bind(user.id).all();
      const now = Date.now();
      return stnJSON({ stations: results.map(row => ({ id: row.id, name: row.name, room: row.room, paired: Boolean(row.device_hash), waitingForCode: Boolean(row.join_code && row.join_expires > now), online: Boolean(row.last_seen && now - row.last_seen < STN_ONLINE_MS), report: row.report ? JSON.parse(row.report) : null, lastAlert: row.last_alert ? JSON.parse(row.last_alert) : null })), rooms: STN_ROOMS });
    }
    if (path === '/api/stations' && method === 'POST') {
      const body = await stnReadJSON(request, 512);
      const name = typeof body.name === 'string' ? body.name.trim().slice(0, 40) : '', room = body.room;
      if (!name || !STN_ROOMS.includes(room)) throw stnError(400, 'Send a camera name and one of the station modules.');
      const code = stnJoinCode(), id = crypto.randomUUID();
      const saved = await db.prepare('INSERT INTO stations (id, owner_id, name, room, join_code, join_expires, created) SELECT ?, ?, ?, ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM stations WHERE owner_id = ?) < ?').bind(id, user.id, name, room, await stnDigest(code), Date.now() + STN_CODE_MS, Date.now(), user.id, STN_MAX_STATIONS).run();
      if (!saved.meta.changes) throw stnError(409, `You can link up to ${STN_MAX_STATIONS} cameras. Remove one first.`);
      return stnJSON({ station: { id, name, room }, code, expiresInSeconds: STN_CODE_MS / 1000 }, 201);
    }
    if (idMatch) {
      const id = idMatch[1].toLowerCase(), owned = await db.prepare('SELECT id FROM stations WHERE id = ? AND owner_id = ?').bind(id, user.id).first();
      if (!owned) throw stnError(404, 'Station not found.');
      if (!idMatch[2] && method === 'DELETE') { await db.prepare('DELETE FROM station_signals WHERE station_id = ?').bind(id).run(); await db.prepare('DELETE FROM stations WHERE id = ?').bind(id).run(); return stnJSON({ deleted: true }); }
      if (idMatch[2] === '/code' && method === 'POST') { // pair another phone, or re-pair
        const code = stnJoinCode();
        await db.prepare('UPDATE stations SET join_code = ?, join_expires = ?, device_hash = NULL WHERE id = ?').bind(await stnDigest(code), Date.now() + STN_CODE_MS, id).run();
        return stnJSON({ code, expiresInSeconds: STN_CODE_MS / 1000 });
      }
      if (idMatch[2] === '/signal' && method === 'POST') { // admin to phone: view request, answer, candidates
        const body = await stnReadJSON(request, 12000);
        if (typeof body.type !== 'string' || body.type.length > 20) throw stnError(400, 'Invalid signal.');
        await db.prepare('INSERT INTO station_signals (station_id, to_device, payload, created) VALUES (?, 1, ?, ?)').bind(id, JSON.stringify(body), Date.now()).run();
        return stnJSON({ ok: true }, 201);
      }
      if (idMatch[2] === '/signal' && method === 'GET') { // admin reads what the phone sent
        const after = Number(url.searchParams.get('after')) || 0;
        await db.prepare('DELETE FROM station_signals WHERE created < ?').bind(Date.now() - STN_SIGNAL_MS).run();
        const { results } = await db.prepare('SELECT id, payload FROM station_signals WHERE station_id = ? AND to_device = 0 AND id > ? ORDER BY id').bind(id, after).all();
        return stnJSON({ signals: results.map(row => ({ id: row.id, ...JSON.parse(row.payload) })) });
      }
    }
    throw stnError(405, 'Unsupported station operation.');
  } catch (error) { return stnJSON({ error: error.status ? error.message : 'Stations are temporarily unavailable.' }, error.status || 503); }
}
