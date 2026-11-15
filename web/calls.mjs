// Phone calls for serious alerts. A circle member opts in with their own number; when a station camera or the
// owner's monitor reports that someone asked for help or did not answer the check-in, each opted-in member is
// called by an ElevenLabs agent through the Twilio number linked in ElevenLabs. The agent is told only a person
// number, a room, a camera name and what happened. Needs the secrets ELEVENLABS_API_KEY, ELEVENLABS_ALERT_AGENT_ID
// and ELEVENLABS_PHONE_NUMBER_ID (the id ElevenLabs shows for the imported number, not the number itself).
import { accountUser } from './account.mjs';

const cllJSON = (value, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
const cllError = (status, message) => Object.assign(new Error(message), { status });
const cllDB = env => { if (!env.DB) throw cllError(503, 'Calls need the account database.'); return env.DB.withSession ? env.DB.withSession('first-primary') : env.DB; };
export const cllConfigured = env => Boolean(env.ELEVENLABS_API_KEY && env.ELEVENLABS_ALERT_AGENT_ID && env.ELEVENLABS_PHONE_NUMBER_ID);
export const cllMask = phone => `••• ${phone.slice(-4)}`;
/** E.164 only: a plus sign, a non-zero country digit, then up to 14 more digits. */
export const cllValidPhone = phone => typeof phone === 'string' && /^\+[1-9]\d{7,14}$/.test(phone);
const cllShort = (value, fallback) => (typeof value === 'string' && value.trim() ? value.trim().slice(0, 80) : fallback);

export const CALL_WORDS = { help: 'They asked for help.', timeout: 'They did not answer the check-in.', still: 'They have not moved for a while.', test: 'This is a test call. Nothing is wrong.' };

/** The dynamic variables the agent's script uses: {{person}}, {{room}}, {{camera}}, {{what_happened}}. */
export function cllVariables(info) {
  return { person: cllShort(info.person, 'A crew member'), room: cllShort(info.room, 'the station'), camera: cllShort(info.camera, 'a camera'), what_happened: CALL_WORDS[info.kind] ?? cllShort(info.what, 'They may need help.') };
}

/** Places one call through ElevenLabs. Returns 'placed' or 'failed'; never throws. */
export async function cllPlace(env, phone, info, fetcher = fetch) {
  if (!cllConfigured(env)) return 'failed';
  try {
    const response = await fetcher('https://api.elevenlabs.io/v1/convai/twilio/outbound-call', { method: 'POST', signal: AbortSignal.timeout(15000), headers: { 'xi-api-key': env.ELEVENLABS_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent_id: env.ELEVENLABS_ALERT_AGENT_ID, agent_phone_number_id: env.ELEVENLABS_PHONE_NUMBER_ID, to_number: phone, conversation_initiation_client_data: { dynamic_variables: cllVariables(info) }, telephony_call_config: { ringing_timeout_secs: 40 } }) });
    if (!response.ok) return 'failed';
    const data = await response.json().catch(() => ({}));
    return data.success === false ? 'failed' : 'placed';
  } catch { return 'failed'; }
}

/** Calls every opted-in member of the given users. There is no cooldown or daily cap. Returns how many calls were placed. */
export async function callMembers(env, userIds, info, fetcher = fetch) {
  if (!cllConfigured(env) || !userIds.length) return 0;
  const db = cllDB(env), now = Date.now(), marks = userIds.map(() => '?').join(',');
  const { results } = await db.prepare(`SELECT user_id, phone, last_called FROM call_contacts WHERE enabled = 1 AND user_id IN (${marks})`).bind(...userIds).all();
  let placed = 0;
  for (const contact of results) {
    const outcome = await cllPlace(env, contact.phone, info, fetcher);
    await db.prepare('INSERT INTO call_log (user_id, created, outcome) VALUES (?, ?, ?)').bind(contact.user_id, now, outcome).run();
    if (outcome === 'placed') { placed++; await db.prepare('UPDATE call_contacts SET last_called = ? WHERE user_id = ?').bind(now, contact.user_id).run(); }
  }
  return placed;
}

export async function handleCalls(request, env, fetcher = fetch) {
  const url = new URL(request.url), path = url.pathname, method = request.method;
  if (!path.startsWith('/api/calls/')) return null;
  try {
    if (method !== 'GET' && request.headers.get('Origin') !== url.origin) throw cllError(403, 'Use calls on this website.');
    const db = cllDB(env), user = await accountUser(request, env);
    if (!user) throw cllError(401, 'Sign in to set up phone calls.');
    if (path === '/api/calls/me' && method === 'GET') {
      const row = await db.prepare('SELECT phone, enabled FROM call_contacts WHERE user_id = ?').bind(user.id).first();
      return cllJSON({ configured: cllConfigured(env), number: row ? cllMask(row.phone) : null, enabled: Boolean(row?.enabled) });
    }
    if (path === '/api/calls/me' && method === 'PUT') {
      const reader = request.body?.getReader(); if (!reader) throw cllError(400, 'Send JSON.');
      let text = '', done = false; const decoder = new TextDecoder();
      while (!done) { const chunk = await reader.read(); done = chunk.done; if (chunk.value) { text += decoder.decode(chunk.value, { stream: true }); if (text.length > 512) throw cllError(413, 'Request is too large.'); } }
      let body; try { body = JSON.parse(text); } catch { throw cllError(400, 'Invalid JSON.'); }
      if (body.consent !== true) throw cllError(400, 'Please agree to receive alert calls first.');
      const phone = typeof body.phone === 'string' ? body.phone.replace(/[\s().-]/g, '') : '';
      if (!cllValidPhone(phone)) throw cllError(400, 'Enter the number with its country code, like +15551234567.');
      await db.prepare('INSERT INTO call_contacts (user_id, phone, enabled, consented, last_called) VALUES (?, ?, 1, ?, NULL) ON CONFLICT(user_id) DO UPDATE SET phone = excluded.phone, enabled = 1, consented = excluded.consented').bind(user.id, phone, Date.now()).run();
      return cllJSON({ number: cllMask(phone), enabled: true }, 201);
    }
    if (path === '/api/calls/me' && method === 'DELETE') { await db.prepare('DELETE FROM call_contacts WHERE user_id = ?').bind(user.id).run(); return cllJSON({ number: null, enabled: false }); }
    if (path === '/api/calls/test' && method === 'POST') { // a test call to your own number
      if (!cllConfigured(env)) throw cllError(503, 'Phone calls are not set up on this server yet.');
      const row = await db.prepare('SELECT phone FROM call_contacts WHERE user_id = ? AND enabled = 1').bind(user.id).first();
      if (!row) throw cllError(404, 'Save your number first.');
      const outcome = await cllPlace(env, row.phone, { person: 'Person 2', room: 'Destiny', camera: 'Test camera', kind: 'test' }, fetcher);
      await db.prepare('INSERT INTO call_log (user_id, created, outcome) VALUES (?, ?, ?)').bind(user.id, Date.now(), outcome === 'placed' ? 'test' : 'failed').run();
      if (outcome !== 'placed') throw cllError(502, 'The call could not be placed. Check the ElevenLabs agent, number and key.');
      return cllJSON({ placed: true }, 201);
    }
    throw cllError(405, 'Unsupported calls operation.');
  } catch (error) { return cllJSON({ error: error.status ? error.message : 'Calls are temporarily unavailable.' }, error.status || 503); }
}

/** Live two-way check-in conversation. The browser asks for a short-lived signed URL; the API key never leaves the server.
 *  Needs ELEVENLABS_API_KEY and ELEVENLABS_CHECKIN_AGENT_ID (the "CrewSafety Check-in" agent). */
export const cllCheckinConfigured = env => Boolean(env.ELEVENLABS_API_KEY && env.ELEVENLABS_CHECKIN_AGENT_ID);
const cllVoiceStarts = new Map();
export async function handleCheckinVoice(request, env, fetcher = fetch) {
  const url = new URL(request.url), path = url.pathname, method = request.method;
  if (path === '/api/checkin/voice/status' && method === 'GET') return cllJSON({ configured: cllCheckinConfigured(env) });
  if (path !== '/api/checkin/voice/session') return null;
  if (method !== 'POST') return cllJSON({ error: 'Use POST.' }, 405);
  if (request.headers.get('Origin') !== url.origin) return cllJSON({ error: 'Use the check-in on this website.' }, 403);
  if (!cllCheckinConfigured(env)) return cllJSON({ error: 'The voice check-in is not set up on the server.' }, 503);
  const visitor = request.headers.get('CF-Connecting-IP') || 'shared', now = Date.now();
  const recent = (cllVoiceStarts.get(visitor) || []).filter(time => now - time < 60000);
  if (recent.length >= 6) return cllJSON({ error: 'Too many voice check-ins. Wait a minute.' }, 429);
  cllVoiceStarts.set(visitor, [...recent, now]);
  try {
    const response = await fetcher(`https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(env.ELEVENLABS_CHECKIN_AGENT_ID)}`, { headers: { 'xi-api-key': env.ELEVENLABS_API_KEY }, signal: AbortSignal.timeout(10000) });
    if (!response.ok) return cllJSON({ error: 'ElevenLabs would not start the conversation.' }, 502);
    const data = await response.json().catch(() => ({}));
    if (typeof data.signed_url !== 'string' || !data.signed_url.startsWith('wss://')) return cllJSON({ error: 'ElevenLabs returned no conversation link.' }, 502);
    return cllJSON({ signedUrl: data.signed_url });
  } catch { return cllJSON({ error: 'ElevenLabs could not be reached.' }, 504); }
}
