# ADR 0009: A unique index that no constraint backs is a public unique constraint

- Status: accepted
- Date: 2026-10-10

## Context

PostgreSQL enforces uniqueness with a UNIQUE constraint or with a unique index, and only an index
can limit the rule to some rows: a partial unique index "enforces uniqueness among the rows that
satisfy the index predicate, without constraining those that do not". @ref
https://www.postgresql.org/docs/18/indexes-partial.html Applications use both. Of the tables a
production application (stern) exposes, 7 uniqueness rules are such indexes, 5 of them partial,
beside 30 UNIQUE constraints; a slice of GitLab 17.11 has 62 such indexes and no UNIQUE constraint.

A violated unique index is reported like a UNIQUE constraint: SQLSTATE 23505, the table in `table`,
and the index name in `constraint`, since "indexes are treated as constraints". @ref
https://www.postgresql.org/docs/18/protocol-error-fields.html A constraint's own index carries the
constraint's name: renaming the index renames the constraint, and `ADD CONSTRAINT ... USING INDEX`
renames the index. @ref https://www.postgresql.org/docs/18/sql-alterindex.html @ref
https://www.postgresql.org/docs/18/sql-altertable.html A CHECK or FOREIGN KEY constraint owns no
index and may share its name with a unique index of its table; both then report that name, under
23514 or 23503 and under 23505 (verified on PostgreSQL 14.19 and PGlite 18.3).

ADR 0005 drops indexes from the public catalog, so a consumer that maps errors or checks uniqueness
from it sees none of these rules: `@nizam-os/resource-core` derived no code for them, and a
duplicate surfaced as the generic 409 with no code and no pointer.

## Decision

- After its constraints, in the catalog's order, a public table lists each unique index whose name
  none of its constraints has, as `{ kind: 'unique', columns, nullsDistinct, partial }` keyed by the
  index name. `columns` are the key columns, without INCLUDE columns, and `partial` says whether a
  predicate limits the rule; the predicate stays private, as every expression does (ADR 0005).
- Every public unique constraint carries `partial`; a UNIQUE constraint's is `false`.
- An index with an expression element stays out, since its rule cannot be stated without the
  expression. An index whose name a CHECK or FOREIGN KEY constraint of its table has stays out too,
  since the constraint keeps the key; renaming the index brings it in.
- The full catalog does not change, since it lists every index already (SPEC 2.6). The public file's
  shape does, so `CATALOG_FORMAT` becomes 2.

## Consequences

A consumer reads every uniqueness rule a client can break in one record, keyed by the name an error
reports, and a partial rule is marked, so a client never treats it as total. The public constraints
are no longer only the table's constraints; a tool that needs to tell an index from a constraint
reads the full catalog. A unique index over an expression, such as `lower(email)`, has no public
form, so its violations reach a consumer of the public catalog unnamed. Every committed catalog
needs `pg-catalog extract` again.
