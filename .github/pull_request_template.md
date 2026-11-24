<!-- Complete with the number of the issue this PR closes, e.g. "Closes #12". -->

Closes #

## Context

<!-- Why this change? Link the related issue or plan step. -->

## Changes

<!-- What was done, and any notable design decision. -->

-

## How to test

<!-- Commands to run and what to check, e.g. API calls, UI flow. -->

1.

## Screenshots

<!-- UI changes only; delete otherwise. -->

## Checklist

<!-- Branch: type/<issue number>-<slug>, e.g. feat/12-llm-logs. Milestone and labels: as the issue. -->

- [ ] Branch named after its issue (`type/<issue number>-<slug>`)
- [ ] Milestone and labels set like the issue
- [ ] Conventional commit title
- [ ] Lint, typecheck and tests pass locally
- [ ] `api/openapi.json` regenerated if the API contract changed (`npm run openapi:export`)
- [ ] Web types regenerated if `openapi.json` changed (`npm run gen:api`)
- [ ] No secrets committed; `.env.example` updated for new variables
