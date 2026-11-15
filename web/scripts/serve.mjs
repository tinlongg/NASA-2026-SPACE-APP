import { createServer } from 'node:http';
import { createWorker } from '../worker.mjs';
import { loadAssets, loadCorpus } from './build.mjs';
import { localSyncDB } from './local-sync-db.mjs';
const DB=localSyncDB();

const worker = createWorker(await loadAssets(), fetch, await loadCorpus());
createServer(async (incoming, outgoing) => {
  try {
    const request = new Request(`http://127.0.0.1:4173${incoming.url}`, { method: incoming.method, headers: incoming.headers,
      ...(['GET', 'HEAD'].includes(incoming.method) ? {} : { body: incoming, duplex: 'half' }) });
    const response = await worker.fetch(request, {...process.env,DB});
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  } catch { outgoing.writeHead(500); outgoing.end('Local server error'); }
}).listen(4173, '127.0.0.1', () => console.log('CrewSafety: http://127.0.0.1:4173'));
