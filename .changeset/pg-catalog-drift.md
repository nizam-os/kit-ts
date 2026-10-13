---
'@nizam-os/pg-catalog': minor
---

`drift` compares a live database with the committed catalog, for a scheduled job that watches
production.

- `drift(config, environment)` reads `out.catalog`, connects to the URL of
  `config.drift[environment]`, reads the catalog with the queries `extract` uses inside a
  `REPEATABLE READ READ ONLY` transaction, and returns the `diffCatalogs` result. It replays nothing
  and cannot write.
- `introspectCatalog({ url, schemas })` returns the live catalog itself, and `formatDiff(diff)`
  prints the differences grouped by object kind, with each changed member and both values.
- A role with `CONNECT` and `USAGE` on the configured schemas is all drift needs. Without `USAGE`,
  PostgreSQL would qualify every name in the schema, so drift fails with `schema_usage` instead of
  reporting false drift.
- Unknown environments, URL functions that return nothing, and an unreadable committed catalog fail
  with `config_invalid` or `catalog_unreadable` before any connection is made.
