import test from 'node:test';
import assert from 'node:assert/strict';
import {PAGE_ROUTES,pageForPath} from '../dist/page-routes.js';
import {createWorker} from '../worker.mjs';
import {loadAssets} from '../scripts/build.mjs';
test('all sidebar pages support direct requests, refreshes, and trailing slashes',async()=>{const worker=createWorker(await loadAssets());for(const [page,path]of Object.entries(PAGE_ROUTES)){assert.equal(pageForPath(path),page);for(const suffix of['','/']){const response=await worker.fetch(new Request('https://test.example'+path+suffix),{});assert.equal(response.status,200);assert.match(response.headers.get('Content-Type'),/text\/html/);const html=await response.text();assert.ok(html.includes('href="'+path+'"'));assert.ok(html.includes('<base href="/">'));}}assert.equal((await worker.fetch(new Request('https://test.example/not-a-page'),{})).status,404);assert.equal(pageForPath('/camera'),null);assert.match(await(await worker.fetch(new Request('https://test.example/camera'),{})).text(),/CrewSafety camera/);});
