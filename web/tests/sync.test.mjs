import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorker } from '../worker.mjs';
import { localSyncDB } from '../scripts/local-sync-db.mjs';
const member='11111111-1111-4111-8111-111111111111', event='22222222-2222-4222-8222-222222222222';
const fixture=()=>({deviceID:'33333333-3333-4333-8333-333333333333',monitoredCrewMemberID:member,crew:[{id:member,displayName:'Synthetic crew',role:'Test',status:'nominal',lastUpdated:Date.now()}],events:[{id:event,crewMemberID:member,type:'manualTest',timestamp:Date.now(),severity:0,source:'simulated',details:'Synthetic integration test',acknowledged:false}],telemetry:[]});
function setup(){const DB=localSyncDB(), worker=createWorker(); return {DB,async call(path,method='GET',code,body,origin){return worker.fetch(new Request('https://test.example/sync/'+path,{method,headers:{...(code?{Authorization:'Bearer '+code}:{}),...(body?{'Content-Type':'application/json'}:{}),...(origin?{Origin:origin}:{})},...(body?{body:JSON.stringify(body)}:{})}),{DB});}};}
test('hosted pairing persists, syncs and preserves acknowledgement on stale retry',async()=>{
  const {call,DB}=setup(); const created=await call('sessions','POST'); assert.equal(created.status,201); const {pairingCode}=await created.json();
  assert.match(pairingCode,/^[a-f0-9]{32}$/); assert.equal(DB.sqlite.prepare('SELECT token FROM crew_sessions').get().token.includes(pairingCode),false);
  assert.deepEqual(await (await call('state','GET',pairingCode)).json(),{snapshot:null});
  const input=fixture(); assert.equal((await call('state','PUT',pairingCode,input)).status,200);
  assert.equal((await call(`events/${event}/acknowledge`,'POST',pairingCode)).status,200);
  const retried=await (await call('state','PUT',pairingCode,input)).json(); assert.equal(retried.snapshot.events[0].acknowledged,true);
  assert.ok(retried.snapshot.receivedAt>0); assert.equal((await call('state','PUT',pairingCode,{...input,deviceID:crypto.randomUUID()})).status,409);
  assert.equal((await call('session','DELETE',pairingCode)).status,204); assert.equal((await call('state','GET',pairingCode)).status,401);
});
test('session isolation, expiry, validation and cross-origin requests',async()=>{
 const {call,DB}=setup(); const a=(await (await call('sessions','POST')).json()).pairingCode, b=(await (await call('sessions','POST')).json()).pairingCode;
 await call('state','PUT',a,fixture()); assert.deepEqual(await (await call('state','GET',b)).json(),{snapshot:null});
 assert.equal((await call('state')).status,401);
 assert.equal((await call('state','PUT',a,{...fixture(),video:'not allowed'})).status,422);
 assert.equal((await call('state','PUT',a,{...fixture(),monitoredCrewMemberID:crypto.randomUUID()})).status,422);
 assert.equal((await call('sessions','POST',null,null,'https://other.example')).status,403);
 DB.sqlite.exec('UPDATE crew_sessions SET expires=0'); assert.equal((await call('state','GET',a)).status,401);
});
test('concurrent acknowledgement and upload never lose acknowledgement',async()=>{
 const {call}=setup(); const {pairingCode}=await (await call('sessions','POST')).json(); const input=fixture(); await call('state','PUT',pairingCode,input);
 await Promise.all([call('state','PUT',pairingCode,input),call(`events/${event}/acknowledge`,'POST',pairingCode)]);
 assert.equal((await (await call('state','GET',pairingCode)).json()).snapshot.events[0].acknowledged,true);
});
