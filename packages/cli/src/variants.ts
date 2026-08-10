import fs from 'node:fs';
import path from 'node:path';
import { isCancel, select } from '@clack/prompts';
import type { Manifest } from './manifest.js';

/** axisName -> chave da opção escolhida (ex.: { frontend: "react" }). */
export type VariantChoices = Record<string, string>;

/**
 * Resolve a opção escolhida em cada eixo de variação do manifesto: usa o
 * que já veio via flag (`--frontend=react`), cai no `default` do eixo em
 * modo não interativo, ou pergunta interativamente.
 */
export async function resolveVariantChoices(
  manifest: Manifest,
  provided: VariantChoices,
  interactive: boolean,
): Promise<VariantChoices> {
  const choices: VariantChoices = {};

  for (const [axisName, axis] of Object.entries(manifest.variants)) {
    const optionKeys = Object.keys(axis.options);
    let choice = provided[axisName];

    if (choice === undefined) {
      if (!interactive) {
        if (axis.default === undefined) {
          throw new Error(
            `Variante "${axisName}" não foi definida (use --${axisName}=<opção> em modo não interativo). Opções: ${optionKeys.join(', ')}`,
          );
        }
        choice = axis.default;
      } else {
        const answer = await select({
          message: axis.prompt,
          options: optionKeys.map((key) => ({
            value: key,
            label: axis.options[key]!.description ?? key,
          })),
          initialValue: axis.default,
        });
        if (isCancel(answer)) {
          throw new Error('Cancelado pelo usuário.');
        }
        choice = String(answer);
      }
    }

    if (!optionKeys.includes(choice)) {
      throw new Error(`Valor "${choice}" inválido para "--${axisName}". Opções: ${optionKeys.join(', ')}`);
    }

    choices[axisName] = choice;
  }

  return choices;
}

function copyDirRecursive(srcDir: string, destDir: string): void {
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(destPath, { recursive: true });
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * Copia o conteúdo de cada opção escolhida por cima da raiz do projeto
 * (sobrescrevendo arquivos em conflito) e devolve os comandos de setup
 * extras que essas opções declararam. NÃO apaga as pastas de variantes —
 * isso é `cleanupVariantDirs`, chamado à parte depois que todas as opções
 * já foram copiadas.
 */
export function applyVariants(destDir: string, manifest: Manifest, choices: VariantChoices): string[] {
  const extraSetup: string[] = [];

  for (const [axisName, axis] of Object.entries(manifest.variants)) {
    const chosenKey = choices[axisName];
    const option = chosenKey ? axis.options[chosenKey] : undefined;
    if (!option) {
      throw new Error(`Nenhuma opção resolvida para o eixo "${axisName}" — isso é um bug do CLI, não do template.`);
    }

    const variantDir = path.join(destDir, option.path);
    if (!fs.existsSync(variantDir)) {
      throw new Error(`Variante "${axisName}=${chosenKey}" aponta pra "${option.path}", que não existe no template.`);
    }

    copyDirRecursive(variantDir, destDir);
    extraSetup.push(...option.setup);
  }

  return extraSetup;
}

/** Remove os diretórios listados em `manifest.variantsCleanup` (ex.: a pasta "variants" inteira, com todas as opções). */
export function cleanupVariantDirs(destDir: string, manifest: Manifest): void {
  for (const relPath of manifest.variantsCleanup) {
    fs.rmSync(path.join(destDir, relPath), { recursive: true, force: true });
  }
}
