# MORNING · shanshui-av nashua · 2026-11-11

Preview: **https://laserpirate.github.io/shanshui-av/next/?world=nashua** (the stock app at the root is unchanged, byte for byte).
Branch `feat/nashua`. Tags `.p1` the nashua world, `.p2` modes, morph, live section and slit-scan, `.p3` the wall, `.p4` platforms and MIDI, `.p5` night river, tag stream, print to scale, a second reach and three small tools, `.p6` ADDENDUM-A. One file each: `CHECKPOINT_P1.md` to `CHECKPOINT_P6.md`.

## New in P6 (ADDENDUM-A)
- The hills are gone. One thin ridgeline of real ground, the near bank, and the buildings as the skyline in rows (near dark, far pale). Before and after strips: `docs/nashua/index.md`.
- 8 world px per m and 2x by default (Reach panel, Scale 2 to 12; `,` and `.` for the exaggeration). The reach is about 16 screens long now.
- The north bank is the default view, downstream to the right. All 45 footprints within 400 m of it are drawn; the mill, the church behind the lot, the dam and the dike (approximate, at the reach end) are labelled by kind and id: `docs/nashua/structures.md`.
- `L` labels, `I` the map inset (click a station to go there). Buttons on the bar and in the Reach panel, separate ones for the output.
- **Open pair** and **Copy pair links** on the bar: two screens as one long picture (WALL.md, top section).
- One test is left failing, on purpose: the farthest ground band has 7 kinks of 2457 over the limit at 8 px per m. CHECKPOINT_P6 says why.
- Questions waiting for you (CHECKPOINT_P6, Owner's call): names for the church and the mill, and a line for the dike.

## Try first (5 minutes)
- `?world=nashua`: the reach as a section. Keys 1 to 6 for the water levels, K flips the bank, `,` and `.` change the exaggeration, M cycles the modes, X shows the live section, V cycles the slit-scan modes, L the labels, I the map.
- `?world=nashua&t=1936-03-20`: the time scroll at the 1936 flood (Y on and off, U for March 1936; East Pepperell discharge, an upstream proxy).
- `?world=nashua&t=1936-03-20&daycycle=1&hour=21`: the night river, with lights by occupancy, bridge lamps and their reflections. The Reach panel has a 1 day/min rate.
- Export panel, To scale: Arch D or a 36 in roll at 1:500, 1:1000 or 1:2000, never fitted.
- `?world=nashua&reach=merrimack`: the second reach, 5 km of the Merrimack below the confluence (estimated bed, the Nashua's levels carried).
- `?world=nashua&t=1936-03-19&hydro=1&ticks=1`: a hydrograph under the fact line and a distance rule along the bottom.
- An output with `&cap=0.6`: its brightness ceiling, shown on the calibration card.

## The nanoKONTROL, 10 steps (about 10 minutes)
The original nanoKONTROL, SCENE light on 1, Chrome or Edge, the preview URL above.
1. Plug it in, open the page, Show panel, **Enable MIDI**, allow. The panel should name the port and the preset `Korg nanoKONTROL (original), scene 1`.
2. Watch the **monitor** under the MIDI buttons: every control you touch shows its message. If a number differs from the table in the README, note it.
3. **PLAY** (CC 45): pause, then play again.
4. **Strip 5 fader** (CC 6): the water level runs Median to 1936; the fact line names the level.
5. **Strip 8 knob** (CC 21): the exaggeration changes and the reach redraws. (The P6 roles, scale, labels and map, have no preset control: bind them with Learn.)
6. **Strip 5 upper** (CC 27): the bank flips; **strip 5 lower** (CC 37): the mode changes.
7. **Strip 7 upper** (CC 29) until a slit-scan mode is on, then **strip 1 knob** (CC 14, slit position), **strip 2 knob** (CC 15, width), **strip 1 fader** (CC 2, mix).
8. Move a fader far from where the screen is: the panel says it waits for pickup; move through the value and it takes over.
9. **STOP** (CC 46): blackout, and again to return. **Hold REC** (CC 44) for 1 s: panic, the last good frame held; **PLAY** brings it back.
10. Any control that does nothing: press **Learn**, click its target, move the control. Then **Export** and keep the file. When it all works, tag `shanshui-av-v0.4.0-rc1` if you want the handoff 4 tag.

## Owner's calls (nothing waits on them)
- Pages serves from `pages-preview` (main's tree plus `next/`); revert command in CHECKPOINT_P1.
- Older commits on `main` carry a personal email as author; a rewrite needs a force push. Skipped.
- Promote `/next/` to the root. Not done.
- Publish the design pack so the morph works on the preview. Kept local.
- `wss://` for the relay so a Pages-served wall can use it. Default: serve locally on the show network.

## Not tried on real hardware
A projector, a wall of several machines, a Pi, a Mac, the nanoKONTROL, the launchers. Every number in the checkpoints is from one Windows machine with an RTX 3080.
