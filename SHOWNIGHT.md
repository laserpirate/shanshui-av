# SHOWNIGHT

The room is the risk, not the code. Rehearse once on the real projector.

## Before

- [ ] Run offline: `node tools/serve.mjs` in the repo, open http://localhost:8080/ (never depend on venue wifi)
- [ ] Chrome, plugged in, Windows set to High performance GPU for Chrome
- [ ] Displays on Extend. `O` opens the output window; drag it to the projector; `F` (or double-click) inside it
- [ ] `T` test card: check edges, grid, grey ramp for keystone and focus. `T` again to leave
- [ ] Controller HUD shows `output <w> x <h> <fps>`; fps near 60. If not, Show panel, Quality: Med or Low
- [ ] Two outputs or two laptops: give each its own `?i=<name>`
- [ ] Star the seeds you want (`s`). Show panel: Auto reseed, Starred, every N minutes
- [ ] Star the palettes you want (`S`), then Look panel: "P cycles starred only"
- [ ] Sleep, Windows Update and notifications off; Do Not Disturb on
- [ ] Blackout tested: `B` from the controller and from the output window
- [ ] Derelict: rehearse one full weather loop (Weather panel, 6 min) on the projector; night and flood are the darkest frames. Pin a phase there if the room is bright
- [ ] MIDI (optional): plug the controller in before opening the page, Show panel, Enable MIDI, press a target and move a control. Map Blackout to a pad you can find in the dark

## During

| Key | Action |
| --- | --- |
| Space | Play / pause (eases in and out) |
| `-` `=` | Speed |
| `R` | Reseed (crossfade) |
| `p` / `P` | Next / previous palette (crossfade) |
| `G` | Hold: freeze auto reseed and auto palette |
| `W` | World: shanshui / derelict (crossfade) |
| `B` | Blackout (always works) |
| Esc held 1 s | Panic: fades to the last good frame. Esc or Space to leave |
| `H` | Hide controls |

In full screen Chrome keeps Esc for the panic key; hold Esc 2 s to leave full screen.

## If something goes wrong

- Output blank: the watchdog redraws on its own after 3 s and reloads the output after 15 s. The Log panel says what happened.
- Output window closed: press `O` again; it picks up the current seed and palette.
- Controller reloaded: last seed and palette come back, paused at the start of the seed.
- Derelict too dark at night: Weather panel, grab Light (holds it); Follow releases it.
- Slow: Show panel, Quality Low. While an output window is connected the controller preview already draws at half resolution.

## Credit

{Shan, Shui}* by Lingdong Huang (MIT). Changes by Marko Manriquez. About panel in the app.
