import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execa } from 'execa';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const binPath = path.resolve(__dirname, '../bin/quanthum-aquiles.js');

async function initGitRepo(dir: string): Promise<void> {
  await execa('git', ['init'], { cwd: dir });
  await execa('git', ['config', 'user.email', 'test@example.com'], { cwd: dir });
  await execa('git', ['config', 'user.name', 'Test'], { cwd: dir });
  await execa('git', ['add', '-A'], { cwd: dir });
  await execa('git', ['commit', '-m', 'template inicial'], { cwd: dir });
}

describe('quanthum-aquiles (wrapper)', () => {
  let workDir: string;
  let templateDir: string;
  let registryPath: string;

  beforeAll(async () => {
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'quanthum-aquiles-test-'));
    templateDir = path.join(workDir, 'template-aquiles');
    fs.mkdirSync(templateDir);

    fs.writeFileSync(
      path.join(templateDir, 'quanthum.json'),
      JSON.stringify({
        name: 'aquiles',
        version: '0.1.0',
        placeholders: { APP_NAME: { prompt: 'Nome', files: ['app.txt'] } },
        setup: [],
      }),
    );
    fs.writeFileSync(path.join(templateDir, 'app.txt'), 'APP_NAME');

    await initGitRepo(templateDir);

    registryPath = path.join(workDir, 'registry.json');
    fs.writeFileSync(
      registryPath,
      JSON.stringify({ aquiles: { repo: templateDir, version: 'latest' } }),
    );
  });

  afterAll(() => {
    fs.rmSync(workDir, { recursive: true, force: true });
  });

  it('chama o mesmo motor do quanthum-cli com o arquétipo fixo em "aquiles"', async () => {
    await execa('node', [binPath, 'minha-app-aquiles', '--set', 'APP_NAME=Teste', '--yes'], {
      cwd: workDir,
      env: { ...process.env, QUANTHUM_REGISTRY: registryPath },
    });

    const destDir = path.join(workDir, 'minha-app-aquiles');
    expect(fs.existsSync(destDir)).toBe(true);
    expect(fs.readFileSync(path.join(destDir, 'app.txt'), 'utf-8')).toBe('Teste');

    const marker = JSON.parse(fs.readFileSync(path.join(destDir, '.quanthum-archetype'), 'utf-8'));
    expect(marker.archetype).toBe('aquiles');
  });

  it('--registry <url> aponta pro registry certo (não só a env QUANTHUM_REGISTRY)', async () => {
    await execa('node', [binPath, 'minha-app-via-flag', '--set', 'APP_NAME=ViaFlag', '--yes', '--registry', registryPath], {
      cwd: workDir,
    });

    const destDir = path.join(workDir, 'minha-app-via-flag');
    expect(fs.existsSync(destDir)).toBe(true);
    expect(fs.readFileSync(path.join(destDir, 'app.txt'), 'utf-8')).toBe('ViaFlag');
  });

  it('sem argumento de nome, imprime uso e sai com código != 0', async () => {
    await expect(execa('node', [binPath], { cwd: workDir })).rejects.toMatchObject({
      exitCode: 1,
    });
  });
});
