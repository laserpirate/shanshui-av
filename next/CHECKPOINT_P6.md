# CHECKPOINT P6 · ADDENDUM-A, a close reading of the reach · 2026-11-11

Live preview: **https://laserpirate.github.io/shanshui-av/next/?world=nashua**
Tag: `shanshui-av-v0.4.0-nashua.p6` on `feat/nashua` (the commit that adds this file). Root of the site: byte-identical to `main` 1f009a1 (checked live, see the last table).
Review sheet: `docs/nashua/index.md`, section "P6 strips: before and after" (made by `tools/nashua/review-p6.mjs`).
Structures checklist: `docs/nashua/structures.md`. Judgment calls and questions: `DECISIONS.md`, section "Nashua P6".

**One test fails, and is left failing on purpose: `a6-pack-holds`.** The terrain pack was rebuilt at 1 m stations because its rule failed at 2 m. At 1 m the near bank (the ground drawn as ground) passes with a worst of 0.029 against a limit of 0.05. The farthest band (300 to 700 m behind the water) still has 7 points of 2457 over the limit, worst 0.058. That band is partly sampled from the 4 m wide DEM, so finer stations cannot sharpen it. The limit was not loosened. Details under A6.

## What changed (in the addendum's order)

**A1, the hills are gone.**
- No filled background terrain: no far ridges, no far bands, no mist.
- One thin ridgeline of the real ground (the highest of the pack's bands 1 to 3), a line with no fill.
- The near bank stays as ground. Rises appear only where the real ground rises.
- The buildings are the skyline, in rows by distance, near dark and far pale. Each stands on a thin ground line.
- No stock mountain, pavilion, tower or pine. Trees on the bank only.
- `ends` defaults to `pingpong`; `handover` stays.

**A6, the scale.**
- 8 world px per m (was 2), live 2 to 12: the Scale slider, `?hx=`, a MIDI role.
- Vertical Exaggeration 2x (was 10), range 1 to 20, always on the fact line, which also states 100 m in px.
- The packs (Nashua, Merrimack, the local design pack) were rebuilt at a 1 m station step (was 2 m).
- `?ticks=1` now steps 25 m with a label every 100 m at 6 px per m and up.

**A2, more of what is there.**
- We stand on the south bank looking north. The north bank is the default view (the left bank), downstream to the right.
- Every footprint within 400 m of the north bank between the dam and the confluence is drawn: **45 of 45**. None left out.
- The mill massing: one footprint (structures layer id 6000042, Light industrial), 529 m along the reach, s 342 to 871.
- The church behind the parking lot: structures layer id 24170, Religious, s 1110, 97 m from the water edge.
- The Jackson Mills dam at s 0.
- The dike NH03813 (Nashua Flood Control Levee, 4.6 m) is a point in the national inventory on the right bank, 115 m past the end of the Nashua route. It is drawn as a levee section at the end of each reach and marked approximate. Its line is not in the data.
- Names: none guessed. Buildings are labelled by kind and id from the structures layer; questions are logged in DECISIONS.
- Heights: no lidar first-return surface exists in the Episode 2 GIS outputs, so heights stay estimated and the fact line says so.

**A4, the map inset.**
- The route in plan, north up, the stations S1 to S6, the bridges, the dam, the dike, and a dot at the playhead.
- Click a station (or the route) to go there.
- Key `I`, the Map button on the bar and in the Reach panel; "Map on output" is separate and off by default.
- Sizes 240, 400 (default) and 600 px; text 18 px at the default size.
- Drawn from the public pack only.

**A3, labels.**
- "Labels here" and "Labels on output" buttons in the Reach panel and on the bar; key `L` for here.
- MIDI roles: labels, output labels, map inset, horizontal scale.
- Text is names and ids from the data only.

**A5, the pair.**
- **Open pair**: two `wall=2x1` windows, columns 0 and 1.
- **Copy pair links**: two clock-mode links with one shared `t0`, 10 s ahead.
- WALL.md starts with "Two screens as one long picture": two windows, clock mode, relay.

## Measured (one machine, RTX 3080, headed Chromium)

| check | rule | result |
| --- | --- | --- |
| A1 no filled terrain above the bank, 1280 x 720, labels off, 8 stations per reach | a station fails when more than 3 % of its columns have more than 8 px off the paper above the bank line; the rule must catch a planted fill and the `.p5` tag | planted fill caught 8 of 8; `.p5` fails 8 of 8 (shares 0.75 to 1.00); P6 passes every station: worst 2.7 % (Nashua s 1076), 2.0 % (Merrimack s 2191). The margin is small and the rule was not retuned |
| A6 defaults and live change | 8 px per m, 2x, pingpong; the centre stays put | as stated; centre s 900 before and after a change to 4 px per m; `?hx=99` clamps to 12 |
| A6 the pack holds at 8 px per m | worst slope change between neighbouring stations under 0.05, per band; control (band0 in 0.5 m steps) must exceed it | **FAIL**: band0 0.029 (L), 0.020 (R); band1 0.028, 0.022; band2 0.048, 0.037; band3 **0.058** (L), 0.047 (R); control 1.0. At 2 m the bank itself failed (0.059), hence the 1 m rebuild. Merrimack: band0_L 0.0495, just under. The ridgeline corners (0.47) are reported, not held to the limit: they are where two bands cross |
| A2 structures | every footprint in range drawn; mill, church, dike, dam present and labelled | 45 of 45; frames with and without the buildings differ by 15.7 % (mill) and 1.1 % (church); the labels read "Religious (structures layer 24170)", "Light industrial (...)", "Nashua Flood Control Levee (NID NH03813)" |
| A3 label toggles | each button toggles its own target; 44 px buttons, 18 px text | controller and output toggles independent; every new button 48 px high, 18 px text; the four MIDI roles (labels, output labels, map, scale) are Learn targets, and each one, fired as a binding fires it, changed its state (scale to 12 px per m at full) |
| A4 map inset | off by default; dot on its station; click goes there; static plan not redrawn while scrolling | dot error 0 and 0.02 px; a click on S4 went to s 1635; 0 redraws while scrolling; 240, 400, 600 px; built in 0.6 ms |
| A5 seam, 2 x 1 against one canvas twice as wide | the columns either side of the seam are the reference's | 0 differing columns on both sides (an unrelated frame differs by 8.6) |
| A5 clock drift, 10 min, two clock-mode windows | | **0 world px** in 60 samples. Read with care: two windows on one machine share one clock. Two machines add whatever their clocks disagree by (keep both on NTP) |
| wall drift through the relay, 10 min, 3 x 1 | within one frame | worst 0.36 px, 0.28 frames |
| bench, nashua at the heaviest weather, 8 px per m | 60 fps | 60 fps at 1080p and 4K, 60 with the CPU slowed 4x; p95 16.8 ms; 0 frames over 25 ms |
| bench at 2 px per m | | the same: 60, 60, 60 fps; 0 frames over 25 ms |
| soak 30 min, nashua heavy (1936 level, night, downpour), pingpong, slit-scan modes every 5 min, ticks, hydro | fps min 45, flat heap | fps min **59.8** (output 59.8), heap +0.18 MB (output +0.11), 0 dips, 0 console problems, 0 reloads, no context loss, 16 reseeds, 25 palettes. The tool's own verdict is `pass: false` on two of its limits: DOM nodes 732 to 806 (+74 against 60, the same bounded lists that flagged +73 in P5), and tiles 54 against 40. The tile count is bounded by design: a finite reach keeps all its tiles resident while they fit in 96 MB, and at 8 px per m the reach is four times longer (median 41 tiles, 22 in P5). The tool's limits were not changed |
| the other suites | all pass | nashua 10/10, p5 10/10, e2e 24/24 (old worlds byte-identical to the last tag), midi 9/9, wall 8/8 |
| p6 suite | | 8 of 9 (a6-pack-holds above) |

## Bugs found by the P6 tests
- A click on the map inset never arrived: the stage captured every left press for drag-scrub. Fixed. My screenshot check of the inset had not clicked it.
- Old tests that assumed 2 px per m, 10x or the hill bands were moved to the new scale. Each change is listed in DECISIONS. The bands test was retired and replaced by a building-rows test with a control.

## Owner's call (3 questions, each with the default taken)
- Names for the church (id 24170), the second Religious footprint (id 25063) and the mill (id 6000042). The data has none. **Default:** labelled by kind and id ("Religious (structures layer 24170)").
- A line for the dike NH03813 (a drawing or a GIS layer). The inventory has a point only. **Default:** a levee section at the end of each reach, marked approximate.
- Far footprints are placed at their nearest point on the route, so at the convex bends several stack at one s (9 at s 1847, 8 at s 1418). Projecting them north, along the view, would spread them. **Default:** left as placed; it is the first candidate for the loop.

## Unverified on real hardware
A projector, two real screens side by side (the pair was tested as two windows of one Chromium), two machines in clock mode (their clock offset is not measured here), the nanoKONTROL (the P6 roles were fired in software, never from the device), a Pi, a Mac. Every number above is from one Windows machine with an RTX 3080.

## Where everything landed
| what | local | GitHub | Pages | chat only |
| --- | --- | --- | --- | --- |
| code, tests, tools | `C:\_av\shanshui-av-nashua` | `feat/nashua`, tag `.p6` | `/next/` | |
| public packs (Nashua, Merrimack, 1 m) and coverage.json | `data/nashua/` | yes | `/next/data/nashua/` | |
| design pack (1 m) | `data/local/nashua/design` | no (unpublished, A7) | no | |
| review strips and the map frame | `docs/nashua/` | yes | `/next/docs/nashua/` | |
| structures checklist | `docs/nashua/structures.md` | yes | yes | |
| CHECKPOINT_P6, MORNING | repo root | yes | | copied to `_handoffs\nashua\` |
| test results, soak and bench JSON | `test-results/` | no (ignored) | no | numbers in this file |
| the `.p5` reference | worktree `C:\_av\shanshui-av-p5ref` (port 8098) | tag `.p5` | | |

Gate grep on the built preview (`next/` of pages-preview): 0 hits in text files. Two older JPEGs (a P1 strip and a derelict review frame) match one of the gate's short patterns by chance (three bytes) inside their compressed image data; no metadata.

## Next (the section 9 loop)
1. The 12 h gate: the derelict heavy soak (started after the tag), the e2e suite on `/next/`, sections 1 and 3 re-read (done).
2. Spread the stacked far footprints along the view direction, behind a flag, with a count of stacks before and after.
3. The farthest band at 8 px per m (the one failing test): smooth band 3 over its 4 m source cells, or draw the ridge from bands 1 and 2 only; measure both against the frozen rule, do not move the rule.

## Settled (ADDENDUM-A A7, not asked again)
The design pack stays unpublished. /next/ is not promoted. Pages serves from `pages-preview`. No history rewrite or force push. The Merrimack keeps levels carried from the confluence. No wss relay. The rc1 tag is held. The 25 ms measure is reported, not chased.

## Site
| check | result |
| --- | --- |
| deploy /next/ | pages-preview dfe1083: root = main 1f009a1, next/ = a7988f9 (the `.p6` tag); Pages build "built" |
| root byte identity (`deploy-next.mjs --check-live`) | 134 of 134 files byte-identical to main 1f009a1 |
| crawl /next/ | 5 pages, 58 requests, 45 linked files, 0 broken, 0 console errors; the live Nashua pack hash 6f84a65ea6634724 (the 1 m rebuild) |
| p6 tests against the live /next/ | a6-scale, a3-labels, a4-map: 3 of 3 pass |

This file's site rows were filled after the tag, in the commit that follows it.
