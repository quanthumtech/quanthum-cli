/**
 * Variáveis de ambiente que o dev precisa preencher no .env depois do scaffold,
 * por arquétipo. Os nomes espelham o .env.example de cada template (todas vazias
 * por padrão; SSO/Licenças/Checkout nascem desligados). Arquétipo sem entrada
 * aqui não ganha aviso nenhum.
 */
export interface EnvGroup {
  title: string;
  vars: string[];
}

const SSO_BASE = [
  'QUANTHUM_SSO_ISSUER',
  'QUANTHUM_SSO_CLIENT_ID',
  'QUANTHUM_SSO_CLIENT_SECRET',
  'QUANTHUM_SSO_REDIRECT_URI',
];

const ENV_GROUPS: Record<string, EnvGroup[]> = {
  aquiles: [
    {
      title: 'SSO Quanthum (OIDC)',
      vars: ['QUANTHUM_SSO_ENABLED', ...SSO_BASE, 'QUANTHUM_SSO_POST_LOGOUT_REDIRECT_URI'],
    },
    {
      title: 'Licenças',
      vars: [
        'QUANTHUM_LICENSE_SERVER_URL',
        'QUANTHUM_PRODUCT_KEY',
        'QUANTHUM_LICENSE_KEY',
        'QUANTHUM_LICENSE_PUBLIC_KEY',
        'QUANTHUM_LICENSE_ENFORCE',
      ],
    },
    {
      title: 'Checkout',
      vars: ['CHECKOUT_BASE_URL', 'CHECKOUT_CLIENT_TOKEN', 'CHECKOUT_WEBHOOK_SECRET', 'CHECKOUT_WEBHOOK_SECRET_PREVIOUS'],
    },
  ],
  ulisses: [
    {
      title: 'SSO Quanthum (OIDC)',
      vars: ['QUANTHUM_SSO_ENABLED', ...SSO_BASE, 'QUANTHUM_SSO_SESSION_SECRET'],
    },
  ],
};

export function envGroupsFor(archetype: string): EnvGroup[] {
  return ENV_GROUPS[archetype] ?? [];
}

/** Linhas prontas pra imprimir; vazio se o arquétipo não tem variáveis a preencher. */
export function formatEnvHint(archetype: string): string[] {
  const groups = envGroupsFor(archetype);
  if (groups.length === 0) {
    return [];
  }
  const lines = ['Preencha no .env (todos os serviços nascem desligados):'];
  for (const group of groups) {
    lines.push('', `${group.title}:`, ...group.vars.map((name) => `  ${name}`));
  }
  return lines;
}
