import test from 'node:test';
import assert from 'node:assert/strict';
import {mountSpaceGame,scatterSamples,navigationMap} from '../dist/space-games.js';
test('sample scatter stays inside the field and varies between flights',()=>{
 const seeded=seed=>()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
 const a=scatterSamples(20,seeded(123)),b=scatterSamples(20,seeded(456));
 assert.equal(a.length,20);assert.notDeepEqual(a,b);
 for(const p of a){assert.ok(p.x>=9&&p.x<=91);assert.ok(p.y>=10&&p.y<=90);}
 for(let i=0;i<a.length;i++)for(let j=0;j<i;j++)assert.ok(Math.hypot((a[i].x-a[j].x)/16,(a[i].y-a[j].y)/18)>.65);
});
function setup(id){
 class Element{constructor(tag){this.tag=tag;this.children=[];this.attributes={};this.style={setProperty(){}};this.classList={add(){},remove(){},toggle(){}};}append(...n){this.children.push(...n);}setAttribute(k,v){this.attributes[k]=v;}click(){if(!this.disabled)this.onclick?.();}}
 globalThis.document={createElement:tag=>new Element(tag)};const stage=new Element('div'),timers=[],out=[];let inputs=0;
 mountSpaceGame(id,{stage,later:(fn,ms)=>timers.push({fn,ms}),finish:(...args)=>out.push(args),input:()=>inputs++});return{stage,timers,out,inputs:()=>inputs};
}
test('sample field awards accuracy for collected resources and untouched hazards',()=>{
 const {stage,out}=setup('minerals'),field=stage.children.find(n=>n.className==='salvage-window');assert.equal(field.children.length,20);
 field.children.filter(n=>n.attributes['aria-label'].endsWith('collect')).forEach(n=>n.click());stage.children.at(-1).click();assert.equal(out[0][0],100);assert.equal(out[0][1].errors,0);
});
test('samples can be released and empty cargo can finish with participation',()=>{
 const {stage,out,inputs}=setup('minerals'),field=stage.children.find(n=>n.className==='salvage-window');field.children[0].click();field.children[0].click();assert.equal(field.children[0].attributes['aria-pressed'],'false');stage.children.at(-1).click();assert.equal(out[0][0],25);assert.equal(inputs(),3);
});
test('early docking does not let an old approach timer turn the next round green',()=>{
 const {stage,timers}=setup('dock'),lamp=stage.children.at(-1);const old=timers.shift();lamp.click();timers.shift().fn();assert.equal(lamp.textContent,'Wait for GREEN');old.fn();assert.equal(lamp.textContent,'Wait for GREEN');timers.shift().fn();assert.equal(lamp.textContent,'GREEN · DOCK NOW');
});
test('memory matches all six illustrated pairs without duplicate card clicks',()=>{
 const {stage,timers,out}=setup('memory'),grid=stage.children.find(n=>n.className==='planet-grid');const known=new Map();
 for(let i=0;i<12;i+=2){const a=grid.children[i],b=grid.children[i+1];a.click();a.click();b.click();for(const c of[a,b]){assert.match(c.innerHTML,/<svg/);const name=c.attributes['aria-label'].split(': ')[1];known.set(name,[...(known.get(name)||[]),c]);}while(timers.length)timers.shift().fn();}
 for(const pair of known.values()){if(!pair[0].disabled){pair[0].click();pair[1].click();}}
 assert.equal(out.length,1);assert.equal(known.size,6);
});
test('signal sequence waits for playback and scores all three sequences with mistakes',()=>{
 const random=Math.random;let game;try{Math.random=()=>0;game=setup('sequence');}finally{Math.random=random;}
 const {stage,timers,out,inputs}=game,grid=stage.children.find(n=>n.className==='signal-grid');
 grid.children[0].click();assert.equal(inputs(),0);
 const flush=()=>{while(timers.length)timers.shift().fn();};flush();grid.children[3].click();
 for(const length of [3,4,5]){for(let i=0;i<length;i++)grid.children[i%2].click();flush();}
 assert.equal(out.length,1);assert.equal(out[0][0],97);assert.equal(out[0][1].errors,1);assert.equal(out[0][1].attempts,13);
 grid.children[0].click();assert.equal(out.length,1);
});
test('replaying a signal does not count the same partial progress twice',()=>{
 const random=Math.random;let game;try{Math.random=()=>0;game=setup('sequence');}finally{Math.random=random;}
 const {stage,timers,out}=game,grid=stage.children.find(n=>n.className==='signal-grid'),actions=stage.children.at(-1);
 const flush=()=>{while(timers.length)timers.shift().fn();};flush();grid.children[0].click();actions.children[0].click();flush();grid.children[0].click();actions.children[1].click();
 assert.equal(out.length,1);assert.ok(Math.abs(out[0][0]-100/12)<1e-10);assert.equal(out[0][1].accuracy,100);
});
test('navigation maps always offer a clear eight-move route',()=>{
 for(let seed=1;seed<50;seed++){
  let value=seed;const map=navigationMap(()=>{value=(value*1664525+1013904223)>>>0;return value/4294967296;});
  assert.equal(map.route.length,9);assert.equal(map.route[0],20);assert.equal(map.route.at(-1),4);assert.equal(new Set(map.blocked).size,5);
  for(const i of map.route)assert.ok(!map.blocked.includes(i));
  for(let i=1;i<map.route.length;i++)assert.ok([1,-5].includes(map.route[i]-map.route[i-1]));
 }
});
test('navigator reaches the station by neighboring clear squares and finishes once',()=>{
 const {stage,out,inputs}=setup('navigator'),grid=stage.children.find(n=>n.className==='navigation-grid');
 grid.children[4].click();assert.equal(inputs(),0);
 const hazards=new Set(grid.children.flatMap((cell,i)=>cell.attributes['aria-label'].includes('debris')?[i]:[]));
 const queue=[[20]],seen=new Set([20]);let path;
 while(queue.length){const route=queue.shift(),last=route.at(-1);if(last===4){path=route;break;}for(let i=0;i<25;i++){if(!seen.has(i)&&!hazards.has(i)&&Math.abs(Math.floor(i/5)-Math.floor(last/5))+Math.abs(i%5-last%5)===1){seen.add(i);queue.push([...route,i]);}}}
 for(const i of path.slice(1))grid.children[i].click();assert.equal(out.length,1);assert.equal(out[0][0],100);assert.equal(out[0][1].errors,0);assert.equal(inputs(),8);
 grid.children[3].click();assert.equal(out.length,1);
});
