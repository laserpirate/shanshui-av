# MORNING

AV Shan Shui Infinite Scrolls, overnight run of 2026-10-23 to 24: `shanshui-av-v0.3.0`, the derelict world. Tagged, live and verified.

Live: https://laserpirate.github.io/shanshui-av/ (public, no password). Derelict: https://laserpirate.github.io/shanshui-av/?world=derelict
Review sheet: https://github.com/laserpirate/shanshui-av/blob/main/docs/derelict/index.md
Repo: https://github.com/laserpirate/shanshui-av
Offline: `node tools/serve.mjs` in the repo, then http://localhost:8080/

## What shipped

| Tag | What |
| --- | --- |
| `shanshui-av-v0.1.0` | Controls, seeds, palettes, export, output window, show tools. |
| `shanshui-av-v0.2.0` | Perf (no GPU readback on the frame path, output in its own process), soak runner, Web MIDI learn. |
| `shanshui-av-v0.3.0` | World: shanshui / derelict. A second generator: a derelict airport and drowned megacity edge, five depth layers, a planner with quiet stretches between dense passages, landmarks (control tower, airliner, parking structure, radar). Chunk-seeded (mulberry32), so travel back reproduces the landscape. Two-channel tiles: ink plus lights (steady, breathe, blink, flicker, chase, beacon) animated in the shader. Weather cycle dry, drizzle, downpour, flood, night (6 min auto, pin a phase, CC 4 scrubs), with rain, wind, water, fog and light sliders (grab holds, Follow releases) and MIDI targets. Fog, flood with reflections, and rain are drawn in the shader. 11 new palettes: Megacity arc 17 to 24, derelict-rust, -rain, -mono. Export: lights as accent circles in SVG/PDF, glow in PNG, rain in export off by default. Shanshui pixel-identical to v0.2.0. |

Checks on the final commit (details in `DECISIONS.md`):
- **e2e:** 24/24 with 0 console problems on localhost (15 from v0.2.0 plus 9 for worlds). The first full run on the final code failed `midi-learn` once: the test still expected no bindings before Enable, while CC 4 is now bound to weather by default. The test now checks that default; rerun passed.
- **Shanshui vs v0.2.0:** 5 frames (seeds 1, 7, shanshui; palettes original, dark, kl4-look, gradient, kodama-water) compared with the v0.2.0 tag served from a worktree: 0 bytes differ.
- **Derelict determinism:** 50,000 px out (the start is culled from memory) and back: every tile hash the same.
- **Performance at heaviest weather** (downpour + flood + night): derelict 60 fps at 1080p and 4K, 60 fps at 1080p with the CPU slowed 4x, no frame over 25 ms. Shanshui unchanged at 60 / 60 / 59.6.
- **30 min soak**, heaviest weather, reseed every 2 min, palette every 1 min, world switch every 5 min, output at 1920 x 1080: fps min 57.0 (output 57.2), avg 59.9, heap -3.75 MB first to last third, 0 dips under 50, 0 reloads, 0 console problems.
- **Real GPU checks** (RTX 3080, headed Chromium): full screen non-blank, output window mirrors (correlation 0.95 to 0.99), blackout and panic from derelict at heaviest weather, all in e2e.
- **Composition:** busy share 37 % -> 28 % (far megastructures, then far towers, then mid-far thinned). Control tower and airliner read at a glance at 1080p, so they were not changed.
- **Gate:** node --check on all JS, links resolve, zero console errors in both worlds and the output, no external requests offline, no password strings (new grep).
- **Live and offline:** after the tag, the gate and e2e 24/24 (0 console problems) ran against the live URL (`test-results/e2e-live-v0.3.0.json`, local). The gate against localhost blocked every non-local request; none were made.

## Overnight calls

One line each in `DECISIONS.md`, "Overnight calls". In short:
- derelict keeps 12,000 px behind the view (travel back regenerates, so less memory costs nothing);
- a derelict tile is final once generation is 2,000 px past both edges;
- heaviest weather = downpour rain and wind, full flood, night, fog 0.8, held;
- the output window takes weather from the controller and never runs its own cycle;
- panic freezes the weather with the scroll;
- the mirror test holds rain at 0 (streaks animate per frame);
- far window lights brightened and a hot core added after the night test under-read at 720p;
- MIDI CC 4 on channel 1 is bound to the weather cycle by default;
- the gate greps for password-like strings.

## Blocked

Nothing blocked. No fallback was needed.

## Notes

- **Topo 23** (Kuala Lumpur) has no entry in `phylla-kodama-manifest.js`. The Kodama files were not touched.
- Stilt houses and nets come from topo 22, as confirmed.
- 300 dpi Arch D PNG is rastered in 2 blocks; a reflection whose source is in the other block is lost at the seam. 150 dpi is one block.
- The soak's world switch every 5 min means it alternated 5 min derelict, 5 min shanshui.

## Could not verify on real hardware

Tested only on Polaris (RTX 3080) in Playwright's Chromium 130:
- a real projector or second display, Keyboard Lock in branded Chrome full screen;
- any other machine (integrated GPU, laptop on battery, Mac);
- a real MIDI controller (fake input only), including CC 4 scrubbing the weather;
- printing the derelict Arch D PDF on a plotter;
- a headed 30 min soak on the show laptop (the soak ran headless on the real GPU).

## Open questions

1. Weather defaults: the cycle starts at dry on every load. Should shows start at a pinned phase (night reads best on a projector)?
2. Is 28 % busy right, or do you want longer quiet stretches?
3. Vector export has no reflections (flat water plane). Fine for print, or prefer PNG for derelict prints?
4. Runway threshold numbers are invented 7-segment glyphs. Keep, or drop text-like marks entirely?
5. The soak alternated worlds as asked; do you also want a 30 min derelict-only run before the show?

## Where everything landed

| Asset | Local | GitHub | Pages | Chat only |
| --- | --- | --- | --- | --- |
| App (index.html, output.html, src/, palettes.json, fonts/, vendor/) | repo | yes | yes | |
| Derelict world `src/worlds/derelict/`, registry, shanshui wrapper, weather, derelict worker | repo | yes | yes | |
| README.md, DECISIONS.md, SHOWNIGHT.md, MORNING.md | repo | yes | yes | |
| tools/ (adds bench-app, review, strip; gate with password grep; soak with world options) and tests/e2e.mjs (24 tests, 9 new) | repo | yes | yes | |
| docs/palettes/*.jpg (49 swatches, 11 new) | repo | yes | yes | |
| docs/derelict/ review sheet (13 JPG, each under 220 KB, index.md) | repo | yes | yes | |
| test-results/ (e2e, soak-derelict, bench-app, preflight, strips, exports) | repo folder, gitignored | no | no | |
| scratch/ (smoke and composition helpers, screenshots) | repo folder, gitignored | no | no | |
| Post-mortem | `Z:\_F26_Fall-2026\Claude_post-mortems\POSTMORTEM_10-AV_shanshui-av-derelict_v01.md` | no | no | |

Repo folder: `Z:\_F26_Fall-2026\10_av\00_shan-shui\shanshui-av`. Kodama files and `_source\shan-shui-inf\` were not touched. The v0.2.0 worktree used for the pixel compare was removed.
