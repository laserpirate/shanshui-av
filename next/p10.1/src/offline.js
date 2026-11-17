// ?offline=1 registers sw.js (network first, cache fallback) so a show machine keeps working without network.
// Without it nothing is registered; an already registered worker keeps serving (see sw.js).
export function offline() {
  if (!('serviceWorker' in navigator) || new URLSearchParams(location.search).get('offline') !== '1') return Promise.resolve(null);
  return navigator.serviceWorker.register(new URL('../sw.js', import.meta.url), { scope: new URL('../', import.meta.url).pathname }).catch(() => null);
}
