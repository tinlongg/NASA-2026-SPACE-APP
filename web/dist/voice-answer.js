// Spoken answers to a possible-unresponsive alert, recognised on this device only.
// The words are matched to one of two meanings; the text itself is not kept.

const HELP = /\b(help|emergency|hurt|injured|pain|not (ok|okay|fine|alright|all right)|i'?m not|am not (ok|okay|fine))\b/;
const OK = /\b(i'?m|i am|all)\s*(ok|okay|fine|good|alright|all right)\b|\b(ok|okay|fine|alright|all right|yes|yeah|yep)\b/;

/** 'help' when the words ask for help or say they are not okay, 'ok' when they say they are okay, else null. */
export function classifyAnswer(text) {
  const spoken = String(text || '').toLowerCase().replace(/[.,!?]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!spoken) return null;
  if (HELP.test(spoken)) return 'help';
  return OK.test(spoken) ? 'ok' : null;
}

export const LISTEN_SECONDS = 30;
export const ANSWER_LABEL = { ok: 'Said they are okay', help: 'Asked for help', none: 'No spoken answer heard' };

const recognition = () => window.SpeechRecognition || window.webkitSpeechRecognition;

/** 'unsupported', or the browser's answer for on-device English: 'available', 'downloadable', 'downloading', 'unavailable'. */
export async function onDeviceSupport() {
  const Recognition = recognition();
  if (!Recognition || !('processLocally' in Recognition.prototype) || !Recognition.available) return 'unsupported';
  try { return await Recognition.available({ langs: ['en-US'], processLocally: true }); } catch { return 'unsupported'; }
}

export async function installLanguagePack() {
  const Recognition = recognition();
  return Boolean(Recognition?.install && await Recognition.install({ langs: ['en-US'], processLocally: true }));
}

/** Listens for one answer. The promise resolves 'ok', 'help' or 'none'; call .stop() to end it early.
 *  Never falls back to server-side recognition. */
export function listenForAnswer({ seconds = LISTEN_SECONDS, onHeard } = {}) {
  let stop = () => {};
  const promise = new Promise(resolve => {
    const Recognition = recognition();
    if (!Recognition) return resolve('none');
    const rec = new Recognition();
    rec.lang = 'en-US'; rec.continuous = true; rec.interimResults = true; rec.processLocally = true;
    if (rec.processLocally !== true) return resolve('none'); // would send audio to a server: refuse
    let done = false;
    const finish = result => { if (done) return; done = true; clearTimeout(timer); try { rec.stop(); } catch {} resolve(result); };
    stop = () => finish('none');
    const timer = setTimeout(() => finish('none'), seconds * 1000);
    rec.onresult = event => {
      let heard = ''; for (const result of event.results) heard += ' ' + result[0].transcript;
      const answer = classifyAnswer(heard);
      onHeard?.(Boolean(heard.trim()));
      if (answer) finish(answer);
    };
    rec.onerror = () => finish('none');
    rec.onend = () => finish('none');
    try { rec.start(); } catch { finish('none'); }
  });
  promise.stop = () => stop();
  return promise;
}
