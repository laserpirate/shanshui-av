# CHECKPOINT P1 · the nashua world · 2026-11-11

Live preview: **https://laserpirate.github.io/shanshui-av/next/?world=nashua**
(the stock app is unchanged at https://laserpirate.github.io/shanshui-av/)
Tag: `shanshui-av-v0.4.0-nashua.p1` on `feat/nashua` (the commit that adds this file; code as at d5973c4). Root of the site: byte-identical to `main` 1f009a1 (checked live, file by file).

## What works
- World `nashua` (W cycles shanshui → derelict → nashua; `?world=nashua`). The last reach as an unrolled section: far ridges, four bands from the water edge (0–40, 40–120, 120–300, 300–700 m), trees from the canopy layer, 172 buildings with lit windows by occupancy, the bed as a cut section (solid where measured, dashed where estimated), the Jackson Mills dam, two road and two rail bridges in section, CSOs, outfalls, the 90 Canal St lot, the confluence.
- Water levels as data: Median, MHW, Minor Flood, 1% FEMA, 1936. Keys 1–6, the Reach panel, and CC 4 (the default weather knob scrubs the level in nashua). The level eases; a scrub is immediate.
- Bank flip (K) keeps the same s at the view centre. Vertical Exaggeration 10x by default, 1–20 live (`,` `.`), redrawn with a crossfade.
- Fact line at the playhead: s, bank, exaggeration, "building heights estimated", bed measured or estimated, a 100 m (328 ft) scale in px, the level name. Labels (L) on the controller; both off on the output by default.
- Ends of the reach: hand over to shanshui (default), loop, or ping-pong.
- Palette `nashua-kit` (the Core 3 kit) is the default in nashua, with the two water blues tinting the flood plane only. All other palettes work.

## Measured
| check | target | result |
| --- | --- | --- |
| 1080p fps, RTX 3080 | 60 | nashua 60.0 (p95 16.7 ms); shanshui 60; derelict 60 (bench-app, 12 s at 600 px/s, heaviest weather, 1936 level) |
| 4K fps | | nashua 60.0, shanshui 60, derelict 60 |
| frames over 25 ms at CPU 4x | 0 | **not met in any world.** nashua 0–10 per 12 s (5 probe runs: 0, 1, 3, 5, 8; bench 10); the v0.3.0 build itself: derelict 1, 2, 4, 6; shanshui 0, 3. p95 16.8 ms everywhere. See open question 4. |
| soak, 30 min, heaviest weather, output 1920x1080 | fps min ≥ 50, flat heap | **met**: fps min 51.4 (output 52.9), avg 60, heap −0.19 MB (output −0.24), 0 dips, 0 console problems, no context loss; 16 seeds, 25 palettes, ping-pong at both ends. The soak tool flags its own DOM rule (+73 nodes, rule < 60): only the seed history (cap 20 rows) and the log (cap 120 rows) grow, so it is bounded, not a leak. A first run was void: an orphaned soak overlapped it. |
| bands separable at 720p | ≥ 4 | **6 of 6** (values 24.7 / 33.9 / 47.1 / 59.7 / 77.7 / 100 of 255, method frozen before tuning, tests/nashua.mjs) |
| every bridge and the dam visible at its s | all | dam + 4 bridges: 112 / 825 / 1560 / 1206 / 523 dark px in the deck window (threshold 60) |
| old worlds | 0 bytes | shanshui and derelict vs v0.3.0: **0 bytes**, equal tile hashes, 5 frames incl. night and rain (one fixed frame state in both builds) |
| e2e, unchanged 24 | 24/24 | local 24/24 (clean console); on /next/ **24/24** and on the live root **24/24**, 0 console problems each (11 Nov 00:2x) |
| nashua tests | 9/9 | **9/9**, 0 console problems (d5973c4) |
| 50,000 px round trip | equal hashes | equal (7 tiles), start culled |
| gate | 0 hits | 0 hits (syntax 51 files, 69 links, password grep, privacy grep 169 files, offline) |
| live crawl /next/ | 0 broken | **0 broken**, 0 console errors (5 pages headed on the GPU, 44 requests, 31 linked files) |

## Not verified on real hardware
- No projector, no wall, no Pi, no Mac. Only this Windows machine (RTX 3080, headed Chromium, ANGLE D3D11).
- MIDI: the CC 4 → level mapping is tested with synthetic MIDI messages (midi-learn test), not a physical controller.
- CPU 4x is Chromium's throttle, a proxy for a weak machine, not one.

## Where everything landed
| what | local | GitHub | Pages | chat only |
| --- | --- | --- | --- | --- |
| code, tests, tools | `C:\_av\shanshui-av-nashua` (`feat/nashua`) | `feat/nashua` (pushed) | `/next/` | |
| existing-conditions pack | `data\nashua\existing\` | yes | `/next/data/nashua/existing/` | |
| design pack (landform) | `data\local\nashua\design\` (gitignored) | **no** | **no** | |
| source paths | `tools\nashua\sources.local.json` (gitignored) | no | no | |
| review sheet | `docs\nashua\` | yes | `/next/docs/nashua/index.md` | |
| preview branch | | `pages-preview` (root = main + next/) | serves the whole site | |
| STATE, CHECKPOINT, MORNING | repo (STATE gitignored) and `_handoffs\nashua\` | CHECKPOINT and MORNING yes | | |

## Open questions (default taken; nothing waits on you)
1. **Pages source.** To serve `/next/` without touching `main`, the Pages source moved from `main` to `pages-preview`, whose root is main's tree byte for byte plus `next/`. Default: keep it. Effect: a push to `main` reaches the root only after `node tools/deploy-next.mjs` runs. To revert: `gh api -X PUT repos/laserpirate/shanshui-av/pages -f "source[branch]=main" -f "source[path]=/"`.
2. **Commit history on `main` carries a personal email** as the author on older commits (files are clean). Rewriting it needs a force push. Owner's call, skipped.
3. **Promote `/next/` to root.** Owner's call, not done.
4. **"No frame over 25 ms at CPU 4x".** The v0.3.0 show build does not meet it either; the throttle stalls the main thread in slices. Default: report the measured counts, keep the p95 (16.8 ms) as the working number, and keep reducing per-frame work in P4 (quality ladder). Say if you want a different measure.
5. **Publishing the design pack** (landform sequence) for the morph in P2. Owner's call. Default: the morph runs only where the local pack is present; the preview shows the one-line "not loaded" fact.

## Also found
- The USGS gauge in Nashua (01096508) is the **Merrimack** at Nashua, not the Nashua River, and has no daily discharge. The Nashua River gauge is USGS 01096500 at East Pepperell, MA (daily discharge since 1935-10-01; 1936-03-20 daily mean 19,400 ft³/s, 549 m³/s). P5 uses it as a declared upstream proxy.
- No `feat/midi` branch exists, locally or on origin: handoff 4 was never built. It is in P4.

## Next: P2 (modes, morph, live section, slit-scan)
Modes from the layer lists (nature, built, design, sections) with each element tagged by layer and filtered in the raster worker (no reload); the existing-to-design morph with the two labels verbatim; the live section inset at the playhead; GPU slit-scan and time-smear (strip, smear, time displacement) from the scroll itself and dropped video. Tag `.p2`.
