import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

export async function loadAssets() {
  const assets = {};
  for (const [name, type] of Object.entries({ 'index.html': 'text/html', 'styles.css': 'text/css', 'app.js': 'application/javascript', 'detector.js': 'application/javascript', 'fixtures.js': 'application/javascript', 'research-ui.js': 'application/javascript', 'offline-config.js': 'application/javascript', 'fallback.json': 'application/json', 'research.js': 'application/javascript', 'research.css': 'text/css', 'data/nasa-research.json': 'application/json' })) {
    assets[`/${name}`] = { body: await readFile(new URL(`../dist/${name}`, import.meta.url), 'utf8'), type: `${type}; charset=utf-8` };
  }
  const serviceWorker = await readFile(new URL('../dist/sw.js', import.meta.url), 'utf8');
  const version = createHash('sha256').update(JSON.stringify(assets) + serviceWorker).digest('hex').slice(0,16);
  assets['/sw.js'] = { body: serviceWorker.replace('__CACHE_VERSION__', `crewsafety-${version}`), type: 'application/javascript; charset=utf-8' };
  return assets;
}

export async function loadCorpus() {
  return JSON.parse(await readFile(new URL('../research-data.json', import.meta.url), 'utf8'));
}

async function build() {
const assets = await loadAssets();
const research = await readFile(new URL('../research.mjs', import.meta.url), 'utf8');
const source = (await readFile(new URL('../worker.mjs', import.meta.url), 'utf8')).replace("import { answerResearch } from './research.mjs';", '');
const hosting = JSON.parse(await readFile(new URL('../.openai/hosting.json', import.meta.url), 'utf8'));
if (hosting.static) throw new Error('Worker deployment must not declare a static directory.');
await mkdir(new URL('../dist/server/', import.meta.url), { recursive: true });
await writeFile(new URL('../dist/server/index.js', import.meta.url), `${research}\n${source}\nexport default createWorker(${JSON.stringify(assets)}, fetch, ${JSON.stringify(await loadCorpus())});\n`);
console.log('Built Worker with embedded static assets. Runtime secrets are not included.');
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await build();
