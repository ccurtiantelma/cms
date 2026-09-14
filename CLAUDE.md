# CLAUDE.md — Router

CMS headless a Pagine/blocchi (NestJS · Drizzle · PostgreSQL · React 19 · Mantine v7).

**Prima di qualsiasi task**: leggi `docs/ai/INDEX.md` e apri solo gli SPEC/ADR/tipi mappati al dominio del task corrente. Non inventare endpoint/tabelle/DTO/regole non presenti in `docs/`.

## Macro-directory

- `app/backend/` — API NestJS, Drizzle, DTO
- `app/frontend/` — Admin React/Mantine
- `app/public-site/` — export statico pubblico
- `docs/ai/` — INDEX, specs, adr, plans, rfc
- `bruno/`, `e2e/` — contract/E2E test

## Comandi

- `npm run dev` · `npm run build`
- `npm test` · `npm run test:e2e`
- `npm run lint` · `npm run format`
- `npm run openapi:export && npm run openapi:types` (dopo ogni endpoint nuovo/modificato)

Gerarchia vincolante: `docs/constitution.md` → business-rules → glossary → ADR → spec → plan → codice.
