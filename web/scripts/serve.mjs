import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { createWorker } from '../worker.mjs';
import { loadAssets } from './build.mjs';
import { localSyncDB } from './local-sync-db.mjs';
// Accounts, journal vectors and pairing sessions persist in an ignored local file.
const DB=localSyncDB(process.env.CREW_DB_PATH||fileURLToPath(new URL('../.data/local.sqlite',import.meta.url)));
const PORT=Number(process.env.PORT)||4173;

const worker = createWorker(await loadAssets(), fetch);
createServer(async (incoming, outgoing) => {
  try {
    // Same-origin checks compare Origin with this URL, so honour localhost and 127.0.0.1 alike.
    const host = /^(localhost|127\.0\.0\.1|\[::1\]):\d+$/.test(incoming.headers.host || '') ? incoming.headers.host : `127.0.0.1:${PORT}`;
    const request = new Request(`http://${host}${incoming.url}`, { method: incoming.method, headers: incoming.headers,
      ...(['GET', 'HEAD'].includes(incoming.method) ? {} : { body: incoming, duplex: 'half' }) });
    const response = await worker.fetch(request, {...process.env,DB});
    const headers = Object.fromEntries(response.headers);
    if (response.headers.getSetCookie().length) headers['set-cookie'] = response.headers.getSetCookie();
    outgoing.writeHead(response.status, headers);
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  } catch { outgoing.writeHead(500); outgoing.end('Local server error'); }
}).listen(PORT, '127.0.0.1', () => console.log(`CrewSafety: http://127.0.0.1:${PORT}`));
