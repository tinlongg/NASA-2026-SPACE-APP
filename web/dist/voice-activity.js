// On-device voice activity: is someone talking near the camera? Only the loudness of the speech band
// (300–3400 Hz) is measured, a few times a second. Audio is never recorded, stored or sent anywhere.

export const SPEECH_BAND = [300, 3400];

/** Speech when the speech band stays well above the room's noise floor for long enough. Pure, no DOM. */
export class VoiceActivity {
  constructor({ margin = 12, minSpeech = 0.25, window = 1, riseRate = 0.01, fallRate = 0.3 } = {}) {
    Object.assign(this, { margin, minSpeech, window, riseRate, fallRate }); this.reset();
  }
  reset() { this.floor = null; this.samples = []; this.started = null; }
  /** time in seconds, bandDb the speech-band level in dB. Returns { state, level } (level: dB above the floor). */
  update(time, bandDb) {
    if (!Number.isFinite(bandDb)) return { state: 'unknown', level: null };
    if (this.floor == null) { this.floor = bandDb; this.started = time; }
    const level = bandDb - this.floor, loud = level >= this.margin;
    // The floor follows quiet quickly and noise slowly, so a fan or pump becomes the new quiet in about 10 s,
    // while a few seconds of speech barely move it.
    this.floor += (bandDb - this.floor) * (bandDb < this.floor ? this.fallRate : loud ? this.riseRate / 4 : this.riseRate);
    this.samples.push({ time, loud });
    while (this.samples.length && time - this.samples[0].time > this.window) this.samples.shift();
    if (time - this.started < 0.5) return { state: 'unknown', level };
    let loudFor = 0;
    for (let index = 1; index < this.samples.length; index++) if (this.samples[index].loud) loudFor += this.samples[index].time - this.samples[index - 1].time;
    return { state: loudFor >= this.minSpeech - 1e-9 ? 'speaking' : 'quiet', level };
  }
}

/** Mean power of the given dB bins, in dB. */
export function bandLevel(bins, from, to) {
  let sum = 0, count = 0;
  for (let index = from; index <= to && index < bins.length; index++) { if (Number.isFinite(bins[index])) sum += 10 ** (bins[index] / 10); count++; }
  return count ? 10 * Math.log10(sum / count + 1e-12) : -Infinity;
}

/**
 * Listens to the microphone and calls onSpeech(timeSeconds) every 100 ms while someone is talking.
 * Create it from a click so the browser lets the audio start. isMuted() pauses it, for example while
 * the app's own voice clip plays. Returns { stop(), reading } or throws when the microphone is refused.
 */
export async function startVoiceActivity({ onSpeech, isMuted = () => false }) {
  const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AudioContextClass || !navigator.mediaDevices?.getUserMedia) throw new Error('This browser cannot measure microphone loudness.');
  const audio = new AudioContextClass(); // made before the await, while the click still counts as a user gesture
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false }, video: false }); }
  catch (error) { audio.close(); throw error; }
  await audio.resume().catch(() => {});
  const analyser = audio.createAnalyser(); analyser.fftSize = 1024; analyser.smoothingTimeConstant = 0.2;
  audio.createMediaStreamSource(stream).connect(analyser);
  const bins = new Float32Array(analyser.frequencyBinCount), hz = audio.sampleRate / analyser.fftSize;
  const from = Math.floor(SPEECH_BAND[0] / hz), to = Math.ceil(SPEECH_BAND[1] / hz);
  const vad = new VoiceActivity(), handle = { reading: { state: 'unknown', level: null }, spokeAt: null };
  const timer = setInterval(() => {
    if (isMuted()) { handle.reading = { state: 'muted', level: null }; return; }
    analyser.getFloatFrequencyData(bins);
    const time = performance.now() / 1000;
    handle.reading = vad.update(time, bandLevel(bins, from, to));
    if (handle.reading.state === 'speaking') { handle.spokeAt = time; onSpeech(time); }
  }, 100);
  handle.stop = () => { clearInterval(timer); stream.getTracks().forEach(track => track.stop()); audio.close().catch(() => {}); };
  return handle;
}
