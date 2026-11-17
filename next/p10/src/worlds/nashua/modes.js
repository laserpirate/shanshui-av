// Modes: a mode is a list of layers (from the landform-sequences modes file, v01). ?mode=<name>, key M cycles,
// key X toggles the sections layer in any mode. Every drawn element of the nashua world carries one layer.
export const MODE_DEFAULT = 'built';
export const MODE_ORDER = ['nature', 'built', 'design', 'sections'];
export const LAYERS = ['terrain', 'water', 'trees', 'landmarks', 'buildings', 'hardscape', 'infrastructure', 'cso', 'interventions', 'walk', 'kodama', 'sections'];
export const MODES = {
  nature: ['terrain', 'water', 'trees', 'landmarks'],
  built: ['terrain', 'water', 'trees', 'landmarks', 'buildings', 'hardscape', 'infrastructure', 'cso'],
  design: ['terrain', 'water', 'trees', 'landmarks', 'buildings', 'hardscape', 'infrastructure', 'cso', 'interventions', 'walk', 'kodama'],
  sections: ['terrain', 'water', 'trees', 'landmarks', 'buildings', 'hardscape', 'infrastructure', 'cso', 'interventions', 'walk', 'kodama', 'sections'],
};
// the layers drawn for a mode, with the sections toggle applied
export function layersOf(mode, sectionsOn) {
  const L = (MODES[mode] || MODES[MODE_DEFAULT]).slice();
  if (sectionsOn && !L.includes('sections')) L.push('sections');
  if (sectionsOn === false && mode !== 'sections') return L.filter(l => l !== 'sections');
  return L;
}
