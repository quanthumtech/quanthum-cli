import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadRegistry, resolveArchetype } from '../src/registry.js';

describe('registry remoto (http)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('busca e faz parse de um registry.json servido por HTTP', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => JSON.stringify({ aquiles: { repo: 'https://example.com/aquiles.git', version: 'v1.0.0' } }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const registry = await loadRegistry('https://portal.example.com/registry.json');

    expect(registry).toEqual({ aquiles: { repo: 'https://example.com/aquiles.git', version: 'v1.0.0' } });
    expect(fetchMock).toHaveBeenCalledWith('https://portal.example.com/registry.json');
  });

  it('resolveArchetype funciona contra um registry remoto', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: async () => JSON.stringify({ ulisses: { repo: 'https://example.com/ulisses.git', version: 'latest' } }),
      })),
    );

    const entry = await resolveArchetype('ulisses', 'https://portal.example.com/registry.json');
    expect(entry.repo).toBe('https://example.com/ulisses.git');
  });

  it('erro claro quando o servidor responde com status de erro', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 500, statusText: 'Internal Server Error', text: async () => '' })),
    );

    await expect(loadRegistry('https://portal.example.com/registry.json')).rejects.toThrow(/respondeu 500/);
  });

  it('erro claro quando o fetch falha (rede fora do ar)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      }),
    );

    await expect(loadRegistry('https://portal.example.com/registry.json')).rejects.toThrow(/Não consegui alcançar/);
  });
});
