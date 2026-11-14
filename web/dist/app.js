import { FallDetector, measurePose } from './detector.js';
import { initializeResearch } from './research.js';

const researchStyles = document.createElement('link');
researchStyles.rel = 'stylesheet'; researchStyles.href = './research.css';
document.head.append(researchStyles);
initializeResearch();

const element = id => document.getElementById(id);
const video = element('video');
const canvas = element('overlay');
const context = canvas.getContext('2d');
const detector = new FallDetector();
let stream, landmarker, animation, generation = 0, mode = 'idle', lastVideoTime = -1, lastInference = 0;
const events = [];
let journals = [];
try { const saved = JSON.parse(localStorage.getItem('crewsafety-journal') || '[]'); if (Array.isArray(saved)) journals = saved.filter(entry => typeof entry.body === 'string' && typeof entry.date === 'string'); } catch {}
const titles = { monitor: ['Camera monitor', 'A clearer view of your crew. Right from your browser.'], dashboard: ['Crew dashboard', 'Simulated crew telemetry and NASA spaceflight research.'], alerts: ['Safety events', 'Review possible-fall detections from this browser session.'], muse: ['MUSE assistant', 'Research support, grounded in verified sources.'], journal: ['Wellness journal', 'A private space to reflect on your day.'] };
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
  element('mode-label').textContent = 'CAMERA OFFLINE'; element('camera-dot').classList.remove('live');
  element('source').textContent = 'Not connected'; element('pose-status').textContent = 'Standby';
  element('angle').textContent = '—'; element('hip').textContent = '—'; element('fps').textContent = '— FPS';
  element('tracking').textContent = 'Awaiting camera connection'; element('detector-state').textContent = 'Idle';
  element('camera-message').textContent = message;
}

async function startCamera() {
  stopSession('Requesting camera access…');
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
      const { FilesetResolver, PoseLandmarker } = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/vision_bundle.mjs');
      const files = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm');
      const loaded = await PoseLandmarker.createFromOptions(files, { baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task', delegate: 'CPU' }, runningMode: 'VIDEO', numPoses: 1, minPoseDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
      if (session !== generation) { loaded.close(); return; }
      landmarker = loaded;
    }
    if (session !== generation) return;
    mode = 'live'; lastVideoTime = -1; lastInference = 0;
    element('mode-label').textContent = 'LIVE CAMERA'; element('source').textContent = 'Webcam · live';
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
          element('fps').textContent = `${Math.min(15, Math.round(1000 / elapsed))} FPS`;
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
  context.strokeStyle = '#baf27a'; context.fillStyle = '#e2ffb8'; context.lineWidth = 3;
  for (const [from, to] of links) {
    if ((pose[from]?.visibility ?? 0) < 0.3 || (pose[to]?.visibility ?? 0) < 0.3) continue;
    context.beginPath(); context.moveTo(pose[from].x * canvas.width, pose[from].y * canvas.height); context.lineTo(pose[to].x * canvas.width, pose[to].y * canvas.height); context.stroke();
  }
  for (const point of pose) if ((point.visibility ?? 0) >= 0.3) { context.beginPath(); context.arc(point.x * canvas.width, point.y * canvas.height, 4, 0, Math.PI * 2); context.fill(); }
}

function handleMeasurement(time, measurement) {
  const detection = detector.process(time, measurement);
  element('pose-status').textContent = measurement ? 'Person visible' : 'No reliable pose';
  element('tracking').textContent = measurement ? (mode === 'replay' ? 'Synthetic pose · not a recording' : 'Pose tracking active') : 'No reliable pose · show shoulders and hips';
  element('angle').textContent = measurement ? Math.round(measurement.angle) : '—';
  element('hip').textContent = measurement ? Math.round(measurement.hipY * 100) : '—';
  element('detector-state').textContent = detector.hold ? 'Checking low posture' : 'Monitoring';
  if (!detection) return;
  const details = `Hip height dropped ${Math.round(detection.drop * 100)}% of the frame in ${detection.duration.toFixed(1)} s; torso reached ${Math.round(detection.angle)}°; stayed low for ${detection.held.toFixed(1)} s.`;
  events.unshift({ id: crypto.randomUUID(), date: new Date().toISOString(), source: mode === 'replay' ? 'Synthetic replay' : 'Live webcam', type: 'Possible fall', details, acknowledged: false });
  element('event-banner').hidden = false; element('event-banner').textContent = `Possible fall · ${events[0].source}. ${details} Review Safety events.`;
  renderEvents();
}

function replay(kind) {
  stopSession('Synthetic replay running. No camera is used.');
  const session = generation; mode = 'replay';
  element('stop').disabled = false; element('camera-placeholder').hidden = true;
  element('source').textContent = 'Synthetic replay'; element('mode-label').textContent = 'REPLAY · GENERATED POSE'; element('camera-dot').classList.add('live');
  canvas.width = 800; canvas.height = 600;
  const started = performance.now();
  const tick = now => {
    if (session !== generation) return;
    const time = (now - started) / 1000;
    const progress = kind === 'fall' ? Math.min(1, Math.max(0, (time - 1.5) / 0.5)) : 0;
    const angle = progress * 85; const hipY = 0.5 - progress * 0.28;
    context.clearRect(0, 0, 800, 600);
    context.strokeStyle = '#baf27a'; context.fillStyle = '#baf27a'; context.lineWidth = 5; context.lineCap = 'round';
    context.save(); context.translate(380, (1 - hipY) * 600); context.rotate(angle * Math.PI / 180);
    context.beginPath(); context.moveTo(0,0); context.lineTo(0,-130); context.moveTo(0,-110); context.lineTo(-65,-35); context.moveTo(0,-110); context.lineTo(65,-35); context.moveTo(0,0); context.lineTo(-38,150); context.moveTo(0,0); context.lineTo(38,150); context.stroke(); context.beginPath(); context.arc(0,-160,22,0,Math.PI*2); context.stroke(); context.restore();
    handleMeasurement(time, { angle, hipY }); element('fps').textContent = 'REPLAY';
    if (time < 6) animation = requestAnimationFrame(tick); else stopSession('Replay complete. Review Safety events for any detections.');
  };
  animation = requestAnimationFrame(tick);
}

function renderEvents() {
  const pending = events.filter(event => !event.acknowledged).length;
  element('alert-count').textContent = pending; element('dashboard-alerts').textContent = pending;
  element('events').replaceChildren();
  if (!events.length) element('events').textContent = 'No events yet. Start a camera session or run the possible-fall replay.';
  for (const event of events) {
    const row = document.createElement('article'); row.className = 'entry';
    const title = document.createElement('strong'); title.textContent = `${event.type} · ${event.source}`;
    const date = document.createElement('time'); date.textContent = new Date(event.date).toLocaleString();
    const details = document.createElement('p'); details.textContent = event.details;
    const button = document.createElement('button'); button.textContent = event.acknowledged ? 'Acknowledged' : 'Acknowledge'; button.disabled = event.acknowledged;
    button.onclick = () => { event.acknowledged = true; renderEvents(); if (events.every(item => item.acknowledged)) element('event-banner').hidden = true; };
    row.append(title,date,details,button); element('events').append(row);
  }
}

const themes = { sleep: ['sleep','slept','tired','rest','fatigue'], workload: ['work','task','schedule','deadline','busy','shift'], exercise: ['exercise','workout','run','training','gym'], isolation: ['alone','lonely','isolated','homesick'], 'family and home': ['family','home','partner','kids','friend','friends'], food: ['food','meal','eat','dinner','lunch','breakfast'], 'crew and teamwork': ['crew','team','together','commander'], stress: ['stress','stressed','pressure','overwhelmed','worried'], 'physical comfort': ['pain','ache','headache','sore','nausea','dizzy'] };
function summarize(body) { const words = new Set(body.toLowerCase().match(/\b[a-z]+\b/g) || []); const found = Object.entries(themes).filter(([, terms]) => terms.some(term => words.has(term))).map(([theme]) => theme); return found.length ? `You wrote about: ${found.join(', ')}.` : 'No common themes were picked out of this entry.'; }
function renderJournals() {
  element('journal-entries').replaceChildren();
  if (!journals.length) element('journal-entries').textContent = 'Your reflections will appear here.';
  for (const entry of journals) {
    const row = document.createElement('article'); row.className = 'entry';
    const date = document.createElement('time'); date.textContent = new Date(entry.date).toLocaleString();
    const body = document.createElement('p'); body.textContent = entry.body;
    const summary = document.createElement('p'); summary.className = 'tag'; summary.textContent = `${summarize(entry.body)} Summary of your words, not an assessment.`;
    row.append(date,body,summary); element('journal-entries').append(row);
  }
}
element('journal-form').onsubmit = event => {
  event.preventDefault(); const body = element('journal-body').value.trim(); if (!body) return;
  const updated = [{ body, date: new Date().toISOString() }, ...journals];
  try { localStorage.setItem('crewsafety-journal', JSON.stringify(updated)); journals = updated; element('journal-body').value = ''; element('journal-message').textContent = 'Saved on this browser only.'; renderJournals(); } catch { element('journal-message').textContent = 'Browser storage is unavailable or full. Your text has not been cleared.'; }
};
element('clear-journal').onclick = () => { if (!journals.length || !confirm('Delete all journal entries from this browser?')) return; try { localStorage.removeItem('crewsafety-journal'); journals = []; renderJournals(); } catch { element('journal-message').textContent = 'Could not clear browser storage.'; } };
element('chat-form').onsubmit = event => { event.preventDefault(); const question = element('question').value.trim(); if (!question) return; const row = document.createElement('article'); row.className = 'entry'; const title = document.createElement('strong'); title.textContent = question; const answer = document.createElement('p'); answer.textContent = 'No supporting material is available. Add verified source documents to the backend and build its index before using grounded MUSE answers. This hosted version is an offline interface demo.'; row.append(title,answer); element('chat').append(row); element('question').value = ''; };
element('export-events').onclick = () => { const url = URL.createObjectURL(new Blob([JSON.stringify(events,null,2)], { type: 'application/json' })); const link = document.createElement('a'); link.href = url; link.download = 'crewsafety-events.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url),1000); };
element('start').onclick = startCamera; element('stop').onclick = () => stopSession();
document.querySelectorAll('[data-replay]').forEach(button => button.onclick = () => replay(button.dataset.replay));
document.addEventListener('visibilitychange', () => { if (document.hidden) stopSession('Session stopped while the page was hidden. Start again to resume.'); });
window.addEventListener('pagehide', () => stopSession());
const rates = Array.from({ length: 60 }, () => 68 + Math.random() * 12);
function updateDashboard() { rates.shift(); rates.push(68 + Math.random() * 12); element('heart-rate').textContent = Math.round(rates.at(-1)); element('chart-line').setAttribute('d', rates.map((rate,index) => `${index ? 'L' : 'M'}${index * 900 / 59},${160 - (rate - 60) * 6}`).join(' ')); element('clock').textContent = `${new Date().toISOString().slice(11,19)} UTC`; }
setInterval(updateDashboard,2000); updateDashboard(); renderEvents(); renderJournals();
