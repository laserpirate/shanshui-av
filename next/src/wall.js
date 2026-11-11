// The wall: one output window renders one slice of a wide virtual canvas. Because every chunk is a pure function,
// nodes only need to agree on state and time.
//   ?wall=<cols>x<rows>&col=<c>&row=<r>      this node's place (0-based)
//   &bezel=<px>        gap between screens (the virtual canvas skips it)
//   &overlap=<px>      edge-blend overlap between projectors (both nodes draw it; each ramps it down)
//   &blend=l,r,t,b     per-edge overlap override in px (e.g. blend=0,120,0,0)
//   &gamma=2.2         display gamma for the blend ramp (the ramp is linear in light)
//   &ks=x0,y0,x1,y1,x2,y2,x3,y3   four-corner keystone: corner offsets in px (tl, tr, br, bl)
//   &cal=1             calibration card on start (key C toggles)
// Sync: BroadcastChannel (same machine), ?sync=ws://host:port (tools/wall-server.mjs on the LAN), or clock mode
// ?t0=<epoch ms>&speed=<px/s> (no network: position is a function of UTC time; correct clocks keep nodes aligned).
import { MODE_DEFAULT, MODES, LAYERS, layersOf } from './worlds/nashua/modes.js';
const q = new URLSearchParams(location.search);
const num = (k, d) => { const v = q.get(k); return v != null && v !== '' && isFinite(+v) ? +v : d; };

export function parseWall() {
  const m = /^(\d+)x(\d+)$/.exec(q.get('wall') || '');
  if (!m) return null;
  const cols = Math.max(1, +m[1]), rows = Math.max(1, +m[2]);
  const col = Math.max(0, Math.min(cols - 1, num('col', 0))), row = Math.max(0, Math.min(rows - 1, num('row', 0)));
  const ov = num('overlap', 0), bez = num('bezel', 0);
  const b = (q.get('blend') || '').split(',').map(Number);
  const blend = b.length === 4 && b.every(isFinite) ? { l: b[0], r: b[1], t: b[2], b: b[3] }
    : { l: col > 0 ? ov : 0, r: col < cols - 1 ? ov : 0, t: row > 0 ? ov : 0, b: row < rows - 1 ? ov : 0 };
  const ks = (q.get('ks') || '').split(',').map(Number);
  return { cols, rows, col, row, bezel: bez, overlap: ov, blend, gamma: num('gamma', 2.2), ks: ks.length === 8 && ks.every(isFinite) ? ks : null, cal: q.get('cal') === '1' };
}

// The node's view of the virtual canvas: W, H are this node's drawing size. Neighbouring nodes share `overlap` px and
// are `bezel` px apart, so node c starts at c * (W - overlap + bezel) on the virtual canvas.
export function wallView(wall, W, H) {
  const stepX = W - wall.overlap + wall.bezel, stepY = H - wall.overlap + wall.bezel;
  return { VW: stepX * (wall.cols - 1) + W, VH: stepY * (wall.rows - 1) + H, ox: wall.col * stepX, oy: wall.row * stepY };
}

// edge blend: a black overlay whose alpha makes the light fall linearly to 0 across the overlap (gamma-correct)
export function blendOverlay(root, wall) {
  root.replaceChildren();
  const ramp = (dir, px) => {
    if (!(px > 0)) return;
    const d = document.createElement('div');
    d.className = 'wall-blend';
    const stops = [];
    for (let i = 0; i <= 16; i++) { const t = i / 16, light = t, a = 1 - Math.pow(light, 1 / wall.gamma); stops.push(`rgba(0,0,0,${a.toFixed(4)}) ${(t * 100).toFixed(2)}%`); }
    const side = { l: 'left', r: 'right', t: 'top', b: 'bottom' }[dir], to = { l: 'right', r: 'left', t: 'bottom', b: 'top' }[dir];
    d.style.cssText = `position:absolute;${side}:0;${dir === 'l' || dir === 'r' ? 'top:0;bottom:0;width:' + px + 'px' : 'left:0;right:0;height:' + px + 'px'};background:linear-gradient(to ${to}, ${stops.join(', ')});pointer-events:none`;
    root.appendChild(d);
  };
  for (const k of ['l', 'r', 't', 'b']) ramp(k, wall.blend[k]);
}

// four-corner keystone: the homography taking the unit square to the quad, as a CSS matrix3d on the stage element
export function keystone(el, ks, W, H) {
  if (!ks) { el.style.transform = ''; return; }
  const P = [[ks[0], ks[1]], [W + ks[2], ks[3]], [W + ks[4], H + ks[5]], [ks[6], H + ks[7]]];
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = P;
  const dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3, dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;
  const den = dx1 * dy2 - dx2 * dy1;
  const g = (dx3 * dy2 - dx2 * dy3) / den, h = (dx1 * dy3 - dx3 * dy1) / den;
  const a = x1 - x0 + g * x1, b = x3 - x0 + h * x3, c = x0, d = y1 - y0 + g * y1, e = y3 - y0 + h * y3, f = y0;
  // unit square -> quad; the element is W x H, so scale its coordinates to the unit square first
  const m = [a / W, d / W, 0, g / W, b / H, e / H, 0, h / H, 0, 0, 1, 0, c, f, 0, 1];
  el.style.transformOrigin = '0 0';
  el.style.transform = `matrix3d(${m.map(v => +v.toFixed(9)).join(',')})`;
}

// calibration card: a grid every 100 px, the node id, the overlap bands, centre cross
export function drawCard(cv, wall, status = '') {
  const W = cv.clientWidth, H = cv.clientHeight;
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  g.fillStyle = '#07090e'; g.fillRect(0, 0, W, H);
  g.strokeStyle = '#3e466b'; g.lineWidth = 1;
  for (let x = 0; x <= W; x += 100) { g.beginPath(); g.moveTo(x + 0.5, 0); g.lineTo(x + 0.5, H); g.stroke(); }
  for (let y = 0; y <= H; y += 100) { g.beginPath(); g.moveTo(0, y + 0.5); g.lineTo(W, y + 0.5); g.stroke(); }
  g.fillStyle = 'rgba(159, 200, 240, 0.35)';
  const B = wall.blend;
  if (B.l) g.fillRect(0, 0, B.l, H); if (B.r) g.fillRect(W - B.r, 0, B.r, H); if (B.t) g.fillRect(0, 0, W, B.t); if (B.b) g.fillRect(0, H - B.b, W, B.b);
  g.strokeStyle = '#dddee4'; g.lineWidth = 2; g.strokeRect(1, 1, W - 2, H - 2);
  g.beginPath(); g.moveTo(W / 2 - 40, H / 2); g.lineTo(W / 2 + 40, H / 2); g.moveTo(W / 2, H / 2 - 40); g.lineTo(W / 2, H / 2 + 40); g.stroke();
  g.fillStyle = '#dddee4'; g.font = "500 48px 'IBM Plex Sans Condensed', sans-serif"; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(`col ${wall.col}  row ${wall.row}`, W / 2, H / 2 - 90);
  g.font = "500 24px 'IBM Plex Sans Condensed', sans-serif";
  g.fillText(`${wall.cols} x ${wall.rows}   ${W} x ${H} px   overlap ${wall.overlap} px   bezel ${wall.bezel} px`, W / 2, H / 2 + 80);
  if (status) g.fillText(status, W / 2, H / 2 + 120);
}

// LAN sync client: ws relay with a ping clock. onFrame(msg, serverNow) where serverNow() is this node's estimate
export function wsSync(url, role, onFrame, onState) {
  let ws = null, offset = 0, best = [], timer = 0, open = false;
  const serverNow = () => Date.now() + offset;
  const connect = () => {
    try { ws = new WebSocket(url); } catch (e) { onState && onState('bad url'); return; }
    ws.onopen = () => { open = true; onState && onState('connected'); ws.send(JSON.stringify({ type: 'hello', role, node: location.search })); ping(); };
    ws.onmessage = e => {
      let m; try { m = JSON.parse(e.data); } catch { return; }
      if (m.type === 'pong') {
        const t1 = Date.now(), rtt = t1 - m.t0;
        best.push({ rtt, off: m.ts - (m.t0 + t1) / 2 }); best = best.slice(-8);
        offset = best.reduce((a, b) => (b.rtt < a.rtt ? b : a)).off;
        return;
      }
      if (onFrame) onFrame(m, serverNow);
    };
    ws.onclose = () => { open = false; onState && onState('reconnecting'); clearTimeout(timer); timer = setTimeout(connect, 1000); };
    ws.onerror = () => {};
  };
  const ping = () => { if (open) ws.send(JSON.stringify({ type: 'ping', t0: Date.now() })); };
  setInterval(ping, 2000);
  connect();
  return { send: m => { if (open && ws.bufferedAmount < 1 << 20) ws.send(JSON.stringify(m)); }, serverNow, get offset() { return offset; }, get open() { return open; } };
}

// clock mode: the frame state from UTC time alone. world, seed, palette and speed from the URL; nashua ping-pongs
// over its reach (a triangle wave), the endless worlds scroll on.
export function clockState(viewW, reachW) {
  const t0 = num('t0', 0), speed = num('speed', 60), now = Date.now();
  const world = q.get('world') || 'shanshui', seed = q.get('seed') || '1', pal = q.get('palette') || (world === 'nashua' ? 'nashua-kit' : 'original');
  let d = (now - t0) / 1000 * speed, x, v = speed;
  if (world === 'nashua' && reachW) {
    const span = Math.max(1, reachW - viewW), p = ((d % (2 * span)) + 2 * span) % (2 * span);
    x = p < span ? p : 2 * span - p; v = p < span ? speed : -speed;
  } else x = d;
  // the data world at the P6 defaults (8 px per m, 2x) unless &hx= and &ve= say otherwise
  const opts = world === 'nashua' ? { bank: q.get('bank') === 'R' ? 'R' : 'L', hx: Math.max(2, Math.min(12, Math.round(num('hx', 8)))), ve: Math.max(1, Math.min(20, num('ve', 2))), ...(q.get('reach') === 'merrimack' ? { reach: 'merrimack' } : {}) } : undefined;
  // nashua draws the same mode layers as the controller would (default built), so baked tiles match
  const mode = MODES[q.get('mode')] ? q.get('mode') : MODE_DEFAULT;
  const layers = world === 'nashua' ? { layers: layersOf(mode, q.get('sections') === '1' || mode === 'sections'), all: LAYERS } : {};
  return {
    worlds: [{ key: 'clock:' + world + ':' + seed + (opts && opts.reach ? ':' + opts.reach : '') + (opts ? ':' + opts.hx + ':' + opts.ve : ''), seed, world, x, alpha: 1, opts, ...layers }],
    dir: v >= 0 ? 1 : -1, pal: { a: pal, b: pal, mix: 0 },
    u: { contrast: 1, ink: 1, paper: true, vignette: false, zoom: 1, yAlign: 0.5 },
    time: (now - t0) / 1000, weather: { rain: 0, wind: 0.2, water: num('water', 0), fog: num('fog', 0.25), light: num('light', 1) },
    level: num('level', 0), reach: { labels: false, facts: false }, v, t: now,
  };
}
