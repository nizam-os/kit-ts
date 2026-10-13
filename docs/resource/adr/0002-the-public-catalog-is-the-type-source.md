# ADR 0002: The public catalog is the type source; a declaration is keyed by database names

- Status: accepted
- Date: 2026-10-10

## Context

An API over PostgreSQL restates the database by hand: column types in validators, nullability and
defaults in OpenAPI, enum labels and length limits in forms, constraint names in error mappers. Each
copy drifts on its own schedule, and the drift shows up as a 500 or a confusing 422 in production
rather than as a compile error.

`@nizam-os/pg-catalog` already writes the database's own description as committed TypeScript
(catalog ADR 0004): the full catalog for servers, the public catalog for browsers (catalog ADR
0005), and Kysely types (catalog ADR 0007). The public catalog is an `as const` literal, so
TypeScript sees every table, column, type name, nullability, default literal, identity, generation,
constraint, and translated rule as a literal type. It holds only the tables the configuration names
in `public.tables` and drops expressions, policies, and indexes, so a browser may import it.

A declaration is imported by servers and by clients: forms validate with its schemas and render its
limits and options. A core imports no query builder, not even its types (root `AGENTS.md`).

The epic sketch typed the definer as `createDeclareResource<DB>()`, with the Kysely `DB` interface
as a type argument.

## Decision

- `createDeclareResource({ catalog })` takes the public catalog value, and its literal type is the
  only type source. There is no `DB` type parameter: the Kysely interface is a rendering of the same
  catalog that carries less (no constraints, rules, or default literals), and reading it would make
  the core depend on Kysely's `ColumnType`. `@nizam-os/kysely-resource` takes `DB`.
- Only a table of the public catalog can be declared. A declaration that names any other table, or a
  column, foreign key, constraint, scope, codec, or validator that does not exist, fails `tsc`; for
  JavaScript callers the same mistake throws `TypeError` naming the option path.
- Every name in a declaration is a database name: the table's reference name, column names (fields,
  search column, default sort), foreign-key column names (relationships), and constraint names
  (rules). Public names exist only in what a declaration produces (ADR 0003). This departs from the
  epic sketch, whose default sort used a public name: one namespace per declaration is easier to
  check and survives a rename with `as`.
- A declaration states only what the catalog cannot know: the operations, the access mode of each
  exposed column, filter operators, sortability, codecs, validators, the scope, search, the default
  sort, and error-code overrides. Types, nullability, requiredness, limits, enum labels, rules, and
  the key are read from the catalog and never restated.

## Consequences

A migration that changes a column type, drops a column, renames a constraint, or changes nullability
changes the public catalog after `pg-catalog extract`, and every declaration that relied on the old
fact fails `tsc` with no runtime test. `extract --check` in CI keeps the literal current.

Exposing a table to the API is two deliberate steps: list it in `public.tables`, then declare it.

Type-level computation over the catalog costs compile time. The public catalog holds only the
exposed tables, which bounds the cost, and the test plan measures `tsc` on real catalogs (SPEC
15.5).
