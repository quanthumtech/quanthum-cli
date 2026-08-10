#!/usr/bin/env node
import { Command } from 'commander';
import { runNew } from './commands/new.js';
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
  .option('--registry <path-ou-url>', 'Caminho local ou URL http(s) para um registry.json alternativo (ex.: o /registry.json de um control plane)')
  // Eixos de variante (ex.: --frontend=react) são declarados pelo template, não pelo CLI —
  // por isso não têm .option() próprio; allowUnknownOption() deixa commander não rejeitar
  // essas flags, e parseVariantFlags() as extrai do argv cru abaixo.
  .allowUnknownOption()
  .action(async (archetype: string, name: string, opts) => {
    try {
      await runNew({
        archetype,
        name,
        set: opts.set,
        variants: parseVariantFlags(process.argv.slice(2)),
        interactive: !opts.yes,
        registryPath: opts.registry,
      });
    } catch (err) {
      console.error(`\n✖ ${(err as Error).message}`);
      process.exitCode = 1;
    }
  });

program.parse();
