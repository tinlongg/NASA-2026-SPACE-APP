const make = (tag, text, className) => {
  const n = document.createElement(tag); if (text != null) n.textContent = text;
  if (className) n.className = className; return n;
};

// Apple Watch channel for the camera page: the paired iPhone relays the Watch's heart rate, wrist
// movement and check-in answers. Polled every second while paired. Times are converted to this browser's clock.
let paired = null, wearTimer = null, wearState = { paired: false };
const wearListeners = new Set();
export function onWearable(listener) { wearListeners.add(listener); listener(wearState); return () => wearListeners.delete(listener); }
const emitWearable = () => { for (const listener of wearListeners) listener(wearState); };
async function syncCall(current, route, method = 'GET', body) {
  const response = await fetch(`${current.base}/sync/${route}`, { method, cache: 'no-store', signal: AbortSignal.timeout(5000),
    headers: { Authorization: `Bearer ${current.code}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  if (!response.ok) throw Error(`Backend returned ${response.status}`);
  return response.json();
}
async function pollWearable(current) {
  try {
    const result = await syncCall(current, 'wearable'), local = at => at == null ? null : Date.now() - (result.now - at);
    if (paired !== current) return;
    const w = result.wearable;
    wearState = { paired: true, ok: true, wearable: w && { ...w, receivedAt: local(w.receivedAt), heartRateAt: local(w.heartRateAt), movedAt: local(w.movedAt), answer: w.answer && { ...w.answer, at: local(w.answer.at) } }, checkInRequest: result.checkInRequest };
  } catch (error) { if (paired !== current) return; wearState = { ...wearState, paired: true, ok: false, error: error.message }; }
  emitWearable();
  if (paired === current) wearTimer = setTimeout(() => pollWearable(current), 1000);
}
function setPaired(current) {
  clearTimeout(wearTimer); paired = current;
  wearState = { paired: Boolean(current) }; emitWearable();
  if (current) pollWearable(current);
}
/** Ask the paired Watch to vibrate and show "Are you OK?". Returns false when no iPhone is paired. */
export async function requestWatchCheckIn(id, seconds) {
  if (!paired) return false;
  try { await syncCall(paired, 'checkin', 'POST', { id, seconds: Math.max(1, Math.min(120, Math.round(seconds))) }); return true; } catch { return false; }
}
/** Sends an alert to the paired iPhone, which shows it as a notification. Does nothing when no iPhone is paired. */
export function sendPhoneAlert({ id, person, kind, reason = '' }) {
  if (!paired) return;
  syncCall(paired, 'alert', 'POST', { id: String(id).replace(/[^\w-]/g, '-').slice(0, 64), person: String(person || 'Crew member').slice(0, 60), kind, reason: String(reason).slice(0, 160) }).catch(() => {});
}
export function cancelWatchCheckIn(id) { if (paired) syncCall(paired, 'checkin', 'POST', { id, cancel: true }).catch(() => {}); }


// Watch health summary the wearer chose to share from the iPhone. A description of numbers, not an assessment.
const HEALTH = { heartRate: ['Heart rate', 'bpm', 0], restingHeartRate: ['Resting heart rate', 'bpm', 0], heartRateVariability: ['Heart rate variability', 'ms', 0], respiratoryRate: ['Breathing rate', 'breaths/min', 1], bloodOxygen: ['Blood oxygen', '%', 0] };
const STANDING = { below: 'Below', within: 'Within', above: 'Above' };
export function healthLines(metric) {
  const [title, unit, digits] = HEALTH[metric.key] || [metric.key, '', 0], fmt = v => `${v.toFixed(digits)}${unit === '%' ? '%' : ' ' + unit}`, range = (a, b) => `${a.toFixed(digits)}–${b.toFixed(digits)}${unit === '%' ? '%' : ' ' + unit}`;
  const own = metric.usualLow != null && metric.usualHigh != null ? `${metric.standing ? STANDING[metric.standing] : 'Shown against'} their usual range (${range(metric.usualLow, metric.usualHigh)})` : 'Not enough earlier days for a usual range';
  const astro = metric.astronautLow != null && metric.astronautHigh != null ? `${metric.astronautStanding ? STANDING[metric.astronautStanding] : 'Reported for'} the range reported for astronauts in flight (${range(metric.astronautLow, metric.astronautHigh)})` : null;
  return { title, value: metric.value != null ? fmt(metric.value) : 'No recent reading', own, astro };
}
function renderHealth(box, health) {
  box.replaceChildren();
  if (!health || !health.metrics.length) { box.hidden = true; return; }
  box.hidden = false;
  const head = make('h3', 'Apple Watch summary'); if (health.simulated) head.append(' ', make('span', 'Simulated', 'micro'));
  box.append(head, make('p', `Shared from the iPhone · updated ${new Date(health.updatedAt).toLocaleTimeString()} · daily averages from the Watch`, 'micro'));
  for (const metric of health.metrics) {
    const lines = healthLines(metric), row = make('article', null, 'entry');
    row.append(make('strong', `${lines.title}: ${lines.value}`), make('p', lines.own, 'micro'));
    if (lines.astro) row.append(make('p', lines.astro, 'micro'));
    box.append(row);
  }
  box.append(make('p', 'A description of numbers, not a health assessment. These never decide an alert.', 'micro'));
}

export function initializeCrewSync() {
  const panel = make('section', null, 'panel crew-sync');
  panel.setAttribute('aria-label', 'iPhone connection');
  panel.innerHTML = `<div class="panel-head"><strong>Connect your iPhone</strong><span class="status"><span class="dot" data-sync-dot></span><span class="micro" data-sync-label>Not paired</span></span></div>
    <form class="sync-form"><label hidden>Backend address<input name="backend" type="url" required placeholder="https://your-dashboard.example"></label>
    <label>Pairing code<input name="code" autocomplete="off" spellcheck="false" placeholder="Create a session or enter an existing code" maxlength="32"></label>
    <div class="sync-actions"><button type="button" class="primary" data-create>Create pairing session</button><button type="submit">Connect with code</button><button type="button" data-disconnect hidden>Disconnect browser</button><button type="button" data-end hidden>End shared session</button></div></form>
    <p class="sync-help">Enter the pairing code in the iPhone app under Dashboard → Settings → Website connection. Keep the app open to send updates. Anyone with the code can view this session and acknowledge its alerts.</p>
    <p class="sync-status" role="status">Not connected. Pair the iPhone app to see its crew, events and telemetry here.</p>
    <div class="sync-data" hidden><div class="sync-crew"></div><div class="sync-telemetry"></div><div class="sync-health" hidden></div><h3>iPhone safety events</h3><div class="sync-events"></div></div>`;
  document.getElementById('dashboard').prepend(panel);
  const form = panel.querySelector('form'), baseInput = form.elements.backend, codeInput = form.elements.code;
  const status = panel.querySelector('.sync-status'), data = panel.querySelector('.sync-data');
  const create = panel.querySelector('[data-create]'), disconnect = panel.querySelector('[data-disconnect]'), end = panel.querySelector('[data-end]');
  baseInput.value = location.origin;
  let connection = null, generation = 0, timer;
  function visibility(connected) {
    baseInput.readOnly = connected; codeInput.readOnly = connected;
    create.disabled = connected; form.querySelector('[type=submit]').disabled = connected;
    disconnect.hidden = !connected; end.hidden = !connected;
    panel.querySelector('[data-sync-dot]').classList.toggle('live', connected); panel.querySelector('[data-sync-label]').textContent = connected ? 'Paired' : 'Not paired'; document.getElementById('side-iphone').textContent = connected ? 'Paired' : 'Not paired'; document.getElementById('side-iphone-dot').classList.toggle('live', connected);
  }
  function address() {
    const url = new URL(baseInput.value.trim());
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw Error('Enter a plain http or https backend address.');
    if (location.protocol === 'https:' && url.protocol === 'http:') throw Error('Open the dashboard on your local backend at http://your-computer:8000/dashboard/ to use local HTTP.');
    return url.href.replace(/\/$/, '');
  }
  async function request(base, code, route, method = 'GET') {
    const response = await fetch(`${base}/sync/${route}`, { method, headers: code ? {Authorization: `Bearer ${code}`} : {}, signal: AbortSignal.timeout(10000), cache: 'no-store' });
    if (!response.ok) {
      if (response.status === 401) throw Error('Pairing code invalid or expired. Create a new session.');
      throw Error(`Backend returned ${response.status}. Check the address and retry.`);
    }
    return response.status === 204 ? null : response.json();
  }
  function render(snapshot, current) {
    if (!snapshot) { data.hidden = true; status.textContent = 'Session ready. Enter this pairing code in the iPhone app under Settings, then turn on sharing.'; return; }
    data.hidden = false;
    const seconds = Math.max(0, Math.floor((Date.now() - snapshot.receivedAt) / 1000));
    status.textContent = seconds > 15 ? `iPhone updates paused · last received ${seconds}s ago. Showing last known state; keep the app open.` : `Connected to iPhone · received ${seconds}s ago · refreshes every 3 seconds`;
    const crew = panel.querySelector('.sync-crew'); crew.replaceChildren();
    for (const member of snapshot.crew) {
      const pending = snapshot.events.filter(e => e.crewMemberID === member.id && !e.acknowledged);
      const card = make('article', null, 'sync-member');
      card.append(make('h3', member.displayName), make('p', member.role), make('strong', pending.length ? `${pending.length} unacknowledged alert${pending.length === 1 ? '' : 's'}` : `Status: ${member.status} · no active alerts`));
      crew.append(card);
    }
    const latest = [...snapshot.telemetry].filter(t => t.crewMemberID === snapshot.monitoredCrewMemberID).sort((a,b) => b.timestamp-a.timestamp)[0];
    renderHealth(panel.querySelector('.sync-health'), snapshot.health);
    const telemetry = panel.querySelector('.sync-telemetry');
    telemetry.replaceChildren(make('h3', latest?.heartRateBPM != null ? `${Math.round(latest.heartRateBPM)} BPM` : 'No heart-rate sample'), make('p', latest ? `${latest.source === 'simulated' ? 'Simulated by the iOS app, not measured' : 'HealthKit sample'} · ${new Date(latest.timestamp).toLocaleString()}` : 'No telemetry received.'));
    // Keep focused acknowledgement controls stable across heartbeat polls.
    const eventSignature = JSON.stringify([snapshot.events, snapshot.crew.map(c => [c.id, c.displayName])]);
    if (current.eventSignature === eventSignature) return;
    current.eventSignature = eventSignature;
    const list = panel.querySelector('.sync-events'); list.replaceChildren();
    if (!snapshot.events.length) list.append(make('p', 'No iPhone events yet. Run a synthetic replay in the app to test the connection.'));
    for (const event of snapshot.events) {
      const row = make('article', null, 'entry');
      const name = snapshot.crew.find(c => c.id === event.crewMemberID)?.displayName || 'Crew member';
      const source = {liveCamera:'iPhone camera',webCamera:'External webcam',replay:'Synthetic replay',simulated:'Simulated'}[event.source];
      row.append(make('strong', `${event.type === 'possibleUnresponsive' ? 'Possible unresponsive' : 'Manual test'} · ${name}`), make('time', `${new Date(event.timestamp).toLocaleString()} · ${source}`), make('p', event.details));
      const button = make('button', event.acknowledged ? 'Acknowledged' : 'Acknowledge on all devices');
      button.disabled = event.acknowledged;
      button.onclick = async () => {
        button.disabled = true;
        try {
          await request(current.base, current.code, `events/${event.id}/acknowledge`, 'POST');
          if (connection !== current) return;
          button.textContent = 'Acknowledged';
        } catch (error) { if (connection === current) { status.textContent = `Acknowledgement failed. ${error.message}`; button.disabled = false; } }
      };
      row.append(button); list.append(row);
    }
  }
  async function poll(current) {
    try {
      const result = await request(current.base, current.code, 'state');
      if (connection !== current) return;
      render(result.snapshot, current);
    } catch (error) {
      if (connection !== current) return;
      status.textContent = `Disconnected — displayed data may be stale. ${error.message}`;
    }
    if (connection === current) timer = setTimeout(() => poll(current), 3000);
  }
  async function connect(createNew) {
    const run = ++generation; clearTimeout(timer); connection = null;
    create.disabled = true; form.querySelector('[type=submit]').disabled = true;
    status.textContent = 'Connecting to backend…';
    try {
      const base = address(); let code = codeInput.value.trim();
      if (createNew) code = (await request(base, null, 'sessions', 'POST')).pairingCode;
      if (run !== generation) return;
      if (!/^[a-f0-9]{32}$/.test(code)) throw Error('Enter the 32-character code from the other dashboard, or create a session.');
      await request(base, code, 'state');
      if (run !== generation) return;
      codeInput.value = code;
      connection = {base, code}; visibility(true); setPaired(connection); await poll(connection);
    } catch (error) { if (run === generation) { visibility(false); status.textContent = error.message; } }
  }
  create.onclick = () => connect(true);
  form.onsubmit = event => { event.preventDefault(); connect(false); };
  disconnect.onclick = () => {
    generation++; clearTimeout(timer); connection = null; setPaired(null); codeInput.value = ''; data.hidden = true; visibility(false);
    status.textContent = 'Browser disconnected. The iPhone may still share with the session until it expires.';
  };
  end.onclick = async () => {
    const current = connection; if (!current) return;
    end.disabled = true;
    try { await request(current.base, current.code, 'session', 'DELETE'); if (connection === current) { disconnect.click(); status.textContent = 'Session ended. Sharing is revoked for every device.'; } }
    catch (error) { status.textContent = `Could not end session. ${error.message}`; }
    finally { end.disabled = false; }
  };
  window.addEventListener('pagehide', () => { generation++; clearTimeout(timer); connection = null; setPaired(null); });
}
