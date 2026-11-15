import { journalToneElement, museJournalElement, sentimentMetadata } from './journal-sentiment.js';
import { InactivityDetector, measurePose, STILL_SECONDS } from './detector.js';
import { REPLAYS, replayMeasurement } from './fixtures.js';
import { VISION_MODULE, VISION_WASM, POSE_MODEL } from './offline-config.js';
import { initializeResearch } from './research.js';
import { initializeCrewSync } from './crew-sync.js';
import { initAccount, api } from './account.js';
import { downscaleJpeg, webcamStill, groupByDay } from './journal-photo.js';

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
const detector = new InactivityDetector();
let stream, landmarker, animation, generation = 0, mode = 'idle', lastVideoTime = -1, lastInference = 0;
const events = [];
let latestSnapshot = { source: 'none', capturedAt: null, measurement: null, detection: null };
let coachPending = false;
let journals = [];
try { const saved = JSON.parse(localStorage.getItem('crewsafety-journal') || '[]'); if (Array.isArray(saved)) journals = saved.filter(entry => typeof entry.body === 'string' && typeof entry.date === 'string'); } catch {}
const titles = { home: ['Overview', 'Crew check-ins for a space station: unresponsive-crew alerts, paired crew status and a private journal'], monitor: ['Camera monitor', 'Pose tracking runs in this browser. Video is never recorded or uploaded'], dashboard: ['Crew', 'Paired iPhone status and archived NASA spaceflight measurements'], alerts: ['Safety events', 'Possible-unresponsive detections from this browser session'], journal: ['Journal', 'A private place to reflect on your day'] };
function showTab(tab) {
  if (!titles[tab]) return;
  if (tab !== 'monitor') stopSession();
  document.querySelectorAll('.tab, .nav').forEach(node => node.classList.remove('active'));
  document.querySelector(`.nav[data-tab="${tab}"]`).classList.add('active'); element(tab).classList.add('active');
  element('page-title').textContent = titles[tab][0]; element('page-subtitle').textContent = titles[tab][1];
  window.scrollTo(0, 0);
}
document.querySelectorAll('[data-tab]').forEach(button => button.addEventListener('click', () => showTab(button.dataset.tab)));
document.querySelector('[data-action="camera"]').onclick = () => { showTab('monitor'); startCamera(); };
document.querySelector('[data-action="replay"]').onclick = () => { showTab('monitor'); replay('unresponsive'); };
document.querySelector('[data-action="entry"]').onclick = () => { showTab('journal'); element('journal-body').focus(); };

function setCameraState(label, live) {
  element('mode-label').textContent = label; element('head-status').textContent = label; element('home-camera').textContent = live ? label.replace(/^Live camera$/, 'Live') : 'Off';
  for (const id of ['camera-dot', 'head-dot', 'side-camera-dot']) element(id).classList.toggle('live', live);
  element('side-camera').textContent = live ? (label === 'Live camera' ? 'Live' : 'Replay') : 'Off';
}

function stopSession(message = 'Session stopped. Camera released.') {
  generation++; cancelAnimationFrame(animation);
  if (stream) stream.getTracks().forEach(track => track.stop());
  stream = null; video.srcObject = null; mode = 'idle'; detector.reset();
  context.clearRect(0, 0, canvas.width, canvas.height);
  element('camera-placeholder').hidden = false; element('start').disabled = false; element('stop').disabled = true;
  setCameraState('Camera off', false);
  element('source').textContent = 'Not connected'; element('pose-status').textContent = 'Standby';
  element('motion').textContent = '—'; element('still').textContent = '—'; element('fps').textContent = '— fps';
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
    setCameraState('Live camera', true); element('source').textContent = 'Webcam, live';
    element('camera-message').textContent = 'Monitoring locally. Keep your full body in frame. No video is recorded or uploaded.';
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
  context.strokeStyle = '#5ccf8e'; context.fillStyle = '#ececef'; context.lineWidth = 3;
  for (const [from, to] of links) {
    if ((pose[from]?.visibility ?? 0) < 0.3 || (pose[to]?.visibility ?? 0) < 0.3) continue;
    context.beginPath(); context.moveTo(pose[from].x * canvas.width, pose[from].y * canvas.height); context.lineTo(pose[to].x * canvas.width, pose[to].y * canvas.height); context.stroke();
  }
  for (const point of pose) if ((point.visibility ?? 0) >= 0.3) { context.beginPath(); context.arc(point.x * canvas.width, point.y * canvas.height, 4, 0, Math.PI * 2); context.fill(); }
}

function handleMeasurement(time, measurement) {
  const detection = detector.process(time, measurement);
  const stillFor = detector.stillFor(time);
  // Coach and events get two numbers, never joint positions.
  const summary = measurement ? { motion: Number(Math.min(detector.motion ?? 0, 9.99).toFixed(3)), stillFor: Number(stillFor.toFixed(1)) } : null;
  latestSnapshot = { source: mode === 'replay' ? 'replay' : 'live', capturedAt: new Date().toISOString(), measurement: summary, detection: detection && { stillFor: Number(detection.stillFor.toFixed(1)), threshold: detection.threshold } };
  updateCoachContext();
  element('pose-status').textContent = measurement ? 'Person visible' : 'No reliable pose';
  element('tracking').textContent = measurement ? (mode === 'replay' ? 'Synthetic pose · not a recording' : 'Pose tracking active') : 'No reliable pose · show shoulders and hips';
  element('motion').textContent = summary ? summary.motion.toFixed(2) : '—';
  element('still').textContent = summary ? Math.floor(stillFor) : '—';
  element('detector-state').textContent = !measurement ? 'Waiting for crew member' : detector.alerted ? 'Alert raised · waiting for movement' : stillFor >= STILL_SECONDS / 3 ? `No movement · alert at ${STILL_SECONDS} s` : 'Monitoring';
  if (!detection) return;
  const details = `No body movement for ${Math.round(detection.stillFor)} s while in view (no joint moved more than ${detection.threshold} torso lengths). Check in with the crew member.`;
  events.unshift({ id: crypto.randomUUID(), date: new Date().toISOString(), source: mode === 'replay' ? 'Synthetic replay' : 'Live webcam', type: 'Possible unresponsive', details, snapshot: structuredClone(latestSnapshot), acknowledged: false });
  element('event-banner').hidden = false; element('event-banner').textContent = `Possible unresponsive crew member · ${events[0].source}. ${details}`;
  renderEvents();
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

function replay(kind) {
  stopSession('Synthetic replay running. No camera is used.');
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
    row.append(title,date,details,button,explain); element('events').append(row);
  }
}

const themes = { sleep: ['sleep','slept','tired','rest','fatigue'], workload: ['work','task','schedule','deadline','busy','shift'], exercise: ['exercise','workout','run','training','gym'], isolation: ['alone','lonely','isolated','homesick'], 'family and home': ['family','home','partner','kids','friend','friends'], food: ['food','meal','eat','dinner','lunch','breakfast'], 'crew and teamwork': ['crew','team','together','commander'], stress: ['stress','stressed','pressure','overwhelmed','worried'], 'physical comfort': ['pain','ache','headache','sore','nausea','dizzy'] };
function summarize(body) { const words = new Set(body.toLowerCase().match(/\b[a-z]+\b/g) || []); const found = Object.entries(themes).filter(([, terms]) => terms.some(term => words.has(term))).map(([theme]) => theme); return found.length ? `You wrote about: ${found.join(', ')}.` : 'No common themes were picked out of this entry.'; }
// Guests keep entries in this browser. Signed-in users keep them in their account, where
// each entry is embedded into the vector index that powers search and MUSE memory.
let account = null, accountEntries = [], journalLoad = 0, pendingPhoto = null, dayIndex = 0;
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
  let list = all;
  const days = account ? groupByDay(all) : [];
  dayIndex = Math.min(dayIndex, Math.max(0, days.length - 1));
  element('journal-days').hidden = !days.length; element('photo-privacy').hidden = !account;
  if (days.length) {
    list = days[dayIndex].items;
    element('day-label').textContent = new Date(days[dayIndex].day + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
    element('day-prev').disabled = dayIndex >= days.length - 1; element('day-next').disabled = dayIndex === 0;
  }
  renderPhotoField();
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
      photoParts = [image, dropPhoto];
    }
    const summary = document.createElement('p'); summary.className = 'tag'; summary.textContent = `${summarize(entry.body)} Summary of your words, not an assessment.`;
    row.append(head,...(photoParts.length ? [photoParts[0], body, photoParts[1]] : [body]),summary); if (element('journal-tone-enabled').checked) row.append(journalToneElement(entry.body)); row.append(museJournalElement(entry.body, { memory: Boolean(account) })); element('journal-entries').append(row);
  }
}
element('journal-tone-enabled').onchange = renderJournals;
element('day-prev').onclick = () => { dayIndex++; renderJournals(); };
element('day-next').onclick = () => { dayIndex = Math.max(0, dayIndex - 1); renderJournals(); };
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
element('journal-form').onsubmit = async event => {
  event.preventDefault(); const body = element('journal-body').value.trim(); if (!body) return;
  if (account) {
    const submit = event.target.querySelector('button'); submit.disabled = true; journalNote('Saving to your account…');
    try {
      const saved = await api('/api/journal/entries', 'POST', { body }); if (element('journal-body').value.trim() === body) element('journal-body').value = '';
      let note = 'Saved to your account and added to the vector index.';
      if (pendingPhoto) {
        try { await api(`/api/journal/entries/${saved.entry.id}/photo`, 'PUT', { image: pendingPhoto.image, width: pendingPhoto.width, height: pendingPhoto.height }); URL.revokeObjectURL(pendingPhoto.url); pendingPhoto = null; note += ' Photo attached.'; }
        catch (error) { note += ` The entry was saved but the photo was not: ${journalFailure(error, 'upload failed.')}`; }
      }
      dayIndex = 0; journalNote(note); await loadAccountJournal();
    }
    catch (error) { journalNote(`${journalFailure(error, 'Could not save.')} Your text has not been cleared.`); }
    finally { submit.disabled = false; }
    return;
  }
  const updated = [{ body, date: new Date().toISOString() }, ...journals];
  try { localStorage.setItem('crewsafety-journal', JSON.stringify(updated)); journals = updated; element('journal-body').value = ''; journalNote('Saved on this browser only.'); renderJournals(); } catch { journalNote('Browser storage is unavailable or full. Your text has not been cleared.'); }
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
const accountControl = initAccount(user => {
  account = user; accountEntries = []; journalLoad++; dayIndex = 0;
  element('home-account').textContent = user ? `@${user.username}` : 'Guest';
  element('hero-account').textContent = user ? 'Open journal' : 'Sign in';
  element('journal-matches').replaceChildren(); element('journal-index').textContent = '';
  renderJournals(); if (user) loadAccountJournal();
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
element('start').onclick = startCamera; element('stop').onclick = () => stopSession();
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
