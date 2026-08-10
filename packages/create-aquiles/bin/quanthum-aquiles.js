#!/usr/bin/env node
// Wrapper fino: mesmo motor do `quanthum`, arquétipo fixo em "aquiles".
// Nenhuma lógica de scaffolding vive aqui — só parsing de argv chamando runNew().
import { parseVariantFlags, runNew } from '@quanthum/cli';

const [name, ...rest] = process.argv.slice(2);

if (!name || name.startsWith('-')) {
  console.error('Uso: quanthum-aquiles <nome-do-projeto> [--frontend=react|livewire-mary|livewire-daisy|livewire-tall] [--set CHAVE=valor] [--yes]');
  process.exit(1);
}

const set = {};
let interactive = true;

for (let i = 0; i < rest.length; i++) {
  if (rest[i] === '--set') {
    const raw = rest[++i] ?? '';
    const [key, ...valueParts] = raw.split('=');
    if (!key || valueParts.length === 0) {
      console.error(`--set inválido: "${raw}" (formato esperado: CHAVE=valor)`);
      process.exit(1);
    }
    set[key] = valueParts.join('=');
  } else if (rest[i] === '--yes') {
    interactive = false;
  }
}

const variants = parseVariantFlags(rest);

try {
  await runNew({ archetype: 'aquiles', name, set, variants, interactive });
} catch (err) {
  console.error(`\n✖ ${err.message}`);
  process.exitCode = 1;
}
