# INSTALL

Everything runs from a folder: a static server (`tools/serve.mjs`, no dependencies) and Chrome or Edge. No account,
no build step, no internet once installed.

What was tested: Windows 11 with an RTX 3080 and Chromium (the Playwright tests). The launchers themselves, the Mac
and the Pi have not been run: they are written to the same pattern and unverified.

## 1. Get the folder

- Copy the repo folder to the show machine (or `git clone` it).
- Install Node.js 18 or newer (only `tools/serve.mjs` needs it; nothing else is installed).
- Optional: put your own video files in `media/` (never committed) to use them as the slit-scan source.

## 2. Start

| Machine | Controller | Output full screen | Wall node |
|---|---|---|---|
| Windows | `launch\windows\controller.bat` | `launch\windows\output.bat 1920` | `launch\windows\wall-node.bat 3 1 0 0 0 "overlap=160&cal=1"` |
| macOS | `launch/mac/controller.command` | `launch/mac/output.command 1920` | `launch/mac/wall-node.command 2 1 1 0 1920 'sync=ws://192.168.1.10:8097'` |
| Raspberry Pi | (none: run the controller elsewhere, or use clock mode) | `launch/pi/kiosk.sh` | `WALL='wall=3x1&col=2&row=0' launch/pi/kiosk.sh` |

The number after `output` is the left edge (x, in px) of the screen to fill. Outputs open in kiosk mode, so full
screen needs no click; Alt+F4 (Windows) or Cmd+Q (Mac) closes them. On a Mac, the first time, right-click a
`.command` file and choose Open. On a Pi, `launch/pi/shanshui-kiosk.service` starts the kiosk with the desktop
(install steps are in the file).

Settings for the controller page go in `SHOW_QUERY`, for example `world=nashua&ends=pingpong`. Every launcher opens
the page with `?offline=1`: the first visit stores the app in the browser (a service worker, network first, so a new
release is always picked up while online), and after that it starts with no network at all.

Not verified: that `--window-position` with `--kiosk` lands on the intended screen on every machine. If an output
opens on the wrong screen, open it with `O` in the controller, drag it, and press `F`.

By hand: `node tools/serve.mjs --port 8093`, then open `http://localhost:8093/?offline=1`.

## 3. Weak machines: bake

A Pi or an old laptop can play baked tiles instead of generating them:

```
node tools/bake.mjs http://localhost:8093/ --world=nashua --seed=1 --height=1080
node tools/bake.mjs http://localhost:8093/ --world=shanshui --seed=7 --k0=0 --k1=79
```

Run it on a strong machine with the server running, then copy `baked/` and `precache.json` to the weak one.
Open pages with `?baked=1`. Palettes, weather, water level and the slit-scan stay live. Anything not baked (another
seed, bank, exaggeration or mode, or past the baked span) is drawn live as usual. A nashua bake covers the whole reach.

## 4. Quality

`?quality=auto` (default) steps the render scale down when fps stays under 50 and back up when it recovers; the
output window runs its own ladder. `?quality=high|medium|low` fixes it. The Show panel's Quality control does the same
for the controller.

## 5. Multiple screens

See WALL.md for walls, edge blend, keystone and LAN sync, and SHOWNIGHT.md for the night itself.

## 6. Remove

Delete the folder. The browser profile the launchers use is `%LOCALAPPDATA%\shanshui-show` (Windows),
`~/Library/Application Support/shanshui-show` (Mac), `~/.config/shanshui-show` (Pi).
