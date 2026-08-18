import figlet from 'figlet';

// Verde da marca (#06d889, o --color-primary do tema "quanthum" no quanthum-portal)
// via truecolor ANSI — sem depender de chalk/picocolors só por causa de uma cor.
const GREEN = '\x1b[38;2;6;216;137m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

/**
 * "Standard"/fontes maiores do figlet passam de 150 colunas pra "QUANTHUM
 * ARCHITECTURE" — não cabe num terminal comum. "Small" fica em 48 colunas só
 * pra "QUANTHUM"; "ARCHITECTURE" vai como subtítulo em texto normal (mesmo
 * padrão do header do quanthum-portal: wordmark grande + subtítulo
 * tracked-out em caixa alta).
 */
export function printBanner(): void {
  const wordmark = figlet.textSync('QUANTHUM', { font: 'Small' });
  console.log(GREEN + wordmark + RESET);
  console.log(DIM + '  A R C H I T E C T U R E' + RESET);
  console.log();
}
