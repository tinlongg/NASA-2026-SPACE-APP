const svgNS = 'http://www.w3.org/2000/svg';
const format = value => value == null ? 'Unavailable' : new Intl.NumberFormat('en', { maximumFractionDigits: 3 }).format(value);
function node(tag, text, className) {
  const result = document.createElement(tag);
  if (text != null) result.textContent = text;
  if (className) result.className = className;
  return result;
}
function link(text, url) {
  const a = node('a', text);
  a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer';
  return a;
}
function svgNode(tag, attributes, text) {
  const result = document.createElementNS(svgNS, tag);
  for (const [key, value] of Object.entries(attributes)) result.setAttribute(key, value);
  if (text != null) result.textContent = text;
  return result;
}

export function initializeResearch() {
  const section = node('section', null, 'research');
  section.setAttribute('aria-labelledby', 'research-title');
  section.innerHTML = `
    <div class="research-heading"><div><p class="eyebrow">NASA Open Science Data Repository</p><h2 id="research-title">The research behind crew health</h2><p>Explore historical measurements and the studies behind them.</p></div><span class="pill">Archived data</span></div>
    <p class="research-status" role="status">Loading NASA research snapshot…</p>
    <button class="research-retry" hidden>Retry loading research</button>
    <div class="research-content" hidden>
      <div class="research-summary"></div>
      <div class="panel research-explorer">
        <div class="panel-head"><div><h3>Inspiration4 · blood & metabolic measurements</h3><p>Four participants. Before launch and after return.</p></div><a href="./data/nasa-research.json" download="nasa-research.json">Download snapshot ↓</a></div>
        <div class="research-controls"><label for="research-metric">Measurement<select id="research-metric"></select></label><div class="research-source"></div></div>
        <div class="research-chart-heading" aria-live="polite"></div>
        <div class="research-plot"></div>
        <p class="research-legend"><span class="legend-dot"></span> Cohort mean <span class="legend-range"></span> Observed minimum–maximum · not a healthy range</p>
        <p class="research-timing">L = days before launch · R = days after return. Timepoints are categories, not equally spaced days. No inflight measurements are shown.</p>
        <details class="research-values"><summary>View values and sample counts</summary><div class="research-table-wrap"></div></details>
        <p class="research-caveat">Historical data from a small research cohort, not this crew’s readings. These measurements do not drive safety alerts or diagnoses.</p>
      </div>
      <div class="research-library-heading"><h3>Explore the five studies</h3><p>Human studies, a ground analogue, and an animal methods reference.</p></div>
      <div class="research-studies"></div>
      <details class="research-methods"><summary>Methods, source limitations & provenance</summary><div></div></details>
    </div>`;
  document.getElementById('dashboard').append(section);
  const get = selector => section.querySelector(selector);
  const status = get('.research-status');
  const retry = get('.research-retry');
  const select = get('select');

  function renderSeries(series, studies) {
    const study = studies.find(s => s.accession === series.accession);
    get('.research-source').replaceChildren(link(`${series.accession} · NASA source`, study.sourceUrl), node('p', `Unit: ${series.unit}`));
    get('.research-chart-heading').replaceChildren(node('h3', series.label), node('span', series.unit));
    const svg = svgNode('svg', { viewBox: '0 0 840 290', role: 'img', 'aria-label': `${series.label} in ${series.unit}. Cohort means and observed ranges by research timepoint. Exact values in the table below.` });
    const valid = series.points.filter(p => p.mean != null);
    if (!valid.length) { get('.research-plot').replaceChildren(node('p', 'No measurements available.')); return; }
    const low = Math.min(...valid.map(p => p.min));
    const high = Math.max(...valid.map(p => p.max));
    const padding = (high - low || Math.abs(high) || 1) * .15;
    const bottom = Math.max(0, low - padding), top = high + padding;
    const x = i => 78 + i * 700 / Math.max(1, series.points.length - 1);
    const y = v => 224 - (v - bottom) / (top - bottom) * 190;
    for (let i = 0; i <= 4; i++) {
      const value = bottom + (top - bottom) * i / 4;
      svg.append(svgNode('line', { x1: 68, x2: 800, y1: y(value), y2: y(value), class: 'research-gridline' }), svgNode('text', { x: 56, y: y(value) + 4, 'text-anchor': 'end' }, format(value)));
    }
    let path = '', connected = false;
    series.points.forEach((p, i) => {
      svg.append(svgNode('text', { x: x(i), y: 253, 'text-anchor': 'middle' }, p.timepoint), svgNode('text', { x: x(i), y: 275, 'text-anchor': 'middle' }, `n=${p.n}`));
      if (p.mean == null) { connected = false; return; }
      path += `${connected ? 'L' : 'M'}${x(i)},${y(p.mean)} `; connected = true;
      svg.append(svgNode('line', { x1: x(i), x2: x(i), y1: y(p.min), y2: y(p.max), class: 'research-range' }));
      for (const value of [p.min, p.max]) svg.append(svgNode('line', { x1: x(i) - 7, x2: x(i) + 7, y1: y(value), y2: y(value), class: 'research-range' }));
      const dot = svgNode('circle', { cx: x(i), cy: y(p.mean), r: 5, class: 'research-dot' });
      dot.append(svgNode('title', {}, `${p.timepoint}: mean ${format(p.mean)} ${series.unit}; n=${p.n}; observed ${format(p.min)}–${format(p.max)}`));
      svg.append(dot);
    });
    svg.append(svgNode('path', { d: path, class: 'research-line' }));
    get('.research-plot').replaceChildren(svg);
    const table = node('table');
    table.append(node('caption', `${series.label} (${series.unit}) — descriptive research values`));
    const head = node('thead'), header = node('tr');
    for (const label of ['Timepoint', 'Mean', 'Minimum', 'Maximum', 'Samples', 'Missing']) { const th = node('th', label); th.scope = 'col'; header.append(th); }
    head.append(header); table.append(head);
    const body = node('tbody');
    for (const p of series.points) {
      const row = node('tr'), th = node('th', p.timepoint); th.scope = 'row'; row.append(th);
      for (const value of [p.mean, p.min, p.max, p.n, p.missing]) row.append(node('td', format(value)));
      body.append(row);
    }
    table.append(body); get('.research-table-wrap').replaceChildren(table);
  }

  async function load() {
    status.hidden = false; status.textContent = 'Loading NASA research snapshot…'; retry.hidden = true;
    try {
      const response = await fetch('./data/nasa-research.json', { signal: AbortSignal.timeout(12000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (data.schemaVersion !== 1 || !data.studies?.length || !data.series?.length) throw new Error('Invalid research snapshot');
      const count = data.studies.reduce((total, s) => total + s.files.length, 0);
      get('.research-summary').textContent = `${data.studies.length} studies · ${count} source tables · ${data.series.length} chart measurements · Snapshot retrieved ${data.retrievedOn}`;
      select.replaceChildren(...data.series.map((s, i) => { const option = node('option', s.label); option.value = i; return option; }));
      select.onchange = () => renderSeries(data.series[Number(select.value)], data.studies);
      renderSeries(data.series[0], data.studies);
      const cards = data.studies.map(s => {
        const card = node('article', null, 'panel research-study');
        card.append(node('p', `${s.accession} · ${s.population}`, 'eyebrow'), node('h3', s.topic), node('p', s.applicationUse), link('View study at NASA', s.sourceUrl));
        const details = node('details'); details.append(node('summary', `Study details · ${s.files.length} downloaded tables`), node('p', s.title), node('p', `Study version ${s.version}`));
        for (const file of s.files) details.append(link(`${file.category} · ${file.rowCount} rows`, file.url));
        if (!s.files.length) details.append(node('p', 'Metadata reference only; expression measurements were not downloaded.'));
        card.append(details); return card;
      });
      get('.research-studies').replaceChildren(...cards);
      const notes = [
        ...data.limitations,
        'Means use available numeric samples; missing measurements are not replaced with zero. Min/max are observed values, not confidence intervals.',
        'The metabolic table includes R+194 even though the study narrative lists earlier follow-ups. Timepoints here follow the downloaded table.',
        'Hemoglobin is omitted because its source unit label is ambiguous. The urine table has duplicate empty headers and is not used in these charts.',
        'Mouse pose data is a methods reference, not evidence of accuracy for human fall detection. Research records are not connected to MUSE answers.'
      ];
      const list = node('ul'); notes.forEach(n => list.append(node('li', n)));
      get('.research-methods div').replaceChildren(list);
      get('.research-content').hidden = false; status.hidden = true;
    } catch (error) {
      get('.research-content').hidden = true;
      status.textContent = 'NASA research could not be loaded. Your crew dashboard is still available. Retry to load the saved snapshot.';
      retry.hidden = false;
    }
  }
  retry.onclick = load;
  load();
}
