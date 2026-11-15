import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeJournalTone,sentimentMetadata} from '../dist/journal-sentiment.js';
test('uses a substantial pinned human-rated dataset',()=>{assert.ok(sentimentMetadata.terms>7000);assert.match(sentimentMetadata.sha256,/^[a-f0-9]{64}$/);});
test('positive, negative and mixed reflections are distinguished',()=>{
 assert.equal(analyzeJournalTone('I feel happy and grateful today.').label,'Positive tone');
 assert.equal(analyzeJournalTone('I feel sad and miserable.').label,'Negative tone');
 assert.equal(analyzeJournalTone('Happy and sad.').label,'Mixed tone');
});
test('negation is bounded by clauses and modifies wording, not author health',()=>{
 assert.ok(analyzeJournalTone('I am not happy').score<0);
 assert.ok(analyzeJournalTone('I am not sad').score>0);
 assert.ok(analyzeJournalTone('Not today. I am happy.').score>0);
 assert.ok(analyzeJournalTone('I am not only happy').score>0);
 assert.ok(analyzeJournalTone('Very happy').score>analyzeJournalTone('Happy').score);
});
test('unknown and empty wording do not imply neutrality',()=>{
 for(const text of ['', 'Quux xyzzy', '今日は記録しました']) assert.equal(analyzeJournalTone(text).label,'Not enough signal');
});
