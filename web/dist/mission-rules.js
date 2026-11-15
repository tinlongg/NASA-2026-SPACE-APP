// Shared, deterministic rules. The server supplies time and authorizes account actions.
export const MISSION_TASKS = [
 {id:'health',name:'Daily health check-in',fuel:60,icon:'♥',hint:'Notice how your body feels. Every honest response counts.'},
 {id:'suit',name:'Suit layer check',fuel:50,icon:'◉',hint:'A training reflection, never clearance for EVA.'},
 {id:'wellness',name:'Mind & mood check-in',fuel:40,icon:'☀',hint:'Any state of mind earns the same reward.'},
 {id:'exercise',name:'Movement & recovery',fuel:30,icon:'↗',hint:'Log movement, an adapted activity, or planned rest.'},
 {id:'meal',name:'Meal log',fuel:25,icon:'◒',hint:'Record a meal or check in about your nutrition routine.'},
 {id:'photo',name:'Daily photo check-in',fuel:15,icon:'▣',hint:'Save a daily photo to your private account Journal.'},
 {id:'journal',name:'Journal reflection',fuel:10,icon:'✎',hint:'Write a reflection here or in your journal.'}
];
export const MISSION_SHOP=[
 {id:'cap',name:'Orbit cap',cost:30,slot:'hat',icon:'🧢',description:'A teal flight cap for Pip.'},
 {id:'crown',name:'Star crown',cost:90,slot:'hat',icon:'♛',description:'A golden constellation crown.'},
 {id:'scarf',name:'Comet scarf',cost:45,slot:'gear',icon:'🧣',description:'A coral scarf for your explorer.'},
 {id:'pack',name:'Sample pack',cost:60,slot:'gear',icon:'🎒',description:'Room for imaginary moon rocks.'},
 {id:'beanie',name:'Nebula beanie',cost:55,slot:'hat',icon:'◒',description:'A plum knit hat with a tiny star pom-pom.'},
 {id:'antenna',name:'Signal antenna',cost:80,slot:'hat',icon:'⌁',description:'A little teal antenna for receiving cosmic chirps.'},
 {id:'moon-badge',name:'Moon badge',cost:35,slot:'gear',icon:'☾',description:'A crescent mission patch on the suit collar.'},
 {id:'wings',name:'Solar wings',cost:110,slot:'gear',icon:'✧',description:'A pair of golden solar panels for your explorer.'},
 {id:'beret',name:'Comet beret',cost:70,slot:'hat',icon:'◒',description:'A soft blue beret with a tiny comet pin.'},
 {id:'wreath',name:'Lunar leaf wreath',cost:65,slot:'hat',icon:'❧',description:'A ring of moon-green leaves fitted around the head.'},
 {id:'headphones',name:'Mission headphones',cost:95,slot:'hat',icon:'♫',description:'A snug pair of lavender mission headphones.'},
 {id:'bowtie',name:'Starlight bow tie',cost:50,slot:'gear',icon:'⋈',description:'A little plum bow tied to the suit collar.'},
 {id:'star-brooch',name:'Star brooch',cost:45,slot:'gear',icon:'★',description:'A golden star pinned to the collar.'},
 {id:'medal',name:'Explorer medal',cost:85,slot:'gear',icon:'✪',description:'A small expedition medal on a blue ribbon.'},
 {id:'cigarette',name:'Cigarette',cost:65,slot:'gear',icon:'≈',description:'A small cigarette with animated drifting smoke.'},
 {id:'garden',name:'Garden light',cost:75,slot:'buff',icon:'✿',description:'+1 garden growth on each completed daily routine. No change to health or game scoring.'}
];
export const MISSION_GAMES=[{id:'dock',name:'Orbital docking',icon:'◎',description:'Tap when the beacon turns green. Three rounds of timing.',tags:['Reflexes','Timing','Consistency']},{id:'memory',name:'Planet memory',icon:'✦',description:'Match six pairs of planets. Take as many turns as you need.',tags:['Memory','Visual recognition']},{id:'minerals',name:'Sample collector',icon:'◇',description:'Collect minerals and leave hazards alone. Select samples in the salvage window.',tags:['Hazard identification','Attention','Visual search']},{id:'sequence',name:'Signal sequence',icon:'▦',description:'Watch the numbered beacons, then repeat their order. Three growing sequences.',tags:['Working memory','Sequencing','Attention']},{id:'navigator',name:'Orbit navigator',icon:'➤',description:'Plan a safe route to the station. Move one square at a time and avoid debris.',tags:['Spatial planning','Problem solving','Hazard avoidance']}];
export const missionDay=now=>new Date(now).toISOString().slice(0,10);
export const GARDEN_STAGES=['Seed resting','Taking root','First sprout','Seedling','Growing leaves','Budding','First bloom','Full bloom'];
export const plantGrowthLevel=(growth,index)=>Math.min(GARDEN_STAGES.length-1,Math.max(0,Math.floor((growth-index)/2)));
export const missionGap=(a,b)=>Math.round((Date.parse(b+'T00:00:00Z')-Date.parse(a+'T00:00:00Z'))/86400000);
export function newMission(){return {version:1,fuel:0,coins:0,rankPoints:0,distance:0,prestige:0,garden:0,streak:0,lastDay:null,days:{},owned:[],equipped:{},history:[],bests:{},pending:null,actions:[],listed:false};}
export function missionSummary(state,now=Date.now()) {
 const day=missionDay(now), gap=state.lastDay?missionGap(state.lastDay,day):0;
 return {day,done:state.days[day]?.tasks||[],streak:gap>1?0:state.streak,dust:Math.min(7,Math.max(0,gap-1)),percent:Math.min(100,Math.floor(state.distance/10)),gardenStage:GARDEN_STAGES[plantGrowthLevel(state.garden,0)],plays:state.days[day]?.plays||0};
}
export function missionStats(state,game){const runs=state.history.filter(r=>r.game===game).slice(-10),scores=runs.map(r=>r.score);return {count:runs.length,best:state.bests?.[game]??(scores.length?Math.max(...state.history.filter(r=>r.game===game).map(r=>r.score)):null),average:scores.length?Math.round(scores.reduce((a,b)=>a+b,0)/scores.length):null};}
export function applyMissionAction(original,action,now=Date.now(),{admin=false}={}) {
 if(!action||typeof action.id!=='string'||!/^[a-zA-Z0-9-]{8,80}$/.test(action.id)) throw Error('Invalid action identifier.');
 const s=structuredClone(original),day=missionDay(now);
 if(s.actions.includes(action.id)) return s;
 s.days[day]??={tasks:[],plays:0}; const today=s.days[day];
 switch(action.type){
 case 'rename': {
  if(typeof action.name!=='string')throw Error('Enter a bird name.');const name=action.name.trim().replace(/\s+/g,' ');if(!/^[\p{L}\p{N} .’'-]{1,24}$/u.test(name))throw Error('Use 1–24 letters, numbers, spaces, apostrophes or hyphens.');s.birdName=name;break;
 }
 case 'admin': {
   if(!admin)throw Error('Admin access required.');
   if(action.points!==undefined){if(!Number.isInteger(action.points)||action.points<0||action.points>1000000000)throw Error('Choose whole leaderboard points from 0 to 1,000,000,000.');s.rankPoints=action.points;}
   if(action.distance!==undefined){if(!Number.isInteger(action.distance)||action.distance<0||action.distance>1000)throw Error('Choose journey distance from 0 to 1000.');s.distance=action.distance;}
   if(action.prestige!==undefined){if(!Number.isInteger(action.prestige)||action.prestige<0||action.prestige>10000)throw Error('Choose expedition level from 1 to 10001.');s.prestige=action.prestige;}
   if(action.bots!==undefined){if(typeof action.bots!=='boolean')throw Error('Choose demo bot visibility.');s.demoBots=action.bots;}
   if(action.stage!==undefined){if(!['auto','healthy','tired','needs-care'].includes(action.stage))throw Error('Unknown bird stage.');s.birdStage=action.stage;}
   if(action.growth!==undefined){if(!Number.isInteger(action.growth)||action.growth<0||action.growth>100)throw Error('Choose garden growth from 0 to 100.');s.garden=action.growth;}
   break;
 }
 case 'task': {
   const task=MISSION_TASKS.find(t=>t.id===action.task); if(!task||action.participated!==true) throw Error('Complete a check-in first.');
   if(today.tasks.includes(task.id)) return s;
   today.tasks.push(task.id);s.fuel+=task.fuel;s.distance=Math.min(1000,s.distance+Math.round(task.fuel*(1+Math.min(s.prestige,5)*0.05)));
   if(s.lastDay!==day){s.streak=s.lastDay&&missionGap(s.lastDay,day)===1?s.streak+1:1;s.lastDay=day;}
   if(today.tasks.length===3)s.garden+=s.owned.includes('garden')?2:1;
   break;
 }
 case 'start':
   if(!MISSION_GAMES.some(g=>g.id===action.game))throw Error('Unknown game.');
   if(s.pending)throw Error('Finish or leave your current game first.');
   if(today.plays>=6)throw Error('Six rewarded flights completed today. Come back next station day.');
   if(!admin&&s.fuel<10)throw Error('Complete a care task to earn 10 flight fuel.');
   if(!admin)s.fuel-=10;s.pending={id:action.id,game:action.game,started:now};break;
 case 'finish': {
   if(!s.pending||s.pending.id!==action.run)throw Error('This game is no longer active.');
   if(now-s.pending.started<5000)throw Error('Spend a few more seconds in this flight before finishing.');
   if(!Number.isFinite(action.score)||action.score<0||action.score>100)throw Error('Invalid game score.');
   const metrics=action.metrics||{}; if(Object.keys(metrics).some(k=>!['reactionMs','consistencyMs','attempts','accuracy','errors'].includes(k))||Object.values(metrics).some(v=>typeof v!=='number'||!Number.isFinite(v)||v<0||v>100000))throw Error('Invalid game measurements.');
   if(today.plays>=6)throw Error('Daily flight reward limit reached.');
   s.bests??={};s.bests[s.pending.game]=Math.max(s.bests[s.pending.game]??0,Math.round(action.score));
   s.history.push({game:s.pending.game,score:Math.round(action.score),metrics,at:now});s.history=s.history.slice(-90);
   s.pending=null;today.plays++;s.coins+=15;s.rankPoints+=20;break;
 }
 case 'cancel':if(s.pending){s.pending=null;if(!admin)s.fuel+=10;}break;
 case 'buy': {
   const item=MISSION_SHOP.find(i=>i.id===action.item);if(!item)throw Error('Unknown accessory.');
   if(s.owned.includes(item.id))return s;
   if(!admin&&s.coins<item.cost)throw Error('Not enough shop stars yet.');if(!admin)s.coins-=item.cost;s.owned.push(item.id);if(item.slot!=='buff')s.equipped[item.slot]=item.id;break;
 }
 case 'equip': {
   const item=MISSION_SHOP.find(i=>i.id===action.item);if(!item||!s.owned.includes(item.id)||item.slot==='buff')throw Error('Unlock this accessory first.');
   s.equipped[item.slot]=s.equipped[item.slot]===item.id?null:item.id;break;
 }
 case 'prestige':if(s.distance<1000)throw Error('Reach Mars first.');s.prestige++;s.distance=0;break;
 case 'listing':if(admin)throw Error('Admin simulations stay outside public rankings.');if(typeof action.listed!=='boolean')throw Error('Choose leaderboard visibility.');s.listed=action.listed;break;
 default:throw Error('Unknown mission action.');
 }
 if(admin)s.listed=false;
 s.actions=[...s.actions,action.id].slice(-150);
 const days=Object.keys(s.days).sort(); for(const d of days.slice(0,-35))delete s.days[d];
 return s;
}
