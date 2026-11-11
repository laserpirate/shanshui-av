// Offline for show machines. Registered only when a page is opened with ?offline=1 (the launchers do); once
// registered it keeps serving after a reboot without network.
// Network first with a short timeout, the cache as fallback, so an online machine always runs the current build.
// Same-origin GET only; never caches byte ranges (video), media/ or data/local/ (both local-only and gitignored).
// precache.json (written by tools/bake.mjs) lists everything a show needs, so worlds not yet visited work offline too.
const CACHE = 'ssav-v1';
const SKIP = /\/(media|data\/local)\//;

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    try {
      const r = await fetch('precache.json', { cache: 'no-store' });
      if (r.ok) { const list = await r.json(); for (const u of list.files || []) { try { await c.add(new Request(u, { cache: 'reload' })); } catch {} } }
    } catch {}
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', e => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
  await self.clients.claim();
})()));

self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== location.origin || r.headers.has('range') || SKIP.test(u.pathname)) return;
  e.respondWith((async () => {
    const c = await caches.open(CACHE);
    // the ?v= stamp and the page's own query do not change the file
    const key = u.origin + u.pathname;
    try {
      const net = await Promise.race([fetch(r), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 4000))]);
      if (net.ok && net.status === 200) c.put(key, net.clone());
      return net;
    } catch (err) {
      const hit = await c.match(key);
      if (hit) return hit;
      throw err;
    }
  })());
});
