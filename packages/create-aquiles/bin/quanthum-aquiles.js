#!/usr/bin/env node
// Wrapper fino: mesmo motor do `quanthum`, arquétipo fixo em "aquiles".
// Nenhuma lógica de scaffolding vive aqui — só parsing de argv chamando runNew().
import { DEFAULT_LIVE_REGISTRY_URL, parseVariantFlags, runNew } from '@quanthum/cli';

const [name, ...rest] = process.argv.slice(2);

if (!name || name.startsWith('-')) {
  console.error('Uso: quanthum-aquiles <nome-do-projeto> [--frontend=react|livewire-mary|livewire-daisy|livewire-tall] [--set CHAVE=valor] [--yes] [--registry [path-ou-url]]');
  process.exit(1);
}

const set = {};
let interactive = true;
let registryPath;

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
  } else if (rest[i] === '--registry') {
    // Espelha o --registry [path-ou-url] do `quanthum new` (commander) — sem
    // isso, --registry era silenciosamente ignorado aqui e o wrapper sempre
    // caía no registry.json estático bundlado, mesmo quando alguém pedia o
    // ao vivo do portal (que é o que traz postSetup). Valor opcional: sem
    // URL depois (fim do argv ou já é outra flag), usa o ao vivo oficial.
    const next = rest[i + 1];
    if (next && !next.startsWith('-')) {
      registryPath = next;
      i++;
    } else {
      registryPath = DEFAULT_LIVE_REGISTRY_URL;
    }
  }
}

const variants = parseVariantFlags(rest);

try {
  await runNew({ archetype: 'aquiles', name, set, variants, interactive, registryPath });
} catch (err) {
  console.error(`\n✖ ${err.message}`);
  process.exitCode = 1;
}
