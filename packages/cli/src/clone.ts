import fs from 'node:fs';
import path from 'node:path';
import { execa } from 'execa';

export async function cloneTemplate(repo: string, version: string, destDir: string): Promise<void> {
  const args = ['clone', '--depth', '1'];
  if (version && version !== 'latest') {
    args.push('--branch', version);
  }
  args.push(repo, destDir);
  await execa('git', args, { stdio: 'inherit' });
}

/** Remove o histórico git do template e começa um novo, limpo, a partir do scaffold. */
export async function reinitGit(destDir: string, archetype: string, version: string): Promise<void> {
  fs.rmSync(path.join(destDir, '.git'), { recursive: true, force: true });
  await execa('git', ['init'], { cwd: destDir, stdio: 'inherit' });
  // config local — não depende do git global estar configurado na máquina que roda o CLI.
  await execa('git', ['config', 'user.email', 'cli@quanthum.tech'], { cwd: destDir });
  await execa('git', ['config', 'user.name', 'Quanthum CLI'], { cwd: destDir });
  await execa('git', ['add', '-A'], { cwd: destDir, stdio: 'inherit' });
  await execa('git', ['commit', '-m', `Scaffold from quanthum-${archetype}@${version}`], {
    cwd: destDir,
    stdio: 'inherit',
  });
}
