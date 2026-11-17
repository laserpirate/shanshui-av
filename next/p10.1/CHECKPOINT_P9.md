# CHECKPOINT P9 · ADDENDUM-C C1, Open windows · 2026-11-16

Live preview: **https://laserpirate.github.io/shanshui-av/next/p9/?world=nashua** (this version, frozen) and **https://laserpirate.github.io/shanshui-av/next/** (the latest).
Tag: `shanshui-av-v0.4.0-nashua.p9` on `feat/nashua` (the commit that adds this file; the code is 912b781). Root of the site: byte-identical to `main` 1f009a1 (Site, below).
Judgment calls: `DECISIONS.md`, section "Nashua P9". From this version on every tag has a GitHub Release and a frozen copy at `/next/p<n>/` (ADDENDUM-D D3).

## What it does
**Pair menu, Open windows** opens the Windows panel:
- **Count** 1 to 6 (default 3) and **Layout**: one row, or a grid where the count allows (4: 2 x 2; 6: 3 x 2).
- **Open windows**: one press opens every window as one `wall=<cols>x<rows>`, each at its column and row. They carry world, seed, reach, the mirror and the pair links' settings, and follow the controller as the pair does. They open tiled over the controller's screen in their place; drag each to its display and press F.
- **Blocked pop-ups:** a window counts as open when it says hello. After 3 s the panel says in one line how many did not open, and **Open the next window** opens one per press.
- **Copy links:** one clock-mode link per window of the layout, with one shared `t0` 10 s ahead.
- **Close all** closes every window opened from here (and no other). No MIDI role, as asked.

## Measured (one machine, RTX 3080, headed Chromium)

| check | rule (each failed first on a planted wrong case) | result |
| --- | --- | --- |
| one press, every window (w1) | each window's URL names its own column and row, and the wall size; planted: two windows at one place | 3 x 1: 3 windows 426 x 240; 2 x 2: 4 windows 640 x 360; 3 x 2: 6; 1 x 1: 1. Layouts offered: 1x1, 2x1, 3x1, 4x1 or 2x2, 5x1, 6x1 or 3x2 |
| seams, 3 x 1 opened from the button (w2) | the columns either side of each seam equal one canvas as wide as the wall (mean difference under 1); control: two unrelated columns differ | both seams 0.00 / 0.00 (unrelated 11.7 and 11.1) |
| seams, 2 x 2 (w3) | the same at both vertical and both horizontal seams | 0.00 at all four (unrelated 5.9, 10.1, 42.1, 42.1) |
| Close all (w4) | every window opened from here closes; a window not opened here stays | 4 of 4 closed; the other one stayed open |
| pop-ups blocked (w5) | Chromium with its pop-up blocker on (Playwright turns it off by default; turned back on for this test) | the first press opened 1 of 3; the line: "2 of 3 windows did not open: the browser blocked pop-ups. Allow pop-ups for this page, or open them one press at a time."; two presses of Open the next window opened the rest: 3 of 3 |
| Copy links (w6) | one link per place, one `t0`, the pair links' parameters | 6 links for 3 x 2, places 0,0 to 2,1, one `t0` |
| drift over 10 min (w7) | four clock-mode windows (2 x 2 from Copy links) against the controller's clock, sampled every 10 s; planted: a node with `t0` 100 ms late must read over 1 px | **0 px** worst over 60 samples in 10 min; the planted node 12 px. The calibration card: `drift 0.0 px (0.00 frames)`. Four windows on one machine share one clock: several machines add their clock offset (WALL.md) |
| soak 30 min, nashua heavy, an output window at 1080p, FX every 5 min | fps min 45, mean 58, heap growth under 8 MB (the tool's own limits) | 60 samples: fps min **59.7** (output 59.7), mean 60.0; heap +0.00 MB (output -0.08); 0 dips, 0 console problems, 0 reloads, no context loss, 0 watchdog events; 16 seeds, 25 palettes. The tool's verdict is `pass: false` on the same two fixed limits as P7 and P8: DOM 673 to 742 (+69 against 60, the Log panel capped at 200 entries) and tiles 55 against 40 (the reach's tiles stay resident while they fit in 96 MB, as designed in P6). Limits not changed |
| soak 30 min, derelict heavy, a new world every 5 min | fps min 50 | 60 samples: fps min **58.9** (output 59.6), mean 60.0; 6 world switches (derelict, nashua, shanshui); 0 dips, 0 console problems, 0 reloads. `pass: false` on DOM (+84, the Log panel), tiles (50, while in nashua) and heap growth (+33 MB against 8). The heap rule compares the last third of the run with the first: the last third was mostly shanshui, whose engine holds 30 to 160 MB of its own while it runs (the samples go 31.9, 88.2, 66.3, 96.2 ... 87.1 MB), and the heap was 6.08 MB at the end, back in derelict, against 5.81 MB at the start. No leak; the rule does not fit a run that ends in a different world. Not changed |
| the other suites at 912b781 | all pass unchanged | gate pass; e2e 24/24, midi 9/9, wall 8/8, nashua 10/10, p4 4/4, p5 10/10, p6 10/10, p7 10/10, p8 7/7, p9 7/7; console clean in each |

## Found on the way
- With real pop-ups over the controller, Chrome logged "READ-usage buffer was written, then fenced, but written again before being read back" from the controller: a second GPU read was queued on a buffer before the first was collected. Now one read in flight per target; no pixel drawn differently (byte identity in p6 and p8 still passes).
- While this gate ran, the P10 tests ran on the other copy (port 8093) on the same GPU, overlapping wall, nashua, p4 and p5. Every suite passed under that extra load; the soaks below ran with the GPU otherwise idle.
- The w7 card shows 29 fps for one node: four windows, each 640 x 360, on one GPU and partly covered. The drift is in px of travel, not frames shown, and stayed 0.

## Owner's call
None new. The windows tile over the controller's screen: the Window Management API (placing on other screens) needs a permission prompt and is not used; each window is dragged to its display, as the pair is.

## Unverified on real hardware
Several real screens or projectors, several machines from Copy links (the drift above is one machine, one clock), another browser's pop-up blocker (only Chromium's). Every number is from one Windows machine with an RTX 3080.

## Where everything landed
| what | local | GitHub | Pages | chat only |
| --- | --- | --- | --- | --- |
| code, tests, tools | `C:\_av\shanshui-av-nashua` | `feat/nashua`, tag `.p9`, Release `.p9` | `/next/p9/` (frozen), `/next/` | |
| CHECKPOINT_P9, MORNING | repo root | yes | | copied to `_handoffs\nashua\` |
| PROMPT v02 (v01 plus A to D in one file) | `_handoffs\` | no | no | |
| test results, soak JSON | `test-results/` | no (ignored) | no | numbers in this file |

## Next
1. P10 (ADDENDUM-D D1): the loop modes, built and passing their tests in the working copy.
2. The post-mortem (P1 to P10) at the close.

## Site
| check | result |
| --- | --- |
| deploy | pages-preview df6dea5 (root = main 1f009a1, `next/` = ee7f0dc, `next/p9/` = the tag `.p9`, ee7f0dc), Pages built df6dea5; site 20.6 MB of 1024 |
| the root, live | before the push 133/134, one file HTTP 503 (Pages, transient); after: 134/134 files byte-identical to main 1f009a1 |
| crawl `/next/` | 5 pages, 60 requests, 67 linked files, 0 broken, 0 console errors |
| crawl `/next/p9/` | 5 pages, 60 requests, 67 linked files, 0 broken, 0 console errors; entry modules stamped `?v=ee7f0dc` |
| Open windows on `/next/p9/` | p9 w1 (URLs and sizes), w2 (3 x 1 seams 0.00 / 0.00, unrelated 11.8 and 11.2) and w6 (Copy links) pass live, console clean |
| Release | https://github.com/laserpirate/shanshui-av/releases/tag/shanshui-av-v0.4.0-nashua.p9 (these notes, no files) |
