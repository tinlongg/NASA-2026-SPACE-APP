import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorker} from '../worker.mjs';
import {deviceJournalPayload} from '../dist/journal-reflection.js';
const request=(body,origin='https://test.example')=>new Request('https://test.example/api/journal/analyze',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)});
const entry=(body,days=0)=>({body,date:new Date(Date.now()-days*86400000).toISOString()});
const payload=()=>({entry:entry('Feeling sad again.'),history:[entry('Feeling sad again.',2),entry('Enjoyed seeing friends.',1)],consent:true});
const feedback={message:'You have described a difficult stretch, as well as a good time with friends.',suggestions:['Consider checking in with a trusted friend.'],question:'What would feel manageable today?'};
const complete=value=>Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(value)}}]});
test('journal requires disclosed consent, exact scope, same origin and bounded dated input',async()=>{
 let calls=0; const worker=createWorker({},async()=>{calls++;throw Error();});
 for(const body of [{...payload(),consent:false},{...payload(),memory:true},{...payload(),entry:entry('x'.repeat(10001))},{...payload(),history:Array(12).fill(entry('past'))},{...payload(),history:[entry('stale',15)]},{...payload(),history:[entry('future',-1)]},{...payload(),entry:{body:'ok',date:'invalid'}},{...payload(),entry:{...entry('ok'),sentiment:-1}}]) assert.equal((await worker.fetch(request(body),{META_API_KEY:'test-key'})).status,400);
 assert.equal((await worker.fetch(request(payload(),'https://other.example'),{META_API_KEY:'test-key'})).status,403);
 assert.equal(calls,0);
});
test('MUSE gets chronological mixed history and internal analysis; public result excludes analysis and reasoning',async()=>{
 let sent; const worker=createWorker({},async(url,options)=>{assert.equal(url,'https://api.meta.ai/v1/chat/completions');assert.equal(options.headers.Authorization,'Bearer test-key');sent=JSON.parse(options.body);return complete({...feedback,internalAnalysis:'private',sentiment:-1,summary:'private'});});
 const input=payload(), response=await worker.fetch(request(input),{META_API_KEY:'test-key'});
 assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'no-store');
 const context=JSON.parse(sent.messages[1].content).entries;
 assert.deepEqual(context.map(e=>e.text),[...input.history,input.entry].map(e=>e.body));
 assert.ok(context.every(e=>typeof e.internalAnalysis.score==='number'));
 const result=await response.json();assert.equal(result.context.entryCount,3);assert.equal(result.message,feedback.message);
 assert.doesNotMatch(JSON.stringify(result),/test-key|private|sentiment|score|summary|internalAnalysis|reasoning/);
 assert.match(sent.messages[0].content,/Never diagnose/);assert.match(sent.messages[0].content,/positive entries/);
});
test('long current entries are complete; earlier excerpts are identified',async()=>{
 let sent; const worker=createWorker({},async(_,options)=>{sent=JSON.parse(options.body);return complete(feedback);});
 const response=await worker.fetch(request({...payload(),entry:entry('x'.repeat(10000)),history:[entry('y'.repeat(9000),1)]}),{META_API_KEY:'test-key'});
 assert.equal(response.status,200);
 const context=JSON.parse(sent.messages[1].content).entries;
 assert.equal(context[0].text.length,1500);assert.equal(context[0].excerpted,true);assert.equal(context[1].text.length,10000);assert.equal(context[1].excerpted,false);
});
test('provider failures, incomplete or invalid output never produce fallback analysis',async()=>{
 for(const provider of [async()=>new Response('private upstream details',{status:401}),async()=>Response.json({choices:[{finish_reason:'length',message:{content:'partial'}}]}),async()=>complete({message:'incomplete'}),async()=>Response.json(null),async()=>{throw Error('private error');}]) {
 const response=await createWorker({},provider).fetch(request(payload()),{META_API_KEY:'test-key'});assert.ok(response.status>=500);assert.doesNotMatch(await response.text(),/private|partial|test-key|Local analysis/);
 }
 const response=await createWorker().fetch(request(payload()),{});assert.equal(response.status,503);
});
test('device history includes repeated wording and positives, caps recent entries, excludes future and old notes',()=>{
 const current={id:'current',...entry('same')}, all=Array.from({length:20},(_,n)=>({id:String(n),...entry(n%2?'same':'happy',n+1)}));
 const result=deviceJournalPayload(current,[current,...all,{id:'future',...entry('future',-1)}]);
 assert.equal(result.history.length,11);assert.equal(result.history[0].body,'happy');assert.equal(result.history.at(-1).body,'happy');
 assert.ok(result.history.some(e=>e.body==='same'));assert.ok(result.history.every(e=>!('id' in e)));
});

test('MUSE reviews every save but routine suggestions require three recent entries',async()=>{
 for(const count of [1,2,3]) {
  let calls=0;
  const worker=createWorker({},async()=>{calls++;return complete(feedback);});
  const response=await worker.fetch(request({entry:entry('today'),history:Array.from({length:count-1},(_,i)=>entry('earlier',i+1)),consent:true}),{META_API_KEY:'test-key'});
  assert.equal(response.status,200);assert.equal(calls,1);
  const result=await response.json();assert.equal(result.context.entryCount,count);assert.equal(result.context.minimumEntries,3);
  assert.deepEqual(result.suggestions,count<3?[]:feedback.suggestions);
 }
});
test('early reflections accept empty suggestions and preserve urgent human-support wording',async()=>{
 const support={message:'Please contact someone you trust or local emergency help now if you are in immediate danger.',question:'Can someone stay with you?',suggestions:[]};
 for(const count of [1,2,3]) {
  const response=await createWorker({},async()=>complete(support)).fetch(request({entry:entry('synthetic urgent support test'),history:Array.from({length:count-1},(_,i)=>entry('earlier',i+1)),consent:true}),{META_API_KEY:'test-key'});
  assert.equal(response.status,count<3?200:502);
  if(count<3) {const result=await response.json();assert.equal(result.message,support.message);assert.deepEqual(result.suggestions,[]);}
 }
});
test('demo uses only three server-owned fictional entries and never touches account storage',async()=>{
 let sent,calls=0;
 const worker=createWorker({},async(_,options)=>{calls++;sent=JSON.parse(options.body);return complete(feedback);});
 const demo=(body,origin='https://test.example')=>new Request('https://test.example/api/journal/demo',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:'cs_session=pretend'},body:JSON.stringify(body)});
 const env={META_API_KEY:'test-key',DB:new Proxy({},{get(){throw Error('Demo must never access database');}})};
 const response=await worker.fetch(demo({consent:true}),env);
 assert.equal(response.status,200);const result=await response.json();assert.equal(result.demo,true);assert.equal(result.context.entryCount,3);assert.deepEqual(result.suggestions,feedback.suggestions);
 const context=JSON.parse(sent.messages[1].content).entries;
 assert.equal(context.length,3);assert.ok(context.every(e=>e.text.startsWith('Fictional astronaut demo')));
 assert.equal(Date.parse(context[2].date)-Date.parse(context[0].date),2*86400000);
 for(const body of [{consent:false},{consent:true,history:[entry('private note')]},{consent:true,entryId:crypto.randomUUID()},{consent:true,entry:entry('private')}]) assert.equal((await worker.fetch(demo(body),env)).status,400);
 assert.equal((await worker.fetch(demo({consent:true},'https://other.example'),env)).status,403);assert.equal(calls,1);
 assert.equal((await createWorker().fetch(demo({consent:true}),{})).status,503);
});
