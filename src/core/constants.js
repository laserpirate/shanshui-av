// Shared numbers. World units are upstream SVG px.
export const VERSION = '0.3.0';
export const WORLD_H = 800 / 1.142;   // upstream viewBox height (windy / zoom)
export const TILE_W = 512;            // world px per raster tile (= upstream chunk width)
export const REF_H = 1080;            // speed is px/s on a 1080 px tall screen at zoom 1
export const CULL = 20000;            // drop elements this far behind the view
export const AHEAD = 3500;            // keep generation this far past the view edge
export const READY_MARGIN = 2000;     // a tile is final once generation is this far past its right edge
export const PAPER_TILE = 512 / (800 / WORLD_H); // upstream paper texture repeat, in world px (448)
export const CREDIT = '{Shan, Shui}* by Lingdong Huang. Changes by Marko Manriquez.';
export const UPSTREAM_URL = 'https://github.com/LingDong-/shan-shui-inf';
export const UPSTREAM_SITE = 'https://lingdong-.github.io/shan-shui-inf/';
