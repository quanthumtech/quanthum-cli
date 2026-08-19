#!/usr/bin/env bash
set -euo pipefail

REPO="https://github.com/quanthumtech/quanthum-cli.git"
DEST="$HOME/.quanthum-cli"

if [ -d "$DEST/.git" ]; then
  echo "→ atualizando $DEST..."
  git -C "$DEST" pull --ff-only
else
  echo "→ clonando em $DEST..."
  git clone "$REPO" "$DEST"
fi

cd "$DEST"
echo "→ instalando dependências..."
npm install
echo "→ buildando..."
npm run build

echo "→ linkando os comandos quanthum e quanthum-aquiles..."
(cd packages/cli && npm link)
(cd packages/create-aquiles && npm link)

echo "✔ pronto — roda \"quanthum-aquiles minha-app --frontend=react --registry\" pra começar."
