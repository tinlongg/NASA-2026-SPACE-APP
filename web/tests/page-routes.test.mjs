import test from 'node:test';
import assert from 'node:assert/strict';
import {PAGE_ROUTES,MISSION_ROUTES,missionSectionForPath,pageForPath} from '../dist/page-routes.js';
import {createWorker} from '../worker.mjs';
import {loadAssets} from '../scripts/build.mjs';
test('all sidebar pages support direct requests, refreshes, and trailing slashes',async()=>{const worker=createWorker(await loadAssets());for(const [page,path]of Object.entries(PAGE_ROUTES)){assert.equal(pageForPath(path),page);for(const suffix of['','/']){const response=await worker.fetch(new Request('https://test.example'+path+suffix),{});assert.equal(response.status,200);assert.match(response.headers.get('Content-Type'),/text\/html/);const html=await response.text();assert.ok(html.includes('href="'+path+'"'));assert.ok(html.includes('<base href="/">'));}}assert.equal((await worker.fetch(new Request('https://test.example/not-a-page'),{})).status,404);assert.equal(pageForPath('/camera'),null);assert.match(await(await worker.fetch(new Request('https://test.example/camera'),{})).text(),/CrewSafety camera/);});

test('Mission tabs support direct links, refreshes, trailing slashes, and offline caching',async()=>{
 const assets=await loadAssets(),worker=createWorker(assets);
 const {SHELL_ASSETS}=await import('../dist/offline-config.js');
 for(const [section,path] of Object.entries(MISSION_ROUTES)){
  assert.ok(SHELL_ASSETS.includes(path));
  assert.equal(assets[path],assets['/index.html']);
  for(const suffix of ['','/']){
   assert.equal(pageForPath(path+suffix),'mission');
   assert.equal(missionSectionForPath(path+suffix),section);
   const response=await worker.fetch(new Request('https://test.example'+path+suffix),{});
   assert.equal(response.status,200);
   assert.match(response.headers.get('Content-Type'),/text\/html/);
   assert.match(await response.text(),/<base href="\/">/);
  }
 }
 assert.equal(missionSectionForPath('/mission'),null);
 assert.equal(pageForPath('/mission/unknown'),null);
 assert.equal((await worker.fetch(new Request('https://test.example/mission/unknown'),{})).status,404);
});
