import { printSetupProgress, runTrackedCommand } from './tui.js';

/**
 * `shell: true` deixa o Node escolher o shell padrão do SO — no Windows isso é
 * cmd.exe, não bash. Todo comando de `setup`/`postSetup` que este motor roda
 * (aqui, nos templates, e o que o portal gera pra tema/blocos anexados) é
 * escrito em sintaxe POSIX (`&&`, subshells `(...)`, `sed`, `printf`, redirects
 * tipo `2>/dev/null`) — no cmd.exe isso quebra com erro de sintaxe genérico
 * (reproduzido ao vivo: aspas duplicadas, "A sintaxe do comando está
 * incorreta"). Forçar bash explicitamente, em vez de deixar o SO escolher,
 * resolve pra Windows (usa o bash do Git for Windows, que a instalação do
 * CLI já exige) sem mudar nada em Linux/macOS (onde já era compatível).
 */
export async function runSetup(destDir: string, commands: string[]): Promise<void> {
  const total = commands.length;
  let index = 0;
  for (const command of commands) {
    index += 1;
    // runTrackedCommand: comandos de setup/postSetup são arbitrários (do
    // template ou configurados no portal) e podem legitimamente pedir
    // confirmação (ex.: npx shadcn add sem -y/-o) — precisa do mecanismo de
    // revelar saída ao vivo se demorar de mais.
    await runTrackedCommand(`[${index}/${total}] ${command}`, command, [], destDir, { shell: 'bash' });
    printSetupProgress(index, total);
  }
}
