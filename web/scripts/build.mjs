import {PAGE_ROUTES,MISSION_ROUTES} from '../dist/page-routes.js';
import './build-sentiment.mjs';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

export async function loadAssets() {
  const assets = {};
  for (const [name, type] of Object.entries({ 'page-routes.js':'application/javascript', 'favicon.svg':'image/svg+xml', 'index.html': 'text/html', 'space-games.js':'application/javascript', 'mission.js':'application/javascript', 'mission-rules.js':'application/javascript', 'mission.css':'text/css', 'journal-sentiment.js': 'application/javascript', 'sentiment-lexicon.js': 'application/javascript', 'sentiment-license.txt': 'text/plain', 'styles.css': 'text/css', 'app.js': 'application/javascript', 'detector.js': 'application/javascript', 'fixtures.js': 'application/javascript', 'offline-config.js': 'application/javascript', 'crew-sync.js': 'application/javascript', 'account.js': 'application/javascript', 'journal-photo.js': 'application/javascript', 'suit-layers.js': 'application/javascript', 'camera-health.js': 'application/javascript', 'people.js': 'application/javascript', 'voice-answer.js': 'application/javascript', 'voice-activity.js':'application/javascript', 'checkin.js': 'application/javascript', 'camera.js': 'application/javascript', 'stations-ui.js': 'application/javascript', 'iss-3d.js': 'application/javascript', 'circle-ui.js': 'application/javascript', 'camera.html': 'text/html', 'crew-sync.css': 'text/css', 'research.js': 'application/javascript', 'research.css': 'text/css', 'data/nasa-research.json': 'application/json' })) {
    assets[`/${name}`] = { body: await readFile(new URL(`../dist/${name}`, import.meta.url), 'utf8'), type: `${type}; charset=utf-8` };
  }
  for(const path of Object.values({...PAGE_ROUTES,...MISSION_ROUTES}))assets[path]=assets['/index.html'];
  assets['/camera'] = assets['/camera.html']; // the phone camera page lives at /camera
  // Binary assets are embedded as base64 and decoded by the Worker.
  for (const name of ['web-alert.mp3', 'web-checkin.mp3']) assets[`/voice/${name}`] = { base64: (await readFile(new URL(`../dist/voice/${name}`, import.meta.url))).toString('base64'), type: 'audio/mpeg' };
  const serviceWorker = await readFile(new URL('../dist/sw.js', import.meta.url), 'utf8');
  const version = createHash('sha256').update(JSON.stringify(assets) + serviceWorker).digest('hex').slice(0,16);
  assets['/sw.js'] = { body: serviceWorker.replace('__CACHE_VERSION__', `crewsafety-${version}`), type: 'application/javascript; charset=utf-8' };
  return assets;
}


async function build() {
const assets = await loadAssets();
const pageRoutes=await readFile(new URL('../dist/page-routes.js',import.meta.url),'utf8');
const sync = await readFile(new URL('../sync.mjs', import.meta.url), 'utf8');
const source = (await readFile(new URL('../worker.mjs', import.meta.url), 'utf8')).replace("import {PAGE_ROUTES,pageForPath} from './dist/page-routes.js';",'').replace("import { handleMission } from './mission.mjs';", '').replace("import { handleStations } from './stations.mjs';", '').replace("import { handleCircle } from './circle.mjs';", '').replace("import { handleCalls } from './calls.mjs';", '').replace("import { handleCrewSync } from './sync.mjs';", '').replace("import { createAccounts, accountUser, journalRecall, journalPhotosForCompare } from './account.mjs';", '');
if (/^import /m.test(source)) throw new Error('worker.mjs has an import the bundle does not inline.');
const account = await readFile(new URL('../account.mjs', import.meta.url), 'utf8');
const missionRules = await readFile(new URL('../dist/mission-rules.js', import.meta.url), 'utf8');
const mission = (await readFile(new URL('../mission.mjs', import.meta.url), 'utf8')).replace(/^import .*;$/gm, '');
const stations = (await readFile(new URL('../stations.mjs', import.meta.url), 'utf8')).replace(/^import .*;$/gm, '');
const webpush = (await readFile(new URL('../webpush.mjs', import.meta.url), 'utf8')).replace(/^import .*;$/gm, '');
const calls = (await readFile(new URL('../calls.mjs', import.meta.url), 'utf8')).replace(/^import .*;$/gm, '');
const circle = (await readFile(new URL('../circle.mjs', import.meta.url), 'utf8')).replace(/^import .*;$/gm, '');
const hosting = JSON.parse(await readFile(new URL('../.openai/hosting.json', import.meta.url), 'utf8'));
if (hosting.static) throw new Error('Worker deployment must not declare a static directory.');
await mkdir(new URL('../dist/server/', import.meta.url), { recursive: true });
await writeFile(new URL('../dist/server/index.js', import.meta.url), `${pageRoutes}\n${sync}\n${account}\n${missionRules}\n${mission}\n${webpush}\n${calls}\n${circle}\n${stations}\n${source}\nexport default createWorker(${JSON.stringify(assets)}, fetch);\n`);
const folder = new URL('../drizzle/', import.meta.url), { readdir } = await import('node:fs/promises');
const migrations = [];
for (const name of (await readdir(folder)).filter(name => name.endsWith('.sql')).sort()) migrations.push([name, await readFile(new URL(name, folder), 'utf8')]);
await writeFile(new URL('../dist/server/migrations.js', import.meta.url), `export default ${JSON.stringify(migrations)};\n`);
await mkdir(new URL('../public/', import.meta.url), { recursive: true }); // Vercel needs a non-empty output folder; every other path goes to the function
await writeFile(new URL('../public/_host.txt', import.meta.url), 'CrewSafety website. Pages are served by api/index.mjs.\n');
console.log('Built Worker with embedded static assets. Runtime secrets are not included.');
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await build();
