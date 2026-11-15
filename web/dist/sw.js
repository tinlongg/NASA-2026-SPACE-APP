import { SHELL_ASSETS, MODEL_ASSETS, cacheableAsset } from './offline-config.js';
const CACHE = '__CACHE_VERSION__'; // Replaced with a content hash at build time.
self.addEventListener('install', event => event.waitUntil((async () => {
  const cache = await caches.open(CACHE);
  await cache.addAll(SHELL_ASSETS);
  await self.skipWaiting();
})()));
self.addEventListener('activate', event => event.waitUntil((async () => {
  for (const key of await caches.keys()) if (key.startsWith('crewsafety-') && key !== CACHE) await caches.delete(key);
  await self.clients.claim();
})()));
self.addEventListener('fetch', event => {
  // Never store chat, coach, telemetry, journal entries, or arbitrary requests.
  if (event.request.method !== 'GET' || !cacheableAsset(event.request.url, self.location.origin)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(event.request);
    return cached || fetch(event.request);
  })());
});
self.addEventListener('message', event => {
  if (!['status', 'prepare-model'].includes(event.data?.type) || !event.ports[0]) return;
  event.waitUntil((async () => {
    const port = event.ports[0];
    try {
      const cache = await caches.open(CACHE);
      if (event.data.type === 'prepare-model') {
        for (const url of MODEL_ASSETS) {
          if (await cache.match(url)) continue;
          const response = await fetch(url, { mode: 'cors', signal: AbortSignal.timeout(60000) });
          if (!response.ok) throw new Error('A model download failed. Reconnect and retry.');
          await cache.put(url, response);
        }
      }
      const shellReady = (await Promise.all(SHELL_ASSETS.map(url => cache.match(url)))).every(Boolean);
      const modelReady = (await Promise.all(MODEL_ASSETS.map(url => cache.match(url)))).every(Boolean);
      port.postMessage({ shellReady, modelReady });
    } catch { port.postMessage({ error: 'Offline preparation failed. Keep this page online and retry; storage may be full.' }); }
  })());
});
