// Phone camera for a station. Finds people on this phone, runs the same movement detector and
// "Are you OK?" check-in as the main monitor, and reports a small status summary once a second.
// Video never leaves the phone unless an admin opens this camera on the Stations page (WebRTC).
import { InactivityDetector, measurePose, STILL_SECONDS } from './detector.js';
import { PersonTracker, personCentre, nearestIndex, blendshapeScores, eyeReading, MouthActivity, BlinkDetector } from './people.js';
import { CheckIns, CHECKIN_SECONDS, GRACE_SECONDS, RAISES_ALERT } from './checkin.js';
import { listenForAnswer, onDeviceSupport } from './voice-answer.js';
import { VISION_MODULE, VISION_WASM, POSE_MODELS, FACE_MODEL } from './offline-config.js';

const $ = id => document.getElementById(id), video = $('video'), canvas = $('overlay'), context = canvas.getContext('2d');
const store = 'crewsafety-station';
let device = null; try { device = JSON.parse(localStorage.getItem(store) || 'null'); } catch {}
const api = async (path, { token, body } = {}) => {
  const response = await fetch(path, { method: body ? 'POST' : 'GET', headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' });
  const data = await response.json().catch(() => ({})); if (!response.ok) throw Object.assign(new Error(data.error || 'Request failed.'), { status: response.status }); return data;
};

$('join').onclick = async () => {
  $('pair-message').textContent = 'Joining…';
  try { device = await api('/api/stations/join', { body: { code: $('code').value } }); localStorage.setItem(store, JSON.stringify(device)); begin(); }
  catch (error) { $('pair-message').textContent = error.message; }
};
$('unpair').onclick = () => { stop(); try { localStorage.removeItem(store); } catch {} device = null; $('run').hidden = true; $('pair').hidden = false; $('pair-message').textContent = ''; };
if (device) begin();

// ---- Running state
let stream, landmarker, faceLandmarker, running = 0, session = 0, reportTimer = null, lastReport = 0, frames = 0, startedAt = 0;
const tracker = new PersonTracker(), people = new Map(), checkIns = new CheckIns({ seconds: CHECKIN_SECONDS }), listeners = new Map(), peers = new Set();
let pendingAlert = null;
const clips = {}; const playClip = src => new Promise(resolve => { try { const audio = clips[src] ??= new Audio(src); audio.currentTime = 0; audio.onended = audio.onerror = () => resolve(); audio.play().catch(() => resolve()); } catch { resolve(); } });
const newPerson = id => ({ id, detector: new InactivityDetector({ wholeBody: true }), mouth: new MouthActivity(), blink: new BlinkDetector(), eyes: null, mouthState: null, pose: null, activeAt: null, appliedAt: null, upper: false });

async function begin() {
  $('pair').hidden = true; $('run').hidden = false; $('name').textContent = `${device.name} · ${device.room}`;
  const mine = ++session;
  try {
    $('state').textContent = 'Starting camera…';
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: $('facing').value, width: { ideal: 960 }, height: { ideal: 720 } }, audio: false });
    if (mine !== session) return stream.getTracks().forEach(track => track.stop());
    video.srcObject = stream; await video.play();
    $('state').textContent = 'Loading the pose model…';
    const { FilesetResolver, PoseLandmarker, FaceLandmarker } = await import(VISION_MODULE), files = await FilesetResolver.forVisionTasks(VISION_WASM);
    const make = async (Task, options) => { for (const delegate of ['GPU', 'CPU']) { try { return await Task.createFromOptions(files, { ...options, baseOptions: { ...options.baseOptions, delegate } }); } catch (error) { if (delegate === 'CPU') throw error; } } };
    landmarker = await make(PoseLandmarker, { baseOptions: { modelAssetPath: POSE_MODELS.full }, runningMode: 'VIDEO', numPoses: 4, minPoseDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
    try { faceLandmarker = await make(FaceLandmarker, { baseOptions: { modelAssetPath: FACE_MODEL }, runningMode: 'VIDEO', numFaces: 4, outputFaceBlendshapes: true }); } catch { faceLandmarker = null; }
    if (mine !== session) return;
    startedAt = performance.now(); running = mine; tick(mine); reportLoop(mine);
  } catch (error) { $('state').textContent = 'Camera unavailable'; $('message').textContent = error.name === 'NotAllowedError' ? 'Camera permission was denied. Allow it in the browser settings and reload.' : `Could not start: ${error.message}`; }
}
function stop() { session++; running = 0; clearTimeout(reportTimer); cancelCheckIns(); stream?.getTracks().forEach(track => track.stop()); stream = null; video.srcObject = null; landmarker?.close(); faceLandmarker?.close(); landmarker = faceLandmarker = null; for (const peer of peers) peer.close(); peers.clear(); people.clear(); tracker.reset(); }
$('facing').onchange = () => { if (device) { stop(); begin(); } };
document.addEventListener('visibilitychange', () => { if (document.hidden && running) { stop(); $('state').textContent = 'Stopped (page hidden)'; $('message').textContent = 'The camera stopped because the page was hidden. Reload to resume.'; } });

let lastInference = 0, lastFace = 0;
function tick(mine) {
  if (mine !== running) return;
  const now = performance.now();
  try {
    if (video.readyState >= 2 && now - lastInference >= 100) {
      lastInference = now; frames++;
      canvas.width = video.videoWidth; canvas.height = video.videoHeight;
      const time = now / 1000, aspect = canvas.width / canvas.height, result = landmarker.detectForVideo(video, now);
      const poses = result.landmarks.filter(pose => personCentre(pose)), ids = tracker.update(time, poses.map(personCentre));
      for (const gone of tracker.gone) people.delete(gone);
      const seen = new Set();
      poses.forEach((pose, index) => { const person = people.get(ids[index]) ?? newPerson(ids[index]); people.set(person.id, person); person.pose = pose; seen.add(person.id); evaluate(person, time, measurePose(pose, aspect)); });
      for (const person of people.values()) if (!seen.has(person.id)) { person.pose = null; evaluate(person, time, null); }
      if (faceLandmarker && now - lastFace >= 120) { lastFace = now; faces(now, time, poses, ids); }
      for (const ended of checkIns.tick(Date.now(), id => Boolean(people.get(id)?.detector.alerted))) finish(ended);
      draw();
    }
  } catch (error) { $('state').textContent = 'Tracking failed'; $('message').textContent = error.message; return; }
  requestAnimationFrame(() => tick(mine));
}
function evaluate(person, time, measurement) {
  const d = person.detector;
  const detection = d.process(time, measurement);
  if (person.activeAt != null && person.activeAt !== person.appliedAt) { d.noteActivity(person.activeAt); person.appliedAt = person.activeAt; }
  person.still = d.stillFor(time); person.tracked = Boolean(measurement); person.upper = Boolean(measurement?.upper);
  if (detection && !checkIns.has(person.id)) startCheckIn(person, detection);
}
function faces(now, time, poses, ids) {
  const result = faceLandmarker.detectForVideo(video, now), heads = poses.map(pose => pose[0] && (pose[0].visibility ?? 0) >= 0.3 ? [pose[0].x, pose[0].y] : personCentre(pose)), matched = new Set();
  (result.faceLandmarks || []).forEach((landmarks, index) => {
    const nose = landmarks[1], at = nose ? nearestIndex([nose.x, nose.y], heads, 0.25) : -1, person = at >= 0 ? people.get(ids[at]) : null; if (!person) return;
    const scores = blendshapeScores(result.faceBlendshapes?.[index]?.categories); person.eyes = eyeReading(scores).state; person.mouthState = person.mouth.update(time, scores).state; matched.add(person.id);
    if (person.mouthState === 'moving' || person.blink.update(scores)) person.activeAt = time;
  });
  for (const person of people.values()) if (!matched.has(person.id)) { person.eyes = null; person.mouthState = null; }
}
function draw() {
  context.clearRect(0, 0, canvas.width, canvas.height); let alerting = false, checking = false, any = false;
  for (const person of people.values()) {
    if (!person.pose) continue; any = true;
    const colour = person.detector.alerted && !checkIns.has(person.id) ? '#df6a5e' : person.still >= STILL_SECONDS / 3 ? '#d6a24e' : '#5ccf8e';
    if (colour === '#df6a5e') alerting = true;
    context.strokeStyle = colour; context.lineWidth = 3; for (const point of person.pose) if ((point.visibility ?? 0) >= 0.3) { context.beginPath(); context.arc(point.x * canvas.width, point.y * canvas.height, 4, 0, 7); context.stroke(); }
  }
  checking = checkIns.size > 0;
  $('dot').className = 'dot ' + (alerting ? 'alert' : checking ? 'warn' : 'live');
  $('state').textContent = alerting ? 'ALERT' : checking ? 'Checking in' : any ? `${[...people.values()].filter(person => person.pose).length} in view` : 'No one in view';
  renderCheckIn();
}
const statusOf = person => checkIns.has(person.id) ? 'checking' : person.detector.alerted ? 'alert' : !person.pose ? 'untracked' : person.still >= STILL_SECONDS / 3 ? 'still' : 'moving';

// ---- Check-in (spoken question, buttons, on-device voice answer)
function startCheckIn(person, detection) {
  if (!checkIns.start(person.id, { person, detection }, Date.now())) return;
  playClip('/voice/web-checkin.mp3').then(async () => {
    if (!checkIns.has(person.id) || await onDeviceSupport() !== 'available') return;
    const listener = listenForAnswer({ seconds: checkIns.secondsLeft(person.id, Date.now()) }); listeners.set(person.id, listener);
    const answer = await listener, ended = checkIns.answer(person.id, answer); if (ended) finish(ended);
  });
}
function finish({ id, outcome, info }) {
  listeners.get(id)?.stop?.(); listeners.delete(id);
  if (RAISES_ALERT[outcome]) { pendingAlert = { personId: id, kind: outcome }; playClip('/voice/web-alert.mp3'); }
  else if (outcome === 'ok') info.person.detector.noteActivity(performance.now() / 1000 + GRACE_SECONDS);
}
function cancelCheckIns() { checkIns.cancelAll(); for (const listener of listeners.values()) listener.stop?.(); listeners.clear(); }
function renderCheckIn() {
  const first = [...checkIns.active.keys()][0]; $('checkin').hidden = first === undefined;
  if (first !== undefined) $('count').textContent = `${checkIns.remaining(first, Date.now())} s`;
}
$('ok').onclick = () => { const id = [...checkIns.active.keys()][0]; const ended = id !== undefined && checkIns.answer(id, 'ok'); if (ended) finish(ended); };
$('help').onclick = () => { const id = [...checkIns.active.keys()][0]; const ended = id !== undefined && checkIns.answer(id, 'help'); if (ended) finish(ended); };

// ---- Report once a second (faster while a live-video session is being set up)
async function reportLoop(mine) {
  if (mine !== running) return;
  const body = { people: [...people.values()].map(person => ({ id: person.id, status: statusOf(person), stillFor: Math.max(0, person.still || 0), ...(person.eyes ? { eyes: person.eyes } : {}), ...(person.mouthState ? { mouth: person.mouthState } : {}), ...(person.upper ? { upper: true } : {}), ...(checkIns.has(person.id) ? { secondsLeft: checkIns.remaining(person.id, Date.now()) } : {}) })), fps: Math.round(frames / Math.max(1, (performance.now() - startedAt) / 1000)), model: 'full' };
  if (pendingAlert) { body.alert = pendingAlert; pendingAlert = null; }
  try { const reply = await api('/api/stations/report', { token: device.token, body }); for (const signal of reply.signals || []) await handleSignal(signal); }
  catch (error) { if (error.status === 401) { $('state').textContent = 'Removed'; $('message').textContent = 'This camera was removed from the station. Unpair and join again.'; stop(); return; } }
  reportTimer = setTimeout(() => reportLoop(mine), peers.size ? 500 : 1000);
}

// ---- Live video to the admin over WebRTC. The server only carries the setup messages.
const ICE = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
let peer = null;
async function handleSignal(signal) {
  const send = payload => api('/api/stations/signal', { token: device.token, body: payload }).catch(() => {});
  if (signal.type === 'view') {
    peer?.close(); peers.delete(peer); peer = new RTCPeerConnection(ICE); peers.add(peer);
    for (const track of stream?.getVideoTracks() ?? []) peer.addTrack(track, stream);
    peer.onicecandidate = event => { if (event.candidate) send({ type: 'candidate', candidate: event.candidate.toJSON() }); };
    peer.onconnectionstatechange = () => { if (['closed', 'failed', 'disconnected'].includes(peer?.connectionState)) { peers.delete(peer); } };
    await peer.setLocalDescription(await peer.createOffer()); await send({ type: 'offer', sdp: peer.localDescription.sdp });
  } else if (signal.type === 'answer' && peer) await peer.setRemoteDescription({ type: 'answer', sdp: signal.sdp });
  else if (signal.type === 'candidate' && peer && signal.candidate) await peer.addIceCandidate(signal.candidate).catch(() => {});
  else if (signal.type === 'stop' && peer) { peer.close(); peers.delete(peer); peer = null; }
}
