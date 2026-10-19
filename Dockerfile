# check=skip=SecretsUsedInArgOrEnv
# (that check flags the key *paths* set in ENV below; they are not secrets)
# One image: the API serves the compiled HUD on a single origin. Node runs the TypeScript natively,
# so only the HUD has a build step.
#
#   docker build -t gauss-hud .
#
# Deployment: deploy/compose.services.yml and the README (Deploy).

# The HUD build is the same on every architecture: run it on the build machine, not under emulation.
FROM --platform=$BUILDPLATFORM node:26-alpine AS web
WORKDIR /src
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --ignore-scripts
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/web apps/web
RUN npm run build

FROM node:26-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --omit=dev --ignore-scripts --workspace=@gauss-hud/api && npm cache clean --force
COPY packages/shared/src packages/shared/src
COPY apps/api/src apps/api/src
COPY --from=web /src/apps/web/dist apps/web/dist

# `gauss <command>`: the CLI (pairing, PIN, vehicle API onboarding).
RUN printf '#!/bin/sh\nexec node /app/apps/api/src/cli.ts "$@"\n' > /usr/local/bin/gauss && chmod 755 /usr/local/bin/gauss \
 && mkdir -p /data /secrets/private /secrets/public && chown -R node:node /data /secrets

# Everything that changes lives outside the image: the database in /data, the keys in /secrets.
# /secrets/private (signing key, proxy TLS key) is mounted in the signing proxy only, never in the
# app; /secrets/public (public key, proxy certificate) is mounted read-only in the app.
ENV HOST=0.0.0.0 \
    PORT=3000 \
    TRUST_PROXY=true \
    DB_PATH=/data/gauss-hud.db \
    TESLA_PRIVATE_KEY_PATH=/secrets/private/private-key.pem \
    TESLA_PROXY_TLS_KEY_PATH=/secrets/private/tls-key.pem \
    TESLA_PUBLIC_KEY_PATH=/secrets/public/public-key.pem \
    TESLA_PROXY_CA_PATH=/secrets/public/tls-cert.pem

LABEL org.opencontainers.image.title="Gauss HUD" \
      org.opencontainers.image.description="Self-hosted car dashboard for Meta Ray-Ban Display glasses" \
      org.opencontainers.image.licenses="Apache-2.0" \
      org.opencontainers.image.source="https://github.com/WalsonK/Gauss-HUD"

USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:3000/api/health || exit 1

# node directly (not npm): SIGTERM reaches the server, which closes the database cleanly.
CMD ["node", "apps/api/src/main.ts"]
