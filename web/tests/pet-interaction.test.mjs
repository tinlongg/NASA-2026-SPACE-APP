import test from 'node:test';
import assert from 'node:assert/strict';
import {wirePet} from '../dist/mission.js';
import {LAYER_ITEMS,SYSTEM_ITEMS,ITEMS} from '../dist/suit-layers.js';
function setup(){
 const children=[],bird={style:{}},speech={textContent:''},classes=new Set(),captures=new Set();
 globalThis.document={createElement:()=>({style:{},setAttribute(){},remove(){const at=children.indexOf(this);if(at>=0)children.splice(at,1);}})};
 const pet={isConnected:true,classList:{add(...names){names.forEach(n=>classes.add(n));},remove(...names){names.forEach(n=>classes.delete(n));}},querySelector:()=>bird,querySelectorAll:()=>children,setAttribute(){},append(n){children.push(n);},setPointerCapture(id){captures.add(id);},hasPointerCapture(id){return captures.has(id);},releasePointerCapture(id){captures.delete(id);},offsetWidth:100};
 wirePet(pet,()=>speech);return{pet,bird,speech,children,classes};
}
const pointer=(x=0,y=0)=>({pointerId:1,button:0,clientX:x,clientY:y});
test('every rapid tap responds without a cooldown and hearts stay bounded',()=>{
 const {pet,children,speech}=setup();for(let i=0;i<20;i++){pet.onpointerdown(pointer());pet.onpointerup(pointer());}
 assert.equal(children.length,12);assert.match(speech.textContent,/Boop/);
});
test('hold then move shakes the bird and releasing resets its transform',async()=>{
 const {pet,bird,speech,classes}=setup();pet.onpointerdown(pointer());await new Promise(r=>setTimeout(r,430));assert.ok(classes.has('pip-held'));
 pet.onpointermove(pointer(60,10));assert.match(bird.style.transform,/60px,10px/);assert.match(speech.textContent,/Wheee/);
 pet.onpointerup(pointer(60,10));assert.equal(bird.style.transform,'');assert.ok(!classes.has('pip-held'));
 pet.onpointerdown(pointer());pet.onpointercancel();await new Promise(r=>setTimeout(r,430));assert.ok(!classes.has('pip-held'));
});
test('rapid drag follows the pointer immediately in both directions, and NASA groups remain separate',()=>{
 const {pet,speech}=setup();pet.onpointerdown(pointer());pet.onpointermove(pointer(160,45));assert.match(pet.querySelector().style.transform,/160px,45px/);pet.onpointermove(pointer(-120,-40));assert.match(pet.querySelector().style.transform,/-120px,-40px/);pet.onpointerup(pointer(-120,-40));assert.equal(pet.querySelector().style.transform,'');
 assert.equal(LAYER_ITEMS.length,6);assert.deepEqual(LAYER_ITEMS.map(i=>i.id),['nasa-cooling','nasa-bladder','nasa-restraint','nasa-ripstop','nasa-insulation','nasa-outer']);assert.equal(new Set(ITEMS.map(i=>i.id)).size,9);assert.equal(SYSTEM_ITEMS.length,3);
});
