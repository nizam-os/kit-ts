# ADR 0002: A database-free core and a PostgreSQL binding

- Status: accepted
- Date: 2026-10-10

## Context

The catalog has two kinds of consumers. Build-time code replays migrations into PostgreSQL, reads
`pg_catalog`, and writes files; it needs a driver, the file system, and Node.js. Runtime code reads
the written files: `@nizam-os/resource-core` types declarations by the public catalog in browser
bundles, and `@nizam-os/kysely-resource` checks the full catalog when a server boots. If the model
types lived in the extraction package, every browser consumer would install `pg` to get a type, and
the oracle (`rules --check`), which runs `@nizam-os/resource-core` fixtures against the database,
would make the extraction package and `@nizam-os/resource-core` depend on each other.

ADR 0003 of the repository names a family's database-free part `<thing>-core` and a binding
`<host>-<thing>`, with `<host>` the npm name of the host library (`pg`).

## Decision

- `@nizam-os/catalog-core` holds the catalog model as TypeScript types (`Catalog`, `PublicCatalog`,
  and their parts) and the pure functions over it: the public projection and the structural diff
  drift uses. It has no dependencies, reads no environment, and runs anywhere the other cores run.
- `@nizam-os/pg-catalog` holds everything that touches PostgreSQL or the file system: the migration
  loader, the replay, the extraction queries, the CHECK recognizer, the renderers of the three
  output files, the Kysely type generator, the configuration, and the CLI. It depends on
  `@nizam-os/catalog-core` and re-exports it in full, depends on `pg`, and takes
  `@electric-sql/pglite` as an optional peer dependency. It runs on Node.js 22.12 and later, Bun,
  and Deno, and not on Workers, which have no file system for the migrations and the output files.

## Consequences

A browser bundle that imports a generated public catalog imports nothing at all, and a declaration
library depends only on `@nizam-os/catalog-core` for its types. The oracle can live in
`@nizam-os/pg-catalog` without a cycle. A second extractor (another driver, another database) would
be another binding over the same model.
