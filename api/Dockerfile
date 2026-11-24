# syntax=docker/dockerfile:1

# Production image of the API. Build from the api/ folder: docker build -t internal-llm-api .
# Same Node major as .nvmrc; exact tag so that builds are reproducible.
ARG NODE_IMAGE=node:24.22.3-trixie-slim

# --- Dependencies (dev included: the build needs the Nest CLI and TypeScript) ---------------
FROM ${NODE_IMAGE} AS deps
WORKDIR /app
# `npm ci` runs `prisma generate` (postinstall), which needs the schema and its config.
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN --mount=type=cache,target=/root/.npm npm ci

# --- Build, then drop the dev dependencies ---------------------------------------------------
FROM deps AS build
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

# --- Runtime ---------------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS runtime
# OpenSSL: required by Prisma's migration engine (`prisma migrate deploy`), absent from slim.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
  PORT=3000
WORKDIR /app

COPY --from=build --chown=node:node /app/package.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --from=build --chown=node:node /app/prisma.config.ts ./

USER node
EXPOSE 3000

# Database reachable and API up; the start period covers the migrations run at startup.
HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=3 \
  CMD ["node", "-e", "fetch(`http://127.0.0.1:${process.env.PORT}/api/health`).then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]

# Apply pending migrations, then replace the shell with Node so it receives stop signals.
# Create a user: docker compose exec api node dist/cli/create-user.js
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && exec node dist/main.js"]
