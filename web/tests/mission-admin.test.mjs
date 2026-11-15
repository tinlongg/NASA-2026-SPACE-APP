import test from 'node:test';
import assert from 'node:assert/strict';
import {pbkdf2Sync,randomBytes,randomUUID} from 'node:crypto';
import {createWorker} from '../worker.mjs';
import {localSyncDB} from '../scripts/local-sync-db.mjs';
import {newMission,applyMissionAction} from '../dist/mission-rules.js';
const action=(type,extra={})=>({id:randomUUID(),type,...extra});
test('admins can launch with zero fuel without spending or refunding fuel',()=>{
 const base=newMission();assert.throws(()=>applyMissionAction(base,action('start',{game:'memory'})),/fuel/);
 let state=base;for(let i=0;i<8;i++){state=applyMissionAction(state,action('start',{game:'memory'}),Date.now(),{admin:true});assert.equal(state.fuel,0);state=applyMissionAction(state,action('cancel'),Date.now(),{admin:true});assert.equal(state.fuel,0);}
 const saved={...base,fuel:90},started=applyMissionAction(saved,action('start',{game:'navigator'}),Date.now(),{admin:true});assert.equal(started.fuel,90);assert.equal(applyMissionAction(started,action('cancel'),Date.now(),{admin:true}).fuel,90);
});
test('only admins can set their leaderboard points to a nonnegative whole number',()=>{
 const base=newMission(),change=action('admin',{points:600});
 assert.throws(()=>applyMissionAction(base,change),/Admin/);
 const updated=applyMissionAction(base,change,Date.now(),{admin:true});
 assert.equal(updated.rankPoints,600);assert.equal(base.rankPoints,0);assert.equal(updated.coins,base.coins);assert.equal(updated.listed,false);
 assert.deepEqual(applyMissionAction(updated,change,Date.now(),{admin:true}),updated);
 for(const points of [0,1000000000])assert.equal(applyMissionAction(updated,action('admin',{points}),Date.now(),{admin:true}).rankPoints,points);
 for(const points of [-1,1.5,'600',null,1000000001,Infinity,NaN])assert.throws(()=>applyMissionAction(updated,action('admin',{points}),Date.now(),{admin:true}),/whole leaderboard points/);
});
test('admin simulations require server authority and preserve ordinary shop rules',()=>{
 const base=newMission();assert.throws(()=>applyMissionAction(base,action('admin',{growth:18})),/Admin/);
 assert.throws(()=>applyMissionAction(base,action('buy',{item:'crown'})),/Not enough/);
 let s=applyMissionAction(base,action('buy',{item:'crown'}),Date.now(),{admin:true});assert.equal(s.coins,0);assert.ok(s.owned.includes('crown'));
 s=applyMissionAction(s,action('admin',{stage:'needs-care',growth:18}),Date.now(),{admin:true});assert.equal(s.birdStage,'needs-care');assert.equal(s.garden,18);assert.equal(s.rankPoints,0);
 s=applyMissionAction(s,action('admin',{distance:800,prestige:3}),Date.now(),{admin:true});assert.equal(s.distance,800);assert.equal(s.prestige,3);
 assert.throws(()=>applyMissionAction(s,action('admin',{distance:1001}),Date.now(),{admin:true}));
 assert.throws(()=>applyMissionAction(s,action('admin',{prestige:1}),Date.now()),/Admin/);
 for(const extra of [{stage:'made-up'},{growth:-1},{growth:101}])assert.throws(()=>applyMissionAction(s,action('admin',extra),Date.now(),{admin:true}));
 assert.throws(()=>applyMissionAction(s,action('listing',{listed:true}),Date.now(),{admin:true}),/global leaderboard/);
});
test('provisioned admin authenticates by hashed password and ID; client flags cannot elevate',async()=>{
 const DB=localSyncDB(),worker=createWorker(),password=randomUUID(),salt=randomBytes(16).toString('hex');
 const config={id:randomUUID(),username:'test-admin',salt,hash:pbkdf2Sync(password,Buffer.from(salt,'hex'),100000,32,'sha256').toString('hex')};
 const env={DB,MISSION_ADMIN_ACCOUNT:JSON.stringify(config)},origin='https://test.example';
 const client=()=>{let cookie='';return async(path,body)=>{const r=await worker.fetch(new Request(origin+path,{method:body?'POST':'GET',headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}),env);if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];return r;};};
 const a=client(),regular=client();assert.equal((await a('/api/auth/register',{username:config.username,password})).status,409);
 assert.equal((await a('/api/auth/login',{username:config.username,password:'wrong-password'})).status,401);
 assert.equal((await a('/api/auth/login',{username:config.username,password})).status,200);
 assert.equal((await(await a('/api/mission/state')).json()).admin,true);
 assert.equal((await(await a('/api/auth/me')).json()).user.role,'admin');
 for(const item of ['cap','crown','scarf','pack','garden'])assert.equal((await a('/api/mission/action',action('buy',{item}))).status,200);
 assert.equal((await a('/api/mission/action',action('admin',{stage:'tired',growth:18}))).status,200);
 assert.equal((await(await a('/api/mission/state')).json()).state.garden,18);
 await regular('/api/auth/register',{username:'regular-crew',password:randomUUID()});
 assert.equal((await(await regular('/api/mission/state')).json()).admin,false);
 assert.equal((await a('/api/mission/action',action('admin',{fuel:120}))).status,400);
 assert.equal((await regular('/api/mission/action',action('start',{game:'memory'}))).status,400);
 assert.equal((await a('/api/mission/action',action('start',{game:'memory'}))).status,200);
 assert.equal((await(await a('/api/mission/state')).json()).state.fuel,0);
 assert.equal((await a('/api/mission/action',action('cancel'))).status,200);
 assert.equal((await(await a('/api/mission/state')).json()).state.fuel,0);
 assert.equal((await regular('/api/mission/action',action('admin',{stage:'healthy'}))).status,403);
 assert.equal((await regular('/api/mission/action',action('buy',{item:'cap',admin:true}))).status,400);
 assert.equal((await regular('/api/mission/action',action('buy',{item:'cap'}))).status,400);
 assert.equal((await(await regular('/api/mission/leaderboard')).json()).rows.length,2);
 assert.equal(DB.sqlite.prepare('SELECT hash FROM users WHERE id=?').get(config.id).hash,config.hash);
 await a('/api/mission/action',action('admin',{bots:true}));
 const demo=await(await a('/api/mission/leaderboard')).json();assert.equal(demo.demo,true);assert.equal(demo.rows.length,10);assert.ok(demo.rows.every(r=>r.bot));assert.equal(demo.self.rank,13);
 assert.equal((await(await regular('/api/mission/leaderboard')).json()).rows.length,2);
 assert.equal((await regular('/api/mission/action',action('admin',{bots:true}))).status,403);
 const edit=action('admin',{points:600});
 assert.equal((await regular('/api/mission/action',edit)).status,403);
 assert.equal((await a('/api/mission/action',edit)).status,200);
 assert.equal((await a('/api/mission/action',edit)).status,200);
 const saved=await(await a('/api/mission/state')).json();assert.equal(saved.state.rankPoints,600);
 const editedBoard=await(await a('/api/mission/leaderboard')).json();assert.equal(editedBoard.self.points,600);assert.equal(editedBoard.self.rank,1);assert.equal(editedBoard.rows[0].self,true);
 assert.equal((await(await regular('/api/mission/state')).json()).state.rankPoints,0);
 assert.equal((await(await regular('/api/mission/leaderboard')).json()).rows.length,2);
 for(const points of [-1,1.5,'600',null,1000000001])assert.equal((await a('/api/mission/action',action('admin',{points}))).status,400);
 assert.equal((await(await a('/api/mission/state')).json()).state.rankPoints,600);
 await a('/api/mission/action',action('admin',{points:0}));assert.equal((await(await a('/api/mission/leaderboard')).json()).self.rank,13);
 await a('/api/mission/action',action('admin',{bots:false}));assert.equal((await(await a('/api/mission/leaderboard')).json()).demo,false);
 const renamed=await(await regular('/api/mission/action',action('rename',{name:'Captain Chirp'}))).json();assert.equal(renamed.state.birdName,'Captain Chirp');assert.equal(renamed.alias,'Captain Chirp');
 const persisted=await(await regular('/api/mission/state')).json();assert.equal(persisted.alias,'Captain Chirp');
 const namedBoard=await(await regular('/api/mission/leaderboard')).json();assert.equal(namedBoard.rows.find(r=>r.self).alias,'Captain Chirp');
 for(const name of ['', '<script>', 'x'.repeat(25)])assert.equal((await regular('/api/mission/action',action('rename',{name}))).status,400);

 for(let i=0;i<12;i++){const id=randomUUID();DB.sqlite.prepare('INSERT INTO users (id,username,salt,hash,created) VALUES (?,?,?,?,?)').run(id,'rank-user-'+i,'fixture','fixture',Date.now());DB.sqlite.prepare('INSERT INTO mission_profiles (user_id,state,revision,points,listed,alias) VALUES (?,?,0,?,0,?)').run(id,JSON.stringify(newMission()),100+i,'Test-'+i);}
 const ranked=await(await regular('/api/mission/leaderboard')).json();assert.equal(ranked.rows.length,14);assert.equal(ranked.self.rank,13);assert.equal(ranked.self.points,0);
 DB.sqlite.close();
});
test('multiple configured admins can sign in with short provisioned passwords without changing registration rules',async()=>{
 const DB=localSyncDB(),worker=createWorker(),password='1234',origin='https://test.example';
 const configs=['test-admin-one','test-admin-two','test-admin-three'].map(username=>{const salt=randomBytes(16).toString('hex');return {id:randomUUID(),username,salt,hash:pbkdf2Sync(password,Buffer.from(salt,'hex'),100000,32,'sha256').toString('hex')};});
 const env={DB,MISSION_ADMIN_ACCOUNTS:JSON.stringify(configs)};
 const request=(path,body,cookie='')=>worker.fetch(new Request(origin+path,{method:body?'POST':'GET',headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}),env);
 for(const config of configs){
  const login=await request('/api/auth/login',{username:config.username,password});assert.equal(login.status,200);assert.equal((await login.json()).user.role,'admin');
  const cookie=login.headers.get('set-cookie').split(';')[0];
  assert.equal((await(await request('/api/auth/me',null,cookie)).json()).user.role,'admin');
  assert.equal((await(await request('/api/mission/state',null,cookie)).json()).admin,true);
 }
 assert.equal((await request('/api/auth/register',{username:'ordinary-crew',password})).status,400);
 assert.equal((await request('/api/auth/login',{username:'ordinary-crew',password})).status,400);
 assert.equal((await request('/api/auth/login',{username:configs[0].username,password:'wrong'})).status,401);
 assert.equal((await request('/api/auth/register',{username:configs[0].username,password:'long-password'})).status,409);
 DB.sqlite.close();
});
