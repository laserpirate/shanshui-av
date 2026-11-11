# AV Shan Shui Infinite Scrolls

Show build of **{Shan, Shui}\*** by Lingdong Huang (https://github.com/LingDong-/shan-shui-inf, MIT):
the infinite procedural landscape scroll with playback controls, seeds, palette modes, a projector
output window and print export. The landscape engine is Lingdong Huang's, unchanged. Credit and
license: `NOTICE.md`, `LICENSE`.

World: shanshui / derelict. `derelict` is a second generator (`src/worlds/derelict/`): a derelict
airport and drowned megacity edge with lights and a weather cycle. Switch with `W` or the World buttons.

Live: https://laserpirate.github.io/shanshui-av/

## Run offline

```
node tools/serve.mjs            # http://localhost:8080/  (no internet, no dependencies)
node tools/serve.mjs --port 8091
```

Open the page, press `O` for the output window, drag it to the projector, press `F` inside it.
Show checklist: `SHOWNIGHT.md`. Keys: `?` in the app, or `src/ui/keys.js`.

## URL

| Parameter | Meaning |
| --- | --- |
| `?seed=<seed>` | Landscape seed. Same seeds as https://lingdong-.github.io/shan-shui-inf/?seed=... |
| `?i=<name>` | Instance: its own settings, stars and output channel, so two laptops or two outputs never mix |
| `?palette=<id>` | Start on a palette from `palettes.json` |
| `?world=derelict` | Start on the derelict world (shanshui is the default) |
| `?world=nashua` | The Nashua reach as a section; also `&bank=L\|R`, `&ve=1..20`, `&level=0..4`, `&ends=handover\|loop\|pingpong`, `&mode=nature\|built\|design\|sections`, `&morph=0..1` (needs the local design pack) |
| `?t=YYYY-MM-DD` | nashua: the time scroll on, at that day of the East Pepperell record (an upstream proxy) |
| `?daycycle=1&hour=HH` | nashua with the time scroll: the light follows the sun at the reach for the hour of the scroll's day (local standard time); held above 0.1 day/s |
| `?tags=1` | nashua: post the tag stream for a score (`docs/nashua/score-tags.md`) |
| `?quality=auto\|high\|medium\|low` | The quality ladder (auto: start rung from the GPU, down after 5 s under 24 fps) or a fixed rung |
| `?offline=1` | Register the service worker so the app runs with the network off |
| `?baked=1` | Use baked tiles from `baked/` where they exist (`tools/bake.mjs`) |
| `?sync=ws://host:8097` | Follow, or as the controller drive, a LAN wall through `tools/wall-server.mjs`; an output that loses the relay runs on at the last speed (or from `&t0=` if given) |

Export, To scale (nashua): Arch D or a 36 in roll at 1:500, 1:1000 or 1:2000 horizontal, vertical 1:(N / exaggeration), with scale bars. Never fitted: what does not fit is cropped, and the window is shown and logged.

`output.html?i=<name>` is the output window for that instance (no UI, writes nothing).
`output.html?wall=CxR&col=&row=` is one node of a wall; `&t0=<epoch ms>&speed=` runs it from the clock alone (WALL.md).

## MIDI

Off until **Enable MIDI** (Show panel); Chrome or Edge only. The preset is picked by port name and can be changed in
the panel; Learn (press a target, move a control) overrides it per device and per instance; Export saves the map.
Every preset is marked "verify with the wizard": the CC numbers come from Korg's documentation and have not been
seen on the hardware. Soft takeover on every fader and knob (the panel says when a control waits for pickup).
Panic needs a 1 s hold. While blacked out only Blackout and Panic act.

Korg nanoKONTROL (original, scene 1, channel 1; keep the SCENE light on 1), `data/midi-maps/korg-nanokontrol.json`:

| Strip | Knob | Fader | Upper | Lower |
| --- | --- | --- | --- | --- |
| 1 | Slit position (CC 14) | FX mix (CC 2) | Blackout (CC 23) | Reseed (CC 33) |
| 2 | Slit width (CC 15) | Speed (CC 3) | Reset speed (CC 24) | Direction (CC 34) |
| 3 | Ink weight (CC 16) | Contrast (CC 4) | Palette + (CC 25) | Palette - (CC 35) |
| 4 | Wind (CC 17) | Rain (CC 5) | Weather auto (CC 26) | Time run (CC 36) |
| 5 | Fog (CC 18) | Water (CC 6; the level in nashua) | Bank (CC 27) | Mode (CC 37) |
| 6 | Light (CC 19) | Master dim (CC 8) | Hold (CC 28) | Sections (CC 38) |
| 7 | Weather cycle (CC 20; the level in nashua) | Gradient drift (CC 9) | FX mode (CC 29) | FX freeze (CC 39) |
| 8 | Vertical Exaggeration (CC 21) | Morph (CC 12) | Star seed (CC 30) | World (CC 40) |
| 9 | Palette pick (CC 22) | History depth (CC 13) | FX direction (CC 31) | Hide controls (CC 41) |

Transport: PLAY play / pause (CC 45), STOP blackout (CC 46), REW / FF seed back / forward (CC 47 / 48), LOOP clean
full window (CC 49), REC panic, hold 1 s (CC 44). Weather controls act in derelict and nashua; elsewhere they say so.
The nanoKONTROL2 preset uses the same roles on strips 1 to 8 (upper = S, lower = R). The generic preset is the AV
standard map: pads from note 36 (play, next, reseed, palette +, palette -, blackout, panic, hold, star), CC 1 speed,
CC 2 FX mix, CC 3 drift, CC 4 weather, CC 5 contrast, CC 7 master. Without a preset, CC 4 drives the weather.

**MIDI out** is off until switched on in the panel; it uses the port named `av-out` (loopMIDI or IAC) if there is one,
on the channel set there, at most 60 messages per second per CC and only on change:

| Message | Meaning |
| --- | --- |
| CC 20 | terrain height at the playhead (nashua, band 0, 0 to 127 over the reach) |
| CC 21 | building density within 50 m of the playhead (nashua, on the bank in view) |
| CC 22 | water level (nashua, Median Water 0 to 1936 Flood of Record 127) |
| CC 23 / CC 24 | light / rain |
| CC 25 | seed (a byte of its hash; changes on reseed) |
| CC 26 | playing 127, paused 0 |
| program change | palette index |
| notes | nashua: passing the dam, a bridge or the confluence (long, velocity 100) or a CSO or outfall (short, 70), C minor pentatonic from C3 in order along the reach |

## Palettes

All palettes live in `palettes.json`. Add one by hand:

```json
{ "id": "my-ink", "name": "My Ink", "group": "Mine", "cycle": true, "type": "ramp",
  "ground": "#101418", "paper": "grain", "stops": [[0, "#101418"], [0.5, "#5a7a9a"], [1, "#f4f6f8"]] }
```

`stops` map ink amount (0 bare paper, 1 darkest ink) to colour. `type: "gradient"` with `ramp`, `drift`
(`x` or `time`), `period` and `rate` makes colour travel along the scroll. Field notes at the top of
`tools/build-palettes.mjs`, which built the file (the 25 Studies come from the Kodama Topo pages).
`light` and `beacon` (hex) colour the derelict world's lights; without them the brightest stop is used.
Swatches: `docs/palettes/`.

## Layout

```
index.html          controller            output.html   output window
src/engine/         upstream engine, extracted unchanged (tools/extract-engine.mjs)
src/workers/        gen-worker (runs the engine), derelict-worker, raster-worker (tiles, off the main thread)
src/worlds/         registry, shanshui (wraps the engine), derelict (planner and layer kits)
src/core/           world, scene, playback, palettes, weather, store
src/render/         WebGL2 renderer (palette tables, crossfades)
src/export/         SVG, PDF (vendor/jspdf + vendor/svg2pdf), PNG
upstream/           untouched copy of shan-shui-inf@9f754d2
tools/              serve, gate, preflight, soak, bench, build-palettes
tests/              e2e (Playwright, real GPU), smoke
```

## Tests

```
cd tools && npm install          # Playwright 1.48.2 + pngjs, dev only
node tools/serve.mjs --port 8093
node tools/gate.mjs              # syntax, links, console errors
node tests/e2e.mjs               # upstream identity, playback, seeds, palettes, export, blackout, full screen, output, MIDI,
                                 # worlds: shanshui vs v0.2.0 (--v020=<url of the v0.2.0 tag served>), derelict round trip, weather, lights
node tools/preflight.mjs         # every palette on this GPU
node tools/soak.mjs 30           # 30 min at high speed: heap, fps, DOM, chunks
node tools/soak.mjs 30 --world=derelict --heavy --worldevery=5 --fpsmin=50 --out=soak-derelict.json
node tools/strip.mjs             # greyscale strips of the derelict world
node tests/nashua.mjs            # the nashua world: levels, bands, bridges and dam, old worlds byte-identical to v0.3.0
node tests/nashua-p2.mjs         # modes, morph, live section, slit-scan and time-smear
node tests/wall.mjs              # wall nodes: overlap band, clock mode, LAN relay, keystone, blend, card, 3 x 1 seam against
                                 # one canvas, relay killed and back, drift over 10 min (--drift-min=N)
node tests/wall-server.mjs       # the relay over real sockets
node tests/midi.mjs              # fake Web MIDI: presets, every binding, pickup, panic hold, flood, debounce, unplug, MIDI out
node tests/p4.mjs                # quality ladder, baked tiles = live tiles, offline and a release while installed,
                                 # baked at 720p under CPU 6x (a proxy, not a Pi)
node tests/p5.mjs                # the time scroll, day cycle, tag stream, print to scale
node tools/capture.mjs --out=C:/_av/captures   # 20 s WebM per mode (local only, never committed)
node tools/soak.mjs 30 --world=nashua --heavy --fxevery=5      # slit-scan modes cycling; --midi sweeps a fake nanoKONTROL
node tools/bake.mjs --world=nashua --seed=1   # bake tiles for a weak machine (?baked=1)
node tools/nashua/gauge.mjs      # refresh the East Pepperell daily record
```

Decisions and numbers: `DECISIONS.md`.
