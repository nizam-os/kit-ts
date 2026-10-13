---
'@nizam-os/pg-catalog': minor
---

Kysely types are generated from the same catalog, so the types and the catalog cannot disagree.

- `out.types` writes a file with one string literal union per enum, one `<Name>Table` interface per
  table, and the `DB` interface; `extract --check` covers it like the catalog modules, and
  `renderKyselyTypes(catalog, options)` renders it programmatically.
- Select types are what node-postgres's default parsers return (`int8` and `numeric` as strings,
  timestamps as `Date`, `jsonb` parsed, arrays of the common built-in types parsed and the others as
  array text). Insert and update types are what node-postgres can send, so JSON, points, and circles
  are written as text.
- Defaults, identity columns, generated columns, domain chains, and NOT NULL domains follow
  PostgreSQL: a nullable column of a NOT NULL domain refuses null on write but keeps `| null` on
  read, as PostgreSQL documents.
- `types.overrides` replaces the mapping per type or array type, in all positions or per position,
  for applications that register their own parsers, and `types.imports` brings in the types they
  name. Two objects with the same TypeScript name fail with `name_collision`.
- `types.camelCase` writes the keys Kysely's `CamelCasePlugin` uses, with the plugin's options.
  Names the plugin would not turn back into themselves, such as `line_1`, fail with
  `camel_case_mismatch`, which lists every one.
- A test holds every row of the mapping against node-postgres on PostgreSQL 14 and 18.
