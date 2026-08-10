import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface RegistryEntry {
  repo: string;
  version: string;
  description?: string;
}

export type Registry = Record<string, RegistryEntry>;

/** Caminho padrão: registry.json na raiz do monorepo (3 níveis acima de dist/registry.js). */
function defaultRegistryPath(): string {
  return path.resolve(__dirname, '../../../registry.json');
}

export function loadRegistry(registryPath?: string): Registry {
  const resolvedPath = registryPath ?? process.env.QUANTHUM_REGISTRY ?? defaultRegistryPath();
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Registry não encontrado em "${resolvedPath}".`);
  }
  const raw = fs.readFileSync(resolvedPath, 'utf-8');
  try {
    return JSON.parse(raw) as Registry;
  } catch {
    throw new Error(`Registry em "${resolvedPath}" não é um JSON válido.`);
  }
}

export function resolveArchetype(name: string, registryPath?: string): RegistryEntry {
  const registry = loadRegistry(registryPath);
  const entry = registry[name];
  if (!entry) {
    const available = Object.keys(registry).join(', ') || '(nenhum)';
    throw new Error(`Arquétipo "${name}" não encontrado no registry. Disponíveis: ${available}`);
  }
  return entry;
}
