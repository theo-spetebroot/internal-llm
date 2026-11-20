# llm-chat

Web chat interface for a self-hosted open-source LLM.

> 🚧 Work in progress — the full documentation (architecture, getting started, configuration,
> adding an LLM provider) lands with the end of milestone 1.

## Repository layout

| Folder | Content                                                         |
| ------ | --------------------------------------------------------------- |
| `api/` | NestJS 12 API (Prisma 7, PostgreSQL, JWT cookie auth, SSE)      |
| `web/` | React + Vite front-end (TanStack Query, Tailwind, shadcn/ui)    |

`api/` and `web/` are two independent npm projects: each one installs, runs, tests and builds on
its own. They only communicate over HTTP.

## Technical notes

### Dependency overrides and accepted advisories

Each override lives in the `overrides` field of the project's `package.json` and must be
re-evaluated (and removed if possible) whenever the parent dependency is upgraded.

| Project | Package  | Forced to | Why                                                                                                                                                                                                                                                                  |
| ------- | -------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `api`   | `effect` | `3.22.5`  | `prisma@7.10.1` (through `@prisma/config`) pins `effect@3.20.0`, affected by a high-severity ReDoS ([GHSA-7589-6fvf-x4pw](https://github.com/advisories/GHSA-7589-6fvf-x4pw)). `3.22.5` is a patched release of the same major. Remove when Prisma ships a fixed pin. |

Accepted advisories (not overridden):

| Project | Package                               | Advisory                                                                    | Why it is accepted                                                                                                                                                                                       |
| ------- | ------------------------------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `api`   | `minimatch@9.0.9` (via `@swc/cli`)    | Moderate ReDoS ([GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249)) | Dev-only tool (dev server build). It only matches the project's own glob patterns, never user input. No patched 9.x exists and `@swc/cli` requires `^9`, so forcing a new major could break the build. |

### npm install scripts

npm 11 only runs dependency install scripts that are explicitly allowed (`allowScripts` in
`package.json`). Allowed in `api`: `prisma` and `@prisma/engines` (download the migration
engine), `argon2` (loads its prebuilt native binary), `@swc/core` and `esbuild` (check their
native binaries). Denied: `@scarf/scarf` (install telemetry).
