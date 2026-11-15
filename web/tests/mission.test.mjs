import test from 'node:test';
import assert from 'node:assert/strict';
import {newMission,applyMissionAction,missionSummary,missionStats,MISSION_TASKS} from '../dist/mission-rules.js';
import {createWorker} from '../worker.mjs';
import {localSyncDB} from '../scripts/local-sync-db.mjs';
const time=Date.parse('2026-11-15T12:00:00Z');
const action=(type,rest={})=>({id:crypto.randomUUID(),type,...rest});
const task=(s,name,now=time)=>applyMissionAction(s,action('task',{task:name,participated:true}),now);
const flight=(s,score,now=time)=>{const start=action('start',{game:'dock'});s=applyMissionAction(s,start,now);return applyMissionAction(s,action('finish',{run:start.id,score}),now+6000);};
test('new games use the same fuel cost, participation rewards, and recent averages',()=>{
 for(const game of ['sequence','navigator']){
  let state=task(newMission(),'health');const start=action('start',{game});state=applyMissionAction(state,start,time);assert.equal(state.fuel,50);
  state=applyMissionAction(state,action('finish',{run:start.id,score:75,metrics:{attempts:8,accuracy:90,errors:1}}),time+6000);
  assert.equal(state.coins,15);assert.equal(state.rankPoints,20);assert.equal(state.history[0].game,game);assert.equal(missionStats(state,game).average,75);
 }
});

test('daily participation priority, duplicate check-ins, garden and streak boundaries',()=>{
 let s=newMission();s=task(s,'health');assert.equal(s.fuel,60);
 assert.deepEqual(task(s,'health'),s);
 s=task(task(s,'exercise'),'journal');assert.equal(s.fuel,100);assert.equal(s.garden,1);assert.equal(s.streak,1);
 assert.ok(MISSION_TASKS.find(x=>x.id==='health').fuel>MISSION_TASKS.find(x=>x.id==='exercise').fuel);
 s=task(s,'health',time+86400000);assert.equal(s.streak,2);
 const before=structuredClone(s);assert.equal(missionSummary(s,time+4*86400000).dust,2);assert.equal(missionSummary(s,time+4*86400000).streak,0);assert.deepEqual(s,before);
 s=task(s,'wellness',time+4*86400000);assert.equal(s.streak,1);assert.equal(missionSummary(s,time+4*86400000).dust,0);
});
test('low and high scores earn identical points; six-flight cap and cancellation',()=>{
 const initial=task(newMission(),'health');const low=flight(initial,0),high=flight(initial,100);
 assert.equal(low.coins,15);assert.equal(high.coins,low.coins);assert.equal(high.rankPoints,low.rankPoints);assert.equal(low.fuel,50);
 let s=initial;for(let i=0;i<6;i++)s=flight(s,i*10,time+i*10000);
 assert.equal(s.rankPoints,120);assert.throws(()=>applyMissionAction(s,action('start',{game:'memory'}),time),/Six/);
 let started=applyMissionAction(initial,action('start',{game:'memory'}),time);
 assert.equal(applyMissionAction(started,action('cancel'),time).fuel,initial.fuel);
 assert.throws(()=>applyMissionAction(started,action('finish',{run:started.pending.id,score:100}),time),/seconds/);
});
test('idempotency, purchases, prestige and permanent best with rolling baseline',()=>{
 let s=task(newMission(),'health');s=flight(flight(s,100),20,time+10000);
 const buy=action('buy',{item:'cap'});s=applyMissionAction(s,buy,time);assert.equal(s.coins,0);assert.deepEqual(applyMissionAction(s,buy,time),s);
 assert.equal(s.equipped.hat,'cap');assert.throws(()=>applyMissionAction(s,action('buy',{item:'crown'}),time),/Not enough/);
 assert.throws(()=>applyMissionAction(s,action('prestige'),time),/Reach Mars/);
 s.distance=1000;const reset=applyMissionAction(s,action('prestige'),time);assert.equal(reset.distance,0);assert.equal(reset.prestige,1);assert.deepEqual(reset.owned,s.owned);assert.equal(reset.rankPoints,s.rankPoints);
 for(let day=1;day<4;day++){s=task(s,'health',time+day*86400000);for(let i=0;i<4;i++)s=flight(s,20,time+day*86400000+i*10000);}
 assert.deepEqual(missionStats(s,'dock'),{count:10,best:100,average:20});
 assert.throws(()=>task(s,'invented'),/check-in/);
});
test('mission API isolates accounts, enforces origin and includes all accounts in global rankings',async()=>{
 const DB=localSyncDB(),worker=createWorker(),origin='https://test.example';
 const client=()=>{let cookie='';return async(path,method='GET',body,from=origin)=>{const res=await worker.fetch(new Request(origin+path,{method,headers:{Origin:from,Cookie:cookie,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}),{DB});if(res.headers.get('set-cookie'))cookie=res.headers.get('set-cookie').split(';')[0];return res;};};
 const a=client(),b=client();assert.equal((await a('/api/mission/state')).status,401);
 for(const [call,username]of[[a,'mission-a'],[b,'mission-b']])assert.equal((await call('/api/auth/register','POST',{username,password:crypto.randomUUID()})).status,201);
 const check=action('task',{task:'health',participated:true});
 assert.equal((await a('/api/mission/action','POST',check,'https://evil.example')).status,403);
 const results=await Promise.all([a('/api/mission/action','POST',check),a('/api/mission/action','POST',check)]);assert.ok(results.every(r=>r.status===200));
 assert.equal((await (await a('/api/mission/state')).json()).state.fuel,60);
 assert.equal((await (await b('/api/mission/state')).json()).state.fuel,0);
 assert.equal((await (await a('/api/mission/leaderboard')).json()).rows.length,2);
 assert.equal((await a('/api/mission/action','POST',action('listing',{listed:false}))).status,400);
 const board=await(await b('/api/mission/leaderboard')).json();assert.equal(board.rows.length,2);assert.deepEqual(Object.keys(board.rows[0]).sort(),['alias','points','rank','self']);assert.match(board.rows[0].alias,/^Bird-/);
 assert.equal((await a('/api/mission/action','POST',{...check,answers:['private']})).status,400);
 DB.sqlite.close();
});
