/**
 * Extrai flags no formato `--<eixo>=<opção>` (ex.: --frontend=react) de uma
 * lista de argv crua — usado tanto pelo `quanthum new` (via commander, que
 * não conhece os eixos de antemão) quanto pelos wrappers `create-<arquétipo>`
 * (que não usam commander). Eixos não são conhecidos em tempo de build —
 * vêm do quanthum.json do template — por isso o parsing é feito à mão em
 * vez de flags declaradas estaticamente.
 */
const RESERVED_KEYS = new Set(['set', 'yes', 'registry', 'help', 'version']);

export function parseVariantFlags(argv: string[]): Record<string, string> {
  const result: Record<string, string> = {};

  for (const token of argv) {
    const match = /^--([a-z][a-z0-9-]*)=(.*)$/i.exec(token);
    if (!match) {
      continue;
    }
    const [, key, value] = match;
    if (RESERVED_KEYS.has(key!)) {
      continue;
    }
    result[key!] = value!;
  }

  return result;
}
