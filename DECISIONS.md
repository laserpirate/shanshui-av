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
| v0.3.0 derelict, heaviest weather, world switch every 5 min | 59.9 | 57.0 (output 57.2) | 0 | -3.75 MB | 0 | 0 |

- v0.3.0 run: `node tools/soak.mjs 30 --world=derelict --heavy --worldevery=5 --fpsmin=50`. 13 seeds, 24 palettes, 6 world switches (so the run alternates 5 min derelict, 5 min shanshui, starting on derelict); heaviest weather held throughout (it only shows on derelict). Max 1,013 chunks and 16 tiles in memory, no watchdog events. Raw rows: `test-results/soak-derelict.json` (local).
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

## Worlds (v0.3.0)

- A world is a generator behind the same worker messages: `init` -> chunks, `right` / `left` (generate up to x), `cull` -> removed ids. World (`src/core/world.js`), the raster worker, the renderer and export treat every world alike. The registry is `src/worlds/registry.js`.
- Interface, per world module (`src/worlds/<name>/index.js`):
  - `meta`: name, height (700.5 world px for both, so framing and Arch D math are shared), chunk width (512), layers back to front, a line on how seeds work;
  - `init(seed)` -> state;
  - `generate(state, chunk)` -> that chunk's elements `[{id, layer, depth, x, canv}]`, back to front. The handoff wrote `generate(chunkIndex)`; the state argument keeps the module free of globals.
- `src/worlds/shanshui/` wraps the existing engine and says why its `generate` is not random access: upstream draws every chunk from one global PRNG in travel order, so the worker advances to a chunk. Nothing in the shanshui path changed.
- Registry fields: `kind` (shader branch: 0 ink only, 1 ink + lights + weather), `worker`, `module`, `chunked` (every chunk is a pure function of seed and chunk), `cull` (px kept behind the view: shanshui 20,000, derelict 12,000), `weather`.
- Adding a third world: a module with the interface, a worker that answers the same messages (copy `derelict-worker.js`), a registry entry, a button in `#b-world`. Kind 1 gets lights and weather if the elements carry `data-l` lights and a depth.
- Shanshui loads first; `?world=derelict` selects; W or the World buttons switch with the reseed crossfade. The seed carries over. History and stars store `derelict:<seed>` for derelict and the bare seed for shanshui, so v0.2.0 lists still load.
- Shanshui output is pixel-identical to v0.2.0: the e2e test serves the `shanshui-av-v0.2.0` tag from a worktree and compares 1280 x 720 frames (5 seed, palette, x cases): 0 bytes differ.

## Derelict world

- Vocabulary from Kodama topos 17 to 24 (table below); Rain World only for atmosphere (layered rust, rain, a ruin that keeps a few lights on). No assets, characters, symbols or names from either. Runway numbers and the airliner livery are invented (a 7-segment glyph, two stripes).
- Seeds: `mulberry32(hash(seed, chunk, stream))` per chunk and layer; the planner reads only seeded hashes and value noise at the chunk and its neighbours. A chunk never depends on generation order: 100 of 100 chunks identical generated in reverse (Node), and the e2e test drives 50,000 px out (the start is culled) and back, comparing tile hashes from the raster worker.
- Five depth layers: far (megastructures, two rows of towers, arcologies, cranes, seawall), mid-far (terminal halls, hangars, tank farms, container cranes, low roofs, radar, pylons), mid (control tower, airliner, parking structure, jet bridges, monorail), ground (runway with invented threshold numbers, taxiway, fence, carts, pipes, mangrove, stilt houses, nets, longtails, rubble), near (cables, chains, vines, girders, lamp posts, reeds).
- Planner: a smooth density field; quiet stretches (open flooded runway and haze) where density < 0.22; dense passages in runs of 7 chunks (terminal, tanks, kampung, hangars, port); landmarks in slots with minimum spacing (tower at most once per 23 chunks, airliner 13, parking 17, radar 9); a higher landmark wins within one chunk.
- Composition pass (busy share): a chunk counts as busy when its ink coverage in a greyscale strip is 0.045 or more (about the old median). Over 80 chunks x 5 seeds the first build was 25 to 42 % busy (mean 37 %). Following the rule, far first, then mid-far: megastructures only over dense passages and scaled by density, far tower rows scaled harder by density (quiet stretches keep an open sky), mid-far passage pieces may drop out below density 0.67 so passages fade in and out. Now 15 to 36 % (mean 28 %). Control tower and airliner were checked at 1080p and read at a glance; not changed.
- Element id = chunk x 8 + layer + 1. Paint order is depth first, then chunk, so a near cable from one chunk never hides under a far tower of the next.

| Topo | Taken |
| --- | --- |
| 17 Ayutthaya | Flood plane, scaffold fused to ruin, hanging vines, lanterns, a flickering neon glyph, warm windows, a distant spire city; its day to night cycle as the model for the weather keyframes. |
| 18 neo-Bangkok | Longtail and wake, window flicker, reflection column on the water, ripple and current lines; its dry, monsoon, flood, night keyframes. |
| 19 Nusantara | Drowned planned city, the rain layer, pale stone and tower grey. |
| 20 Singapore | Seawall and barrier line with breaches, a cool glass ramp with a mint accent. |
| 21 Jakarta | Pulsing canal water, tower windows with blinking red beacons, kampung low districts, seawall, rain; cycle values for rain, water, veil and windows. |
| 22 Manila | Rain, ripples, reflections, typhoon wind (the slant of the rain), stilt houses, nets, small boats. |
| 23 Kuala Lumpur | Steel and tower ramp, a teal edge light along the water, channel lines. |
| 24 neo-Saigon | Drowned-ward towers with breathing windows, shimmer on the flood surface. |

- Each topo's `PAL` (exact hex) is one palette of the Megacity arc group, `arc-17` to `arc-24`: scene background as ground, ink ramp dark to light, window colour as the light accent, a second accent for beacons.

## Lights, aux tile and weather

- Two-channel tiles: the grey R8 ink tile as before, plus (derelict only) an RGBA8 aux tile at half resolution: R depth layer x 50, G light glow (additive radial gradients, drawn on a CPU canvas in the raster worker), B light kind x 32 + phase. Kinds: steady, breathe, blink, flicker, chase, beacon. The shader animates them from the code, so a blinking runway never re-rasters a tile.
- Lights live in the element strings as `circle` and `polyline` elements with a `data-l` attribute (kind, phase, intensity), so export sees them too.
- Light colour: the palette's `light` (beacons: `beacon`); palettes without one use their brightest stop, so all 49 palettes work on derelict (e2e: none blank).
- Night: colour x mix(0.42, 1, day) plus glow x mix(1.8, 0.22, day), plus a hot core above glow 0.25 so a small window light still reads at 720p.
- Fog per depth layer (far 0.8 to near 0.02 of the fog value) plus a horizon haze band. Rain is a separate full-screen pass, three depths of streaks slanted by wind, coloured from the palette at mid ink. Both in the shader; no tile re-rasters for weather.
- Water: a flood plane at world y = 700 - level x 190, covering far, mid-far, mid and ground (preflight answer 4); the near layer and the rain stay in front. Below the line the shader mirrors ink and lights about the water line with ripples. The water test uses the filtered depth, so the edge against near pieces is smooth. Water level is a visual control only: no years or figures anywhere.
- Weather cycle: dry, drizzle, downpour, flood, night, one keyframe per fifth, held through the middle of each span and smoothstepped across the rest. Auto runs a 6 min loop (minimum 10 s); a phase can be pinned (eases there); MIDI CC 4 scrubs the position. Rain, wind, water, fog and light each have a slider: grabbing it holds that value, Follow releases it. Shown values ease over about 1/3 s.
- Exports split into blocks (300 dpi Arch D PNG is 2 blocks tall) lose a reflection whose source sits in the other block. Accepted: a 150 dpi PNG is one block.

## Performance (v0.3.0)

`node tools/bench-app.mjs`: the real app scrolling at 600 px/s for 12 s, seed 2026, RTX 3080 through ANGLE D3D11, headless. Derelict at the heaviest weather (downpour rain and wind, full flood, night, fog 0.8, held). Raw rows: `test-results/bench-app.json` (local).

| World | 1080p fps | 1080p p95 | 4K fps | 4K p95 | 1080p CPU 4x fps | frames over 25 ms (CPU 4x) |
| --- | --- | --- | --- | --- | --- | --- |
| shanshui | 60.0 | 16.7 ms | 60.0 | 16.7 ms | 59.6 | 6 |
| derelict, heaviest | 60.0 | 16.7 ms | 60.0 | 16.7 ms | 60.0 | 0 |

- Derelict chunk generation: 100 chunks in 184 ms in Node (about 2 ms a chunk, in the worker); a 1080p tile with its aux tile rasters in 6 to 7 ms.

## Export (derelict)

- SVG and PDF: night darkens mapped colours by the same factor as the screen; fog is a group opacity per depth layer; the flood is a flat water plane with a shore line, inserted before the near layer (no reflections in vector). Lights on (default): accent circles (radius x 1.3) and neon strokes in the light and beacon colours. Rain off by default ("rain in export"); on, it is a seeded path of streaks slanted by the wind.
- PNG uses the screen pipeline: glow and reflections as on screen; rain only with the toggle, laid out on the whole page so blocks join.
- File names start with the world: `derelict_<seed>_<palette>_<x>...`; shanshui names are unchanged.

## Overnight calls (2026-10-23 to 24)

- Derelict cull distance 12,000 px (not 20,000): travel back regenerates the same landscape, so a shorter window only saves memory.
- A derelict tile is final only once generation is 2,000 px past both of its edges (it fills both ways).
- Heaviest weather for perf, soak and GPU checks = downpour rain and wind, full flood, night, fog 0.8, all held.
- The output window gets the weather in the frame message and never runs its own cycle, so the projector cannot drift from the controller.
- Panic freezes the weather cycle with the scroll.
- The mirror test holds rain at 0: streaks animate per frame, so two windows a frame apart never match; flood and night stay on.
- Far window lights brightened (intensity 0.6 to 0.95) and a hot core added, after the night test showed them under-reading at 720p.
- MIDI CC 4 (channel 1) is bound to the weather cycle by default, unless learn moved it; clearing it brings it back on reload.
- The gate greps tracked files for password-like assignments; the gate itself holds no password.

## Nashua world (feat/nashua, from 2026-11-10)

Times are read from `date` (HST, the machine clock) when the row is written. Handoff: `PROMPT_10-AV_shanshui-av-nashua_v01.md`.

- 22:25 Working copy is a fresh clone at `C:\_av\shanshui-av-nashua`, not a worktree: a worktree keeps its git metadata inside the Drive-backed repo on Z:, which is what the handoff wanted off the Drive. Branch `feat/nashua` from `main` (1f009a1). Safety tag `shanshui-av-pre-nashua` on `main`, pushed.
- 22:25 Pages builds from `main` root (legacy). `/next/` cannot be published without touching `main` or the Pages source; see the publish row when it lands.
- 22:30 Privacy: on this branch the name in NOTICE, SHOWNIGHT, the About panel and the export credit becomes the account handle `laserpirate`; course paths leave the palette source notes and `tools/build-palettes.mjs` (now takes its folder as an argument). Colours unchanged. Every earlier commit on `main` carries a personal email as author: listed for the owner, not fixable without a force push.
- 22:32 Pack builder `tools/nashua/build-pack.py`: source paths only in the gitignored `sources.local.json`. Quick run (every 10th station) first: 194 s, then 21 s after caching the raster arrays (each sample call had copied an 18 to 72 MB array). Full existing pack 162 s, design pack 136 s.
- 22:37 Buildings: 458 footprints, 172 kept. 266 lie outside the 1 m grid: kept when within 1,100 m of the route (projected onto it, base from the wide DEM); the rest, and those whose station is the clamped 0 or end of the reach (upstream of the dam, past the end), are dropped.
- 22:40 Bands are the maximum ground inside 0 to 40, 40 to 120, 120 to 300, 300 to 700 m from the water edge along the station normal (water excluded), then 700 to 1,500 and 1,500 to 3,000 m from the wide DEM (feet converted). Smoothed with a 50 m triangular window; far ridges 150 m. Left normal equals the grid's side +1 at every station (check 1.0).
- 22:40 Bed: 37 measured contours, linear between their vertices where they cover the centreline (614 of 1,230 stations, about s 870 to 2,080), the estimated bed proxy elsewhere, flagged per station. Bridge span = channel width at s; deck height = ground at the two ends of the mapped bridge line above ws (Canal St 9.08 m, rail 361.8 14.38 m, rail 1706 8.24 m, Bridge St 4.50 m).
- 22:40 FEMA 1% (34.63 m) and 1936 Flood of Record (39.09 m) found: the v06 scroll took them from the lane's water-metrics glossary v02. They go in the pack as absolute levels; the three local levels stay offsets above ws(s).
- 22:43 Scale: 2 world px per m along the river, the finite scroll's own scale (reach 4,918 world px, about 4 screens at 16:9). Vertical = 2 x VE px per m, VE default 10 (20 px per m). Water surface ws(s) at world y 600; the bed section fills below. Far ridges taller than about 30 m leave the top of the frame at VE 10; nothing is rescaled to fit.
- 22:43 Right bank view is the mirror (standing in the river facing the right bank, downstream is on the left): the dam is at the right end.
- 22:44 Water levels drive the existing flood plane through a per-x water line (R32F row texture, 1024 samples over the reach). The shader picks it only when `uWaterOn` is 1, so derelict's arithmetic is unchanged (to be proven by the pixel compare). In nashua the weather cycle's water parameter is ignored; rain, fog and light still cycle.
- 22:44 Trees come from the canopy share (land cover class 2 probed clean) per band along the normal, at a fixed ink size (not to scale: canopy has no height). Buildings are exaggerated with the terrain, as the handoff asks; heights estimated from footprint area, said in the fact line.
- 22:45 Bridges are drawn in section where the scroll crosses them (deck slab, parapets, a pier to the bed). The pier position is schematic. Deck widths 14 m road, 8 m rail: assumed, not in the data.
- 22:46 Depth layers: far ridges 1, bands 300 to 700 and 120 to 300 m 2, band 40 to 120 m 3, the bank band and pipes 4 (floods cover them), bed, bridges and dam 5 (floods never cover them).
- 22:47 Values: each band a wash one step darker than the band behind it (fill greys 236, 226, 214, 201, 188, 174), mist lifting each foot. First look with paper fills showed no separation between bands.
- 22:48 Keys: K bank, `,` and `.` exaggeration, 1 to 6 levels, L labels. CC 4 scrubs the water level in nashua and the weather elsewhere. MIDI targets added: Water level, Exaggeration, Bank.
- 22:54 Metrics frozen before any tuning (tests/nashua.mjs). Bands: at 1280x720, 160 columns at s 300, 870, 1260 and 1706. Each band's visible face is sampled 3 px inside its run when the run is 10 px or taller. A band counts when it is seen in 10% of the columns or more and differs from each seen neighbour by 5 or more (of 255). Pass: 4 bands or more. Bridges and dam: in a 40 px window at the deck, 60 or more pixels at least 40 darker than the same window 260 px along. Old worlds: with the clock frozen in both pages, screenshot bytes and tile hashes equal v0.3.0.
- 22:48 Ends of the reach, measured at the view centre: hand over (default; crossfade to the stock shanshui world), loop (crossfade back to the other end), ping-pong (reverse). Bank and exaggeration changes crossfade to a regenerated reach at the same s.
- 23:22 Old-worlds identity, corrected method: a free-running loop is not repeatable even v0.3.0 against itself (derelict 1 to 215 levels apart: weather and light phases drift). The test now stops the loop and draws one fixed frame state (time 77.7, the reference page's weather) in both builds. v0.3.0 against itself: 0 bytes. This build against v0.3.0: 0 bytes and equal tile hashes, shanshui and derelict, day and night.
- 23:22 Bridges and dam metric: polarity fix, not tuning. "Darker than the paper" assumes dark ink on light paper; nashua-kit inverts it. The test frame uses the original palette. Threshold unchanged.
- 23:22 nashua-kit palette added (the handoff's default): ramp #07090E, #3E466B, #8B8BA3, #B0B0C1, #DDDEE4. Lights #9FC8F0. New optional palette field `water` [deep, lit] tints only the flood plane, #2E4A8C to #9FC8F0 by reflection strength. Palettes without it are unchanged (shader branch off; identity test passes). nashua opens in nashua-kit unless the URL names a palette; switching to nashua crossfades to it.
- 23:22 Per-frame layout reads removed from the reach overlay (sizes from the frame already measured). Labels layer `contain: strict`.
- 23:22 A finite reach keeps all its tiles resident when grey + aux fit in 96 MB (1080p yes, 4K no), so turning at the ends never re-rasterizes.
- 23:22 CPU 4x long frames: not at 0 in any world, including v0.3.0 itself (12 s runs: v0.3.0 derelict 1, 2, 4; shanshui 0; nashua 0 to 8). The CDP throttle stalls the main thread in slices; inside a long frame the time sits in whatever call was running (seen in the water texture bind, which uploads once per run). Recorded as measured, not claimed met.
- 23:22 Review sheet strips are rendered by the app in one viewport as wide as the reach (5104 x 720, 7656 x 1080), so the shader, levels and night are the real ones and nothing is stitched.
- 23:22 Preview publishing: branch `pages-preview` = origin/main's tree byte for byte + `next/` = feat/nashua, built with git plumbing (tools/deploy-next.mjs), fast-forward only. Pages source moves from main to pages-preview (one API call; reverting is one call). Root checked live, file by file by sha256, before and after. Caveat for the owner: until the source is moved back, a push to main reaches the site root only after the next deploy-next run.
- 23:48 Soak, honest record: run 1 (pre-fix build) stopped at 15.5 min after it showed the ping-pong bug (log kept, C:/_av/soak-nashua-run1-partial.log). Stopping its background task killed only the shell wrapper; the node soak kept running and overlapped the next soak for 7 min on the same GPU and log file. Both killed by PID at 23:48; run 2 restarted clean to its own log. Rule from here: stop soaks by PID and check the process list before starting another.
- 00:20 (11 Nov) Soak run2 (clean, 30 min, nashua, heavy weather, 1936 level, ping-pong, 1500 px/s, headed RTX 3080, output 1920x1080): fps min 51.4 (output 52.9), avg 60, heap -0.19 MB (output -0.24), 0 dips, 0 console problems, no context loss, 16 seeds, 25 palettes. The soak tool marks it pass=false on its own DOM rule (growth 73 >= 60): a census shows only the seed history list and the log list grow, one row per reseed or log line, capped at 20 and 120 rows, so the DOM is bounded at about +140 nodes. Not a leak; the handoff criteria (fps min 50, flat heap) are met. The DOM rule was set for the derelict soak, which logs less.

## Nashua P2 (feat/nashua-p2, from 2026-11-10 23:25)
- 23:25 P2 is written in a second worktree (`C:\_av\shanshui-av-p2`, branch feat/nashua-p2, port 8096) while the P1 soak holds the GPU; merged into feat/nashua by fast-forward after the P1 tag.
- 23:26 Modes: each depth layer of a chunk is split into pieces tagged with a mode layer (terrain, trees, landmarks, buildings, hardscape, infrastructure, cso). The world filters the paint order by the hidden layers and redraws its tiles: no reload, no regeneration. Pieces keep their order inside a layer, so built mode must equal P1 tile for tile (tested). Default mode built (the modes file's default). M cycles, X toggles sections, ?mode=.
- 23:27 Water is drawn by the shader, so "water" is in every mode and is not switchable; interventions, walk and kodama have no drawing in the existing pack (design only).
- 23:28 Morph: the design pack (local, never published) and the existing pack have the same arrays and shapes; every same-shape array is interpolated (bands, edge, bed, sections), objects come from the nearer end. The fader is quantized to 5% steps, each a regenerated reach with a crossfade (bank and exaggeration work the same way). The design pack is fetched only when the morph is above 0, so the preview makes no request for it unless someone moves the fader; then the fact line says "design pack not loaded".
- 23:30 Live section: the pack's sections (every 10 m, +-400 m every 4 m) interpolated at the playhead, drawn on a 2D canvas inset (top right, 380 to 560 px wide) with both banks, the named levels dotted and the shown level solid, water filled, estimated bed dashed. Same exaggeration rule: vertical px per m = horizontal px per m x VE. A playhead line at the view centre. Shown when the sections layer is on (X, or mode sections), on the output too.
- 23:32 Slit-scan on the GPU after the scene (render/slitscan.js): strip (an accumulation texture shifted by the slit width each frame), smear (live up to the slit, the strip beyond), time displacement (a ring of up to 128 quarter-size frames in a texture array, delay = slope x column or row). Off = the old draw path, untouched. No readback.
- 23:33 Video sources: a file dropped on the stage, or listed by the local server at media/list.json (media/ is gitignored and never published). The output gets the dropped file over the BroadcastChannel and plays its own muted copy, re-seeked when more than 0.2 s off (at most once a second). A camera only in the controller, on a button; the output shows the scroll instead.
- 23:34 tools/serve.mjs: byte ranges (video seek and loop), video types, media/list.json.
- 23:35 Ping-pong logs once a minute: every turn filled the log list (bounded at 200 rows) and grew the soak's DOM count.
- 23:36 P3 relay written early (tools/wall-server.mjs, no dependencies, RFC 6455 text frames, ping clock): tested over real sockets, 7/7.
- 00:02 (11 Nov) P3 wall in output.js: ?wall= slice of a virtual canvas in scene.frame (dx offset, camY offset per row), blend overlay, keystone on the body, calibration card (C). Sync: BroadcastChannel (default), ?sync=ws:// relay (controller sends frames stamped in relay time, at most 30/s), or clock mode ?t0= (no controller; nashua ping-pongs over the reach; the default mode layers so baked tiles match).
- 00:02 (11 Nov) P4 quality ladder (core/ladder.js) in the controller and in each output: 5 rungs of render scale and slit-scan history cap, never content. Down after 4 s under 50 fps, up after 20 s at 58+, hold 60 s after a step down, doubled after a quick fall back (max 30 min). ?quality=high|medium|low fixes a rung.
- 00:02 (11 Nov) P4 bake: tools/bake.mjs rasters tiles with the live raster worker at the live quantized scale and writes raw grey + aux bytes, gzip (PNG would break aux through premultiplied alpha). ?baked=1 uploads them and skips generation while they cover the view; any other seed, mode, bank or span is drawn live. baked/ and precache.json are local (gitignored).
- 00:02 (11 Nov) P4 offline: sw.js network first (4 s), cache fallback, registered only with ?offline=1 (launchers pass it); same-origin GET only, never ranges, media/ or data/local/.
- 00:02 (11 Nov) P4 MIDI: no feat/midi branch exists locally or on origin. nanoKONTROL2 factory-layout preset on a button (fader 5 stays CC 4 weather; REC blackout, PLAY play); not tried on the hardware. MIDI out (toggle LEDs) off by default, on a button.
- 00:02 (11 Nov) P5 gauge verified against USGS site service: 01096508 is MERRIMACK RIVER AT NASHUA, NH (no daily discharge), not the Nashua River. The Nashua River gauge is 01096500 NASHUA RIVER AT EAST PEPPERELL, MA, daily discharge 1935-10-01 to 2026-11-09; March 1936 daily mean peak 19,400 ft3/s (549 m3/s) on 1936-03-20. The time scroll will use 01096500 as a declared upstream proxy.
- 00:17 (11 Nov) MIDI rebuilt per handoff 4 and the MIDI reference (the owner has the ORIGINAL nanoKONTROL, not the nanoKONTROL2 the 00:02 row assumed): action seam in app.js (ACT: set/get for continuous, fire for buttons, notes when an action does not apply), presets in data/midi-maps/ (korg-nanokontrol, korg-nanokontrol2, generic = AV standard section 4), picked by port name on Enable, all marked verify with the wizard. Soft takeover, REC panic after a 1 s hold, STOP blackout, reseed / world / history one in flight, monitor of 10 messages, learn kept per device and instance, export. The e2e midi-learn test is unchanged: presets load before access is granted so a learn right after Enable is never overwritten.
- 00:17 (11 Nov) Master dim: a flat black pass after the vignette, drawn only below 1, so the default frame is untouched (old-worlds byte test decides).
- 00:17 (11 Nov) MIDI out per AV standard section 6, off by default: CC 20 terrain, 21 building density, 22 level, 23 light, 24 rain, 25 seed byte, 26 playing, program change = palette; nashua features as notes on C minor pentatonic in reach order. Replaces the LED feedback placeholder (LEDs are Tier 3).
- 00:17 (11 Nov) sw.js: no timeout race any more; the cache answers only when the network fails, so an online page cannot mix two releases. A probe test rewrites a file under an installed worker.
- 00:17 (11 Nov) Launchers by role as the handoff lists them: launch/windows/*.bat, launch/mac/*.command, launch/pi/kiosk.sh + a systemd user unit. Outputs in --kiosk (no gesture). Not run on any machine yet.
- 00:17 (11 Nov) Time scroll (P5.1) written: gauge.js maps East Pepperell daily discharge to the level, log-linear between the record median (397 ft3/s -> Median Water) and the record daily maximum (19,400 ft3/s on 1936-03-20 -> 1936 Flood of Record), read at the reach middle; flows under the median sit at Median. Declared on the fact line as an upstream proxy. ?t=YYYY-MM-DD, Y on/off, U March 1936, Reach panel, MIDI time and timeRun.
