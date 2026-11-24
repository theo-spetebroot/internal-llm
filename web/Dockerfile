# syntax=docker/dockerfile:1

# Production image of the web client: the Vite build served by Nginx, which also proxies /api
# to the API. Build from the web/ folder: docker build -t internal-llm-web .
# Exact tags so that builds are reproducible (Node: same major as .nvmrc; Nginx: stable).
ARG NODE_IMAGE=node:24.22.3-trixie-slim
ARG NGINX_IMAGE=nginxinc/nginx-unprivileged:1.30.6-trixie

# --- Build -----------------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci
COPY . .
# Typecheck + Vite production build into dist/.
RUN npm run build

# --- Runtime ---------------------------------------------------------------------------------
# Unprivileged variant: Nginx runs as a non-root user (uid 101) and listens on 8080.
FROM ${NGINX_IMAGE} AS runtime
# Where /api is proxied (host:port). Substituted into the template when the container starts.
ENV API_UPSTREAM=api:3000

COPY nginx/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080

# Nginx itself is up (the API has its own health check).
HEALTHCHECK --interval=10s --timeout=5s --start-period=10s --retries=3 \
  CMD ["curl", "-fsS", "-o", "/dev/null", "http://127.0.0.1:8080/"]
