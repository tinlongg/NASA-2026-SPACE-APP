import test from 'node:test';
import assert from 'node:assert/strict';
import { MODULES, ROOM_IDS, rotate, project, pick, buildScene, rotateDirection, createIssView } from '../dist/iss-3d.js';
import { STN_ROOMS } from '../stations.mjs';

const view = { yaw: 0, pitch: 0, width: 600, height: 372 };
const centreOf = id => { const module = MODULES[id]; return project(rotate([(module.a[0] + module.b[0]) / 2, (module.a[1] + module.b[1]) / 2, (module.a[2] + module.b[2]) / 2], view.yaw, view.pitch), view.width, view.height); };

test('the rooms the server accepts are exactly the modules the model offers (crew quarters excluded)', () => {
  assert.deepEqual([...STN_ROOMS].sort(), [...ROOM_IDS].sort());
  assert.equal(ROOM_IDS.includes('harmony'), false);
  assert.equal(MODULES.harmony.private, true);
});

test('clicking the middle of a module picks it, and empty space picks nothing', () => {
  for (const id of ['zvezda', 'zarya', 'destiny']) { const [x, y] = centreOf(id); assert.equal(pick(x, y, view), id, id); }
  assert.equal(pick(5, 5, view), null);
  assert.equal(pick(view.width - 5, view.height - 5, view), null);
});

test('a module hidden behind another in one view can be reached by turning', () => {
  const turned = { ...view, yaw: -0.9, pitch: 0.4 }, [x, y] = project(rotate([-2.2, 0, -1.6], turned.yaw, turned.pitch), turned.width, turned.height);
  assert.equal(pick(x, y, turned), 'tranquility');
});

test('turning the model moves the projected points, and picking follows', () => {
  const turned = { ...view, yaw: 1.2 }, before = centreOf('kibo'), after = project(rotate([(MODULES.kibo.a[0] + MODULES.kibo.b[0]) / 2, 0, (MODULES.kibo.a[2] + MODULES.kibo.b[2]) / 2], turned.yaw, turned.pitch), turned.width, turned.height);
  assert.notDeepEqual(before.slice(0, 2).map(Math.round), after.slice(0, 2).map(Math.round));
  assert.equal(pick(after[0], after[1], turned) !== null, true);
});

test('the scene has the truss, solar arrays and every module', () => {
  const scene = buildScene(), ids = new Set(scene.modules.map(polygon => polygon.module));
  assert.equal(ids.size, Object.keys(MODULES).length);
  assert.ok(scene.structure.length >= 6 && scene.arrays.filter(p=>p.wing).length === 16);
});

test('rotation preserves normal lengths at every viewing angle',()=>{for(let yaw=-Math.PI;yaw<=Math.PI;yaw+=.2)for(const pitch of[-1.2,0,1.2])for(const n of[[1,0,0],[0,1,0],[0,0,1]])assert.ok(Math.abs(Math.hypot(...rotateDirection(n,yaw,pitch))-1)<1e-12);});
test('the entire model stays in front of the camera and inside the viewport while turning',()=>{const scene=buildScene(),points=[...scene.structure,...scene.arrays,...scene.modules,...scene.details].flatMap(p=>p.points);for(let yaw=-Math.PI;yaw<Math.PI;yaw+=.4)for(const pitch of[-1.2,0,.65,1.2])for(const point of points){const[x,y,depth]=project(rotate(point,yaw,pitch),600,372);assert.ok(depth>0);assert.ok(x>=0&&x<=600&&y>=0&&y<=372);}});

test('idle frames do not redraw; dragging redraws once per frame and cancel releases rotation',()=>{
 const handlers={},frames=[];let clears=0;const context=new Proxy({clearRect(){clears++;},measureText(){return{width:40};}},{get:(o,k)=>o[k]||(()=>{})});
 const canvas={width:0,height:0,clientWidth:600,offsetParent:{},style:{},getContext:()=>context,addEventListener:(k,f)=>handlers[k]=f,setPointerCapture(){},getBoundingClientRect:()=>({left:0,top:0,width:600})};
 globalThis.window={devicePixelRatio:2};globalThis.requestAnimationFrame=fn=>{frames.push(fn);return frames.length;};globalThis.cancelAnimationFrame=()=>{};
 const model=createIssView(canvas,{}),tick=()=>frames.shift()(performance.now());tick();assert.equal(clears,1);tick();tick();assert.equal(clears,1);
 const before=model.view.yaw;handlers.pointerdown({clientX:0,clientY:0,pointerId:1});handlers.pointermove({clientX:100,clientY:20});tick();assert.ok(model.view.yaw>before+1);assert.equal(clears,2);
 handlers.pointercancel();handlers.pointermove({clientX:200,clientY:40});assert.equal(model.view.yaw,before+1.2);model.stop();
 delete globalThis.window;delete globalThis.requestAnimationFrame;delete globalThis.cancelAnimationFrame;
});
