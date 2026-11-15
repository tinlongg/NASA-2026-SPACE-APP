import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes,pbkdf2Sync,createHash} from 'node:crypto';
import {createWorker} from '../worker.mjs';
import {missionAdminConfigs} from '../account.mjs';
import {localSyncDB} from '../scripts/local-sync-db.mjs';

test('existing henryluu account has full admin powers with a deployment-specific ID and password',async()=>{
 const DB=localSyncDB(),worker=createWorker(),env={DB,MISSION_ADMIN_ACCOUNTS:'[]'},origin='https://test.example';
 const id=randomUUID(),password=randomUUID(),salt=randomBytes(16).toString('hex');
 const hash=pbkdf2Sync(password,Buffer.from(salt,'hex'),100000,32,'sha256').toString('hex');
 DB.sqlite.prepare('INSERT INTO users (id,username,salt,hash,created) VALUES (?,?,?,?,?)').run(id,'henryluu',salt,hash,Date.now());
 const request=(path,body,cookie='')=>worker.fetch(new Request(origin+path,{method:body?'POST':'GET',headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}),env);
 try {
  // A session established before deployment also picks up the new role.
  const token=randomBytes(32).toString('hex');
  DB.sqlite.prepare('INSERT INTO auth_sessions (token,user_id,expires) VALUES (?,?,?)').run(createHash('sha256').update(token).digest('hex'),id,Date.now()+60000);
  assert.equal((await(await request('/api/auth/me',null,'cs_session='+token)).json()).user.role,'admin');
  assert.equal((await request('/api/auth/login',{username:'henryluu',password:'wrong-password'})).status,401);
  const login=await request('/api/auth/login',{username:'henryluu',password});
  assert.equal(login.status,200);assert.equal((await login.json()).user.role,'admin');
  const cookie=login.headers.get('set-cookie').split(';')[0];
  assert.equal((await(await request('/api/mission/state',null,cookie)).json()).admin,true);
  for(const body of [{type:'admin',stage:'needs-care',growth:18},{type:'buy',item:'cigarette'},{type:'start',game:'memory'},{type:'cancel'},{type:'admin',points:600}]){
   assert.equal((await request('/api/mission/action',{id:randomUUID(),...body},cookie)).status,200);
  }
  assert.deepEqual(DB.sqlite.prepare('SELECT id,salt,hash FROM users WHERE username=?').get('henryluu'),Object.assign(Object.create(null),{id,salt,hash}));
  const ordinary=await request('/api/auth/register',{username:'ordinary-crew',password:randomUUID()});
  const regularCookie=ordinary.headers.get('set-cookie').split(';')[0];
  assert.equal((await request('/api/mission/action',{id:randomUUID(),type:'admin',points:999},regularCookie)).status,403);
 } finally {DB.sqlite.close();}
});

test('no demo accounts are seeded and the owner username cannot be registered',async()=>{
 assert.deepEqual(missionAdminConfigs({}),[]);
 const DB=localSyncDB(),worker=createWorker(),origin='https://test.example';
 try {
  const response=await worker.fetch(new Request(origin+'/api/auth/register',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({username:'henryluu',password:randomUUID()})}),{DB});
  assert.equal(response.status,409);
  assert.equal(DB.sqlite.prepare('SELECT COUNT(*) AS count FROM users').get().count,0);
 } finally {DB.sqlite.close();}
});
