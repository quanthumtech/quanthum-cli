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

function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1b\[[0-9;]*m/g, '');
}

/** Escreve `right` colado na borda direita do terminal, na mesma linha de `left` — usado pro "NN%" ao lado do label. */
function withRightAligned(left: string, right: string): string {
  const width = terminalWidth();
  const gap = width - stripAnsi(left).length - stripAnsi(right).length;
  return gap > 1 ? `${left}${' '.repeat(gap)}${right}` : `${left} ${right}`;
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
function createSpinner(): {
  start(label: string): void;
  pause(): void;
  stop(label: string, progress?: string): void;
} {
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
    /** `progress` (ex. "40%") fica colado na borda direita, na mesma linha — evita uma linha extra só pra barra. */
    stop(label: string, progress?: string) {
      if (timer) {
        clearInterval(timer);
        timer = undefined;
      }
      const reserve = progress ? progress.length + 2 : 0;
      const line = truncateForLine(label, reserve);
      process.stdout.write(`\r\x1b[K${progress ? withRightAligned(line, `${DIM}${progress}${RESET}`) : line}\n`);
    },
  };
}

/**
 * Envolve uma etapa lógica que não é ela mesma um processo externo (ex.: o
 * bundle de `git init/config/add/commit` do reinitGit) com spinner — ou, sem
 * TTY (pipeline/CI sem `-it`), com uma linha só por etapa, sem cursor tricks
 * poluindo o log.
 */
export async function step<T>(label: string, fn: () => Promise<T>, progress?: string): Promise<T> {
  if (!process.stdout.isTTY || verboseEnabled) {
    log.step(progress ? `${label} (${progress})` : label);
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
    s.stop(`${GREEN}✔${RESET} ${label}`, progress);
    return result;
  } catch (err) {
    s.stop(`${RED}✖${RESET} ${label}`, progress);
    throw err;
  }
}

/**
 * Se o comando ficar `IDLE_REVEAL_MS` sem produzir nenhuma saída (não "sem
 * terminar" — sem *saída*), ele pode ter caído num prompt de confirmação que
 * a captura de stdio deixa invisível (`git clone` pedindo usuário/senha,
 * `npx shadcn add` com um menu de seleção em tela cheia etc. — visto ao vivo:
 * nem sempre é um simples "y/n", às vezes é um menu com setinha que precisa
 * aparecer pra dar pra navegar). Baseado em ociosidade (não em tempo total
 * decorrido) porque comandos legítimos e lentos mas que streamam saída sem
 * parar (`npm install`, `npx shadcn add` baixando registry) NÃO estão presos
 * — só ficam mais devagar que 20s; um prompt escondido, ao contrário, para de
 * produzir qualquer saída até alguém responder. `MIN_ELAPSED_MS` evita
 * revelar por causa de uma pausa curta e normal logo no início do comando.
 * Em vez de só avisar, revela a saída capturada até agora e passa a espelhar
 * o que for chegando dali em diante — stdin já está herdado, então dá pra
 * responder normalmente assim que a pergunta aparecer.
 */
const IDLE_REVEAL_MS = 12_000;
const MIN_ELAPSED_MS = 8_000;

/**
 * Roda um comando externo que pode legitimamente demorar (rede) ou pedir
 * confirmação (git clone com credencial, setup/postSetup de template) —
 * spinner de uma linha só enquanto roda liso, e se ficar `IDLE_REVEAL_MS`
 * sem produzir saída nenhuma, revela a saída ao vivo (a acumulada até agora +
 * o que for chegando), porque pode ser um prompt escondido atrás do spinner
 * esperando resposta. `progress` (ex. "40%"), se passado, fica colado na
 * borda direita da linha final — não gera uma linha extra só pra barra.
 */
export async function runTrackedCommand(
  label: string,
  command: string,
  args: string[],
  cwd: string,
  options: { shell?: boolean | string } = {},
  progress?: string,
): Promise<void> {
  if (verboseEnabled) {
    log.step(progress ? `${label} (${progress})` : label);
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
    log.step(progress ? `${label} (${progress})` : label);
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
  const startedAt = Date.now();
  let lastOutputAt = startedAt;

  function reveal(): void {
    revealed = true;
    spin.pause();
    process.stdout.write(
      `${YELLOW}⚠ "${truncateForLine(label, 0)}" sem saída há ${Math.round(IDLE_REVEAL_MS / 1000)}s — mostrando ao vivo (pode ter um prompt esperando resposta; responda normalmente):${RESET}\n`,
    );
    if (buffered) {
      process.stdout.write(buffered);
      buffered = '';
    }
  }

  const idleCheck = setInterval(() => {
    if (revealed) {
      return;
    }
    const now = Date.now();
    if (now - startedAt >= MIN_ELAPSED_MS && now - lastOutputAt >= IDLE_REVEAL_MS) {
      reveal();
    }
  }, 1000);
  idleCheck.unref?.();

  subprocess.all?.on('data', (chunk: Buffer) => {
    lastOutputAt = Date.now();
    const text = chunk.toString('utf-8');
    if (revealed) {
      process.stdout.write(text);
    } else {
      buffered = (buffered + text).slice(-20_000);
    }
  });

  try {
    await subprocess;
    clearInterval(idleCheck);
    if (revealed) {
      const line = `${GREEN}✔${RESET} ${label}`;
      console.log(progress ? withRightAligned(line, `${DIM}${progress}${RESET}`) : line);
    } else {
      spin.stop(`${GREEN}✔${RESET} ${label}`, progress);
    }
  } catch (err) {
    clearInterval(idleCheck);
    if (revealed) {
      console.log(`${RED}✖${RESET} ${label}`);
    } else {
      spin.stop(`${RED}✖${RESET} ${label}`, progress);
    }
    throw toCommandError(err);
  }
}

/** Formata "current/total" como percentual pra colar na borda direita da linha do comando (ver `step`/`runTrackedCommand`). */
export function formatProgress(current: number, total: number): string {
  const pct = total > 0 ? Math.round((current / total) * 100) : 100;
  return `${pct}%`;
}

/**
 * Anúncio de seção sem spinner (ex. "Aplicando placeholders" antes de um
 * prompt interativo que não pode conviver com o spinner rodando) — uma linha
 * só, sem os marcadores ◇/│ do @clack/prompts, pra manter o mesmo estilo
 * visual do resto do output (✔/spinner).
 */
export function note(label: string): void {
  console.log(`${DIM}${label}${RESET}`);
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
