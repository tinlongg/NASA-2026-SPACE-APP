import test from 'node:test';
import assert from 'node:assert/strict';
import {MISSION_SHOP,newMission,applyMissionAction} from '../dist/mission-rules.js';
import {astronautBird} from '../dist/mission.js';

test('new cosmetics can be bought, drawn, equipped, and removed',()=>{
 const action=(type,item)=>({id:crypto.randomUUID(),type,item});
 for(const [id,marker]of[['beanie','bird-beanie'],['antenna','bird-antenna'],['moon-badge','bird-moon-badge'],['wings','bird-solar-wings'],['beret','bird-beret'],['wreath','bird-wreath'],['headphones','bird-headphones'],['bowtie','bird-bowtie'],['star-brooch','bird-star-brooch'],['medal','bird-medal'],['cigarette','bird-cigarette']]){
  const item=MISSION_SHOP.find(i=>i.id===id),base={...newMission(),coins:200};
  const bought=applyMissionAction(base,action('buy',id));assert.equal(bought.coins,200-item.cost);assert.ok(bought.owned.includes(id));
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
