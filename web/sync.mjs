// iOS wire contract: UUIDs and Unix-millisecond dates. D1 persists across Workers.
const syncUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const syncJSON = (value, status = 200) => new Response(JSON.stringify(value), {status, headers: {'Content-Type':'application/json', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff'}});
const syncError = (status, detail) => Object.assign(new Error(detail), {status});
const syncNumber = (v, max = Number.MAX_SAFE_INTEGER) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max;
function syncFields(o, keys) { return o && typeof o === 'object' && !Array.isArray(o) && Object.keys(o).every(k => keys.includes(k)); }
function syncText(v, max, min = 0) { return typeof v === 'string' && v.length >= min && v.length <= max; }
function syncID(v) { return typeof v === 'string' && syncUUID.test(v); }
export function validateSyncSnapshot(s) {
  if (!syncFields(s, ['deviceID','crew','monitoredCrewMemberID','events','telemetry']) || !syncID(s.deviceID) || !syncID(s.monitoredCrewMemberID)) throw syncError(422,'Invalid snapshot');
  if (!Array.isArray(s.crew) || !s.crew.length || s.crew.length > 50 || !Array.isArray(s.events) || s.events.length > 500 || !Array.isArray(s.telemetry) || s.telemetry.length > 200) throw syncError(422,'Invalid snapshot size');
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
async function syncReadJSON(request) {
  if (!(request.headers.get('Content-Type') || '').startsWith('application/json')) throw syncError(415,'Send JSON');
  if (!request.body) throw syncError(400,'Send JSON');
  const reader=request.body.getReader(), chunks=[]; let size=0;
  while (true) { const {done,value}=await reader.read(); if (done) break; size+=value.length; if(size>3000000) {await reader.cancel(); throw syncError(413,'Snapshot too large');} chunks.push(value); }
  const bytes=new Uint8Array(size); let offset=0; for(const c of chunks) {bytes.set(c,offset); offset+=c.length;}
  try {return JSON.parse(new TextDecoder().decode(bytes));} catch {throw syncError(400,'Invalid JSON');}
}
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
    const ack=path.match(/^\/sync\/events\/([0-9a-f-]+)\/acknowledge$/i);
    for (let attempt=0;attempt<8;attempt++) {
      const row=await db.prepare('SELECT * FROM crew_sessions WHERE token = ? AND expires > ?').bind(key,Date.now()).first();
      if (!row) throw syncError(401,'Session expired or pairing code invalid');
      const previous=row.state ? JSON.parse(row.state) : null;
      if(path==='/sync/state' && request.method==='GET') return syncJSON({snapshot:previous});
      if(path==='/sync/session' && request.method==='DELETE') {await db.prepare('DELETE FROM crew_sessions WHERE token = ?').bind(key).run(); return new Response(null,{status:204,headers:{'Cache-Control':'no-store'}});}
      let state;
      if(incoming) {
        if(previous && previous.deviceID!==incoming.deviceID) throw syncError(409,'This session is paired with another iPhone. Create a new session.');
        const events=new Map((previous?.events||[]).map(e=>[e.id,e]));
        for(const e of incoming.events) { const old=events.get(e.id); if(!old) events.set(e.id,e); else if(e.acknowledged && !old.acknowledged) {old.acknowledged=true; old.acknowledgedAt=e.acknowledgedAt ?? Date.now();} }
        state={...incoming,events:[...events.values()].sort((a,b)=>b.timestamp-a.timestamp).slice(0,500),receivedAt:Date.now()};
      } else if(ack && request.method==='POST' && syncID(ack[1])) {
        state=previous; const event=state?.events.find(e=>e.id===ack[1].toLowerCase());
        if(!event) throw syncError(404,'Event not found');
        if(event.acknowledged) return syncJSON({acknowledged:true});
        event.acknowledged=true; event.acknowledgedAt=Date.now();
      } else throw syncError(405,'Unsupported sync operation');
      const saved=await db.prepare('UPDATE crew_sessions SET state = ?, revision = revision + 1 WHERE token = ? AND revision = ? AND expires > ?').bind(JSON.stringify(state),key,row.revision,Date.now()).run();
      if(saved.meta.changes) return syncJSON(incoming ? {snapshot:state} : {acknowledged:true});
    }
    throw syncError(409,'Concurrent update; retry shortly');
  } catch(error) { return syncJSON({detail:error.status ? error.message : 'Sync is temporarily unavailable'},error.status||503); }
}
