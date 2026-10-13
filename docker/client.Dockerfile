# syntax=docker/dockerfile:1.7
# Bağlam: repo kökü — docker build -f docker/client.Dockerfile .
FROM node:24-alpine AS build
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/client/package.json apps/client/
COPY packages/shared/package.json packages/shared/
COPY packages/mock-data/package.json packages/mock-data/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter "@prime/client..."
COPY packages packages
COPY apps/client apps/client
# Paylaşılan paketler kaynaktan derlenir (Vite alias); ayrı build gerekmez
RUN pnpm --filter @prime/client build

FROM caddy:2.11-alpine
ENV TZ=Europe/Istanbul
COPY docker/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /repo/apps/client/dist /srv
