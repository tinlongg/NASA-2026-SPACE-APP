// Live two-way check-in conversation with the ElevenLabs "CrewSafety Check-in" agent.
// Opt-in only: this sends the microphone audio to ElevenLabs while a check-in is open. The server hands out a
// short-lived signed URL, so the API key is never in the browser. Spoken replies are also classified here with
// the same on-device word matcher as the quiet check-in, so "I'm okay" or "help" ends the check-in.
import { classifyAnswer } from './voice-answer.js';

export const INPUT_RATE = 16000;

/** The first message a client must send. The agent does not start speaking until it arrives. */
export const INIT_MESSAGE = { type: 'conversation_initiation_client_data' };

/** Averages samples down to the target rate (the browser may not honour a 16 kHz AudioContext). */
export function downsample(input, fromRate, toRate = INPUT_RATE) {
  if (toRate >= fromRate) return input;
  const ratio = fromRate / toRate, length = Math.floor(input.length / ratio), out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const start = Math.floor(i * ratio), end = Math.min(input.length, Math.floor((i + 1) * ratio));
    let sum = 0; for (let j = start; j < end; j++) sum += input[j];
    out[i] = sum / Math.max(1, end - start);
  }
  return out;
}

export function floatToPcm16Base64(samples) {
  const bytes = new Uint8Array(samples.length * 2), view = new DataView(bytes.buffer);
  for (let i = 0; i < samples.length; i++) view.setInt16(i * 2, Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), true);
  let binary = ''; for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

export function pcm16Base64ToFloat(base64) {
  const binary = atob(base64), bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const view = new DataView(bytes.buffer), out = new Float32Array(Math.floor(bytes.length / 2));
  for (let i = 0; i < out.length; i++) out[i] = view.getInt16(i * 2, true) / 32768;
  return out;
}

/** 16000 for "pcm_16000"; null for any other format (the page then says it cannot play the agent). */
export function parseOutputRate(format) {
  const match = /^pcm_(\d{4,5})$/.exec(String(format || 'pcm_16000'));
  return match ? Number(match[1]) : null;
}

/** What the agent decided, read from its own reply (its prompt fixes these sentences): 'help', 'ok' or null.
 *  The page follows it, so when the agent tells someone "I'm alerting the crew now" the alert really goes out. */
export function agentOutcome(text) {
  const said = String(text || '').toLowerCase();
  if (/alerting the crew|letting the crew know|help is on the way|getting (you )?help|sending (someone|help)/.test(said)) return 'help';
  if (/glad you'?re (okay|ok|alright|all right)/.test(said)) return 'ok';
  return null;
}

/** One incoming server message to the effect it should have. Pure, so it can be tested without a socket. */
export function interpretMessage(message) {
  switch (message?.type) {
    case 'conversation_initiation_metadata': return { kind: 'ready', outputRate: parseOutputRate(message.conversation_initiation_metadata_event?.agent_output_audio_format) };
    case 'audio': return message.audio_event?.audio_base_64 ? { kind: 'audio', audio: message.audio_event.audio_base_64 } : { kind: 'none' };
    case 'user_transcript': return { kind: 'user', text: String(message.user_transcription_event?.user_transcript || ''), answer: classifyAnswer(message.user_transcription_event?.user_transcript) };
    case 'agent_response': return { kind: 'agent', text: String(message.agent_response_event?.agent_response || '') };
    case 'interruption': return { kind: 'interrupt' };
    case 'ping': return { kind: 'pong', eventId: message.ping_event?.event_id };
    default: return { kind: 'none' };
  }
}

/** Opens the conversation. Returns { ready, stop }. ready resolves once the agent is connected and rejects if it cannot start.
 *  Callbacks: onState('connecting'|'listening'|'speaking'|'ended'), onUser(text, answer), onAgent(text). */
export function startAgentConversation({ signedUrl, onState = () => {}, onUser = () => {}, onAgent = () => {}, WebSocketImpl = globalThis.WebSocket } = {}) {
  let socket, context, stream, processor, source, nextTime = 0, outputRate = INPUT_RATE, stopped = false, playing = new Set(), settle;
  const ready = new Promise((resolve, reject) => { settle = { resolve, reject }; });
  ready.catch(() => {});
  const send = payload => { if (socket?.readyState === 1) socket.send(JSON.stringify(payload)); };
  function stop() {
    if (stopped) return; stopped = true;
    for (const node of playing) { try { node.stop(); } catch {} } playing.clear();
    try { processor?.disconnect(); source?.disconnect(); } catch {}
    stream?.getTracks().forEach(track => track.stop());
    context?.close?.().catch?.(() => {});
    try { socket?.close(); } catch {}
    settle.reject(new Error('stopped')); onState('ended');
  }
  function play(base64) {
    const samples = pcm16Base64ToFloat(base64);
    if (!samples.length || !context) return;
    const buffer = context.createBuffer(1, samples.length, outputRate); buffer.copyToChannel(samples, 0);
    const node = context.createBufferSource(); node.buffer = buffer; node.connect(context.destination);
    nextTime = Math.max(nextTime, context.currentTime + 0.02); node.start(nextTime); nextTime += buffer.duration;
    playing.add(node); onState('speaking');
    node.onended = () => { playing.delete(node); if (!playing.size && !stopped) onState('listening'); };
  }
  (async () => {
    try {
      onState('connecting');
      stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
      context = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: INPUT_RATE });
      await context.resume?.();
      socket = new WebSocketImpl(signedUrl);
      socket.onopen = () => send(INIT_MESSAGE);
      socket.onmessage = event => {
        let message; try { message = JSON.parse(event.data); } catch { return; }
        const effect = interpretMessage(message);
        if (effect.kind === 'ready') {
          if (!effect.outputRate) { settle.reject(new Error('unsupported audio format')); stop(); return; }
          outputRate = effect.outputRate; onState('listening'); settle.resolve();
        } else if (effect.kind === 'audio') play(effect.audio);
        else if (effect.kind === 'user') onUser(effect.text, effect.answer);
        else if (effect.kind === 'agent') onAgent(effect.text);
        else if (effect.kind === 'interrupt') { for (const node of playing) { try { node.stop(); } catch {} } playing.clear(); nextTime = 0; onState('listening'); }
        else if (effect.kind === 'pong') send({ type: 'pong', event_id: effect.eventId });
      };
      socket.onerror = () => { settle.reject(new Error('connection failed')); stop(); };
      socket.onclose = () => { settle.reject(new Error('closed')); stop(); };
      source = context.createMediaStreamSource(stream);
      processor = context.createScriptProcessor(4096, 1, 1);
      processor.onaudioprocess = event => {
        if (stopped || socket?.readyState !== 1) return;
        send({ user_audio_chunk: floatToPcm16Base64(downsample(event.inputBuffer.getChannelData(0), context.sampleRate)) });
      };
      source.connect(processor); processor.connect(context.destination);
    } catch (error) { settle.reject(error); stop(); }
  })();
  return { ready, stop };
}
