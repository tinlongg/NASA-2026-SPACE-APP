export const normalizeQuestion = value => value.trim().toLowerCase().replace(/[?!.]+$/, '').replace(/\s+/g, ' ');
export function pickDemo(question, entries) {
  // A saved answer must never silently answer a different question just because
  // it shares a keyword. The original prepared question is displayed explicitly.
  return entries.find(entry => normalizeQuestion(entry.question) === normalizeQuestion(question)) || null;
}

export async function requestResearch(question, entries, { demo = false, fetcher = fetch } = {}) {
  const fallback = () => {
    const entry = pickDemo(question, entries);
    if (!entry) throw new Error('No saved answer for that question. Choose a prepared question below or reconnect for Live mode.');
    return { ...entry, grounded: true, answerMode: 'precomputed' };
  };
  if (demo) return fallback();
  try {
    const response = await fetcher('/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, context: 'general_wellness' }), signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error('unavailable');
    const body = await response.json();
    if (typeof body.answer !== 'string' || typeof body.grounded !== 'boolean' || !Array.isArray(body.citations) || !['generated','extractive'].includes(body.answerMode)) throw new Error('invalid response');
    return body;
  } catch { return fallback(); }
}

export async function initResearch() {
  const el = id => document.getElementById(id);
  let entries = [], pending = false;
  try {
    const response = await fetch('/fallback.json');
    if (!response.ok) throw new Error();
    entries = await response.json();
    for (const entry of entries) {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = entry.question;
      button.onclick = () => { el('research-question').value = entry.question; el('research-form').requestSubmit(); };
      el('prepared-questions').append(button);
    }
  } catch { el('research-status').textContent = 'Saved answers unavailable. Live mode can still be used when connected.'; }
  fetch('/health').then(r => { if (!r.ok) throw new Error(); return r.json(); }).then(data => {
    el('research-status').textContent = `${data.documents} documents · ${data.chunks} passages · ${data.llm === 'configured' ? 'Meta configured; extractive fallback available' : 'Extractive mode'} · independent source review pending`;
  }).catch(() => { el('research-status').textContent = `Service unavailable · ${entries.length} prepared answers available in Demo mode`; });
  el('research-form').onsubmit = async event => {
    event.preventDefault(); const question = el('research-question').value.trim();
    if (!question || pending) return;
    pending = true; el('ask-research').disabled = true;
    const row = document.createElement('article'); row.className = 'entry';
    const heading = document.createElement('strong'); heading.textContent = question;
    const mode = document.createElement('p'); mode.className = 'micro'; mode.textContent = 'Retrieving research…';
    const answer = document.createElement('p'); answer.className = 'research-answer';
    row.append(heading, mode, answer); el('research-chat').append(row);
    try {
      const result = await requestResearch(question, entries, { demo: el('research-demo').checked });
      mode.textContent = result.answerMode === 'precomputed' ? `Demo mode · saved answer to: ${result.question}` :
        result.grounded ? `${result.answerMode === 'generated' ? 'Live · AI-generated' : 'Extractive · source excerpts'} · retrieved sources below` : 'No supporting source found';
      answer.textContent = result.answer;
      for (const citation of result.citations) {
        const url = new URL(citation.url);
        if (url.protocol !== 'https:' || !(url.hostname === 'nasa.gov' || url.hostname.endsWith('.nasa.gov'))) continue;
        const link = document.createElement('a'); link.href = url.href; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.className = 'citation';
        link.textContent = `${citation.title}${citation.sectionOrPage ? ` · ${citation.sectionOrPage}` : ''} ↗`; row.append(link);
      }
      const disclaimer = document.createElement('p'); disclaimer.className = 'micro'; disclaimer.textContent = result.disclaimer; row.append(disclaimer);
    } catch (error) { mode.textContent = 'Research unavailable'; answer.textContent = error.message; }
    finally { pending = false; el('ask-research').disabled = false; }
  };
}
