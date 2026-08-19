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

## Instalação

Não publicado no npm — `npm install -g git+https://...` quebra em versões
recentes do npm num `rename()` de symlink durante a instalação global de uma
dependência git (mesmo problema documentado no `aleksandria-cli`). Por isso
o instalador é um script próprio, mesmo padrão dos outros CLIs da Quanthum —
com uma diferença: **este repositório é privado** (`aleksandria-cli` é
público, por isso o `curl | bash` direto funciona lá e não aqui — sem
autenticação, `raw.githubusercontent.com` responde 404 pra conteúdo de repo
privado). Então o primeiro passo precisa ser um `git clone` de verdade
(que já usa a credencial que você tiver configurada), não um `curl` cru:

```bash
git clone https://github.com/quanthumtech/quanthum-cli.git ~/.quanthum-cli && bash ~/.quanthum-cli/install.sh
```

Builda e faz `npm link` nos dois pacotes — deixa `quanthum` e
`quanthum-aquiles` prontos no terminal. Rodar `~/.quanthum-cli/install.sh`
de novo depois (sem precisar clonar de novo) atualiza (`git pull` + rebuild
+ relink).

**Requisitos mínimos:**
- **Node 20+** e **git**
- **PHP 8.3+** e **Composer** — a CLI em si não usa, mas o `setup` do
  template gerado precisa (ex.: `composer install`, `php artisan key:generate`)
- **Git autenticado no GitHub** com acesso de leitura a este repositório e
  aos dos arquétipos (`quanthum-aquiles`, `quanthum-ulisses`) — sem isso o
  clone falha (aqui, ou do template na hora de gerar o projeto)

**Windows (ex.: Laragon):** rode o comando de instalação no **Git Bash**
(já vem com o Git for Windows que o Laragon usa) — não é PowerShell/cmd. Se
o `npm link` reclamar de permissão pra criar symlink, ative o **Modo de
Desenvolvedor** do Windows (Configurações → Sistema → Para desenvolvedores)
ou rode esse passo uma vez como Administrador.

Sem Node/PHP/Composer no host, use a [imagem Docker](#docker) — ela já traz
tudo dentro do container.

## Uso

```bash
quanthum-aquiles minha-app --frontend=react
quanthum new aquiles minha-app --set APP_NAME=minha-app
```

Por padrão isso lê o `registry.json` **estático** bundlado no pacote (nome →
repo + versão + descrição só — atualizado manualmente a cada release). Pra
usar o registry **ao vivo** do portal — que também traz `postSetup` (tema/
blocos anexados a um arquétipo, ver `## Docker` abaixo) — aponte
`QUANTHUM_REGISTRY` ou `--registry` pra ele:

```bash
quanthum-aquiles minha-app --frontend=react --registry https://architecture.quanthum.tec.br/registry.json
# ou, testando local contra o portal rodando em localhost:
quanthum-aquiles minha-app --frontend=react --registry http://localhost:8000/registry.json
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
- `QUANTHUM_REGISTRY` — aponta pro registry.json ao vivo do portal em vez do estático bundlado na imagem; também aceita `--registry <url>` no comando. É o registry ao vivo que traz `postSetup` (tema/blocos anexados a um arquétipo no portal) — sem isso, o scaffold só roda o `setup` do `quanthum.json` do template.
- Sem `-it` num pipeline não-interativo, sempre passe `--yes` + `--set CHAVE=valor` pra cada placeholder (senão o prompt do `@clack/prompts` falha por falta de TTY).

## Desenvolvimento

Pra mexer no código deste repo (não só usar o CLI), clone normal em vez do
`install.sh` (que joga a cópia em `~/.quanthum-cli`, fora do seu editor):

```bash
git clone https://github.com/quanthumtech/quanthum-cli.git
cd quanthum-cli
npm install
npm run build
(cd packages/cli && npm link)
(cd packages/create-aquiles && npm link)
```

`npm link` aqui aponta `quanthum`/`quanthum-aquiles` pra esta cópia — rebuilda
(`npm run build`) depois de cada mudança pra ela valer no comando global.

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
