// Day cycle tied to the time scroll (P5.2, ?daycycle=1). The gauge record is daily means, so the hour is not data:
// the fractional part of the scroll's day t is read as local standard time (EST, UTC-5, no daylight saving) and the
// sun's elevation at the reach gives the light. Civil twilight (-6 deg) is night, +8 deg is full day.
// Above 0.1 day/s the hour is held, so the light never strobes; the fact line says which.
export const SITE = { lat: 42.765, lon: -71.468 };   // the reach, Jackson Mills dam to the confluence
export const FAST = 0.1;                            // day/s above which the hour holds
const RAD = Math.PI / 180;

// day of year (1..366) of a unix day number
export function doyOf(unixDay) { const d = new Date(Math.floor(unixDay) * 86400000); return Math.floor((d - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86400000) + 1; }

// solar elevation in degrees at local standard hour h (0..24) on day of year N (NOAA's low-precision formulas)
export function sunElev(N, h, site = SITE) {
  const g = 2 * Math.PI / 365 * (N - 1 + (h - 12) / 24);
  const eot = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const dec = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  // true solar time in minutes: standard time + 4 min per degree east of the zone meridian (75 W) + equation of time
  const tst = h * 60 + eot + 4 * (site.lon + 75);
  const ha = (tst / 4 - 180) * RAD, la = site.lat * RAD;
  return Math.asin(Math.sin(la) * Math.sin(dec) + Math.cos(la) * Math.cos(dec) * Math.cos(ha)) / RAD;
}
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export const lightOfElev = e => 0.02 + 0.98 * smooth(-6, 8, e);
export const hhmm = h => { const m = Math.round(((h % 24) + 24) % 24 * 60) % 1440; return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };
