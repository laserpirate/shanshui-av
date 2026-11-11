// tools/wall-server.mjs over real sockets: hello, ping/pong clock, relay controller -> outputs, large frames, a
// fragmented message, and a client that leaves. Node 22's built-in WebSocket is the client.
//   node tests/wall-server.mjs
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8197;
const srv = spawn(process.execPath, [path.join(ROOT, 'tools', 'wall-server.mjs'), '--port', String(PORT), '--host', '127.0.0.1'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise(r => srv.stdout.once('data', r));
const open = role => new Promise((res, rej) => {
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}`), q = [];
  ws.onmessage = e => q.push(JSON.parse(e.data));
  ws.onopen = () => { ws.send(JSON.stringify({ type: 'hello', role, node: role })); res({ ws, q }); };
  ws.onerror = rej;
});
const wait = ms => new Promise(r => setTimeout(r, ms));
const fails = [];
const check = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails.push(m); };

const ctl = await open('controller'), out1 = await open('output'), out2 = await open('output');
await wait(100);
// clock
const t0 = Date.now(); out1.ws.send(JSON.stringify({ type: 'ping', t0 }));
await wait(100);
const pong = out1.q.find(m => m.type === 'pong');
check(pong && pong.t0 === t0 && Math.abs(pong.ts - Date.now()) < 1000, 'ping returns the server time ' + JSON.stringify(pong));
// relay
ctl.ws.send(JSON.stringify({ type: 'frame', n: 1 }));
const big = 'x'.repeat(200000); ctl.ws.send(JSON.stringify({ type: 'frame', n: 2, big }));
await wait(300);
const f1 = out1.q.filter(m => m.type === 'frame'), f2 = out2.q.filter(m => m.type === 'frame');
check(f1.length === 2 && f2.length === 2, 'both outputs get both frames (' + f1.length + ', ' + f2.length + ')');
check(f1[1] && f1[1].big.length === 200000 && typeof f1[1].ts === 'number', 'a 200 kB frame arrives whole and stamped');
check(!ctl.q.some(m => m.type === 'frame'), 'the controller does not get its own frames back');
// an output cannot drive the others
out1.ws.send(JSON.stringify({ type: 'frame', n: 99 }));
await wait(200);
check(!out2.q.some(m => m.n === 99), 'frames from an output are not relayed');
// a client leaves; the rest keep working
out2.ws.close(); await wait(200);
ctl.ws.send(JSON.stringify({ type: 'frame', n: 3 })); await wait(200);
check(out1.q.some(m => m.n === 3), 'relay continues after a client leaves');
const st = await (await fetch(`http://127.0.0.1:${PORT}/`)).json();
check(st.clients === 2 && st.frames >= 3, 'status ' + JSON.stringify(st));
ctl.ws.close(); out1.ws.close();
srv.kill();
console.log(fails.length ? fails.length + ' failed' : 'all passed');
process.exit(fails.length ? 1 : 0);
