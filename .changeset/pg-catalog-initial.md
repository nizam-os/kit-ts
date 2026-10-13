---
'@nizam-os/pg-catalog': minor
---

First release: your PostgreSQL schema as committed TypeScript.

- `extract(config, { check })` replays the SQL migrations into a fresh database, reads `pg_catalog`,
  and writes `catalog.ts` and, with `out.public`, `public-catalog.ts` as `as const` modules. With
  `check` it writes nothing and reports each file as `unchanged`, `stale`, or `missing`.
  `extractCatalog` returns the catalog without writing.
- Migrations come from a directory, in Flyway order when every file follows Flyway's naming and in
  natural order otherwise, or from a function. A failing migration is reported with its name,
  PostgreSQL's message and code, and the line and column.
- Replay runs in PGlite (PostgreSQL 18 in-process, with contrib extensions named in the config) or
  in a throwaway database on a PostgreSQL 14 to 18 server, created from `template0` and always
  dropped.
- The output is deterministic: settings are pinned before every migration and before reading, and
  keys are ordered by code units, so the same migrations give the same bytes on every machine and on
  every supported major.
- `renderCatalogModule`, `renderPublicCatalogModule`, and `parseCatalogModule` write and read the
  modules; every failure is a `PgCatalogError` with a `code`.
- Re-exports all of `@nizam-os/catalog-core`, so an application imports from one package.
