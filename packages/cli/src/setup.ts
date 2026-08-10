import { execa } from 'execa';

/** Roda, em sequência, os comandos de `setup` do manifesto, com output ao vivo. */
export async function runSetup(destDir: string, commands: string[]): Promise<void> {
  for (const command of commands) {
    console.log(`\n$ ${command}`);
    await execa(command, { cwd: destDir, shell: true, stdio: 'inherit' });
  }
}
