# CHECKPOINT P4 · platforms · 2026-11-11

Live preview: **https://laserpirate.github.io/shanshui-av/next/**
Tag: `shanshui-av-v0.4.0-nashua.p4` on `feat/nashua` (the commit that adds this file). Root of the site: byte-identical to `main` 1f009a1 (checked live).

## What works
- **Quality ladder** (`src/core/ladder.js`), in the controller and in every output separately:
  - Five rungs of render scale and slit-scan history: 1 / 0.85 / 0.75 / 0.6 / 0.5, history 128 down to 32.
  - Start rung from the GPU renderer string: a Pi (VideoCore, V3D) at the bottom, Mali, Adreno or PowerVR one above, Intel HD or UHD in the middle, everything else at the top.
  - Down one rung after **5 s under 24 fps**. Up after 20 s at 58 fps or more, never within the hold after a step down. The hold doubles after a quick fall back, up to 30 min.
  - `?quality=high|medium|low` fixes a rung.
  - Tile size is the chunk grid and the band count is content, so neither is on the ladder.
- **Baked tiles**:
  - `node tools/bake.mjs --world=nashua --seed=1 --height=720` writes the reach's tiles (raw grey and aux bytes, gzip) to `baked/`, which is gitignored.
  - `?baked=1` uses them and skips generation while they cover the view; palette and weather stay live.
  - Any other seed, mode, bank or span is drawn live.
- **Offline and install**:
  - `?offline=1` registers a service worker; the manifest makes the app installable.
  - Network first, so an online page always gets the new release. The cache answers only when the network fails.
- **Launchers by role**, each starting the local server if it is not running, outputs in `--kiosk` (full screen with no gesture):
  - `launch\windows\controller.bat`, `output.bat`, `wall-node.bat cols rows col row`
  - `launch\mac\*.command`
  - `launch\pi\kiosk.sh` and a systemd user unit.
- **Docs**: INSTALL.md (per platform), WALL.md (room checklist), SHOWNIGHT.md, and the MIDI and CC tables in the README.
- **MIDI, handoff 4 Tier 1 and 2** (no `feat/midi` branch existed, so it was built here):
  - an action seam;
  - presets for the original **nanoKONTROL** (owned), the nanoKONTROL2 and a generic map, picked by port name, all marked "verify with the wizard";
  - soft takeover; panic on a 1 s hold of REC; STOP blackout; one reseed, world or history change in flight at a time;
  - a 10-message monitor; Learn per device and instance; Export;
  - roles for level, exaggeration, bank, morph and every slit control.
- **MIDI out** (AV standard section 6), off by default:
  - CC 20 terrain, 21 building density, 22 level, 23 light, 24 rain, 25 seed, 26 playing;
  - program change = palette;
  - nashua features as notes on a C minor pentatonic in reach order.

## Measured
| check | target | result |
| --- | --- | --- |
| ladder rules | as stated | pass (unit test: no step at 40 fps, none before 5 s under 24, steps after; hold doubles; start rungs for nine renderer strings) |
| baked = live | same picture | mean difference 0.024 of 255 |
| baked at 720p, CPU 6x, GPU memory capped | 30 fps | **59.6 fps** baked, 60 live. **A proxy that says little:** the throttle slows the main thread only and no Chromium flag slows the RTX 3080's shaders. It shows the CPU path is light, not that a Pi holds 30 fps. |
| offline reload; a release while the worker is installed | new file online, last good copy offline | pass |
| MIDI suite (fake Web MIDI) | all | **9/9**: 42 of 42 bindings fire, pickup, panic hold and STOP under a message flood, debounce, hot unplug, the output never asks for MIDI, MIDI out |
| 5 min soak with a fake nanoKONTROL sweeping four knobs at 50 messages/s | no dips, flat heap | fps min **59.8**, heap +0.59 MB, 0 dips, 0 console problems; the sweep was checked to move slit, width, ink and the level |
| 30 min soak (the P3 run, same code) | fps min ≥ 50 | 59.2 |
| e2e on /next/ | 24/24 | **24/24** |

## Found on the way
- The MIDI out test failed one run in three: a step landing exactly on a bridge made `(a - p) * (b - p)` zero, so the note sounded neither arriving nor leaving. It is now half open: landing counts once, leaving does not count again. The P5 tag stream had copied the same logic and is fixed with it.

## Not verified on real hardware
- **The nanoKONTROL itself.** The CC numbers are Korg's documented factory scene 1. The 10-step test in MORNING.md takes about 10 minutes.
- **The launchers** have not been run on any machine, including this one.
- macOS, a Raspberry Pi, a Windows install from a clean machine, loopMIDI or IAC for MIDI out.

## Open questions (default taken)
1. Handoff 4 asked for a tag `shanshui-av-v0.4.0-rc1` on its own branch. Its work landed here instead, under `.p4`. Default: no rc1 tag. Tag one when you have tried the controller.
2. The P1 to P3 questions stand.
