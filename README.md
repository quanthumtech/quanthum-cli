# quanthum-cli

Motor de scaffolding da Quanthum Architecture. Resolve um arquétipo pelo
`registry.json`, clona o template, recria o histórico git, aplica
placeholders e roda o setup do projeto.

Este é o **M0**: o motor genérico, validado com um repo de teste
descartável. Ainda não existe nenhum template real (Aquiles/Ulisses) —
isso é a M1/M3, plano à parte.

## Estrutura

- `packages/cli` — o pacote `quanthum` (comando `quanthum new <archetype> <name>`).
- `packages/create-aquiles` — wrapper fino pra `quanthum-aquiles <name>`, chama o mesmo motor com o arquétipo fixo em `aquiles`.
- `registry.json` — arquivo estático na raiz: nome do arquétipo → repo + versão + descrição.

## Uso

```bash
npm install
npm run build

# a partir de packages/cli:
node packages/cli/bin/quanthum.js new aquiles minha-app --set APP_NAME=minha-app

# ou, uma vez linkado globalmente (npm link em packages/cli):
quanthum new aquiles minha-app
quanthum-aquiles minha-app
```

## Testes

```bash
npm test
```

Os testes não dependem de rede/GitHub real — criam um repo git local
descartável com um `quanthum.json` mínimo e apontam o `registry.json` pra
ele via `QUANTHUM_REGISTRY`/`--registry`.

## O que este motor NÃO faz (por decisão, ver documentação da arquitetura)

- Não atualiza projetos já gerados quando o template evolui — scaffold é
  uma cópia única, sem merge automático.
- Não sabe nada sobre Laravel, Next.js ou qualquer stack específica —
  só lê `quanthum.json` e executa os comandos de `setup` que ele descrever.
