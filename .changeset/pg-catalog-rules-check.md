---
'@nizam-os/pg-catalog': minor
---

`rules --check` proves that the schemas of your declared resources agree with the database your
migrations build.

- `pg-catalog rules --check` replays the migrations and writes every fixture of the declared
  resources into a temporary copy of its columns, with their types, collations, and the CHECKs that
  apply: each member's boundary values, each validator's fixtures, and each codec's round trip. It
  prints each fixture on which the schema and PostgreSQL disagree, and exits 1 on a disagreement or
  on a case whose table, column, CHECK, or domain the migrations do not create.
- Configure it with `resources: { registry, storage }`: `registry` returns the declared resources,
  so only the commands over them load them, and `storage` gives a storage codec over text for each
  codec. `defineExtraction` checks both.
- Refusals are caught inside the database, so a case takes one round trip and PGlite runs any number
  of them.
- A table of `out.public.tables` that no declaration reads gets a warning.
- `checkRules(config, { cwd })` returns the report, and `formatRules(report)` the text.
- `@nizam-os/resource-core` is a new optional peer dependency, loaded only by this command; without
  it the command fails with `resource_core_missing`, and a registry it refuses fails with
  `registry_invalid`.
