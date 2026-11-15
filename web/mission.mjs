import {newMission,applyMissionAction} from './dist/mission-rules.js';
import {accountUser,missionAdminConfig} from './account.mjs';
export async function handleMission(request,env){
 const url=new URL(request.url);if(!url.pathname.startsWith('/api/mission/'))return null;
 const reply=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
 try{
  if(!env.DB)return reply({error:'Mission storage is unavailable.'},503);
  const user=await accountUser(request,env);if(!user)return reply({error:'Sign in to sync your mission.'},401);
  const admin=user.id===missionAdminConfig(env)?.id;
  const db=env.DB.withSession?env.DB.withSession('first-primary'):env.DB;
  if(url.pathname==='/api/mission/leaderboard'&&request.method==='GET'){
   const own=await db.prepare('SELECT alias,points,listed,state FROM mission_profiles WHERE user_id=?').bind(user.id).first();
   if(admin&&own&&JSON.parse(own.state).demoBots){
    const names=['Comet','Nova','Orbit','Luna','Cosmo','Vega','Apollo','Stella','Meteor','Astro','Nebula','Pluto'];
    const all=[...names.map((name,i)=>({alias:name+' · demo bot',points:520-i*30,bot:true})),{alias:own.alias,points:own.points,bot:false,self:true}].sort((a,b)=>b.points-a.points||a.alias.localeCompare(b.alias));
    const ranked=all.map(r=>({...r,rank:1+all.filter(x=>x.points>r.points).length}));
    return reply({rows:ranked.slice(0,10),self:ranked.find(r=>r.self),demo:true,note:'Admin simulation. Demo bots are fictional and never enter real rankings.'});
   }
   const rows=(await db.prepare('SELECT user_id,alias,points FROM mission_profiles WHERE listed=1 ORDER BY points DESC, alias ASC LIMIT 10').bind().all()).results;
   let self=null;if(own?.listed){const above=await db.prepare('SELECT COUNT(*) AS count FROM mission_profiles WHERE listed=1 AND points>?').bind(own.points).first();self={alias:own.alias,points:own.points,rank:above.count+1};}
   return reply({rows:rows.map((r,i)=>({alias:r.alias,points:r.points,self:r.user_id===user.id,rank:rows.findIndex(x=>x.points===r.points)+1})),self,demo:false,note:'Participation points only; no health details or game performance are published.'});
  }
  const alias='Bird-'+user.id.replaceAll('-','').slice(0,8);
  await db.prepare('INSERT OR IGNORE INTO mission_profiles (user_id,state,revision,points,listed,alias) VALUES (?,?,0,0,0,?)').bind(user.id,JSON.stringify(newMission()),alias).run();
  if(url.pathname==='/api/mission/state'&&request.method==='GET'){
   const row=await db.prepare('SELECT state FROM mission_profiles WHERE user_id=?').bind(user.id).first();return reply({state:JSON.parse(row.state),alias:JSON.parse(row.state).birdName||alias,admin});
  }
  if(url.pathname!=='/api/mission/action'||request.method!=='POST')return reply({error:'Unknown mission route.'},404);
  if(request.headers.get('Origin')!==url.origin)return reply({error:'Use this website to update your mission.'},403);
  const reader=request.body?.getReader();if(!reader)return reply({error:'Send an action.'},400);
  let size=0;const chunks=[];while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>4096){await reader.cancel();return reply({error:'Action too large.'},413);}chunks.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  const action=JSON.parse(new TextDecoder().decode(bytes));
  if(Object.keys(action).some(k=>!['id','type','task','participated','game','run','score','metrics','item','listed','stage','growth','bots','distance','prestige','name'].includes(k)))return reply({error:'Unexpected mission data.'},400);
  if(action.type==='admin'&&!admin)return reply({error:'Admin access required.'},403);
  for(let retry=0;retry<8;retry++){
   const row=await db.prepare('SELECT state,revision FROM mission_profiles WHERE user_id=?').bind(user.id).first();
   let state;try{state=applyMissionAction(JSON.parse(row.state),action,Date.now(),{admin});}catch(error){return reply({error:error.message},400);}
   const result=await db.prepare('UPDATE mission_profiles SET state=?,revision=revision+1,points=?,listed=?,alias=? WHERE user_id=? AND revision=?').bind(JSON.stringify(state),state.rankPoints,state.listed?1:0,state.birdName||alias,user.id,row.revision).run();
   if(result.meta.changes)return reply({state,alias:state.birdName||alias,admin});
  }
  return reply({error:'Mission updated elsewhere. Refresh and retry.'},409);
 }catch{return reply({error:'Mission request failed. Please retry.'},503);}
}
