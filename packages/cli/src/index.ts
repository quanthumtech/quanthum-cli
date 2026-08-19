#!/usr/bin/env node
import { Command } from 'commander';
import { runNew } from './commands/new.js';
import { DEFAULT_LIVE_REGISTRY_URL } from './registry.js';
import { printErrorBox, setVerbose } from './tui.js';
import { parseVariantFlags } from './variant-flags.js';

function collectSet(value: string, previous: Record<string, string>): Record<string, string> {
  const [key, ...rest] = value.split('=');
  if (!key || rest.length === 0) {
    throw new Error(`--set inválido: "${value}" (formato esperado: CHAVE=valor)`);
  }
  previous[key] = rest.join('=');
  return previous;
}

const program = new Command();

program.name('quanthum').description('Quanthum Architecture — CLI de scaffolding').version('0.1.0');

program
  .command('new <archetype> <name>')
  .description('Cria um novo projeto a partir de um arquétipo do registry')
  .option('--set <CHAVE=valor>', 'Define um placeholder sem prompt interativo (repetível)', collectSet, {})
  .option('--yes', 'Modo não interativo — falha se faltar algum --set ou variante', false)
  .option('--verbose', 'Mostra a saída bruta (stdio herdado) de cada comando em vez do spinner/resumo', false)
  // [valor] (não <valor>): opcional — "--registry" sozinho, sem URL, usa
  // DEFAULT_LIVE_REGISTRY_URL (o registry ao vivo oficial da Quanthum).
  .option('--registry [path-ou-url]', `Registry alternativo — caminho local, URL http(s), ou vazio pro ao vivo oficial (${DEFAULT_LIVE_REGISTRY_URL})`)
  // Eixos de variante (ex.: --frontend=react) são declarados pelo template, não pelo CLI —
  // por isso não têm .option() próprio; allowUnknownOption() deixa commander não rejeitar
  // essas flags, e parseVariantFlags() as extrai do argv cru abaixo.
  .allowUnknownOption()
  .action(async (archetype: string, name: string, opts) => {
    setVerbose(Boolean(opts.verbose));
    try {
      await runNew({
        archetype,
        name,
        set: opts.set,
        variants: parseVariantFlags(process.argv.slice(2)),
        interactive: !opts.yes,
        // commander marca opts.registry como `true` (não a string) quando a flag
        // vem sem valor — é aí que cai pro registry ao vivo oficial.
        registryPath: opts.registry === true ? DEFAULT_LIVE_REGISTRY_URL : opts.registry,
      });
    } catch (err) {
      printErrorBox(err);
      process.exitCode = 1;
    }
  });

program.parse();
