# ADR 0004: The catalog is deterministic TypeScript

- Status: accepted; the module's binding is typed by a named interface since ADR 0011
- Date: 2026-10-10

## Context

The extracted files are committed and reviewed with the migration that changed them, and
`extract --check` fails CI on any difference, so two extractions of the same migrations must produce
the same bytes on every machine and on every supported PostgreSQL major. Object identifiers, the
server version, the random database name, and timestamps differ between runs. PostgreSQL 18 records
`NOT NULL` constraints as `pg_constraint` rows with `contype = 'n'` that earlier majors do not have,
while `pg_attribute.attnotnull` carries nullability on every major. Probing PostgreSQL 14 and 18
with the same schema showed identical `pg_get_constraintdef`, `pg_get_expr`, and `pg_get_indexdef`
output for checks, foreign keys, defaults, generation expressions, indexes, and policies. @ref
https://www.postgresql.org/docs/18/catalog-pg-constraint.html @ref
https://www.postgresql.org/docs/18/catalog-pg-attribute.html

Declarations are typed by the catalog, so it must be a TypeScript value whose literal types survive:
`as const` over an object literal does that without any further code generation.

## Decision

- Each catalog file is a header comment and `export const catalog = <literal> as const;`
  (`publicCatalog` in the public file). Consumers name the type with `typeof catalog`, which leaves
  the names `Catalog` and `PublicCatalog` to the model types of `@nizam-os/catalog-core`. The
  literal is the `JSON.stringify` output of the model with two-space indentation, which is valid
  TypeScript and parses back as JSON, so `extract --check` and drift read committed files without
  evaluating them. The literal starts with a `format` member, incremented on any change to the
  model's shape, so a reader refuses a catalog it does not understand instead of misreading it.
- Members appear in a fixed order: tables, enums, domains, constraints, indexes, and policies sorted
  by name (code unit order), columns in `attnum` order, enum labels in `enumsortorder`, member keys
  of each object in the order the SPEC lists them.
- The model holds no object identifiers, server version, database name, role passwords, or
  timestamps, and no `NOT NULL` constraint rows. Deparsed text comes from PostgreSQL's own functions
  with `search_path` set to the configured schemas, never `pretty`.
- The test suite compares the output of PGlite (PostgreSQL 18) with PostgreSQL 14 and 18 servers
  byte for byte.

## Consequences

A migration's effect is a readable diff in review, and CI can prove the committed files current.
Formatters must ignore the generated files, since their quoting differs from a project's style. A
PostgreSQL major that deparses an expression differently shows up as a test failure rather than as
silent churn.
