import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const root = path.dirname(fileURLToPath(import.meta.url));
const read = name => JSON.parse(fs.readFileSync(path.join(root, name), 'utf8'));
const selected = [
  [569, 'Blood health', 'Human spaceflight', 'Historical blood-count comparisons for a research panel; not current crew vital signs.'],
  [575, 'Metabolic and immune health', 'Human spaceflight', 'Historical metabolic and cytokine measurements; not heart-rate data or alert thresholds.'],
  [656, 'Inflammation research', 'Human spaceflight', 'Urine protein measurements for research context; not a wellness score or diagnosis.'],
  [195, 'Muscle deconditioning', 'Human ground analogue', 'Bedrest muscle gene-expression research for activity context; not measured fall risk.'],
  [952, 'Pose and behavior monitoring', 'Mouse spaceflight', 'Methods reference for video-based monitoring. Mouse behavior does not validate human fall detection.'],
];

// Preserve quoted delimiters, embedded newlines and escaped quotes in NASA CSVs.
function parseCSV(text) {
  const rows = []; let row = [], field = '', quoted = false;
  text = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') { field += '"'; i++; }
      else quoted = !quoted;
    } else if (!quoted && (c === ',' || c === '\n' || c === '\r')) {
      row.push(field); field = '';
      if (c !== ',') {
        if (row.some(value => value !== '')) rows.push(row);
        row = [];
        if (c === '\r' && text[i + 1] === '\n') i++;
      }
    } else field += c;
  }
  assert(!quoted, 'Unclosed CSV quotation');
  if (field || row.length) { row.push(field); rows.push(row); }
  const headers = rows.shift();
  for (const r of rows) assert.equal(r.length, headers.length, 'CSV row width');
  return { headers, rows };
}

const studies = selected.map(([id, topic, population, applicationUse]) => {
  const accession = `OSD-${id}`;
  const envelope = read(`raw/${accession}.metadata.json`).study[accession];
  const s = envelope.studies[0];
  assert(s.title && s.description);
  const inventory = read(`raw/${accession}.files.json`).studies[accession];
  const files = inventory.study_files.filter(f => fs.existsSync(path.join(root, 'tables', f.file_name))).map(f => {
    assert.equal(f.restricted, false);
    const bytes = fs.readFileSync(path.join(root, 'tables', f.file_name));
    assert.equal(bytes.length, f.file_size, `Download size mismatch: ${f.file_name}`);
    const parsed = parseCSV(bytes.toString('utf8'));
    return { name: f.file_name, category: f.category, url: `https://osdr.nasa.gov${f.remote_url}`,
      bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'),
      rowCount: parsed.rows.length, columns: parsed.headers,
      duplicateHeaders: [...new Set(parsed.headers.filter((h,i,a) => a.indexOf(h) !== i))],
      localPath: `tables/${f.file_name}` };
  });
  return { accession, title: s.title, version: envelope.version, topic, population, applicationUse,
    sourceUrl: `https://osdr.nasa.gov/bio/repo/data/studies/${accession}`,
    metadataUrl: `https://osdr.nasa.gov/osdr/data/osd/meta/${id}`,
    filesUrl: `https://osdr.nasa.gov/osdr/data/osd/files/${id}`,
    description: s.description, assays: [...new Set(s.assays.map(a => a.measurementType.annotationValue))],
    publications: s.publications.map(p => ({ title: p.title, doi: p.doi })), files };
});

const specifications = [
  [569, 'LSDS-7_Complete_Blood_Count_CBC_TRANSFORMED.csv', 'white_blood_cell_count_value_thousand_per_microliter', 'White blood cells', 'thousand/µL'],
  [569, 'LSDS-7_Complete_Blood_Count_CBC_TRANSFORMED.csv', 'red_blood_cell_count_value_million_per_microliter', 'Red blood cells', 'million/µL'],
  [569, 'LSDS-7_Complete_Blood_Count_CBC_TRANSFORMED.csv', 'platelet_count_value_thousand_per_microliter', 'Platelets', 'thousand/µL'],
  [575, 'LSDS-8_Comprehensive_Metabolic_Panel_CMP_TRANSFORMED.csv', 'glucose_value_milligram_per_deciliter', 'Glucose', 'mg/dL'],
  [575, 'LSDS-8_Comprehensive_Metabolic_Panel_CMP_TRANSFORMED.csv', 'calcium_value_milligram_per_deciliter', 'Calcium', 'mg/dL'],
  [575, 'LSDS-8_Comprehensive_Metabolic_Panel_CMP_TRANSFORMED.csv', 'sodium_value_millimol_per_liter', 'Sodium', 'mmol/L'],
  [575, 'LSDS-8_Comprehensive_Metabolic_Panel_CMP_TRANSFORMED.csv', 'potassium_value_millimol_per_liter', 'Potassium', 'mmol/L'],
];
const series = specifications.map(([id, file, column, label, unit]) => {
  const { headers, rows: rawRows } = parseCSV(fs.readFileSync(path.join(root, 'tables', file), 'utf8'));
  assert.equal(new Set(headers).size, headers.length, 'Ambiguous columns in chart input');
  const rows = rawRows.map(r => Object.fromEntries(headers.map((h,i) => [h,r[i]])));
  assert(headers.includes(column));
  const groups = new Map();
  for (const row of rows) {
    const match = row['Sample Name'].match(/_(L-\d+|R\+\d+)(?:_|$)/);
    assert(match, `Unknown timepoint: ${row['Sample Name']}`);
    const timepoint = match[1], subject = row['Sample Name'].split('_')[0];
    if (!groups.has(timepoint)) groups.set(timepoint, { values: [], subjects: new Set(), missing: 0 });
    const group = groups.get(timepoint);
    assert(!group.subjects.has(subject), 'Duplicate subject within timepoint');
    group.subjects.add(subject);
    const raw = row[column].trim();
    if (/^(?:NA|N\/A|NaN)?$/i.test(raw)) { group.missing++; continue; }
    const value = Number(raw); assert(Number.isFinite(value), `Non-numeric ${column}: ${raw}`);
    group.values.push(value);
  }
  const points = [...groups].sort(([a], [b]) => {
    const order = t => t.startsWith('L') ? -Number(t.slice(2)) : Number(t.slice(2));
    return order(a) - order(b);
  }).map(([timepoint, {values, subjects, missing}]) => ({ timepoint,
    reference: timepoint.startsWith('L') ? 'days before launch' : 'days after return',
    days: Number(timepoint.slice(2)), n: values.length, availableSubjects: subjects.size, missing,
    mean: values.length ? Number((values.reduce((a,b) => a+b, 0) / values.length).toFixed(6)) : null,
    min: values.length ? Math.min(...values) : null, max: values.length ? Math.max(...values) : null }));
  return { accession: `OSD-${id}`, label, unit, sourceFile: file, sourceColumn: column, points };
});
const result = { schemaVersion: 1, retrievedOn: '2026-11-14', dataKind: 'Historical research, not live telemetry',
  limitations: ['Descriptive means across available samples; not clinical reference ranges or causal effects.',
    'Inspiration4 measurements come from one small mission cohort; studies overlap and are not independent cohorts.',
    'L means days before launch; R means days after return. Keep these categorical timepoints separate.',
    'No verified sleep, heart-rate, stress-score or human fall-threshold dataset is included.'],
  studies, series };
fs.mkdirSync(path.join(root, '../../web/dist/data'), { recursive: true });
fs.writeFileSync(path.join(root, '../../web/dist/data/nasa-research.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ studies: studies.length, tables: studies.reduce((n,s) => n+s.files.length,0), rows: studies.reduce((n,s) => n+s.files.reduce((a,f)=>a+f.rowCount,0),0), chartSeries: series.length, points: series.map(s => ({label:s.label,points:s.points.length,n:s.points.map(p=>p.n)})) }, null, 2));
