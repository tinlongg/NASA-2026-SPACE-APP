const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n;};
const button=(text,fn,cls)=>{const b=el('button',text,cls);b.type='button';b.onclick=fn;return b;};
const planets=['Mercury','Venus','Earth','Mars','Jupiter','Saturn'];
export const signalArt='<svg viewBox="0 0 240 130" aria-hidden="true"><path d="M64 38 174 38 174 92 64 92" fill="none" stroke="#92a8d2" stroke-width="3" stroke-dasharray="5 6"/><rect x="39" y="13" width="50" height="50" rx="13" fill="#b5a0d1"/><rect x="149" y="13" width="50" height="50" rx="13" fill="#80bdb6"/><rect x="39" y="67" width="50" height="50" rx="13" fill="#dfb86b"/><rect x="149" y="67" width="50" height="50" rx="13" fill="#8cabd3"/><g fill="#233547" font-size="23" text-anchor="middle" font-family="system-ui"><text x="64" y="46">1</text><text x="174" y="46">2</text><text x="64" y="101">3</text><text x="174" y="101">4</text></g></svg>';
export const navigationArt='<svg viewBox="0 0 240 130" aria-hidden="true"><path d="M40 105V25h160v80zM80 25v80m40-80v80m40-80v80M40 65h160" fill="none" stroke="#8fa6c0" stroke-width="2" opacity=".6"/><path d="m60 85 40 0 0-40 80 0" fill="none" stroke="#8ccab5" stroke-width="5" stroke-linecap="round"/><path d="m49 95 9-25 10 25-10-6z" fill="#d2b5eb"/><circle cx="180" cy="45" r="10" fill="#e7ca83"/><path d="m130 74 10 10-10 10-10-10z" fill="#bc8b7b"/></svg>';
export function navigationMap(random=Math.random){
 const route=[20];let position=20;
 while(position!==4){const choices=[];if(position>=5)choices.push(position-5);if(position%5<4)choices.push(position+1);position=choices[Math.floor(random()*choices.length)];route.push(position);}
 const candidates=Array.from({length:25},(_,i)=>i).filter(i=>!route.includes(i));
 for(let i=candidates.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[candidates[i],candidates[j]]=[candidates[j],candidates[i]];}
 return {start:20,goal:4,blocked:candidates.slice(0,5),route};
}
export function scatterSamples(count,random=Math.random){
 const positions=[];
 for(let i=0;i<count;i++){
  let best=null,bestDistance=-1;
  for(let attempt=0;attempt<80;attempt++){
   const candidate={x:10+random()*80,y:14+random()*72};
   const distance=positions.reduce((nearest,p)=>Math.min(nearest,Math.hypot((p.x-candidate.x)/16,(p.y-candidate.y)/18)),Infinity);
   if(distance>bestDistance){best=candidate;bestDistance=distance;}
  }
  positions.push(best);
 }
 return positions;
}
export function planetArt(name){
 const i=planets.indexOf(name),colors=['#a9a59f','#e5bd79','#64b9ed','#d77851','#d6ab83','#e7d4a0'];
 const texture=name==='Earth'?'<path d="m35 30 20-8 14 11-9 14-16-4-8 18-10-9zm30 30 14 1-3 20-12 5-6-13z" fill="#76b786"/>':name==='Jupiter'?'<path d="M13 35h74M10 48h80M13 63h74M20 75h60" stroke="#9c6256" stroke-width="7"/><ellipse cx="65" cy="61" rx="12" ry="6" fill="#bb6d52"/>':name==='Mars'?'<path d="M21 39q14-18 28-9l-6 17 23 4-4 20-26 5-12-20z" fill="#9e4d3c" opacity=".6"/><path d="M36 16q15-7 29 1l-5 8-19-1z" fill="#edceae"/><circle cx="66" cy="64" r="7" fill="#b45e42"/>':name==='Mercury'?'<g fill="#716e6b"><circle cx="36" cy="36" r="9"/><circle cx="61" cy="62" r="13"/><circle cx="28" cy="65" r="5"/></g>':'<path d="M15 38q35-15 70 0M12 53q40-16 76 0M22 70q30-10 55 0" fill="none" stroke="#fff" stroke-opacity=".23" stroke-width="8"/>';
 return `<svg viewBox="0 0 100 100" role="img" aria-label="${name}"><defs><clipPath id="planet-${name}"><circle cx="50" cy="50" r="37"/></clipPath><radialGradient id="shade-${name}" cx="25%" cy="25%" r="80%"><stop stop-color="#fff" stop-opacity=".25"/><stop offset=".5" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".7"/></radialGradient></defs><circle cx="50" cy="50" r="37" fill="${colors[i]}"/><g clip-path="url(#planet-${name})">${texture}</g><circle cx="50" cy="50" r="37" fill="url(#shade-${name})"/>${name==='Saturn'?'<ellipse cx="50" cy="54" rx="48" ry="13" transform="rotate(-25 50 54)" fill="none" stroke="#d5c293" stroke-width="7"/>':''}</svg>`;
}
export function sampleArt(kind){return `<svg viewBox="0 0 100 100" aria-hidden="true">${kind==='Crystal'?'<path d="m25 30 20-20 28 15 7 48-35 17-25-30z" fill="#84e5de" stroke="#cdfcf6" stroke-width="2"/><path d="m45 10-9 43 9 37 15-41 13-24M25 30l11 23 24-4 20 24" fill="none" stroke="#368f9f" stroke-width="3"/>':kind==='Metal'?'<path d="m20 35 22-20 35 12 8 34-22 23-40-12z" fill="#b6c3dd" stroke="#edf4ff" stroke-width="2"/><path d="m42 15 8 30 27-18M20 35l30 10 13 39M50 45l35 16" fill="none" stroke="#647494" stroke-width="4"/>':kind==='Ice'?'<path d="m25 20 45 4 16 40-31 23-38-28z" fill="#c5edff" stroke="#f0fbff" stroke-width="3"/><path d="m25 20 30 30 15-26M17 59l38-9 31 14M55 50v37" fill="none" stroke="#80b6d3" stroke-width="3"/>':'<path d="m25 22 23-8 13 13 22 4 3 29-17 22-31 5-20-18-4-24z" fill="#98796c" stroke="#d4a58a" stroke-width="2"/><circle cx="40" cy="42" r="10" fill="#57474c"/><circle cx="66" cy="61" r="13" fill="#59474a"/><path d="m16 23-7-10m67 8 9-13" stroke="#f79979" stroke-width="4"/>'}</svg>`;}
export const dockingArt=`<svg viewBox="0 0 600 260" role="img" aria-label="Space station approaching an orbital docking port"><circle cx="490" cy="300" r="160" fill="#234d70"/><circle cx="490" cy="300" r="150" fill="#366b86"/><path d="M70 130H530" stroke="#8db6cc" stroke-dasharray="4 10" opacity=".4"/><g class="orbital-station"><path d="M95 65v130m65-130v130" stroke="#abbac9" stroke-width="5"/><g fill="#3974a3" stroke="#86b8e1" stroke-width="2"><path d="M60 30h58v65H60zm75 0h58v65h-58zM60 165h58v65H60zm75 0h58v65h-58z"/></g><path d="M60 52h58m-58 21h58m17-21h58m-58 21h58M60 186h58m-58 22h58m17-22h58m-58 22h58" stroke="#99c5e8"/><rect x="72" y="108" width="123" height="44" rx="15" fill="#d2dce3" stroke="#7c93ab" stroke-width="3"/><rect x="188" y="119" width="25" height="22" fill="#93a6b8"/><circle cx="101" cy="130" r="10" fill="#2c576d"/><path d="M129 109v42m37-42v42" stroke="#a5b4c3" stroke-width="4"/></g><g><path d="M478 68h122v124H478l-26-38v-48z" fill="#63788e" stroke="#c2d8e8" stroke-width="3"/><rect x="435" y="110" width="25" height="40" rx="6" fill="#c5d1d8"/><rect x="426" y="115" width="10" height="30" class="dock-beacon" fill="#eeb171"/><path d="M500 84v92m24-92v92m24-92v92" stroke="#263c52" stroke-width="8"/></g></svg>`;
export function mountSpaceGame(id,{stage,later,finish,input}){
 if(id==='sequence'){
  const sequence=Array.from({length:5},()=>Math.floor(Math.random()*4));for(let i=1;i<sequence.length;i++)if(sequence[i]===sequence[i-1])sequence[i]=(sequence[i]+1)%4;
  let round=0,index=0,locked=true,done=false,correct=0,errors=0;
  const status=el('p'),grid=el('div',null,'signal-grid'),tiles=[],actions=el('div',null,'flight-actions');
  const replay=button('Replay signal',()=>{if(!locked&&!done){input();show();}}),end=button('Finish signal practice',complete,'mission-primary');end.disabled=true;actions.append(replay,end);
  for(let i=0;i<4;i++){
   const tile=button(String(i+1),()=>{
    if(locked||done)return;input();end.disabled=false;
    if(i!==sequence[index]){errors++;status.textContent=`Try beacon ${index+1} again · round ${round+1} / 3`;return;}
    correct++;index++;
    if(index===round+3){round++;index=0;if(round===3){complete();return;}show();}else status.textContent=`Your turn · beacon ${index+1} / ${round+3}`;
   },'signal-tile signal-'+i);tile.setAttribute('aria-label','Beacon '+(i+1));tiles.push(tile);grid.append(tile);
  }
  function complete(){if(done)return;done=true;const progress=([0,3,7,12][round]||0)+index;finish(Math.max(0,Math.min(100,progress/12*100-errors*3)),{attempts:correct+errors,accuracy:correct+errors?correct/(correct+errors)*100:0,errors});}
  function show(){
   locked=true;index=0;replay.disabled=true;tiles.forEach(t=>t.disabled=true);status.textContent=`Watch the signal · round ${round+1} / 3`;let step=0;
   function flash(){if(done)return;if(step===round+3){locked=false;replay.disabled=false;tiles.forEach(t=>t.disabled=false);status.textContent=`Your turn · beacon 1 / ${round+3}`;return;}const tile=tiles[sequence[step]];tile.classList.add('signal-lit');tile.textContent=(sequence[step]+1)+' ✦';later(()=>{if(done)return;tile.classList.remove('signal-lit');tile.textContent=String(sequence[step]+1);step++;later(flash,180);},450);}
   later(flash,450);
  }
  stage.append(el('p','Watch the numbered beacons, then repeat their order. Replay whenever you need.'),status,grid,actions);show();
 }
 if(id==='navigator'){
  const map=navigationMap(),hazards=new Set(map.blocked),visited=new Set([map.start]),grid=el('div',null,'navigation-grid'),status=el('p'),tiles=[];let position=map.start,moves=0,errors=0,done=false;
  const end=button('Finish route practice',()=>complete(false),'mission-primary');end.disabled=true;
  const adjacent=(a,b)=>Math.abs(Math.floor(a/5)-Math.floor(b/5))+Math.abs(a%5-b%5)===1;
  function draw(){for(let i=0;i<25;i++){const tile=tiles[i],near=adjacent(position,i);tile.textContent=i===position?'➤':i===map.goal?'◎':hazards.has(i)?'◆':visited.has(i)?'·':'○';tile.className='navigation-tile'+(i===position?' navigator-current':i===map.goal?' navigator-goal':hazards.has(i)?' navigator-hazard':near?' navigator-neighbor':'');tile.disabled=done||!near;tile.setAttribute('aria-label',`Row ${Math.floor(i/5)+1}, column ${i%5+1} · ${i===position?'your ship':i===map.goal?'station':hazards.has(i)?'debris':'clear'}${near?' · next move':''}`);}status.textContent=`${moves} moves · ${errors} debris contacts · reach ◎`;}
  function complete(arrived){if(done)return;done=true;const distance=Math.floor(position/5)+4-position%5;const score=arrived?100-Math.max(0,moves-8)*4-errors*8:(8-distance)/8*80-errors*8;finish(Math.max(0,Math.min(100,score)),{attempts:moves+errors,accuracy:moves+errors?moves/(moves+errors)*100:0,errors});}
  for(let i=0;i<25;i++){const tile=button('',()=>{if(done||!adjacent(position,i))return;input();end.disabled=false;if(hazards.has(i)){errors++;status.textContent='Debris ahead · choose another neighboring square.';return;}position=i;moves++;visited.add(i);draw();if(i===map.goal)complete(true);},'navigation-tile');tiles.push(tile);grid.append(tile);}
  stage.append(el('p','Move to a neighboring circle to reach ◎. Avoid ◆ debris; the shortest route takes 8 moves.'),status,grid,end);draw();
 }
 if(id==='dock'){
  let round=0,green=false,readyAt=0,locked=false,approach=0;const results=[],scene=el('div',null,'orbit-window'),status=el('p'),lamp=button('Begin approach',hit,'dock-button');scene.innerHTML=dockingArt;
  stage.append(el('p','Guide the station into the port. Wait for green, then dock.'),scene,status,lamp);
  function next(){const token=++approach;green=false;locked=false;scene.className='orbit-window approaching';const wait=1500+Math.random()*1700;scene.style.setProperty('--approach-time',wait+'ms');status.textContent=`Approach ${round+1} / 3 · closing distance`;lamp.textContent='Wait for GREEN';lamp.classList.remove('green');later(()=>{if(locked||token!==approach)return;green=true;readyAt=performance.now();scene.classList.add('aligned');lamp.classList.add('green');lamp.textContent='GREEN · DOCK NOW';status.textContent='Port aligned · capture ready';},wait);}
  function hit(){if(locked)return;input();locked=true;const valid=green;results.push(valid?Math.min(3500,Math.max(0,performance.now()-readyAt)):2000);green=false;scene.classList.add(valid?'docked':'missed');lamp.textContent=valid?'Contact confirmed':'Too soon · approaching again';status.textContent=valid?'Station secured to docking collar':'Wait for the green capture signal';round++;later(()=>{if(round===3){const mean=results.reduce((a,b)=>a+b,0)/3,spread=Math.sqrt(results.reduce((s,r)=>s+(r-mean)**2,0)/3);finish(Math.max(0,100-mean/20),{reactionMs:mean,consistencyMs:spread,errors:results.filter(r=>r>=2000).length});}else next();},1000);}
  next();
 }
 if(id==='memory'){
  const cards=[...planets,...planets];for(let i=cards.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[cards[i],cards[j]]=[cards[j],cards[i]];}
  let open=[],matched=0,attempts=0,locked=false;const grid=el('div',null,'planet-grid'),status=el('p','0 / 6 planet pairs'),end=button('Finish with current matches',()=>finish(Math.max(0,Math.round(matched/6*100)-Math.max(0,attempts-6)*2),{attempts,accuracy:attempts?matched/attempts*100:0,errors:Math.max(0,attempts-matched)}));end.disabled=true;
  cards.forEach((name,i)=>{const b=button('',()=>{if(locked||b.disabled||open.some(x=>x.i===i))return;input();end.disabled=false;b.innerHTML=planetArt(name);b.append(el('span',name));b.setAttribute('aria-label',`Card ${i+1}: ${name}`);b.classList.add('revealed');open.push({i,b});if(open.length===2){attempts++;const[a,c]=open;if(cards[a.i]===cards[c.i]){a.b.disabled=c.b.disabled=true;open=[];matched++;status.textContent=`${matched} / 6 planet pairs · ${attempts} attempts`;if(matched===6)end.click();}else{locked=true;later(()=>{open.forEach(x=>hide(x.b,x.i));open=[];locked=false;},850);}}},'planet-card');hide(b,i);grid.append(b);});
  function hide(b,i){b.innerHTML='<span class="card-constellation" aria-hidden="true">· ✧ ·</span>';b.classList.remove('revealed');b.setAttribute('aria-label',`Hidden card ${i+1}`);}
  stage.append(el('p','Discover six illustrated planets. Match their pairs.'),status,grid,end);
 }
 if(id==='minerals'){
  const kinds=['Crystal','Metal','Ice','Hazard'],items=Array.from({length:20},(_,i)=>({kind:kinds[i%4],selected:false}));for(let i=items.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[items[i],items[j]]=[items[j],items[i]];}
  const field=el('div',null,'salvage-window'),count=el('p','0 samples collected'),legend=el('div',null,'sample-legend');for(const kind of kinds){const badge=el('span');badge.innerHTML=sampleArt(kind);badge.append(el('span',kind==='Hazard'?'Avoid debris':kind));legend.append(badge);}
  const positions=scatterSamples(items.length);
  items.forEach((item,i)=>{const b=button('',()=>{input();item.selected=!item.selected;b.classList.toggle('collected',item.selected);b.setAttribute('aria-pressed',String(item.selected));count.textContent=`${items.filter(x=>x.selected).length} / 20 objects in cargo`;},'sample-object');b.innerHTML=sampleArt(item.kind);b.style.setProperty('--tilt',(-24+Math.random()*48)+'deg');b.style.left=positions[i].x+'%';b.style.top=positions[i].y+'%';b.setAttribute('aria-label',`${item.kind} ${i+1}${item.kind==='Hazard'?' · avoid':' · collect'}`);b.setAttribute('aria-pressed','false');field.append(b);});
  const end=button('Submit cargo',()=>{input();const correct=items.filter(x=>x.selected===(x.kind!=='Hazard')).length;finish(correct/items.length*100,{accuracy:correct/items.length*100,errors:items.length-correct});},'mission-primary');stage.append(el('p','Collect crystal, metal and ice. Leave debris. Tap again to release.'),legend,field,count,end);
 }
}
