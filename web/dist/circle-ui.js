// Crew circle page: create a circle, invite people with a one-time code, join one, turn on alerts on
// this device (Web Push) and see recent alerts. Open pages also poll for new alerts every few seconds.
const el = id => document.getElementById(id);
const text = (tag, value, className) => { const node = document.createElement(tag); node.textContent = value; if (className) node.className = className; return node; };
const keyBytes = key => Uint8Array.from(atob(key.replaceAll('-', '+').replaceAll('_', '/').padEnd(Math.ceil(key.length / 4) * 4, '=')), char => char.charCodeAt(0));

export function initCircle({ api, onAlert }) {
  let user = null, poll = null, after = null, state = null, history = [], calls = null;
  const say = message => { el('circle-message').textContent = message; };

  async function pushState() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported';
    const registration = await navigator.serviceWorker.getRegistration(); if (!registration) return 'unsupported';
    const subscription = await registration.pushManager.getSubscription();
    return subscription && Notification.permission === 'granted' ? 'on' : Notification.permission === 'denied' ? 'denied' : 'off';
  }
  async function render() {
    const host = el('circle-body'); host.replaceChildren();
    if (!user) { host.append(text('p', 'Sign in to create or join a crew circle.', 'empty')); return; }
    if (!state) return;
    const mine = state.owned;
    // Your circle
    const own = document.createElement('div'); own.className = 'circle-block';
    if (!mine) {
      own.append(text('h3', 'Start your circle'), text('p', 'People in your circle are told when an alert is raised by your monitor or by a station camera.'));
      const form = document.createElement('form'); const input = document.createElement('input'); input.placeholder = 'Circle name, e.g. Crew family'; input.maxLength = 40; input.required = true; input.setAttribute('aria-label', 'Circle name');
      const button = text('button', 'Create circle'); button.className = 'primary'; form.append(input, button);
      form.onsubmit = async event => { event.preventDefault(); try { await api('/api/circle', 'POST', { name: input.value }); await refresh(); } catch (error) { say(error.message); } };
      own.append(form);
    } else {
      own.append(text('h3', mine.name), text('p', `${mine.members.length} ${mine.members.length === 1 ? 'person' : 'people'} besides you.`));
      const list = document.createElement('ul'); list.className = 'circle-members';
      for (const member of mine.members) { const item = document.createElement('li'); const remove = text('button', 'Remove'); remove.onclick = async () => { if (!confirm(`Remove ${member.username} from your circle?`)) return; await api(`/api/circle/members/${member.id}`, 'DELETE'); refresh(); }; item.append(text('span', member.username), remove); list.append(item); }
      const invite = text('button', 'Make an invite code'); invite.onclick = async () => { const made = await api('/api/circle/invite', 'POST'); const box = el('circle-code'); box.hidden = false; box.replaceChildren(text('div', made.code, 'code'), text('p', `Give this to someone who has an account. It works once and expires in ${made.expiresInHours} hours. They enter it under "Join a circle".`)); };
      const test = text('button', 'Send a test alert'); test.onclick = async () => { try { const result = await api('/api/circle/test', 'POST'); say(`Test sent. ${result.sent} push ${result.sent === 1 ? 'notification' : 'notifications'} delivered; open pages see it within a few seconds.`); } catch (error) { say(error.message); } };
      const row = document.createElement('div'); row.className = 'circle-actions'; row.append(invite, test);
      own.append(list, row);
    }
    host.append(own);
    // Circles you belong to
    const joined = document.createElement('div'); joined.className = 'circle-block';
    joined.append(text('h3', 'Join a circle'));
    for (const circle of state.memberOf) { const item = document.createElement('p'); item.append(`You are in “${circle.name}”. `); const leave = text('button', 'Leave'); leave.onclick = async () => { await api(`/api/circle/members/${state.you.id}`, 'DELETE'); refresh(); }; item.append(leave); joined.append(item); }
    const form = document.createElement('form'); const input = document.createElement('input'); input.placeholder = 'Invite code'; input.maxLength = 8; input.required = true; input.setAttribute('aria-label', 'Invite code'); input.className = 'code-input';
    const button = text('button', 'Join'); form.append(input, button);
    form.onsubmit = async event => { event.preventDefault(); try { const result = await api('/api/circle/join', 'POST', { code: input.value }); say(`Joined “${result.circle}”.`); input.value = ''; refresh(); } catch (error) { say(error.message); } };
    joined.append(form); host.append(joined);
    // Phone calls: each person adds their own number and agrees to be called.
    const phone = document.createElement('div'); phone.className = 'circle-block';
    phone.append(text('h3', 'Phone calls'));
    if (!calls?.configured) phone.append(text('p', 'Phone calls are not set up on this server yet (see web/README, Phone calls).'));
    else if (calls.number) {
      phone.append(text('p', `Serious alerts (someone asks for help, or does not answer the check-in) will call ${calls.number}.`));
      const row = document.createElement('div'); row.className = 'circle-actions';
      const test = text('button', 'Send me a test call'); test.onclick = async () => { try { await api('/api/calls/test', 'POST'); say('Calling you now. Pick up to hear the alert.'); } catch (error) { say(error.message); } };
      const remove = text('button', 'Remove my number'); remove.onclick = async () => { await api('/api/calls/me', 'DELETE'); await refresh(); };
      row.append(test, remove); phone.append(row);
    } else {
      phone.append(text('p', 'Get a phone call for serious alerts. Only you can add your own number.'));
      const form = document.createElement('form'), input = document.createElement('input'); input.type = 'tel'; input.placeholder = '+15551234567'; input.required = true; input.autocomplete = 'tel'; input.setAttribute('aria-label', 'Your phone number with country code');
      const agree = document.createElement('label'); agree.className = 'toggle'; const box = document.createElement('input'); box.type = 'checkbox'; box.required = true; agree.append(box, ' I agree that CrewSafety may call this number for serious alerts, and that the number is shared with ElevenLabs and Twilio to place the calls.');
      const save = text('button', 'Save my number'); save.className = 'primary';
      form.style.flexDirection = 'column'; form.append(input, agree, save);
      form.onsubmit = async event => { event.preventDefault(); try { await api('/api/calls/me', 'PUT', { phone: input.value, consent: box.checked }); say('Number saved.'); await refresh(); } catch (error) { say(error.message); } };
      phone.append(form);
    }
    host.append(phone);
    // Notifications on this device
    const notify = document.createElement('div'); notify.className = 'circle-block';
    notify.append(text('h3', 'Alerts on this device'));
    const status = await pushState(), configured = state.push.configured;
    const note = text('p', !configured ? 'Push is not set up on this server yet (see web/README, Circles and push). Open pages still show alerts within a few seconds.' : status === 'unsupported' ? 'This browser cannot receive push notifications. On iPhone, add the site to the Home Screen first.' : status === 'denied' ? 'Notifications are blocked for this site. Allow them in the browser settings.' : status === 'on' ? 'On: this device gets an alert even when the site is closed.' : 'Off: alerts only show while the site is open.');
    notify.append(note);
    if (configured && status !== 'unsupported' && status !== 'denied') {
      const toggle = text('button', status === 'on' ? 'Turn off on this device' : 'Turn on alerts on this device'); if (status !== 'on') toggle.className = 'primary';
      toggle.onclick = async () => { try { status === 'on' ? await unsubscribe() : await subscribe(); } catch (error) { say(error.message || 'Could not change notifications.'); } render(); };
      notify.append(toggle);
    }
    host.append(notify);
    // Recent alerts
    const recent = document.createElement('div'); recent.className = 'circle-block'; recent.append(text('h3', 'Recent alerts'));
    if (!history.length) recent.append(text('p', 'No alerts yet.', 'empty')); for (const alert of history.slice(0, 8)) recent.append(text('p', `${new Date(alert.at).toLocaleTimeString()} · ${alert.title}: ${alert.body}`));
    host.append(recent);
  }
  async function subscribe() {
    if (await Notification.requestPermission() !== 'granted') throw new Error('Notification permission was not given.');
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(state.push.key) });
    await api('/api/push/subscribe', 'POST', subscription.toJSON()); say('Alerts are on for this device.');
  }
  async function unsubscribe() {
    const registration = await navigator.serviceWorker.ready, subscription = await registration.pushManager.getSubscription();
    if (subscription) { await api('/api/push/subscribe', 'DELETE', { endpoint: subscription.endpoint }); await subscription.unsubscribe(); }
    say('Alerts are off for this device.');
  }
  async function refresh() { try { state = await api('/api/circle'); calls = await api('/api/calls/me').catch(() => null); say(''); } catch (error) { say(error.status === 401 ? '' : error.message); } render(); }

  async function check() {
    if (!user || !state || (!state.owned && !state.memberOf.length)) return;
    try {
      const data = await api(`/api/circle/alerts?after=${after ?? 0}`);
      if (after === null) { after = data.latest; return; } // first look only sets the starting point
      for (const alert of data.alerts) { after = Math.max(after, alert.id); history.unshift(alert); onAlert?.(alert); }
      if (data.alerts.length) render();
    } catch {}
  }
  return {
    userChanged(next) { user = next; state = null; after = null; history = []; clearInterval(poll); render(); if (next) { refresh().then(check); poll = setInterval(check, 3000); } },
    refresh,
  };
}
