import {MISSION_ROUTES,missionSectionForPath} from './page-routes.js';
import {MISSION_TASKS,MISSION_SHOP,MISSION_GAMES,GARDEN_STAGES,plantGrowthLevel,newMission,applyMissionAction,missionSummary,missionStats} from './mission-rules.js';
import {api} from './account.js';
import {downscaleJpeg} from './journal-photo.js';
import {mountSpaceGame,planetArt,sampleArt,dockingArt} from './space-games.js';
import {LAYER_ITEMS as SUIT_ITEMS, SOURCE_NOTE, SUIT_SOURCE_URL} from './suit-layers.js';
const node=(tag,text,cls)=>{const e=document.createElement(tag);if(text!=null)e.textContent=text;if(cls)e.className=cls;return e;};
const control=(text,fn,cls)=>{const b=node('button',text,cls);b.type='button';b.onclick=fn;return b;};
export function astronautBird(state,dust=0,stage='healthy'){
 const cap=state.equipped.hat==='cap',crown=state.equipped.hat==='crown',scarf=state.equipped.gear==='scarf',pack=state.equipped.gear==='pack';
 const tired=stage!=='healthy',low=stage==='needs-care';
 return `<svg class="astro-bird bird-${stage}" viewBox="0 0 360 320" role="img" aria-label="Pip, a round white bird with a tiny eye, pointed beak and stick feet inside an astronaut helmet. ${stage==='needs-care'?'Needs care':stage}.${dust?(dust>3?' Dust on the helmet and a drifting dust cloud.':' Dust on the helmet.'):''}"><defs><radialGradient id="bird-glass"><stop stop-color="#b8e9f5" stop-opacity=".02"/><stop offset="1" stop-color="#b8e9f5" stop-opacity=".22"/></radialGradient></defs><ellipse cx="177" cy="286" rx="90" ry="10" fill="#151b32" opacity=".24"/><g class="bird-body">${pack?'<rect x="60" y="165" width="45" height="65" rx="13" fill="#6eb7ac" stroke="#263040" stroke-width="4"/>':''}<path d="M153 241v35m-15 9 15-9 14 7m37-42v35m-14 8 14-8 15 9" stroke="#202738" stroke-width="5" stroke-linecap="round" fill="none"/><circle cx="178" cy="143" r="115" fill="#ecf6fb" stroke="#485e75" stroke-width="5"/><circle cx="178" cy="143" r="101" fill="#adc9d6"/><g transform="translate(0 ${low?9:tired?4:0})"><path d="M94 165C84 137 88 102 111 78C130 57 164 51 191 59C223 61 243 83 249 111C258 141 252 176 234 195C217 220 191 231 160 228C129 232 106 210 96 190Z" fill="${low?'#e3e2df':'#fffef5'}" stroke="#252833" stroke-width="4" stroke-linejoin="round"/><path d="m248 119 43 21-42 16" fill="#fff7de" stroke="#252833" stroke-width="4" stroke-linejoin="round"/><g class="bird-eye-default">${tired?'<path d="M172 139q8 7 16 0" fill="none" stroke="#20222b" stroke-width="5" stroke-linecap="round"/>':'<ellipse cx="178" cy="139" rx="7.5" ry="8.5" fill="#20222b"/><circle cx="175.5" cy="135.5" r="2.2" fill="white"/>'}</g><path class="bird-eye-happy" d="m169 142 9-10 9 10" fill="none" stroke="#20222b" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/><path class="bird-eye-dizzy" d="M178 139c-3-4-8 0-5 4 5 7 14 0 11-7-4-12-23-8-23 5 0 11 13 17 23 11" fill="none" stroke="#353049" stroke-width="3" stroke-linecap="round"/>${low?'<path d="m119 80-6-12m17 7-1-15" stroke="#252833" stroke-width="3" stroke-linecap="round"/>':''}${cap?'<g class="bird-cap"><path d="M110 83C119 54 142 43 169 48C193 50 210 63 215 82Q165 68 110 83Z" fill="#539e98" stroke="#285970" stroke-width="3" stroke-linejoin="round"/><path d="M157 49Q174 58 178 76" fill="none" stroke="#8cc5ba" stroke-width="2"/><path d="M112 83Q163 69 212 82L233 91Q204 98 181 86Q148 77 112 87Z" fill="#397f80" stroke="#285970" stroke-width="3" stroke-linejoin="round"/></g>':''}${crown?'<g class="bird-crown" transform="rotate(-5 170 64)"><path d="M132 70 127 43 149 54 165 30 181 53 204 40 202 70Q169 60 132 70Z" fill="#f2bd58" stroke="#a87837" stroke-width="3" stroke-linejoin="round"/><path d="M132 66Q167 56 202 66L201 75Q168 65 133 75Z" fill="#e3a843" stroke="#a87837" stroke-width="2"/><path d="m164 51 5 6-5 6-5-6z" fill="#b584bf"/><circle cx="144" cy="66" r="2" fill="#fff0b4"/><circle cx="188" cy="65" r="2" fill="#fff0b4"/></g>':''}</g><circle cx="178" cy="143" r="101" fill="url(#bird-glass)" stroke="#c6e6ec" stroke-width="3"/><path d="M96 107q17-45 64-52" fill="none" stroke="white" stroke-width="8" stroke-linecap="round" opacity=".65"/><path d="M114 235q64 28 128-2" fill="none" stroke="#536986" stroke-width="15" stroke-linecap="round"/>${scarf?'<path d="M119 238q59 25 116-2l-3 16q-55 23-111-1z" fill="#e38d83"/><path d="m214 249 15 31 14-8-15-28" fill="#e38d83"/>':''}${dustCloud(dust)}</g><path d="m40 89 4-9 4 9 9 4-9 4-4 9-4-9-9-4zm270 119 3-7 3 7 7 3-7 3-3 7-3-7-7-3z" fill="#d7bfe8"/></svg>`;
}
function dustCloud(amount){
 if(!amount)return '';const count=30;
 const helmet=`<g class="helmet-dust" aria-hidden="true" fill="#aa9579" fill-opacity=".3" stroke="#86745e" stroke-width="1.4" stroke-linecap="round"><path d="M101 116q-10 17-5 36 8 5 11-5-5-12 4-27zM127 74q17-9 30-4l-2 10q-14-3-24 7zM221 193q-11 13-22 13l4 9q20-2 24-17z"/><path d="m101 127 5-4m-6 18 3 2m35-64 5-2m69 126 5-4" fill="none"/>${amount>3?'<path d="M235 95q15 18 12 31l-10 1q2-18-11-24zM111 182q7 18 25 24l5-9q-17-7-19-20z"/><path d="m240 112 3 5m-121 73 4 6m-20-34 5 2m112-73 4 3" fill="none"/>':''}</g>`;
 if(amount<=3)return helmet;
 return helmet+`<g class="pip-dust" aria-hidden="true" opacity="${amount>3?.85:.6}"><g fill="#b4a28c" fill-opacity=".24" stroke="#8c7b67" stroke-width="1.5" stroke-linecap="round"><path d="M71 276c-30 8-48-8-36-24-18-14-4-36 14-31 0-19 29-26 40-12m-33 26c-17-3-21 14-10 19m8 23c13-10 25-1 20 8"/><path d="M260 279c28 15 57 2 51-16 24-8 15-33-3-34 8-20-17-35-33-22m16 31c18-4 26 11 15 22m-42 9c17-14 31-1 22 11"/><path d="M73 285q29-18 53 3m103-1q19-16 38 0" fill="none"/></g><g class="dust-specks" fill="#c3af94" stroke="#2d2928" stroke-width=".7">${Array.from({length:count},(_,i)=>{const x=i%2?270+(i*17)%60:25+(i*13)%57,y=170+(i*31)%119;return `<path d="m${x} ${y} 3 -2 2 4 -3 1z"/>`;}).join('')}</g><g stroke="#b9a78f" stroke-width="1.6" fill="none" stroke-linecap="round"><path d="m40 188-6-4m22 20 5-5m234-20 5-3m13 33 5 2M88 264l-6 3m186-4 6 4"/></g></g>`;
}
export function pottedPlant(level,index){
 const names=['Moon mint','Orbit basil','Solar daisy','Comet cosmos','Lunar lavender','Mars marigold'];
 const colors=['#bc8b75','#91b7a6','#d8b476','#aaa1c8','#8eaebb','#cb9384'],greens=['#77b995','#8fb66b','#699c7b','#76a68f','#92b5ab','#86a06b'];
 const leaf=(x,y,flip=false)=>`<g transform="translate(${x} ${y}) scale(${flip?-1:1} 1)"><path d="${index===4?'M0 0Q14-18 27-14Q19 0 0 0':index===3?'M0 0 12-18 9-4 26-15 17-1 32-3 17 5Z':index===0?'M0 0 3-10 8-9 11-17 17-15 23-18 26-11 23-4 15 2 6 4Z':'M0 0C4-22 29-27 31-16C33-5 14 9 0 0'}" fill="${greens[index]}" stroke="#365e4c" stroke-width="1.3"/><path d="M1 0 23-12" fill="none" stroke="#d1e4bb" stroke-width="1" opacity=".65"/></g>`;
 const flower=(x,y,scale=1)=>{
  let art='';
  if(index===0)art=Array.from({length:5},(_,j)=>`<g transform="translate(${j%2?5:-5} ${-j*5})"><circle r="5" fill="#e5d6f0"/><circle r="1.5" fill="#ae8bb9"/></g>`).join('');
  if(index===1)art=Array.from({length:4},(_,j)=>`<g transform="translate(0 ${-j*7})"><path d="M0 0Q-12-12-8-13Q0-15 0-3Q3-17 10-12Q14-6 0 0" fill="#fff2da" stroke="#c2aa85" stroke-width=".8"/></g>`).join('');
  if(index===2)art=Array.from({length:12},(_,j)=>`<ellipse cy="-14" rx="4.3" ry="13" fill="${j%2?'#fff5cf':'#fffdf0'}" stroke="#d7c7a0" stroke-width=".7" transform="rotate(${j*30})"/>`).join('')+'<circle r="9" fill="#e2ac47"/><g fill="#9c6b34"><circle cx="-3" cy="-2" r="1.2"/><circle cx="3" cy="1" r="1.2"/><circle cy="4" r="1"/></g>';
  if(index===3)art=Array.from({length:8},(_,j)=>`<path d="M-3 0C-12-10-14-25-7-24L-3-22 0-25 4-22 8-24C15-17 10-5 3 0" fill="${j%2?'#e9a2b8':'#d982a7'}" stroke="#b56b8d" stroke-width=".7" transform="rotate(${j*45})"/>`).join('')+'<circle r="6" fill="#f5d377"/><circle r="2.5" fill="#bb8347"/>';
  if(index===4)art=Array.from({length:6},(_,j)=>`<g transform="translate(0 ${-j*6})"><ellipse cx="-4" rx="5" ry="4" transform="rotate(25 -4 0)" fill="#b6a1df"/><ellipse cx="4" rx="5" ry="4" transform="rotate(-25 4 0)" fill="#d5bced"/><path d="m-1 2 1 3 2-3" fill="#787ea9"/></g>`).join('')+'<ellipse cy="-36" rx="4" ry="6" fill="#c8b4e7"/>';
  if(index===5)art=[{n:14,r:18,s:8,c:'#e89a43'},{n:11,r:12,s:7,c:'#f3b94d'},{n:7,r:6,s:6,c:'#fbd475'}].map(r=>Array.from({length:r.n},(_,j)=>`<path d="M-4 0Q-10-${r.r} -3-${r.r+r.s}Q0-${r.r+r.s+4} 4-${r.r+r.s}Q11-${r.r} 4 0" transform="rotate(${j*360/r.n})" fill="${r.c}" stroke="#cb893d" stroke-width=".6"/>`).join('')).join('')+'<circle r="3" fill="#b67736"/>';
  return `<g transform="translate(${x} ${y}) scale(${scale})">${art}</g>`;
 };
 let plant='';
 if(level>1){
  const top=level===2?102:index===4?69:index<2?72:49;
  plant=`<path d="M90 136Q${index%2?99:81} 102 90 ${top}" fill="none" stroke="#426b51" stroke-width="3.5" stroke-linecap="round"/>${leaf(90,120,true)}${leaf(90,111)}`;
  if(level>=3)plant+=leaf(89,98,true)+leaf(91,88);
  if(level>=4)plant+=`<path d="M88 132Q67 105 63 83M92 131Q115 110 117 86" fill="none" stroke="#547b60" stroke-width="2.5"/>${leaf(67,107,true)}${leaf(114,109)}`;
  const bud=(x,y)=>`<g transform="translate(${x} ${y})"><ellipse cy="-4" rx="5" ry="8" fill="${['#d3b5e4','#eee1bb','#edce83','#d98da8','#b39bd8','#efb34c'][index]}" stroke="#618167" stroke-width="1.3"/><path d="m-5-1 5 4 5-4" fill="#729a73"/></g>`;
  if(level===5)plant+=bud(90,top);
  if(level===6)plant+=flower(90,top,.72);
  if(level===5||level===6)plant+=bud(63,83)+bud(117,86);
  if(level===7)plant+=flower(90,top)+flower(63,83,[0,1,4].includes(index)?.72:.5)+flower(117,86,[0,1,4].includes(index)?.7:.48);
  const size=[0,0,.55,.65,.82,.94,1,1][level];plant=`<g transform="translate(90 136) scale(${size}) translate(-90 -136)">${plant}</g>`;
 }else if(level===1)plant='<ellipse cx="90" cy="131" rx="8" ry="5" fill="#c7aa77" stroke="#806849"/><path d="m90 128-2 4 4 3m-2-4q-3-12 3-16" fill="none" stroke="#8bb67a" stroke-width="2.5" stroke-linecap="round"/>';
 else plant='<path d="m76 133 4-2m17 6 3-2m11-3 2 1" stroke="#a8936f" stroke-width="2"/>';
 const patterns=['<path d="m56 159 7 5 7-5m38 3 7 5 7-5"/>','<path d="M57 157v22m66-22v22"/>','<circle cx="61" cy="165" r="3"/><circle cx="119" cy="165" r="3"/>','<path d="m59 160 4 6-4 6-4-6zm58 0 4 6-4 6-4-6z"/>','<path d="m57 161 6 8 6-8m42 0 6 8 6-8"/>','<path d="M55 164h13m44 0h13M56 173h11m46 0h11"/>'];
 return `<svg viewBox="0 0 180 210" role="img" aria-label="${names[index]} · ${GARDEN_STAGES[level]}"><ellipse cx="90" cy="193" rx="57" ry="7" fill="#101d1a" opacity=".25"/><path d="M40 135h100l-12 49q-38 16-76 0z" fill="${colors[index]}" stroke="#4b4b46" stroke-width="2"/><path d="m49 142 10 37q8 4 15 4l-7-41" fill="white" opacity=".12"/><ellipse cx="90" cy="136" rx="50" ry="13" fill="#d3b3a0" stroke="#4b4b46" stroke-width="2"/><ellipse cx="90" cy="135" rx="42" ry="9" fill="#51463a"/>${plant}<path d="M47 141q43 17 86 0v9q-43 16-86 0z" fill="${colors[index]}" stroke="#4b4b46" stroke-width="2"/><g fill="none" stroke="#f6e6ce" stroke-width="2" opacity=".65">${patterns[index]}</g><rect x="75" y="160" width="30" height="18" rx="5" fill="#f3e4cc"/><text x="90" y="173" text-anchor="middle" font-family="sans-serif" font-size="10" fill="#526b5d">${['MM','OB','SD','CC','LL','MA'][index]}</text></svg>`;
}
function rocketBird(state){return `<svg viewBox="0 0 220 130" aria-hidden="true"><g class="rocket-flame"><path d="m62 86-42-13 12 16-21 9 51 9z" fill="#e4ac73"/><path d="m62 88-26 5 25 7" fill="#ffe3a0"/></g><path d="m85 80-17-19 36 13m-19 34-17 16 36-12" fill="#a18aba" stroke="#44435a" stroke-width="2"/><path d="M61 81q62-24 125 13-61 33-125 14z" fill="#edece5" stroke="#44435a" stroke-width="2.5"/><path d="M151 78q23 6 35 16-16 10-34 15" fill="#c8a0a1" stroke="#44435a" stroke-width="2"/><circle cx="125" cy="93" r="11" fill="#8ebbc6" stroke="#506c7a" stroke-width="3"/><path d="M65 84v22" stroke="#77708d" stroke-width="7"/><svg x="77" y="-3" width="91" height="86" viewBox="0 0 360 320">${astronautBird(state,0,'healthy').replace(/<svg[^>]*>|<\/svg>/g,'').replaceAll('bird-glass','rocket-glass')}</svg></svg>`;}
export function wirePet(pet,getSpeech){
 pet.tabIndex=0;pet.setAttribute('role','button');pet.setAttribute('aria-label','Pet Pip. Tap to hop, swipe to pet, or hold and drag to shake.');
 const bird=pet.querySelector('.astro-bird');let pointer=null,holdTimer=null,eyeTimer=null,returnTimer=null,holding=false,moved=false;
 const react=emotion=>{clearTimeout(eyeTimer);pet.classList.remove(emotion==='happy'?'pip-dizzy':'pip-happy');pet.classList.add('pip-'+emotion);eyeTimer=setTimeout(()=>{if(!holding||!pet.isConnected)pet.classList.remove('pip-happy','pip-dizzy');},emotion==='dizzy'?2600:1600);};
 const heart=()=>{const hearts=pet.querySelectorAll('.pet-heart');if(hearts.length>=12)hearts[0].remove();const h=node('span','♡','pet-heart');h.setAttribute('aria-hidden','true');h.style.left=(50+Math.random()*25)+'%';pet.append(h);setTimeout(()=>h.remove(),1400);};
 const play=(swipe)=>{pet.classList.remove('pip-hop','pip-petted');void pet.offsetWidth;pet.classList.add(swipe?'pip-petted':'pip-hop');react('happy');getSpeech().textContent=swipe?'Chirp! Thanks for the helmet scritches.':'Boop! Ready for our next little adventure.';heart();};
 const reset=()=>{clearTimeout(holdTimer);holdTimer=null;if(holding)react(pointer?.dizzy?'dizzy':'happy');if(moved){clearTimeout(returnTimer);pet.classList.add('pip-returning');returnTimer=setTimeout(()=>pet.classList.remove('pip-returning'),1800);}pointer=null;holding=false;moved=false;pet.classList.remove('pip-held');bird.style.transform='';};
 pet.onpointerdown=e=>{
  if(e.button!==0||pointer)return;
  const time=e.timeStamp??performance.now();
  pointer={id:e.pointerId,x:e.clientX,y:e.clientY,sampleX:e.clientX,sampleY:e.clientY,started:time,sampleAt:time,velocity:null,dizzy:false,happy:false,jolts:0,lastJolt:null};moved=false;
  pet.setPointerCapture(e.pointerId);
  holdTimer=setTimeout(()=>{if(!pointer||!pet.isConnected)return;holding=true;pet.classList.remove('pip-hop','pip-petted');pet.classList.add('pip-held');getSpeech().textContent='Got me! Move side to side to give Pip a wiggle.';},400);
 };
 pet.onpointermove=e=>{
  if(!pointer||pointer.id!==e.pointerId)return;
  const dx=e.clientX-pointer.x,dy=e.clientY-pointer.y;
  const time=e.timeStamp??performance.now(),elapsed=time-pointer.sampleAt;
  // Compare velocities over short time windows so event frequency and total distance do not cause dizziness.
  if(elapsed>=24){
   const velocity={x:(e.clientX-pointer.sampleX)/elapsed,y:(e.clientY-pointer.sampleY)/elapsed,interval:elapsed};
   if(pointer.velocity&&elapsed<=120&&time-pointer.started>=350){
    const acceleration=Math.hypot(velocity.x-pointer.velocity.x,velocity.y-pointer.velocity.y)/((elapsed+pointer.velocity.interval)/2);
    if(acceleration>=.055&&Math.hypot(velocity.x,velocity.y)>=1.4&&Math.hypot(e.clientX-pointer.sampleX,e.clientY-pointer.sampleY)>=36){
     if(pointer.lastJolt===null||time-pointer.lastJolt>650)pointer.jolts=0;
     // Require two distinct strong jolts, rather than one small flick or several samples of the same jolt.
     if(pointer.lastJolt===null||time-pointer.lastJolt>=100){pointer.jolts++;pointer.lastJolt=time;}
     if(pointer.jolts>=2){pointer.dizzy=true;react('dizzy');}
    }
   }
   pointer.velocity=elapsed<=120?velocity:null;pointer.sampleAt=time;pointer.sampleX=e.clientX;pointer.sampleY=e.clientY;
  }
  if(!holding&&Math.hypot(dx,dy)>5){clearTimeout(holdTimer);holding=true;pet.classList.remove('pip-hop','pip-petted');pet.classList.add('pip-held');}
  if(holding){moved=true;if(!pointer.dizzy&&!pointer.happy){pointer.happy=true;react('happy');}bird.style.transform='translate('+dx+'px,'+dy+'px) rotate('+Math.max(-18,Math.min(18,dx*.12))+'deg)';getSpeech().textContent=pointer.dizzy?'Whoooa! The stars are spinning!':'Wheee! A little zero-gravity wiggle!';}
 };
 pet.onpointerup=e=>{
  if(!pointer||pointer.id!==e.pointerId)return;
  const swipe=Math.hypot(e.clientX-pointer.x,e.clientY-pointer.y)>25,wasHolding=holding,wasMoved=moved,wasDizzy=pointer.dizzy;
  reset();if(pet.hasPointerCapture(e.pointerId))pet.releasePointerCapture(e.pointerId);
  if(wasHolding){getSpeech().textContent=wasDizzy?'Whoooa! Give me a moment to find my space legs.':wasMoved?'Whew! Back on my little feet.':'Chirp! Ready for another boop.';heart();}else play(swipe);
 };
 pet.onpointercancel=reset;pet.onlostpointercapture=reset;pet.onblur=reset;
 pet.oncontextmenu=e=>e.preventDefault();pet.ondragstart=e=>e.preventDefault();
 pet.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();play(false);}};
}
function dialogClose(dialog,close){const bar=node('div',null,'dialog-corner-bar'),button=control('×',close,'dialog-corner-close');button.setAttribute('aria-label','Close dialog');bar.append(button);dialog.prepend(bar);}
function celebrateTask(task){
 if(!task)return;document.querySelector('.task-celebration')?.remove();const overlay=node('div',null,'task-celebration'),message=node('div',null,'task-celebration-message');message.setAttribute('role','status');message.append(node('strong','Check-in complete!'),node('span',task.name+' · +'+task.fuel+' fuel'));overlay.append(message);
 const colors=['#d5bdf0','#b5d4b0','#efbd88','#a9cbdc','#e7a9bc'];for(let i=0;i<38;i++){const piece=node('i');piece.setAttribute('aria-hidden','true');piece.style.cssText='--x:'+((i*37)%100)+'vw;--drift:'+((i%2?1:-1)*(25+i%6*12))+'px;--delay:'+(i%7*.045)+'s;--spin:'+(i%2?560:-480)+'deg;background:'+colors[i%colors.length];overlay.append(piece);}document.body.append(overlay);setTimeout(()=>overlay.remove(),2200);
}
export function initializeMission({onNavigate=()=>{}}={}){
 const root=document.getElementById('mission');if(!root)return;
 const css=document.createElement('link');css.rel='stylesheet';css.href='./mission.css';document.head.append(css);
 let state=newMission(),user=null,admin=false,alias='',busy=false,section=missionSectionForPath(location.pathname)||'care',generation=0,gameCleanup=null;
 try{const saved=JSON.parse(localStorage.getItem('crewsafety-mission-guest')||'null');if(saved?.version===1&&Array.isArray(saved.actions))state=saved;}catch{}
 const status=node('p','Your next small step starts here.','mission-message');status.setAttribute('role','status');
 const main=node('div',null,'mission-content');root.append(status,main);
 async function act(action){
  if(busy)throw Error('One moment—your last action is saving.');busy=true;const run=generation,freshTask=action.type==='task'&&!missionSummary(state).done.includes(action.task);
  try{
   action={...action,id:action.id||crypto.randomUUID()};let next;
   if(user){const result=await api('/api/mission/action','POST',action);next=result.state;alias=result.alias;admin=result.admin===true;}
   else{next=applyMissionAction(state,action);localStorage.setItem('crewsafety-mission-guest',JSON.stringify(next));}
   if(run!==generation)throw Error('Account changed. Reload your mission.');state=next;if(freshTask&&missionSummary(state).done.includes(action.task))celebrateTask(MISSION_TASKS.find(t=>t.id===action.task));return state;
  }finally{busy=false;}
 }
 function tell(message){status.textContent=message;}
 async function doAction(action,message){try{await act(action);tell(message);render();}catch(e){tell(e.message);}}
 async function refreshUser(next){
  generation++;gameCleanup?.();gameCleanup=null;user=next;admin=false;alias='';
  if(!user){try{state=JSON.parse(localStorage.getItem('crewsafety-mission-guest'))||newMission();}catch{state=newMission();}render();return;}
  const run=generation;try{const data=await api('/api/mission/state');if(run!==generation)return;state=data.state;alias=data.alias;admin=data.admin===true;tell('Mission synced. Your private check-in answers stay on this device.');render();}catch(e){state=newMission();render();tell(e.message);}
 }
 window.addEventListener('crew-account-change',e=>refreshUser(e.detail));
 api('/api/auth/me').then(data=>{if(data.user&&!user)refreshUser(data.user);}).catch(()=>{});
 let careQueue=Promise.resolve();
 window.addEventListener('crew-care-completed',e=>{if(!MISSION_TASKS.some(t=>t.id===e.detail))return;const accountGeneration=generation;careQueue=careQueue.then(async()=>{if(accountGeneration!==generation)return;await doAction({type:'task',task:e.detail,participated:true},'Care logged. Pip appreciates you showing up.');});});
 const tabs=[['care','Daily care'],['games','Flight deck'],['garden','Space garden'],['shop','Outfitters'],['board','Crew rankings']];
 function editableNumber(field,label,value){
  const edit=control(String(value),()=>editAdminValue(field,label,value),'mission-value-edit');edit.setAttribute('aria-label',`Edit ${label.toLowerCase()}: ${value}`);edit.title='Click to edit';return edit;
 }
 function editAdminValue(field,label,value){
  if(!admin||!user)return;
  const accountGeneration=generation,dialog=node('dialog',null,'mission-dialog'),form=node('form'),input=node('input'),caption=node('label',label),error=node('p'),save=node('button','Save','mission-primary');
  input.type='number';input.min='0';input.max='1000000000';input.step='1';input.required=true;input.value=String(value);caption.append(input);save.type='submit';error.setAttribute('role','status');form.append(node('h2','Edit '+label.toLowerCase()),caption,error,save);
  form.onsubmit=async e=>{e.preventDefault();if(!form.reportValidity())return;if(accountGeneration!==generation||!admin||!user){error.textContent='Your account changed. Close this editor and sign in again.';return;}save.disabled=true;try{await act({type:'admin',[field]:input.valueAsNumber});dialog.close();tell(label+' updated.');render();}catch(e){error.textContent=e.message;save.disabled=false;}};
  dialog.append(form);dialogClose(dialog,()=>dialog.close());dialog.onclose=()=>dialog.remove();document.body.append(dialog);dialog.showModal();input.focus();input.select();
 }
 function render(){
  const info=missionSummary(state);main.replaceChildren();const navName=document.querySelector('[data-tab=mission] span');if(navName)navName.textContent='Mission · '+(state.birdName||'Pip');
  const bar=node('div',null,'mission-topline');bar.append(node('span',`STATION DAY ${info.day} · UTC`),node('span',user?`Synced · ${alias}`:'Guest flight · saved on this device'));main.append(bar);
  const hero=node('div',null,'mission-hero'),pet=node('div',null,'mission-pet');const stage=admin&&state.birdStage&&state.birdStage!=='auto'?state.birdStage:info.dust>=4?'needs-care':info.dust>0?'tired':'healthy';const dust=admin&&state.birdStage&&state.birdStage!=='auto'?({healthy:0,tired:3,'needs-care':7})[stage]:info.dust;pet.innerHTML=astronautBird(state,dust,stage);wirePet(pet,()=>speech);pet.setAttribute('aria-label','Pet '+(state.birdName||'Pip')+'. Tap or drag to play.');pet.querySelector('.astro-bird').setAttribute('aria-label',(state.birdName||'Pip')+', your astronaut bird. '+stage);
  const speech=node('p',stage==='needs-care'?'A quiet day for '+(state.birdName||'Pip')+'. A little care goes a long way.':stage==='tired'?'A little space dust. Any check-in will brighten '+(state.birdName||'Pip')+'’s day.':'Hey, crewmate. One small step is plenty.','bird-speech');pet.append(speech,node('small','Tap to hop · drag to float · shake side to side','pet-hint'));
  const intro=node('div',null,'mission-intro');intro.append(node('p',(state.birdName||'Pip')+'’s expedition / '+(state.prestige+1),'mission-kicker'),node('h2','A little care.\nA whole universe.'),node('p','Take care of yourself. Help your little explorer reach Mars. Every honest check-in counts.','mission-description'));
  const stats=node('div',null,'mission-wallet');for(const [name,value,icon]of[['Flight fuel',state.fuel,'✦'],['Shop stars',admin?'∞':state.coins,'✧'],['Mission streak',`${info.streak} d`,'☄']]){const box=node('div');const number=node('strong');number.append(admin&&name==='Flight fuel'?editableNumber('fuel','Flight fuel',state.fuel):document.createTextNode(String(value)));box.append(node('span',icon),number,node('small',name));stats.append(box);}intro.append(stats);
  intro.append(control('Rename '+(state.birdName||'Pip'),renameBird,'mission-link'));hero.append(intro,pet);main.append(hero);
  const journey=node('div',null,'mission-journey');journey.append(node('span','◉ Earth'),node('strong',`${info.percent}% to Mars · Expedition ${state.prestige+1}`),node('span','Mars ◉'));
  const progress=document.createElement('progress');progress.max=1000;progress.value=state.distance;progress.setAttribute('aria-label','Journey to Mars');progress.className='journey-accessible-progress';journey.append(progress);const route=node('div',null,'rocket-route');route.style.setProperty('--journey',String(info.percent)+'%');route.innerHTML='<span class="route-earth" aria-hidden="true"></span><div class="route-track"><span class="route-trail"></span><div class="rocket-rider">'+rocketBird(state)+'</div></div><span class="route-mars" aria-hidden="true"></span>';journey.append(route);
  journey.append(node('small',`Care tasks move your ship. ${state.prestige?`Prestige boost +${Math.min(state.prestige,5)*5}% distance.`:'1,000 distance to your first landing.'}`));
  if(state.distance>=1000)journey.append(control('Land on Mars & start a new expedition',()=>doAction({type:'prestige'},'Mars landing celebrated! Your outfits, stars and garden stay. Travel boost unlocked.'),'mission-primary'));
  main.append(journey);
  if(admin)renderAdmin(main);
  const nav=node('div',null,'mission-tabs');nav.setAttribute('aria-label','Mission sections');for(const [id,label]of tabs){const b=node('a',label);b.href=MISSION_ROUTES[id];b.onclick=event=>{if(event.ctrlKey||event.metaKey||event.shiftKey||event.altKey||event.button>0)return;event.preventDefault();section=id;render();onNavigate(MISSION_ROUTES[id]);};b.classList.toggle('selected',section===id);if(section===id)b.setAttribute('aria-current','page');nav.append(b);}main.append(nav);
  const content=node('div',null,'mission-section');main.append(content);
  if(section==='care')renderCare(content,info);if(section==='games')renderGames(content,info);if(section==='garden')renderGarden(content);if(section==='shop')renderShop(content);if(section==='board')renderBoard(content);
  main.append(node('p','Participation powers the mission. No points depend on a positive mood, a perfect suit inspection, physical ability, or a high game score.','mission-footnote'));
 }
 function renameBird(){
  const dialog=document.createElement('dialog');dialog.className='mission-dialog';const form=node('form'),label=node('label','Bird name'),input=node('input'),error=node('p');input.value=state.birdName||'Pip';input.maxLength=24;input.required=true;label.append(input);const save=node('button','Save name','mission-primary');save.type='submit';error.setAttribute('role','status');form.append(node('h2','Name your explorer'),label,node('p','Your bird name will appear on the public leaderboard if you join it. Use a nickname.'),error,save);form.onsubmit=async e=>{e.preventDefault();save.disabled=true;try{await act({type:'rename',name:input.value});dialog.close();render();}catch(e){error.textContent=e.message;save.disabled=false;}};dialog.append(form);dialogClose(dialog,()=>dialog.close());dialog.onclose=()=>dialog.remove();document.body.append(dialog);dialog.showModal();
 }
 function renderAdmin(out){
  const panel=node('section',null,'mission-admin');panel.append(node('h3','Admin simulation'),node('p','Your account has unlimited shop stars. Preview Pip’s care stages and fast-grow your garden. Simulations stay out of public rankings.','mission-muted'));
  const stages=node('div',null,'admin-controls');for(const [id,label]of[['auto','Follow check-ins'],['healthy','Healthy bird'],['tired','Tired bird'],['needs-care','Needs care']]){const b=control(label,()=>doAction({type:'admin',stage:id},'Bird stage updated.'));b.setAttribute('aria-pressed',String((state.birdStage||'auto')===id));stages.append(b);}panel.append(stages);
  const growth=node('div',null,'admin-controls');for(const [label,value]of[['Seed tray',0],['Taking root',2],['Sprouts',4],['Seedlings',6],['Leafy garden',8],['Buds',10],['First blooms',12],['Full bloom',20],['Grow +3',Math.min(100,state.garden+3)]])growth.append(control(label,()=>doAction({type:'admin',growth:value},'Garden simulation updated.')));panel.append(node('p','Garden growth: '+state.garden),growth);const journeyTools=node('div',null,'admin-controls');journeyTools.append(control('+100 journey distance',()=>doAction({type:'admin',distance:Math.min(1000,state.distance+100)},'Journey advanced.')),control('Reach Mars now',()=>doAction({type:'admin',distance:1000},'Mars reached.')),control('Next expedition level',()=>doAction({type:'admin',prestige:Math.min(10000,state.prestige+1)},'Expedition level advanced.')));panel.append(node('p',`Expedition ${state.prestige+1} · ${state.distance} / 1,000 distance`),journeyTools);out.append(panel);
 }
 function renderCare(out,info){
  const head=node('div',null,'mission-section-head');head.append(node('h3','Today’s care orbit'),node('span',`${info.done.length} / ${MISSION_TASKS.length} check-ins`));out.append(head);
  out.append(node('p','Choose what fits your day. Three different check-ins grow your garden. Each task earns fuel once per station day.','mission-muted'));
  const grid=node('div',null,'mission-task-grid');for(const task of MISSION_TASKS){const done=info.done.includes(task.id),card=node('article',null,'mission-task');card.append(node('span',task.icon,'task-icon'),node('h4',task.name),node('p',task.hint));const b=control(done?'✓ Logged today':`Check in · +${task.fuel} fuel`,()=>taskDialog(task),done?'task-done':'');b.disabled=done;card.append(b);grid.append(card);}out.append(grid);if(user)out.append(control('View saved photo check-ins in Journal',()=>document.querySelector('[data-tab=journal]').click(),'mission-link'));
  try {
   const notes=JSON.parse(localStorage.getItem('crewsafety-mission-notes-'+(user?.username||'guest'))||'[]');
   if(notes.length){const details=node('details'),summary=node('summary','Recent mission notes · this device only');details.append(summary);for(const entry of notes.slice(0,14)){const label=MISSION_TASKS.find(t=>t.id===entry.task)?.name||'Check-in';details.append(node('p',`${new Date(entry.at).toLocaleString()} · ${label}: ${entry.answers.join(' · ')||'Photo check-in saved in Journal'}`));}out.append(details);}
  }catch{}
  if(!user)out.append(control('Sign in to sync across your iPhone and website',()=>document.getElementById('account-button').click(),'mission-link'));
 }
 function taskDialog(task){
  const dialog=document.createElement('dialog');dialog.className='mission-dialog';const form=node('form');form.append(node('h2',task.name),node('p',task.hint));let previewURL=null,photoInput=null,savedPhotoEntry=null,photoUploaded=false;
  const field=(label,type='text',options=null)=>{const l=node('label',label);let input;if(options){input=node('select');input.append(new Option('Choose a response',''));for(const o of options)input.append(new Option(o,o));}else{input=node(type==='textarea'?'textarea':'input');if(type!=='textarea')input.type=type;}input.required=true;if(type==='textarea'){input.maxLength=1000;input.rows=3;}l.append(input);form.append(l);return input;};
  if(task.id==='health') {field('How does your body feel today?','text',['Comfortable','Something to note','Prefer not to say']);field('What would support you today?','text',['Usual routine','Rest or adapted activity','Talk with a crewmate','Prefer not to say']);}
  if(task.id==='wellness')field('Your state of mind right now','text',['Upbeat','Steady','Mixed','Low','Prefer not to say']);
  if(task.id==='exercise')field('What did you participate in?','text',['Workout','Gentle mobility','Adapted movement','Planned rest / recovery']);
  if(task.id==='meal'){field('Meal type','text',['Breakfast','Lunch','Dinner','Snack']);field('A brief meal or nutrition note','textarea');}
  if(task.id==='journal')field('One thing you noticed today','textarea');
  if(task.id==='suit'){form.append(node('p','Training record only. Follow your approved suit procedures; this does not certify readiness. A concern earns the same fuel as a pass.','mission-muted'));form.append(node('p',SOURCE_NOTE,'mission-muted'));const source=node('a','NASA: how spacesuits work');source.href=SUIT_SOURCE_URL;source.target='_blank';source.rel='noopener';form.append(source);for(const item of SUIT_ITEMS){field(item.name,'text',['Checked — no concern','Checked — concern to report','Not accessible / not checked']);form.append(node('small',item.inspect,'mission-muted'));}}
  if(task.id==='photo'){const input=field('Choose a daily check-in photo','file');photoInput=input;input.accept='image/*';const preview=node('img');preview.className='mission-photo';preview.alt='Your local photo preview';preview.hidden=true;form.append(preview);input.onchange=()=>{if(previewURL)URL.revokeObjectURL(previewURL);const f=input.files[0];if(f&&!f.type.startsWith('image/')){input.value='';return;}if(f){previewURL=URL.createObjectURL(f);preview.src=previewURL;preview.hidden=false;}};form.append(node('p','Your photo is resized, saved privately to your signed-in account, and available in Journal. You can delete it there. Server storage is not encrypted.','mission-muted'));}
  form.append(node('p','Completion syncs across devices. Written check-in notes stay on this device. Photo check-ins are saved to your account Journal.','mission-muted'));
  const message=node('p');message.setAttribute('role','status');const save=node('button',`Log participation · +${task.fuel} fuel`,'mission-primary');save.type='submit';
  if(task.id==='photo'&&!user){save.disabled=true;form.append(node('p','Sign in before saving a photo check-in.'),control('Sign in',()=>{dialog.close();document.getElementById('account-button').click();}));}
  form.append(message,save,control('Not now',()=>dialog.close()));form.onsubmit=async e=>{e.preventDefault();save.disabled=true;try{
    if(task.id==='photo'){
     if(!user)throw Error('Sign in to save your photo.');
     if(!photoUploaded){const prepared=await downscaleJpeg(photoInput.files[0]);if(!savedPhotoEntry){const saved=await api('/api/journal/entries','POST',{body:'Daily photo check-in'});savedPhotoEntry=saved.entry.id;}await api('/api/journal/entries/'+savedPhotoEntry+'/photo','PUT',{image:prepared.image,width:prepared.width,height:prepared.height});photoUploaded=true;window.dispatchEvent(new Event('crew-journal-updated'));}
    }
    const key='crewsafety-mission-notes-'+(user?.username||'guest');const notes=JSON.parse(localStorage.getItem(key)||'[]');const answers=[...form.querySelectorAll('select,textarea')].map(x=>x.value);localStorage.setItem(key,JSON.stringify([{task:task.id,at:Date.now(),answers},...notes].slice(0,100)));
    await act({type:'task',task:task.id,participated:true});dialog.close();tell(`+${task.fuel} flight fuel. Thanks for showing up.`);render();
   }catch(error){message.textContent=error.message;save.disabled=false;}};
  dialog.append(form);dialogClose(dialog,()=>dialog.close());document.body.append(dialog);dialog.onclose=()=>{if(previewURL)URL.revokeObjectURL(previewURL);dialog.remove();};dialog.showModal();
 }
 function renderGarden(out){
  const stage=missionSummary(state).gardenStage;out.append(node('h3','Your small corner of green'),node('p',`${stage} · ${state.garden} growth. Three different care tasks in a station day nurture your garden.`,'mission-muted'));
  const garden=node('div',null,'space-garden');const names=['Moon mint','Orbit basil','Solar daisy','Comet cosmos','Lunar lavender','Mars marigold'];for(let i=0;i<6;i++){const level=plantGrowthLevel(state.garden,i),pot=node('figure',null,'garden-pot'),art=node('div',null,'garden-art');art.innerHTML=pottedPlant(level,i);const caption=node('figcaption');caption.append(node('strong',names[i]),node('small',GARDEN_STAGES[level]));pot.append(art,caption);garden.append(pot);}out.append(garden);
  out.append(node('p','Plants wait for you. Missed days never remove growth.','mission-muted'));
 }
 function renderShop(out){
  out.append(node('h3','Outfitters'),node('p',`${admin?'Unlimited':state.coins} shop stars · cosmetic gear and a garden-only boost. Earn 15 stars for participating in a flight.`,'mission-muted'));
  const grid=node('div',null,'mission-task-grid');for(const item of MISSION_SHOP){const owned=state.owned.includes(item.id),equipped=state.equipped[item.slot]===item.id;const card=node('article',null,'mission-task');card.append(node('span',item.icon,'shop-icon'),node('h4',item.name),node('p',item.description));const b=control(owned?(item.slot==='buff'?'Boost active':equipped?'Unequip':'Wear it'):`Unlock · ${item.cost} stars`,()=>doAction({type:owned?'equip':'buy',item:item.id},owned?'Outfit updated.':'Accessory unlocked!'));b.disabled=owned?item.slot==='buff':!admin&&state.coins<item.cost;card.append(b);grid.append(card);}out.append(grid);
 }
 async function renderBoard(out){
  out.append(node('h3','Crew participation rankings'),node('p','20 ranking points per completed flight, whatever the game score. Up to six rewarded flights per UTC day. Public aliases never show wellness answers.','mission-muted'));
  if(admin){out.append(control(state.demoBots?'Remove demo bots':'Fill with demo bots',()=>doAction({type:'admin',bots:!state.demoBots},state.demoBots?'Real rankings restored.':'Demo leaderboard populated.')));out.append(node('p',state.demoBots?'DEMO SIMULATION · fictional bots, visible only to your admin account.':'Admin simulation accounts do not enter public rankings.','mission-muted'));}
  if(!user){out.append(node('p','Guest practice does not enter the global rankings.'),control('Sign in to join',()=>document.getElementById('account-button').click(),'mission-primary'));return;}
  const ownPoints=node('p');ownPoints.append(node('span',alias+' · '),admin?editableNumber('points','Leaderboard points',state.rankPoints):document.createTextNode(String(state.rankPoints)),document.createTextNode(' participation points'));out.append(ownPoints);if(!admin)out.append(control(state.listed?'Leave public leaderboard':'Join public leaderboard with my bird name',()=>doAction({type:'listing',listed:!state.listed},state.listed?'Your alias is no longer listed.':'Your bird name and participation points are now visible.')));
  if(admin)out.append(node('p','Click your bird’s points to edit them.','mission-muted'));
  const table=node('table');table.className='mission-ranking';const caption=node('caption','Top 10 participating crewmates');table.append(caption);const header=node('tr');for(const s of ['Rank','Bird','Points'])header.append(node('th',s));const thead=node('thead');thead.append(header);table.append(thead);const body=node('tbody');table.append(body);out.append(table);
  try{const result=await api('/api/mission/leaderboard');if(!out.isConnected)return;if(!result.rows.length)out.append(node('p','No crewmates have opted in yet. Be the first.'));for(const r of result.rows){const tr=node('tr');for(const v of [r.rank,r.alias])tr.append(node('td',String(v)));const points=node('td');points.append(admin&&r.self?editableNumber('points','Leaderboard points',r.points):document.createTextNode(String(r.points)));tr.append(points);body.append(tr);}if(result.self&&!result.rows.some(r=>r.self)){const mine=node('div',null,'personal-rank');const detail=node('p');detail.append(document.createTextNode(`#${result.self.rank} · ${result.self.alias} · `),admin?editableNumber('points','Leaderboard points',result.self.points):document.createTextNode(String(result.self.points)),document.createTextNode(' points'));mine.append(node('strong','Your rank'),detail);out.append(mine);}if(!result.self&&!admin)out.append(node('p','Join the leaderboard to see your personal rank.','mission-muted'));}catch(e){out.append(node('p',e.message));}
 }
 function renderGames(out,info){
  out.append(node('h3','Flight deck'),node('p','Spend 10 fuel. Participate to earn 15 shop stars + 20 ranking points. Scores are personal practice stats, never a cognitive or health assessment.','mission-muted'));
  if(state.pending){out.append(node('p','You have an unfinished flight. Leaving returns its 10 fuel; no rewards are granted.'),control('Leave unfinished flight & return fuel',()=>doAction({type:'cancel'},'Flight fuel returned.')));return;}
  out.append(node('p',`${info.plays} / 6 rewarded flights today · recent average = your last 10 completed games.`, 'mission-muted'));
  const grid=node('div',null,'mission-task-grid');for(const game of MISSION_GAMES){const stats=missionStats(state,game.id),card=node('article',null,'mission-task');const art=node('div',null,'game-preview');art.innerHTML=game.id==='dock'?dockingArt:game.id==='memory'?planetArt('Saturn'):sampleArt('Crystal');card.append(art,node('h4',game.name),node('p',game.description),node('p','Tags: '+game.tags.join(' · '),'game-tags'),node('p',stats.count?`Personal best ${stats.best} · Recent average ${stats.average} / 100`:'Your first game starts your recent average.','mission-muted'),node('small',stats.count?`Last ${stats.count} completed ${stats.count===1?'game':'games'}`:'Up to your last 10 games','mission-muted'));const button=control('Launch · 10 fuel',()=>launch(game),'mission-primary');button.disabled=state.fuel<10||info.plays>=6;card.append(button);grid.append(card);}out.append(grid);
 }
 async function launch(game){
  try{await act({type:'start',game:game.id});}catch(e){tell(e.message);return;}
  const run=state.pending,previous=missionStats(state,game.id),dialog=document.createElement('dialog');dialog.className='mission-dialog mission-game-dialog game-'+game.id;
  const title=node('h2',game.name),stage=node('div',null,'game-stage'),message=node('p','Participation earns the same reward at every score.','game-participation'),close=control('Leave flight · refund fuel',async()=>{try{await act({type:'cancel'});dialog.close();render();}catch(e){message.textContent=e.message;}});
  dialog.append(title,message,stage,close);dialogClose(dialog,()=>{if(close.hidden){dialog.close();render();}else close.click();});document.body.append(dialog);dialog.showModal();const timers=new Set();let finished=false,hasInput=false;
  const later=(fn,ms)=>{const id=setTimeout(()=>{timers.delete(id);if(dialog.open&&!finished)fn();},ms);timers.add(id);};
  const cleanup=()=>{for(const t of timers)clearTimeout(t);timers.clear();dialog.remove();};gameCleanup=cleanup;dialog.oncancel=e=>{e.preventDefault();close.click();};dialog.onclose=cleanup;
  async function finish(score,metrics){
   if(finished||!hasInput)return;finished=true;for(const t of timers)clearTimeout(t);timers.clear();stage.replaceChildren(node('p','Saving your flight…'));close.disabled=true;
   const finishId=crypto.randomUUID();
   const submit=async()=>{try{await act({id:finishId,type:'finish',run:run.id,score,metrics});stage.replaceChildren(node('strong',`${Math.round(score)} / 100`,'game-score'),node('p',`Previous best: ${previous.best??'First flight'} · Recent average before this game: ${previous.average??'First flight'}${previous.count?` (last ${previous.count} ${previous.count===1?'game':'games'})`:''}`),node('p',Object.entries(metrics).map(([k,v])=>`${({reactionMs:'Mean reaction (ms)',consistencyMs:'Reaction spread (ms)',attempts:'Attempts',accuracy:'Accuracy (%)',errors:'Errors'})[k]}: ${Math.round(v)}`).join(' · ')),node('p','+15 shop stars · +20 participation points','mission-reward'),control('Back to flight deck',()=>{dialog.close();render();},'mission-primary'));close.hidden=true;}catch(e){stage.replaceChildren(node('p',e.message),control('Retry saving',submit));close.disabled=false;}};
   const delay=Math.max(0,5100-(Date.now()-run.started));setTimeout(()=>{if(dialog.open)submit();},delay);
  }
  mountSpaceGame(game.id,{stage,later,finish,input:()=>{hasInput=true;}});
 }
 render();
 setInterval(()=>{if(!state.pending&&document.getElementById('mission')?.classList.contains('active'))render();},60000);
 return {refreshUser,getPath:()=>MISSION_ROUTES[section],showPath:path=>{const next=missionSectionForPath(path)||'care';if(section!==next){section=next;render();}}};
}
