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

## Rendering

- One fragment shader colours every tile: ink amount = 1 - grey, then ink weight (multiply) and contrast (linear around 0.3, bare paper stays bare), then a 256 x 64 palette table (x = ink, y = drift position). Two tables are bound at once for palette crossfades (1.2 s). Palette changes never touch tiles or elements; the e2e test checks element order and tile keys are identical across palettes.
- The handoff asked for a CSS-filter path for live slider drags. Not needed: contrast, ink weight, paper and vignette are shader uniforms, so a drag costs nothing extra per frame. No CSS filter is used.
- Original = grey ramp times the upstream paper texture (RGB multiply), which is exactly upstream's `mix-blend-mode: multiply` over its texture. Other palettes use the texture as grain (luminance only).
- The paper texture is upstream's own, per seed (the worker paints it with the same PRNG draws), tiled every 448 world px (512 screen px at upstream scale), moving with the landscape.
- Non-raw palettes read ink through `inkRange` 0.75 (`palettes.json`), because upstream's darkest composited ink rarely passes 75 %; Original and Grayscale use the raw value.
- Tiles are 512 world px wide (one upstream chunk), uploaded as single channel R8 textures: 3.4 MB each at 4K. A tile is drawn once the generator is 2000 world px past its right edge; an element that lands later on a drawn tile marks it for redraw (extents come back from the raster worker).
- v0.2.0: no GPU readback on the frame path. The first 30 min soak (v0.1.0) averaged 58.6 fps but dipped to 37.5 (1 s average) about 1 s after each reseed, in both windows at once. Profiling found frame gaps with no main-thread long tasks: GPU stalls. Three causes, three fixes: (1) uploading an RGBA ImageBitmap from the worker's accelerated canvas into an R8 texture forced a readback and conversion, so the raster worker now draws on a CPU canvas (`willReadFrequently`) and sends one grey byte per pixel; reading back an accelerated canvas in the worker instead was worse, because it stalls the shared GPU process; (2) the watchdog's 160 x 90 `readPixels` and (3) the panic still's `drawImage` of the WebGL canvas were synchronous, so both now render to a small target and read back through a pixel pack buffer and a fence, picked up on a later frame. Result at 1500 px/s, 1920 x 1080, 4 reseeds: frame gaps over 25 ms 34 -> 0. Raster check after the change: mean difference 0.19 to 1.02 levels; 300 dpi Arch D PNG still about 8 s.
- DPR is capped at 1. Quality Auto starts at full resolution and steps to 0.75, then 0.5 after 5 s under 45 fps (per session). While an output window is connected the controller preview draws at half resolution.
- Reseed: the new world generates and rasters behind the old one; the crossfade (default 2.5 s, Show panel) starts when the new world covers the view, or after 4 s.
- Speed is px/s on a 1080 px tall screen at zoom 1 (world speed = speed x 700.5 / 1080), so the look is the same on any output size. Slider range 0 to 2000 px/s, square-root scale. `-` and `=` step by 1.25x.
- Play and pause ease over about 0.6 s (exponential); Stop is a cosine ease back to x = 0 (0.8 to 3 s by distance).

## Soak (30 min, 1500 px/s, output 1920 x 1080, reseed every 2 min, palette every 1 min, RTX 3080, headless)

| Build | fps avg | fps min (1 s) | dips under 50 | heap first to last third | reloads | console |
| --- | --- | --- | --- | --- | --- | --- |
| v0.1.0 | 58.6 | 37.5 | not logged | -11.4 MB | 0 | 0 |
| v0.2.0 | 60.0 | 59.1 | 0 | -3.6 MB | 0 | 0 |

- Heap swings 67 to 126 MB per process with the 20,000 px window and reseeds, no trend. DOM grows only with the seed history list (capped at 20). Raw rows: `test-results/soak30-run*.json` (local).

## Show

- Esc held 1 s = panic: shows the last good frame (a 960 x 540 copy taken every 2 s while the watchdog sees a non-blank frame), pauses playback and freezes the timers. Esc tap or Space leaves panic.
- In full screen the app asks Chrome's Keyboard Lock for Esc, so the panic key works there; Chrome then needs Esc held 2 s to leave full screen.
- Blackout is a DOM overlay with a 1 s fade, handled first in the key handler and independent of WebGL, so it works while rendering throws (tested). It is not persisted: reloads start visible and paused.
- Hold (G) freezes the auto reseed and auto palette countdowns; play and pause stay separate.
- Auto reseed by distance counts reference px (same unit as speed) in thousands.
- Starred seeds in show mode play in star order, each from x = 0.
- Watchdog: a 160 x 90 copy of the frame each second; flat (under 4 levels of range) for 3 s while tiles exist = redraw all tiles; 15 s = the output window reloads itself (the controller keeps state). Blackout and panic pause the check.
- Output window keys: F and double-click for full screen; B, Space, R, p, P, G, T, Home, [ and ] are sent to the controller; Esc held 1 s there also triggers panic. The output never writes storage (tested).
- The output extrapolates the controller's position for up to 1 s between messages, then holds.
- v0.2.0: the output window opens with `noopener`. With an opener Chrome keeps both windows in one renderer process on one main thread, so controller work could stall the projector. Everything already went over BroadcastChannel, so nothing else changed. Side effects: `O` while an output is connected only says so (a noopener window cannot be focused from the controller), and a blocked popup is detected by the missing heartbeat after 4 s.
- Web MIDI: not in v0.1.0 (preflight answer). v0.2.0 adds opt-in learn (Show panel): nothing calls `requestMIDIAccess` until Enable is pressed, so the browser never prompts on load. Targets: speed (CC, absolute, same square-root curve as the slider), play, reseed, palette + and -, blackout (note-on, or a CC crossing the middle upward). Bindings persist per instance. While blacked out, only the blackout binding acts. Tested with a fake input in e2e; not tested with a real controller.

## Export

- Scope added mid-run (chat message, 2026-10-23; the handoff file on disk still had the old two-line Export section when read): SVG, PNG and PDF, current view or Arch D 36 x 24 in (portrait toggle), frame overlay, margin 0.5 in default, border and label toggles off by default, PNG 150 or 300 dpi.
- Arch D frame math uses only the page, margin, Fit and Vertical: pt per world px = print height x 72 / 700.5 x Fit. View zoom is not an input (tested). Fit above 1 crops the height, below 1 shows more scroll with ground colour above and below. Never stretched: one scale for both axes.
- The frame is placed on the scroll in world px (drag it, or Frame to view). Exporting a frame ahead of the view generates up to it first; a frame behind the memory cap is refused with a message.
- SVG and PDF: upstream element strings with each fill and stroke mapped through the palette (grey level -> palette colour at that element's x and the current drift time, alpha times ink weight; opaque paper-coloured occluders stay opaque). Exact for two-stop palettes; multi-stop palettes are an approximation of the screen, because the screen maps the composited grey. PNG uses the screen pipeline (worker raster + the same shader), so PNG matches the screen.
- Vector exports use a flat ground colour; for Original that is the average of the seed's paper texture. No vignette in exports.
- PDF: jsPDF 4.2.1 + svg2pdf.js 2.8.1, vendored in `vendor/`, loaded only when PDF is pressed. Page size in pt from the SVG (2592 x 1728 for Arch D landscape).
- Units: Arch D SVG has width/height in inches and a viewBox in points. View exports are in screen px (PNG at 2x, PDF at 0.75 pt per px).
- PNG pages are rastered in blocks of at most 4096 px and assembled; pages over 16384 px a side or 180 Mpx would be written as several tile files (Arch D at 300 dpi, 10800 x 7200, is one file).
- File names: `shanshui_<seed>_<palette>_<x>.<ext>` for the view; Arch D adds `_archD-landscape` or `_archD-portrait` before the extension. `<x>` is the frame's left edge in world px.
- Label (off by default): seed, palette, date, credit line, 9 pt, right-aligned in the bottom margin.

## UI

- Font IBM Plex Sans Condensed 400/500/600 (OFL), vendored woff2. Colours after the Kodama Landforms control bar: ground #07090e, border #4d4d4f, accent #c4daf1; warn Kodama coral #E8845A. On states are filled (inverted), so they read without hue.
- 48 px buttons and 18 px labels; Big targets: 64 px and 23 px, brighter borders.
- Key map in `src/ui/keys.js`, one table, duplicate-checked by the e2e suite. Case matters: s stars the seed, S (Shift) stars the palette; p next palette, P previous.
- The panels sit above the bar on the right; one open at a time.
