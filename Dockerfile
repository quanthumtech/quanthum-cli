# O motor só clona+customiza+roda "setup", mas o setup de cada arquétipo
# real (Aquiles = composer/php/artisan, Ulisses = npm) precisa das
# toolchains correspondentes disponíveis DENTRO do container — senão
# `docker run quanthum-cli new aquiles app` clona e para no primeiro
# `composer install`. Por isso a imagem carrega Node + PHP + Composer + git,
# não só Node.
FROM php:8.3-cli-alpine AS runtime

RUN apk add --no-cache git bash nodejs npm libzip-dev \
    && docker-php-ext-install pdo pdo_mysql zip \
    && curl -sS https://getcomposer.org/installer | php -- --install-dir=/usr/local/bin --filename=composer \
    && rm -rf /var/cache/apk/*

WORKDIR /cli

COPY package.json package-lock.json tsconfig.base.json registry.json ./
COPY packages ./packages

RUN npm ci && npm run build && npm prune --omit=dev

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Onde o dev monta o diretório do host (docker run -v $(pwd):/workspace ...)
# — é aqui que `quanthum new <archetype> <name>` vai criar o projeto.
WORKDIR /workspace

ENTRYPOINT ["docker-entrypoint.sh"]
