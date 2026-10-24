# MORNING

AV Shan Shui Infinite Scrolls, run of 2026-10-23. Two releases are tagged, live and verified.

Live: https://laserpirate.github.io/shanshui-av/ (public, no password)
Repo: https://github.com/laserpirate/shanshui-av
Offline: `node tools/serve.mjs` in the repo, then http://localhost:8080/

## What shipped

| Tag | What |
| --- | --- |
| `shanshui-av-v0.1.0` | Controls, seeds, palettes, export. Upstream engine unchanged, running in a worker. Tiles are drawn in a worker and coloured in WebGL. Play/pause with easing; Stop eases back to x = 0; speed, direction, drag, wheel and arrows. Reseed with crossfade, `?seed=`, typed seed, copy link, history of 20, stars, auto reseed. 13 cycle palettes plus 25 Studies, palette stars, gradient editor, contrast, ink, paper, vignette. Output window, blackout, panic, test card, hold, full screen, key card, big targets. SVG, PNG and PDF export of the view or an Arch D frame. |
| `shanshui-av-v0.2.0` | Perf: no GPU readback on the frame path, and the output window in its own process. Soak runner. Opt-in Web MIDI learn. Offline check in the gate. |

Verified on the live URL after each tag: gate passed, e2e 15/15 with 0 console problems (`test-results/e2e-live-v0.2.0.json`, local). Verified offline: the gate run against localhost blocks every non-local request and counts any as a failure. None were made, including the lazy PDF libraries.

Numbers (details in `DECISIONS.md`):
- **Render path:** benchmark (a) 8.8 fps, (b) 59.8, (c) 59.1 at 1080p. With the CPU throttled 4x: (b) 35.4, (c) 59.4. Path (c) was chosen.
- **Upstream identity:** same seed gives the same elements as upstream (seeds 1, 1729700000000, shanshui).
- **Raster check:** the worker raster matches Chrome's SVG raster with a mean difference of 0.2 to 1.0 levels of 255.
- **30 min soak at 1500 px/s, output at 1920 x 1080:**
  - v0.1.0 dipped to 37.5 fps after reseeds.
  - v0.2.0 held 59.1 min and 60.0 avg, with no heap growth, no reloads and no console problems.
- **Export:** PDF MediaBox `[0 0 2592 1728]`; SVG `36in x 24in`; PNG 5400 x 3600 at 150 dpi and 10800 x 7200 at 300 dpi (about 8 s).

## Could not verify on real hardware

These were tested only on Polaris (RTX 3080), in Playwright's Chromium 130, headless except the full-screen and output-window tests:
- Chrome on a real projector, or a second display. The output window was tested as a popup, not dragged to another screen.
- Any other machine: integrated GPU, laptop on battery, Mac. The CPU-throttle benchmark only stands in for a weaker laptop.
- Keyboard Lock for Esc in real full screen. The app requests it, so holding Esc should trigger panic and Chrome should need a 2 s Esc hold to exit. Playwright full screen does not prove what branded Chrome does.
- A real MIDI controller. Learn was tested with a fake input only.
- Printing: the Arch D PDF has the right page size but has not been sent to a plotter.
- Long runs headed: the soak ran headless on the real GPU. A headed 30 min run on the show laptop is the remaining check.

## Open questions

1. Multi-stop palettes in SVG/PDF only approximate the screen. Vector colours map per element, while the screen maps the composited grey. Two-stop palettes are exact. Is that good enough for print, or should Arch D prints use PNG at 300 dpi?
2. Travel back past the 20,000 px cap draws new landscape, not upstream's. Raise the cap (memory) or keep it?
3. `O` while an output is already connected only shows a toast, because a `noopener` window cannot be focused from the controller. Fine for shows?
4. Which seeds and palettes to star for the first show.

## Where everything landed

| Asset | Local | GitHub | Pages | Chat only |
| --- | --- | --- | --- | --- |
| App (index.html, output.html, src/, palettes.json, fonts/, vendor/) | repo | yes | yes | |
| upstream/ copy, LICENSE (MIT), NOTICE.md | repo | yes | yes | |
| README.md, DECISIONS.md, SHOWNIGHT.md, MORNING.md | repo | yes | yes | |
| tools/ (serve, gate, preflight, soak, bench, rastertest, build-palettes, extract-engine), tests/ | repo | yes | yes | |
| docs/palettes/*.jpg (38 stills) | repo | yes | yes | |
| test-results/ (bench, preflight, e2e, live e2e, soak runs, exported sample files) | repo folder, gitignored | no | no | |
| scratch/ (panel screenshots, helper) | repo folder, gitignored | no | no | |
| Post-mortem | `Z:\_F26_Fall-2026\Claude_post-mortems\POSTMORTEM_10-AV_shanshui-av_v01.md` | no | no | |
| Export scope addition | handoff on disk still has the old Export section; the scope came from a chat message | | | yes |

Repo folder: `Z:\_F26_Fall-2026\10_av\00_shan-shui\shanshui-av`. Upstream source `_source\shan-shui-inf\` was not touched.
