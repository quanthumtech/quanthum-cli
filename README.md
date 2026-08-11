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

## Docker

A imagem carrega Node + PHP 8.3 + Composer + git — não só Node — porque o
`setup` de arquétipos reais (Aquiles = `composer install`/`artisan`,
Ulisses = `npm install`) precisa dessas toolchains disponíveis dentro do
container, senão o clone funciona e o setup quebra no primeiro comando PHP.

A imagem é publicada automaticamente no GHCR (`.github/workflows/docker-publish.yml`)
a cada push na `master` (`:latest`) e a cada tag `v*` (versão fixa, ex.: `:0.1.0`)
— não precisa buildar local pra usar:

```bash
docker pull ghcr.io/quanthumtech/quanthum-cli:latest

# --user evita que os arquivos criados no bind mount fiquem donos de root;
# HOME=/tmp dá pro git um lugar gravável pra --global config dentro do container.
docker run --rm -it \
  --user "$(id -u):$(id -g)" -e HOME=/tmp \
  -v "$(pwd):/workspace" \
  -e GH_TOKEN=ghp_xxx \
  -e QUANTHUM_REGISTRY=https://architecture.quanthum.tec.br/registry.json \
  ghcr.io/quanthumtech/quanthum-cli new aquiles minha-app --frontend=react
```

Pra buildar local em vez de puxar do GHCR (ex.: testando uma mudança no `Dockerfile`):

```bash
docker build -t quanthum-cli .
# troque "ghcr.io/quanthumtech/quanthum-cli" por "quanthum-cli" no comando acima
```

- `GH_TOKEN` — só necessário pra clonar `quanthum-aquiles`/`quanthum-ulisses` (repos privados). Um PAT com `repo` read é suficiente.
- `QUANTHUM_REGISTRY` — aponta pro registry.json ao vivo do portal em vez do estático bundlado na imagem; também aceita `--registry <url>` no comando.
- Sem `-it` num pipeline não-interativo, sempre passe `--yes` + `--set CHAVE=valor` pra cada placeholder (senão o prompt do `@clack/prompts` falha por falta de TTY).

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
