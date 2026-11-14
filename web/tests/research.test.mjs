import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createWorker } from '../worker.mjs';
import { retrieve, tokenize } from '../research.mjs';
import { pickDemo, requestResearch } from '../dist/research-ui.js';

const corpus = JSON.parse(await readFile(new URL('../research-data.json', import.meta.url)));
const entries = JSON.parse(await readFile(new URL('../dist/fallback.json', import.meta.url)));
const req = body => new Request('https://crew.test/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const env = { META_API_KEY: 'test-only-secret' };
const fail = () => { throw new Error('provider timeout'); };

test('frozen chat contract serves NASA excerpts and ignores unknown context', async () => {
  const worker = createWorker({}, fail, corpus);
  const response = await worker.fetch(req({ question: 'exercise and fitness', context: 'other' }), {});
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(Object.keys(body).sort(), ['answer','answerMode','citations','disclaimer','grounded']);
  assert.equal(body.grounded, true); assert.equal(body.answerMode, 'extractive');
  assert.ok(body.citations.some(c => c.url.includes('nasa.gov')));
  assert.ok(body.answer.includes('1.5 hours'));
});
test('empty and irrelevant queries do not call a model or invent citations', async () => {
  let called = false;
  const worker = createWorker({}, () => { called = true; }, corpus);
  const body = await (await worker.fetch(req({question:'What is the capital of France?'}), env)).json();
  assert.equal(body.grounded, false); assert.deepEqual(body.citations, []); assert.equal(called, false);
  const empty = createWorker({}, fail, { ...corpus, chunks: [] });
  assert.equal((await (await empty.fetch(req({question:'exercise'}), env)).json()).grounded, false);
});
test('provider errors, malformed and incomplete replies all preserve extractive answers', async () => {
  for (const provider of [fail, async () => new Response('private diagnostics', {status:401}), async () => Response.json({}), async () => Response.json({choices:[{finish_reason:'length',message:{content:'partial'}}]})]) {
    const worker = createWorker({}, provider, corpus);
    const body = await (await worker.fetch(req({question:'sleep loss'}), env)).json();
    assert.equal(body.answerMode,'extractive'); assert.equal(body.grounded,true); assert.ok(body.citations.length);
    assert.ok(!JSON.stringify(body).includes('private diagnostics'));
  }
});
test('only question and retrieved passages reach Meta; citation metadata cannot be overridden', async () => {
  let sent;
  const worker = createWorker({}, async (_,options) => {
    sent = JSON.parse(options.body);
    return Response.json({choices:[{finish_reason:'stop',message:{content:'Ground analog research is limited.'}}],citations:[{url:'https://fake.test'}]});
  }, corpus);
  const body = await (await worker.fetch(req({question:'bed rest exercise study',journal:'PRIVATE JOURNAL',snapshot:{frame:'PRIVATE FRAME'}}), env)).json();
  assert.equal(body.answerMode,'generated');
  assert.ok(!JSON.stringify(sent).includes('PRIVATE')); assert.ok(!JSON.stringify(sent).includes(env.META_API_KEY));
  assert.ok(body.citations.every(c => corpus.sources.some(s => s.url === c.url && s.title === c.title)));
});
test('invalid questions, broken index and throttling follow error/fallback contract', async () => {
  const worker = createWorker({}, fail, corpus);
  for (const question of ['', '   ', 2, null, 'x'.repeat(501)]) {
    const response = await worker.fetch(req({question}), env);
    assert.equal(response.status,400); assert.equal((await response.json()).error.code,'invalid_question');
  }
  assert.equal((await worker.fetch(req({question:'  ' + 'x'.repeat(500) + '  '}), {})).status,200);
  const missing = createWorker();
  assert.equal((await missing.fetch(req({question:'sleep'}))).status,503);
  let calls = 0;
  const limited = createWorker({}, async () => { calls++; return Response.json({choices:[{finish_reason:'stop',message:{content:'Answer.'}}]}); },corpus);
  for(let i=0;i<6;i++) {
    const body = await (await limited.fetch(req({question:'sleep loss'}),env)).json();
    assert.equal(body.answerMode,i<5?'generated':'extractive');
  }
  assert.equal(calls,5);
});
test('real corpus covers prepared topics and OSDR scope', () => {
  assert.equal(corpus.sources.length,5); assert.equal(corpus.chunks.length,8);
  for (const entry of entries) {
    assert.ok(retrieve(entry.question,corpus).length);
    assert.ok(entry.citations.every(c => corpus.sources.some(s => s.title===c.title && s.url===c.url)));
  }
  const hits=retrieve('OSD-946',corpus);
  assert.equal(hits[0].source.id,'osd-946');
  assert.match(hits[0].chunk.text,/Ground Study/);
  assert.deepEqual(tokenize('What does NASA recommend about exercising?',corpus.stopwords),['exercis']);
});
test('offline fallback is explicit and never matches an unrelated question by keyword',async () => {
  const entry=entries[0];
  assert.equal(pickDemo(entry.question.toUpperCase(),entries).id,entry.id);
  assert.equal(pickDemo('Does exercise cure my injury?',entries),null);
  const demo=await requestResearch(entry.question,entries,{fetcher:fail});
  assert.equal(demo.answerMode,'precomputed'); assert.equal(demo.question,entry.question);
  await assert.rejects(requestResearch('Does exercise cure my injury?',entries,{demo:true}),/No saved answer/);
  const explicit=await requestResearch(entry.question,entries,{demo:true,fetcher:()=>{throw new Error('must not send');}});
  assert.equal(explicit.answerMode,'precomputed');
});
