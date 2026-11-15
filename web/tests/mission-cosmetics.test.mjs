import test from 'node:test';
import assert from 'node:assert/strict';
import {MISSION_SHOP,newMission,applyMissionAction,missionEquipment} from '../dist/mission-rules.js';
import {astronautBird} from '../dist/mission.js';

test('new cosmetics can be bought, drawn, equipped, and removed',()=>{
 const action=(type,item)=>({id:crypto.randomUUID(),type,item});
 for(const [id,marker]of[['beanie','bird-beanie'],['antenna','bird-antenna'],['moon-badge','bird-moon-badge'],['wings','bird-solar-wings'],['beret','bird-beret'],['wreath','bird-wreath'],['headphones','bird-headphones'],['bowtie','bird-bowtie'],['star-brooch','bird-star-brooch'],['medal','bird-medal'],['cigarette','bird-cigarette'],['dunce','bird-dunce'],['fire-cape','bird-fire-cape'],['propeller','bird-propeller']]){
  const item=MISSION_SHOP.find(i=>i.id===id),base={...newMission(),coins:item.cost+200};
  const bought=applyMissionAction(base,action('buy',id));assert.equal(bought.coins,200);assert.ok(bought.owned.includes(id));
  for(const stage of ['healthy','tired','needs-care'])assert.ok(astronautBird(bought,0,stage).includes(marker));
  const removed=applyMissionAction(bought,action('equip',id));assert.ok(!astronautBird(removed).includes(marker));
  assert.equal(applyMissionAction(newMission(),action('buy',id),Date.now(),{admin:true}).coins,0);
 }
});
test('cigarette and smoke follow the beak in each care pose',()=>{
 for(const [stage,offset]of[['healthy',0],['tired',4],['needs-care',9]]){
  const art=astronautBird({equipped:{gear:'cigarette'}},0,stage);assert.ok(art.includes(`class="bird-cigarette" transform="translate(0 ${offset})"`));assert.ok(art.includes('class="cigarette-smoke"'));
 }
});

test('cigarette accessories remain premium and require enough stars',()=>{const cigarette=MISSION_SHOP.find(i=>i.id==='cigarette'),bundle=MISSION_SHOP.find(i=>i.id==='cigarette-bundle');assert.equal(cigarette.cost,5000);assert.ok(bundle.cost>cigarette.cost);assert.ok(cigarette.cost>=10*Math.max(...MISSION_SHOP.filter(i=>!i.id.startsWith('cigarette')).map(i=>i.cost)));for(const item of ['cigarette','cigarette-bundle'])assert.throws(()=>applyMissionAction({...newMission(),coins:200},{id:crypto.randomUUID(),type:'buy',item}),/Not enough/);});
test('bundle has five smoking cigarettes, follows the beak, and keeps the back accessory',()=>{
 let state={...newMission(),coins:20000};for(const item of ['fire-cape','cigarette','cigarette-bundle'])state=applyMissionAction(state,{id:crypto.randomUUID(),type:'buy',item});
 assert.equal(state.equipped.face,'cigarette-bundle');assert.equal(state.equipped.back,'fire-cape');
 for(const [pose,offset]of[['healthy',0],['tired',4],['needs-care',9]]){const art=astronautBird(state,0,pose);assert.ok(art.includes(`class="bird-cigarette-bundle" transform="translate(0 ${offset})"`));assert.equal((art.match(/class="bundle-cigarette"/g)||[]).length,5);assert.equal((art.match(/class="cigarette-smoke bundle-smoke"/g)||[]).length,5);assert.ok(art.includes('bird-fire-cape'));}
 const unequipped=applyMissionAction(state,{id:crypto.randomUUID(),type:'equip',item:'cigarette-bundle'});assert.equal(unequipped.equipped.face,null);assert.equal(unequipped.equipped.back,'fire-cape');
});
test('solar aura uses a separate slot and can combine with a hat and fire cape',()=>{
 const action=(type,item)=>({id:crypto.randomUUID(),type,item});let state={...newMission(),coins:1000};
 for(const item of ['cap','fire-cape','solar-aura'])state=applyMissionAction(state,action('buy',item));
 const art=astronautBird(state);for(const marker of ['bird-cap','bird-fire-cape','bird-solar-aura'])assert.ok(art.includes(marker));
 state=applyMissionAction(state,action('equip','solar-aura'));assert.equal(state.equipped.hat,'cap');assert.equal(state.equipped.back,'fire-cape');assert.ok(!astronautBird(state).includes('bird-solar-aura'));
});
test('back, face and collar accessories equip together and toggle independently',()=>{
 const action=(type,item)=>({id:crypto.randomUUID(),type,item});let state={...newMission(),coins:10000};
 for(const id of ['cap','fire-cape','cigarette','scarf','solar-aura'])state=applyMissionAction(state,action('buy',id));
 for(const pose of ['healthy','tired','needs-care']){const art=astronautBird(state,0,pose);for(const marker of ['bird-cap','bird-fire-cape','bird-cigarette','#e38d83','bird-solar-aura'])assert.ok(art.includes(marker));}
 state=applyMissionAction(state,action('buy','wings'));assert.equal(state.equipped.back,'wings');assert.equal(state.equipped.face,'cigarette');assert.equal(state.equipped.gear,'scarf');
 state=applyMissionAction(state,action('equip','fire-cape'));state=applyMissionAction(state,action('equip','cigarette'));assert.equal(state.equipped.back,'fire-cape');assert.equal(state.equipped.face,null);assert.equal(state.equipped.gear,'scarf');
});
test('legacy gear migrates to its new slot without replacing a newer selection',()=>{
 for(const [item,slot]of[['pack','back'],['wings','back'],['fire-cape','back'],['cigarette','face']]){const old={hat:'cap',gear:item},next=missionEquipment(old);assert.equal(next[slot],item);assert.equal(next.gear,undefined);assert.equal(old.gear,item);assert.equal(next.hat,'cap');}
 assert.deepEqual(missionEquipment({gear:'fire-cape',back:'wings'}),{back:'wings'});
 assert.deepEqual(missionEquipment({gear:'scarf',face:'cigarette',back:'fire-cape'}),{gear:'scarf',face:'cigarette',back:'fire-cape'});
});
