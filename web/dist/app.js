import {PAGE_ROUTES,pageForPath} from './page-routes.js';
import { initializeMission } from './mission.js';
import { journalToneElement, museJournalElement, sentimentMetadata } from './journal-sentiment.js';
import { InactivityDetector, measurePose, STILL_SECONDS, MOVE_THRESHOLD } from './detector.js';
import { REPLAYS, replayMeasurement } from './fixtures.js';
import { VISION_MODULE, VISION_WASM, POSE_MODELS, FACE_MODEL } from './offline-config.js';
import { visibilityGroups, FramingMonitor, MODEL_CHOICES } from './camera-health.js';
import { CheckIns, CHECKIN_SECONDS, GRACE_SECONDS, RAISES_ALERT } from './checkin.js';
import { initStations } from './stations-ui.js';
import { initCircle } from './circle-ui.js';
import { onDeviceSupport, installLanguagePack, listenForAnswer, ANSWER_LABEL } from './voice-answer.js';
import { BlinkDetector, PersonTracker, personCentre, nearestIndex, blendshapeScores, eyeReading, MouthMotion, lipAperture, faceBox, cropRect, describePerson } from './people.js';
import { startVoiceActivity } from './voice-activity.js';
import { initializeResearch } from './research.js';
import { initializeCrewSync, onWearable, requestWatchCheckIn, cancelWatchCheckIn, sendPhoneAlert } from './crew-sync.js';
import { initAccount, api } from './account.js';
import { downscaleJpeg, webcamStill, groupByDay, dayKey } from './journal-photo.js';
import { GROUPS, ITEMS, LAYER_ITEMS, SOURCE_NOTE, SUIT_SOURCE_URL, LEGACY_ITEM_NAMES, overallState, STATE_LABEL } from './suit-layers.js';

const researchStyles = document.createElement('link');
researchStyles.rel = 'stylesheet'; researchStyles.href = './research.css';
document.head.append(researchStyles);
initializeResearch();
const syncStyles = document.createElement('link');
syncStyles.rel = 'stylesheet'; syncStyles.href = './crew-sync.css';
document.head.append(syncStyles);
initializeCrewSync();

const element = id => document.getElementById(id);
const video = element('video');
const canvas = element('overlay');
const context = canvas.getContext('2d');
const detector = new InactivityDetector(); // the single synthetic-replay person
// Live people: a stable id per person, each with their own detector and face readings.
const tracker = new PersonTracker(), people = new Map(), replayPerson = { id: 1, detector, mouth: new MouthMotion(), face: null, result: null };
// People are found automatically: nobody is entered ahead of time. The only limit is how many the models look for per frame.
const MAX_PEOPLE = 4;
let selectedId = null, focusId = null, faceLandmarker = null, lastFace = 0;
// MUSE live watch: rolling face screenshots of the close-up target, sent a few at a time.
const museWatch = { faces: [], lastShot: 0, lastSent: 0, inFlight: false, targetId: null, retryAt: 0, stopped: false, reading: null, error: null };
// Every MUSE analysis with its reasoning, newest first. Kept across sessions until cleared or the tab closes.
const museLog = [], MUSE_LOG_MAX = 300;
// Microphone talk detection (startMic): declared early because stopSession() can run before the end of this file.
let mic = null, micState = 'off', micGeneration = -1, micTimer = null;
// Apple Watch relayed by the paired iPhone (onWearable, near the end of this file).
let watch = { paired: false }, watchPersonId = null, watchStreamingBefore = false, watchMovedApplied = 0;
const watchAnswers = new Set(), watchCheckIns = new Map(), heartHistory = [];
const newPerson = id => ({ id, detector: new InactivityDetector(), mouth: new MouthMotion(), blink: new BlinkDetector(), face: null, muse: null, result: null, pose: null, seen: 0, activeAt: null, activeReason: null, appliedAt: null, mouthMovedAt: null, patch: null });
function resetPeople() { watchPersonId = null; tracker.reset(); people.clear(); detector.reset(); replayPerson.mouth.reset(); replayPerson.face = null; replayPerson.result = null; focusId = null; selectedId = null; renderViews(true); }
let stream, landmarker, animation, generation = 0, mode = 'idle', lastVideoTime = -1, lastInference = 0;
const events = [];
let latestSnapshot = { source: 'none', capturedAt: null, measurement: null, detection: null };
let coachPending = false;
let journals = [];
try { const saved = JSON.parse(localStorage.getItem('crewsafety-journal') || '[]'); if (Array.isArray(saved)) journals = saved.filter(entry => typeof entry.body === 'string' && typeof entry.date === 'string'); } catch {}
const titles = { mission: ['Mission', 'Care for yourself and your astronaut companion'], home: ['Overview', 'Crew check-ins for a space station: unresponsive-crew alerts, paired crew status and a private journal'], circle: ['Circle', 'People who are told when an alert is raised'], stations: ['Stations', 'Phones linked as cameras around a simulated station'], monitor: ['Camera monitor', 'Pose tracking runs in this browser. Video is never recorded; MUSE sees close-up screenshots only if you allow it'], dashboard: ['Crew', 'Paired iPhone status and archived NASA spaceflight measurements'], alerts: ['Safety events', 'Possible-unresponsive detections from this browser session'], journal: ['Journal', 'A private place to reflect on your day'], suit: ['Suit check', 'A manual inspection checklist for each part of the suit'] };
function showTab(tab,{historyMode='push',path=null}={}) {
  if (!titles[tab]) return;
  if(tab==='mission'&&path)missionNavigation.showPath(path);
  if (tab !== 'monitor') stopSession();
  document.querySelectorAll('.tab, .nav').forEach(node => node.classList.remove('active'));
  document.querySelector(`.nav[data-tab="${tab}"]`).classList.add('active'); element(tab).classList.add('active');
  element('page-title').textContent = titles[tab][0]; element('page-subtitle').textContent = titles[tab][1];
  document.querySelectorAll('.nav[data-tab]').forEach(link=>{if(link.dataset.tab===tab)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');});
  document.title=titles[tab][0]+' · CrewSafety';
  path=tab==='mission'?missionNavigation.getPath():PAGE_ROUTES[tab];if(historyMode==='replace')history.replaceState({page:tab},'',path);else if(historyMode==='push'&&location.pathname!==path)history.pushState({page:tab},'',path);
  window.scrollTo(0, 0);
}
document.querySelectorAll('[data-tab]').forEach(link=>link.addEventListener('click',event=>{if(event.ctrlKey||event.metaKey||event.shiftKey||event.altKey||event.button>0)return;event.preventDefault();showTab(link.dataset.tab);}));
window.addEventListener('popstate',()=>showTab(pageForPath(location.pathname)||'home',{historyMode:'none',path:location.pathname}));
document.querySelector('[data-action="camera"]').onclick = () => { showTab('monitor'); openSetup(); };
document.querySelector('[data-action="replay"]').onclick = () => { showTab('monitor'); replay('unresponsive'); };

function setCameraState(label, live) {
  element('mode-label').textContent = label; element('head-status').textContent = label; element('home-camera').textContent = live ? label.replace(/^Live camera$/, 'Live') : 'Off';
  for (const id of ['camera-dot', 'head-dot', 'side-camera-dot']) element(id).classList.toggle('live', live);
  element('side-camera').textContent = live ? (label === 'Live camera' ? 'Live' : 'Replay') : 'Off';
  element('pip').hidden = label !== 'Live camera'; // the face close-up only exists for the live camera
}

function stopSession(message = 'Session stopped. Camera released.') {
  generation++; cancelAnimationFrame(animation);
  if (stream) stream.getTracks().forEach(track => track.stop());
  stream = null; video.srcObject = null; mode = 'idle'; if (typeof cancelCheckIns === 'function') cancelCheckIns(); resetPeople(); resetDiagnostics();
  context.clearRect(0, 0, canvas.width, canvas.height);
  element('camera-placeholder').hidden = false; element('start').disabled = false; element('stop').disabled = true;
  setCameraState('Camera off', false);
  element('source').textContent = 'Not connected'; element('pose-status').textContent = 'Standby';
  element('motion').textContent = '—'; element('still').textContent = '—'; element('fps').textContent = '— fps';
  element('tracking').textContent = 'Awaiting camera connection'; element('detector-state').textContent = 'Idle';
  element('camera-message').textContent = message;
  resetMuseWatch(); stopMic();
}

let poseModel = 'full', landmarkerModel = null, landmarkerDelegate = '—';
const framing = new FramingMonitor();
const percent = value => value == null ? '—' : `${Math.round(value * 100)}%`;
function updateDiagnostics(time, groups) {
  element('diag-video').textContent = `${video.videoWidth}×${video.videoHeight}`;
  for (const name of ['shoulders', 'hips', 'arms']) element('diag-' + name).textContent = percent(groups?.[name]);
  const hint = framing.update(time, groups); element('framing-hint').hidden = !hint; if (hint) element('framing-hint').textContent = hint;
}
function resetDiagnostics() {
  framing.reset(); element('framing-hint').hidden = true; element('diag-video').textContent = '—';
  for (const name of ['shoulders', 'hips', 'arms']) element('diag-' + name).textContent = '—';
}
// Model choice control.
for (const [value, choice] of Object.entries(MODEL_CHOICES)) element('model-select').add(new Option(`${choice.label} · ${choice.size}`, value));
element('model-select').value = poseModel;
element('model-select').onchange = () => { poseModel = element('model-select').value; element('model-note').textContent = poseModel === 'heavy' ? 'Heavy is 31 MB and needs a connection the first time. Start the camera again to use it.' : 'Start the camera again to use this model.'; if (mode === 'live') stopSession(`Model changed to ${MODEL_CHOICES[poseModel].label}. Start the camera again.`); };

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
    if (!landmarker || landmarkerModel !== poseModel) {
      landmarker?.close(); landmarker = null;
      const { FilesetResolver, PoseLandmarker, FaceLandmarker } = await import(VISION_MODULE);
      const files = await FilesetResolver.forVisionTasks(VISION_WASM);
      let loaded, used = 'GPU';
      for (const delegate of ['GPU', 'CPU']) { // Try the GPU first and fall back to the CPU.
        try { loaded = await PoseLandmarker.createFromOptions(files, { baseOptions: { modelAssetPath: POSE_MODELS[poseModel], delegate }, runningMode: 'VIDEO', numPoses: MAX_PEOPLE, minPoseDetectionConfidence: 0.5, minTrackingConfidence: 0.5 }); used = delegate; break; }
        catch (error) { if (delegate === 'CPU') throw error; }
      }
      if (session !== generation) { loaded.close(); return; }
      landmarker = loaded; landmarkerModel = poseModel; landmarkerDelegate = used;
      // Face readings are optional: if the face model cannot load, pose tracking still works.
      faceLandmarker?.close(); faceLandmarker = null;
      try { faceLandmarker = await FaceLandmarker.createFromOptions(files, { baseOptions: { modelAssetPath: FACE_MODEL, delegate: used }, runningMode: 'VIDEO', numFaces: MAX_PEOPLE, outputFaceBlendshapes: true }); }
      catch { try { faceLandmarker = await FaceLandmarker.createFromOptions(files, { baseOptions: { modelAssetPath: FACE_MODEL, delegate: 'CPU' }, runningMode: 'VIDEO', numFaces: MAX_PEOPLE, outputFaceBlendshapes: true }); } catch { faceLandmarker = null; } }
    }
    element('diag-model').textContent = MODEL_CHOICES[poseModel].label; element('diag-delegate').textContent = landmarkerDelegate;
    if (session !== generation) return;
    mode = 'live'; lastVideoTime = -1; lastInference = 0;
    setCameraState('Live camera', true); element('source').textContent = 'Webcam, live';
    element('camera-message').textContent = element('muse-watch-enabled').checked ? 'Monitoring. Keep your full body in frame. No video is recorded. Close-up screenshots go to MUSE every few seconds and are not stored.' : 'Monitoring locally. Keep your full body in frame. No video is recorded and nothing is sent to MUSE.';
    resetMuseWatch();
    stream.getVideoTracks()[0].addEventListener('ended', () => { if (session === generation) stopSession('Camera disconnected. Reconnect it and start again.'); });
    const tick = now => {
      if (session !== generation) return;
      try {
        if (video.readyState >= 2 && video.currentTime !== lastVideoTime && now - lastInference >= 65) {
          const elapsed = now - lastInference; lastInference = now; lastVideoTime = video.currentTime;
          canvas.width = video.videoWidth; canvas.height = video.videoHeight;
          const result = landmarker.detectForVideo(video, now), time = now / 1000, aspect = canvas.width / canvas.height;
          const poses = result.landmarks.filter(pose => personCentre(pose));
          const ids = tracker.update(time, poses.map(personCentre));
          for (const gone of tracker.gone) { people.delete(gone); if (selectedId === gone) selectedId = null; }
          const seenNow = new Set();
          poses.forEach((pose, index) => {
            const person = people.get(ids[index]) ?? newPerson(ids[index]); people.set(person.id, person);
            person.pose = pose; person.seen = time; seenNow.add(person.id);
            evaluatePerson(person, time, measurePose(pose, aspect));
          });
          for (const person of people.values()) if (!seenNow.has(person.id)) { person.pose = null; evaluatePerson(person, time, null); } // keeps the lost-pose timer honest
          if (faceLandmarker && now - lastFace >= 120) { lastFace = now; updateFaces(now, time, poses, ids); }
          focusId = chooseFocus();
          const focus = people.get(focusId);
          context.clearRect(0, 0, canvas.width, canvas.height);
          if (element('skeleton').checked) for (const person of people.values()) if (person.pose) drawPerson(person);
          updateDiagnostics(time, focus?.pose ? visibilityGroups(focus.pose) : null);
          renderFocus(focus ?? null, time);
          museTick(now, drawCloseUp());
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

const statusColour = person => !person.result ? '#5ccf8e' : person.result.alerted ? '#df6a5e' : person.result.stillFor >= stillLimit() / 3 ? '#d6a24e' : '#5ccf8e';
// Second view: a zoomed crop of the video around the face of whoever the monitor is following.
const faceCanvas = element('face-view'), faceContext = faceCanvas.getContext('2d');
function closeUpTarget() {
  // Always on: the flagged person, else the one clicked, else whoever the monitor is following.
  if (mode === 'replay') return null;
  const flagged = people.get(focusId);
  if (flagged?.result && (flagged.result.alerted || flagged.result.stillFor >= stillLimit() / 3)) return flagged;
  return people.get(selectedId) ?? (flagged?.pose ? flagged : null) ?? [...people.values()].find(person => person.pose) ?? null;
}
function headBox(pose) { // fallback when the face model has nothing: a box around the head from the pose
  const nose = pose?.[0]; if (!nose || (nose.visibility ?? 0) < 0.3) return null;
  const ls = pose[11], rs = pose[12], width = ls && rs ? Math.hypot(ls.x - rs.x, ls.y - rs.y) * 0.9 : 0.2;
  return { x: nose.x - width / 2, y: nose.y - width * 0.65, width, height: width * 1.2 };
}
function drawCloseUp() {
  const target = closeUpTarget(), box = target && (target.face?.box ?? headBox(target.pose));
  element('closeup-placeholder').hidden = Boolean(box); element('closeup-placeholder').textContent = mode === 'replay' ? 'No close-up in replays' : mode === 'live' ? 'Waiting for a face' : 'Close-up';
  if (!box || video.readyState < 2) { faceContext.clearRect(0, 0, faceCanvas.width, faceCanvas.height); return null; }
  const crop = cropRect(box, video.videoWidth, video.videoHeight, faceCanvas.width / faceCanvas.height);
  faceContext.drawImage(video, crop.x, crop.y, crop.width, crop.height, 0, 0, faceCanvas.width, faceCanvas.height);
  return target;
}
const READING = { open: 'Open', closed: 'Closed', unclear: 'Mixed', unknown: '—', moving: 'Moving', still: 'Still' };
let lastViews = 0;
function renderViews(force = false) {
  const nowMs = performance.now(); if (!force && nowMs - lastViews < 250) return; lastViews = nowMs;
  const list = mode === 'replay' ? [replayPerson] : [...people.values()].sort((a, b) => a.id - b.id);
  const target = closeUpTarget();
  element('closeup-title').textContent = target ? `Close-up · Person ${target.id}` : 'Close-up';
  const boxes = element('thought-boxes'); boxes.replaceChildren();
  if (!list.length) { const empty = document.createElement('p'); empty.className = 'empty'; empty.textContent = 'No one is being tracked yet. Start the camera or a replay.'; boxes.append(empty); return; }
  for (const person of list) {
    const result = person.result, card = document.createElement('article'); card.className = 'thought' + (person.id === focusId ? ' focus' : '') + (result?.alerted ? ' alert' : '');
    const head = document.createElement('div'); head.className = 'thought-head';
    const name = document.createElement('strong'); name.textContent = mode === 'replay' ? 'Synthetic person' : `Person ${person.id}`;
    const chip = document.createElement('span'); chip.className = 'chip'; chip.textContent = result?.alerted ? 'Alert' : !result?.measurement ? 'Not tracked' : result.stillFor >= stillLimit() / 3 ? 'Still' : 'Moving';
    head.append(name, chip); card.append(head);
    const lines = describePerson({ tracked: Boolean(result?.measurement), upper: result?.upper, motion: result?.motion, threshold: result?.threshold, stillFor: result?.stillFor ?? 0, stillSeconds: stillLimit(), alerted: result?.alerted, eyes: person.face?.eyes, mouth: person.face?.mouth, museMouth: person.muse ? { state: person.muse.mouthMoving ? 'moving' : 'still' } : null, replay: mode === 'replay', faceActiveAgo: person.activeAt == null || mode === 'replay' ? null : performance.now() / 1000 - person.activeAt, activeReason: person.activeReason, watch: watchReading(person) });
    for (const line of lines) { const item = document.createElement('p'); item.textContent = line; card.append(item); }
    const look = events.find(event => event.personId === person.id && event.lookNote?.status === 'done');
    if (person.muse?.thinking) { const note = document.createElement('p'); note.className = 'look'; note.textContent = `MUSE: ${person.muse.thinking}`; card.append(note); }
    if (look) { const note = document.createElement('p'); note.className = 'look'; note.textContent = `MUSE second look (a description, not a decision): ${look.lookNote.text}`; card.append(note); }
    if (mode === 'live' && watchStreaming() && list.filter(item => item.pose).length > 1 && person.pose) {
      const wear = document.createElement('button'); wear.type = 'button'; wear.className = 'wear-button'; wear.setAttribute('aria-pressed', String(watchPersonId === person.id));
      wear.textContent = watchPersonId === person.id ? 'Wears the Apple Watch' : 'Wearing the Watch?';
      wear.onclick = event => { event.stopPropagation(); watchPersonId = person.id; renderViews(true); }; card.append(wear);
    }
    if (mode !== 'replay') card.onclick = () => { selectedId = person.id; renderViews(true); };
    boxes.append(card);
  }
}
// A literal second screen: the close-up in its own window, drawn from the same canvas.
element('closeup-popout').onclick = () => {
  const win = window.open('', 'crewsafety-closeup', 'popup,width=640,height=560');
  if (!win) { element('camera-message').textContent = 'The browser blocked the close-up window. Allow pop-ups for this site and try again.'; return; }
  win.document.title = 'CrewSafety close-up';
  win.document.body.style.cssText = 'margin:0;background:#121314;color:#ececef;font:14px system-ui,sans-serif';
  const view = win.document.createElement('video'); view.autoplay = true; view.muted = true; view.playsInline = true; view.style.cssText = 'width:100%;display:block;background:#0e0f10';
  view.srcObject = faceCanvas.captureStream(15);
  const caption = win.document.createElement('div'); caption.style.cssText = 'padding:12px 16px';
  win.document.body.replaceChildren(view, caption);
  const timer = setInterval(() => { if (win.closed) return clearInterval(timer); caption.textContent = `${element('closeup-title').textContent} · MUSE · Mouth: ${element('muse-mouth').textContent} · Movement: ${element('muse-move').textContent} · ${element('muse-thinking').textContent}`; }, 500);
};
canvas.addEventListener('click', event => {
  if (mode !== 'live') return;
  const rect = canvas.getBoundingClientRect(), point = [(event.clientX - rect.left) / rect.width, (event.clientY - rect.top) / rect.height];
  const list = [...people.values()].filter(person => person.pose), at = nearestIndex(point, list.map(person => personCentre(person.pose)), 0.4);
  if (at >= 0) { selectedId = list[at].id; renderViews(true); }
});
// Face readings for each tracked person: eyes open or closed, and whether the mouth is moving.
function updateFaces(now, time, poses, ids) {
  const result = faceLandmarker.detectForVideo(video, now);
  const heads = poses.map(pose => pose[0] && (pose[0].visibility ?? 0) >= 0.3 ? [pose[0].x, pose[0].y] : personCentre(pose)), matched = new Set();
  (result.faceLandmarks || []).forEach((landmarks, index) => {
    const nose = landmarks[1], at = nose ? nearestIndex([nose.x, nose.y], heads, 0.25) : -1, person = at >= 0 ? people.get(ids[at]) : null;
    if (!person) return;
    const scores = blendshapeScores(result.faceBlendshapes?.[index]?.categories);
    const mouth = person.mouth.update(time, lipAperture(landmarks), mouthPatchDiff(person, landmarks));
    person.face = { eyes: eyeReading(scores), mouth, box: faceBox(landmarks), at: time }; matched.add(person.id);
    // Lip motion measured on this device: fast enough to restart the count while someone talks or mouths words.
    if (mouth.state === 'moving') { person.mouthMovedAt = time; if (element('face-activity-enabled').checked) noteFaceActivity(person, time, 'Mouth moving (on device)'); }
    if (person.blink.update(scores) && element('face-activity-enabled').checked) noteFaceActivity(person, time, 'Blinking');
  });
  for (const person of people.values()) if (!matched.has(person.id) && person.face && time - person.face.at > 1) { person.face = null; person.mouth.reset(); person.patch = null; }
}
function drawPerson(person) {
  const pose = person.pose, colour = statusColour(person), points = pose.filter(point => (point.visibility ?? 0) >= 0.3);
  drawPose(pose, colour);
  if (!points.length) return;
  const x0 = Math.min(...points.map(point => point.x)) * canvas.width, x1 = Math.max(...points.map(point => point.x)) * canvas.width, y0 = Math.min(...points.map(point => point.y)) * canvas.height, y1 = Math.max(...points.map(point => point.y)) * canvas.height;
  context.save(); context.strokeStyle = colour; context.lineWidth = person.id === focusId ? 3 : 1.5; context.setLineDash(person.id === selectedId ? [] : [6, 4]); context.strokeRect(x0 - 8, y0 - 8, x1 - x0 + 16, y1 - y0 + 16);
  const result = person.result, status = !result ? '' : result.alerted ? ' · ALERT' : result.stillFor >= 1 ? ` · still ${Math.floor(result.stillFor)} s` : ' · moving', label = `Person ${person.id}${status}`;
  context.font = '14px system-ui, sans-serif'; const width = context.measureText(label).width + 12;
  context.fillStyle = colour; context.fillRect(x0 - 8, Math.max(0, y0 - 32), width, 22); context.fillStyle = '#121314'; context.fillText(label, x0 - 2, Math.max(16, y0 - 16)); context.restore();
}
function drawPose(pose, colour = '#5ccf8e') {
  const links = [[11,12],[11,13],[13,15],[12,14],[14,16],[11,23],[12,24],[23,24],[23,25],[25,27],[24,26],[26,28]];
  context.strokeStyle = colour; context.fillStyle = '#ececef'; context.lineWidth = 3;
  for (const [from, to] of links) {
    if ((pose[from]?.visibility ?? 0) < 0.3 || (pose[to]?.visibility ?? 0) < 0.3) continue;
    context.beginPath(); context.moveTo(pose[from].x * canvas.width, pose[from].y * canvas.height); context.lineTo(pose[to].x * canvas.width, pose[to].y * canvas.height); context.stroke();
  }
  for (const point of pose) if ((point.visibility ?? 0) >= 0.3) { context.beginPath(); context.arc(point.x * canvas.width, point.y * canvas.height, 4, 0, Math.PI * 2); context.fill(); }
}

// One person's detector step. Raises an event when the detector fires; the display is separate.
function evaluatePerson(person, time, measurement) {
  const d = person.detector, limits = detectorLimits();
  d.stillSeconds = limits.stillSeconds; d.threshold = limits.threshold;
  d.wholeBody = mode === 'replay' ? Boolean(REPLAYS[replayKind]?.wholeBody) : element('whole-body-enabled').checked; // synthetic replays were written for microgravity unless they say otherwise
  const detection = d.process(time, measurement);
  // Talking or blinking is activity: a person standing still while speaking is not unresponsive.
  if (mode !== 'replay' && person.activeAt != null && person.activeAt !== person.appliedAt) { d.noteActivity(person.activeAt); person.appliedAt = person.activeAt; }
  const stillFor = d.stillFor(time);
  // Coach and events get two numbers, never joint positions.
  const summary = measurement ? { motion: Number(Math.min(d.motion ?? 0, 9.99).toFixed(3)), stillFor: Number(stillFor.toFixed(1)) } : null;
  const snapshot = { source: mode === 'replay' ? 'replay' : 'live', capturedAt: new Date().toISOString(), measurement: summary, detection: detection && { stillFor: Number(detection.stillFor.toFixed(1)), threshold: detection.threshold } };
  person.result = { measurement, summary, stillFor, alerted: d.alerted, detection, snapshot, upper: Boolean(measurement?.upper), threshold: d.threshold, motion: d.motion};
  if (!detection) return;
  // Live: ask "Are you OK?" first. Replays and the unchecked setting raise the event straight away.
  if (mode === 'live' && element('checkin-enabled').checked) { startCheckIn(person, detection, snapshot); return; }
  raiseEvent(person, detection, snapshot);
}

function raiseEvent(person, detection, snapshot, why = '') {
  const who = mode === 'replay' ? '' : `Person ${person.id}: `;
  let details = `${who}${why || `No body movement for ${Math.round(detection.stillFor)} s while in view (${detection.upper ? 'upper body only: no joint moved more than about a shoulder width' : `no joint moved more than ${detection.threshold} torso lengths`}). Check in with the crew member.`}`;
  details += watchNote(person);
  events.unshift({ id: crypto.randomUUID(), date: new Date().toISOString(), source: mode === 'replay' ? 'Synthetic replay' : 'Live webcam', personId: mode === 'replay' ? null : person.id, type: 'Possible unresponsive', details, snapshot: structuredClone(snapshot), eyes: person.face?.eyes?.state ?? null, mouth: person.face?.mouth?.state ?? null, acknowledged: false, lookNote: null });
  if (mode === 'live') phoneAlert(person, 'alert', why || `No movement for ${Math.round(detection.stillFor)} s.`);
  if (mode !== 'replay' && element('look-enabled').checked) secondLook(events[0]);
  if (element('voice-answer-enabled').checked && mode === 'live' && !why) listenAfterAlert(events[0]); else speakAlert();
  element('event-banner').hidden = false; element('event-banner').textContent = `Possible unresponsive crew member · ${events[0].source}. ${details}`;
  if (mode === 'live' && account) { lastCirclePost = Date.now(); api('/api/circle/alert', 'POST', { title: 'Alert: live camera', body: `${person.id ? `Person ${person.id}: ` : ''}${why ? (why.includes('help') ? 'asked for help' : 'did not answer the check-in') : 'no movement for a while'}. Go to them now.`, callKind: why ? (why.includes('help') ? 'help' : 'timeout') : 'still', person: person.id ? `Person ${person.id}` : 'A crew member', room: 'the live camera', camera: 'Live monitor' }).catch(() => {}); }
  renderEvents();
}

// "Are you OK?" check-in: a spoken and written question with a countdown. Saying or tapping OK, or moving
// again, ends it quietly; asking for help or no answer raises the alert. Voice answers are on-device only.
// Sensitivity: how long someone must hold still, how much movement counts, and how long the check-in waits.
// Presets make testing easy; the live camera uses them, synthetic replays always use the standard values.
const SENSITIVITY = { quick: { stillSeconds: 5, threshold: 0.45, checkInSeconds: 10 }, standard: { stillSeconds: STILL_SECONDS, threshold: MOVE_THRESHOLD, checkInSeconds: CHECKIN_SECONDS }, relaxed: { stillSeconds: 45, threshold: 0.15, checkInSeconds: 60 } };
let sensitivity = { preset: 'standard', ...SENSITIVITY.standard };
try { const saved = JSON.parse(localStorage.getItem('crewsafety-sensitivity') || 'null'); if (saved && (SENSITIVITY[saved.preset] || saved.preset === 'custom')) sensitivity = { ...sensitivity, ...(SENSITIVITY[saved.preset] || {}), ...(saved.preset === 'custom' ? { stillSeconds: clampNumber(saved.stillSeconds, 3, 120, 15), threshold: clampNumber(saved.threshold, 0.1, 0.6, 0.25), checkInSeconds: clampNumber(saved.checkInSeconds, 5, 90, 30) } : {}), preset: saved.preset }; } catch {}
function clampNumber(value, min, max, fallback) { return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback; }
function detectorLimits() { return mode === 'replay' ? SENSITIVITY.standard : sensitivity; }
function stillLimit() { return detectorLimits().stillSeconds; }
function renderSensitivity() {
  for (const radio of document.querySelectorAll('input[name="sens-preset"]')) radio.checked = radio.value === sensitivity.preset;
  element('sens-still').value = sensitivity.stillSeconds; element('sens-still-out').textContent = `${sensitivity.stillSeconds} s`;
  element('sens-move').value = sensitivity.threshold; element('sens-move-out').textContent = `${sensitivity.threshold.toFixed(2)} torso lengths`;
  element('sens-checkin').value = sensitivity.checkInSeconds; element('sens-checkin-out').textContent = `${sensitivity.checkInSeconds} s`;
  checkIns.seconds = sensitivity.checkInSeconds;
  try { localStorage.setItem('crewsafety-sensitivity', JSON.stringify(sensitivity)); } catch {}
}
for (const radio of document.querySelectorAll('input[name="sens-preset"]')) radio.onchange = () => { sensitivity = { ...sensitivity, ...(SENSITIVITY[radio.value] || {}), preset: radio.value }; renderSensitivity(); };
for (const [id, key] of [['sens-still', 'stillSeconds'], ['sens-move', 'threshold'], ['sens-checkin', 'checkInSeconds']]) element(id).oninput = () => { sensitivity = { ...sensitivity, [key]: Number(element(id).value), preset: 'custom' }; renderSensitivity(); };
const checkIns = new CheckIns({ seconds: CHECKIN_SECONDS }), checkInTimers = new Map(), checkInListeners = new Map();
renderSensitivity();
function startCheckIn(person, detection, snapshot) {
  if (!checkIns.start(person.id, { person, detection, snapshot }, Date.now())) return;
  watchCheckIn(person);
  phoneAlert(person, 'checkin', `No movement for ${Math.round(detection.stillFor)} s. Asking "Are you OK?"`);
  checkInTimers.set(person.id, setInterval(() => { renderCheckIns(); for (const ended of checkIns.tick(Date.now(), id => Boolean(people.get(id)?.detector.alerted))) finishCheckIn(ended); }, 500));
  playClip('/voice/web-checkin.mp3', { respectToggle: false }).then(async () => {
    if (!checkIns.has(person.id) || !element('voice-answer-enabled').checked) return;
    const listener = listenForAnswer({ seconds: checkIns.secondsLeft(person.id, Date.now()) });
    checkInListeners.set(person.id, listener);
    const answer = await listener;
    const ended = checkIns.answer(person.id, answer); if (ended) finishCheckIn(ended);
  });
  renderCheckIns();
}
function answerCheckIn(id, kind) { const ended = checkIns.answer(id, kind); if (ended) finishCheckIn(ended); }
function finishCheckIn({ id, outcome, info }) {
  clearInterval(checkInTimers.get(id)); checkInTimers.delete(id); checkInListeners.get(id)?.stop?.(); checkInListeners.delete(id); endWatchCheckIn(info.person);
  const { person, detection, snapshot } = info, now = Date.now();
  if (RAISES_ALERT[outcome]) raiseEvent(person, detection, snapshot, outcome === 'help' ? `Person ${id} asked for help at the check-in. Go to them now.` : `Person ${id} did not answer the "Are you OK?" check-in for ${checkIns.seconds} s after ${Math.round(detection.stillFor)} s without movement. Check in with them.`);
  else {
    // Said OK, or showed activity again: log it quietly. After OK, give a longer grace before asking again.
    if (outcome === 'ok') person.detector.noteActivity(performance.now() / 1000 + GRACE_SECONDS); // the detector clock is performance.now() in seconds
    events.unshift({ id: crypto.randomUUID(), date: new Date(now).toISOString(), source: 'Live webcam', personId: id, type: 'Check-in answered', details: outcome === 'ok' ? `Person ${id} said they are okay.` : `Person ${id} moved or spoke during the check-in.`, snapshot: structuredClone(snapshot), acknowledged: true, manual: true, lookNote: null });
    renderEvents();
    phoneAlert(person, 'resolved', outcome === 'ok' ? 'Said they are okay.' : 'Moved or spoke again.');
  }
  renderCheckIns();
}
function cancelCheckIns() { for (const info of checkIns.cancelAll()) endWatchCheckIn(info.person); for (const timer of checkInTimers.values()) clearInterval(timer); for (const listener of checkInListeners.values()) listener.stop?.(); checkInTimers.clear(); checkInListeners.clear(); renderCheckIns(); }
function renderCheckIns() {
  const box = element('checkin-box'); box.hidden = !checkIns.size; box.replaceChildren();
  for (const [id, entry] of checkIns.active) {
    const card = document.createElement('article'); card.className = 'checkin-card';
    const title = document.createElement('h3'); title.textContent = `Person ${id}: are you OK?`;
    const count = document.createElement('div'); count.className = 'count'; count.textContent = `${checkIns.remaining(id, Date.now())} s`;
    const note = document.createElement('p'); note.textContent = `No movement for ${Math.round(entry.info.detection.stillFor)} s. If there is no answer, the alert is raised. Say "I'm okay" or "help" if voice answers are on, or use the buttons.`;
    const answers = document.createElement('div'); answers.className = 'answers';
    const ok = document.createElement('button'); ok.className = 'primary'; ok.textContent = "I'm OK"; ok.onclick = () => answerCheckIn(id, 'ok');
    const help = document.createElement('button'); help.className = 'help'; help.textContent = 'I need help'; help.onclick = () => answerCheckIn(id, 'help');
    answers.append(ok, help); card.append(title, count, note, answers); box.append(card);
  }
}

// The person the session panel, close-up and coach follow: someone with an alert, else the person who
// has been still longest (past a third of the alert time), else the one the user clicked.
function chooseFocus() {
  const list = [...people.values()].filter(person => person.result);
  const alerted = list.filter(person => person.result.alerted).sort((a, b) => b.result.stillFor - a.result.stillFor)[0];
  if (alerted) return alerted.id;
  const stillest = list.filter(person => person.pose).sort((a, b) => b.result.stillFor - a.result.stillFor)[0];
  if (stillest && stillest.result.stillFor >= stillLimit() / 3) return stillest.id;
  if (selectedId !== null && people.has(selectedId)) return selectedId;
  return stillest?.id ?? [...people.keys()][0] ?? null;
}

function renderFocus(person, time) {
  const result = person?.result;
  const measurement = result?.measurement ?? null, summary = result?.summary ?? null, stillFor = result?.stillFor ?? 0;
  latestSnapshot = result?.snapshot ?? { source: mode === 'replay' ? 'replay' : 'live', capturedAt: new Date().toISOString(), measurement: null, detection: null };
  updateCoachContext();
  const count = [...people.values()].filter(item => item.pose).length;
  element('pose-status').textContent = mode === 'replay' ? (measurement ? 'Person visible' : 'No reliable pose') : count > 1 ? `${count} people visible` : measurement ? 'Person visible' : 'No reliable pose';
  element('tracking').textContent = measurement ? (mode === 'replay' ? 'Synthetic pose · not a recording' : measurement.upper ? 'Upper-body tracking (hips not visible)' : 'Pose tracking active') : 'No reliable pose · show your shoulders';
  element('motion').textContent = summary ? summary.motion.toFixed(2) : '—';
  element('still').textContent = summary ? Math.floor(stillFor) : '—';
  element('detector-state').textContent = !measurement ? 'Waiting for crew member' : result.alerted ? 'Alert raised · waiting for movement' : stillFor >= stillLimit() / 3 ? `No movement · alert at ${stillLimit()} s` : 'Monitoring';
  renderViews();
}
function handleMeasurement(time, measurement) { // synthetic replay: one person, no faces
  evaluatePerson(replayPerson, time, measurement); focusId = replayPerson.id;
  renderFocus(replayPerson, time);
}

const LINKS = [[11,12],[11,13],[13,15],[12,14],[14,16],[11,23],[12,24],[23,24],[23,25],[25,27],[24,26],[26,28]];
function drawPoints(points) {
  context.strokeStyle = '#5ccf8e'; context.fillStyle = '#ececef'; context.lineWidth = 4; context.lineCap = 'round';
  const at = index => [points[index][0] * canvas.width, points[index][1] * canvas.height];
  for (const [from, to] of LINKS) if (points[from] && points[to]) { context.beginPath(); context.moveTo(...at(from)); context.lineTo(...at(to)); context.stroke(); }
  if (points[0] && points[11] && points[12]) {
    const neck = [(points[11][0] + points[12][0]) / 2, (points[11][1] + points[12][1]) / 2];
    context.beginPath(); context.moveTo(neck[0] * canvas.width, neck[1] * canvas.height); context.lineTo(...at(0)); context.stroke();
    context.beginPath(); context.arc(...at(0), 16, 0, Math.PI * 2); context.stroke();
  }
}

let replayKind = null;
function replay(kind) {
  stopSession('Synthetic replay running. No camera is used.'); replayKind = kind;
  latestSnapshot = { source: 'none', capturedAt: null, measurement: null, detection: null };
  updateCoachContext();
  const session = generation; mode = 'replay';
  element('stop').disabled = false; element('camera-placeholder').hidden = true;
  element('source').textContent = 'Synthetic replay'; setCameraState('Synthetic replay', true);
  canvas.width = 800; canvas.height = 600;
  const started = performance.now();
  const tick = now => {
    if (session !== generation) return;
    const time = (now - started) / 1000;
    const measurement = replayMeasurement(kind, time);
    context.clearRect(0, 0, 800, 600);
    if (measurement) drawPoints(measurement.points);
    handleMeasurement(time, measurement); element('fps').textContent = 'replay';
    if (time < REPLAYS[kind].duration) animation = requestAnimationFrame(tick); else stopSession(`${REPLAYS[kind].label} replay complete. Expected ${REPLAYS[kind].expected} event(s). Review Safety events.`);
  };
  animation = requestAnimationFrame(tick);
}

// Recorded ElevenLabs voice for new events. A browser may block audio until the page has been
// used; the written banner and event log are always the primary alert.
const clips = {};
let clipsPlaying = 0; // while the app's own voice plays, the microphone does not count it as talking
function playClip(src, { respectToggle = true } = {}) { // resolves when the clip has finished, or straight away if it cannot play
  clipsPlaying++;
  return new Promise(resolve => {
    if (respectToggle && !element('voice-enabled').checked) return resolve();
    try {
      const audio = clips[src] ??= new Audio(src); audio.currentTime = 0;
      audio.onended = () => resolve(); audio.onerror = () => resolve();
      audio.play().catch(() => resolve());
    } catch { resolve(); }
  }).finally(() => setTimeout(() => { clipsPlaying--; }, 400)); // room echo dies away
}
const speakAlert = () => playClip('/voice/web-alert.mp3');
// Spoken answers, recognised on this device only. The words are classified and discarded; only the
// meaning is recorded on the event. Nothing is kept for events that nobody answers.
const answerStatus = text => { element('voice-answer-status').textContent = text; };
element('voice-answer-enabled').onchange = async () => {
  const box = element('voice-answer-enabled');
  if (!box.checked) { answerStatus('Off.'); return; }
  answerStatus('Checking this browser…');
  let support = await onDeviceSupport();
  if (support === 'downloadable' || support === 'downloading') { answerStatus('Downloading the on-device English speech pack…'); try { await installLanguagePack(); support = await onDeviceSupport(); } catch { support = 'unavailable'; } }
  if (support !== 'available') { box.checked = false; answerStatus(support === 'unsupported' ? 'This browser cannot recognise speech on the device, so spoken answers stay off. Use the buttons. Chrome 139 or newer supports it.' : 'The on-device English speech pack is not available, so spoken answers stay off. Use the buttons.'); return; }
  try { const mic = await navigator.mediaDevices.getUserMedia({ audio: true }); mic.getTracks().forEach(track => track.stop()); }
  catch { box.checked = false; answerStatus('Microphone permission was not given, so spoken answers stay off.'); return; }
  answerStatus('On. After a live alert it listens for up to 30 seconds. Speech is recognised on this device and not sent anywhere.');
};
async function listenAfterAlert(event) {
  if (!element('voice-answer-enabled').checked || mode !== 'live') return;
  await speakAlert();
  if (!element('voice-answer-enabled').checked) return;
  event.answer = { kind: 'listening' }; renderEvents(); answerStatus('Listening for an answer…');
  const kind = await listenForAnswer();
  event.answer = { kind, at: new Date().toISOString() }; renderEvents();
  answerStatus(element('voice-answer-enabled').checked ? 'On. After a live alert it listens for up to 30 seconds. Speech is recognised on this device and not sent anywhere.' : 'Off.');
  if (kind === 'help') { element('event-banner').hidden = false; element('event-banner').textContent = `${events[0] === event ? '' : 'Earlier alert: '}A crew member asked for help by voice. Go to them now.`; }
  else if (kind === 'ok') { element('event-banner').textContent = 'A crew member said they are okay by voice. Please confirm in person, then acknowledge the event.'; }
}
// Opt-in second look: one downscaled frame from a live alert goes to MUSE. The reply is only a
// note on the event; the deterministic detector alone decides alerts. Nothing is stored.
async function secondLook(event) {
  event.lookNote = { status: 'pending' }; renderEvents();
  try {
    if (video.readyState < 2) throw new Error('No camera frame.');
    const scale = Math.min(1, 512 / Math.max(video.videoWidth, video.videoHeight)), frame = document.createElement('canvas');
    frame.width = Math.round(video.videoWidth * scale); frame.height = Math.round(video.videoHeight * scale);
    frame.getContext('2d').drawImage(video, 0, 0, frame.width, frame.height);
    const jpeg = await new Promise(resolve => frame.toBlob(resolve, 'image/jpeg', 0.6)), bytes = new Uint8Array(await jpeg.arrayBuffer()); let binary = '';
    for (let index = 0; index < bytes.length; index += 8192) binary += String.fromCharCode(...bytes.subarray(index, index + 8192));
    const response = await fetch('/api/coach/look', { method: 'POST', headers: { 'Content-Type': 'application/json' }, cache: 'no-store', body: JSON.stringify({ source: 'live', frame: btoa(binary) }), signal: AbortSignal.timeout(35000) });
    const data = await response.json().catch(() => ({}));
    event.lookNote = response.ok ? { status: 'done', text: data.note, model: data.model, at: new Date().toISOString() } : { status: 'failed', text: data.error || 'MUSE could not describe the frame.' };
  } catch { event.lookNote = { status: 'failed', text: 'MUSE could not be reached. The alert is unaffected.' }; }
  renderEvents();
}
function renderEvents() {
  const pending = events.filter(event => !event.acknowledged).length;
  element('alert-count').textContent = pending; element('home-alerts').textContent = pending;
  element('alert-count').classList.toggle('has-events', pending > 0);
  element('events').replaceChildren();
  const recent = element('side-events'); recent.replaceChildren();
  if (!events.length) { const li = document.createElement('li'); li.textContent = 'None this session'; recent.append(li); }
  for (const event of events.slice(0, 4)) {
    const li = document.createElement('li'), open = document.createElement('button'), when = document.createElement('span');
    open.textContent = `${event.type}${event.acknowledged ? '' : ' · open'}`; if (!event.acknowledged) open.className = 'warn';
    open.onclick = () => showTab('alerts');
    when.textContent = `${new Date(event.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · ${event.source}`;
    li.append(open, when); recent.append(li);
  }
  const latest = element('home-latest'); latest.replaceChildren();
  const emptyText = 'No events yet. Start a camera session or run the Stops moving replay.';
  const empty = () => { const p = document.createElement('p'); p.className = 'empty'; p.textContent = emptyText; return p; };
  if (!events.length) { element('events').append(empty()); latest.append(empty()); }
  else {
    const row = document.createElement('article'); row.className = 'entry';
    const date = document.createElement('time'); date.textContent = new Date(events[0].date).toLocaleString();
    const title = document.createElement('strong'); title.textContent = `${events[0].type} · ${events[0].source}${events[0].acknowledged ? ' · acknowledged' : ''}`;
    const details = document.createElement('p'); details.textContent = events[0].details;
    row.append(date, title, details); latest.append(row);
  }
  for (const event of events) {
    const row = document.createElement('article'); row.className = 'entry';
    const title = document.createElement('strong'); title.textContent = `${event.type} · ${event.source}`; title.style.display = 'block';
    const date = document.createElement('time'); date.textContent = new Date(event.date).toLocaleString();
    const details = document.createElement('p'); details.textContent = event.details;
    const button = document.createElement('button'); button.textContent = event.acknowledged ? 'Acknowledged' : 'Acknowledge'; button.disabled = event.acknowledged;
    button.onclick = () => { event.acknowledged = true; renderEvents(); if (events.every(item => item.acknowledged)) element('event-banner').hidden = true; };
    const explain = document.createElement('button'); explain.className = 'coach-event'; explain.textContent = 'Explain with Camera Coach'; explain.disabled = coachPending;
    explain.onclick = () => {
      showTab('monitor');
      element('coach-panel').scrollIntoView({ behavior: 'smooth', block: 'center' });
      askCoach('Explain why this possible-unresponsive event triggered and what its limitations are.', event.snapshot);
    };
    row.append(title,date,details);
    if (event.answer) { const spoken = document.createElement('p'); spoken.className = 'tag'; spoken.textContent = event.answer.kind === 'listening' ? 'Listening for a spoken answer…' : `Voice: ${ANSWER_LABEL[event.answer.kind]}. A voice answer does not close the event.`; row.append(spoken); }
    if (event.lookNote) { const note = document.createElement('p'); note.className = 'tag'; note.textContent = event.lookNote.status === 'pending' ? 'MUSE second look: describing the frame…' : `MUSE second look (description only, does not change this alert): ${event.lookNote.text}`; row.append(note); }
    row.append(button,...(event.manual ? [] : [explain])); element('events').append(row);
  }
}

const themes = { sleep: ['sleep','slept','tired','rest','fatigue'], workload: ['work','task','schedule','deadline','busy','shift'], exercise: ['exercise','workout','run','training','gym'], isolation: ['alone','lonely','isolated','homesick'], 'family and home': ['family','home','partner','kids','friend','friends'], food: ['food','meal','eat','dinner','lunch','breakfast'], 'crew and teamwork': ['crew','team','together','commander'], stress: ['stress','stressed','pressure','overwhelmed','worried'], 'physical comfort': ['pain','ache','headache','sore','nausea','dizzy'] };
function summarize(body) { const words = new Set(body.toLowerCase().match(/\b[a-z]+\b/g) || []); const found = Object.entries(themes).filter(([, terms]) => terms.some(term => words.has(term))).map(([theme]) => theme); return found.length ? `You wrote about: ${found.join(', ')}.` : 'No common themes were picked out of this entry.'; }
// Guests keep entries in this browser. Signed-in users keep them in their account, where
// each entry is embedded into the vector index that powers search and MUSE memory.
let account = null, accountEntries = [], journalLoad = 0, pendingPhoto = null, selectedDay = null, calMonth = null;
const journalNote = text => { element('journal-message').textContent = text; };
function journalFailure(error, fallback) {
  if (error.status === 401) { accountControl.expire(); return 'Your session ended. Sign in again to reach your account journal.'; }
  return error.name === 'TimeoutError' ? 'The server took too long. Try again.' : error.message || fallback;
}
function renderStorage() {
  const note = element('journal-storage'); note.replaceChildren();
  if (!account) {
    const signIn = document.createElement('button'); signIn.type = 'button'; signIn.className = 'link-button'; signIn.textContent = 'Sign in'; signIn.onclick = () => accountControl.open();
    note.append('Guest · entries are saved in this browser only. ', signIn, ' to keep them in an account, search them, and give MUSE memory of related entries.');
    return;
  }
  note.append(`@${account.username} · new entries are saved to your account and indexed for search and MUSE memory.`);
  if (!journals.length) return;
  const upload = document.createElement('button'); upload.type = 'button'; upload.className = 'link-button'; upload.textContent = 'Move them to my account';
  upload.onclick = async () => {
    upload.disabled = true; journalNote('Uploading browser entries…');
    const remaining = [...journals]; let moved = 0;
    try {
      while (remaining.length) { const entry = remaining.at(-1); await api('/api/journal/entries', 'POST', { body: entry.body, date: entry.date }); remaining.pop(); moved++; }
      journalNote(`Moved ${moved} ${moved === 1 ? 'entry' : 'entries'} to your account.`);
    } catch (error) { journalNote(`${journalFailure(error, 'Upload failed.')} ${moved} moved; ${remaining.length} still only in this browser.`); }
    try { remaining.length ? localStorage.setItem('crewsafety-journal', JSON.stringify(remaining)) : localStorage.removeItem('crewsafety-journal'); } catch {}
    journals = remaining; if (account) await loadAccountJournal();
  };
  note.append(` ${journals.length} earlier ${journals.length === 1 ? 'entry is' : 'entries are'} still only in this browser. `, upload, '.');
}
async function loadAccountJournal() {
  const load = ++journalLoad;
  try {
    const data = await api('/api/journal/entries');
    if (load !== journalLoad || !account) return;
    accountEntries = data.entries;
    element('journal-index').textContent = `Vector index · ${data.entries.length} of ${data.index.limit} entries · ${data.index.dimensions}-dimension ${data.index.model} embeddings. Matches similar wording and listed themes; it is not a neural language model.`;
  } catch (error) { if (load === journalLoad) journalNote(journalFailure(error, 'Could not load your account journal.')); }
  renderJournals();
}
function renderJournals() {
  renderStorage();
  const all = account ? accountEntries : journals;
  const days = groupByDay(all);
  if (account && (!selectedDay || !days.some(day => day.day === selectedDay))) selectedDay = days[0]?.day ?? null; // Accounts show one day at a time.
  if (selectedDay && !days.some(day => day.day === selectedDay)) selectedDay = null;
  const list = selectedDay ? all.filter(entry => dayKey(entry.date) === selectedDay) : all;
  const at = days.findIndex(day => day.day === selectedDay);
  element('photo-privacy').hidden = !account; element('journal-days').hidden = !account || !days.length;
  if (account && days.length) {
    element('day-label').textContent = dayLabel(selectedDay);
    element('day-prev').disabled = at >= days.length - 1; element('day-next').disabled = at <= 0;
  }
  renderCalendar(days);
  renderPhotoField(); renderPhotoTrend();
  element('journal-search').hidden = !account;
  element('journal-entries').replaceChildren();
  element('home-journal').textContent = account ? `${all.length} ${all.length === 1 ? 'entry' : 'entries'} in your account` : `${all.length} ${all.length === 1 ? 'entry' : 'entries'} in this browser`;
  if (!list.length) { const p = document.createElement('p'); p.className = 'empty'; p.textContent = account ? 'No entries in your account yet' : 'Your entries will appear here'; element('journal-entries').append(p); }
  for (const entry of list) {
    const row = document.createElement('article'); row.className = 'entry';
    const head = document.createElement('div'); head.className = 'entry-head';
    const date = document.createElement('time'); date.textContent = new Date(entry.date).toLocaleString(); head.append(date);
    if (account) {
      const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'Delete';
      remove.onclick = async () => {
        if (!confirm('Delete this entry from your account? This cannot be undone.')) return;
        remove.disabled = true;
        try { await api(`/api/journal/entries/${entry.id}`, 'DELETE'); journalNote('Entry deleted.'); element('journal-matches').replaceChildren(); await loadAccountJournal(); }
        catch (error) { remove.disabled = false; journalNote(journalFailure(error, 'Could not delete the entry.')); }
      };
      head.append(remove);
    }
    const body = document.createElement('p'); body.textContent = entry.body;
    let photoParts = [];
    if (account && entry.hasPhoto) {
      const image = document.createElement('img'); image.className = 'entry-photo'; image.alt = 'Journal photo from ' + new Date(entry.date).toLocaleDateString(); image.loading = 'lazy'; image.src = `/api/journal/entries/${entry.id}/photo`;
      const dropPhoto = document.createElement('button'); dropPhoto.type = 'button'; dropPhoto.textContent = 'Remove photo';
      dropPhoto.onclick = async () => {
        dropPhoto.disabled = true;
        try { await api(`/api/journal/entries/${entry.id}/photo`, 'DELETE'); journalNote('Photo removed.'); await loadAccountJournal(); }
        catch (error) { dropPhoto.disabled = false; journalNote(journalFailure(error, 'Could not remove the photo.')); }
      };
      photoParts = [image, dropPhoto, compareControl(entry)];
    }
    const slept = document.createElement('p'); slept.className = 'tag'; slept.textContent = entry.sleepHours == null ? '' : `You logged ${entry.sleepHours} h of sleep.`; slept.hidden = entry.sleepHours == null;
    const summary = document.createElement('p'); summary.className = 'tag'; summary.textContent = `${summarize(entry.body)} Summary of your words, not an assessment.`;
    row.append(head,...(photoParts.length ? [photoParts[0], body, photoParts[1], photoParts[2]] : [body]),slept,summary); if (element('journal-tone-enabled').checked) row.append(journalToneElement(entry.body)); row.append(museJournalElement(entry.body, { memory: Boolean(account) })); element('journal-entries').append(row);
  }
}
element('journal-tone-enabled').onchange = renderJournals;
function compareControl(entry) {
  const box = document.createElement('div'); box.className = 'compare-box';
  const label = document.createElement('label'); label.className = 'toggle';
  const consent = document.createElement('input'); consent.type = 'checkbox';
  label.append(consent, ' Send this photo and up to two earlier photos to Meta MUSE to describe visible differences');
  const button = document.createElement('button'); button.type = 'button'; button.textContent = 'Compare with earlier photos'; button.disabled = true;
  const result = document.createElement('p'); result.className = 'compare-result'; result.setAttribute('role', 'status');
  consent.onchange = () => { button.disabled = !consent.checked; };
  button.onclick = async () => {
    button.disabled = true; result.textContent = 'Comparing…';
    try {
      const data = await api('/api/journal/photos/compare', 'POST', { entryId: entry.id, consent: true });
      result.textContent = `Photos compared: ${data.compared.join(', ')}. ${data.answer} ${data.notice}`;
    } catch (error) { result.textContent = journalFailure(error, 'Comparison failed.'); }
    button.disabled = !consent.checked;
  };
  box.append(label, button, result); return box;
}
const dayLabel = key => new Date(key + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
function stepDay(direction) {
  const days = groupByDay(account ? accountEntries : journals), at = days.findIndex(day => day.day === selectedDay), next = days[at + direction];
  if (next) { selectedDay = next.day; calMonth = null; renderJournals(); }
}
element('day-prev').onclick = () => stepDay(1);
element('day-next').onclick = () => stepDay(-1);
// Month grid: days with entries are marked (a ring for a photo). Click a day to read it.
function renderCalendar(days) {
  const box = element('journal-calendar'); box.replaceChildren(); box.hidden = !days.length; if (!days.length) return;
  const byDay = new Map(days.map(day => [day.day, day.items]));
  if (!calMonth) { const base = selectedDay ? new Date(selectedDay + 'T12:00:00') : new Date(); calMonth = new Date(base.getFullYear(), base.getMonth(), 1); }
  const head = document.createElement('div'); head.className = 'cal-head';
  const prev = document.createElement('button'), next = document.createElement('button'), title = document.createElement('strong');
  prev.type = next.type = 'button'; prev.textContent = '‹'; next.textContent = '›'; prev.setAttribute('aria-label', 'Previous month'); next.setAttribute('aria-label', 'Next month');
  title.textContent = calMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  prev.onclick = () => { calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, 1); renderCalendar(days); };
  next.onclick = () => { calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1); renderCalendar(days); };
  head.append(prev, title, next);
  if (!account && selectedDay) { const all = document.createElement('button'); all.type = 'button'; all.className = 'link-button'; all.textContent = 'Show all'; all.onclick = () => { selectedDay = null; renderJournals(); }; head.append(all); }
  const grid = document.createElement('div'); grid.className = 'cal-grid'; grid.setAttribute('role', 'grid');
  for (const name of ['S', 'M', 'T', 'W', 'T', 'F', 'S']) { const cell = document.createElement('span'); cell.className = 'cal-dow'; cell.textContent = name; grid.append(cell); }
  const first = calMonth.getDay(), count = new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 0).getDate(), today = dayKey(new Date().toISOString());
  for (let blank = 0; blank < first; blank++) grid.append(document.createElement('span'));
  for (let number = 1; number <= count; number++) {
    const key = `${calMonth.getFullYear()}-${String(calMonth.getMonth() + 1).padStart(2, '0')}-${String(number).padStart(2, '0')}`, items = byDay.get(key);
    const cell = document.createElement(items ? 'button' : 'span'); cell.textContent = number; cell.className = 'cal-day';
    if (key === today) cell.classList.add('today');
    if (items) {
      cell.type = 'button'; cell.classList.add('has-entries'); if (items.some(entry => entry.hasPhoto)) cell.classList.add('has-photo');
      if (key === selectedDay) { cell.classList.add('selected'); cell.setAttribute('aria-pressed', 'true'); }
      cell.setAttribute('aria-label', `${dayLabel(key)}, ${items.length} ${items.length === 1 ? 'entry' : 'entries'}`);
      cell.onclick = () => { selectedDay = !account && key === selectedDay ? null : key; renderJournals(); };
    }
    grid.append(cell);
  }
  box.append(head, grid);
}
function renderPhotoTrend() {
  const recent = account ? accountEntries.filter(entry => entry.hasPhoto).slice(0, 8).reverse() : [], box = element('photo-trend'); // oldest to newest
  element('photo-trend-box').hidden = !recent.length; box.replaceChildren();
  for (const entry of recent) {
    const figure = document.createElement('figure'), image = document.createElement('img'), caption = document.createElement('figcaption');
    image.alt = 'Journal photo from ' + new Date(entry.date).toLocaleDateString(); image.loading = 'lazy'; image.src = `/api/journal/entries/${entry.id}/photo`;
    caption.textContent = `${new Date(entry.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · ${entry.sleepHours == null ? 'sleep not logged' : `${entry.sleepHours} h sleep`}`;
    figure.append(image, caption); box.append(figure);
  }
}
function renderPhotoField() {
  const signed = Boolean(account);
  element('journal-photo-file').disabled = !signed; element('journal-photo-cam').disabled = !signed || !navigator.mediaDevices?.getUserMedia;
  if (!signed) pendingPhoto = null;
  element('journal-photo-note').textContent = signed ? (pendingPhoto ? 'Ready to save with this entry.' : 'Photos are resized to 768 px, saved to your account on the server and not encrypted. You can delete them.') : 'Sign in to add photos.';
  element('journal-photo-clear').hidden = !pendingPhoto; element('journal-photo-preview').hidden = !pendingPhoto;
}
async function attachPhoto(source) {
  try {
    const prepared = await downscaleJpeg(source);
    if (pendingPhoto) URL.revokeObjectURL(pendingPhoto.url);
    pendingPhoto = { ...prepared, url: URL.createObjectURL(prepared.blob) }; element('journal-photo-preview').src = pendingPhoto.url;
  } catch (error) { pendingPhoto = null; journalNote(error.message || 'Could not read that photo.'); }
  renderPhotoField();
}
element('journal-photo-file').onchange = async event => { const file = event.target.files[0]; event.target.value = ''; if (file) await attachPhoto(file); };
element('journal-photo-cam').onclick = async () => { try { await attachPhoto(await webcamStill()); } catch { journalNote('Could not use the camera. Check permission, or choose a photo instead.'); } };
element('journal-photo-clear').onclick = () => { if (pendingPhoto) URL.revokeObjectURL(pendingPhoto.url); pendingPhoto = null; renderPhotoField(); };
element('journal-dataset').textContent = sentimentMetadata.terms.toLocaleString() + ' rated terms · VADER lexicon · MIT license';
const sleepHours = () => { const raw = element('journal-sleep').value; const value = raw === '' ? NaN : Number(raw); return Number.isFinite(value) && value >= 0 && value <= 24 ? Math.round(value * 10) / 10 : null; };
element('journal-form').onsubmit = async event => {
  event.preventDefault(); const body = element('journal-body').value.trim(); if (!body) return;
  if (account) {
    const submit = event.target.querySelector('button'); submit.disabled = true; journalNote('Saving to your account…');
    try {
      const saved = await api('/api/journal/entries', 'POST', { body, ...(sleepHours() === null ? {} : { sleepHours: sleepHours() }) }); window.dispatchEvent(new CustomEvent('crew-care-completed', {detail:'journal'})); if (element('journal-body').value.trim() === body) element('journal-body').value = '';
      let note = 'Saved to your account and added to the vector index.';
      if (pendingPhoto) {
        try { await api(`/api/journal/entries/${saved.entry.id}/photo`, 'PUT', { image: pendingPhoto.image, width: pendingPhoto.width, height: pendingPhoto.height }); URL.revokeObjectURL(pendingPhoto.url); pendingPhoto = null; note += ' Photo attached.'; window.dispatchEvent(new CustomEvent('crew-care-completed', {detail:'photo'})); }
        catch (error) { note += ` The entry was saved but the photo was not: ${journalFailure(error, 'upload failed.')}`; }
      }
      element('journal-sleep').value = ''; selectedDay = null; calMonth = null; journalNote(note); await loadAccountJournal();
    }
    catch (error) { journalNote(`${journalFailure(error, 'Could not save.')} Your text has not been cleared.`); }
    finally { submit.disabled = false; }
    return;
  }
  const updated = [{ body, date: new Date().toISOString(), ...(sleepHours() === null ? {} : { sleepHours: sleepHours() }) }, ...journals];
  try { localStorage.setItem('crewsafety-journal', JSON.stringify(updated)); journals = updated; element('journal-body').value = ''; element('journal-sleep').value = ''; journalNote('Saved on this browser only.'); renderJournals(); window.dispatchEvent(new CustomEvent('crew-care-completed', {detail:'journal'})); } catch { journalNote('Browser storage is unavailable or full. Your text has not been cleared.'); }
};
element('clear-journal').onclick = async () => {
  if (account) {
    if (!accountEntries.length || !confirm('Delete every journal entry in your account? This cannot be undone.')) return;
    try { await api('/api/journal/entries', 'DELETE'); journalNote('All account entries deleted.'); element('journal-matches').replaceChildren(); await loadAccountJournal(); }
    catch (error) { journalNote(journalFailure(error, 'Could not delete your entries.')); }
    return;
  }
  if (!journals.length || !confirm('Delete all journal entries from this browser?')) return;
  try { localStorage.removeItem('crewsafety-journal'); journals = []; renderJournals(); } catch { journalNote('Could not clear browser storage.'); }
};
element('journal-search').onsubmit = async event => {
  event.preventDefault(); const query = element('journal-query').value.trim(), results = element('journal-matches'); if (!query) return;
  results.textContent = 'Searching the vector index…';
  try {
    const { matches } = await api('/api/journal/search', 'POST', { query });
    results.replaceChildren();
    if (!matches.length) results.textContent = 'No entries with similar wording. Try words you would have used in the entry.';
    for (const match of matches) {
      const row = document.createElement('article'); row.className = 'entry';
      const head = document.createElement('div'); head.className = 'entry-head';
      const date = document.createElement('time'); date.textContent = new Date(match.date).toLocaleString();
      const score = document.createElement('span'); score.className = 'score'; score.textContent = `similarity ${match.score.toFixed(2)}`;
      const body = document.createElement('p'); body.textContent = match.body.length > 280 ? `${match.body.slice(0, 280)}…` : match.body;
      head.append(date, score); row.append(head, body); results.append(row);
    }
  } catch (error) { results.textContent = journalFailure(error, 'Search failed.'); }
};
let lastCirclePost = 0;
const circleUi = initCircle({ api, onAlert: alert => {
  if (Date.now() - lastCirclePost < 8000) return; // this page raised it, and already shows it
  element('event-banner').hidden = false; element('event-banner').textContent = `${alert.title}. ${alert.body}`; speakAlert();
  try { if ('Notification' in window && Notification.permission === 'granted' && document.hidden) new Notification(alert.title, { body: alert.body }); } catch {}
} });
const stationsUi = initStations({ api, onAlert: (station, alert) => {
  element('event-banner').hidden = false; element('event-banner').textContent = `Alert from ${station.name} (${station.room}): Person ${alert.personId} ${alert.kind === 'help' ? 'asked for help' : 'did not answer the check-in'}. Go to them now.`; speakAlert();
} });
const accountControl = initAccount(user => {
  window.dispatchEvent(new CustomEvent('crew-account-change', {detail:user}));
  stationsUi.userChanged(user);
  circleUi.userChanged(user);
  account = user; accountEntries = []; journalLoad++; selectedDay = null; calMonth = null;
  element('home-account').textContent = user ? `@${user.username}` : 'Guest';
  element('hero-account').textContent = user ? 'Open journal' : 'Sign in';
  element('journal-matches').replaceChildren(); element('journal-index').textContent = '';
  renderJournals(); if (user) loadAccountJournal();
  if (typeof loadSuitHistory === 'function') loadSuitHistory();
});
element('hero-account').onclick = () => account ? showTab('journal') : accountControl.open();
const coachPanel = document.createElement('div'); coachPanel.className = 'panel instructions'; coachPanel.id = 'coach-panel';
coachPanel.innerHTML = '<h3>Camera Coach</h3><p class="micro">Optional, uses Meta</p><p id="pose-summary">Start the camera or run a replay first.</p><button id="analyze-pose" class="primary" disabled>Explain pose summary</button><p class="micro">Sends your question and numerical pose summary to Meta on click. No video, images, journal entries, or crew identity. Not NASA research or a medical assessment.</p><p id="coach-status" role="status">Checking coach configuration…</p><div id="coach-chat" class="entries" aria-live="polite"></div><form id="coach-form"><label for="coach-question">Camera setup or pose question</label><input id="coach-question" required maxlength="500" placeholder="How should I frame the camera?"><button id="ask-coach">Ask Camera Coach</button></form>';

document.querySelector('.monitor-side').append(coachPanel);

function updateCoachContext() {
  if (!element('pose-summary')) return;
  const snapshot = latestSnapshot;
  const description = snapshot.source === 'none' ? 'No pose captured yet.' : `${snapshot.source === 'replay' ? 'Synthetic replay' : 'Webcam'} · captured ${new Date(snapshot.capturedAt).toLocaleTimeString()} · ${snapshot.measurement ? `movement ${snapshot.measurement.motion.toFixed(2)}, still for ${Math.round(snapshot.measurement.stillFor)} s` : 'no reliable pose'}`;
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

element('analyze-pose').onclick = () => askCoach('Explain this movement summary and any camera setup limitations. Do not say the crew member is unresponsive.', latestSnapshot);
element('coach-form').onsubmit = async event => {
  event.preventDefault(); const question = element('coach-question').value.trim(); if (!question || coachPending) return;
  if (await askCoach(question)) if (element('coach-question').value.trim() === question) element('coach-question').value = '';
};
const setMuse = (text, ready) => { element('side-muse').textContent = text; element('side-muse-dot').classList.toggle('live', ready); };
fetch('/api/coach/status').then(response => { if (!response.ok) throw new Error(); return response.json(); }).then(data => {
  setMuse(data.configured ? 'Ready' : 'No key', data.configured);
  element('coach-status').textContent = data.configured ? `Meta ${data.model} configured · send a question to verify access` : 'Camera Coach needs a server-side Meta API key.';
}).catch(() => { setMuse('Offline', false); element('coach-status').textContent = 'Camera Coach needs the hosted site or local Node server.'; });
element('export-events').onclick = () => { const url = URL.createObjectURL(new Blob([JSON.stringify(events,null,2)], { type: 'application/json' })); const link = document.createElement('a'); link.href = url; link.download = 'crewsafety-events.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url),1000); };
element('start').onclick = openSetup; element('stop').onclick = () => stopSession();
for (const [kind, fixture] of Object.entries(REPLAYS)) { const button = document.createElement('button'); button.dataset.replay = kind; button.textContent = fixture.label; element('replay-actions').append(button); }
document.querySelectorAll('[data-replay]').forEach(button => button.onclick = () => replay(button.dataset.replay));
document.addEventListener('visibilitychange', () => { if (document.hidden) stopSession('Session stopped while the page was hidden. Start again to resume.'); });
window.addEventListener('pagehide', () => stopSession());
function updateClock() { element('clock').textContent = `${new Date().toISOString().slice(11,16)} UTC`; }
setInterval(updateClock,10000); updateClock(); renderEvents(); renderJournals();

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
    const show = state => { element('side-offline').textContent = state.modelReady && state.shellReady ? 'Full' : state.shellReady ? 'Shell only' : 'Incomplete'; element('side-offline-dot').classList.toggle('live', Boolean(state.shellReady)); element('offline-status').textContent = state.modelReady && state.shellReady ? 'Shell and camera model cached. Test offline on this device before the demo.' : state.shellReady ? 'Shell ready: replay, alerts and the guest journal are cached. Camera model not fully cached.' : 'Shell cache incomplete. Reload while online.'; };
    show(await query('status')); element('prepare-offline').disabled = false;
    element('prepare-offline').onclick = async () => {
      element('prepare-offline').disabled = true; element('offline-status').textContent = 'Downloading pose model and runtime files. Keep this page open…';
      try { show(await query('prepare-model')); } catch (error) { element('offline-status').textContent = error.message; }
      finally { element('prepare-offline').disabled = false; }
    };
  } catch { element('side-offline').textContent = 'Unavailable'; element('offline-status').textContent = 'Offline caching unavailable. Reload online and check browser storage permissions.'; }
}
offlineSetup();

// Suit readiness check: a manual record. Guests keep the current check and history in this browser;
// signed-in users save inspections to their account.
const suitStore = 'crewsafety-suit', suitHistoryStore = 'crewsafety-suit-history';
let suit = {}, suitHistory = [];
try { const saved = JSON.parse(localStorage.getItem(suitStore) || '{}'); if (saved && typeof saved === 'object') suit = saved; } catch {}
try { const saved = JSON.parse(localStorage.getItem(suitHistoryStore) || '[]'); if (Array.isArray(saved)) suitHistory = saved.slice(0, 5); } catch {}
const suitStatus = id => (suit[id]?.status) || 'unchecked';
const persistSuit = () => { try { localStorage.setItem(suitStore, JSON.stringify(suit)); } catch {} };
function renderSuitState() {
  const state = overallState(ITEMS.map(item => suitStatus(item.id)));
  const label = element('suit-state'); label.textContent = STATE_LABEL[state]; label.dataset.state = state;const checked=LAYER_ITEMS.filter(item=>suitStatus(item.id)!=='unchecked').length;element('suit-layer-count').textContent=checked+' / '+LAYER_ITEMS.length+' layer groups recorded';
}
function renderSuit() {
  element('suit-source').textContent = SOURCE_NOTE;const source=document.createElement('a');source.href=SUIT_SOURCE_URL;source.target='_blank';source.rel='noopener';source.textContent=' NASA: how spacesuits work';element('suit-source').append(source);
  const host = element('suit-groups'); host.replaceChildren();
  for (const group of GROUPS) {
    const section = document.createElement('section'); section.className = 'suit-group';
    const heading = document.createElement('h3'); heading.textContent = group.name; section.append(heading);
    for (const item of group.items) {
      const row = document.createElement('div'); row.className = 'suit-item';
      const name = document.createElement('strong'); name.textContent = item.name;
      const hint = document.createElement('p'); hint.textContent = item.inspect;
      const seg = document.createElement('div'); seg.className = 'seg'; seg.setAttribute('role', 'radiogroup'); seg.setAttribute('aria-label', item.name);
      for (const [value, text] of [['pass', 'Pass'], ['fail', 'Fail'], ['unchecked', 'Not checked']]) {
        const label = document.createElement('label'), input = document.createElement('input');
        input.type = 'radio'; input.name = 'suit-' + item.id; input.value = value; input.checked = suitStatus(item.id) === value;
        input.onchange = () => { suit[item.id] = { ...suit[item.id], status: value }; persistSuit(); renderSuitState(); };
        label.append(input, text); seg.append(label);
      }
      const note = document.createElement('input'); note.type = 'text'; note.maxLength = 300; note.placeholder = 'Note, optional'; note.setAttribute('aria-label', 'Note for ' + item.name); note.value = suit[item.id]?.note || '';
      note.oninput = () => { suit[item.id] = { ...suit[item.id], status: suitStatus(item.id), note: note.value }; persistSuit(); };
      row.append(name, hint, seg, note); section.append(row);
    }
    host.append(section);
  }
  renderSuitState();
}
function renderSuitHistory(checks) {
  const host = element('suit-history'); host.replaceChildren();
  if (!checks.length) { const empty = document.createElement('p'); empty.className = 'empty'; empty.textContent = 'No saved inspections yet'; host.append(empty); return; }
  for (const check of checks) {
    const row = document.createElement('article'); row.className = 'entry';
    const time = document.createElement('time'); time.textContent = new Date(check.date).toLocaleString();
    const title = document.createElement('strong'); title.textContent = STATE_LABEL[check.overall] || check.overall;
    const failed = check.items.filter(item => item.status === 'fail').map(item => ITEMS.find(known => known.id === item.id)?.name || LEGACY_ITEM_NAMES[item.id] || item.id);
    const detail = document.createElement('p'); detail.textContent = failed.length ? `Failed: ${failed.join(', ')}` : `${check.items.filter(item => item.status === 'pass').length} of ${check.items.length} passed`;
    row.append(title, time, detail); host.append(row);
  }
}
async function loadSuitHistory() {
  if (!account) return renderSuitHistory(suitHistory);
  try { renderSuitHistory((await api('/api/suit/checks')).checks); } catch { renderSuitHistory([]); }
}
element('suit-save').onclick = async () => {
  const items = ITEMS.map(item => ({ id: item.id, status: suitStatus(item.id), note: (suit[item.id]?.note || '').trim() }));
  const overall = overallState(items.map(item => item.status)), message = element('suit-message');
  const now = new Date().toISOString();
  try {
    if (account) await api('/api/suit/checks', 'POST', { items });
    else { suitHistory = [{ id: crypto.randomUUID(), date: now, overall, items }, ...suitHistory].slice(0, 5); try { localStorage.setItem(suitHistoryStore, JSON.stringify(suitHistory)); } catch {} }
  } catch (error) { message.textContent = error.status === 401 ? 'Your session ended. Sign in again to save to your account.' : 'Could not save the inspection.'; return; }
  if (LAYER_ITEMS.every(item => suitStatus(item.id) !== 'unchecked')) window.dispatchEvent(new CustomEvent('crew-care-completed', {detail:'suit'}));
  // A failed item shows beside camera events, labelled as manually entered.
  for (const item of items.filter(entry => entry.status === 'fail')) {
    const known = ITEMS.find(candidate => candidate.id === item.id);
    events.unshift({ id: crypto.randomUUID(), date: now, source: 'Manual entry', type: 'Suit check failed', details: `${known.name}${item.note ? `: ${item.note}` : ''}`, snapshot: { source: 'none', capturedAt: null, measurement: null, detection: null }, acknowledged: false, manual: true });
  }
  renderEvents(); message.textContent = `Saved: ${STATE_LABEL[overall]}.`; loadSuitHistory();
};
element('suit-reset').onclick = () => { suit = {}; persistSuit(); renderSuit(); element('suit-message').textContent = 'Started a new check.'; };
renderSuit(); loadSuitHistory();

// Session setup: every option is chosen before the camera starts.
function openSetup() { const dialog = element('setup-dialog'); if (!dialog.open) dialog.showModal(); element('setup-start').focus(); }
element('setup-start').onclick = () => { element('setup-dialog').close(); startCamera(); if (element('mic-activity-enabled').checked) startMic(); };
element('setup-cancel').onclick = () => element('setup-dialog').close();

// Activity seen in the face (blinking on this device, or mouth/body movement seen by MUSE) restarts the
// stillness count, the same way body movement does. Older observations than the current count are ignored.
function noteFaceActivity(person, time, reason) {
  if (time <= (person.detector.stillSince ?? -Infinity) || time <= (person.activeAt ?? -Infinity)) return false;
  person.activeAt = time; person.activeReason = reason; return true;
}

// MUSE live watch: screenshots of the close-up every WATCH_SHOT_MS; every WATCH_EVERY_MS the last
// WATCH_FACES of them plus one small body frame go to MUSE, one request at a time. MUSE compares them for
// mouth and body movement. Movement restarts the stillness count; MUSE never raises an alert itself.
const WATCH_SHOT_MS = 450, WATCH_EVERY_MS = 2500, WATCH_FACES = 3;
const yesNo = (value, yes, no) => value == null ? '—' : value ? yes : no;
function resetMuseWatch() {
  Object.assign(museWatch, { faces: [], lastShot: 0, lastSent: 0, inFlight: false, targetId: null, retryAt: 0, stopped: false, reading: null, error: null });
  for (const person of people.values()) person.muse = null;
  renderMuse();
}
function museTick(now, target) {
  if (mode !== 'live' || !element('muse-watch-enabled').checked || museWatch.stopped) return renderMuseState(now);
  if (!target || target.id !== museWatch.targetId) { museWatch.faces = []; museWatch.targetId = target?.id ?? null; }
  if (target && now - museWatch.lastShot >= WATCH_SHOT_MS) {
    museWatch.lastShot = now;
    museWatch.faces.push({ at: now / 1000, data: faceCanvas.toDataURL('image/jpeg', 0.7).split(',')[1] });
    if (museWatch.faces.length > WATCH_FACES) museWatch.faces.shift();
  }
  if (target && !museWatch.inFlight && museWatch.faces.length === WATCH_FACES && now - museWatch.lastSent >= WATCH_EVERY_MS && now >= museWatch.retryAt) sendWatch(now, target);
  renderMuseState(now);
}
async function sendWatch(now, target) {
  const session = generation, faces = museWatch.faces.slice(), id = target.id, stillFor = Number((target.result?.stillFor ?? 0).toFixed(1));
  museWatch.inFlight = true; museWatch.lastSent = now; museWatch.sentAt = now;
  const scale = Math.min(1, 384 / Math.max(video.videoWidth, video.videoHeight)), frame = document.createElement('canvas');
  frame.width = Math.round(video.videoWidth * scale); frame.height = Math.round(video.videoHeight * scale);
  frame.getContext('2d').drawImage(video, 0, 0, frame.width, frame.height);
  const body = frame.toDataURL('image/jpeg', 0.6).split(',')[1];
  let entry;
  try {
    const response = await fetch('/api/coach/watch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, cache: 'no-store', signal: AbortSignal.timeout(35000),
      body: JSON.stringify({ source: 'live', faces: faces.map(face => face.data), body, stillFor }) });
    const data = await response.json().catch(() => ({}));
    if (session !== generation) return;
    museWatch.failures = 0;
    if (!response.ok) {
      if (response.status === 503 || response.status === 403) museWatch.stopped = true;
      museWatch.retryAt = performance.now() + (response.status === 429 ? 10000 : 5000);
      entry = { kind: 'error', label: `Error ${response.status}`, thinking: data.error || 'MUSE could not analyse the screenshots. Local detection continues.' };
    } else {
      const person = people.get(id), moved = data.mouthMoving || data.headOrBodyMoving;
      // Confirmed movement restarts the count from 0 now, not from the screenshot time (~6 s ago).
      const restarted = Boolean(person && moved && noteFaceActivity(person, performance.now() / 1000, data.mouthMoving ? 'MUSE saw the mouth move' : 'MUSE saw head or body movement'));
      museWatch.reading = { ...data, personId: id, at: performance.now(), restarted, moved };
      if (person) person.muse = data;
      if (moved) museWatch.movedAt = performance.now();
      entry = { kind: moved ? 'moving' : 'still', label: data.mouthMoving && data.headOrBodyMoving ? 'Mouth and body moving' : data.mouthMoving ? 'Mouth moving' : data.headOrBodyMoving ? 'Movement' : data.personVisible ? 'No movement' : 'No face', thinking: data.thinking || 'No reasoning given.', reasoning: data.reasoning || null, face: data.face, body: data.body, eyes: data.eyes, mouthMoving: data.mouthMoving, headOrBodyMoving: data.headOrBodyMoving, restarted };
    }
  } catch (error) {
    if (session !== generation) return;
    // A fetch that throws never reached this site's server (it is stopped or the network dropped), unlike a MUSE error reply.
    museWatch.failures = (museWatch.failures ?? 0) + 1;
    museWatch.retryAt = performance.now() + Math.min(30000, 5000 * museWatch.failures);
    entry = error.name === 'TimeoutError' ? { kind: 'error', label: 'Timed out', thinking: 'MUSE took more than 35 s to answer. Trying again. Local detection continues.' }
      : { kind: 'error', label: 'Server offline', thinking: `This site's server did not answer, so nothing reached MUSE. Check that it is still running (npm start in web/), then it reconnects by itself. Retrying in ${Math.round(Math.min(30000, 5000 * museWatch.failures) / 1000)} s. Local detection continues.` };
  } finally { if (session === generation) museWatch.inFlight = false; }
  if (entry.kind === 'error') museWatch.error = entry.thinking;
  museLog.unshift({ ...entry, at: new Date(), personId: id, stillFor, screenshots: faces.length }); museLog.length = Math.min(museLog.length, MUSE_LOG_MAX);
  renderMuse(); renderMuseLog();
}
let lastMuseState = 0;
function renderMuseState(now) {
  if (now - lastMuseState < 400) return; lastMuseState = now;
  const on = element('muse-watch-enabled').checked, live = mode === 'live', moving = museWatch.movedAt != null && performance.now() - museWatch.movedAt < 1500;
  element('pip').classList.toggle('watching', live && on && !museWatch.stopped); element('pip').classList.toggle('moving', live && on && moving);
  element('muse-live-dot').classList.toggle('live', live && on && !museWatch.stopped && !museWatch.inFlight); element('muse-live-dot').classList.toggle('busy', live && on && museWatch.inFlight);
  const reading = museWatch.reading, age = reading ? Math.round((performance.now() - reading.at) / 1000) : null;
  element('muse-live-state').textContent = !live ? (on ? 'Waiting for the camera.' : 'Off for this session. Turn it on when you start the camera.')
    : !on ? 'Off for this session. Stop and start again to turn it on.'
    : museWatch.stopped ? 'Stopped: ' + (museWatch.error ?? 'MUSE is unavailable.')
    : museWatch.targetId == null ? 'Waiting for a face in the close-up.'
    : museWatch.inFlight ? `Comparing ${WATCH_FACES} screenshots of Person ${museWatch.targetId}…`
    : museWatch.faces.length < WATCH_FACES ? `Taking screenshots of Person ${museWatch.targetId}…`
    : `Watching Person ${museWatch.targetId}${age == null ? '' : ` · last read ${age} s ago`}`;
}
function renderMuse() {
  const reading = museWatch.reading, set = (id, text, yes = false) => { element(id).textContent = text; element(id).classList.toggle('yes', yes); };
  set('muse-mouth', yesNo(reading?.mouthMoving, 'Moving', 'Still'), Boolean(reading?.mouthMoving));
  set('muse-move', yesNo(reading?.headOrBodyMoving, 'Moving', 'Still'), Boolean(reading?.headOrBodyMoving));
  set('muse-eyes', reading ? reading.eyes[0].toUpperCase() + reading.eyes.slice(1) : '—');
  set('muse-effect', !reading ? '—' : reading.restarted ? 'Restarted' : reading.moved ? 'Already moving' : 'Still counting', Boolean(reading?.restarted));
  element('muse-face').textContent = reading?.face || '—'; element('muse-body').textContent = reading?.body || '—';
  element('muse-thinking').textContent = reading?.thinking || (mode === 'live' && element('muse-watch-enabled').checked ? 'Waiting for the first analysis…' : '—');
  element('muse-reasoning-box').hidden = !reading?.reasoning; element('muse-reasoning').textContent = reading?.reasoning ?? '';
  lastMuseState = 0; renderMuseState(performance.now());
}
function renderMuseLog() {
  const log = element('muse-log'), count = museLog.length; log.replaceChildren();
  element('muse-log-empty').hidden = count > 0; element('muse-log-export').disabled = element('muse-log-clear').disabled = !count;
  element('muse-log-count').textContent = `${count} ${count === 1 ? 'entry' : 'entries'}`;
  for (const item of museLog) {
    const row = document.createElement('li'); row.className = `muse-entry ${item.kind}`;
    const head = document.createElement('div'); head.className = 'muse-entry-head';
    const time = document.createElement('time'); time.dateTime = item.at.toISOString(); time.textContent = item.at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const who = document.createElement('span'); who.textContent = `Person ${item.personId} · still ${Math.round(item.stillFor)} s`;
    const chip = document.createElement('span'); chip.className = `chip ${item.kind}`; chip.textContent = item.label;
    head.append(time, who, chip);
    if (item.restarted) { const effect = document.createElement('span'); effect.className = 'chip moving'; effect.textContent = 'Count restarted'; head.append(effect); }
    const thinking = document.createElement('p'); thinking.className = 'muse-entry-thinking'; thinking.textContent = item.thinking;
    row.append(head, thinking);
    if (item.kind !== 'error') {
      const seen = document.createElement('p'); seen.className = 'muse-entry-seen'; seen.textContent = `Face: ${item.face || '—'} Body: ${item.body || '—'} Eyes: ${item.eyes}.`; row.append(seen);
      if (item.reasoning) { const more = document.createElement('details'), summary = document.createElement('summary'), text = document.createElement('p'); summary.textContent = 'Model reasoning'; text.textContent = item.reasoning; more.append(summary, text); row.append(more); }
    }
    log.append(row);
  }
}
element('muse-log-clear').onclick = () => { museLog.length = 0; renderMuseLog(); };
element('muse-log-export').onclick = () => {
  const url = URL.createObjectURL(new Blob([JSON.stringify(museLog, null, 2)], { type: 'application/json' })), link = document.createElement('a');
  link.href = url; link.download = `crewsafety-muse-log-${new Date().toISOString().slice(0, 19).replace(/:/g, '')}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
};
renderMuseLog();

// Lip patch change minus nose patch change, from two tiny grayscale crops of the video (0..1, or null).
// Moving the head or a lighting change alters both patches; talking alters the lips much more.
const patchCanvas = document.createElement('canvas'); patchCanvas.width = 48; patchCanvas.height = 64;
const patchContext = patchCanvas.getContext('2d', { willReadFrequently: true });
const MOUTH_POINTS = [61, 291, 0, 17, 13, 14, 78, 308];
function mouthPatchDiff(person, landmarks) {
  if (video.readyState < 2 || !MOUTH_POINTS.every(index => landmarks[index]) || !landmarks[1] || !landmarks[168]) return null;
  const width = video.videoWidth, height = video.videoHeight, xs = MOUTH_POINTS.map(index => landmarks[index].x * width), ys = MOUTH_POINTS.map(index => landmarks[index].y * height);
  const boxWidth = (Math.max(...xs) - Math.min(...xs)) * 1.35, boxHeight = Math.max((Math.max(...ys) - Math.min(...ys)) * 1.6, boxWidth * 0.5);
  if (boxWidth < 8) return null;
  const mouthX = (Math.max(...xs) + Math.min(...xs)) / 2, mouthY = (Math.max(...ys) + Math.min(...ys)) / 2;
  const noseX = (landmarks[1].x + landmarks[168].x) / 2 * width, noseY = (landmarks[1].y + landmarks[168].y) / 2 * height;
  patchContext.drawImage(video, mouthX - boxWidth / 2, mouthY - boxHeight / 2, boxWidth, boxHeight, 0, 0, 48, 32);
  patchContext.drawImage(video, noseX - boxWidth / 2, noseY - boxHeight / 2, boxWidth, boxHeight, 0, 32, 48, 32);
  const pixels = patchContext.getImageData(0, 0, 48, 64).data, gray = new Uint8Array(48 * 64);
  for (let index = 0; index < gray.length; index++) gray[index] = (pixels[index * 4] * 77 + pixels[index * 4 + 1] * 150 + pixels[index * 4 + 2] * 29) >> 8;
  const previous = person.patch; person.patch = gray;
  if (!previous) return null;
  let lips = 0, nose = 0; const half = 48 * 32;
  for (let index = 0; index < half; index++) { lips += Math.abs(gray[index] - previous[index]); nose += Math.abs(gray[half + index] - previous[half + index]); }
  return Math.max(0, (lips - nose) / half / 255);
}

// Microphone talk detection, on this device. The microphone cannot tell who spoke, so with one person in
// view it counts for them; with several, only for someone whose lips moved in the last second.
async function startMic() {
  const session = generation; micGeneration = session; micState = 'starting'; renderMic();
  try {
    const handle = await startVoiceActivity({ isMuted: () => clipsPlaying > 0, onSpeech: time => {
      if (mode !== 'live') return;
      const inView = [...people.values()].filter(person => person.pose);
      const speakers = inView.length === 1 ? inView : inView.filter(person => person.mouthMovedAt != null && time - person.mouthMovedAt <= 1);
      for (const person of speakers) noteFaceActivity(person, time, 'Talking (heard by microphone)');
    } });
    if (session !== generation) { handle.stop(); return; }
    mic = handle; micState = 'on'; micTimer = setInterval(renderMic, 500);
  } catch (error) {
    if (session !== generation) return;
    micState = error.name === 'NotAllowedError' ? 'denied' : 'unavailable';
  }
  renderMic();
}
function stopMic() { mic?.stop(); mic = null; clearInterval(micTimer); micTimer = null; micState = 'off'; renderMic(); }
function renderMic() {
  if (!element('voice-state')) return;
  const ago = mic?.spokeAt != null ? performance.now() / 1000 - mic.spokeAt : null;
  element('voice-state').textContent = micState === 'off' ? 'Off' : micState === 'starting' ? 'Starting…' : micState === 'denied' ? 'Microphone not allowed' : micState === 'unavailable' ? 'Microphone unavailable'
    : mic.reading.state === 'muted' ? 'Paused while the app speaks' : ago != null && ago < 1 ? 'Talking now' : ago != null && ago < 60 ? `Quiet · talking ${Math.round(ago)} s ago` : 'Quiet';
}

// Apple Watch, relayed by the paired iPhone about once a second. Wrist movement restarts the count for the
// person wearing it; the Watch vibrates and offers "I'm OK" during a check-in. Heart rate only adds context.
const WATCH_STALE_MS = 8000;
const watchStreaming = () => Boolean(watch.paired && watch.ok && watch.wearable?.monitoring && Date.now() - watch.wearable.receivedAt < WATCH_STALE_MS);
const secondsAgo = at => Math.max(0, Math.round((Date.now() - at) / 1000));
const perfSeconds = epochMs => (epochMs - performance.timeOrigin) / 1000; // the detector clock is performance.now() in seconds
function watchWearer() {
  if (mode !== 'live') return null;
  if (watchPersonId != null && people.get(watchPersonId)?.pose) return people.get(watchPersonId);
  const inView = [...people.values()].filter(person => person.pose);
  return inView.length === 1 ? inView[0] : null; // several people: only once someone is marked as wearing it
}
onWearable(state => {
  watch = state;
  const w = state.wearable, streaming = watchStreaming(), box = element('watch-activity-enabled');
  if (w?.heartRateBPM != null && w.heartRateAt != null && heartHistory.at(-1)?.at !== w.heartRateAt) heartHistory.push({ at: w.heartRateAt, bpm: w.heartRateBPM });
  while (heartHistory.length && Date.now() - heartHistory[0].at > 180000) heartHistory.shift();
  box.disabled = !streaming; if (streaming && !watchStreamingBefore) box.checked = true; // ticked when the Watch starts streaming
  watchStreamingBefore = streaming;
  if (mode === 'live' && streaming && box.checked && w.movedAt != null && w.movedAt > watchMovedApplied) {
    watchMovedApplied = w.movedAt; const person = watchWearer();
    if (person) noteFaceActivity(person, Math.min(perfSeconds(w.movedAt), performance.now() / 1000), 'Wrist movement (Apple Watch)');
  }
  const answer = w?.answer, key = answer && `${answer.checkInID}:${answer.at}`;
  if (answer && !watchAnswers.has(key)) { watchAnswers.add(key); const personId = watchCheckIns.get(answer.checkInID); if (personId != null) answerCheckIn(personId, answer.kind); }
  renderWatch();
});
function watchText() {
  if (!watch.paired) return ['Not paired. Pair the iPhone app on the Crew page, then start Watch monitoring.', false];
  if (watch.ok === false) return [`iPhone session paired, but the backend did not answer (${watch.error}).`, false];
  if (!watchStreaming()) return ['iPhone paired, Watch not monitoring: tap "Start Watch monitoring" in the iPhone app, or open CrewSafety on the Watch and tap Start.', false];
  const w = watch.wearable;
  return [`Streaming · ${w.heartRateBPM != null ? `${Math.round(w.heartRateBPM)} BPM` : 'waiting for heart rate'}${w.movedAt != null ? ` · wrist moved ${secondsAgo(w.movedAt)} s ago` : ''}`, true];
}
function renderWatch() {
  const [text, streaming] = watchText(), status = element('watch-status');
  status.textContent = text; status.classList.toggle('streaming', streaming);
  element('phone-state').textContent = watch.paired ? 'On · iPhone app must be open' : 'Not paired';
  element('watch-state').textContent = !watch.paired ? 'Not paired' : !streaming ? 'Not monitoring' : text.replace(/^Streaming · /, '');
}
function watchReading(person) {
  if (!watchStreaming() || watchWearer()?.id !== person.id) return null;
  const w = watch.wearable;
  return { bpm: w.heartRateBPM, wristAgo: w.movedAt == null ? null : (Date.now() - w.movedAt) / 1000 };
}
/** Context that makes an alert more urgent. It never raises or cancels an alert by itself. */
function heartUrgency() {
  const w = watch.wearable, notes = [];
  if (!watch.paired || !w) return notes;
  if (Date.now() - w.receivedAt > 20000) { notes.push(`the Watch stopped sending ${secondsAgo(w.receivedAt)} s ago`); return notes; }
  if (w.monitoring && (w.heartRateAt == null || Date.now() - w.heartRateAt > 20000)) notes.push(`no heart rate from the Watch for ${w.heartRateAt == null ? 'the whole session' : `${secondsAgo(w.heartRateAt)} s`} (it may be off the wrist)`);
  else if (w.heartRateBPM != null) {
    const bpm = Math.round(w.heartRateBPM), recent = heartHistory.filter(sample => Date.now() - sample.at <= 120000), peak = Math.max(...recent.map(sample => sample.bpm));
    if (bpm < 40) notes.push(`heart rate low at ${bpm} BPM`); else if (bpm > 140) notes.push(`heart rate high at ${bpm} BPM`);
    if (recent.length >= 3 && w.heartRateBPM < peak * 0.7) notes.push(`heart rate fell from ${Math.round(peak)} to ${bpm} BPM within 2 minutes`);
  }
  return notes;
}
function watchNote(person) {
  if (mode !== 'live' || !watch.paired || !watch.wearable || watchWearer()?.id !== person.id) return '';
  const w = watch.wearable, parts = [], urgent = heartUrgency();
  if (w.heartRateBPM != null) parts.push(`Apple Watch heart rate ${Math.round(w.heartRateBPM)} BPM`);
  if (w.movedAt != null) parts.push(`wrist last moved ${secondsAgo(w.movedAt)} s ago`);
  return (parts.length ? ` ${parts.join(', ')}.` : '') + (urgent.length ? ` More urgent: ${urgent.join('; ')}. Heart rate is context only and does not decide alerts.` : '');
}
function watchCheckIn(person) {
  if (!watchStreaming() || !element('watch-activity-enabled').checked || watchWearer()?.id !== person.id) return;
  const id = `p${person.id}-${Date.now()}`; watchCheckIns.set(id, person.id); person.watchCheckInId = id;
  requestWatchCheckIn(id, checkIns.secondsLeft(person.id, Date.now()));
}
// The paired iPhone shows these as notifications. A check-in, its alert and its resolution share one group,
// so the alert replaces the check-in notification and a resolution clears it.
function phoneAlert(person, kind, reason) {
  if (kind !== 'resolved' && (kind === 'checkin' || !person.phoneAlertGroup)) person.phoneAlertGroup = `p${person.id}-${Date.now()}`;
  if (!person.phoneAlertGroup) return;
  sendPhoneAlert({ id: `${person.phoneAlertGroup}-${kind}`, person: `Person ${person.id}`, kind, reason });
  if (kind !== 'checkin') person.phoneAlertGroup = null;
}
function endWatchCheckIn(person) {
  if (!person?.watchCheckInId) return;
  cancelWatchCheckIn(person.watchCheckInId); watchCheckIns.delete(person.watchCheckInId); person.watchCheckInId = null;
}

const missionNavigation=initializeMission({onNavigate:path=>{if(location.pathname!==path)history.pushState({page:'mission'},'',path);}});
showTab(new URLSearchParams(location.search).get('mission')==='1'?'mission':pageForPath(location.pathname)||'home',{historyMode:'replace',path:location.pathname});

// Preference belongs to this browser and applies across every view.
const themeToggle=document.getElementById('theme-toggle');
function setTheme(theme){document.documentElement.dataset.theme=theme;themeToggle.textContent=theme==='light'?'Dark mode':'Light mode';themeToggle.setAttribute('aria-label','Switch to '+(theme==='light'?'dark':'light')+' mode');document.querySelector('meta[name="theme-color"]').content=theme==='light'?'#f4f5f7':'#121314';}
let savedTheme='dark';try{savedTheme=localStorage.getItem('crewsafety-theme')||'dark';}catch{}setTheme(savedTheme==='light'?'light':'dark');
themeToggle.onclick=()=>{const next=document.documentElement.dataset.theme==='light'?'dark':'light';setTheme(next);try{localStorage.setItem('crewsafety-theme',next);}catch{}};

window.addEventListener('crew-journal-updated',()=>{if(account)loadAccountJournal();});
