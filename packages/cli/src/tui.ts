import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { execa } from 'execa';
import { log, outro, spinner } from '@clack/prompts';

// Mesma paleta do banner (#06d889 = --color-primary do tema "quanthum" no
// quanthum-portal) via truecolor ANSI — sem depender de chalk/picocolors.
export const GREEN = '\x1b[38;2;6;216;137m';
export const RED = '\x1b[38;2;255;90;90m';
export const YELLOW = '\x1b[38;2;255;196;0m';
export const DIM = '\x1b[2m';
export const BOLD = '\x1b[1m';
export const RESET = '\x1b[0m';

let verboseEnabled = false;

/** Ligado por `--verbose` — volta ao comportamento antigo (stdio herdado, sem spinner nem captura). */
export function setVerbose(value: boolean): void {
  verboseEnabled = value;
}

export function isVerbose(): boolean {
  return verboseEnabled;
}

function readPackageVersion(): string {
  try {
    const dir = path.dirname(fileURLToPath(import.meta.url));
    const pkgPath = path.join(dir, '..', 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as { version?: string };
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

export const CLI_VERSION = readPackageVersion();

function terminalWidth(): number {
  return Math.min(process.stdout.columns || 80, 88);
}

/** Erro de um comando externo que falhou — carrega a saída capturada pra exibição no box de erro. */
export class CommandError extends Error {
  constructor(
    message: string,
    public readonly output?: string,
  ) {
    super(message);
    this.name = 'CommandError';
  }
}

/**
 * Roda um processo externo. Em modo verboso, herda o stdio (comportamento
 * antigo, saída ao vivo linha a linha). Fora dele, captura tudo — quem chama
 * decide se mostra (spinner cobre a espera; a saída só aparece se der erro).
 */
export async function execTracked(
  command: string,
  args: string[],
  cwd: string,
  options: { shell?: boolean | string } = {},
): Promise<void> {
  try {
    if (verboseEnabled) {
      if (options.shell) {
        await execa(command, { cwd, shell: options.shell, stdio: 'inherit' });
      } else {
        await execa(command, args, { cwd, stdio: 'inherit' });
      }
      return;
    }

    if (options.shell) {
      await execa(command, { cwd, shell: options.shell, all: true });
    } else {
      await execa(command, args, { cwd, all: true });
    }
  } catch (err) {
    const execaErr = err as { all?: string; shortMessage?: string; message: string };
    throw new CommandError(execaErr.shortMessage ?? execaErr.message, execaErr.all);
  }
}

/**
 * Envolve uma etapa lógica (pode conter vários `execTracked`) com spinner —
 * ou, sem TTY (pipeline/CI sem `-it`), com uma linha só por etapa, sem
 * cursor tricks poluindo o log.
 */
export async function step<T>(label: string, fn: () => Promise<T>): Promise<T> {
  if (!process.stdout.isTTY || verboseEnabled) {
    log.step(label);
    try {
      return await fn();
    } catch (err) {
      log.error(label);
      throw err;
    }
  }

  const s = spinner();
  s.start(label);
  try {
    const result = await fn();
    s.stop(`${GREEN}✔${RESET} ${label}`);
    return result;
  } catch (err) {
    s.stop(`${RED}✖${RESET} ${label}`, 1);
    throw err;
  }
}

function renderProgressBar(current: number, total: number, width = 30): string {
  const ratio = total > 0 ? current / total : 1;
  const filled = Math.round(width * ratio);
  const bar = '█'.repeat(filled) + '░'.repeat(Math.max(0, width - filled));
  const pct = Math.round(ratio * 100);
  return `${GREEN}[${bar}]${RESET} ${pct}% | ${current}/${total} comandos`;
}

export function printSetupProgress(current: number, total: number): void {
  if (total <= 1) {
    return;
  }
  console.log(`  ${DIM}Progresso do setup${RESET}  ${renderProgressBar(current, total)}`);
}

export function printBanner(archetype: string, target: string, flagsSummary: string): void {
  console.log(`${GREEN}⚡ PROJETANDO ARQUÉTIPO:${RESET} ${BOLD}${archetype}${RESET} ${DIM}(quanthum-cli v${CLI_VERSION})${RESET}`);
  const width = terminalWidth();
  const targetLabel = `Destino: ${target}`;
  const flagsLabel = flagsSummary ? `Flags: ${flagsSummary}` : '';
  const rightLabel = flagsLabel ? ` ${flagsLabel} ───` : '───';
  const leftLabel = ` ${targetLabel} `;
  const dashes = Math.max(3, width - leftLabel.length - rightLabel.length - 3);
  console.log(`${DIM}───${leftLabel}${'─'.repeat(dashes)}${rightLabel}${RESET}`);
  console.log();
}

export function printSuccess(message: string, hint?: string): void {
  outro(`${GREEN}${BOLD}✔${RESET} ${message}${hint ? `\n${DIM}  ${hint}${RESET}` : ''}`);
}

function wrap(text: string, width: number): string[] {
  if (text === '') {
    return [''];
  }
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > width && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) {
    lines.push(current);
  }
  return lines;
}

function printBox(lines: string[], opts: { title: string; color: string }): void {
  const width = terminalWidth();
  const innerWidth = width - 4;
  const { title, color } = opts;

  const dashCount = Math.max(1, width - title.length - 5);
  console.error(`${color}┌─ ${title} ${'─'.repeat(dashCount)}┐${RESET}`);
  console.error(`${color}│${RESET}${' '.repeat(width - 2)}${color}│${RESET}`);
  for (const raw of lines) {
    for (const line of wrap(raw, innerWidth)) {
      console.error(`${color}│ ${RESET}${line.padEnd(innerWidth)}${color} │${RESET}`);
    }
  }
  console.error(`${color}│${RESET}${' '.repeat(width - 2)}${color}│${RESET}`);
  console.error(`${color}└${'─'.repeat(width - 2)}┘${RESET}`);
}

/**
 * Bloco de erro destacado — em vez de deixar o stack trace bruto estourar no
 * terminal, isola causa + saída capturada (se veio de um comando) + sugestões
 * num box vermelho.
 */
export function printErrorBox(err: unknown): void {
  const isCommandError = err instanceof CommandError;
  const message = err instanceof Error ? err.message : String(err);

  const lines: string[] = [message];

  if (isCommandError && err.output) {
    const tail = err.output.trim().split('\n').filter(Boolean).slice(-12);
    if (tail.length > 0) {
      lines.push('');
      lines.push('Saída do comando (últimas linhas):');
      lines.push(...tail);
    }
  }

  lines.push('');
  lines.push('Sugestões de resolução:');
  lines.push('1. Verifique sua conexão com a internet.');
  lines.push('2. Confirme que o git está autenticado no GitHub com acesso de leitura ao repositório do arquétipo.');
  lines.push('3. Rode o comando novamente com --verbose pra ver a saída completa de cada passo.');

  console.error();
  console.error(`${RED}${BOLD}✖ ERRO NO SETUP DO ARQUÉTIPO${RESET}`);
  console.error();
  printBox(lines, { title: `[ERROR] ${isCommandError ? 'Falha ao rodar comando' : 'Falha no setup'}`, color: RED });
  console.error();
}

export function printVerboseHint(): void {
  if (!verboseEnabled) {
    console.log(`${DIM}Dica: rode com --verbose pra ver a saída completa de cada comando.${RESET}`);
    console.log();
  }
}
