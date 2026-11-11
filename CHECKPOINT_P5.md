# CHECKPOINT P5 · the open loop · 2026-11-11

Live preview: **https://laserpirate.github.io/shanshui-av/next/?world=nashua**
Tag: `shanshui-av-v0.4.0-nashua.p5` on `feat/nashua` (the commit that adds this file). Root of the site: byte-identical to `main` 1f009a1 (checked live, 134 of 134 files).
Review sheet: `docs/nashua/index.md`, section "P5 strips" (nine strips and one panel, made by `tools/nashua/review-p5.mjs`).

## What works (handoff section 9, in its order)
1. **Time scroll** (from P1): `?t=YYYY-MM-DD` sets the level from the East Pepperell daily record, an upstream proxy, and says so.
2. **Night river**:
   - `?daycycle=1&hour=HH`: the light follows the sun at the reach (NOAA formula, local standard time).
   - The Reach panel has a 1 day/min rate; above 0.1 day/s the hour is held, and the fact line says so.
   - At night: lights by building occupancy, bridge lamps and their reflections in the water.
3. **Tag stream for the score**, on this branch only (score-v01 is not touched or merged):
   - `?tags=1` posts one event per feature crossed and per level change on a BroadcastChannel and a DOM event, plus a scene snapshot at 10 Hz.
   - Format: `docs/nashua/score-tags.md`.
4. **Print at stated scales**:
   - Export panel, To scale: Arch D (36 x 24 in) or a 36 in roll, at 1:500, 1:1000 or 1:2000, never fitted.
   - Arch D crops to the sheet; the roll stops at 200 in.
   - The window printed (s from, s to, the scale) is logged and goes into the file name.
5. **A second reach**:
   - `?reach=merrimack` (or the Reach panel: Nashua / Merrimack) is 5008 m of the Merrimack below the confluence.
   - Built by `tools/nashua/build-reach.py` from the same DEM, land cover and footprints.
   - Has 86 buildings. No dam, lot, stations, outfalls or bridges inside it.
   - The bed is the estimated proxy only. The levels are the Nashua's carried unchanged, and the fact line says `levels carried from the confluence`.
   - The Nashua pack is unchanged (2cd2b856).
6. **Three ideas of my own**, each behind a flag:
   - `?hydro=1`: a hydrograph under the fact line while the time scroll is on.
     - Shows a year either side of the scroll's day, on a log axis fixed to the whole record.
     - The record median and the 1936 maximum are drawn as rules.
     - Redrawn when the day changes, never per frame.
   - `?ticks=1`: a distance rule along the bottom, a tick every 100 m and a label every 500 m, on the controller or any output.
   - `&cap=0.1..1` on an output: a brightness ceiling.
     - Applied through the existing master dim and shown on the calibration card.
     - Not capped: labels and a local video slit source.
     - Use: a projector too bright for a dark room, or two projectors that do not match.

## Measured (one machine, RTX 3080, headed Chromium)
| check | target | result |
| --- | --- | --- |
| day cycle | night dark, noon lit | light 0.02 at 02:00, 1.0 at 12:00; 590 lit px at night against 13776 at noon (UI hidden); 1.23 hours in 3 s at 1 day/min |
| tag stream, one pass | one event per feature | 8 events for 8 features (outfall, rail bridge, bridge, CSO), 4 level events, 58 scene posts |
| print scale | exact | SVG scale 1.41732 (72 / 0.0254 / 1000 / 2, exact); roll at 1:500 is 194.6 in, PDF MediaBox 14011.65 x 2592 pt; Arch D at 1:500 crops and says so |
| second reach | draws, loads its own pack | pack cec345b089d01283, 5008 m, 86 buildings; ground on 0.959 of the bank band; back to the Nashua gives 2cd2b856 again |
| hydrograph | cursor on the day, cheap | cursor at 240 of 480 px, the 1936 peak at 241; redraw **1.3 to 1.8 ms**, 0 redraws in 1.5 s without a day change |
| distance rule | 100 m at the stated scale | worst gap error **0.44 px** against the fact line's 206 px per 100 m; s at the centre 811.34 m against 811.3 m |
| output cap 0.6 | every pixel x 0.6, no fps cost | mean ratio **0.6004**, brightest 237 to 142, 0.65 % of channels off the line by more than 2 (the water moves between shots); fps 59 / 60 |
| p5 suite on /next/ | 10/10 | **10/10** |
| e2e, nashua, wall (1 min drift) on localhost | all | 24/24, 9/9, 8/8 |
| live crawl /next/ | 0 broken | **0 broken**, 0 console errors (5 pages, 57 requests, 40 linked files) |
| soak 30 min, Merrimack, 1936 level, slit-scan modes every 5 min, `ticks`, `hydro`, day cycle | fps min ≥ 45, flat heap | fps min **59.4** (output 59.8), heap -0.66 MB, 0 dips, 0 console problems, 16 reseeds, 25 palettes, x up to 8683 (past the Nashua's 4918, so the Merrimack was drawn). The tool's DOM rule flags +73 nodes, the same bounded lists as P1 to P4 |

## Found on the way
- **A test that passed a blank picture.** My first Merrimack rebuild put a `#` comment in the middle of a line of `build-reach.py`. It commented out `station_step_m`, so every terrain path was NaN: buildings over bare paper. The test passed anyway, because it only checked the picture was not uniform. The test now requires a finite step and ground on the banks.
- **Times guessed in DECISIONS.** Two rows had times guessed as 02:30 and 02:31; `date` gave 02:28. Corrected in place, with a note.

## Not verified on real hardware
- A printed sheet. The scale is checked in the file (SVG transform, PDF MediaBox), not on paper; print one Arch D at 1:1000 and measure the 100 m bar.
- A projector with `&cap=`.
- The score listening to the tag stream: score-v01 is not merged here, and the stream was read by a test page only.

## Open questions (default taken)
1. **The Merrimack levels** are the Nashua's, carried. A Merrimack gauge (Lowell) would give its own; default: carried, and said so on the fact line.
2. The P1 to P4 questions stand.
