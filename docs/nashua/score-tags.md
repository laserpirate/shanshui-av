# Tag stream for a score · nashua world

The sonar score lives on the branch `score-v01` and is **not merged**. This page is the offer: what the `nashua` world can tell a score, in a shape the score already reads, so the score can take it up later without changing this branch.

Off by default. `?tags=1` turns it on in the controller (the output window never posts tags). Code: `src/worlds/nashua/tags.js`; test: `tests/p5.mjs` (`tag-stream`).

## Where it arrives

| channel | what | rate |
| --- | --- | --- |
| `BroadcastChannel('shanshui-av:<instance>:tags')` | events (`type: 'tag'`) and the scene snapshot (`type: 'scene'`) | events when they happen; snapshot at most 10 per second |
| `window` event `ssav-tag` | each event, as `event.detail` | when it happens |
| `SSAV.tags` / `SSAV.tagScene()` | the last 64 events / the latest snapshot | read any time |

`<instance>` is the `?i=` of the controller (`main` by default).

## Events

One per feature crossing the playhead (the view centre), in either direction. A jump of more than 1 km of `s` in one frame (a seek, a world change) sounds nothing.

```
{ type: 'tag', kind, name, s, bank, side, dir, t }
```

| field | meaning |
| --- | --- |
| `kind` | `dam`, `bridge`, `rail-bridge`, `confluence`, `cso`, `outfall` |
| `name` | as in the pack: `Canal St`, `CSO #9`, `OF-8401`, `Jackson Mills dam (NID NH00121)` |
| `s` | station along the reach, m from the dam |
| `bank` | `L` or `R`, the bank being drawn |
| `side` | for CSOs and outfalls, the pack's side (`1` or `-1`); `null` otherwise |
| `dir` | `1` travelling downstream (s rising), `-1` upstream |
| `t` | `Date.now()` at the crossing |

Level changes: when the shown water level (it eases, or follows the time scroll) reaches another named level.

```
{ type: 'tag', kind: 'level', id, name, from, to, rising, t }
```

`id` and `name` come from the pack's levels: `median`, `mhw`, `minor`, `fema1`, `f1936` (names such as `Fluvial · 1936 Flood of Record 39.09 m (128.26 ft)`). `from` and `to` are level indices, 0 (Median Water) to 4 (1936).

## Scene snapshot

The same shape the score's `scene()` takes from the shanshui world today (`src/score/sonar-score.js` on `score-v01`), with `kind: 'nashua'`:

```
{ type: 'scene', kind: 'nashua', x, velocity, tags, entered, weather, level, levelName, s, t }
```

| field | meaning |
| --- | --- |
| `tags` | feature kinds in view, with counts, e.g. `{ bridge: 1, cso: 1 }` |
| `entered` | kinds whose `s` crossed the view's right edge since the last frame (geometry, as the score uses for shanshui) |
| `weather` | `{ rain, wind, water, fog, light }`; with the day cycle on, `light` is the sun's (see the review sheet) |
| `level` | the shown level, 0..4, fractional while it eases |

## A possible mapping (the score's decision, not made here)

The score's `map.js` already maps derelict layer names onto shanshui roles through `gen.alias`. The nashua kinds could follow the same path, for example `bridge` and `rail-bridge` as steps, `dam` and `confluence` as long notes, `cso` and `outfall` as the rain role, `level` rising as a register change. Owner's call, on `score-v01`.

## Checked

One forward pass of the reach in 100 px steps produces exactly one event per feature inside the pass and none twice; Median to 1936 produces four rising level events; a page without `?tags=1` posts nothing (`tests/p5.mjs`, `tag-stream`).
