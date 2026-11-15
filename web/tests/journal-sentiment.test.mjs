import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeJournalTone,sentimentMetadata,normalizeJournalWord} from '../journal-analysis.mjs';
test('uses a substantial pinned human-rated dataset',()=>{assert.ok(sentimentMetadata.terms>7000);assert.match(sentimentMetadata.sha256,/^[a-f0-9]{64}$/);});
test('positive, negative and mixed reflections are distinguished',()=>{
 assert.equal(analyzeJournalTone('I feel happy and grateful today.').label,'Positive tone');
 assert.equal(analyzeJournalTone('I feel sad and miserable.').label,'Negative tone');
 assert.equal(analyzeJournalTone('Happy and sad.').label,'Mixed tone');
});
test('negation is bounded by clauses and modifies wording, not author health',()=>{
 assert.ok(analyzeJournalTone('I am not happy').score<0);
 assert.equal(analyzeJournalTone('I am super sad').label,'Negative tone');
 assert.ok(analyzeJournalTone('I am not sad').score>0);
 assert.ok(analyzeJournalTone('Not today. I am happy.').score>0);
 assert.ok(analyzeJournalTone('I am not only happy').score>0);
 assert.ok(analyzeJournalTone('Very happy').score>analyzeJournalTone('Happy').score);
});
test('unknown and empty wording do not imply neutrality',()=>{
 for(const text of ['', 'Quux xyzzy', '今日は記録しました']) assert.equal(analyzeJournalTone(text).label,'Not enough signal');
});
test('stretched spelling preserves dictionary words and explains normalization',()=>{
 const r=analyzeJournalTone('im so saddddd'); assert.equal(r.label,'Negative tone');
 assert.equal(r.matches[0].term,'saddddd'); assert.equal(r.matches[0].normalized,'sad');
 for(const text of ['soooo saddddd','SADDDDD','im hella bummed']) assert.equal(analyzeJournalTone(text).label,'Negative tone');
 for(const text of ['happppy','goooood','luvvvv this','rly gud']) assert.equal(analyzeJournalTone(text).label,'Positive tone');
 assert.equal(normalizeJournalWord('happy'),'happy'); assert.equal(normalizeJournalWord('good'),'good');
 assert.equal(analyzeJournalTone('not saddddd').label,'Positive tone');
 assert.equal(analyzeJournalTone('dont luv this').label,'Negative tone');
});
test('contextual slang does not label literal cooking as exhaustion',()=>{
 assert.equal(analyzeJournalTone('im cooked').label,'Negative tone');
 assert.equal(analyzeJournalTone('I cooked dinner').label,'Not enough signal');
 assert.equal(analyzeJournalTone('xyzzzzzy').label,'Not enough signal');
 assert.equal(analyzeJournalTone('a'.repeat(10000)).label,'Not enough signal');
});
