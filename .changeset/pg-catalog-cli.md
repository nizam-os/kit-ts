---
'@nizam-os/pg-catalog': minor
---

The `pg-catalog` CLI and `defineExtraction`, so a project keeps its configuration in
`pg-catalog.config.ts` and runs extraction, the CI check, and drift without a script of its own.

- `pg-catalog extract` writes the configured files, and `pg-catalog extract --check` writes nothing
  and exits 1 when a file is stale or missing. `pg-catalog drift --env <name>` exits 1 when the
  database differs from the committed catalog, and prints the `CatalogDiff` as JSON with `--json`.
  Every command exits 2 when it cannot run, with the reason on standard error.
- The CLI loads `--config <file>`, or the first of `pg-catalog.config.ts`, `.mts`, `.js`, and `.mjs` in
  the working directory, and resolves the configuration's paths against its directory. A TypeScript
  configuration runs on Node.js 22.18 or later, Bun, and Deno.
- `defineExtraction` checks a configuration as it loads and throws a `TypeError` naming the option:
  unknown keys at any level, empty paths, a `database` with both or neither target, system or
  duplicate schemas, and drift environment names a command-line flag cannot carry.
- `connection_failed` messages give the reason, such as a refused connection or a missing database,
  and never the URL.
