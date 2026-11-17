# CHECKPOINT P2 · modes, design, slit-scan · 2026-11-11

Live preview: **https://laserpirate.github.io/shanshui-av/next/?world=nashua**
(the stock app is unchanged at https://laserpirate.github.io/shanshui-av/)
Tag: `shanshui-av-v0.4.0-nashua.p2` on `feat/nashua` (the commit that adds this file; code as at e6b9b68). Root of the site: byte-identical to `main` 1f009a1 (checked live, 134 of 134 files).

This tag also carries first versions of the wall, the quality ladder, baked tiles, offline, launchers, MIDI and the time scroll: they were written alongside P2. They are **not** closed here. A re-read of the handoff found gaps in them (listed under Next), and P3 and P4 get their own tags.

## What works
- **Modes**, no reload: nature, built (default), design, sections. M cycles, X toggles sections, `?mode=`. Each element is tagged by layer and filtered when tiles redraw. Water is drawn by the shader, so it is in every mode.
- **Existing to design morph**: one fader, terrain and water edge together, in 5% steps, labelled exactly `Existing Grade (before landform)` and `Landform Sequence (after landform)`. The design pack stays local; without it, one fact line says it is not loaded. On the public preview the fader therefore does nothing but show that line.
- **Live section**: a line at the playhead and an inset of the true cross-section at that `s`, both banks, named levels dotted, shown level solid, estimated bed dashed, same exaggeration rule.
- **Slit-scan on the GPU** (V cycles, FX panel): strip, smear, time displacement. Controls: slit position, width, direction, history depth, mix, freeze, slope. Sources: the scroll itself, a dropped video file or one listed in `media\`, a camera in the controller only (the output never asks for one). Labels and the section inset rest while an FX mode is on, because they would float over a picture that no longer matches the scroll.
- **MIDI roles** for level, exaggeration, bank, morph and every slit control (full table in the README).

## Measured
| check | target | result |
| --- | --- | --- |
| `built` mode against P1 | identical | identical tile for tile (10 tiles); nashua hash 2cd2b856 unchanged |
| mode switch | no reload | 4 tiles redrawn, hidden layers correct |
| morph | both ends differ, labels verbatim | mean difference 2.48, labels exact; missing pack leaves the hash unchanged and shows the fact line |
| FX at 1080p, RTX 3080 | 60 fps | strip 60.0, smear 60.0, displace 60.2 |
| FX freeze | picture holds | strip and displace 0 difference; smear 8.7, because its left of the slit stays live by design |
| FX video source, FX on the output | works | both pass |
| soak, 30 min, heaviest weather, FX modes cycling every 5 min, output 1920x1080 | fps min ≥ 50, flat heap | **met**: fps min 59.5 (output 59.5), avg 60, heap +0.12 MB (output +0.07), 0 dips, 0 console problems, no context loss; 16 seeds, 25 palettes. The soak tool still reports `pass: false` on its own DOM rule (+73 nodes, rule < 60): the same seed history (cap 20 rows) and log (cap 120 rows) as P1, bounded, not a leak. |
| old worlds | 0 bytes | shanshui and derelict against v0.3.0: **0 bytes** |
| e2e, unchanged 24 | 24/24 | local **24/24**; on /next/ **24/24**, 0 console problems |
| nashua 9, P2 8 | all | **9/9, 8/8**, 0 console problems |
| other suites on this build | | wall 5/5, relay 7/7, MIDI 9/9, P4 3/3, P5 3/3 |
| gate | 0 hits | 0 hits |
| live crawl /next/ | 0 broken | **0 broken**, 0 console errors (5 pages headed on the GPU, 54 requests, 31 linked files) |

## Not verified on real hardware
- No projector, no wall, no Pi, no Mac. Only this Windows machine (RTX 3080, headed Chromium, ANGLE D3D11).
- MIDI is tested with synthetic messages only. The nanoKONTROL presets are from the factory layout and are marked "verify with the wizard".
- The camera source has not been run against a real camera.

## Where everything landed
| what | local | GitHub | Pages |
| --- | --- | --- | --- |
| code, tests, tools | `C:\_av\shanshui-av-nashua` (`feat/nashua`) | `feat/nashua` (pushed) | `/next/` |
| 20 s captures, one per mode (7 WebM, 1280x720) | `C:\_av\captures\p2\` | **no** | **no** |
| design pack | `data\local\nashua\design\` (gitignored) | **no** | **no** |
| CHECKPOINT, MORNING | repo and `_handoffs\nashua\` | yes | |

## Open questions (default taken; nothing waits on you)
1. **Publishing the design pack** so the morph works on the preview. Owner's call. Default: local only.
2. The P1 questions still stand: the Pages source (`pages-preview`), the personal email on older commits on `main`, promoting `/next/`, and the 25 ms measure.

## Next: P3 and P4
Found on re-reading the handoff, being closed before their tags:
- P3: fall back when the relay drops (it only reconnected), a drift number on the calibration card, a 3 x 1 seam test against one canvas, drift over 10 min, a relay killed mid-run.
- P4: the ladder's rule was 4 s under 50 fps where the handoff says 5 s under 24 fps, and it had no start tier from the GPU string; the baked target (30 fps, 720p, CPU 6x) was never measured.
