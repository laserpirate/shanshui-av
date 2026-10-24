// Worlds the app can show. A world is a generator behind the same worker messages (init, right,
// left, cull -> chunks), so World, the raster worker, the renderer and export treat every world
// alike. See DECISIONS.md, "Worlds", for adding a third.
//   kind      shader branch: 0 ink only (output identical to v0.2.0), 1 ink + lights + weather
//   worker    generator worker file in src/workers/, module: load as a module worker
//   chunked   every chunk is a pure function of (seed, chunk): travel back regenerates the same
//             landscape, so the memory cap never changes what is shown
//   cull      world px kept behind the view
import { meta as shanshui } from './shanshui/index.js';
import { meta as derelict } from './derelict/index.js';

export const WORLDS = {
  shanshui: { ...shanshui, kind: 0, worker: 'gen-worker.js', module: false, chunked: false, cull: 20000, weather: false },
  derelict: { ...derelict, kind: 1, worker: 'derelict-worker.js', module: true, chunked: true, cull: 12000, weather: true },
};
export const WORLD_NAMES = Object.keys(WORLDS);
export const worldOf = name => WORLDS[name] || WORLDS.shanshui;
