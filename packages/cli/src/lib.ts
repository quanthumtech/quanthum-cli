/**
 * Ponto de entrada programático (sem efeitos colaterais) — é o que
 * `packages/create-aquiles` e qualquer outro wrapper `create-<arquétipo>`
 * importam. `index.ts` (o binário `quanthum`) é a única coisa que faz
 * parsing de argv/chama program.parse().
 */
export { runNew } from './commands/new.js';
export type { RunNewOptions, RunNewResult } from './commands/new.js';
export { resolveArchetype, loadRegistry, DEFAULT_LIVE_REGISTRY_URL } from './registry.js';
export type { Registry, RegistryEntry } from './registry.js';
export { parseVariantFlags } from './variant-flags.js';
export type { VariantChoices } from './variants.js';
