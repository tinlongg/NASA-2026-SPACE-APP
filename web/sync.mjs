// iOS wire contract: UUIDs and Unix-millisecond dates. D1 persists across Workers.
const syncUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const syncJSON = (value, status = 200) => new Response(JSON.stringify(value), {status, headers: {'Content-Type':'application/json', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff'}});
const syncError = (status, detail) => Object.assign(new Error(detail), {status});
const syncNumber = (v, max = Number.MAX_SAFE_INTEGER) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max;
function syncFields(o, keys) { return o && typeof o === 'object' && !Array.isArray(o) && Object.keys(o).every(k => keys.includes(k)); }
function syncText(v, max, min = 0) { return typeof v === 'string' && v.length >= min && v.length <= max; }
function syncID(v) { return typeof v === 'string' && syncUUID.test(v); }
// Optional Watch health summary the wearer chose to share: five daily averages, their own usual range and the
// published astronaut range. No ECG, no raw samples. Titles and units are fixed on the page, not sent.
const SYNC_HEALTH_KEYS = ['heartRate','restingHeartRate','heartRateVariability','respiratoryRate','bloodOxygen'], SYNC_STANDING = ['below','within','above'];
function syncHealth(h) {
  if (!syncFields(h, ['updatedAt','simulated','metrics']) || !syncNumber(h.updatedAt) || typeof h.simulated !== 'boolean' || !Array.isArray(h.metrics) || h.metrics.length > SYNC_HEALTH_KEYS.length) throw syncError(422,'Invalid health summary');
  const seen = new Set(), number = v => v == null || syncNumber(v, 1000), standing = v => v == null || SYNC_STANDING.includes(v);
  for (const m of h.metrics) {
    if (!syncFields(m, ['key','value','usualLow','usualHigh','standing','astronautLow','astronautHigh','astronautStanding']) || !SYNC_HEALTH_KEYS.includes(m.key) || seen.has(m.key)
      || !number(m.value) || !number(m.usualLow) || !number(m.usualHigh) || !number(m.astronautLow) || !number(m.astronautHigh) || !standing(m.standing) || !standing(m.astronautStanding)) throw syncError(422,'Invalid health metric');
    seen.add(m.key);
    for (const k of ['value','usualLow','usualHigh','astronautLow','astronautHigh','standing','astronautStanding']) m[k] ??= null;
  }
  return h;
}
export function validateSyncSnapshot(s) {
  if (!syncFields(s, ['deviceID','crew','monitoredCrewMemberID','events','telemetry','health']) || !syncID(s.deviceID) || !syncID(s.monitoredCrewMemberID)) throw syncError(422,'Invalid snapshot');
  if (!Array.isArray(s.crew) || !s.crew.length || s.crew.length > 50 || !Array.isArray(s.events) || s.events.length > 500 || !Array.isArray(s.telemetry) || s.telemetry.length > 200) throw syncError(422,'Invalid snapshot size');
  if (s.health != null) syncHealth(s.health); else delete s.health;
  const ids = new Set();
  for (const c of s.crew) {
    if (!syncFields(c,['id','displayName','role','status','lastUpdated']) || !syncID(c.id) || !syncText(c.displayName,100,1) || !syncText(c.role,100) || !['nominal','attention','alert'].includes(c.status) || !syncNumber(c.lastUpdated)) throw syncError(422,'Invalid crew member');
    c.id = c.id.toLowerCase(); if (ids.has(c.id)) throw syncError(422,'Duplicate crew'); ids.add(c.id);
  }
  s.deviceID = s.deviceID.toLowerCase(); s.monitoredCrewMemberID = s.monitoredCrewMemberID.toLowerCase();
  if (!ids.has(s.monitoredCrewMemberID)) throw syncError(422,'Unknown monitored crew');
  const eventIDs = new Set();
  for (const e of s.events) {
    if (!syncFields(e,['id','crewMemberID','type','timestamp','severity','source','heuristicScore','details','acknowledged','acknowledgedAt','checkIn']) || !syncID(e.id) || !syncID(e.crewMemberID) || !['possibleUnresponsive','manualTest'].includes(e.type) || !syncNumber(e.timestamp) || !Number.isInteger(e.severity) || !syncNumber(e.severity,2) || !['liveCamera','replay','simulated','webCamera'].includes(e.source) || !syncText(e.details,4000) || (e.heuristicScore != null && !syncNumber(e.heuristicScore,1)) || (e.acknowledged !== undefined && typeof e.acknowledged !== 'boolean') || (e.acknowledgedAt != null && !syncNumber(e.acknowledgedAt))) throw syncError(422,'Invalid event');
    if (e.checkIn != null) { const keys=Object.keys(e.checkIn); const k=keys[0]; if (keys.length!==1 || !['respondedOK','requestedHelp','noResponse'].includes(k) || !syncFields(e.checkIn[k],['after']) || !syncNumber(e.checkIn[k].after)) throw syncError(422,'Invalid check-in'); }
    e.id=e.id.toLowerCase(); e.crewMemberID=e.crewMemberID.toLowerCase(); e.acknowledged ??= false; e.acknowledgedAt ??= null; e.heuristicScore ??= null;
    if (!ids.has(e.crewMemberID) || eventIDs.has(e.id)) throw syncError(422,'Invalid event reference'); eventIDs.add(e.id);
  }
  for (const t of s.telemetry) {
    if (!syncFields(t,['id','crewMemberID','timestamp','heartRateBPM','activityLevel','source']) || !syncID(t.id) || !syncID(t.crewMemberID) || !syncNumber(t.timestamp) || !['simulated','healthKit'].includes(t.source) || (t.heartRateBPM != null && !syncNumber(t.heartRateBPM,400)) || (t.activityLevel != null && !syncNumber(t.activityLevel,1))) throw syncError(422,'Invalid telemetry');
    t.id=t.id.toLowerCase(); t.crewMemberID=t.crewMemberID.toLowerCase(); t.heartRateBPM ??= null; t.activityLevel ??= null;
    if (!ids.has(t.crewMemberID)) throw syncError(422,'Invalid telemetry reference');
  }
  return s;
}
// Apple Watch readings relayed by the paired iPhone. Times arrive in iPhone milliseconds with the iPhone's
// send time, and are stored in server time (receivedAt minus their age) so clock differences do not matter.
export function validateWearable(w, receivedAt = Date.now()) {
  if (!syncFields(w, ['deviceID','sentAt','monitoring','heartRateBPM','heartRateAt','movedAt','activityLevel','answer']) || !syncID(w.deviceID) || !syncNumber(w.sentAt) || typeof w.monitoring !== 'boolean') throw syncError(422,'Invalid wearable reading');
  if ((w.heartRateBPM != null && !syncNumber(w.heartRateBPM,400)) || (w.activityLevel != null && !syncNumber(w.activityLevel,1))) throw syncError(422,'Invalid wearable reading');
  for (const key of ['heartRateAt','movedAt']) if (w[key] != null && (!syncNumber(w[key]) || w[key] > w.sentAt + 1000)) throw syncError(422,'Invalid wearable time');
  if (w.answer != null && (!syncFields(w.answer,['checkInID','kind','at']) || !syncText(w.answer.checkInID,64,1) || !/^[\w-]+$/.test(w.answer.checkInID) || !['ok','help'].includes(w.answer.kind) || !syncNumber(w.answer.at) || w.answer.at > w.sentAt + 1000)) throw syncError(422,'Invalid check-in answer');
  const server = at => at == null ? null : receivedAt - Math.max(0, w.sentAt - at);
  return { monitoring: w.monitoring, heartRateBPM: w.heartRateBPM ?? null, heartRateAt: server(w.heartRateAt), movedAt: server(w.movedAt), activityLevel: w.activityLevel ?? null,
    answer: w.answer ? { checkInID: w.answer.checkInID, kind: w.answer.kind, at: server(w.answer.at) } : null, receivedAt, deviceID: w.deviceID.toLowerCase() };
}
function validateCheckInRequest(c, now = Date.now()) {
  if (!syncFields(c,['id','seconds','cancel']) || !syncText(c.id,64,1) || !/^[\w-]+$/.test(c.id)) throw syncError(422,'Invalid check-in request');
  if (c.cancel === true) return { id: c.id, cancel: true };
  if (!syncNumber(c.seconds,120) || c.seconds < 1) throw syncError(422,'Invalid check-in request');
  return { id: c.id, requestedAt: now, expiresAt: now + c.seconds * 1000 };
}
async function syncReadJSON(request) {
  if (!(request.headers.get('Content-Type') || '').startsWith('application/json')) throw syncError(415,'Send JSON');
  if (!request.body) throw syncError(400,'Send JSON');
  const reader=request.body.getReader(), chunks=[]; let size=0;
  while (true) { const {done,value}=await reader.read(); if (done) break; size+=value.length; if(size>3000000) {await reader.cancel(); throw syncError(413,'Snapshot too large');} chunks.push(value); }
  const bytes=new Uint8Array(size); let offset=0; for(const c of chunks) {bytes.set(c,offset); offset+=c.length;}
  try {return JSON.parse(new TextDecoder().decode(bytes));} catch {throw syncError(400,'Invalid JSON');}
}
const activeCheckIn = state => state?.checkInRequest && state.checkInRequest.expiresAt > Date.now() ? state.checkInRequest : null;
const syncHash = async code => [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(code)))].map(b=>b.toString(16).padStart(2,'0')).join('');
export async function handleCrewSync(request, env) {
  try {
    const url=new URL(request.url), path=url.pathname, now=Date.now();
    if (request.headers.get('Origin') && request.headers.get('Origin')!==url.origin) throw syncError(403,'Use this website or the native app');
    if (!env.DB) throw syncError(503,'Hosted sync storage is unavailable');
    // Primary reads + optimistic revision checks prevent lost acknowledgements across isolates.
    const db=env.DB.withSession ? env.DB.withSession('first-primary') : env.DB;
    if (path==='/sync/sessions' && request.method==='POST') {
      const code=crypto.randomUUID().replaceAll('-',''), key=await syncHash(code), expires=now+86400000;
      const results=await db.batch([
        db.prepare('DELETE FROM crew_sessions WHERE expires < ?').bind(now),
        db.prepare('INSERT INTO crew_sessions (token,expires,state,revision) SELECT ?,?,NULL,0 WHERE (SELECT COUNT(*) FROM crew_sessions) < 1000').bind(key,expires)
      ]);
      if (!results[1].meta.changes) throw syncError(429,'Session capacity reached. Try later.');
      return syncJSON({pairingCode:code,expiresAt:expires},201);
    }
    const code=(request.headers.get('Authorization')||'').match(/^Bearer ([a-f0-9]{32})$/)?.[1];
    if (!code) throw syncError(401,'Pairing code required');
    const key=await syncHash(code);
    let incoming;
    if (path==='/sync/state' && request.method==='PUT') incoming=validateSyncSnapshot(await syncReadJSON(request));
    let wearable, checkIn;
    if (path==='/sync/wearable' && request.method==='PUT') wearable=validateWearable(await syncReadJSON(request));
    if (path==='/sync/checkin' && request.method==='POST') checkIn=validateCheckInRequest(await syncReadJSON(request));
    const ack=path.match(/^\/sync\/events\/([0-9a-f-]+)\/acknowledge$/i);
    for (let attempt=0;attempt<8;attempt++) {
      const row=await db.prepare('SELECT * FROM crew_sessions WHERE token = ? AND expires > ?').bind(key,Date.now()).first();
      if (!row) throw syncError(401,'Session expired or pairing code invalid');
      const previous=row.state ? JSON.parse(row.state) : null;
      if(path==='/sync/state' && request.method==='GET') return syncJSON({snapshot:previous});
      if(path==='/sync/wearable' && request.method==='GET') return syncJSON({wearable:previous?.wearable ?? null, checkInRequest:activeCheckIn(previous), now:Date.now()});
      if(path==='/sync/session' && request.method==='DELETE') {await db.prepare('DELETE FROM crew_sessions WHERE token = ?').bind(key).run(); return new Response(null,{status:204,headers:{'Cache-Control':'no-store'}});}
      let state;
      if(incoming) {
        if(previous && previous.deviceID!==incoming.deviceID) throw syncError(409,'This session is paired with another iPhone. Create a new session.');
        const events=new Map((previous?.events||[]).map(e=>[e.id,e]));
        for(const e of incoming.events) { const old=events.get(e.id); if(!old) events.set(e.id,e); else if(e.acknowledged && !old.acknowledged) {old.acknowledged=true; old.acknowledgedAt=e.acknowledgedAt ?? Date.now();} }
        // The Watch channel and pending check-in live beside the snapshot; a full upload keeps them.
        state={...incoming,events:[...events.values()].sort((a,b)=>b.timestamp-a.timestamp).slice(0,500),receivedAt:Date.now(),wearable:previous?.wearable ?? null,checkInRequest:activeCheckIn(previous)};
      } else if(wearable) {
        if(!previous) throw syncError(409,'Send the iPhone state first');
        if(previous.deviceID!==wearable.deviceID) throw syncError(409,'This session is paired with another iPhone. Create a new session.');
        const {deviceID, ...reading}=wearable;
        // Keep the last answer until a newer one arrives, so a 1 s poll cannot miss it.
        state={...previous,wearable:{...reading,answer:reading.answer ?? previous.wearable?.answer ?? null},checkInRequest:activeCheckIn(previous)};
      } else if(checkIn) {
        if(!previous) throw syncError(409,'No iPhone is paired with this session yet');
        state={...previous,checkInRequest:checkIn.cancel ? (previous.checkInRequest?.id===checkIn.id ? null : activeCheckIn(previous)) : checkIn};
      } else if(ack && request.method==='POST' && syncID(ack[1])) {
        state=previous; const event=state?.events.find(e=>e.id===ack[1].toLowerCase());
        if(!event) throw syncError(404,'Event not found');
        if(event.acknowledged) return syncJSON({acknowledged:true});
        event.acknowledged=true; event.acknowledgedAt=Date.now();
      } else throw syncError(405,'Unsupported sync operation');
      const saved=await db.prepare('UPDATE crew_sessions SET state = ?, revision = revision + 1 WHERE token = ? AND revision = ? AND expires > ?').bind(JSON.stringify(state),key,row.revision,Date.now()).run();
      if(saved.meta.changes) return syncJSON(incoming ? {snapshot:state} : wearable ? {checkInRequest:state.checkInRequest} : checkIn ? {checkInRequest:state.checkInRequest} : {acknowledged:true});
    }
    throw syncError(409,'Concurrent update; retry shortly');
  } catch(error) { return syncJSON({detail:error.status ? error.message : 'Sync is temporarily unavailable'},error.status||503); }
}
