# INSTALL

Everything runs from a folder: a static server (`tools/serve.mjs`, no dependencies) and Chrome or Edge. No account,
no build step, no internet once installed.

What was tested: Windows 11 with an RTX 3080 and Chrome (Playwright Chromium for the tests). The Mac and Pi launchers
were written to the same pattern but have not been run on a Mac or a Pi.

## 1. Get the folder

- Copy the repo folder to the show machine (or `git clone` it).
- Install Node.js 18 or newer (only `tools/serve.mjs` needs it; nothing else is installed).
- Optional: put your own video files in `media/` (never committed) to use them as the slit-scan source.

## 2. Start

| Machine | Start | What opens |
|---|---|---|
| Windows | double-click `launch\windows-show.cmd`, or `launch\windows-show.cmd output 1920` | the controller; with `output X`, also the output full screen on the screen at x = X |
| macOS | double-click `launch/mac-show.command` (first time: right-click, Open), or `launch/mac-show.command output 1920` | the same |
| Raspberry Pi | `launch/pi-show.sh` | one output in kiosk, clock mode or following a controller (see the script) |

Settings for the page go in `SHOW_QUERY`, for example `world=nashua&ends=pingpong`. Every launcher opens the page
with `?offline=1`: the first visit stores the app in the browser (a service worker, network first), so after that it
starts with no network at all.

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
