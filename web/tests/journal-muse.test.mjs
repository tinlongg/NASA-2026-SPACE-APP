import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorker} from '../worker.mjs';
const request=(body,origin='https://test.example')=>new Request('https://test.example/api/journal/analyze',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)});
test('journal requires consent, exact scope, same origin and bounded input',async()=>{
 let calls=0; const worker=createWorker({},async()=>{calls++;throw Error();});
 for(const body of [{entry:'happy'},{entry:'happy',consent:false},{entry:'happy',consent:true,history:['private']},{entry:'x'.repeat(2001),consent:true}]) assert.equal((await worker.fetch(request(body),{META_API_KEY:'test-key'})).status,400);
 assert.equal((await worker.fetch(request({entry:'happy',consent:true},'https://other.example'),{META_API_KEY:'test-key'})).status,403);
 assert.equal(calls,0);
});
test('only chosen entry reaches Meta, secret stays server-side and response is no-store',async()=>{
 let sent; const worker=createWorker({},async(url,options)=>{assert.equal(url,'https://api.meta.ai/v1/chat/completions');assert.equal(options.headers.Authorization,'Bearer test-key');sent=JSON.parse(options.body);return Response.json({choices:[{finish_reason:'stop',message:{content:'Your wording sounds sad; what happened today?'}}]});});
 const response=await worker.fetch(request({entry:'im so saddddd',consent:true}),{META_API_KEY:'test-key'});
 assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'no-store');assert.deepEqual(JSON.parse(sent.messages[1].content),{entry:'im so saddddd'});
 assert.equal((await response.text()).includes('test-key'),false);
});
test('provider failures and incomplete output are sanitized',async()=>{
 for(const provider of [async()=>new Response('private upstream details',{status:401}),async()=>Response.json({choices:[{finish_reason:'length',message:{content:'partial'}}]}),async()=>{throw Error('private error');}]) {
 const response=await createWorker({},provider).fetch(request({entry:'test',consent:true}),{META_API_KEY:'test-key'});assert.ok(response.status>=500);assert.doesNotMatch(await response.text(),/private|partial|test-key/);
 }
});
