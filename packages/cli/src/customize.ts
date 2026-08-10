import fs from 'node:fs';
import path from 'node:path';
import { isCancel, text } from '@clack/prompts';
import type { Manifest } from './manifest.js';

export type PlaceholderValues = Record<string, string>;

/**
 * Resolve o valor de cada placeholder do manifesto: usa o que já veio via
 * --set, e só pergunta interativamente (via @clack/prompts) o que faltar.
 * Em modo não interativo, falta de valor é erro (não trava esperando input).
 */
export async function resolvePlaceholderValues(
  manifest: Manifest,
  provided: PlaceholderValues,
  interactive: boolean,
): Promise<PlaceholderValues> {
  const values: PlaceholderValues = { ...provided };

  for (const [key, definition] of Object.entries(manifest.placeholders)) {
    if (values[key] !== undefined) {
      continue;
    }
    if (!interactive) {
      throw new Error(
        `Placeholder "${key}" não foi definido (use --set ${key}=valor em modo não interativo).`,
      );
    }
    const answer = await text({ message: definition.prompt });
    if (isCancel(answer)) {
      throw new Error('Cancelado pelo usuário.');
    }
    values[key] = String(answer);
  }

  return values;
}

/** Substitui, em cada arquivo listado, todas as ocorrências literais da chave do placeholder. */
export function applyPlaceholders(destDir: string, manifest: Manifest, values: PlaceholderValues): void {
  for (const [key, definition] of Object.entries(manifest.placeholders)) {
    const value = values[key];
    for (const relFile of definition.files) {
      const filePath = path.join(destDir, relFile);
      if (!fs.existsSync(filePath)) {
        throw new Error(`Placeholder "${key}" referencia o arquivo "${relFile}", que não existe no template.`);
      }
      const content = fs.readFileSync(filePath, 'utf-8');
      fs.writeFileSync(filePath, content.split(key).join(value));
    }
  }
}
