// Sign-in dialog and same-origin API helper. The session lives in an HttpOnly cookie,
// so this script never sees or stores a token; passwords are only ever posted to the server.
const el = id => document.getElementById(id);

export async function api(path, method = 'GET', body, timeout = 15000) {
  const response = await fetch(path, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, cache: 'no-store', credentials: 'same-origin', signal: AbortSignal.timeout(timeout) });
  let data;
  try { data = await response.json(); } catch { throw new Error('Accounts need the hosted site or the local Node server.'); }
  if (!response.ok) throw Object.assign(new Error(typeof data.error === 'string' ? data.error : 'Accounts need the hosted site or the local Node server.'), { status: response.status });
  return data;
}

export function initAccount(onChange) {
  const dialog = el('account-dialog'), form = el('account-form'), message = el('account-message');
  let user = null, registering = false, busy = false;
  function render() {
    el('account-label').textContent = user ? `@${user.username}${user.role==='admin'?' · Admin':''}` : 'Sign in';
    el('account-button').title = user ? 'Account' : '';
    el('account-signed-out').hidden = Boolean(user); el('account-signed-in').hidden = !user;
    el('account-title').textContent = user ? 'Your account' : registering ? 'Create account' : 'Sign in';
    el('account-submit').textContent = registering ? 'Create account' : 'Sign in';
    el('account-mode').textContent = registering ? 'I already have an account' : 'Create an account instead';
    el('account-password').autocomplete = registering ? 'new-password' : 'current-password';
    el('account-password').minLength = registering ? 8 : 1;
    el('account-phone-block').hidden = !registering;
    document.querySelector('label[for="account-password"]').textContent = registering ? 'Password, at least 8 characters' : 'Password';
    if (user) el('account-summary').textContent = `Signed in as @${user.username}${user.role==='admin'?' · Administrator across CrewSafety':''}. Journal entries you save are stored in your account and indexed for search and MUSE memory.`;
  }
  function set(next) { user = next; render(); onChange(user); }
  function open(register = false) { registering = register; message.textContent = ''; render(); if (!dialog.open) dialog.showModal(); }
  el('account-button').onclick = () => open();
  el('account-close').onclick = () => dialog.close();
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  el('account-mode').onclick = () => { registering = !registering; message.textContent = ''; render(); };
  form.onsubmit = async event => {
    event.preventDefault(); if (busy) return;
    busy = true; el('account-submit').disabled = true; message.textContent = registering ? 'Creating account…' : 'Signing in…';
    try {
      const wantsPhone = registering && form.elements.phone.value.trim() !== '', consent = form.elements.phoneConsent.checked, phone = form.elements.phone.value;
      if (wantsPhone && !consent) { message.textContent = 'Tick the box to agree to alert calls, or clear the phone number.'; return; }
      const data = await api(registering ? '/api/auth/register' : '/api/auth/login', 'POST', { username: form.elements.username.value, password: form.elements.password.value });
      form.reset(); message.textContent = ''; dialog.close(); set(data.user);
      // The account exists now. The number goes through the same opt-in route as the Circle tab; a bad number never undoes sign-up.
      if (wantsPhone) api('/api/calls/me', 'PUT', { phone, consent }).catch(error => alert(`Your account was created, but the phone number was not saved: ${error.message} You can add it on the Circle tab.`));
    } catch (error) { message.textContent = error.name === 'TimeoutError' ? 'The server took too long. Try again.' : error.message; form.elements.password.value = ''; }
    finally { busy = false; el('account-submit').disabled = false; }
  };
  el('account-signout').onclick = async () => {
    try { await api('/api/auth/logout', 'POST'); dialog.close(); set(null); }
    catch (error) { message.textContent = error.message; }
  };
  render();
  api('/api/auth/me').then(data => { if (data.user) set(data.user); }).catch(() => {});
  return { open, expire() { if (user) set(null); } };
}
