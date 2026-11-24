# syntax=docker/dockerfile:1

# Images of the API, built from the api/ folder (the last stage is the default target):
#   docker build --target migrate -t internal-llm-migrate .   applies the database migrations
#   docker build -t internal-llm-api .                        runs the API
# Same Node major as .nvmrc; exact tag so that builds are reproducible.
ARG NODE_IMAGE=node:24.22.3-trixie-slim

# --- Dependencies (dev included: the build needs the Nest CLI and TypeScript) ---------------
FROM ${NODE_IMAGE} AS deps
WORKDIR /app
# `npm ci` runs `prisma generate` (postinstall), which needs the schema and its config.
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN --mount=type=cache,target=/root/.npm npm ci

# --- Build -----------------------------------------------------------------------------------
FROM deps AS build
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN npm run build

# --- Production dependencies, twice ----------------------------------------------------------
# The Prisma CLI (migrations) pulls most of node_modules: Prisma Studio, its dev database,
# TypeScript... The API itself only needs the generated client and its driver adapter, so the
# CLI goes in the migrate image only.
FROM build AS prod-deps-migrate
RUN npm prune --omit=dev

FROM build AS prod-deps-runtime
# devDependencies go too: npm would otherwise keep TypeScript (24 MB), an optional peer
# dependency of the Prisma packages that is also a dev dependency.
RUN npm pkg delete dependencies.prisma devDependencies && npm prune --omit=dev

# --- Base of the migrate and runtime images: Node without npm, corepack and yarn ---------------
# Nothing runs them there. Deleting files in a layer on top of the Node image would not shrink
# the image (the layers below keep them), so the trimmed file system is copied into a fresh
# image: a single layer, with the same content minus those tools.
FROM ${NODE_IMAGE} AS node-trimmed
RUN rm -rf /usr/local/lib/node_modules /opt/yarn-v* \
  /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
  /usr/local/bin/yarn /usr/local/bin/yarnpkg

FROM scratch AS base
COPY --from=node-trimmed / /

# --- Migrations: applies the pending ones, then exits ----------------------------------------
FROM base AS migrate
# OpenSSL: required by Prisma's migration engine, absent from slim.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
WORKDIR /app

COPY --from=prod-deps-migrate --chown=node:node /app/package.json ./
COPY --from=prod-deps-migrate --chown=node:node /app/node_modules ./node_modules
COPY --from=prod-deps-migrate --chown=node:node /app/prisma ./prisma
COPY --from=prod-deps-migrate --chown=node:node /app/prisma.config.ts ./

USER node
# The database URL comes from DATABASE_URL (see prisma.config.ts).
CMD ["node_modules/.bin/prisma", "migrate", "deploy"]

# --- Runtime ---------------------------------------------------------------------------------
FROM base AS runtime

ENV NODE_ENV=production \
  PORT=3000
WORKDIR /app

COPY --from=prod-deps-runtime --chown=node:node /app/package.json ./
COPY --from=prod-deps-runtime --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist

USER node
EXPOSE 3000

# Database reachable and API up. The migrations have already been applied by the migrate
# service, which the API waits for.
HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=3 \
  CMD ["node", "-e", "fetch(`http://127.0.0.1:${process.env.PORT}/api/health`).then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]

# Create a user: docker compose exec api node dist/cli/create-user.js
CMD ["node", "dist/main.js"]
