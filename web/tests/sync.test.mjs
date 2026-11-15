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
  const input=fixture(); input.events[0].source='webCamera'; input.events[0].checkIn={requestedHelp:{after:12.5}}; assert.equal((await call('state','PUT',pairingCode,input)).status,200);
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
test('Apple Watch readings, check-in requests and answers travel through the session',async()=>{
 const {call}=setup(); const {pairingCode:code}=await (await call('sessions','POST')).json(); const input=fixture();
 const reading=(extra={})=>({deviceID:input.deviceID,sentAt:1_000_000,monitoring:true,heartRateBPM:72,heartRateAt:999_000,movedAt:998_000,activityLevel:0.4,...extra});
 assert.equal((await call('wearable','PUT',code,reading())).status,409); // the iPhone sends its state first
 await call('state','PUT',code,input);
 assert.equal((await call('wearable','PUT',code,reading())).status,200);
 let got=await (await call('wearable','GET',code)).json();
 assert.equal(got.wearable.heartRateBPM,72); assert.equal(got.wearable.monitoring,true);
 assert.ok(Math.abs((got.wearable.receivedAt-got.wearable.movedAt)-2000)<5,'times are moved into server time by their age');
 assert.equal(got.checkInRequest,null);
 assert.equal((await call('checkin','POST',code,{id:'check-1',seconds:30})).status,200);
 const reply=await (await call('wearable','PUT',code,reading())).json(); assert.equal(reply.checkInRequest.id,'check-1');
 const state=await (await call('state','PUT',code,input)).json(); assert.equal(state.snapshot.checkInRequest.id,'check-1','a full upload keeps the request');
 assert.equal((await call('wearable','PUT',code,reading({answer:{checkInID:'check-1',kind:'ok',at:999_500}}))).status,200);
 await call('wearable','PUT',code,reading()); // a later reading without an answer keeps the last answer
 got=await (await call('wearable','GET',code)).json(); assert.equal(got.wearable.answer.kind,'ok'); assert.equal(got.wearable.answer.checkInID,'check-1');
 await call('checkin','POST',code,{id:'check-1',cancel:true}); assert.equal((await (await call('wearable','GET',code)).json()).checkInRequest,null);
 assert.equal((await call('wearable','PUT',code,reading({answer:{checkInID:'check-1',kind:'maybe',at:1}}))).status,422);
 assert.equal((await call('wearable','PUT',code,reading({video:'x'}))).status,422);
 assert.equal((await call('wearable','PUT',code,reading({deviceID:crypto.randomUUID()}))).status,409);
 assert.equal((await call('checkin','POST',code,{id:'x',seconds:999})).status,422);
});
test('an opted-in Watch health summary is validated, stored, and dropped again when not sent',async()=>{
 const {call}=setup(); const {pairingCode:code}=await (await call('sessions','POST')).json();
 const health={updatedAt:Date.now(),simulated:false,metrics:[{key:'heartRate',value:71,usualLow:60,usualHigh:78,standing:'within',astronautLow:66.4,astronautHigh:82.8,astronautStanding:'within'},{key:'bloodOxygen',value:97}]};
 assert.equal((await call('state','PUT',code,{...fixture(),health})).status,200);
 const stored=(await (await call('state','GET',code)).json()).snapshot.health;
 assert.equal(stored.metrics[0].value,71); assert.equal(stored.metrics[1].usualLow,null); assert.equal(stored.simulated,false);
 assert.equal((await call('state','PUT',code,fixture())).status,200);
 assert.equal((await (await call('state','GET',code)).json()).snapshot.health,undefined,'turning sharing off removes it');
 const bad=[{...health,ecg:'Sinus rhythm'},{...health,metrics:[{key:'ecg',value:1}]},{...health,metrics:[{key:'heartRate',value:-1}]},{...health,metrics:[{key:'heartRate'},{key:'heartRate'}]},{...health,metrics:[{key:'heartRate',standing:'good'}]},{...health,metrics:[{key:'heartRate',notes:'x'}]},{...health,simulated:'no'}];
 for(const item of bad) assert.equal((await call('state','PUT',code,{...fixture(),health:item})).status,422,JSON.stringify(item).slice(0,60));
});
test('website alerts reach the paired iPhone and survive a full upload',async()=>{
 const {call}=setup(); const {pairingCode:code}=await (await call('sessions','POST')).json(); const input=fixture();
 const alert=(id,kind='alert')=>({id,person:'Alex',kind,reason:'No movement for 15 s'});
 assert.equal((await call('alert','POST',code,alert('a-1'))).status,409); // nobody paired yet
 await call('state','PUT',code,input);
 assert.equal((await call('alert','POST',code,alert('a-1'))).status,200);
 assert.equal((await call('alert','POST',code,{...alert('a-2'),kind:'panic'})).status,422);
 assert.equal((await call('alert','POST',code,{...alert('a-2'),extra:1})).status,422);
 const synced=await (await call('state','PUT',code,input)).json();
 assert.equal(synced.snapshot.websiteAlerts.length,1); assert.equal(synced.snapshot.websiteAlerts[0].person,'Alex'); assert.ok(synced.snapshot.websiteAlerts[0].at>0);
 for(let i=0;i<25;i++) await call('alert','POST',code,alert('b-'+i,i%2?'resolved':'checkin'));
 const got=await (await call('wearable','GET',code)).json();
 assert.equal(got.websiteAlerts.length,20); assert.equal(got.websiteAlerts.at(-1).id,'b-24');
});
