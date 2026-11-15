const make = (tag, text, className) => {
  const n = document.createElement(tag); if (text != null) n.textContent = text;
  if (className) n.className = className; return n;
};

export function initializeCrewSync() {
  const panel = make('section', null, 'panel crew-sync');
  panel.setAttribute('aria-label', 'iPhone connection');
  panel.innerHTML = `<div class="panel-head"><div><p class="eyebrow">CONNECTED CREW</p><h2>Connect your iPhone</h2></div><span class="pill">PAIRED SYNC</span></div>
    <form class="sync-form"><label>Backend address<input name="backend" type="url" required placeholder="https://your-dashboard.example"></label>
    <label>Pairing code<input name="code" autocomplete="off" spellcheck="false" placeholder="Create a session or enter an existing code" maxlength="32"></label>
    <div class="sync-actions"><button type="button" class="primary" data-create>Create pairing session</button><button type="submit">Connect with code</button><button type="button" data-disconnect hidden>Disconnect browser</button><button type="button" data-end hidden>End shared session</button></div></form>
    <p class="sync-help">Use the same backend address and code in iOS → Dashboard → Settings → Website connection. For this hosted website, use the HTTPS address shown above on your iPhone. Keep the app open to send updates. Anyone with the code can view this session and acknowledge its alerts.</p>
    <p class="sync-status" role="status">Not connected. The cards below are this browser’s simulated demo.</p>
    <div class="sync-data" hidden><div class="sync-crew"></div><div class="sync-telemetry"></div><h3>iPhone safety events</h3><div class="sync-events"></div></div>`;
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
    document.querySelectorAll('#dashboard > .metric-grid, #dashboard > .chart-panel').forEach(n => { n.hidden = connected; });
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
    if (!snapshot) { data.hidden = true; status.textContent = 'Session ready. Enter this backend address and pairing code in iOS Settings, then enable sharing.'; return; }
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
    const telemetry = panel.querySelector('.sync-telemetry');
    telemetry.replaceChildren(make('h3', latest?.heartRateBPM != null ? `${Math.round(latest.heartRateBPM)} BPM` : 'No heart-rate sample'), make('p', latest ? `${latest.source === 'simulated' ? 'SIMULATED — generated by the iOS app, not measured' : 'HealthKit sample'} · ${new Date(latest.timestamp).toLocaleString()}` : 'No telemetry received.'));
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
      row.append(make('strong', `${event.type === 'possibleFall' ? 'Possible fall' : 'Manual test'} · ${name}`), make('time', `${new Date(event.timestamp).toLocaleString()} · ${source}`), make('p', event.details));
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
      connection = {base, code}; visibility(true); await poll(connection);
    } catch (error) { if (run === generation) { visibility(false); status.textContent = error.message; } }
  }
  create.onclick = () => connect(true);
  form.onsubmit = event => { event.preventDefault(); connect(false); };
  disconnect.onclick = () => {
    generation++; clearTimeout(timer); connection = null; codeInput.value = ''; data.hidden = true; visibility(false);
    status.textContent = 'Browser disconnected. The iPhone may still share with the session until it expires. Browser demo shown below.';
  };
  end.onclick = async () => {
    const current = connection; if (!current) return;
    end.disabled = true;
    try { await request(current.base, current.code, 'session', 'DELETE'); if (connection === current) { disconnect.click(); status.textContent = 'Session ended. Sharing is revoked for every device.'; } }
    catch (error) { status.textContent = `Could not end session. ${error.message}`; }
    finally { end.disabled = false; }
  };
  window.addEventListener('pagehide', () => { generation++; clearTimeout(timer); connection = null; });
}
