import { journalToneElement, sentimentMetadata } from './journal-sentiment.js';
import { FallDetector, measurePose } from './detector.js';
import { REPLAYS, replayMeasurement } from './fixtures.js';
import { VISION_MODULE, VISION_WASM, POSE_MODEL } from './offline-config.js';
import { initResearch } from './research-ui.js';
import { initializeResearch } from './research.js';
import { initializeCrewSync } from './crew-sync.js';

const researchStyles = document.createElement('link');
researchStyles.rel = 'stylesheet'; researchStyles.href = './research.css';
document.head.append(researchStyles);
initializeResearch();
const syncStyles = document.createElement('link');
syncStyles.rel = 'stylesheet'; syncStyles.href = './crew-sync.css';
document.head.append(syncStyles);
initializeCrewSync();

const element = id => document.getElementById(id);
// Same format as Date.missionTimestamp in the iOS app, e.g. "GMT 318 · 14:02".
const missionTimestamp = date => { const d = new Date(date); const day = Math.floor((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - Date.UTC(d.getUTCFullYear(), 0, 0)) / 86400000); return `GMT ${String(day).padStart(3,'0')} · ${String(d.getUTCHours()).padStart(2,'0')}:${String(d.getUTCMinutes()).padStart(2,'0')}`; };
const video = element('video');
const canvas = element('overlay');
const context = canvas.getContext('2d');
const detector = new FallDetector();
let stream, landmarker, animation, generation = 0, mode = 'idle', lastVideoTime = -1, lastInference = 0;
const events = [];
let latestSnapshot = { source: 'none', capturedAt: null, measurement: null, detection: null };
let coachPending = false;
let journals = [];
try { const saved = JSON.parse(localStorage.getItem('crewsafety-journal') || '[]'); if (Array.isArray(saved)) journals = saved.filter(entry => typeof entry.body === 'string' && typeof entry.date === 'string'); } catch {}
const titles = { dashboard: ['Crew status', 'Pair the iPhone app, or explore the simulated crew in this browser'], monitor: ['Monitor', 'Possible-fall detection from a webcam or a synthetic replay'], alerts: ['Alerts', 'Possible-fall events from this browser session'], muse: ['MUSE', 'NASA research with traceable sources'], journal: ['Journal', 'A private place to reflect, kept in this browser'] };
document.querySelectorAll('[data-tab]').forEach(button => button.addEventListener('click', () => {
  const tab = button.dataset.tab;
  if (tab !== 'monitor') stopSession();
  document.querySelectorAll('.tab, .nav').forEach(node => node.classList.remove('active'));
  button.classList.add('active'); element(tab).classList.add('active');
  element('page-title').textContent = titles[tab][0]; element('page-subtitle').textContent = titles[tab][1];
}));

function stopSession(message = 'Session stopped. Camera released.') {
  generation++; cancelAnimationFrame(animation);
  if (stream) stream.getTracks().forEach(track => track.stop());
  stream = null; video.srcObject = null; mode = 'idle'; detector.reset();
  context.clearRect(0, 0, canvas.width, canvas.height);
  element('camera-placeholder').hidden = false; element('start').disabled = false; element('stop').disabled = true;
  element('mode-label').textContent = 'Camera off'; element('camera-dot').classList.remove('live');
  element('source').textContent = 'Not connected'; element('pose-status').textContent = 'Standby';
  element('angle').textContent = '—'; element('hip').textContent = '—'; element('fps').textContent = '— fps';
  element('tracking').textContent = 'Awaiting camera connection'; element('detector-state').textContent = 'Idle';
  element('camera-message').textContent = message;
}

async function startCamera() {
  stopSession('Requesting camera access…');
  latestSnapshot = { source: 'none', capturedAt: null, measurement: null, detection: null };
  updateCoachContext();
  const session = generation;
  element('start').disabled = true; element('stop').disabled = false;
  try {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error('Camera access requires HTTPS or localhost. Open the hosted link in Chrome or Edge.');
    const camera = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 960 }, height: { ideal: 720 }, facingMode: 'user' }, audio: false });
    if (session !== generation) { camera.getTracks().forEach(track => track.stop()); return; }
    stream = camera; video.srcObject = stream; await video.play();
    if (session !== generation) return;
    element('camera-placeholder').hidden = true;
    element('camera-message').textContent = 'Camera connected. Downloading the pose model for local processing…';
    if (!landmarker) {
      const { FilesetResolver, PoseLandmarker } = await import(VISION_MODULE);
      const files = await FilesetResolver.forVisionTasks(VISION_WASM);
      const loaded = await PoseLandmarker.createFromOptions(files, { baseOptions: { modelAssetPath: POSE_MODEL, delegate: 'CPU' }, runningMode: 'VIDEO', numPoses: 1, minPoseDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
      if (session !== generation) { loaded.close(); return; }
      landmarker = loaded;
    }
    if (session !== generation) return;
    mode = 'live'; lastVideoTime = -1; lastInference = 0;
    element('mode-label').textContent = 'Monitoring · live camera'; element('source').textContent = 'Webcam · live';
    element('camera-dot').classList.add('live'); element('camera-message').textContent = 'Monitoring locally. Keep your full body in frame. No video is recorded or uploaded.';
    stream.getVideoTracks()[0].addEventListener('ended', () => { if (session === generation) stopSession('Camera disconnected. Reconnect it and start again.'); });
    const tick = now => {
      if (session !== generation) return;
      try {
        if (video.readyState >= 2 && video.currentTime !== lastVideoTime && now - lastInference >= 65) {
          const elapsed = now - lastInference; lastInference = now; lastVideoTime = video.currentTime;
          canvas.width = video.videoWidth; canvas.height = video.videoHeight;
          const result = landmarker.detectForVideo(video, now);
          const pose = result.landmarks[0];
          context.clearRect(0, 0, canvas.width, canvas.height);
          if (pose && element('skeleton').checked) drawPose(pose);
          handleMeasurement(now / 1000, measurePose(pose, canvas.width / canvas.height));
          element('fps').textContent = `${Math.min(15, Math.round(1000 / elapsed))} fps`;
        }
        animation = requestAnimationFrame(tick);
      } catch (error) { stopSession(`Tracking failed: ${error.message}. You can still test synthetic replay.`); }
    };
    animation = requestAnimationFrame(tick);
  } catch (error) {
    if (session !== generation) return;
    const messages = { NotAllowedError: 'Camera permission denied. Allow camera access in the address bar, then try again.', NotFoundError: 'No camera found. Connect a webcam or use a synthetic replay.', NotReadableError: 'Camera is busy or unavailable. Close other camera apps and try again.' };
    stopSession(messages[error.name] || `Could not start camera: ${error.message}. Try replay below.`);
  }
}

function drawPose(pose) {
  const links = [[11,12],[11,13],[13,15],[12,14],[14,16],[11,23],[12,24],[23,24],[23,25],[25,27],[24,26],[26,28]];
  context.strokeStyle = '#E7F434'; context.fillStyle = '#FFFFFF'; context.lineWidth = 3;
  for (const [from, to] of links) {
    if ((pose[from]?.visibility ?? 0) < 0.3 || (pose[to]?.visibility ?? 0) < 0.3) continue;
    context.beginPath(); context.moveTo(pose[from].x * canvas.width, pose[from].y * canvas.height); context.lineTo(pose[to].x * canvas.width, pose[to].y * canvas.height); context.stroke();
  }
  for (const point of pose) if ((point.visibility ?? 0) >= 0.3) { context.beginPath(); context.arc(point.x * canvas.width, point.y * canvas.height, 4, 0, Math.PI * 2); context.fill(); }
}

function handleMeasurement(time, measurement) {
  const detection = detector.process(time, measurement);
  latestSnapshot = { source: mode === 'replay' ? 'replay' : 'live', capturedAt: new Date().toISOString(), measurement, detection };
  updateCoachContext();
  element('pose-status').textContent = measurement ? 'Person visible' : 'No reliable pose';
  element('tracking').textContent = measurement ? (mode === 'replay' ? 'Synthetic pose · not a recording' : 'Pose tracking active') : 'No reliable pose · show shoulders and hips';
  element('angle').textContent = measurement ? Math.round(measurement.angle) : '—';
  element('hip').textContent = measurement ? Math.round(measurement.hipY * 100) : '—';
  element('detector-state').textContent = detector.hold ? 'Checking low posture' : 'Monitoring';
  if (!detection) return;
  const details = `Hip height dropped ${Math.round(detection.drop * 100)}% of the frame in ${detection.duration.toFixed(1)} s; torso reached ${Math.round(detection.angle)}°; stayed low for ${detection.held.toFixed(1)} s.`;
  events.unshift({ id: crypto.randomUUID(), date: new Date().toISOString(), source: mode === 'replay' ? 'Synthetic replay' : 'Live webcam', type: 'Possible fall', details, snapshot: structuredClone(latestSnapshot), acknowledged: false });
  element('event-banner').hidden = false; element('event-banner').textContent = `Possible fall · ${events[0].source}. ${details} Review in Alerts.`;
  renderEvents();
}

function replay(kind) {
  stopSession('Synthetic replay running. No camera is used.');
  latestSnapshot = { source: 'none', capturedAt: null, measurement: null, detection: null };
  updateCoachContext();
  const session = generation; mode = 'replay';
  element('stop').disabled = false; element('camera-placeholder').hidden = true;
  element('source').textContent = 'Synthetic replay'; element('mode-label').textContent = 'Replay · generated pose'; element('camera-dot').classList.add('live');
  canvas.width = 800; canvas.height = 600;
  const started = performance.now();
  const tick = now => {
    if (session !== generation) return;
    const time = (now - started) / 1000;
    const { angle, hipY } = replayMeasurement(kind, time);
    context.clearRect(0, 0, 800, 600);
    context.strokeStyle = '#E7F434'; context.fillStyle = '#E7F434'; context.lineWidth = 5; context.lineCap = 'round';
    context.save(); context.translate(380, (1 - hipY) * 600); context.rotate(angle * Math.PI / 180);
    context.beginPath(); context.moveTo(0,0); context.lineTo(0,-130); context.moveTo(0,-110); context.lineTo(-65,-35); context.moveTo(0,-110); context.lineTo(65,-35); context.moveTo(0,0); context.lineTo(-38,150); context.moveTo(0,0); context.lineTo(38,150); context.stroke(); context.beginPath(); context.arc(0,-160,22,0,Math.PI*2); context.stroke(); context.restore();
    handleMeasurement(time, { angle, hipY }); element('fps').textContent = 'Replay';
    if (time < REPLAYS[kind].duration) animation = requestAnimationFrame(tick); else stopSession(`${REPLAYS[kind].label} replay complete. Expected ${REPLAYS[kind].expected} event(s). Review in Alerts.`);
  };
  animation = requestAnimationFrame(tick);
}

function renderEvents() {
  const pending = events.filter(event => !event.acknowledged).length;
  element('alert-count').textContent = pending; element('alert-count').hidden = !pending; element('dashboard-alerts').textContent = pending;
  element('events').replaceChildren();
  if (!events.length) element('events').textContent = 'No events yet. Start a camera session or run the possible-fall replay.';
  for (const event of events) {
    const row = document.createElement('article'); row.className = 'entry';
    const title = document.createElement('strong'); title.textContent = `${event.type} · ${event.source}`;
    const date = document.createElement('time'); date.textContent = missionTimestamp(event.date);
    const details = document.createElement('p'); details.textContent = event.details;
    const button = document.createElement('button'); button.textContent = event.acknowledged ? 'Acknowledged' : 'Acknowledge'; button.disabled = event.acknowledged;
    button.onclick = () => { event.acknowledged = true; renderEvents(); if (events.every(item => item.acknowledged)) element('event-banner').hidden = true; };
    const explain = document.createElement('button'); explain.className = 'coach-event'; explain.textContent = 'Explain with Camera Coach'; explain.disabled = coachPending;
    explain.onclick = () => {
      document.querySelector('[data-tab="monitor"]').click();
      element('coach-panel').scrollIntoView({ behavior: 'smooth', block: 'center' });
      askCoach('Explain why this possible-fall event triggered and what its limitations are.', event.snapshot);
    };
    row.append(title,date,details,button,explain); element('events').append(row);
  }
}

const themes = { sleep: ['sleep','slept','tired','rest','fatigue'], workload: ['work','task','schedule','deadline','busy','shift'], exercise: ['exercise','workout','run','training','gym'], isolation: ['alone','lonely','isolated','homesick'], 'family and home': ['family','home','partner','kids','friend','friends'], food: ['food','meal','eat','dinner','lunch','breakfast'], 'crew and teamwork': ['crew','team','together','commander'], stress: ['stress','stressed','pressure','overwhelmed','worried'], 'physical comfort': ['pain','ache','headache','sore','nausea','dizzy'] };
function summarize(body) { const words = new Set(body.toLowerCase().match(/\b[a-z]+\b/g) || []); const found = Object.entries(themes).filter(([, terms]) => terms.some(term => words.has(term))).map(([theme]) => theme); return found.length ? `You wrote about: ${found.join(', ')}.` : 'No common themes were picked out of this entry.'; }
function renderJournals() {
  element('journal-entries').replaceChildren();
  if (!journals.length) element('journal-entries').textContent = 'Your reflections will appear here.';
  for (const entry of journals) {
    const row = document.createElement('article'); row.className = 'entry';
    const date = document.createElement('time'); date.textContent = new Date(entry.date).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
    const body = document.createElement('p'); body.textContent = entry.body;
    const summary = document.createElement('p'); summary.className = 'tag'; summary.textContent = `${summarize(entry.body)} Summary of your words, not an assessment.`;
    row.append(date,body,summary); if (element('journal-tone-enabled').checked) row.append(journalToneElement(entry.body)); element('journal-entries').append(row);
  }
}
element('journal-tone-enabled').onchange = renderJournals;
element('journal-dataset').textContent = sentimentMetadata.terms.toLocaleString() + ' rated terms · VADER lexicon · MIT license';
element('journal-form').onsubmit = event => {
  event.preventDefault(); const body = element('journal-body').value.trim(); if (!body) return;
  const updated = [{ body, date: new Date().toISOString() }, ...journals];
  try { localStorage.setItem('crewsafety-journal', JSON.stringify(updated)); journals = updated; element('journal-body').value = ''; element('journal-message').textContent = 'Saved on this browser only.'; renderJournals(); } catch { element('journal-message').textContent = 'Browser storage is unavailable or full. Your text has not been cleared.'; }
};
element('clear-journal').onclick = () => { if (!journals.length || !confirm('Delete all journal entries from this browser?')) return; try { localStorage.removeItem('crewsafety-journal'); journals = []; renderJournals(); } catch { element('journal-message').textContent = 'Could not clear browser storage.'; } };
const coachPanel = document.createElement('div'); coachPanel.className = 'panel instructions'; coachPanel.id = 'coach-panel';
coachPanel.innerHTML = '<p class="eyebrow">Optional · uses Meta</p><h3>Camera Coach</h3><p id="pose-summary">Start the camera or run a replay first.</p><button id="analyze-pose" class="primary" disabled>Explain pose summary</button><p class="micro">Sends your question and numerical pose summary to Meta on click. No video, images, journal entries, or crew identity. Not NASA research or a medical assessment.</p><p id="coach-status" role="status">Checking coach configuration…</p><div id="coach-chat" class="entries" aria-live="polite"></div><form id="coach-form"><label for="coach-question">Camera setup or pose question</label><input id="coach-question" required maxlength="500" placeholder="How should I frame the camera?"><button id="ask-coach">Ask Camera Coach</button></form>';

document.querySelector('.monitor-side').append(coachPanel);

function updateCoachContext() {
  if (!element('pose-summary')) return;
  const snapshot = latestSnapshot;
  const description = snapshot.source === 'none' ? 'No pose captured yet.' : `${snapshot.source === 'replay' ? 'Synthetic replay' : 'Webcam'} · captured ${new Date(snapshot.capturedAt).toLocaleTimeString()} · ${snapshot.measurement ? `torso ${Math.round(snapshot.measurement.angle)}°, hip height ${Math.round(snapshot.measurement.hipY * 100)}%` : 'no reliable pose'}`;
  element('pose-summary').textContent = description;
  element('analyze-pose').disabled = coachPending || snapshot.source === 'none';
}

async function askCoach(question, snapshot = latestSnapshot, target = null) {
  if (coachPending) return;
  const sentSnapshot = structuredClone(snapshot);
  coachPending = true; element('ask-coach').disabled = true;
  document.querySelectorAll('.coach-event').forEach(button => { button.disabled = true; });
  updateCoachContext();
  const row = document.createElement('article'); row.className = 'entry';
  const title = document.createElement('strong'); title.textContent = question;
  const date = document.createElement('time'); date.textContent = sentSnapshot.source === 'none' ? 'No observation attached' : `${sentSnapshot.source === 'replay' ? 'Synthetic replay' : 'Webcam'} captured ${new Date(sentSnapshot.capturedAt).toLocaleString()}`;
  const answer = document.createElement('p'); answer.textContent = 'Camera Coach is analyzing the summary…';
  row.append(title,date,answer); element('coach-chat').append(row);
  if (target) target.textContent = answer.textContent;
  try {
    const response = await fetch('/api/coach/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question, snapshot: sentSnapshot }), signal: AbortSignal.timeout(30000) });
    let data;
    try { data = await response.json(); } catch { throw new Error('Camera Coach requires the hosted site or the local Node server.'); }
    if (!response.ok) throw new Error(data.error || 'Camera Coach is temporarily unavailable.');
    if (typeof data.answer !== 'string') throw new Error('Camera Coach returned an invalid reply.');
    answer.textContent = data.answer;
    if (target) target.textContent = data.answer;
    element('coach-status').textContent = `Connected · Meta ${data.model} · AI interpretation, not a verified finding`;
    return true;
  } catch (error) {
    const message = error.name === 'TimeoutError' ? 'Camera Coach timed out. Try again; local detection continues independently.' : error.message;
    answer.textContent = message; if (target) target.textContent = message;
    element('coach-status').textContent = `Analysis failed · ${message}`;
    return false;
  } finally {
    coachPending = false; element('ask-coach').disabled = false;
    document.querySelectorAll('.coach-event').forEach(button => { button.disabled = false; });
    updateCoachContext();
  }
}

element('analyze-pose').onclick = () => askCoach('Explain this pose summary and any camera setup limitations. Do not confirm a fall.', latestSnapshot);
element('coach-form').onsubmit = async event => {
  event.preventDefault(); const question = element('coach-question').value.trim(); if (!question || coachPending) return;
  if (await askCoach(question)) if (element('coach-question').value.trim() === question) element('coach-question').value = '';
};
fetch('/api/coach/status').then(response => { if (!response.ok) throw new Error(); return response.json(); }).then(data => {
  element('coach-status').textContent = data.configured ? `Meta ${data.model} configured · send a question to verify access` : 'Camera Coach needs a server-side Meta API key.';
}).catch(() => { element('coach-status').textContent = 'Camera Coach needs the hosted site or local Node server.'; });
element('export-events').onclick = () => { const url = URL.createObjectURL(new Blob([JSON.stringify(events,null,2)], { type: 'application/json' })); const link = document.createElement('a'); link.href = url; link.download = 'crewsafety-events.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url),1000); };
element('start').onclick = startCamera; element('stop').onclick = () => stopSession();
for (const [kind, fixture] of Object.entries(REPLAYS)) { const button = document.createElement('button'); button.dataset.replay = kind; button.textContent = fixture.label; element('replay-actions').append(button); }
document.querySelectorAll('[data-replay]').forEach(button => button.onclick = () => replay(button.dataset.replay));
document.addEventListener('visibilitychange', () => { if (document.hidden) stopSession('Session stopped while the page was hidden. Start again to resume.'); });
window.addEventListener('pagehide', () => stopSession());
// Same deterministic curve as SimulatedTelemetryProvider in the iOS app: one sample every 10 s, last 30 minutes.
const TELEMETRY_SEED = 412;
function simulatedHeartRate(t, seed = TELEMETRY_SEED) {
  const value = 66 + (seed % 9) + 6 * Math.sin(t / 600 + seed) + 3 * Math.sin(t / 97 + seed * 2) + 2 * Math.sin(t * 12.9898 + seed * 78.233);
  return Math.min(95, Math.max(55, Math.round(value * 10) / 10));
}
function updateDashboard() {
  const end = Math.floor(Date.now() / 10000) * 10;
  const rates = Array.from({ length: 180 }, (_, i) => simulatedHeartRate(end - (179 - i) * 10));
  element('heart-rate').textContent = Math.round(rates.at(-1));
  element('chart-line').setAttribute('d', rates.map((rate, index) => `${index ? 'L' : 'M'}${(index * 900 / 179).toFixed(1)},${(170 - (rate - 50) * 3.2).toFixed(1)}`).join(' '));
  element('clock').textContent = missionTimestamp(new Date());
}
setInterval(updateDashboard,2000); updateDashboard(); renderEvents(); renderJournals();

initResearch();
async function offlineSetup() {
  if (!('serviceWorker' in navigator)) { element('offline-status').textContent = 'Offline caching is not supported in this browser.'; return; }
  try {
    await navigator.serviceWorker.register('/sw.js', { type: 'module', updateViaCache: 'none' });
    const registration = await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) await new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }));
    const query = type => new Promise((resolve, reject) => {
      const channel = new MessageChannel();
      const timer = setTimeout(() => { channel.port1.close(); reject(new Error('Offline preparation timed out. Reconnect and retry.')); }, 300000);
      channel.port1.onmessage = event => { clearTimeout(timer); channel.port1.close(); event.data.error ? reject(new Error(event.data.error)) : resolve(event.data); };
      navigator.serviceWorker.controller.postMessage({ type }, [channel.port2]);
    });
    const show = state => { element('offline-status').textContent = state.modelReady && state.shellReady ? 'Shell and camera model cached. Test offline on this device before the demo.' : state.shellReady ? 'Shell ready: replay, alerts, journal, and saved research cached. Camera model not fully cached.' : 'Shell cache incomplete. Reload while online.'; };
    show(await query('status')); element('prepare-offline').disabled = false;
    element('prepare-offline').onclick = async () => {
      element('prepare-offline').disabled = true; element('offline-status').textContent = 'Downloading pose model and runtime files. Keep this page open…';
      try { show(await query('prepare-model')); } catch (error) { element('offline-status').textContent = error.message; }
      finally { element('prepare-offline').disabled = false; }
    };
  } catch { element('offline-status').textContent = 'Offline caching unavailable. Reload online and check browser storage permissions.'; }
}
offlineSetup();
