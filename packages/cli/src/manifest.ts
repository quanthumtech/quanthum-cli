import { z } from 'zod';

export const PlaceholderSchema = z.object({
  prompt: z.string(),
  files: z.array(z.string()).min(1),
});

export const VariantOptionSchema = z.object({
  description: z.string().optional(),
  /** Diretório (relativo à raiz do projeto clonado) copiado por cima do core quando esta opção é escolhida. */
  path: z.string(),
  /** Comandos extras de setup, rodados depois do `setup` compartilhado, só se esta opção for escolhida. */
  setup: z.array(z.string()).default([]),
  /**
   * `postSetup` do registry (tema/blocos shadcn anexados no portal) só roda se
   * TODAS as opções de variante escolhidas tiverem isso true — default false,
   * opt-in de propósito: um comando `npx shadcn add ...` não faz sentido numa
   * variante Livewire/Blade sem components.json, só na(s) que já têm shadcn/ui
   * (ex.: o "react" do Aquiles). Templates sem eixos de variante nenhum não
   * passam por essa checagem — não tem com o que ser incompatível.
   */
  supportsPostSetup: z.boolean().default(false),
});

export const VariantAxisSchema = z
  .object({
    prompt: z.string(),
    /** Opção usada em modo não interativo sem flag explícita — se omitido, falta de flag é erro. */
    default: z.string().optional(),
    options: z.record(z.string(), VariantOptionSchema),
  })
  .refine((axis) => Object.keys(axis.options).length > 0, {
    message: 'precisa ter ao menos uma opção em "options"',
  })
  .refine((axis) => axis.default === undefined || axis.default in axis.options, {
    message: '"default" precisa ser uma chave existente em "options"',
  });

export const ManifestSchema = z.object({
  name: z.string(),
  version: z.string(),
  placeholders: z.record(z.string(), PlaceholderSchema).default({}),
  /** Eixos de variação (ex.: "frontend") — cada um vira uma flag `--<eixo>=<opção>`. */
  variants: z.record(z.string(), VariantAxisSchema).default({}),
  /** Diretórios apagados no fim, depois que as opções escolhidas já foram copiadas (ex.: a pasta "variants" inteira). */
  variantsCleanup: z.array(z.string()).default([]),
  setup: z.array(z.string()).default([]),
});

export type Manifest = z.infer<typeof ManifestSchema>;
export type VariantOption = z.infer<typeof VariantOptionSchema>;
export type VariantAxis = z.infer<typeof VariantAxisSchema>;

/**
 * Sem eixos de variante, não tem com o que ser incompatível — postSetup vale.
 * Com eixos, exige que TODA opção escolhida declare supportsPostSetup, senão
 * um `npx shadcn add ...` (tema/bloco anexado no portal) rodaria numa
 * variante que não tem shadcn/ui configurado (ex.: Livewire/Blade).
 */
export function variantsSupportPostSetup(manifest: Manifest, variantChoices: Record<string, string>): boolean {
  const axes = Object.entries(manifest.variants);
  if (axes.length === 0) {
    return true;
  }

  return axes.every(([axis, def]) => {
    const chosen = variantChoices[axis];
    const option = chosen ? def.options[chosen] : undefined;
    return option?.supportsPostSetup === true;
  });
}

export function parseManifest(raw: unknown): Manifest {
  const result = ManifestSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(raiz)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`quanthum.json inválido:\n${issues}`);
  }
  return result.data;
}
