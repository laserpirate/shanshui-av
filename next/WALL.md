# WALL

A wall is several output windows, each drawing its slice of one wide virtual canvas. Every chunk is a pure function
of seed, world and position, so the nodes only have to agree on the state and the time. Nothing is streamed but the
frame state (a few hundred bytes).

Tested on one machine only: two nodes as windows of one Chromium on one GPU. A wall of separate machines,
projectors, real bezels and real keystone have not been tested on hardware.

## Room checklist

- [ ] **Who is the controller.** One machine runs the controller (and, for a LAN wall, `tools/wall-server.mjs`). Write its address on tape on the machine. Clock-mode walls have no controller.
- [ ] **Displays.** Every node the same resolution and scaling (Windows: 100 % scale; Mac: Default for display). Note each screen's left edge (x) for the launchers.
- [ ] **Cables.** Every output on a direct video cable (HDMI or DisplayPort), no adapters that rescale. Spare cable per node. Power strips labelled.
- [ ] **Clocks.** Clock mode and the relay both depend on time: every machine on the same NTP server (Windows: Settings, Time, Sync now; Mac: Date and Time, set automatically). Check the seconds agree before doors.
- [ ] **Network.** A closed show network or a switch of your own; no venue wifi. The relay has no authentication.
- [ ] **Sleep off** on every machine; notifications off; Windows Update paused.
- [ ] **Calibration card** (`cal=1`, key C) on every node: grid lines continuous across the bezel or overlap band; then keystone (`ks=`) until the corners sit on the screen.
- [ ] **Blend check** with a flat grey: no bright or dark stripe in the overlap; adjust `gamma=` (2.2 for most projectors).
- [ ] **One full pass** of the nashua reach (ping-pong both ends) with every node watching for a seam or a lag.

## Place a node

Open `output.html` with:

| Parameter | Meaning | Example |
|---|---|---|
| `wall=CxR` | columns x rows of the wall | `wall=3x1` |
| `col=`, `row=` | this node's place, from 0, left to right, top to bottom | `col=1&row=0` |
| `bezel=` | gap between screens in css px; the picture skips it, so a line crosses the bezel straight | `bezel=24` |
| `overlap=` | projector edge-blend overlap in css px; both neighbours draw the band and each fades it | `overlap=160` |
| `blend=l,r,t,b` | overlap per edge, overrides `overlap` for the ramps only | `blend=0,160,0,0` |
| `gamma=` | display gamma for the blend ramp (the ramp is linear in light) | `gamma=2.2` |
| `ks=x0,y0,x1,y1,x2,y2,x3,y3` | four-corner keystone: offsets in px of top-left, top-right, bottom-right, bottom-left | `ks=12,0,-8,4,0,0,0,0` |
| `cal=1` | start on the calibration card; key C toggles it | `cal=1` |

Use either bezel (flat screens) or overlap (projectors), not both. Every node of a wall must have the same size in css px.

The calibration card shows a 100 px grid, the node's place, the overlap band, the frame and a centre cross. Line up
neighbouring grids across the band, then press C.

## Keep the nodes together

Three ways, pick one:

1. **One machine (BroadcastChannel).** Open the controller and press O for each output, or open
   `output.html?wall=...` in the same browser. Drag each window to its screen and press F. Nothing to set up.
2. **LAN (relay).** On any machine: `node tools/wall-server.mjs --port 8097`. Open the controller with
   `?sync=ws://<that machine>:8097` and every node with the same `&sync=ws://<that machine>:8097`. Each node measures
   its clock offset to the relay by ping (best of the last 8 by round trip), so all nodes extrapolate the scroll to
   the same instant. The relay has no dependencies and no authentication: keep it on a closed show network.
   `http://<that machine>:8097/` reports clients and frames relayed.
3. **Clock mode (no network).** Give every node the same `&t0=<epoch ms>&speed=<px/s>` plus `world`, `seed`,
   `palette`. The position is a function of UTC time alone: nashua ping-pongs over the whole reach, the endless
   worlds scroll on. Nodes stay together as long as their clocks do (sync them to the same NTP server). No controller.
   Clock mode also takes `bank`, `ve`, `level`, `fog`, `water`, `light`.

## Example: three projectors, one machine

```
output.html?wall=3x1&col=0&row=0&overlap=160&cal=1
output.html?wall=3x1&col=1&row=0&overlap=160&cal=1
output.html?wall=3x1&col=2&row=0&overlap=160&cal=1
```

## Example: two screens on two machines, clock mode

```
output.html?wall=2x1&col=0&row=0&bezel=30&world=nashua&seed=1&t0=1794355200000&speed=40
output.html?wall=2x1&col=1&row=0&bezel=30&world=nashua&seed=1&t0=1794355200000&speed=40
```

## Proof

`node tests/wall.mjs` (needs a local server and the GPU):

- two nodes of a 2 x 1 wall with the blend off draw the same picture in their shared band (BroadcastChannel and clock mode)
- two clock-mode nodes agree on the position
- a controller and two nodes in separate browser contexts stay together through `tools/wall-server.mjs`
- the keystone puts the four corners where asked
- the two blend ramps add to full light across the band at gamma 2.2
- the calibration card starts with `cal=1` and toggles with C

`node tests/wall-server.mjs` checks the relay itself: ping clock, relay to every output, 200 kB frames, a client leaving.
