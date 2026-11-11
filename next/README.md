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
| `?world=nashua` | The Nashua reach as a section, seen from the south bank looking north; also `&bank=L\|R`, `&hx=2..12` (world px per m, default 8), `&ve=1..20` (Vertical Exaggeration, default 2), `&level=0..4`, `&ends=pingpong\|handover\|loop` (default pingpong), `&mode=nature\|built\|design\|sections`, `&morph=0..1` (needs the local design pack). Clock-mode outputs take `&hx` and `&ve` too |
| `?layers=a,b` | nashua, for tests and review: draw only these layers (for example `buildings`) |
| `?spread=0` | nashua: far footprints (more than 120 m behind the water) at their nearest station, as in `.p6`; the default places them on the route smoothed over 300 m so they do not stack behind the bends. Clock-mode outputs take it too |
| `?t=YYYY-MM-DD` | nashua: the time scroll on, at that day of the East Pepperell record (an upstream proxy) |
| `?daycycle=1&hour=HH` | nashua with the time scroll: the light follows the sun at the reach for the hour of the scroll's day (local standard time); held above 0.1 day/s |
| `?reach=merrimack` | nashua: the second reach, 5 km of the Merrimack below the confluence (estimated bed, levels carried from the confluence) |
| `?hydro=1` | nashua with the time scroll: a hydrograph under the fact line, a year either side of the scroll's day (East Pepperell, log axis, median and 1936 rules) |
| `?ticks=1` | nashua, controller or output: a distance rule along the bottom; at 6 px per m and up a tick every 25 m and a label every 100 m, below that a tick every 100 m and a label every 500 m |
| `&cap=0.8` (output) | this output's brightness ceiling, 0.1 to 1: the picture times cap, under the controller's master. Labels and a local video slit source are not capped |
| `?tags=1` | nashua: post the tag stream for a score (`docs/nashua/score-tags.md`) |
| `?quality=auto\|high\|medium\|low` | The quality ladder (auto: start rung from the GPU, down after 5 s under 24 fps) or a fixed rung |
| `?offline=1` | Register the service worker so the app runs with the network off |
| `?baked=1` | Use baked tiles from `baked/` where they exist (`tools/bake.mjs`) |
| `?sync=ws://host:8097` | Follow, or as the controller drive, a LAN wall through `tools/wall-server.mjs`; an output that loses the relay runs on at the last speed (or from `&t0=` if given) |
| `?mirror=1` | The mirror (below): the Mirror button and panel, its MIDI roles. Without it the app is the `.p7` app, frame for frame. `&mon=1` turns it on from the URL, with `&maxis=0..80`, `&mstr=0..1`, `&mscroll=with\|against\|free`, `&malt=other\|shanshui\|derelict\|nashua`; the pair links carry these, so a clock-mode node draws it too |

**The mirror** (`?mirror=1`, ADDENDUM-B B11). A second world drawn upside down below the water line, meeting the first at the water: for nashua the other bank (the north bank above, the south bank turned below so each column is the same station), for shanshui and derelict the next seed, or any world by name. While it is on, the view fits the upper world from its top to the axis into the upper half (so the scroll is drawn at about half the size). Mirror panel and MIDI roles:

| Control | MIDI role | What |
| --- | --- | --- |
| Mirror on / off | Mirror on / off | Off is the normal picture |
| Axis | Mirror axis (continuous) | 0 to 80 css px below the water line (nashua: Median Water; derelict: the weather's water; shanshui: the foot of the scroll) |
| Strength | Mirror strength (continuous) | The lower world's ink, 0 to 1 (default 0.85) |
| Lower half | Mirror lower half (cycles) | Other (the other bank, or the next seed), shanshui, derelict, nashua |
| Its scroll | Mirror scroll (cycles) | With the upper world, against it, or free at half the speed on its own clock |

Export, To scale (nashua): Arch D or a 36 in roll at 1:500, 1:1000 or 1:2000 horizontal, vertical 1:(N / exaggeration), with scale bars. Never fitted: what does not fit is cropped, and the window is shown and logged.

`output.html?i=<name>` is the output window for that instance (no UI, writes nothing).
`output.html?wall=CxR&col=&row=` is one node of a wall; `&t0=<epoch ms>&speed=` runs it from the clock alone (WALL.md).

Nashua on the controller (Reach panel, and the bar while a data world is on):

| Control | Key | What |
| --- | --- | --- |
| Labels here / Labels on output | `L` (here) | Names from the data, and the owner's words for the landmarks (Dam, Levee (approximate), Church, Factory, CSO #9, CSO #6); the source's name and id in the tooltip; off by default on the output |
| Map | `I` | The map inset: the route in plan, north up, the stations, a dot at the playhead; click a station to go there. It floats over everything; drag it by its grip (✥) or its edge, it stays where it was left (per instance). Sizes 240, 400 (default) or 600 px; "Map on output" is off by default |
| Rain | `N` | On the bar (derelict, nashua): on holds the rain at 0.85, off holds it at 0. MIDI role "Rain on / off" |
| Flood | | On the bar (nashua): off is Median Water, on is the level picked beside it (MHW, Minor, FEMA 1 %, 1936; default Minor). The fact line names the level in full. MIDI role "Flood on / off" |
| Runoff (with rain) | | Reach panel, on by default: flow from CSO #9 and CSO #6 and sheet runoff from the lot, drawn in the shader. Off when dry, running in rain, stronger at the flood levels |
| The mouth | | The scroll ends at the confluence (S5); past the mouth the Merrimack runs to the horizon in forced perspective, not to scale (the fact line says so while it is in view). `?reach=merrimack` for the Merrimack in section |
| Scale | | Horizontal world px per m, 2 to 12 (default 8); the fact line states 100 m in px |
| Open pair | | Two output windows as a `wall=2x1`, columns 0 and 1 (allow popups) |
| Copy pair links | | Two clock-mode links with one shared `t0`, 10 s ahead, for two machines (WALL.md) |

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

The bar (all worlds): **Full menu / Mini menu / Full screen** cycles the menu: the full bar, the mini menu (Play, Speed, World, Guide, Labels, Map and this button), and true full screen with the mini menu, hidden after 3 s and back on mouse move. The label names the next state; `F` still goes straight to full screen; the state is kept per instance. **Guide** opens a one-screen quick guide built from the app's own tables (keys, the bar, every URL parameter, how to open a pair); Escape closes it. Less used panels (Seed, Look, Export, Log, About, Keys) are under **More**, the pair under **Pair**. Below 1440 px wide the seed and palette arrows leave the bar (keys `[` `]` `P` `Shift+P`).

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
node tests/p6.mjs --ref=<.p5 url> # no hills, the scale, structures, the map inset, label toggles, the pair, spread
node tests/p7.mjs --ref=<.p6 url> # ADDENDUM-B: floating map, the bar fits, Rain, Flood, menu cycle, guide drift,
                                 # the mouth, landmark glyphs and labels, runoff (each rule fails on a planted picture)
node tools/nashua/review-p7.mjs  # P7 review frames into docs/nashua/index.md
node tests/p8.mjs --ref=<.p7 url> # the mirror: flag off byte-identical to .p7 (three worlds, dry and heavy), the flip,
                                 # controls and MIDI, the axis, scroll modes, output, pair and wall, 60 fps at 1080p heavy
node tools/nashua/review-p8.mjs  # a mirrored strip of each world into docs/nashua/index.md
node tools/capture.mjs --out=C:/_av/captures   # 20 s WebM per mode (local only, never committed)
node tools/soak.mjs 30 --world=nashua --heavy --fxevery=5      # slit-scan modes cycling; --midi sweeps a fake nanoKONTROL
node tools/bake.mjs --world=nashua --seed=1   # bake tiles for a weak machine (?baked=1)
node tools/nashua/gauge.mjs      # refresh the East Pepperell daily record
```

Decisions and numbers: `DECISIONS.md`.
