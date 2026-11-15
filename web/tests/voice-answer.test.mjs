import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyAnswer } from '../dist/voice-answer.js';

test('spoken answers are matched to okay or help', () => {
  for (const text of ["I'm okay", 'i am ok', 'Yeah, fine', 'all good', 'yes', 'Okay.', "I'm fine thanks"]) assert.equal(classifyAnswer(text), 'ok', text);
  for (const text of ['help', 'I need help!', 'help me', 'emergency', "I'm hurt", 'not okay', "I'm not ok", 'I am not fine', 'I cannot breathe', "I can't move", 'Please send someone', 'Not really, I feel dizzy', 'No', 'my chest hurts', 'okay... actually I feel sick']) assert.equal(classifyAnswer(text), 'help', text);
  for (const text of ['No problem, I am fine', 'no worries, all good']) assert.equal(classifyAnswer(text), 'ok', text);
  for (const text of ['', '   ', 'what', 'the weather is nice', null, undefined]) assert.equal(classifyAnswer(text), null, String(text));
});

test('asking for help wins over an okay word in the same sentence', () => {
  assert.equal(classifyAnswer("okay I need help"), 'help');
  assert.equal(classifyAnswer("I'm not okay"), 'help');
});
