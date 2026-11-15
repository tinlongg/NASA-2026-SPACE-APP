import test from 'node:test';
import assert from 'node:assert/strict';
import {mountSpaceGame} from '../dist/space-games.js';
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
