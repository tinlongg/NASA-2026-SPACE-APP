// Stations page: link phones as cameras, see their status on a simulated station layout, and open
// live video. Needs a signed-in account. Polling is once a second; video is peer to peer (WebRTC).
const el = id => document.getElementById(id);
const ROOMS = { command: ['Command module', 40, 20], lab: ['Science lab', 170, 20], galley: ['Galley', 300, 20], corridor: ['Corridor', 170, 110], gym: ['Exercise', 40, 200], airlock: ['Airlock', 300, 200] };
const STATUS_TEXT = { moving: 'Moving', still: 'Still', checking: 'Checking in', alert: 'ALERT', untracked: 'No one in view' };
const ICE = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

export function initStations({ api, onAlert }) {
  let user = null, timer = null, stations = [], lastAlertAt = new Map(), watching = new Map(), selected = null;
  const text = (tag, value, className) => { const node = document.createElement(tag); node.textContent = value; if (className) node.className = className; return node; };

  function worst(report) { const order = ['alert', 'checking', 'still', 'moving', 'untracked']; return order.find(status => report?.people?.some(person => person.status === status)) ?? 'untracked'; }

  function renderPlan() {
    const svg = el('station-plan'); svg.replaceChildren();
    const make = (name, attrs, content) => { const node = document.createElementNS('http://www.w3.org/2000/svg', name); for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value); if (content) node.textContent = content; svg.append(node); return node; };
    make('line', { x1: 130, y1: 60, x2: 170, y2: 60, class: 'plan-link' }); make('line', { x1: 260, y1: 60, x2: 300, y2: 60, class: 'plan-link' });
    make('line', { x1: 215, y1: 100, x2: 215, y2: 110, class: 'plan-link' }); make('line', { x1: 130, y1: 235, x2: 170, y2: 160, class: 'plan-link' }); make('line', { x1: 300, y1: 235, x2: 260, y2: 160, class: 'plan-link' }); make('line', { x1: 85, y1: 100, x2: 170, y2: 135, class: 'plan-link' });
    for (const [room, [label, x, y]] of Object.entries(ROOMS)) {
      const here = stations.filter(station => station.room === room), status = here.reduce((best, station) => { const s = station.online ? worst(station.report) : 'untracked'; const rank = { alert: 4, checking: 3, still: 2, moving: 1, untracked: 0 }; return rank[s] > rank[best] ? s : best; }, 'untracked');
      const group = make('g', { class: `plan-room ${here.length ? status : 'empty'}`, tabindex: 0, role: 'button', 'aria-label': `${label}, ${here.length} cameras${here.length ? ', ' + STATUS_TEXT[status] : ''}` });
      svg.removeChild(group); svg.append(group);
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect'); for (const [key, value] of Object.entries({ x, y, width: 90, height: 80, rx: 10 })) rect.setAttribute(key, value); group.append(rect);
      const title = document.createElementNS('http://www.w3.org/2000/svg', 'text'); title.setAttribute('x', x + 45); title.setAttribute('y', y + 32); title.setAttribute('text-anchor', 'middle'); title.textContent = label; group.append(title);
      const sub = document.createElementNS('http://www.w3.org/2000/svg', 'text'); sub.setAttribute('x', x + 45); sub.setAttribute('y', y + 54); sub.setAttribute('text-anchor', 'middle'); sub.setAttribute('class', 'plan-sub'); sub.textContent = here.length ? `${here.length} cam · ${STATUS_TEXT[status]}` : 'no camera'; group.append(sub);
      group.onclick = () => { selected = here[0]?.id ?? null; render(); };
    }
  }

  function render() {
    renderPlan();
    const host = el('station-list'); host.replaceChildren();
    if (!user) { host.append(text('p', 'Sign in to link phones as cameras.', 'empty')); return; }
    if (!stations.length) host.append(text('p', 'No cameras linked yet. Add a phone camera to start.', 'empty'));
    for (const station of stations) {
      const report = station.report, status = station.online ? worst(report) : 'untracked';
      const card = document.createElement('article'); card.className = `station-card ${station.online ? status : 'offline'}${station.id === selected ? ' selected' : ''}`;
      const head = document.createElement('div'); head.className = 'station-head';
      head.append(text('strong', station.name), text('span', `${ROOMS[station.room]?.[0] ?? station.room} · ${!station.paired ? 'waiting for a phone' : station.online ? STATUS_TEXT[status] : 'offline'}`, 'chip'));
      const video = document.createElement('video'); video.autoplay = true; video.muted = true; video.playsInline = true; video.hidden = !watching.has(station.id); if (watching.has(station.id)) video.srcObject = watching.get(station.id).stream;
      const lines = document.createElement('div');
      for (const person of report?.people ?? []) lines.append(text('p', `Person ${person.id}: ${STATUS_TEXT[person.status]}${person.status === 'still' ? ` for ${Math.floor(person.stillFor)} s` : ''}${person.secondsLeft != null ? ` · answer in ${person.secondsLeft} s` : ''}${person.eyes ? ` · eyes ${person.eyes}` : ''}${person.mouth ? ` · mouth ${person.mouth}` : ''}`));
      if (station.online && report && !report.people.length) lines.append(text('p', 'No one in view.'));
      const actions = document.createElement('div'); actions.className = 'station-actions';
      const watch = text('button', watching.has(station.id) ? 'Stop video' : 'Watch live video'); watch.disabled = !station.online; watch.onclick = () => watching.has(station.id) ? stopWatching(station.id) : startWatching(station.id);
      const pair = text('button', station.paired ? 'Pair another phone' : 'New code'); pair.onclick = async () => { const made = await api(`/api/stations/${station.id}/code`, 'POST'); showCode(station.name, made.code); };
      const remove = text('button', 'Remove'); remove.onclick = async () => { if (!confirm(`Remove ${station.name}?`)) return; stopWatching(station.id); await api(`/api/stations/${station.id}`, 'DELETE'); refresh(); };
      actions.append(watch, pair, remove);
      card.append(head, video, lines, actions); host.append(card);
    }
  }
  function showCode(name, code) {
    const box = el('station-code'); box.hidden = false; box.replaceChildren(text('strong', `Join code for ${name}`), text('div', code, 'code'), text('p', `On the phone, open ${location.origin}/camera and enter this code. It works once and expires in 15 minutes.`));
  }

  async function refresh() {
    if (!user) { stations = []; render(); return; }
    try {
      const data = await api('/api/stations'); stations = data.stations;
      for (const station of stations) {
        const at = station.lastAlert?.at ?? 0, seen = lastAlertAt.get(station.id);
        if (seen !== undefined && at > seen) onAlert?.(station, station.lastAlert);
        lastAlertAt.set(station.id, at);
      }
      el('stations-message').textContent = '';
    } catch (error) { el('stations-message').textContent = error.status === 401 ? 'Sign in to manage stations.' : error.message; }
    render();
  }

  // ---- Live video: the phone offers, this page answers. Setup messages go through the server.
  async function startWatching(id) {
    const peer = new RTCPeerConnection(ICE), watcher = { peer, stream: new MediaStream(), after: 0, poll: null };
    watching.set(id, watcher);
    peer.ontrack = event => { watcher.stream = event.streams[0] ?? watcher.stream; render(); };
    peer.onicecandidate = event => { if (event.candidate) api(`/api/stations/${id}/signal`, 'POST', { type: 'candidate', candidate: event.candidate.toJSON() }).catch(() => {}); };
    peer.addTransceiver('video', { direction: 'recvonly' });
    await api(`/api/stations/${id}/signal`, 'POST', { type: 'view' });
    watcher.poll = setInterval(async () => {
      try {
        const { signals } = await api(`/api/stations/${id}/signal?after=${watcher.after}`);
        for (const signal of signals) {
          watcher.after = Math.max(watcher.after, signal.id);
          if (signal.type === 'offer') { await peer.setRemoteDescription({ type: 'offer', sdp: signal.sdp }); const answer = await peer.createAnswer(); await peer.setLocalDescription(answer); await api(`/api/stations/${id}/signal`, 'POST', { type: 'answer', sdp: answer.sdp }); }
          else if (signal.type === 'candidate' && signal.candidate) await peer.addIceCandidate(signal.candidate).catch(() => {});
        }
      } catch {}
    }, 500);
    render();
  }
  function stopWatching(id) {
    const watcher = watching.get(id); if (!watcher) return;
    clearInterval(watcher.poll); watcher.peer.close(); watching.delete(id);
    api(`/api/stations/${id}/signal`, 'POST', { type: 'stop' }).catch(() => {}); render();
  }

  el('station-form').onsubmit = async event => {
    event.preventDefault();
    try { const made = await api('/api/stations', 'POST', { name: el('station-name').value, room: el('station-room').value }); el('station-name').value = ''; showCode(made.station.name, made.code); refresh(); }
    catch (error) { el('stations-message').textContent = error.message; }
  };
  for (const [room, [label]] of Object.entries(ROOMS)) el('station-room').add(new Option(label, room));
  render();

  return { userChanged(next) { user = next; clearInterval(timer); for (const id of [...watching.keys()]) stopWatching(id); lastAlertAt.clear(); el('station-form').hidden = !next; if (next) { refresh(); timer = setInterval(refresh, 1000); } else { stations = []; render(); } } };
}
