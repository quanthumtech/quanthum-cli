import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execa } from 'execa';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runNew } from '../src/commands/new.js';

async function initGitRepo(dir: string): Promise<void> {
  await execa('git', ['init'], { cwd: dir });
  await execa('git', ['config', 'user.email', 'test@example.com'], { cwd: dir });
  await execa('git', ['config', 'user.name', 'Test'], { cwd: dir });
  await execa('git', ['add', '-A'], { cwd: dir });
  await execa('git', ['commit', '-m', 'template com variantes'], { cwd: dir });
}

describe('variantes (--<eixo>=<opção>)', () => {
  let workDir: string;
  let templateDir: string;
  let registryPath: string;

  beforeAll(async () => {
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'quanthum-variants-test-'));
    templateDir = path.join(workDir, 'template-variantes');

    // core compartilhado
    fs.mkdirSync(path.join(templateDir, 'variants', 'frontend', 'alpha'), { recursive: true });
    fs.mkdirSync(path.join(templateDir, 'variants', 'frontend', 'beta'), { recursive: true });
    fs.writeFileSync(path.join(templateDir, 'app.txt'), 'core: APP_NAME\n');

    // opção alpha: adiciona alpha.txt e sobrescreve marker.txt
    fs.writeFileSync(path.join(templateDir, 'variants', 'frontend', 'alpha', 'alpha.txt'), 'sou a opção alpha\n');
    fs.writeFileSync(path.join(templateDir, 'variants', 'frontend', 'alpha', 'marker.txt'), 'alpha\n');

    // opção beta: adiciona beta.txt e sobrescreve marker.txt diferente
    fs.writeFileSync(path.join(templateDir, 'variants', 'frontend', 'beta', 'beta.txt'), 'sou a opção beta\n');
    fs.writeFileSync(path.join(templateDir, 'variants', 'frontend', 'beta', 'marker.txt'), 'beta\n');

    fs.writeFileSync(path.join(templateDir, 'marker.txt'), 'nenhuma escolhida ainda\n');

    fs.writeFileSync(
      path.join(templateDir, 'quanthum.json'),
      JSON.stringify(
        {
          name: 'variantes',
          version: '0.1.0',
          placeholders: { APP_NAME: { prompt: 'Nome', files: ['app.txt'] } },
          variants: {
            frontend: {
              prompt: 'Qual frontend?',
              default: 'alpha',
              options: {
                alpha: { description: 'Opção Alpha', path: 'variants/frontend/alpha', setup: ['echo alpha-setup >> setup.log'] },
                beta: { description: 'Opção Beta', path: 'variants/frontend/beta', setup: ['echo beta-setup >> setup.log'] },
              },
            },
          },
          variantsCleanup: ['variants'],
          setup: ['echo core-setup >> setup.log'],
        },
        null,
        2,
      ),
    );

    await initGitRepo(templateDir);

    registryPath = path.join(workDir, 'registry.json');
    fs.writeFileSync(
      registryPath,
      JSON.stringify({ variantes: { repo: templateDir, version: 'latest' } }, null, 2),
    );
  });

  afterAll(() => {
    fs.rmSync(workDir, { recursive: true, force: true });
  });

  it('aplica a opção escolhida, roda o setup extra na ordem certa e limpa a pasta de variantes', async () => {
    const { destDir, variantChoices } = await runNew({
      archetype: 'variantes',
      name: 'projeto-alpha',
      cwd: workDir,
      registryPath,
      set: { APP_NAME: 'Projeto Alpha' },
      variants: { frontend: 'alpha' },
      interactive: false,
    });

    expect(variantChoices).toEqual({ frontend: 'alpha' });
    expect(fs.readFileSync(path.join(destDir, 'alpha.txt'), 'utf-8')).toBe('sou a opção alpha\n');
    expect(fs.readFileSync(path.join(destDir, 'marker.txt'), 'utf-8')).toBe('alpha\n');
    expect(fs.existsSync(path.join(destDir, 'beta.txt'))).toBe(false);
    expect(fs.existsSync(path.join(destDir, 'variants'))).toBe(false);

    // setup compartilhado roda antes do setup específico da variante
    const log = fs.readFileSync(path.join(destDir, 'setup.log'), 'utf-8').trim().split('\n');
    expect(log).toEqual(['core-setup', 'alpha-setup']);

    const marker = JSON.parse(fs.readFileSync(path.join(destDir, '.quanthum-archetype'), 'utf-8'));
    expect(marker.variants).toEqual({ frontend: 'alpha' });
  });

  it('escolhendo beta, aplica beta e não deixa nenhum resquício de alpha', async () => {
    const { destDir } = await runNew({
      archetype: 'variantes',
      name: 'projeto-beta',
      cwd: workDir,
      registryPath,
      set: { APP_NAME: 'Projeto Beta' },
      variants: { frontend: 'beta' },
      interactive: false,
    });

    expect(fs.readFileSync(path.join(destDir, 'beta.txt'), 'utf-8')).toBe('sou a opção beta\n');
    expect(fs.existsSync(path.join(destDir, 'alpha.txt'))).toBe(false);
    expect(fs.readFileSync(path.join(destDir, 'marker.txt'), 'utf-8')).toBe('beta\n');
  });

  it('sem flag e não-interativo, cai no default do eixo', async () => {
    const { variantChoices } = await runNew({
      archetype: 'variantes',
      name: 'projeto-default',
      cwd: workDir,
      registryPath,
      set: { APP_NAME: 'Projeto Default' },
      interactive: false,
    });

    expect(variantChoices).toEqual({ frontend: 'alpha' });
  });

  it('valor inválido de variante é erro claro', async () => {
    await expect(
      runNew({
        archetype: 'variantes',
        name: 'projeto-invalido',
        cwd: workDir,
        registryPath,
        set: { APP_NAME: 'X' },
        variants: { frontend: 'gama-nao-existe' },
        interactive: false,
      }),
    ).rejects.toThrow(/Valor "gama-nao-existe" inválido/);
  });

  describe('eixo sem default', () => {
    let semDefaultTemplateDir: string;
    let semDefaultRegistryPath: string;

    beforeAll(async () => {
      semDefaultTemplateDir = path.join(workDir, 'template-sem-default');
      fs.mkdirSync(path.join(semDefaultTemplateDir, 'variants', 'x', 'um'), { recursive: true });
      fs.writeFileSync(path.join(semDefaultTemplateDir, 'variants', 'x', 'um', 'f.txt'), 'um\n');
      fs.writeFileSync(
        path.join(semDefaultTemplateDir, 'quanthum.json'),
        JSON.stringify({
          name: 'sem-default',
          version: '0.1.0',
          variants: {
            x: { prompt: 'Escolha', options: { um: { path: 'variants/x/um', setup: [] } } },
          },
          variantsCleanup: ['variants'],
          setup: [],
        }),
      );
      await initGitRepo(semDefaultTemplateDir);

      semDefaultRegistryPath = path.join(workDir, 'registry-sem-default.json');
      fs.writeFileSync(
        semDefaultRegistryPath,
        JSON.stringify({ 'sem-default': { repo: semDefaultTemplateDir, version: 'latest' } }),
      );
    });

    it('sem flag, sem default e não-interativo: erro claro pedindo a flag', async () => {
      await expect(
        runNew({
          archetype: 'sem-default',
          name: 'projeto-sem-default',
          cwd: workDir,
          registryPath: semDefaultRegistryPath,
          interactive: false,
        }),
      ).rejects.toThrow(/Variante "x" não foi definida/);
    });
  });
});
