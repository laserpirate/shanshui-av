// LAN sync for a wall of outputs: a dependency-free WebSocket relay with a ping-based clock.
//   node tools/wall-server.mjs [--port 8097]        then pages connect with ?sync=ws://<this machine>:8097
// One controller (role=controller) sends frame states; every other client (role=output) receives them. Each client
// measures its clock offset to this server with pings (NTP style, best of the last 8 by round trip), so all nodes
// agree on "server time" and extrapolate the scroll position to the same instant.
// Messages are JSON text frames: {type:'hello', role, node} {type:'ping', t0} -> {type:'pong', t0, ts}
//   {type:'frame', ...} from the controller -> relayed to every output, stamped with ts (server ms)
// No dependencies, no auth (LAN only: it binds to the interface you give with --host, default all).
import http from 'node:http';
import crypto from 'node:crypto';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > -1 ? process.argv[i + 1] : d; };
const PORT = +arg('port', 8097), HOST = arg('host', '0.0.0.0');
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const clients = new Set();
let frames = 0;

function send(c, obj) {
  if (c.dead) return;
  const data = Buffer.from(JSON.stringify(obj));
  const n = data.length;
  const head = n < 126 ? Buffer.from([0x81, n]) : n < 65536 ? Buffer.from([0x81, 126, n >> 8, n & 255]) : (() => { const b = Buffer.alloc(10); b[0] = 0x81; b[1] = 127; b.writeBigUInt64BE(BigInt(n), 2); return b; })();
  c.sock.write(Buffer.concat([head, data]));
}
function close(c) { if (c.dead) return; c.dead = true; clients.delete(c); try { c.sock.end(Buffer.from([0x88, 0])); } catch {} log(); }
function log() { const r = [...clients].reduce((o, c) => (o[c.role || '?'] = (o[c.role || '?'] || 0) + 1, o), {}); console.log(new Date().toISOString().slice(11, 19), 'clients', JSON.stringify(r)); }

function onMessage(c, text) {
  let m; try { m = JSON.parse(text); } catch { return; }
  if (m.type === 'ping') return send(c, { type: 'pong', t0: m.t0, ts: Date.now() });
  if (m.type === 'hello') { c.role = m.role === 'controller' ? 'controller' : 'output'; c.node = m.node || ''; log(); return; }
  if (c.role === 'controller' && m.type) {
    m.ts = Date.now(); frames++;
    for (const o of clients) if (o !== c && o.role !== 'controller') send(o, m);
  }
}

// RFC 6455 framing, text and control frames, client frames are masked; fragmented messages are joined
function onData(c, chunk) {
  c.buf = c.buf ? Buffer.concat([c.buf, chunk]) : chunk;
  for (;;) {
    const b = c.buf; if (b.length < 2) return;
    const fin = b[0] & 0x80, op = b[0] & 0x0f, masked = b[1] & 0x80;
    let len = b[1] & 0x7f, off = 2;
    if (len === 126) { if (b.length < 4) return; len = b.readUInt16BE(2); off = 4; }
    else if (len === 127) { if (b.length < 10) return; len = Number(b.readBigUInt64BE(2)); off = 10; }
    if (len > 16 * 1024 * 1024) return close(c);
    const mlen = masked ? 4 : 0;
    if (b.length < off + mlen + len) return;
    const mask = masked ? b.subarray(off, off + 4) : null;
    const pay = Buffer.from(b.subarray(off + mlen, off + mlen + len));
    if (mask) for (let i = 0; i < pay.length; i++) pay[i] ^= mask[i & 3];
    c.buf = b.subarray(off + mlen + len);
    if (op === 0x8) return close(c);
    if (op === 0x9) { c.sock.write(Buffer.concat([Buffer.from([0x8a, pay.length]), pay])); continue; }   // ping -> pong
    if (op === 0x1 || op === 0x0) {
      c.parts = (c.parts || []).concat(pay);
      if (fin) { const text = Buffer.concat(c.parts).toString('utf8'); c.parts = []; onMessage(c, text); }
    }
  }
}

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
  res.end(JSON.stringify({ relay: 'shanshui-av wall', clients: clients.size, frames, now: Date.now() }));
});
server.on('upgrade', (req, sock) => {
  const key = req.headers['sec-websocket-key'];
  if (!key || (req.headers.upgrade || '').toLowerCase() !== 'websocket') { sock.destroy(); return; }
  const acc = crypto.createHash('sha1').update(key + GUID).digest('base64');
  sock.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${acc}\r\n\r\n`);
  sock.setNoDelay(true);
  const c = { sock, role: null, dead: false };
  clients.add(c);
  sock.on('data', d => { try { onData(c, d); } catch { close(c); } });
  sock.on('close', () => close(c));
  sock.on('error', () => close(c));
});
server.listen(PORT, HOST, () => console.log(`wall relay on ws://${HOST === '0.0.0.0' ? '<this machine>' : HOST}:${PORT}  (status: http://localhost:${PORT}/)`));
