import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface RegistryEntry {
  repo: string;
  version: string;
  description?: string;
  /**
   * Comandos rodados depois do `setup` do manifesto (ex.: `npx shadcn@latest
   * add dashboard-01`) — vêm do tema/blocos que o quanthum-portal anexou ao
   * arquétipo, não do template em si. Nem todo registry (ex.: o registry.json
   * estático) precisa ter isso.
   */
  postSetup?: string[];
}

export type Registry = Record<string, RegistryEntry>;

/**
 * O registry ao vivo do portal oficial — é dele que vem `postSetup`. `--registry`
 * sem valor (ou `QUANTHUM_REGISTRY=1`, ver index.ts/quanthum-aquiles.js) usa isso,
 * pra quem só quer "o ao vivo, o de sempre" não precisar copiar a URL inteira.
 */
export const DEFAULT_LIVE_REGISTRY_URL = 'https://architecture.quanthum.tec.br/registry.json';

/** Caminho padrão: registry.json na raiz do monorepo (3 níveis acima de dist/registry.js). */
function defaultRegistryPath(): string {
  return path.resolve(__dirname, '../../../registry.json');
}

function isUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

/**
 * Mesma resolução que loadRegistry() usa por baixo — exportada separada (sem
 * fazer fetch/leitura nenhuma) porque report.ts precisa saber pra onde
 * mandar o POST de "projeto criado", e isso só faz sentido quando o
 * registry resolvido é uma URL de verdade (arquivo local = sem portal
 * nenhum pra reportar).
 */
export function resolveRegistrySource(registrySource?: string): string {
  return registrySource ?? process.env.QUANTHUM_REGISTRY ?? defaultRegistryPath();
}

export { isUrl };

/**
 * Aceita tanto um caminho de arquivo local quanto uma URL http(s) — um
 * control plane (ex.: quanthum-portal's GET /registry.json) pode servir
 * o registry ao vivo, no mesmo formato do arquivo estático.
 */
export async function loadRegistry(registrySource?: string): Promise<Registry> {
  const resolved = resolveRegistrySource(registrySource);

  const raw = isUrl(resolved) ? await fetchRegistry(resolved) : readLocalRegistry(resolved);

  try {
    return JSON.parse(raw) as Registry;
  } catch {
    throw new Error(`Registry em "${resolved}" não é um JSON válido.`);
  }
}

function readLocalRegistry(registryPath: string): string {
  if (!fs.existsSync(registryPath)) {
    throw new Error(`Registry não encontrado em "${registryPath}".`);
  }
  return fs.readFileSync(registryPath, 'utf-8');
}

async function fetchRegistry(url: string): Promise<string> {
  let response: Response;
  try {
    response = await fetch(url);
  } catch (err) {
    throw new Error(`Não consegui alcançar o registry em "${url}": ${(err as Error).message}`);
  }
  if (!response.ok) {
    throw new Error(`Registry em "${url}" respondeu ${response.status} ${response.statusText}.`);
  }
  return response.text();
}

export async function resolveArchetype(name: string, registrySource?: string): Promise<RegistryEntry> {
  const registry = await loadRegistry(registrySource);
  const entry = registry[name];
  if (!entry) {
    const available = Object.keys(registry).join(', ') || '(nenhum)';
    throw new Error(`Arquétipo "${name}" não encontrado no registry. Disponíveis: ${available}`);
  }
  return entry;
}
