import { afterEach, describe, expect, it, vi } from 'vitest';
import { reportProject } from '../src/report.js';

describe('reportProject', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('não faz fetch nenhuma quando o registry é um caminho local', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await reportProject({ name: 'minha-app', archetype: 'aquiles' }, '/caminho/local/registry.json');

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('POSTa pro /api/projects do mesmo host do registry quando é uma URL', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);

    await reportProject(
      { name: 'minha-app', archetype: 'aquiles', version: 'v0.2.4', variant: { frontend: 'react' } },
      'https://architecture.quanthum.tec.br/registry.json',
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://architecture.quanthum.tec.br/api/projects');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({
      name: 'minha-app',
      archetype: 'aquiles',
      version: 'v0.2.4',
      variant: { frontend: 'react' },
    });
  });

  it('nunca lança erro quando a fetch falha (rede fora do ar)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      }),
    );

    await expect(reportProject({ name: 'minha-app', archetype: 'aquiles' }, 'https://portal.example.com/registry.json')).resolves.toBeUndefined();
  });
});
