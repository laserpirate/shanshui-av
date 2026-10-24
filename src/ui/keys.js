// The key map, one table. tests/e2e.mjs checks it for duplicates. Case matters: s and S differ.
export const KEYS = [
  ['Space', 'Play / pause'],
  ['Home', 'Stop: ease back to the start of the seed'],
  ['D', 'Direction'],
  ['- and =', 'Speed down / up'],
  ['Left, Right', 'Nudge (Shift: further)'],
  ['Drag, wheel', 'Scrub'],
  ['R', 'Reseed'],
  ['[ and ]', 'Seed history back / forward'],
  ['s', 'Star seed'],
  ['p', 'Next palette'],
  ['P', 'Previous palette'],
  ['S', 'Star palette'],
  ['F', 'Full screen (double-click works too)'],
  ['H', 'Hide controls'],
  ['B', 'Blackout'],
  ['G', 'Hold: freeze auto reseed and auto palette'],
  ['T', 'Projector test card'],
  ['O', 'Output window'],
  ['W', 'World: shanshui / derelict'],
  ['?', 'This key card'],
  ['Esc', 'Close panels; leave panic'],
  ['Esc held 1 s', 'Panic: fade to the last good frame'],
];
// the keys the handler listens for, by KeyboardEvent.key, for the duplicate check
export const KEY_CODES = [' ', 'Home', 'd', '-', '=', 'ArrowLeft', 'ArrowRight', 'r', '[', ']', 's', 'p', 'P', 'S', 'f', 'h', 'b', 'g', 't', 'o', 'w', '?', 'Escape'];
