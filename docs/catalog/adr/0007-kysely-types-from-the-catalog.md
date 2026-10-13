# ADR 0007: Kysely types are generated from the catalog

- Status: accepted; amended by ADR-0013 (`types.driver` selects the table, and PGlite's own parsers
  have one: its `int8` is `number | bigint`, not `bigint`)
- Date: 2026-10-10

## Context

Kysely needs a `DB` interface describing each table's select, insert, and update types. Kanel with
`kanel-kysely` and `kysely-codegen` both introspect the database themselves, which would make the
types a second extraction that can disagree with the catalog, and both bring their own dependency
trees and configuration. The catalog already holds every fact the types need: column types, arrays,
nullability, defaults, identity, generation, and enums. @ref
https://kysely.dev/docs/generating-types

The JavaScript type of a column is decided by the driver's parsers, not by PostgreSQL. node-postgres
uses pg-types, which returns `int8` and `numeric` as strings, parses `int2`, `int4`, `oid`,
`float4`, and `float8` as numbers, `date` and both timestamps as `Date`, `interval` as an object,
`bytea` as a `Buffer`, and `json` and `jsonb` with `JSON.parse`; it parses arrays only of the types
it registers (a `numeric[]` becomes numbers), and returns every other type, including enum arrays,
as a string. @ref https://github.com/brianc/node-pg-types/blob/master/lib/textParsers.js

Kysely leaves the TypeScript types to the application, which must match what the driver returns.
@ref https://kysely.dev/docs/recipes/data-types `Generated<T>` makes a column optional on insert,
`GeneratedAlways<T>` forbids writing it, and `ColumnType<S, I, U>` states the select, insert, and
update types separately. @ref https://kysely-org.github.io/kysely-apidoc/types/ColumnType.html @ref
https://kysely-org.github.io/kysely-apidoc/types/GeneratedAlways.html

## Decision

- `@nizam-os/pg-catalog` generates the Kysely types from the extracted catalog, in the same run and
  with the same determinism as the catalog files, and `extract --check` covers them.
- The select types follow pg-types 2.x as above. The insert and update types are the values
  node-postgres serializes into text PostgreSQL accepts: it sends a JavaScript array as a PostgreSQL
  array and any other object without `toPostgres` as JSON, so geometric and JSON values are written
  as text. @ref https://github.com/brianc/node-postgres/blob/master/packages/pg/lib/utils.js
- A column with a default, its own or its domain's, or an identity `BY DEFAULT` is optional on
  insert, and an identity `ALWAYS` or a generated column is never written. A nullable column admits
  `null` on select, and on insert and update only when no domain along its type is NOT NULL:
  PostgreSQL refuses null for such a domain on write, yet documents that a column of one can still
  read as null. @ref https://www.postgresql.org/docs/18/sql-createdomain.html
- The configuration may override the mapping per type and per array type, for applications that
  register their own parsers or use another driver.
- Enums become string literal unions; table interfaces are named `<PascalCase>Table` and collected
  in an interface `DB`.
- For applications that use Kysely's `CamelCasePlugin`, the keys can be the plugin's names, with its
  options. The conversions are a port of the plugin's, tested against it, since the plugin turns
  keys back into snake_case in queries. A name that does not survive that round trip fails the run
  with every such name listed, rather than producing a key whose queries miss. @ref
  https://kysely.dev/docs/plugins#camel-case-plugin

## Consequences

Types and catalog cannot disagree, and there is no second introspection to configure. The mapping is
the library's responsibility, so a test holds every row of it against node-postgres on PostgreSQL 14
and 18. A driver with other parsers needs overrides for each type it returns differently; PGlite's
own parsers, for example, return `int8` as `bigint` and `bytea` as `Uint8Array`. A schema with names
such as `line_1` cannot use the camelCase keys until those names or the plugin's options change.
