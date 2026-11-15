import test from 'node:test';
import assert from 'node:assert/strict';
import {GARDEN_STAGES,plantGrowthLevel,missionSummary,newMission} from '../dist/mission-rules.js';
import {pottedPlant} from '../dist/mission.js';

test('each plant progresses through eight stages and stays mature with further growth',()=>{
 for(let plant=0;plant<6;plant++){
  assert.equal(plantGrowthLevel(0,plant),0);
  for(let stage=0;stage<8;stage++){
   assert.equal(plantGrowthLevel(plant+stage*2,plant),stage);
   const art=pottedPlant(stage,plant);assert.ok(art.includes(GARDEN_STAGES[stage]));assert.doesNotMatch(art,/undefined|NaN/);
  }
  assert.equal(plantGrowthLevel(20,plant),7);assert.equal(plantGrowthLevel(100,plant),7);
 }
 const state={...newMission(),garden:10};assert.equal(missionSummary(state).gardenStage,'Budding');
});
