import fs from 'node:fs';
import path from 'node:path';
import { execTracked, runTrackedCommand } from './tui.js';

export async function cloneTemplate(repo: string, version: string, destDir: string): Promise<void> {
  const args = ['clone', '--depth', '1'];
  if (version && version !== 'latest') {
    args.push('--branch', version);
  }
  args.push(repo, destDir);
  // runTrackedCommand (não execTracked): git pedindo usuário/senha (repo
  // privado sem credencial cacheada) é um prompt real que fica escondido
  // atrás do spinner — precisa do mecanismo de revelar saída se demorar.
  await runTrackedCommand(`Clonando ${repo} (${version})`, 'git', args, process.cwd());
}

/** Remove o histórico git do template e começa um novo, limpo, a partir do scaffold. */
export async function reinitGit(destDir: string, archetype: string, version: string): Promise<void> {
  fs.rmSync(path.join(destDir, '.git'), { recursive: true, force: true });
  await execTracked('git', ['init'], destDir);
  // config local — não depende do git global estar configurado na máquina que roda o CLI.
  await execTracked('git', ['config', 'user.email', 'cli@quanthum.tech'], destDir);
  await execTracked('git', ['config', 'user.name', 'Quanthum CLI'], destDir);
  await execTracked('git', ['add', '-A'], destDir);
  await execTracked('git', ['commit', '-m', `Scaffold from quanthum-${archetype}@${version}`], destDir);
}
