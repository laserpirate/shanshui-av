// The shanshui world: Lingdong Huang's {Shan, Shui}* engine, unchanged (src/engine/upstream-engine.js),
// run by src/workers/gen-worker.js.
// World interface, as the derelict world has it (see DECISIONS.md, "Worlds"):
//   meta               this object
//   init(seed)         Math.seed(seed), then upstream's load-time chunkloader(0, 3000) and paper texture
//   generate(chunk)    upstream generates in travel order from one global PRNG, so a chunk can only be
//                      made by advancing to it: the worker's 'right' / 'left' messages are generate()
// Because of that single PRNG sequence, travel back past the memory cap draws new landscape; Stop and
// starred seeds restart from x = 0 to reproduce the original (DECISIONS.md, "Seeds and memory").
export const meta = {
  name: 'shanshui',
  height: 800 / 1.142,
  chunk: 512,
  layers: ['upstream'],
  seeds: 'upstream PRNG and seed hashing, unchanged; one global sequence in travel order',
};
