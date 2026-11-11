# CHECKPOINT P8 · ADDENDUM-B B11, the mirror · 2026-11-11

Live preview: **https://laserpirate.github.io/shanshui-av/next/?world=nashua&mirror=1&mon=1** (the Mirror button shows with `?mirror=1`; `&mon=1` turns it on).
Tag: `shanshui-av-v0.4.0-nashua.p8` on `feat/nashua` (the commit that adds this file). Built on `feat/mirror`, cut from `feat/nashua` at `.p7`, merged back as a fast-forward after every suite passed with the flag off. Root of the site: byte-identical to `main` 1f009a1 (checked live, last table).
Review strips: `docs/nashua/index.md`, section "P8 strips" (made by `tools/nashua/review-p8.mjs`). Judgment calls: `DECISIONS.md`, section "Nashua P8".

**Look at the strips first (Owner's call below):** while the mirror is on, the view zooms out so the water line meets the middle of the screen.

## What it does
A second world drawn upside down below the water line, meeting the first at the water. Not a reflection: a different world, drawn through the crossfade path (the engine's second world), clipped below the axis and blended at its strength.
- **The lower half (alternate):** Other is, for nashua, the other bank (the north bank above, the south bank turned below so each column is the same station); for shanshui and derelict, the next seed. Or any world by name: shanshui, derelict, nashua.
- **Axis:** 0 to 80 css px below the water line (nashua Median Water; derelict the weather's water; shanshui the foot of the scroll, it has no water).
- **Strength:** the lower world's ink, 0 to 1 (default 0.85).
- **Its scroll:** with the upper world, against it, or free on its own clock at half the speed.
- **On / off.** Each control has a MIDI role: Mirror on / off, Mirror axis, Mirror strength, Mirror scroll, Mirror lower half. The Mirror panel opens from the bar.
- **Everywhere:** the output window and an Open pair take it from the frame state; Copy pair links carry `mon`, `maxis`, `mstr`, `mscroll`, `malt`, so a clock-mode wall node draws it from its URL.
- Without `?mirror=1` nothing of this exists: no button, no roles, no frame state, the `.p7` frame.

## Measured (one machine, RTX 3080, headed Chromium)

| check | rule (each must fail first on a planted wrong picture) | result |
| --- | --- | --- |
| flag off, 0 bytes different from `.p7` | SHA-256 of the whole RGBA frame at a fixed time equals the `.p7` server's; control: two frames on one server equal; planted: the mirror on | equal on shanshui, derelict and nashua, dry and in heavy weather (6 of 6), also with `?mirror=1` and the mirror off; the planted frame differs |
| the flip | the lower half equals the other bank's own frame turned upside down and left to right, pixel for pixel | 0 pixels of 360 rows off; turned only upside down (planted): 21 % off |
| the axis | the first row where two frames with different lower worlds part is the water line plus the axis (within 2 px) | axis 0: row 360, water line 360; axis 80: row 360, water line 280; the axis-0 frame fails the axis-80 rule |
| controls and MIDI | the panel and each role change the state and the frame state; the pair links carry it; without the flag none of it | all 5 roles, the seg buttons, links with `mirror=1&mon=1&maxis=80&mstr=0.5&mscroll=free&malt=derelict`; flag off: no button, no roles, no state |
| scroll | with: the lower picture moves as the upper (-400 for -400); against: the other way (+400); free: moves with the upper paused; against on an endless world has its ground; nashua below an endless world stays in its reach | -400, +400, 60 px/s; coverage 1.0 (the first build's camera at 100000 - x: 0, planted); nashua below: against 11633 and free 656 of 17270 |
| output, pair, wall | lower world changed: below the axis over 5 % changes, above it no more than two same frames plus 0.5 %; planted: two same frames fail the lower rule, the lower band fails the upper rule | output 50.5 % / 0.54 % (control 0.55 %); pair window 47.5 % / 0.64 % (0.67 %); clock wall node 37.1 % / 0.34 % (0.34 %) |
| 60 fps at 1080p, heaviest weather, mirror on | median of 10 one-second samples at least 58; planted: 25 ms added per frame | nashua 60.0 (min 59.9), derelict 60.0 (60.0), shanshui 60.0 (60.0); planted 39.0. A 12x slower CPU and 4x the resolution both still ran at 60, so neither could be the planted state |
| soak 30 min, nashua heavy, the mirror on (free), an output window, FX every 5 min | fps min 45, mean 58, flat heap | 60 samples over 30.1 min: fps min **59.6** (output 59.7), mean 60.0; heap -0.07 MB (output -0.13); 0 dips, 0 console problems, 0 reloads, no context loss, 0 watchdog events; 16 reseeds, 25 palettes. The tool's own verdict is `pass: false` on the same two fixed limits as in P6: DOM nodes 656 to 725 (+69 against 60: the Log panel, capped at 200 entries) and tiles 97 against 40 (two finite reaches now, the upper and the lower, each keeping its tiles resident while they fit in 96 MB, as designed in P6). The P7 soak's samples cross the same two limits (tiles 41, DOM +69); CHECKPOINT_P7 did not say so. The limits were not changed |
| the other suites, flag off, on `feat/mirror` | all pass unchanged | e2e 24/24, midi 9/9, wall 8/8, nashua 10/10, p5 10/10, p6 10/10, p7 10/10, p8 7/7; console clean |

## Found on the way
- **Against on shanshui showed nothing below the water** in the first build: its camera was at 100000 - x, and shanshui generates rightward from 0 one chunk at a time. Against on an endless world is now drawn turned left to right with its camera running forward, so the picture moves the other way on ground already there. The m5 test now checks the coverage, with the old camera as its planted failure. Seen on the review strip, not by the first test, which checked only the arithmetic.
- The guide's drift test (P7, unchanged) caught four mirror parameters read through a function argument; the code now reads them the way the test can see.
- The output window, compared with the controller, differs by 12 % of pixels: the controller draws at half resolution while an output is open. Reported, not a rule.

## Owner's call (2 questions, each with the default taken)
- **The view while the mirror is on.** At the normal view the water line sits at 86 % of the height (nashua 617 of 720), which left the mirror a strip of 83 rows, and shanshui has no water. **Default:** the view fits the upper world from its top to the axis into the upper half, so both worlds get half the screen and the scroll is drawn at about 0.56 of its size (the tiles are drawn again once when the mirror turns on or off). Alternative: keep the `.p7` view and show only the strip under the water line.
- **Shanshui's water line.** shanshui has no water. **Default:** the foot of the scroll, so the two pictures meet at their bottom edges. Alternative: a line higher up (cutting the foreground).

## Unverified on real hardware
A projector, two real screens, two machines in clock mode with the mirror (one machine, two windows), the nanoKONTROL with the five mirror roles (fired in software only), a Pi, a Mac. Every number above is from one Windows machine with an RTX 3080.

## Where everything landed
| what | local | GitHub | Pages | chat only |
| --- | --- | --- | --- | --- |
| code, tests, tools | `C:\_av\shanshui-av-nashua` | `feat/nashua` and `feat/mirror`, tag `.p8` | `/next/` | |
| the mirror's worktree | `C:\_av\shanshui-av-mirror` (port 8100) | `feat/mirror` (the fork, if a separate repository is wanted later) | | |
| review strips (5) | `docs/nashua/p8_*.jpg` | yes | `/next/docs/nashua/` | |
| CHECKPOINT_P8, MORNING | repo root | yes | | copied to `_handoffs\nashua\` |
| test results, soak JSON | `test-results/` | no (ignored) | no | numbers in this file |
| design pack | `data/local/nashua/design` (linked into the mirror worktree) | no (unpublished) | no | |

## Next
1. The A1 station at s 944 (CHECKPOINT_P7).
2. The 12 h gate at about 23:00.
3. The post-mortem at the close of the build.

## Site
| check | result |
| --- | --- |
| deploy /next/ | SITE |
