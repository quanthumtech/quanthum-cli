#!/usr/bin/env bash
set -euo pipefail

# quanthum-aquiles/quanthum-ulisses são repos privados — sem credencial
# nenhuma, "git clone https://github.com/..." falha dentro do container
# limpo. Se o dev passar um token (-e GH_TOKEN=ghp_...), configura um
# credential override só pra esta execução.
if [ -n "${GH_TOKEN:-}" ]; then
    git config --global url."https://x-access-token:${GH_TOKEN}@github.com/".insteadOf "https://github.com/"
fi

# Git recusa operar em diretórios de dono diferente do usuário atual —
# comum quando /workspace é um bind mount do host rodando como outro uid.
git config --global --add safe.directory /workspace
git config --global --add safe.directory '*'

exec node /cli/packages/cli/bin/quanthum.js "$@"
