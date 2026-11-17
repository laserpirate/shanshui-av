// Projector test card: grid, edge marks, grey ramp, centre circle, resolution. Drawn at device px.
export function drawTestCard(c) {
  const W = Math.round(c.clientWidth * (window.devicePixelRatio || 1)), H = Math.round(c.clientHeight * (window.devicePixelRatio || 1));
  c.width = W; c.height = H;
  const x = c.getContext('2d');
  x.fillStyle = '#000'; x.fillRect(0, 0, W, H);
  // grid: 16 x 9 cells, every 4th line brighter
  for (let i = 0; i <= 16; i++) { const px = Math.round(i * (W - 1) / 16) + 0.5; x.strokeStyle = i % 4 ? '#3a3a3a' : '#9a9a9a'; x.lineWidth = 1; x.beginPath(); x.moveTo(px, 0); x.lineTo(px, H); x.stroke(); }
  for (let j = 0; j <= 9; j++) { const py = Math.round(j * (H - 1) / 9) + 0.5; x.strokeStyle = j % 3 ? '#3a3a3a' : '#9a9a9a'; x.beginPath(); x.moveTo(0, py); x.lineTo(W, py); x.stroke(); }
  // outermost pixel border, then edge arrows
  x.strokeStyle = '#fff'; x.lineWidth = 1; x.strokeRect(0.5, 0.5, W - 1, H - 1);
  x.fillStyle = '#fff';
  const a = Math.max(16, Math.round(H / 30));
  const tri = (p) => { x.beginPath(); x.moveTo(p[0], p[1]); x.lineTo(p[2], p[3]); x.lineTo(p[4], p[5]); x.closePath(); x.fill(); };
  tri([W / 2, 1, W / 2 - a, a + 1, W / 2 + a, a + 1]);
  tri([W / 2, H - 1, W / 2 - a, H - a - 1, W / 2 + a, H - a - 1]);
  tri([1, H / 2, a + 1, H / 2 - a, a + 1, H / 2 + a]);
  tri([W - 1, H / 2, W - a - 1, H / 2 - a, W - a - 1, H / 2 + a]);
  // corner ticks
  for (const [cx, cy, dx, dy] of [[0, 0, 1, 1], [W, 0, -1, 1], [0, H, 1, -1], [W, H, -1, -1]]) { x.fillRect(cx + (dx < 0 ? -3 * a : 0), cy + (dy < 0 ? -4 : 0), 3 * a, 4); x.fillRect(cx + (dx < 0 ? -4 : 0), cy + (dy < 0 ? -3 * a : 0), 4, 3 * a); }
  // centre circle and cross
  const r = Math.min(W, H) * 0.38;
  x.strokeStyle = '#fff'; x.lineWidth = 2;
  x.beginPath(); x.arc(W / 2, H / 2, r, 0, Math.PI * 2); x.stroke();
  x.beginPath(); x.moveTo(W / 2 - a, H / 2); x.lineTo(W / 2 + a, H / 2); x.moveTo(W / 2, H / 2 - a); x.lineTo(W / 2, H / 2 + a); x.stroke();
  // grey ramp, 11 steps 0 to 100 %
  const rw = W * 0.6, rh = Math.round(H / 12), rx = (W - rw) / 2, ry = H * 0.66;
  for (let i = 0; i <= 10; i++) { const v = Math.round(i * 25.5); x.fillStyle = `rgb(${v},${v},${v})`; x.fillRect(rx + i * rw / 11, ry, rw / 11 + 1, rh); }
  x.strokeStyle = '#777'; x.lineWidth = 1; x.strokeRect(rx - 0.5, ry - 0.5, rw + 1, rh + 1);
  // label
  x.fillStyle = '#fff'; x.font = `600 ${Math.round(H / 24)}px 'Plex Cond', sans-serif`; x.textAlign = 'center';
  x.fillText(`${W} x ${H}`, W / 2, H * 0.3);
}
