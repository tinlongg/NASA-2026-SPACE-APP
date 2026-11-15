import {MISSION_TASKS,MISSION_SHOP,MISSION_GAMES,newMission,applyMissionAction,missionSummary,missionStats} from './mission-rules.js';
import {api} from './account.js';
import {ITEMS as SUIT_ITEMS} from './suit-layers.js';
const node=(tag,text,cls)=>{const e=document.createElement(tag);if(text!=null)e.textContent=text;if(cls)e.className=cls;return e;};
const control=(text,fn,cls)=>{const b=node('button',text,cls);b.type='button';b.onclick=fn;return b;};
export function astronautBird(state,dust=0,stage='healthy'){
 const cap=state.equipped.hat==='cap',crown=state.equipped.hat==='crown',scarf=state.equipped.gear==='scarf',pack=state.equipped.gear==='pack';
 const tired=stage!=='healthy',low=stage==='needs-care';
 return `<svg class="astro-bird bird-${stage}" viewBox="0 0 360 320" role="img" aria-label="Pip, a round white bird with a tiny eye, pointed beak and stick feet inside an astronaut helmet. ${stage==='needs-care'?'Needs care':stage}.${dust?' A drifting dust cloud.':''}"><defs><radialGradient id="bird-glass"><stop stop-color="#b8e9f5" stop-opacity=".02"/><stop offset="1" stop-color="#b8e9f5" stop-opacity=".22"/></radialGradient></defs><ellipse cx="177" cy="286" rx="90" ry="10" fill="#151b32" opacity=".24"/><g class="bird-body">${pack?'<rect x="60" y="165" width="45" height="65" rx="13" fill="#6eb7ac" stroke="#263040" stroke-width="4"/>':''}<path d="M153 241v35m-15 9 15-9 14 7m37-42v35m-14 8 14-8 15 9" stroke="#202738" stroke-width="5" stroke-linecap="round" fill="none"/><circle cx="178" cy="143" r="115" fill="#ecf6fb" stroke="#485e75" stroke-width="5"/><circle cx="178" cy="143" r="101" fill="#adc9d6"/><g transform="translate(0 ${low?9:tired?4:0})"><path d="M94 165C84 137 88 102 111 78C130 57 164 51 191 59C223 61 243 83 249 111C258 141 252 176 234 195C217 220 191 231 160 228C129 232 106 210 96 190Z" fill="${low?'#e3e2df':'#fffef5'}" stroke="#252833" stroke-width="4" stroke-linejoin="round"/><path d="m248 119 43 21-42 16" fill="#fff7de" stroke="#252833" stroke-width="4" stroke-linejoin="round"/>${tired?'<path d="M172 139q8 7 16 0" fill="none" stroke="#20222b" stroke-width="5" stroke-linecap="round"/>':'<path d="M178 130q-8 0-7 7-3 7 4 10 7 4 11-4 4-6-1-10z" fill="#20222b"/><circle cx="180" cy="135" r="2" fill="white"/>'}${low?'<path d="m119 80-6-12m17 7-1-15" stroke="#252833" stroke-width="3" stroke-linecap="round"/>':''}${cap?'<g transform="translate(0 -8)"><path d="M114 86q17-42 64-24l23 29z" fill="#539e98"/><path d="M174 89h36" stroke="#285970" stroke-width="8" stroke-linecap="round"/></g>':''}${crown?'<g transform="translate(8 -12)"><path d="m137 78-5-27 22 14 15-27 15 27 24-14-8 27z" fill="#f2bd58" stroke="#a87837" stroke-width="3"/></g>':''}</g><circle cx="178" cy="143" r="101" fill="url(#bird-glass)" stroke="#c6e6ec" stroke-width="3"/><path d="M96 107q17-45 64-52" fill="none" stroke="white" stroke-width="8" stroke-linecap="round" opacity=".65"/><path d="M114 235q64 28 128-2" fill="none" stroke="#536986" stroke-width="15" stroke-linecap="round"/>${scarf?'<path d="M119 238q59 25 116-2l-3 16q-55 23-111-1z" fill="#e38d83"/><path d="m214 249 15 31 14-8-15-28" fill="#e38d83"/>':''}${dustCloud(dust)}</g><path d="m40 89 4-9 4 9 9 4-9 4-4 9-4-9-9-4zm270 119 3-7 3 7 7 3-7 3-3 7-3-7-7-3z" fill="#d7bfe8"/></svg>`;
}
function dustCloud(amount){
 if(!amount)return '';const count=amount>3?30:14;
 return `<g class="pip-dust" aria-hidden="true" opacity="${amount>3?.85:.6}"><g fill="#b4a28c" fill-opacity=".24" stroke="#8c7b67" stroke-width="1.5" stroke-linecap="round"><path d="M71 276c-30 8-48-8-36-24-18-14-4-36 14-31 0-19 29-26 40-12m-33 26c-17-3-21 14-10 19m8 23c13-10 25-1 20 8"/><path d="M260 279c28 15 57 2 51-16 24-8 15-33-3-34 8-20-17-35-33-22m16 31c18-4 26 11 15 22m-42 9c17-14 31-1 22 11"/><path d="M73 285q29-18 53 3m103-1q19-16 38 0" fill="none"/></g><g class="dust-specks" fill="#c3af94" stroke="#2d2928" stroke-width=".7">${Array.from({length:count},(_,i)=>{const x=i%2?270+(i*17)%60:25+(i*13)%57,y=170+(i*31)%119;return `<path d="m${x} ${y} 3 -2 2 4 -3 1z"/>`;}).join('')}</g><g stroke="#b9a78f" stroke-width="1.6" fill="none" stroke-linecap="round"><path d="m40 188-6-4m22 20 5-5m234-20 5-3m13 33 5 2M88 264l-6 3m186-4 6 4"/></g></g>`;
}
function pottedPlant(level,index){
 const colors=['#c58c79','#a7bbb0','#bd9b76','#a69cbe','#99b7c2','#ca9a90'],petals=['#eee1a3','#d7c1ec','#f0ba65','#d397ac','#bcb3eb','#e7bd9c'];
 const leaf=(x,y,flip=false)=>`<path d="M${x} ${y}q${flip?-35:35}-30 ${flip?-38:38}-8q${flip?8:-8} 24 ${flip?38:-38} 8" fill="#719d7b" stroke="#365c49" stroke-width="2"/>`;
 const bloom=(x,y)=>`<g transform="translate(${x} ${y})">${Array.from({length:6},(_,j)=>`<ellipse cy="-12" rx="8" ry="13" fill="${petals[index]}" stroke="#79644e" stroke-width="1" transform="rotate(${j*60})"/>`).join('')}<circle r="7" fill="#b78a43"/><circle r="3" fill="#edcc78"/></g>`;
 return `<svg viewBox="0 0 180 210" role="img" aria-label="${['Soil in a terracotta pot','A seedling in a ceramic pot','A leafy plant in a ceramic pot','A flowering plant in a ceramic pot'][level]}"><ellipse cx="90" cy="193" rx="57" ry="7" fill="#101d1a" opacity=".25"/><path d="M40 135h100l-12 49q-38 16-76 0z" fill="${colors[index]}" stroke="#4b4b46" stroke-width="2"/><path d="m49 142 10 37q8 4 15 4l-7-41" fill="white" opacity=".1"/><ellipse cx="90" cy="136" rx="50" ry="13" fill="#d3b3a0" stroke="#4b4b46" stroke-width="2"/><ellipse cx="90" cy="135" rx="42" ry="9" fill="#51463a"/><path d="M47 141q43 17 86 0v9q-43 16-86 0z" fill="${colors[index]}" stroke="#4b4b46" stroke-width="2"/>${level?`<path d="M90 136Q${level>1?80:85} 102 90 ${level===1?102:57}" fill="none" stroke="#426b51" stroke-width="4" stroke-linecap="round"/>${leaf(88,118,true)}${leaf(88,105)}${level>1?leaf(87,88,true)+leaf(87,77):''}${level===3?bloom(90,49):''}`: '<path d="m76 133 4-2m17 6 3-2m11-3 2 1" stroke="#a8936f" stroke-width="2"/>'}<rect x="73" y="160" width="34" height="18" rx="5" fill="#f3e4cc" opacity=".8"/><path d="m85 170 4-5 5 5-5 4z" fill="#718478"/></svg>`;
}
function rocketBird(state){return `<svg viewBox="0 0 220 130" aria-hidden="true"><g class="rocket-flame"><path d="m62 86-42-13 12 16-21 9 51 9z" fill="#e4ac73"/><path d="m62 88-26 5 25 7" fill="#ffe3a0"/></g><path d="m85 80-17-19 36 13m-19 34-17 16 36-12" fill="#a18aba" stroke="#44435a" stroke-width="2"/><path d="M61 81q62-24 125 13-61 33-125 14z" fill="#edece5" stroke="#44435a" stroke-width="2.5"/><path d="M151 78q23 6 35 16-16 10-34 15" fill="#c8a0a1" stroke="#44435a" stroke-width="2"/><circle cx="125" cy="93" r="11" fill="#8ebbc6" stroke="#506c7a" stroke-width="3"/><path d="M65 84v22" stroke="#77708d" stroke-width="7"/><svg x="77" y="-3" width="91" height="86" viewBox="0 0 360 320">${astronautBird(state,0,'healthy').replace(/<svg[^>]*>|<\/svg>/g,'').replaceAll('bird-glass','rocket-glass')}</svg></svg>`;}
export function initializeMission(){
 const root=document.getElementById('mission');if(!root)return;
 const css=document.createElement('link');css.rel='stylesheet';css.href='./mission.css';document.head.append(css);
 let state=newMission(),user=null,admin=false,alias='',busy=false,section='care',generation=0,gameCleanup=null;
 try{const saved=JSON.parse(localStorage.getItem('crewsafety-mission-guest')||'null');if(saved?.version===1&&Array.isArray(saved.actions))state=saved;}catch{}
 const status=node('p','Your next small step starts here.','mission-message');status.setAttribute('role','status');
 const main=node('div',null,'mission-content');root.append(status,main);
 async function act(action){
  if(busy)throw Error('One moment—your last action is saving.');busy=true;const run=generation;
  try{
   action={...action,id:action.id||crypto.randomUUID()};let next;
   if(user){const result=await api('/api/mission/action','POST',action);next=result.state;alias=result.alias;admin=result.admin===true;}
   else{next=applyMissionAction(state,action);localStorage.setItem('crewsafety-mission-guest',JSON.stringify(next));}
   if(run!==generation)throw Error('Account changed. Reload your mission.');state=next;return state;
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
 function render(){
  const info=missionSummary(state);main.replaceChildren();
  const bar=node('div',null,'mission-topline');bar.append(node('span',`STATION DAY ${info.day} · UTC`),node('span',user?`Synced · ${alias}`:'Guest flight · saved on this device'));main.append(bar);
  const hero=node('div',null,'mission-hero'),pet=node('div',null,'mission-pet');const stage=admin&&state.birdStage&&state.birdStage!=='auto'?state.birdStage:info.dust>=4?'needs-care':info.dust>0?'tired':'healthy';const dust=admin&&state.birdStage&&state.birdStage!=='auto'?({healthy:0,tired:3,'needs-care':7})[stage]:info.dust;pet.innerHTML=astronautBird(state,dust,stage);pet.tabIndex=0;pet.setAttribute('role','button');pet.setAttribute('aria-label','Pet Pip. Tap to hop or swipe to pet.');let petStart=null,petTime=0;const playPet=(swipe)=>{if(Date.now()-petTime<650)return;petTime=Date.now();pet.classList.remove('pip-hop','pip-petted');void pet.offsetWidth;pet.classList.add(swipe?'pip-petted':'pip-hop');speech.textContent=swipe?'Chirp! Thanks for the helmet scritches.':'Boop! Ready for our next little adventure.';const heart=node('span','♡','pet-heart');heart.setAttribute('aria-hidden','true');pet.append(heart);setTimeout(()=>heart.remove(),1400);};pet.onpointerdown=e=>{petStart={x:e.clientX,y:e.clientY};};pet.onpointerup=e=>{if(!petStart)return;const distance=Math.hypot(e.clientX-petStart.x,e.clientY-petStart.y);petStart=null;playPet(distance>25);};pet.onpointercancel=()=>petStart=null;pet.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();playPet(false);}};
  const speech=node('p',stage==='needs-care'?'A quiet day for Pip. A little care goes a long way.':stage==='tired'?'A little space dust. Any check-in will brighten Pip’s day.':'Hey, crewmate. One small step is plenty.','bird-speech');pet.append(speech,node('small','Tap to hop · swipe to pet','pet-hint'));
  const intro=node('div',null,'mission-intro');intro.append(node('p','PIP’S EXPEDITION / 01','mission-kicker'),node('h2','A little care.\nA whole universe.'),node('p','Take care of yourself. Help your little explorer reach Mars. Every honest check-in counts.','mission-description'));
  const stats=node('div',null,'mission-wallet');for(const [name,value,icon]of[['Flight fuel',state.fuel,'✦'],['Shop stars',admin?'∞':state.coins,'✧'],['Mission streak',`${info.streak} d`,'☄']]){const box=node('div');box.append(node('span',icon),node('strong',String(value)),node('small',name));stats.append(box);}intro.append(stats);
  hero.append(intro,pet);main.append(hero);
  const journey=node('div',null,'mission-journey');journey.append(node('span','◉ Earth'),node('strong',`${info.percent}% to Mars · Expedition ${state.prestige+1}`),node('span','Mars ◉'));
  const progress=document.createElement('progress');progress.max=1000;progress.value=state.distance;progress.setAttribute('aria-label','Journey to Mars');progress.className='journey-accessible-progress';journey.append(progress);const route=node('div',null,'rocket-route');route.style.setProperty('--journey',String(info.percent)+'%');route.innerHTML='<span class="route-earth" aria-hidden="true"></span><div class="route-track"><span class="route-trail"></span><div class="rocket-rider">'+rocketBird(state)+'</div></div><span class="route-mars" aria-hidden="true"></span>';journey.append(route);
  journey.append(node('small',`Care tasks move your ship. ${state.prestige?`Prestige boost +${Math.min(state.prestige,5)*5}% distance.`:'1,000 distance to your first landing.'}`));
  if(state.distance>=1000)journey.append(control('Land on Mars & start a new expedition',()=>doAction({type:'prestige'},'Mars landing celebrated! Your outfits, stars and garden stay. Travel boost unlocked.'),'mission-primary'));
  main.append(journey);
  if(admin)renderAdmin(main);
  const nav=node('div',null,'mission-tabs');nav.setAttribute('aria-label','Mission sections');for(const [id,label]of tabs){const b=control(label,()=>{section=id;render();});b.classList.toggle('selected',section===id);b.setAttribute('aria-pressed',String(section===id));nav.append(b);}main.append(nav);
  const content=node('div',null,'mission-section');main.append(content);
  if(section==='care')renderCare(content,info);if(section==='games')renderGames(content,info);if(section==='garden')renderGarden(content);if(section==='shop')renderShop(content);if(section==='board')renderBoard(content);
  main.append(node('p','Participation powers the mission. No points depend on a positive mood, a perfect suit inspection, physical ability, or a high game score.','mission-footnote'));
 }
 function renderAdmin(out){
  const panel=node('section',null,'mission-admin');panel.append(node('h3','Admin simulation'),node('p','Your account has unlimited shop stars. Preview Pip’s care stages and fast-grow your garden. Simulations stay out of public rankings.','mission-muted'));
  const stages=node('div',null,'admin-controls');for(const [id,label]of[['auto','Follow check-ins'],['healthy','Healthy bird'],['tired','Tired bird'],['needs-care','Needs care']]){const b=control(label,()=>doAction({type:'admin',stage:id},'Bird stage updated.'));b.setAttribute('aria-pressed',String((state.birdStage||'auto')===id));stages.append(b);}panel.append(stages);
  const growth=node('div',null,'admin-controls');for(const [label,value]of[['Seed tray',0],['Sprouts',3],['Leafy garden',7],['Full bloom',18],['Grow +3',Math.min(100,state.garden+3)]])growth.append(control(label,()=>doAction({type:'admin',growth:value},'Garden simulation updated.')));panel.append(node('p','Garden growth: '+state.garden),growth);out.append(panel);
 }
 function renderCare(out,info){
  const head=node('div',null,'mission-section-head');head.append(node('h3','Today’s care orbit'),node('span',`${info.done.length} / ${MISSION_TASKS.length} check-ins`));out.append(head);
  out.append(node('p','Choose what fits your day. Three different check-ins grow your garden. Each task earns fuel once per station day.','mission-muted'));
  const grid=node('div',null,'mission-task-grid');for(const task of MISSION_TASKS){const done=info.done.includes(task.id),card=node('article',null,'mission-task');card.append(node('span',task.icon,'task-icon'),node('h4',task.name),node('p',task.hint));const b=control(done?'✓ Logged today':`Check in · +${task.fuel} fuel`,()=>taskDialog(task),done?'task-done':'');b.disabled=done;card.append(b);grid.append(card);}out.append(grid);
  try {
   const notes=JSON.parse(localStorage.getItem('crewsafety-mission-notes-'+(user?.username||'guest'))||'[]');
   if(notes.length){const details=node('details'),summary=node('summary','Recent mission notes · this device only');details.append(summary);for(const entry of notes.slice(0,14)){const label=MISSION_TASKS.find(t=>t.id===entry.task)?.name||'Check-in';details.append(node('p',`${new Date(entry.at).toLocaleString()} · ${label}: ${entry.answers.join(' · ')||'Photo preview check-in'}`));}out.append(details);}
  }catch{}
  if(!user)out.append(control('Sign in to sync across your iPhone and website',()=>document.getElementById('account-button').click(),'mission-link'));
 }
 function taskDialog(task){
  const dialog=document.createElement('dialog');dialog.className='mission-dialog';const form=node('form');form.append(node('h2',task.name),node('p',task.hint));let previewURL=null;
  const field=(label,type='text',options=null)=>{const l=node('label',label);let input;if(options){input=node('select');input.append(new Option('Choose a response',''));for(const o of options)input.append(new Option(o,o));}else{input=node(type==='textarea'?'textarea':'input');if(type!=='textarea')input.type=type;}input.required=true;if(type==='textarea'){input.maxLength=1000;input.rows=3;}l.append(input);form.append(l);return input;};
  if(task.id==='health') {field('How does your body feel today?','text',['Comfortable','Something to note','Prefer not to say']);field('What would support you today?','text',['Usual routine','Rest or adapted activity','Talk with a crewmate','Prefer not to say']);}
  if(task.id==='wellness')field('Your state of mind right now','text',['Upbeat','Steady','Mixed','Low','Prefer not to say']);
  if(task.id==='exercise')field('What did you participate in?','text',['Workout','Gentle mobility','Adapted movement','Planned rest / recovery']);
  if(task.id==='meal')field('A brief meal or nutrition note','textarea');
  if(task.id==='journal')field('One thing you noticed today','textarea');
  if(task.id==='suit'){form.append(node('p','Training record only. Follow your approved suit procedures; this does not certify readiness. A concern earns the same fuel as a pass.','mission-muted'));for(const item of SUIT_ITEMS)field(item.name,'text',['Checked — no concern','Checked — concern to report','Not applicable / unavailable']);}
  if(task.id==='photo'){const input=field('Choose a daily check-in photo','file');input.accept='image/*';const preview=node('img');preview.className='mission-photo';preview.alt='Your local photo preview';preview.hidden=true;form.append(preview);input.onchange=()=>{if(previewURL)URL.revokeObjectURL(previewURL);const f=input.files[0];if(f&&!f.type.startsWith('image/')){input.value='';return;}if(f){previewURL=URL.createObjectURL(f);preview.src=previewURL;preview.hidden=false;}};form.append(node('p','Preview only: this image is not uploaded or stored by the mission. Use the Journal photo feature to save a photo.','mission-muted'));}
  form.append(node('p','Only completion is synced. Your answers are kept in this device’s mission notes; photos are preview-only.','mission-muted'));
  const message=node('p');message.setAttribute('role','status');const save=node('button',`Log participation · +${task.fuel} fuel`,'mission-primary');save.type='submit';
  form.append(message,save,control('Not now',()=>dialog.close()));form.onsubmit=async e=>{e.preventDefault();save.disabled=true;try{
    const key='crewsafety-mission-notes-'+(user?.username||'guest');const notes=JSON.parse(localStorage.getItem(key)||'[]');const answers=[...form.querySelectorAll('select,textarea')].map(x=>x.value);localStorage.setItem(key,JSON.stringify([{task:task.id,at:Date.now(),answers},...notes].slice(0,100)));
    await act({type:'task',task:task.id,participated:true});dialog.close();tell(`+${task.fuel} flight fuel. Thanks for showing up.`);render();
   }catch(error){message.textContent=error.message;save.disabled=false;}};
  dialog.append(form);document.body.append(dialog);dialog.onclose=()=>{if(previewURL)URL.revokeObjectURL(previewURL);dialog.remove();};dialog.showModal();
 }
 function renderGarden(out){
  const stage=missionSummary(state).gardenStage;out.append(node('h3','Your small corner of green'),node('p',`${stage} · ${state.garden} growth. Three different care tasks in a station day nurture your garden.`,'mission-muted'));
  const garden=node('div',null,'space-garden');const names=['Moon mint','Orbit basil','Solar daisy','Comet cosmos','Lunar lavender','Mars marigold'];for(let i=0;i<6;i++){const level=Math.min(3,Math.max(0,Math.floor((state.garden-i)/2))),pot=node('figure',null,'garden-pot'),art=node('div',null,'garden-art');art.innerHTML=pottedPlant(level,i);const caption=node('figcaption');caption.append(node('strong',names[i]),node('small',['Seed resting','First sprout','Growing leaves','In bloom'][level]));pot.append(art,caption);garden.append(pot);}out.append(garden);
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
  out.append(node('p',`${alias} · ${state.rankPoints} participation points`));if(!admin)out.append(control(state.listed?'Leave public leaderboard':'Join public leaderboard with my bird alias',()=>doAction({type:'listing',listed:!state.listed},state.listed?'Your alias is no longer listed.':'Your bird alias and participation points are now visible.')));
  const table=node('table');table.className='mission-ranking';const caption=node('caption','Top 10 participating crewmates');table.append(caption);const header=node('tr');for(const s of ['Rank','Bird','Points'])header.append(node('th',s));const thead=node('thead');thead.append(header);table.append(thead);const body=node('tbody');table.append(body);out.append(table);
  try{const result=await api('/api/mission/leaderboard');if(!out.isConnected)return;if(!result.rows.length)out.append(node('p','No crewmates have opted in yet. Be the first.'));for(const r of result.rows){const tr=node('tr');for(const v of [r.rank,r.alias,r.points])tr.append(node('td',String(v)));body.append(tr);}if(result.self&&!result.rows.some(r=>r.alias===result.self.alias)){const mine=node('div',null,'personal-rank');mine.append(node('strong','Your rank'),node('p',`#${result.self.rank} · ${result.self.alias} · ${result.self.points} points`));out.append(mine);}if(!result.self&&!admin)out.append(node('p','Join the leaderboard to see your personal rank.','mission-muted'));}catch(e){out.append(node('p',e.message));}
 }
 function renderGames(out,info){
  out.append(node('h3','Flight deck'),node('p','Spend 10 fuel. Participate to earn 15 shop stars + 20 ranking points. Scores are personal practice stats, never a cognitive or health assessment.','mission-muted'));
  if(state.pending){out.append(node('p','You have an unfinished flight. Leaving returns its 10 fuel; no rewards are granted.'),control('Leave unfinished flight & return fuel',()=>doAction({type:'cancel'},'Flight fuel returned.')));return;}
  out.append(node('p',`${info.plays} / 6 rewarded flights today · personal baseline = your last 10 completed runs.`, 'mission-muted'));
  const grid=node('div',null,'mission-task-grid');for(const game of MISSION_GAMES){const stats=missionStats(state,game.id),card=node('article',null,'mission-task');card.append(node('span',game.icon,'task-icon'),node('h4',game.name),node('p',game.description),node('p',stats.count?`Personal best ${stats.best} · baseline ${stats.average} / 100 (${stats.count} runs)`:'Your first run sets the baseline.','mission-muted'));const button=control('Launch · 10 fuel',()=>launch(game),'mission-primary');button.disabled=state.fuel<10||info.plays>=6;card.append(button);grid.append(card);}out.append(grid);
 }
 async function launch(game){
  try{await act({type:'start',game:game.id});}catch(e){tell(e.message);return;}
  const run=state.pending,previous=missionStats(state,game.id),dialog=document.createElement('dialog');dialog.className='mission-dialog mission-game-dialog';
  const title=node('h2',game.name),stage=node('div',null,'game-stage'),message=node('p','Participation earns the same reward at every score.'),close=control('Leave flight · refund fuel',async()=>{try{await act({type:'cancel'});dialog.close();render();}catch(e){message.textContent=e.message;}});
  dialog.append(title,message,stage,close);document.body.append(dialog);dialog.showModal();const timers=new Set();let finished=false,hasInput=false;
  const later=(fn,ms)=>{const id=setTimeout(()=>{timers.delete(id);if(dialog.open&&!finished)fn();},ms);timers.add(id);};
  const cleanup=()=>{document.removeEventListener('visibilitychange',onHidden);for(const t of timers)clearTimeout(t);timers.clear();dialog.remove();};gameCleanup=cleanup;dialog.oncancel=e=>{e.preventDefault();close.click();};dialog.onclose=cleanup;
  document.addEventListener('visibilitychange',onHidden);function onHidden(){if(document.hidden&&!finished){for(const t of timers)clearTimeout(t);timers.clear();stage.replaceChildren(node('p','Flight paused because you left the page. Leave this flight to return your fuel.'));}}
  dialog.addEventListener('close',()=>document.removeEventListener('visibilitychange',onHidden),{once:true});
  async function finish(score,metrics){
   if(finished||!hasInput)return;finished=true;for(const t of timers)clearTimeout(t);timers.clear();stage.replaceChildren(node('p','Saving your flight…'));close.disabled=true;
   const finishId=crypto.randomUUID();
   const submit=async()=>{try{await act({id:finishId,type:'finish',run:run.id,score,metrics});stage.replaceChildren(node('strong',`${Math.round(score)} / 100`,'game-score'),node('p',`Previous best: ${previous.best??'First flight'} · Previous baseline: ${previous.average??'First flight'}`),node('p',Object.entries(metrics).map(([k,v])=>`${({reactionMs:'Mean reaction (ms)',consistencyMs:'Reaction spread (ms)',attempts:'Attempts',accuracy:'Accuracy (%)',errors:'Errors'})[k]}: ${Math.round(v)}`).join(' · ')),node('p','+15 shop stars · +20 participation points','mission-reward'),control('Back to flight deck',()=>{dialog.close();render();},'mission-primary'));close.hidden=true;}catch(e){stage.replaceChildren(node('p',e.message),control('Retry saving',submit));close.disabled=false;}};
   const delay=Math.max(0,5100-(Date.now()-run.started));setTimeout(()=>{if(dialog.open)submit();},delay);
  }
  if(game.id==='dock'){
   let round=0,green=false,readyAt=0;const results=[];const lamp=control('Waiting for green…',()=>{if(finished)return;hasInput=true;results.push(green?Math.min(3500,Math.max(0,performance.now()-readyAt)):2000);green=false;round++;for(const t of timers)clearTimeout(t);timers.clear();if(round>=3){const mean=results.reduce((a,b)=>a+b,0)/3,spread=Math.sqrt(results.reduce((s,r)=>s+(r-mean)**2,0)/3);finish(Math.max(0,100-mean/20),{reactionMs:mean,consistencyMs:spread,errors:results.filter(r=>r>=2000).length});}else next();},'dock-button');stage.append(lamp);
   const next=()=>{lamp.textContent=`Round ${round+1}/3 · wait for GREEN`;lamp.classList.remove('green');green=false;later(()=>{green=true;readyAt=performance.now();lamp.textContent='GREEN · DOCK NOW';lamp.classList.add('green');},1500+Math.random()*1700);};next();
  }
  if(game.id==='memory'){
   const planets=['☿','♀','♁','♂','♃','♄'];const cards=[...planets,...planets];for(let i=cards.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[cards[i],cards[j]]=[cards[j],cards[i]];}
   let open=[],matched=0,attempts=0,locked=false;const grid=node('div',null,'planet-grid');const finishEarly=control('Finish practice with current progress',()=>finish(Math.max(0,Math.round(matched/6*100)-Math.max(0,attempts-6)*2),{attempts,accuracy:attempts?matched/attempts*100:0,errors:Math.max(0,attempts-matched)}));finishEarly.disabled=true;
   cards.forEach((symbol,i)=>{const b=control('✦',()=>{if(locked||b.disabled||open.some(x=>x.i===i))return;hasInput=true;finishEarly.disabled=false;b.textContent=symbol;b.setAttribute('aria-label',`Card ${i+1}: ${symbol}`);open.push({i,b});if(open.length===2){attempts++;const [a,c]=open;if(cards[a.i]===cards[c.i]){a.b.disabled=c.b.disabled=true;open=[];matched++;if(matched===6)finishEarly.click();}else{locked=true;later(()=>{for(const x of open){x.b.textContent='✦';x.b.setAttribute('aria-label',`Hidden card ${x.i+1}`);}open=[];locked=false;},800);}}});b.setAttribute('aria-label',`Hidden card ${i+1}`);grid.append(b);});stage.append(node('p','Flip two cards to find a planet pair.'),grid,finishEarly);
  }
  if(game.id==='minerals'){
   let round=0,correct=0,errors=0,target;const picture=node('div',null,'mineral-target'),count=node('p');const choose=collect=>{hasInput=true;if(collect===target)correct++;else errors++;round++;if(round===12){finish(correct/12*100,{accuracy:correct/12*100,errors});return;}next();};const next=()=>{target=Math.random()>.35;picture.textContent=target?'💎':'☄';picture.setAttribute('aria-label',target?'Useful mineral':'Hazard');count.textContent=`Sample ${round+1} of 12 · ${target?'Useful mineral':'Hazard'}`;};stage.append(count,picture,control('Collect mineral',()=>choose(true),'mission-primary'),control('Avoid / let pass',()=>choose(false)));next();
  }
 }
 render();
 setInterval(()=>{if(!state.pending&&document.getElementById('mission')?.classList.contains('active'))render();},60000);
 return {refreshUser};
}
