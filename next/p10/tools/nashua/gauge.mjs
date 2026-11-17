// The time scroll's record: daily mean discharge of the Nashua River at East Pepperell, MA (USGS 01096500), the
// nearest gauge with a daily discharge series on the Nashua. 01096508 (in Nashua) is the Merrimack and has none.
// Fetches the whole record from the USGS water services and writes data/nashua/gauge/01096500.json: one integer per
// day from the first date (null where USGS has no value), with the source and the qualification codes counted.
//   node tools/nashua/gauge.mjs [--end=YYYY-MM-DD]
// USGS data are public domain. Provisional values (code P) are kept and counted.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SITE = '01096500';
const end = (process.argv.find(a => a.startsWith('--end=')) || '').slice(6) || new Date().toISOString().slice(0, 10);
const url = `https://waterservices.usgs.gov/nwis/dv/?format=rdb&sites=${SITE}&parameterCd=00060&statCd=00003&startDT=1935-10-01&endDT=${end}`;
const r = await fetch(url, { headers: { 'user-agent': 'shanshui-av-build' } });
if (!r.ok) throw new Error('USGS ' + r.status);
const rows = (await r.text()).split(/\r?\n/).filter(l => l.startsWith('USGS\t'));
const day = d => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / 86400000;
const first = rows[0].split('\t')[2], d0 = day(first);
const last = rows[rows.length - 1].split('\t')[2];
const q = new Array(day(last) - d0 + 1).fill(null), codes = {};
for (const l of rows) {
  const [, , d, v, c] = l.split('\t');
  if (v === '' || isNaN(+v)) continue;
  q[day(d) - d0] = Math.round(+v);
  codes[c] = (codes[c] || 0) + 1;
}
const vals = q.filter(v => v != null).sort((a, b) => a - b);
const median = vals[Math.floor(vals.length / 2)];
let maxI = 0; for (let i = 0; i < q.length; i++) if (q[i] != null && q[i] > q[maxI]) maxI = i;
const iso = i => new Date((d0 + i) * 86400000).toISOString().slice(0, 10);
const out = {
  site: SITE, name: 'Nashua River at East Pepperell, MA', param: 'discharge, daily mean', units: 'ft3/s',
  source: 'U.S. Geological Survey, National Water Information System, daily values', url: url.replace(/&endDT=.*/, ''),
  fetched: new Date().toISOString().slice(0, 10), start: first, end: last, days: q.length, missing: q.length - vals.length, codes,
  median, max: { date: iso(maxI), q: q[maxI] }, q,
};
const dir = path.join(ROOT, 'data', 'nashua', 'gauge');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, SITE + '.json'), JSON.stringify(out));
console.log(`${SITE}: ${first} to ${last}, ${vals.length} values, ${out.missing} missing, median ${median} ft3/s, max ${out.max.q} on ${out.max.date}, codes ${JSON.stringify(codes)}`);
