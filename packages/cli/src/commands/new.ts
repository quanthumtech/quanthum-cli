import fs from 'node:fs';
import path from 'node:path';
import { log } from '@clack/prompts';
import { printBanner as printWordmark } from '../banner.js';
import { cloneTemplate, reinitGit } from '../clone.js';
import { applyPlaceholders, resolvePlaceholderValues, type PlaceholderValues } from '../customize.js';
import { parseManifest, variantsSupportPostSetup, type Manifest } from '../manifest.js';
import { resolveArchetype } from '../registry.js';
import { reportProject } from '../report.js';
import { runSetup } from '../setup.js';
import { printBanner, printSuccess, printVerboseHint, step } from '../tui.js';
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
  printWordmark();

  const cwd = options.cwd ?? process.cwd();
  const destDir = path.resolve(cwd, options.name);

  if (fs.existsSync(destDir)) {
    throw new Error(`O diretório "${options.name}" já existe.`);
  }

  const flagsSummary = Object.entries(options.variants ?? {})
    .map(([axis, choice]) => `--${axis}=${choice}`)
    .join(' ');
  printBanner(options.archetype, `./${options.name}`, flagsSummary);
  printVerboseHint();

  const entry = await resolveArchetype(options.archetype, options.registryPath);

  // cloneTemplate já mostra o próprio progresso (runTrackedCommand) — não
  // precisa de um step() por fora envolvendo.
  await cloneTemplate(entry.repo, entry.version, destDir);

  await step('Recriando histórico git', () => reinitGit(destDir, options.archetype, entry.version));

  const manifest = readManifest(destDir);
  const interactive = options.interactive ?? true;

  const variantChoices = await resolveVariantChoices(manifest, options.variants ?? {}, interactive);
  let variantSetup: string[] = [];
  if (Object.keys(manifest.variants).length > 0) {
    const summary = Object.entries(variantChoices)
      .map(([axis, choice]) => `${axis}=${choice}`)
      .join(', ');
    log.step(`Aplicando variantes (${summary})`);
    variantSetup = applyVariants(destDir, manifest, variantChoices);
    cleanupVariantDirs(destDir, manifest);
  }

  log.step('Aplicando placeholders');
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

  // postSetup vem do registry (tema/blocos anexados ao arquétipo no portal), não
  // do manifest do template — por isso roda por último: o setup do
  // manifest/variante é o que deixa o projeto num estado onde `npx shadcn add`
  // funciona (deps instaladas, tailwind configurado etc.). Só entra se a
  // variante escolhida declarar suporte (ver supportsPostSetup em manifest.ts)
  // — sem isso, um shadcn add rodaria numa variante Livewire/Blade sem
  // components.json nenhum.
  const postSetup = entry.postSetup ?? [];
  const skipPostSetup = postSetup.length > 0 && !variantsSupportPostSetup(manifest, variantChoices);
  const setupCommands = [...manifest.setup, ...variantSetup, ...(skipPostSetup ? [] : postSetup)];

  if (skipPostSetup) {
    log.warn(
      `Pulando o setup extra do registry (tema/blocos) — a variante escolhida (${Object.entries(variantChoices)
        .map(([axis, choice]) => `${axis}=${choice}`)
        .join(', ')}) não declara suporte a isso no quanthum.json.`,
    );
  }

  if (setupCommands.length > 0) {
    log.step(`Rodando setup (${setupCommands.length} comando${setupCommands.length > 1 ? 's' : ''})`);
    await runSetup(destDir, setupCommands);
  }

  printSuccess(`Projeto "${options.name}" criado a partir de "${options.archetype}".`, `cd ${options.name}`);

  // Best-effort, silencioso — ver docblock de reportProject(). Precisa de
  // await (não fire-and-forget): o processo Node termina assim que runNew()
  // resolve, e sem esperar a fetch ela é abortada no meio antes de completar.
  // O timeout interno (3s) limita o atraso no pior caso; sucesso é quase
  // instantâneo, sem --registry de URL não faz fetch nenhuma.
  await reportProject(
    { name: options.name, archetype: options.archetype, version: entry.version, variant: variantChoices },
    options.registryPath,
  );

  return { destDir, manifest, variantChoices };
}
