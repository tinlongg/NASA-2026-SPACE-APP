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
const pointer=(x=0,y=0,timeStamp=0)=>({pointerId:1,button:0,clientX:x,clientY:y,timeStamp});
test('tap and keyboard happiness restore the normal eye after a moment',t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 const {pet,classes}=setup();pet.onpointerdown(pointer());pet.onpointerup(pointer());assert.ok(classes.has('pip-happy'));assert.ok(!classes.has('pip-dizzy'));
 t.mock.timers.tick(1601);assert.ok(!classes.has('pip-happy'));
 pet.onkeydown({key:'Enter',preventDefault(){}});assert.ok(classes.has('pip-happy'));
});
test('steady fast or long dragging does not make the eye dizzy',t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 for(const speed of [.2,2]){
  const {pet,classes}=setup();pet.onpointerdown(pointer());
  for(let time=40;time<=800;time+=40)pet.onpointermove(pointer(speed*time,0,time));
  assert.ok(!classes.has('pip-dizzy'));pet.onpointerup(pointer(speed*800,0,800));assert.ok(!classes.has('pip-dizzy'));
 }
});
test('gentle dragging keeps the happy eye until release, then returns to normal',t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 const {pet,classes}=setup();pet.onpointerdown(pointer());pet.onpointermove(pointer(20,0,100));assert.ok(classes.has('pip-happy'));
 t.mock.timers.tick(2000);assert.ok(classes.has('pip-happy'));assert.ok(!classes.has('pip-dizzy'));
 pet.onpointerup(pointer(20,0,2100));t.mock.timers.tick(1601);assert.ok(!classes.has('pip-happy'));
});
test('two strong acceleration changes are required for dizziness, then it recovers',t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 const {pet,classes,bird}=setup();pet.onpointerdown(pointer());
 for(let time=40;time<=320;time+=40)pet.onpointermove(pointer(time*2,0,time));
 assert.ok(!classes.has('pip-dizzy'));
 pet.onpointermove(pointer(560,0,360));assert.ok(!classes.has('pip-dizzy'));assert.ok(classes.has('pip-happy'));
 pet.onpointermove(pointer(480,0,400));pet.onpointermove(pointer(400,0,440));pet.onpointermove(pointer(480,0,480));assert.ok(classes.has('pip-dizzy'));assert.ok(!classes.has('pip-happy'));
 pet.onpointerup(pointer(480,0,480));assert.equal(bird.style.transform,'');assert.ok(classes.has('pip-dizzy'));assert.ok(classes.has('pip-returning'));
 t.mock.timers.tick(2601);assert.ok(!classes.has('pip-dizzy'));
});
test('little fast drags and isolated strong jolts do not cause dizziness',t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 const {pet,classes}=setup();pet.onpointerdown(pointer());
 for(let time=24;time<=960;time+=24)pet.onpointermove(pointer(time%48?20:0,0,time));assert.ok(!classes.has('pip-dizzy'));
 pet.onpointerup(pointer(0,0,960));pet.onpointerdown(pointer());
 for(let time=40;time<=320;time+=40)pet.onpointermove(pointer(time*2,0,time));pet.onpointermove(pointer(560,0,360));
 pet.onpointermove(pointer(560,0,1200));pet.onpointermove(pointer(640,0,1240));pet.onpointermove(pointer(560,0,1280));assert.ok(!classes.has('pip-dizzy'));
});
test('small pointer jitter and movement after an idle gap do not cause dizziness',t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 const {pet,classes}=setup();pet.onpointerdown(pointer());
 for(let time=24;time<=480;time+=24)pet.onpointermove(pointer(time%48?2:0,0,time));
 pet.onpointermove(pointer(200,0,1500));pet.onpointermove(pointer(210,0,1540));assert.ok(!classes.has('pip-dizzy'));
});
test('release keeps the bird above the hero while it floats home',t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 const {pet,classes}=setup();pet.onpointerdown(pointer());pet.onpointermove(pointer(100,30,100));pet.onpointerup(pointer(100,30,100));
 assert.ok(classes.has('pip-returning'));assert.ok(!classes.has('pip-held'));t.mock.timers.tick(1799);assert.ok(classes.has('pip-returning'));t.mock.timers.tick(2);assert.ok(!classes.has('pip-returning'));
});
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
