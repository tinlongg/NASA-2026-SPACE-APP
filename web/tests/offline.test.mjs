import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { MODEL_ASSETS, SHELL_ASSETS, cacheableAsset } from '../dist/offline-config.js';
import { loadAssets } from '../scripts/build.mjs';

test('only static shell and pinned model resources are eligible for offline caching', () => {
  const origin='https://crew.test';
  for(const path of SHELL_ASSETS) assert.ok(cacheableAsset(origin+path,origin));
  for(const url of MODEL_ASSETS) assert.ok(cacheableAsset(url,origin));
  for(const path of ['/sync/state','/api/coach/analyze','/health','/api/journal/entries','/index.html?private=data']) assert.equal(cacheableAsset(origin+path,origin),false);
  assert.equal(cacheableAsset('https://other.test/app.js',origin),false);
});

async function harness(failAt = null) {
  const origin='https://crew.test', stores=new Map(), handlers={};
  let online=true;
  const fetcher=async url => { const target = typeof url==='string'?url:url.url; if(!online || target===failAt) throw new Error('network unavailable'); return new Response('cached asset'); };
  const key=url=>new URL(typeof url==='string'?url:url.url,origin).href;
  const caches={
    keys:async()=>[...stores.keys()], delete:async name=>stores.delete(name),
    open:async name=>{
      if(!stores.has(name)) stores.set(name,new Map()); const data=stores.get(name);
      return { match:async url=>data.get(key(url))?.clone(), put:async (url,response)=>data.set(key(url),response),
        addAll:async urls=>{for(const url of urls) data.set(key(url),await fetcher(url));} };
    }
  };
  const self={location:{origin},clients:{claim:async()=>{}},skipWaiting:async()=>{},addEventListener:(name,fn)=>{handlers[name]=fn;}};
  let source=await readFile(new URL('../dist/sw.js',import.meta.url),'utf8');
  source=source.replace(/^import[^\n]+\n/,'').replace('__CACHE_VERSION__','crewsafety-test');
  vm.runInNewContext(source,{self,caches,fetch:fetcher,AbortSignal,MODEL_ASSETS,SHELL_ASSETS,cacheableAsset});
  const lifecycle=async name=>{let work;handlers[name]({waitUntil:p=>{work=p;}});await work;};
  const message=async type=>{let work,result;handlers.message({data:{type},ports:[{postMessage:value=>{result=value;}}],waitUntil:p=>{work=p;}});await work;return result;};
  return {handlers,lifecycle,message,setOffline:()=>{online=false;}};
}

test('installed shell is available with network off; model preparation reports complete only after every asset',async()=>{
  const h=await harness(); await h.lifecycle('install'); await h.lifecycle('activate');
  const before=await h.message('status'); assert.equal(before.shellReady,true); assert.equal(before.modelReady,false);
  const prepared=await h.message('prepare-model'); assert.equal(prepared.modelReady,true);
  h.setOffline();
  for(const url of ['https://crew.test/',...MODEL_ASSETS]){
    let response; h.handlers.fetch({request:new Request(url),respondWith:p=>{response=p;}});
    assert.equal(await (await response).text(),'cached asset');
  }
  let intercepted=false;
  h.handlers.fetch({request:new Request('https://crew.test/chat',{method:'POST',body:'private'}),respondWith:()=>{intercepted=true;}});
  assert.equal(intercepted,false);
});
test('failed model download never advertises offline camera readiness',async()=>{
  const h=await harness(MODEL_ASSETS[1]); await h.lifecycle('install');
  assert.ok((await h.message('prepare-model')).error);
  assert.equal((await h.message('status')).modelReady,false);
});
test('built shell contains every offline dependency and a versioned worker',async()=>{
  const assets=await loadAssets();
  for(const path of SHELL_ASSETS) assert.ok(assets[path==='/'?'/index.html':path],path);
  assert.equal(assets['/journal-sentiment.js'],undefined);
  assert.equal(assets['/sentiment-lexicon.js'],undefined);
  assert.match(assets['/sw.js'].body,/crewsafety-[a-f0-9]{16}/);
  assert.ok(!assets['/styles.css'].body.includes('fonts.googleapis.com'));
});
