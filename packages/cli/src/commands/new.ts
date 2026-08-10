import fs from 'node:fs';
import path from 'node:path';
import { cloneTemplate, reinitGit } from '../clone.js';
import { applyPlaceholders, resolvePlaceholderValues, type PlaceholderValues } from '../customize.js';
import { parseManifest, type Manifest } from '../manifest.js';
import { resolveArchetype } from '../registry.js';
import { runSetup } from '../setup.js';
import { applyVariants, cleanupVariantDirs, resolveVariantChoices, type VariantChoices } from '../variants.js';

export interface RunNewOptions {
  archetype: string;
  name: string;
  /** Diretório onde <name> será criado. Default: process.cwd(). */
  cwd?: string;
  /** Override do registry.json — uso interno/testes (ou via env QUANTHUM_REGISTRY). */
  registryPath?: string;
  /** Valores de placeholder já conhecidos (equivalente a --set CHAVE=valor). */
  set?: PlaceholderValues;
  /** Opções de variante já conhecidas (equivalente a --<eixo>=<opção>, ex.: --frontend=react). */
  variants?: VariantChoices;
  /** Default true — se false, falta de placeholder/variante é erro em vez de prompt. */
  interactive?: boolean;
}

export interface RunNewResult {
  destDir: string;
  manifest: Manifest;
  variantChoices: VariantChoices;
}

function readManifest(destDir: string): Manifest {
  const manifestPath = path.join(destDir, 'quanthum.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`quanthum.json não encontrado em "${destDir}" — o template está configurado corretamente?`);
  }
  const raw = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  return parseManifest(raw);
}

export async function runNew(options: RunNewOptions): Promise<RunNewResult> {
  const cwd = options.cwd ?? process.cwd();
  const destDir = path.resolve(cwd, options.name);

  if (fs.existsSync(destDir)) {
    throw new Error(`O diretório "${options.name}" já existe.`);
  }

  const entry = resolveArchetype(options.archetype, options.registryPath);

  console.log(`→ Clonando ${entry.repo} (${entry.version})...`);
  await cloneTemplate(entry.repo, entry.version, destDir);

  console.log('→ Recriando histórico git...');
  await reinitGit(destDir, options.archetype, entry.version);

  const manifest = readManifest(destDir);
  const interactive = options.interactive ?? true;

  const variantChoices = await resolveVariantChoices(manifest, options.variants ?? {}, interactive);
  let variantSetup: string[] = [];
  if (Object.keys(manifest.variants).length > 0) {
    console.log(
      `→ Aplicando variantes (${Object.entries(variantChoices)
        .map(([axis, choice]) => `${axis}=${choice}`)
        .join(', ')})...`,
    );
    variantSetup = applyVariants(destDir, manifest, variantChoices);
    cleanupVariantDirs(destDir, manifest);
  }

  console.log('→ Aplicando placeholders...');
  const values = await resolvePlaceholderValues(manifest, options.set ?? {}, interactive);
  applyPlaceholders(destDir, manifest, values);

  const markerPath = path.join(destDir, '.quanthum-archetype');
  fs.writeFileSync(
    markerPath,
    JSON.stringify(
      {
        archetype: options.archetype,
        version: entry.version,
        variants: variantChoices,
        generatedAt: new Date().toISOString(),
      },
      null,
      2,
    ) + '\n',
  );

  const setupCommands = [...manifest.setup, ...variantSetup];
  if (setupCommands.length > 0) {
    console.log('→ Rodando setup...');
    await runSetup(destDir, setupCommands);
  }

  console.log(`\n✔ Projeto "${options.name}" criado a partir de "${options.archetype}".`);
  console.log(`  cd ${options.name}`);

  return { destDir, manifest, variantChoices };
}
