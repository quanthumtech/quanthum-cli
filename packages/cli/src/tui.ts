import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { execa } from 'execa';
import { log, outro } from '@clack/prompts';

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

function toCommandError(err: unknown): CommandError {
  const execaErr = err as { all?: string; shortMessage?: string; message: string };
  return new CommandError(execaErr.shortMessage ?? execaErr.message, execaErr.all);
}

/**
 * Roda um processo externo simples (git init/config/add/commit — local,
 * instantâneo, nunca pede input). Em modo verboso, herda o stdio (saída ao
 * vivo). Fora dele, captura stdout/stderr (stdin continua herdado) — quem
 * chama decide se mostra (a saída só aparece se der erro). Pra comandos que
 * podem legitimamente demorar ou pedir confirmação (git clone, setup),
 * use `runTrackedCommand` — este aqui não tem o mecanismo de "revelar saída
 * ao vivo se travar".
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
      await execa(command, { cwd, shell: options.shell, stdin: 'inherit', all: true });
    } else {
      await execa(command, args, { cwd, stdin: 'inherit', all: true });
    }
  } catch (err) {
    throw toCommandError(err);
  }
}

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

function truncateForLine(label: string, reserve: number): string {
  const max = Math.max(10, terminalWidth() - reserve);
  return label.length > max ? `${label.slice(0, max - 1)}…` : label;
}

/**
 * Spinner de uma linha só, escrito à mão — sem depender do `spinner()` do
 * @clack/prompts. Aquele redesenha movendo o cursor entre linhas (não
 * sobrescreve no lugar em vários terminais — WSL/Windows Terminal incluso —
 * o que virava centenas de linhas repetidas em steps longos tipo `composer
 * require`/`npx shadcn add`) e registra um listener de processo por chamada
 * sem nunca remover (o "MaxListenersExceededWarning" acontecia porque cada
 * step() cria um spinner novo — aqui, 10+ por rodada). Este usa só `\r` +
 * "apaga até o fim da linha" (sem mover linha), e não registra listener
 * nenhum.
 */
function createSpinner(): { start(label: string): void; pause(): void; stop(label: string): void } {
  let timer: ReturnType<typeof setInterval> | undefined;
  let frame = 0;

  function render(label: string): void {
    const glyph = SPINNER_FRAMES[frame % SPINNER_FRAMES.length];
    process.stdout.write(`\r\x1b[K${GREEN}${glyph}${RESET} ${truncateForLine(label, 4)}`);
    frame += 1;
  }

  return {
    start(label: string) {
      frame = 0;
      render(label);
      timer = setInterval(() => render(label), 90);
      timer.unref?.();
    },
    /** Para a animação e limpa a linha sem escrever um label final — usado antes de revelar saída ao vivo. */
    pause() {
      if (timer) {
        clearInterval(timer);
        timer = undefined;
      }
      process.stdout.write('\r\x1b[K');
    },
    stop(label: string) {
      if (timer) {
        clearInterval(timer);
        timer = undefined;
      }
      process.stdout.write(`\r\x1b[K${truncateForLine(label, 0)}\n`);
    },
  };
}

/**
 * Envolve uma etapa lógica que não é ela mesma um processo externo (ex.: o
 * bundle de `git init/config/add/commit` do reinitGit) com spinner — ou, sem
 * TTY (pipeline/CI sem `-it`), com uma linha só por etapa, sem cursor tricks
 * poluindo o log.
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

  const s = createSpinner();
  s.start(label);
  try {
    const result = await fn();
    s.stop(`${GREEN}✔${RESET} ${label}`);
    return result;
  } catch (err) {
    s.stop(`${RED}✖${RESET} ${label}`);
    throw err;
  }
}

/**
 * Passado esse tanto de tempo sem terminar, o comando pode não estar só
 * "demorado" — pode ter caído num prompt de confirmação que a captura de
 * stdio deixa invisível (`git clone` pedindo usuário/senha, `npx shadcn add`
 * com um menu de seleção em tela cheia etc. — visto ao vivo: nem sempre é
 * um simples "y/n", às vezes é um menu com setinha que precisa aparecer pra
 * dar pra navegar). Em vez de só avisar, revela a saída capturada até agora
 * e passa a espelhar o que for chegando dali em diante — stdin já está
 * herdado, então dá pra responder normalmente assim que a pergunta aparecer.
 */
const STUCK_REVEAL_MS = 20_000;

/**
 * Roda um comando externo que pode legitimamente demorar (rede) ou pedir
 * confirmação (git clone com credencial, setup/postSetup de template) —
 * spinner de uma linha só enquanto roda liso, e se passar de
 * `STUCK_REVEAL_MS` sem terminar, revela a saída ao vivo (a acumulada até
 * agora + o que for chegando), porque pode ser um prompt escondido atrás do
 * spinner esperando resposta.
 */
export async function runTrackedCommand(
  label: string,
  command: string,
  args: string[],
  cwd: string,
  options: { shell?: boolean | string } = {},
): Promise<void> {
  if (verboseEnabled) {
    log.step(label);
    try {
      if (options.shell) {
        await execa(command, { cwd, shell: options.shell, stdio: 'inherit' });
      } else {
        await execa(command, args, { cwd, stdio: 'inherit' });
      }
    } catch (err) {
      throw toCommandError(err);
    }
    return;
  }

  if (!process.stdout.isTTY) {
    // Sem TTY não tem como o usuário ver/responder prompt nenhum de qualquer
    // forma — mantém só captura (convenção já documentada: comandos aqui
    // precisam ser não-interativos, ex. Docker/CI sem -it).
    log.step(label);
    try {
      if (options.shell) {
        await execa(command, { cwd, shell: options.shell, stdin: 'inherit', all: true });
      } else {
        await execa(command, args, { cwd, stdin: 'inherit', all: true });
      }
    } catch (err) {
      log.error(label);
      throw toCommandError(err);
    }
    return;
  }

  const subprocess = options.shell
    ? execa(command, { cwd, shell: options.shell, stdin: 'inherit', all: true })
    : execa(command, args, { cwd, stdin: 'inherit', all: true });

  const spin = createSpinner();
  spin.start(label);

  let revealed = false;
  let buffered = '';
  const revealTimer = setTimeout(() => {
    revealed = true;
    spin.pause();
    process.stdout.write(
      `${YELLOW}⚠ "${truncateForLine(label, 0)}" ainda rodando depois de ${Math.round(STUCK_REVEAL_MS / 1000)}s — mostrando a saída ao vivo (pode ter um prompt esperando resposta; responda normalmente):${RESET}\n`,
    );
    if (buffered) {
      process.stdout.write(buffered);
      buffered = '';
    }
  }, STUCK_REVEAL_MS);
  revealTimer.unref?.();

  subprocess.all?.on('data', (chunk: Buffer) => {
    const text = chunk.toString('utf-8');
    if (revealed) {
      process.stdout.write(text);
    } else {
      buffered = (buffered + text).slice(-20_000);
    }
  });

  try {
    await subprocess;
    clearTimeout(revealTimer);
    if (revealed) {
      console.log(`${GREEN}✔${RESET} ${label}`);
    } else {
      spin.stop(`${GREEN}✔${RESET} ${label}`);
    }
  } catch (err) {
    clearTimeout(revealTimer);
    if (revealed) {
      console.log(`${RED}✖${RESET} ${label}`);
    } else {
      spin.stop(`${RED}✖${RESET} ${label}`);
    }
    throw toCommandError(err);
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
