// Per-instance settings in localStorage (?i=<name>). Every access is wrapped: private windows,
// blocked storage and previews must still run, just without memory. The output window never writes.
const Q = new URLSearchParams(location.search);
export const INSTANCE = (Q.get('i') || 'main').replace(/[^\w-]/g, '').slice(0, 32) || 'main';
const KEY = 'shanshui-av:' + INSTANCE;

export function load() {
  try { const s = localStorage.getItem(KEY); return s ? JSON.parse(s) : {}; } catch (e) { return {}; }
}
let timer = 0, pending = null;
export function save(obj) {
  pending = obj;
  if (timer) return;
  timer = setTimeout(() => {
    timer = 0;
    try { localStorage.setItem(KEY, JSON.stringify(pending)); } catch (e) { /* storage unavailable */ }
  }, 250);
}
export function saveNow(obj) {
  clearTimeout(timer); timer = 0;
  try { localStorage.setItem(KEY, JSON.stringify(obj)); } catch (e) { /* storage unavailable */ }
}
