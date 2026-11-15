import test from 'node:test';
import assert from 'node:assert/strict';
import { downsample, floatToPcm16Base64, pcm16Base64ToFloat, parseOutputRate, interpretMessage } from '../dist/voice-agent.js';
import { createWorker } from '../worker.mjs';
import { handleCheckinVoice, cllCheckinConfigured } from '../calls.mjs';

test('audio survives a round trip through 16-bit PCM and is clipped, not wrapped', () => {
  const back = pcm16Base64ToFloat(floatToPcm16Base64(new Float32Array([0, 0.5, -0.5, 2, -2])));
  assert.deepEqual([...back].map(v => Math.round(v * 100) / 100), [0, 0.5, -0.5, 1, -1]);
});

test('downsampling averages and leaves lower rates alone', () => {
  assert.deepEqual([...downsample(new Float32Array([1, 3, 5, 7]), 32000, 16000)], [2, 6]);
  const same = new Float32Array([1, 2]); assert.equal(downsample(same, 16000, 16000), same);
  assert.equal(downsample(new Float32Array(480), 48000, 16000).length, 160);
});

test('only PCM output is played', () => {
  assert.equal(parseOutputRate('pcm_16000'), 16000); assert.equal(parseOutputRate('pcm_44100'), 44100);
  assert.equal(parseOutputRate(undefined), 16000); assert.equal(parseOutputRate('ulaw_8000'), null);
});

test('server messages become the right effect, and spoken answers are classified on the page', () => {
  assert.deepEqual(interpretMessage({ type: 'conversation_initiation_metadata', conversation_initiation_metadata_event: { agent_output_audio_format: 'pcm_16000' } }), { kind: 'ready', outputRate: 16000 });
  assert.deepEqual(interpretMessage({ type: 'ping', ping_event: { event_id: 7 } }), { kind: 'pong', eventId: 7 });
  assert.equal(interpretMessage({ type: 'user_transcript', user_transcription_event: { user_transcript: "I'm okay" } }).answer, 'ok');
  assert.equal(interpretMessage({ type: 'user_transcript', user_transcription_event: { user_transcript: 'help me' } }).answer, 'help');
  assert.equal(interpretMessage({ type: 'user_transcript', user_transcription_event: { user_transcript: 'what time is it' } }).answer, null);
  assert.equal(interpretMessage({ type: 'interruption' }).kind, 'interrupt');
  assert.equal(interpretMessage({ type: 'audio', audio_event: {} }).kind, 'none');
  assert.equal(interpretMessage({ type: 'something_new' }).kind, 'none');
});

const origin = 'https://test.example', env = { ELEVENLABS_API_KEY: 'k', ELEVENLABS_CHECKIN_AGENT_ID: 'agent_checkin' };
const post = (headers = { Origin: origin }) => new Request(origin + '/api/checkin/voice/session', { method: 'POST', headers });

test('the signed link is issued server-side to this website only, and the key is never returned', async () => {
  const seen = [], fetcher = async (url, init) => { seen.push({ url, init }); return Response.json({ signed_url: 'wss://api.elevenlabs.io/v1/convai/conversation?agent_id=agent_checkin&token=t' }); };
  const response = await handleCheckinVoice(post(), env, fetcher), text = await response.text();
  assert.equal(response.status, 200); assert.ok(JSON.parse(text).signedUrl.startsWith('wss://')); assert.ok(!text.includes('"k"'));
  assert.match(seen[0].url, /get-signed-url\?agent_id=agent_checkin$/); assert.equal(seen[0].init.headers['xi-api-key'], 'k');
  assert.equal((await handleCheckinVoice(post({ Origin: 'https://evil.example' }), env, fetcher)).status, 403);
  assert.equal((await handleCheckinVoice(post(), {}, fetcher)).status, 503);
  assert.equal((await handleCheckinVoice(post(), env, async () => new Response('no', { status: 401 }))).status, 502);
  assert.equal((await handleCheckinVoice(post(), env, async () => Response.json({ signed_url: 'https://not-a-socket' }))).status, 502);
  assert.equal((await handleCheckinVoice(post(), env, async () => { throw Error('down'); })).status, 504);
});

test('status reports whether the agent is configured, and the Worker routes it', async () => {
  assert.equal(cllCheckinConfigured({}), false); assert.equal(cllCheckinConfigured(env), true);
  const worker = createWorker({}, async () => { throw Error('none'); });
  assert.deepEqual(await (await worker.fetch(new Request(origin + '/api/checkin/voice/status'), env)).json(), { configured: true });
  assert.deepEqual(await (await worker.fetch(new Request(origin + '/api/checkin/voice/status'), {})).json(), { configured: false });
});

test('the page follows what the check-in agent decided', async () => {
  const { agentOutcome } = await import('../dist/voice-agent.js');
  assert.equal(agentOutcome("[apologetic] Okay, I'm alerting the crew now. Stay where you are, help is on the way."), 'help');
  assert.equal(agentOutcome("[warmly] Thanks, glad you're okay. I'll let the crew know."), 'ok');
  assert.equal(agentOutcome('Hey, are you okay?'), null);
});
