import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorker} from '../worker.mjs';
import {missionAdminConfigs} from '../account.mjs';
import {localSyncDB} from '../scripts/local-sync-db.mjs';

test('Git seed provisions all three local demo admins on a fresh deployment',async()=>{
 const DB=localSyncDB(),worker=createWorker(),env={DB},origin='https://test.example';
 try {
  assert.deepEqual(missionAdminConfigs(env).map(c=>c.username),['tinluong','andrewha','leonnguyen','henryluu']);
  for(const username of ['tinluong','andrewha','leonnguyen']){
   const login=await worker.fetch(new Request(origin+'/api/auth/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({username,password:'1234'})}),env);
   assert.equal(login.status,200);assert.equal((await login.json()).user.role,'admin');
   const cookie=login.headers.get('set-cookie').split(';')[0];
   const state=await worker.fetch(new Request(origin+'/api/mission/state',{headers:{cookie}}),env);
   assert.equal((await state.json()).admin,true);
   assert.equal(DB.sqlite.prepare('SELECT id FROM users WHERE username=?').get(username).id,missionAdminConfigs(env).find(c=>c.username===username).id);
  }
  assert.equal(DB.sqlite.prepare('SELECT COUNT(*) AS count FROM users').get().count,3);
 } finally {DB.sqlite.close();}
});

test('deployment configuration can disable or replace the public demo seed',()=>{
 assert.deepEqual(missionAdminConfigs({MISSION_ADMIN_ACCOUNTS:'[]'}),[]);
 const config=missionAdminConfigs({})[0];
 assert.deepEqual(missionAdminConfigs({MISSION_ADMIN_ACCOUNTS:JSON.stringify([config])}),[config]);
});

test('henryluu is included with an immutable ID and existing salted password hash',()=>{
 const account=missionAdminConfigs({}).find(c=>c.username==='henryluu');
 assert.ok(account);assert.match(account.id,/^[a-f0-9-]{36}$/);
 assert.match(account.salt,/^[a-f0-9]{32}$/);assert.match(account.hash,/^[a-f0-9]{64}$/);
});
