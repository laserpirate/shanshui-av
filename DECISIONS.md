# DECISIONS

One line per judgment call, newest at the bottom of each section.

## Preflight answers (2026-10-23)

- Repo `laserpirate/shanshui-av`, public, no password. Pages from `main` root.
- P cycle: Original, Dark, Grayscale, Gradient, the 5 Kodama styleguide families, the 4 Kodama Landforms modes. The 25 topo study palettes are in `palettes.json` as group "Studies", picked from a list. Palettes can be starred; show mode can make P cycle starred palettes only.
- Framing: the full landscape height fills the screen height (upstream's own vertical crop: 800 / 1.142 = 700.5 world px), plus a zoom slider. View zoom never enters the Arch D export frame math.
- Memory cap 20,000 world px (see Seeds and memory).
- Web MIDI is out of v0.1.0.
- 48 px buttons, 18 px labels by default; big-target mode goes larger.

## Render path (Phase 0 benchmark)

Scroll at 300 px/s for 10 s, same seed, Chromium 130 (Playwright 1.48.2) on Polaris, RTX 3080 through ANGLE D3D11.
"Throttled" is the same run with the page CPU slowed 4x (CDP), standing in for a weaker laptop. Raw rows: `test-results/bench*.json` (local, not committed); rerun with `node tools/bench.mjs`.

| Path | 1080p fps | 1080p p95 frame | 4K fps | 4K p95 frame | 1080p throttled 4x fps |
| --- | --- | --- | --- | --- | --- |
| (a) upstream: visible SVG rebuilt with innerHTML each frame | 8.8 | 166.6 ms | 8.9 | 150.0 ms | 1.9 |
| (b) one SVG strip, CSS transform | 59.8 | 16.7 ms | 59.5 | 16.7 ms | 35.4 |
| (c) chunks rastered to tiles in a worker, drawn with WebGL | 59.1 | 16.8 ms | 57.2 | 16.7 ms | 59.4 |

- Chosen: **(c)**. It is the only path that holds 60 fps with a slow CPU, because the main thread only draws textured quads. (b) is as fast on Polaris but every new strip segment and every palette change goes through the browser's SVG raster and style system on the main thread, and it falls to 35 fps throttled.
- Tile raster cost in the worker: median 10.9 ms (1080p), 12.1 ms (4K) per 512-world-px tile; no frame waited on a missing tile.
- Generation also moved off the main thread: the upstream engine runs in its own Web Worker (one per seed).
- Vector SVG stays available for export: the element strings are kept for every live chunk.
- Raster check (`tools/rastertest.html`): the worker rasterizer against Chrome's own SVG renderer, same elements, same order, 6 tiles x 3 seeds at 1080p scale. Mean difference 0.13 to 1.35 levels of 255; pixels off by more than 16 levels 0.09 to 1.2 %; off by more than 48 levels at most 0.011 % (anti-aliased edges). Passed before any palette work.

## Engine and seeds

- The upstream PRNG, seed hashing and every generator are unchanged. `upstream/index.html` is an untouched copy of LingDong-/shan-shui-inf@9f754d2; `tools/extract-engine.mjs` concatenates its first six script blocks into `src/engine/upstream-engine.js` without editing a line. The worker supplies `window` and a stub `document` instead of changing code.
- Git normalizes line endings of `upstream/index.html` to LF (`.gitattributes`); content is otherwise byte-identical to the clone.
- The PRNG is one global sequence, so a landscape depends on the order chunks are generated. The worker replays the original page's order: `Math.seed(seed)`, `chunkloader(0, 3000)` (the load-time update), then the 257 x 257 paper texture loop (it draws from the same PRNG), then one chunk at a time as the view moves. Any seed matches the original site for forward (rightward) travel.
- Seeds are strings, exactly as upstream reads them from the raw URL (no percent-decoding), so `?seed=` links work in both directions. Random seeds are millisecond timestamps, like upstream's default.

## Seeds and memory

- Elements more than 20,000 world px behind the view are dropped (worker and main thread), with the planner memory for that range. Only forward travel matches upstream. Travel back past the cap draws new landscape (upstream's own leftward chunk loader, from the cull line).
- Starred seeds, history entries and Stop beyond the cap restart the seed from x = 0 in a fresh worker, so they always reproduce the original landscape.
