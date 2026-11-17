# CHECKPOINT P10 · ADDENDUM-D D1, loop modes · 2026-11-16

Live preview: **https://laserpirate.github.io/shanshui-av/next/p10/?world=nashua&loop=build** (this version, frozen), **https://laserpirate.github.io/shanshui-av/next/p9/?world=nashua** (P9, frozen) and **https://laserpirate.github.io/shanshui-av/next/** (the latest).
Tag: `shanshui-av-v0.4.0-nashua.p10` on `feat/nashua` (the commit that adds this file; the code is 6b661b6). Root of the site: byte-identical to `main` 1f009a1 (Site, below).
Strips: `docs/nashua/index.md`, section "P10 strips" (made by the d4 test). Judgment calls: `DECISIONS.md`, section "Nashua P10". Consolidated prompt: `PROMPT_10-AV_shanshui-av-nashua_v02.md` (written first, as D asked).

**Use `.p10.1`, not `.p10`:** https://laserpirate.github.io/shanshui-av/next/p10.1/?world=nashua&loop=layers. The live check of `.p10` found one bug: on the public site, a nashua page that starts in Layers (`?loop=layers`, or Layers kept from the last visit) stopped at load with "Cannot access 'toastT' before initialization". The "design skipped" toast ran before the toast timer was declared; locally the pack probe answers later, so no local test saw it. `.p10.1` declares the timer first and adds test d3b, which serves the local copy under a `*.github.io` name and failed on that error before the fix. Tags do not move, so `.p10` stays as it was, frozen at `/next/p10/`.

**Look at the strips first:** every Build stage, both worlds, six views each.

## What it does
**Loop** on the bar (also in the mini menu) and in the Show panel cycles **Off, Loop, Layers, Build**. Key Q, MIDI role "Loop mode (off, loop, layers, build)", `?loop=off|loop|layers|build`. It is kept per instance and carried by Copy pair links, Open windows and Copy links. While a loop mode is on, the `ends` setting is ignored.
- **A pass** is one run through the reach, end to end. shanshui and derelict have no reach, so a pass there is 16 view widths from x 0. At the end of a pass the picture crossfades back to the start, and every change happens inside that crossfade. The pass number and the stage show in the controller only (the line under the flags and in the Show panel), never on the output.
- **Next stage** (key A, MIDI role "Loop: next stage") goes to the next stage now, from the start. **Hold stage** (E, "Loop: hold stage") repeats the stage pass after pass.
- **Loop**: the reach again, with no blank frame at the seam (the next pass is drawn before it fades in).
- **Layers** (nashua only): one mode per pass: nature, built, design, sections. Where the design pack is absent (the public preview), design is skipped; the panel says so on one line, and the log and a toast say it once. In shanshui and derelict the Layers button is disabled, with one line why.
- **Build** (shanshui and nashua), nature only, 8 stages, each adding to the last:

| stage | shanshui (filters on the unedited engine) | nashua |
| --- | --- | --- |
| 1 | the water line, one stroke | the water line at Median Water, one stroke |
| 2 | + the ground line (the near land's strokes, no fill) | + the bank's top line, one stroke, no fill |
| 3 | + distant mountains | + the ridgeline, the bank filled, the bed in section |
| 4 | + near mountains, hills, texture, rocks | + texture on the bank face |
| 5 | + single trees, sparse | + single trees, sparse |
| 6 | + clusters | + clusters |
| 7 | + groves (every tree) | + every tree |
| 8 | + the engine's water and boats (it draws no mist) | + the water surface, ripples and the mist |

Never at any stage: pavilions, towers, people (shanshui); buildings, the lot, bridges, the dam, landmarks, runoff, labels (nashua). Build is disabled in derelict, with one line why: the stage table has no derelict column. After stage 8 the cycle starts again at 1.
- **Clock mode** (a link with `loop=`): the nodes follow passes and stages from the clock alone, so a wall built from Copy links runs the same stage on every screen. Next and hold are the controller's.

## Measured (one machine, RTX 3080, headed Chromium)

| check | rule (each failed first on a planted wrong case) | result |
| --- | --- | --- |
| the control (d1) | bar cycle, key Q, the three MIDI roles, links carry `loop`, kept per instance, closed where it does not apply | nashua: Loop on, Layers, Build, Off; Q and every role act; the pair and window links end `&loop=layers`; after a reload: layers. shanshui cycles loop, build, off (Layers disabled); derelict loop, off (Layers and Build disabled); each with its line. The output page has no loop line |
| no blank frame at the seam (d2) | every frame from the seam to the end of the crossfade has at least 0.4 % ink; planted: a bare-paper frame past the reach end (0.31 %) | nashua 15 frames, lowest 1.95 %; shanshui 20 frames, lowest 9.45 %; the pass count goes up by one and the view is back at the start |
| Layers (d3) | the cycle, and inside the crossfade the outgoing pass keeps its own layers | with the design pack: nature, built, design, sections, nature; with its request answered 404: nature, built, sections, nature, built, and the line "Design pack not here (local only): design is skipped"; outgoing layers kept at every one of 5 seams in both |
| every Build stage adds ink (d4) | at least 0.08 % of the pixels of six views darken by 30 or more against the previous stage; planted: stage 4 measured twice gives 0 and fails | shanshui, darkened per stage (%): 0.83, 2.20, 1.64, 8.47, 1.29, 2.91, 7.27, 0.26. nashua: 0.58, 0.64, 17.36, 0.16, 0.12, 0.17, 0.09, 3.06. After 8 the stage is 1; no labels in Build |
| clock mode (d5) | a node 2.5 passes in draws stage 3; at a seam two worlds crossfade, stage 3 resting and stage 4 coming in; planted: the same node without `loop=` has one world and no loop | pass 3 stage 3; at the seam stage 3 at alpha 1 and stage 4 at 0.27; without `loop=`: one world |
| the loop off is the `.p9` frame (d6) | SHA-256 of the whole frame equals the `.p9` server's; planted: Build differs | equal on shanshui, derelict and nashua, dry and heavy (6 of 6); the Build frame differs |
| Layers at load, no design pack, public host (d3b, `.p10.1`) | a page opened with `?loop=layers` under a `*.github.io` name, pack 404, loads with no error and says design is skipped; planted: `.p10` itself | `.p10`: fails, "Cannot access 'toastT' before initialization"; `.p10.1`: passes, console clean. After the fix the p10 suite runs 8/8 |
| the bar and the guide (p7 b2, b5, b6) | the bar 2 rows at 1280; the mini menu; every URL parameter in the guide | 2 rows (110 px) at 1280 in all three worlds; mini menu 10 controls with Loop; 48 of 48 parameters |
| soak 30 min, nashua heavy, FX every 5 min | fps min 45, mean 58 | 60 samples: fps min **59.7** (output 59.6), mean 60.0; heap +0.03 MB (output -0.08); 0 dips, 0 console problems, 0 reloads, no context loss, 0 watchdog events; 16 seeds, 25 palettes. The tool says `pass: false` on the same two fixed limits as P7 to P9: DOM 700 to 769 (+69 against 60, the Log panel capped at 200 entries) and tiles 55 against 40 (the reach's tiles stay resident, as designed in P6). Limits not changed |
| soak 30 min, derelict heavy, a new world every 5 min | fps min 50 | 60 samples: fps min **59.1** (output 59.7), mean 60.0; 6 world switches (derelict, nashua, shanshui, twice); 0 dips, 0 console problems, 0 reloads. `pass: false` on DOM (+84, the Log panel), tiles (55, while in nashua) and heap growth (+32.8 MB against 8). As in P9, the last third of the run was mostly shanshui, whose engine holds 22 to 130 MB while it runs; the heap was 6.02 MB at the end, back in derelict, against 5.84 MB at the start. No leak. Not changed |
| soak 30 min, shanshui in Build, a new pass about every 13 s | fps min 45, mean 58 | 60 samples: fps min **59.8** (output 59.0), mean 60.0; heap +3.12 MB (under 8), and in each cycle it climbs to 40 to 92 MB as the stages add trees, then falls back to 2.6 to 2.9 MB at stage 1 (11 cycles, the same seed throughout: Build keeps the landscape and redraws it each pass); 0 dips, 0 console problems, 0 reloads, no context loss. `pass: false` on one limit only: DOM 680 to 767 (+87 against 60, the Log panel, which logs each stage). Not changed |
| the other suites | all pass unchanged | gate pass; e2e 24/24, midi 9/9, wall 8/8, nashua 10/10, p4 4/4, p5 10/10, p6 10/10, p7 10/10, p8 7/7, p9 7/7, p10 7/7; console clean in each |

## Found on the way
- **The first ink rule did not mean "adds ink".** It asked the share of ink to grow, and it fell where stage 7's pale crowns cover the bank fill and stage 8's mist lightens the frame. Changed twice, with the numbers in DECISIONS; the rule now counts the pixels each stage darkens.
- **nashua's sparse trees** went from 1 in 8 slots to 1 in 4 while that test was failing: at 1 in 8 the strip showed one tree in three views. A change to the drawing, logged as such. nashua's stages 4 to 7 darken 0.09 to 0.17 %, just over the rule: its trees are small and pale at 8 px per m.
- **shanshui's stage 2** first drew nothing: the ground line's strokes went through the engine's `poly`, which the flat-land filter dropped. Strokes now keep their own shape.

## Owner's call (defaults taken, nothing waits)
- **shanshui's water line** for stage 1 sits at the foot of the scroll (12 px above the mirror's line, as settled in D2). The engine has no water line, so this one stroke in its brush is the only mark not the engine's.
- **Clusters in shanshui** (stage 6): the engine does not tag clusters, so stage 6 adds the trees where a slow noise along x is high. If clusters should mean something else, say how.
- **Build in derelict**: disabled, not invented. A stage table for derelict would be new design.

## Unverified on real hardware
The nanoKONTROL with the three loop roles (fired in software only), a wall of several machines running Build from Copy links (one machine here), a projector. Every number is from one Windows machine with an RTX 3080.

## Where everything landed
| what | local | GitHub | Pages | chat only |
| --- | --- | --- | --- | --- |
| code, tests, tools | `C:\_av\shanshui-av-nashua` | `feat/nashua`, tag `.p10`, Release `.p10` | `/next/p10/` (frozen), `/next/` | |
| Build strips (2) | `docs/nashua/p10_build_*.jpg` | yes | `/next/docs/nashua/` | |
| CHECKPOINT_P10, MORNING | repo root | yes | | copied to `_handoffs\nashua\` |
| post-mortem P1 to P10 | `Claude_post-mortems\POSTMORTEM_10-AV_shanshui-av-nashua_v01.md` | no | no | |
| test results, soak JSON | `test-results/` | no (ignored) | no | numbers in this file |

## Every version
| tag | commit | date | what | release | frozen preview |
| --- | --- | --- | --- | --- | --- |
| `shanshui-av-v0.4.0-nashua.p1` | a4699ad | Nov 11 | the nashua world | none (before D3) | none (before D3) |
| `shanshui-av-v0.4.0-nashua.p2` | 2d1664f | Nov 11 | modes, morph, live section, slit-scan | none (before D3) | none (before D3) |
| `shanshui-av-v0.4.0-nashua.p3` | 38d9085 | Nov 11 | the wall | none (before D3) | none (before D3) |
| `shanshui-av-v0.4.0-nashua.p4` | 0d9dcf4 | Nov 11 | platforms and MIDI | none (before D3) | none (before D3) |
| `shanshui-av-v0.4.0-nashua.p5` | 27df0e1 | Nov 11 | night river, tag stream, print to scale, the Merrimack | none (before D3) | none (before D3) |
| `shanshui-av-v0.4.0-nashua.p6` | a7988f9 | Nov 11 | ADDENDUM-A | none (before D3) | none (before D3) |
| `shanshui-av-v0.4.0-nashua.p7` | e6ceeb0 | Nov 11 | ADDENDUM-B | none (before D3) | none (before D3) |
| `shanshui-av-v0.4.0-nashua.p8` | eae0755 | Nov 11 | the mirror (B11) | none (before D3) | none (before D3) |
| `shanshui-av-v0.4.0-nashua.p9` | ee7f0dc | Nov 16 | Open windows (ADDENDUM-C C1) | https://github.com/laserpirate/shanshui-av/releases/tag/shanshui-av-v0.4.0-nashua.p9 | https://laserpirate.github.io/shanshui-av/next/p9/ |
| `shanshui-av-v0.4.0-nashua.p10` | 4e8898e | Nov 16 | loop modes (ADDENDUM-D D1); stops at load in Layers on the public site | https://github.com/laserpirate/shanshui-av/releases/tag/shanshui-av-v0.4.0-nashua.p10 | https://laserpirate.github.io/shanshui-av/next/p10/ |
| `shanshui-av-v0.4.0-nashua.p10.1` | this commit | Nov 16 | the load fix and test d3b | https://github.com/laserpirate/shanshui-av/releases/tag/shanshui-av-v0.4.0-nashua.p10.1 | https://laserpirate.github.io/shanshui-av/next/p10.1/ |

Releases and frozen copies start at `.p9`, as D3 asks from now on. The earlier tags stay on GitHub as tags; their code can be served from a worktree of the tag.

## Site
Filled in after the deploy, in the commit after the tag (as for P9).
