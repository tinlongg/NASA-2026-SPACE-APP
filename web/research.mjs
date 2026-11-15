// Deployment adapter for the frozen FastAPI /chat contract. The corpus, scoring
// metadata, prompt, disclaimer, and fallback replies are exported from backend/.
export function tokenize(text, stopwords) {
  return (text.toLowerCase().match(/[a-z0-9]+/g) || []).filter(t => t.length >= 2 && !stopwords.includes(t)).map(t => {
    for (const suffix of ['ing', 'es', 's']) {
      if (t.length > suffix.length + 3 && t.endsWith(suffix)) { t = t.slice(0, -suffix.length); break; }
    }
    return t.endsWith('e') && t.length > 4 ? t.slice(0, -1) : t;
  });
}

export function retrieve(question, corpus) {
  const terms = new Set(tokenize(question, corpus.stopwords));
  const sources = new Map(corpus.sources.map(source => [source.id, source]));
  return corpus.chunks.filter(chunk => sources.has(chunk.sourceId)).map(chunk => {
    let score = 0;
    for (const term of terms) {
      const tf = chunk.terms[term] || 0;
      if (tf) score += corpus.idf[term] * tf * 2.5 / (tf + 1.5 * (0.25 + 0.75 * (corpus.averageLength ? chunk.length / corpus.averageLength : 1)));
    }
    return { chunk, source: sources.get(chunk.sourceId), score };
  }).filter(hit => hit.score >= corpus.minScore).sort((a,b) => b.score - a.score).slice(0, corpus.topK);
}

export function citationsFor(hits) {
  const seen = new Set();
  return hits.filter(hit => {
    const key = JSON.stringify([hit.source.id, hit.chunk.sectionOrPage]);
    if (seen.has(key)) return false; seen.add(key); return true;
  }).map(hit => ({ title: hit.source.title, url: hit.source.url, sectionOrPage: hit.chunk.sectionOrPage ?? null }));
}

export async function answerResearch(question, corpus, env, fetchProvider, allowGeneration) {
  const hits = retrieve(question, corpus);
  const base = { disclaimer: corpus.disclaimer, grounded: Boolean(hits.length), answerMode: 'extractive' };
  if (!hits.length) return { ...base, answer: corpus.noSupport, citations: [] };
  let answer = 'The most relevant passages from the curated documents are quoted below, unedited.\n\n' +
    hits.slice(0,2).map(hit => `“${hit.chunk.text}” — ${hit.source.title}`).join('\n\n');
  let answerMode = 'extractive';
  if (env.META_API_KEY && allowGeneration()) {
    try {
      const passages = hits.map((hit,i) => `[${i+1}] ${hit.chunk.text}`).join('\n\n');
      const response = await fetchProvider('https://api.meta.ai/v1/chat/completions', {
        method: 'POST', headers: { Authorization: `Bearer ${env.META_API_KEY}`, 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(12000),
        body: JSON.stringify({ model: env.META_MODEL || 'muse-spark-1.3', reasoning_effort: 'low', max_completion_tokens: 1200,
          messages: [{ role: 'developer', content: corpus.prompt }, { role: 'user', content: `Passages:\n\n${passages}\n\nQuestion: ${question}` }] }),
      });
      if (!response.ok) throw new Error('unavailable');
      const choice = (await response.json()).choices?.[0];
      if (choice?.finish_reason !== 'stop' || typeof choice.message?.content !== 'string' || !choice.message.content.trim()) throw new Error('incomplete');
      answer = choice.message.content.trim(); answerMode = 'generated';
    } catch { /* Provider failure preserves cited, deterministic extractive results. */ }
  }
  return { ...base, answer, citations: citationsFor(hits), answerMode };
}
