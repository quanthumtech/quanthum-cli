import { isUrl, resolveRegistrySource } from './registry.js';
import type { VariantChoices } from './variants.js';

export interface ReportPayload {
  name: string;
  archetype: string;
  version?: string;
  variant?: VariantChoices;
}

/**
 * Avisa o portal (mesmo host do --registry/QUANTHUM_REGISTRY) que um scaffold
 * acabou de ser criado — é o que alimenta o módulo de Projetos do portal.
 * Best-effort só: sem --registry apontando pra uma URL (registry estático
 * bundlado ou um caminho local), não tem portal nenhum pra avisar — silencioso,
 * sem erro. Falha de rede/timeout também é silenciosa — reportar não pode
 * atrapalhar nem lentificar o scaffold de ninguém.
 */
export async function reportProject(payload: ReportPayload, registrySource?: string): Promise<void> {
  const resolved = resolveRegistrySource(registrySource);
  if (!isUrl(resolved)) {
    return;
  }

  const reportUrl = new URL('/api/projects', resolved).toString();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);

  try {
    await fetch(reportUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch {
    // silencioso de propósito — ver docblock.
  } finally {
    clearTimeout(timeout);
  }
}
