# AV Shan Shui Infinite Scrolls

Show build of **{Shan, Shui}\*** by Lingdong Huang (https://github.com/LingDong-/shan-shui-inf, MIT):
the infinite procedural landscape scroll with playback controls, seeds, palette modes, a projector
output window and print export. The landscape engine is Lingdong Huang's, unchanged. Credit and
license: `NOTICE.md`, `LICENSE`.

Live: https://laserpirate.github.io/shanshui-av/

## Run offline

```
node tools/serve.mjs            # http://localhost:8080/  (no internet, no dependencies)
node tools/serve.mjs --port 8091
```

Open the page, press `O` for the output window, drag it to the projector, press `F` inside it.
Show checklist: `SHOWNIGHT.md`. Keys: `?` in the app, or `src/ui/keys.js`.

## URL

| Parameter | Meaning |
| --- | --- |
| `?seed=<seed>` | Landscape seed. Same seeds as https://lingdong-.github.io/shan-shui-inf/?seed=... |
| `?i=<name>` | Instance: its own settings, stars and output channel, so two laptops or two outputs never mix |
| `?palette=<id>` | Start on a palette from `palettes.json` |

`output.html?i=<name>` is the output window for that instance (no UI, writes nothing).

## Palettes

All palettes live in `palettes.json`. Add one by hand:

```json
{ "id": "my-ink", "name": "My Ink", "group": "Mine", "cycle": true, "type": "ramp",
  "ground": "#101418", "paper": "grain", "stops": [[0, "#101418"], [0.5, "#5a7a9a"], [1, "#f4f6f8"]] }
```

`stops` map ink amount (0 bare paper, 1 darkest ink) to colour. `type: "gradient"` with `ramp`, `drift`
(`x` or `time`), `period` and `rate` makes colour travel along the scroll. Field notes at the top of
`tools/build-palettes.mjs`, which built the file (the 25 Studies come from the Kodama Topo pages).

## Layout

```
index.html          controller            output.html   output window
src/engine/         upstream engine, extracted unchanged (tools/extract-engine.mjs)
src/workers/        gen-worker (runs the engine), raster-worker (tiles, off the main thread)
src/core/           world, scene, playback, palettes, store
src/render/         WebGL2 renderer (palette tables, crossfades)
src/export/         SVG, PDF (vendor/jspdf + vendor/svg2pdf), PNG
upstream/           untouched copy of shan-shui-inf@9f754d2
tools/              serve, gate, preflight, soak, bench, build-palettes
tests/              e2e (Playwright, real GPU), smoke
```

## Tests

```
cd tools && npm install          # Playwright 1.48.2 + pngjs, dev only
node tools/serve.mjs --port 8093
node tools/gate.mjs              # syntax, links, console errors
node tests/e2e.mjs               # upstream identity, playback, seeds, palettes, export, blackout, full screen, output
node tools/preflight.mjs         # every palette on this GPU
node tools/soak.mjs 30           # 30 min at high speed: heap, fps, DOM, chunks
```

Decisions and numbers: `DECISIONS.md`.
