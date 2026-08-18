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
  await execa('git', ['commit', '-m', 'template inicial'], { cwd: dir });
}

describe('quanthum new', () => {
  let workDir: string;
  let templateDir: string;
  let templateComVariantesDir: string;
  let registryPath: string;

  beforeAll(async () => {
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'quanthum-cli-test-'));
    templateDir = path.join(workDir, 'template-teste');
    fs.mkdirSync(templateDir);

    fs.writeFileSync(
      path.join(templateDir, 'quanthum.json'),
      JSON.stringify(
        {
          name: 'teste',
          version: '0.1.0',
          placeholders: {
            APP_NAME: { prompt: 'Nome do projeto', files: ['app.txt'] },
          },
          setup: ['echo done > setup.log'],
        },
        null,
        2,
      ),
    );
    fs.writeFileSync(path.join(templateDir, 'app.txt'), 'Projeto: APP_NAME\n');

    await initGitRepo(templateDir);

    // Template com eixo de variante — uma opção declara supportsPostSetup, a
    // outra não (espelha o caso real: Aquiles "react" tem shadcn/ui, os
    // Livewire não têm).
    templateComVariantesDir = path.join(workDir, 'template-com-variantes');
    fs.mkdirSync(templateComVariantesDir);
    fs.writeFileSync(
      path.join(templateComVariantesDir, 'quanthum.json'),
      JSON.stringify(
        {
          name: 'com-variantes',
          version: '0.1.0',
          variants: {
            frontend: {
              prompt: 'Frontend?',
              default: 'shadcn',
              options: {
                shadcn: { path: 'variants/shadcn', supportsPostSetup: true, setup: [] },
                plain: { path: 'variants/plain', setup: [] },
              },
            },
          },
          setup: ['echo done > setup.log'],
        },
        null,
        2,
      ),
    );
    // git não versiona diretório vazio — precisa de um arquivo dentro pra
    // "variants/shadcn"/"variants/plain" sobreviverem ao clone.
    fs.mkdirSync(path.join(templateComVariantesDir, 'variants', 'shadcn'), { recursive: true });
    fs.writeFileSync(path.join(templateComVariantesDir, 'variants', 'shadcn', 'marker.txt'), 'shadcn\n');
    fs.mkdirSync(path.join(templateComVariantesDir, 'variants', 'plain'), { recursive: true });
    fs.writeFileSync(path.join(templateComVariantesDir, 'variants', 'plain', 'marker.txt'), 'plain\n');
    await initGitRepo(templateComVariantesDir);

    registryPath = path.join(workDir, 'registry.json');
    fs.writeFileSync(
      registryPath,
      JSON.stringify(
        {
          teste: { repo: templateDir, version: 'latest', description: 'Template de teste' },
          'com-post-setup': {
            repo: templateDir,
            version: 'latest',
            description: 'Template de teste com tema/blocos anexados',
            postSetup: ['echo tema >> setup.log', 'echo bloco >> setup.log'],
          },
          'com-variantes': {
            repo: templateComVariantesDir,
            version: 'latest',
            description: 'Template com variante shadcn-compatível e uma que não é',
            postSetup: ['echo tema >> setup.log'],
          },
        },
        null,
        2,
      ),
    );
  });

  afterAll(() => {
    fs.rmSync(workDir, { recursive: true, force: true });
  });

  it('clona, recria o git, aplica placeholders, roda o setup e grava o marker', async () => {
    const { destDir } = await runNew({
      archetype: 'teste',
      name: 'minha-app',
      cwd: workDir,
      registryPath,
      set: { APP_NAME: 'Minha App' },
      interactive: false,
    });

    expect(fs.existsSync(destDir)).toBe(true);
    expect(fs.readFileSync(path.join(destDir, 'app.txt'), 'utf-8')).toBe('Projeto: Minha App\n');
    expect(fs.readFileSync(path.join(destDir, 'setup.log'), 'utf-8').trim()).toBe('done');

    const marker = JSON.parse(fs.readFileSync(path.join(destDir, '.quanthum-archetype'), 'utf-8'));
    expect(marker.archetype).toBe('teste');
    expect(marker.version).toBe('latest');
    expect(typeof marker.generatedAt).toBe('string');

    // histórico git recriado do zero: só o commit de scaffold, nada do template original.
    const log = await execa('git', ['log', '--format=%s'], { cwd: destDir });
    expect(log.stdout.trim().split('\n')).toEqual(['Scaffold from quanthum-teste@latest']);
  });

  it('roda postSetup do registry depois do setup do manifest, na ordem', async () => {
    const { destDir } = await runNew({
      archetype: 'com-post-setup',
      name: 'app-com-tema',
      cwd: workDir,
      registryPath,
      set: { APP_NAME: 'App com tema' },
      interactive: false,
    });

    const log = fs.readFileSync(path.join(destDir, 'setup.log'), 'utf-8').trim().split('\n');
    expect(log).toEqual(['done', 'tema', 'bloco']);
  });

  it('roda postSetup quando a variante escolhida declara supportsPostSetup', async () => {
    const { destDir } = await runNew({
      archetype: 'com-variantes',
      name: 'app-shadcn',
      cwd: workDir,
      registryPath,
      variants: { frontend: 'shadcn' },
      interactive: false,
    });

    const log = fs.readFileSync(path.join(destDir, 'setup.log'), 'utf-8').trim().split('\n');
    expect(log).toEqual(['done', 'tema']);
  });

  it('pula postSetup quando a variante escolhida NÃO declara supportsPostSetup', async () => {
    const { destDir } = await runNew({
      archetype: 'com-variantes',
      name: 'app-plain',
      cwd: workDir,
      registryPath,
      variants: { frontend: 'plain' },
      interactive: false,
    });

    const log = fs.readFileSync(path.join(destDir, 'setup.log'), 'utf-8').trim().split('\n');
    expect(log).toEqual(['done']);
  });

  it('recusa se o diretório de destino já existe', async () => {
    const existing = path.join(workDir, 'ja-existe');
    fs.mkdirSync(existing);

    await expect(
      runNew({ archetype: 'teste', name: 'ja-existe', cwd: workDir, registryPath, interactive: false }),
    ).rejects.toThrow(/já existe/);
  });

  it('erro claro quando o arquétipo não existe no registry', async () => {
    await expect(
      runNew({ archetype: 'nao-existe', name: 'outra-app', cwd: workDir, registryPath, interactive: false }),
    ).rejects.toThrow(/não encontrado no registry/);
  });

  it('modo não interativo falha se faltar um --set', async () => {
    await expect(
      runNew({ archetype: 'teste', name: 'sem-set', cwd: workDir, registryPath, interactive: false }),
    ).rejects.toThrow(/APP_NAME.*não foi definido/);
  });
});
