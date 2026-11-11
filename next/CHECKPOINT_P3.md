# CHECKPOINT P3 · the wall · 2026-11-11

Live preview: **https://laserpirate.github.io/shanshui-av/next/** (a wall node: `/next/output.html?wall=3x1&col=0&row=0&cal=1`)
Tag: `shanshui-av-v0.4.0-nashua.p3` on `feat/nashua` (the commit that adds this file; code as at 4a4bb62, plus the `serve.mjs --host` change and the WALL.md note below). Root of the site: byte-identical to `main` 1f009a1 (checked live, 134 of 134 files).

## What works
- **Layout by URL**: `output.html?wall=<cols>x<rows>&col=&row=` draws one slice of one wide virtual canvas. Also `bezel=`, `overlap=`, per-edge `blend=l,r,t,b`, `gamma=`, a four-corner keystone `ks=`, and a calibration card (`cal=1`, key C) showing the grid, node id, overlap bands, and a live line with sync state, clock offset, drift and fps.
- **Sync three ways, one message shape**:
  - same machine over BroadcastChannel;
  - LAN through `tools/wall-server.mjs` (no dependencies, ping clock, best of 8);
  - clock mode from `&t0=` with no network.
- **Relay loss**: an output that loses the relay (socket closed, or 2 s without a frame) runs on from the last frame at its speed, turning at the nashua reach ends. If it also has `&t0=` it switches to clock mode. It reconnects every second, and frames take over when the relay is back.
- **Blackout and panic**: reach every node while it is connected.
- WALL.md: the room checklist, the three ways, examples, what is proven here and what is not.

## Measured (one machine, RTX 3080, headed Chromium)
| check | target | result |
| --- | --- | --- |
| 3 x 1 seam against one canvas as wide as the wall | columns either side match | mean difference **0** at both seams (an unrelated band differs by 23.65) |
| overlap band, two nodes, blend off | same picture | 0 (BroadcastChannel), 0.14 (clock mode) |
| drift over 10 min, 3 x 1 through the relay | under 1 frame | worst **0.55 px = 0.42 frame** at 77.8 world px/s, mean 0.07 px, 351 samples, clock offsets 0 to 1 ms |
| relay killed mid-run, then restarted | runs on, rejoins | before 0.02 px, without the relay -0.01 px at 77.8 px/s (the controller's speed), after **-0.19 px**, connected again |
| keystone corners | within 0.5 px | 0.024 px |
| blend light across the band (gamma 2.2) | sums to 1 | worst error 0.0054 (8-bit gradient alpha) |
| relay itself over real sockets | | 7/7 |
| wall tests on /next/ (BroadcastChannel, clock mode, relay on this machine, 3 x 1 seam, blend and card) | pass | **5/5** |
| soak 30 min, heaviest weather, slit-scan modes cycling, output 1920x1080 | fps min ≥ 50, flat heap | fps min **59.2** (output 59.7), heap -0.05 MB, 0 dips, 0 console problems; the tool's DOM rule flags +73 nodes, the same bounded lists as P1 and P2 |
| e2e on /next/ | 24/24 | **24/24**, 0 console problems |
| live crawl /next/ | 0 broken | **0 broken**, 0 console errors (5 pages, 56 requests, 31 linked files) |

## Found on the way
- **A page from GitHub Pages cannot drive a LAN relay.** It is https, and the browser blocks plain `ws://` to any address but the machine itself. The relay test passes from /next/ only because it runs on 127.0.0.1. For a LAN wall, serve the app over http on the show network. `tools/serve.mjs` now takes `--host 0.0.0.0`; it listened on localhost only before, so a LAN wall could not have loaded at all. It also no longer serves `*.local.json` and checks the folder boundary properly. Clock mode works from Pages on any number of machines.
- A test of mine set the speed in screen px/s and compared it with world px/s (×0.648). The node was right and the test was wrong; the test now reads the controller's real speed.

## Not verified on real hardware
- Several machines, real projectors, clocks drifting apart over hours, a real network. Everything above is one machine with windows in place of screens.
- To check on the night (WALL.md, end):
  1. Open the calibration card on every node.
  2. Check that the drift line stays under one frame.
  3. Pull the relay machine's network cable for 10 s and watch the nodes run on and rejoin.

## Open questions (default taken)
1. **TLS for the relay** (`wss://`) would let a Pages-served wall use it. Default: no; serve locally on the show network, which also works offline.
2. The P1 and P2 questions stand.
