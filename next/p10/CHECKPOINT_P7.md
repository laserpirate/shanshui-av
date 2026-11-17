# CHECKPOINT P7 · ADDENDUM-B, the interface, the mouth, landmarks and runoff · 2026-11-11

Live preview: **https://laserpirate.github.io/shanshui-av/next/?world=nashua**
Tag: `shanshui-av-v0.4.0-nashua.p7` on `feat/nashua` (the commit that adds this file). Root of the site: byte-identical to `main` 1f009a1 (checked live, see the last table).
Review sheet: `docs/nashua/index.md`, section "P7 frames (ADDENDUM-B)" (made by `tools/nashua/review-p7.mjs`).
Structures and glyphs: `docs/nashua/structures.md`, table "Landmarks drawn as glyphs". Judgment calls: `DECISIONS.md`, section "Nashua P7".

**Manual check for you (B7):** the before and after frames at the mouth, both banks, on the review sheet. Does the confluence read as two rivers meeting?

## What changed (in the addendum's order of work)

**B3, Rain on the bar.** One press: on holds the rain at 0.85, off holds it at 0. Key `N`, MIDI role "Rain on / off". Shown in the weather worlds (derelict, nashua).

**B4, Flood on the bar.** Off is Median Water; on is the last picked level (default Minor Flood). The picker beside it: MHW, Minor, FEMA 1 %, 1936; the fact line names the level in full. MIDI role "Flood on / off".

**B1, the map floats.** Over everything, the header and the bar included. Drag it by its grip (✥) or its edge; it stays where it was left, per instance. `I`, the Map button and the three sizes as before. A station click still goes there; a drag on the map never scrubs the scroll.

**B2, a shorter bar.** At 1280 px: 2 rows, 110 px (was 3 rows, 166 px). At 1024: 3 rows (was 5). No horizontal overflow; no text under 18 px, no button under 44 px. Seed, Look, Export, Log, About and Keys moved under **More**; Open pair and Copy pair links under **Pair**; the seed and palette arrows show from 1440 px wide (the keys do the same).

**B5, the menu cycle.** The Full button cycles full menu, mini menu (Play, Speed, World, Guide, Labels, Map), full screen (true full screen with the mini menu, hidden after 3 s, back on mouse move). Its label names the next state. `F` still goes straight to full screen. Kept per instance.

**B6, the Guide.** On the bar and in the mini menu. One screen: keys, the bar's buttons, every URL parameter, how to open a pair, and a README link. Built from the app's own tables; a test fails if the code reads a URL parameter the guide does not list.

**B8, landmarks as glyphs**, schematic, at the surveyed position:
- Dam: a wide body, the crest gate, the spillway face with falling water, the headpond above the tailwater.
- Levee (approximate): a trapezoid with a flat crest (the Merrimack reach, right bank).
- Church: a nave, a steeple, a cross.
- Factory: the 529 m mill with a sawtooth roof and a smokestack. **The stack is not in the data (flagged).**
- CSO #9, CSO #6: pipe mouths in a headwall.
- Bridges: bolder decks and piers. A car on Canal St, a boxcar on each rail bridge (a train glyph is cheap).
- Labels are your words; the source's names and ids are in the tooltip and structures.md only.

**B9, runoff.** Flow from CSO #9 and CSO #6 and sheet runoff from the lot: a jet or streaks down the bank and a plume drifting downstream. Drawn in the shader, so no tile is drawn again and the output, the wall and exports show it. Off when dry, running in rain, stronger at the flood levels. "Runoff (with rain)" in the Reach panel, on by default.

**B7, the mouth.** The Nashua scroll ends at the confluence: S6 is gone from the default reach, the map and the labels. The section line stops at the mouth; past it the Merrimack runs to the horizon in forced perspective, two banks converging on the water line, water between, the same ink. The fact line says "forced perspective, not to scale" once while it is in view. `?reach=merrimack` is unchanged.

**B10** (done before this phase, in the loop): spread is the default (stacks 52 to 29, none across the water), the ridgeline from bands 1 and 2, the dike approximate.

## Measured (one machine, RTX 3080, headed Chromium)

| check | rule (each must fail first on a planted wrong picture) | result |
| --- | --- | --- |
| B1 map | on top where it overlaps the header and the bar; a drag on it moves the scroll 0; kept after a reload | on top over both; the same rule fails on the map at z-index -1; scroll moved 0 px (the same drag on the stage moved 233 px); a click on S4 went to s 1635; position kept to the pixel, not shared with another instance |
| B2 bar | no overflow; at most 2 rows at 1280, 3 at 1024; no text under 18 px, no button under 44 px; all three worlds | 2 rows 110 px at 1280, 3 rows 166 px at 1024, every world; a planted 1400 px, 12 px button fails both rules |
| B3 rain | rain changes over 0.5 % of the frame | 7.5 % (two dry frames: 0.19 %, which fails the rule) |
| B4 flood | Minor Flood changes over 1 % of the frame | 2.3 % (two Median frames: 0.20 %) |
| B4 water above Median, Vertical Exaggeration 2x, css px | report; under about 10 px goes here | default 8 px per m: MHW **11.4**, Minor 61.0, FEMA 1 % 94.2, 1936 167.6. At 2 px per m: MHW **2.9**, Minor 15.3, FEMA 23.6, 1936 41.9 |
| B5 menu | labels name the next state; mini shows exactly its 9 controls; hidden after 3 s in full screen; back on a mouse move; F leaves the state alone; kept | as stated; the full menu fails the mini rule |
| B6 guide | every URL parameter read in the code is in the guide, none stale; fits one screen; every key and bar control shown | 40 read, 40 listed; a planted source with 3 new reads is caught |
| B7 mouth | past the mouth the ground top falls steadily from more than 40 px above the water line to within 14 px of it at the vanishing point | left bank 109 to 8 px, right bank 135 to 10 px; the `.p6` frame fails (it runs on flat, 119 to 306) |
| B8 labels and glyphs | no id on the picture; the owner's words present; ids in the tooltip; ink in the church tower above the old box | 0 ids (the lot label is a question below); the `.p6` labels have 4 with ids; tower ink 0.91 (`.p6`: 0.002) |
| B9 runoff | mean colour change in the water under the lot over 12 (averaged over 4 frames) | 58.1 (runoff off twice: 4.6); amounts dry 0, rain 1.0, 1936 1.74, toggle off 0; tiles drawn again: 0 |
| bench, nashua at the heaviest weather (1936, downpour, night, fog 0.8) | 60 fps | 1080p 60.0 fps (p95 16.7 ms, 0 frames over 25 ms); 4K 60.0 (p95 16.8); 1080p with the CPU slowed 4x 59.6 (3 over 25 ms) |
| soak 30 min, nashua heavy, an output window at 1080p, FX every 5 min | fps min 45, flat heap | 60 samples over 30.1 min: fps min 59.8 (output 59.6); heap 3.75 to 3.99 MB (max 4.98), output 3.01 to 3.17 MB; output DOM 23 throughout; controller DOM 629 to 698 (the Log panel, capped at 200 entries, as in the P6 soak); 0 errors, 0 watchdog events. The JSON was not written (a wrong `--out` path); the numbers are from the log's samples |
| c1 clock-mode turn (found here, see below) | a node started an hour ago shows a camera inside the reach; fails on `.p6` | x 8292 of 17270; the `.p6` output: 216059 |
| the other suites | all pass unchanged | e2e 24/24, midi 9/9, wall 8/8 (after the clock fix), nashua 10/10, p5 10/10, p6 10/10, p7 10/10; console clean |

## Found on the way
- **Clock mode never turned at the nashua reach ends (since `.p6`).** The output looked up its world by a key without the hx, ve and spread that `.p6` added, found nothing, and took the reach as 0, so a node of the Copy pair links ran on past the end into blank paper after about 5 min. Fixed in `src/output.js` (the key the clock state used); test `c1-clock-turns` fails on `.p6` first. The fix came after the soak; the soak drives the output from the controller, not the clock, so it does not run this path. The Open pair windows (driven by the controller) were not affected.
- p6 `a1-no-hills` samples eighths of the reach. The shorter reach moved its stations, and one landed on s 944, where the frozen rule fails (4.1 % of columns against 3 %). The frame there is identical on the `.p6` state. The stations are back at P6's positions (the one past the mouth skipped) and the rule was not moved. Next loop item.
- Five p6 tests followed P7 changes (the owner's label words, the Pair menu, S5 as the last station); each change is marked in the test.
- A floated map reloaded 6 px off its saved spot when it sat at the bottom edge (a clamp made while hidden overwrote the saved spot). Fixed.

## Owner's call (3 questions, each with the default taken)
- **The bus.** B7 takes Bridge St out of the default reach and the Merrimack reach has no bridges, so only Canal St is left. **Default:** a car on Canal St, no bus. Alternative: the bus on Canal St.
- **The smokestack** on the factory is not in the data. **Default:** drawn, as B8 asked.
- **The lot label** still reads "parking lot (90 Canal St, NRPC parcel 41-78)" (a parcel id on the picture, from P2). **Default:** unchanged. Alternative: "parking lot", the parcel in the tooltip.

## Unverified on real hardware
A projector, two real screens (the pair as two windows of one Chromium), two machines in clock mode, the nanoKONTROL (Rain and Flood roles fired in software only), touch dragging of the map, a Pi, a Mac. Every number above is from one Windows machine with an RTX 3080.

## Where everything landed
| what | local | GitHub | Pages | chat only |
| --- | --- | --- | --- | --- |
| code, tests, tools | `C:\_av\shanshui-av-nashua` | `feat/nashua`, tag `.p7` | `/next/` | |
| review frames (17) | `docs/nashua/p7_*.jpg` | yes | `/next/docs/nashua/` | |
| structures and glyph log | `docs/nashua/structures.md` | yes | yes | |
| CHECKPOINT_P7, MORNING | repo root | yes | | copied to `_handoffs\nashua\` |
| test results, soak and bench JSON | `test-results/` | no (ignored) | no | numbers in this file |
| the `.p6` reference | worktree `C:\_av\shanshui-av-p6ref` (port 8099) | commit 1c5c9a1 | | |
| design pack | `data/local/nashua/design` | no (unpublished) | no | |

## Next
1. Phase 8, B11: the mirror on `feat/mirror`, behind `?mirror=1` and a Mirror button, tag `.p8`.
2. The A1 station at s 944 (above).
3. The 12 h gate at about 23:00.

## Site
| check | result |
| --- | --- |
| deploy /next/ | pages-preview a098be0 (root = main 1f009a1, next/ = e6ceeb0), Pages built a098be0; the P7 code served (the clock fix and the mouth found in the live files) |
| the root, live | 134/134 files byte-identical to main 1f009a1 |
| crawl /next/ | 5 pages, 59 requests, 62 linked files, 0 broken, 0 console errors; all three worlds drew |
| e2e on /next/ | 24/24, console clean |
