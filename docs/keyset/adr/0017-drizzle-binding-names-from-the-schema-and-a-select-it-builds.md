# ADR 0017: The Drizzle binding takes names from the schema object and builds the select itself

- Status: accepted
- Date: 2026-10-12

## Context

ADR 0004 left room for an adapter per query builder, and this one is for Drizzle ORM. Five
properties of Drizzle decide how it must be built, measured on drizzle-orm 0.45.4 over PGlite 0.5.8:

- A Drizzle application names tables and columns by its schema's objects, not by SQL names. A table
  is an exported `pgTable` (or a `pgSchema(...).table`), a column is a property of it, and the
  database's `casing` option maps a property declared without a name (`createdAt: timestamp()`) to
  its SQL name (`created_at`) when the query renders. Only Drizzle's dialect knows the SQL name, and
  only at render time. @ref https://github.com/drizzle-team/drizzle-orm/releases/tag/0.34.0 (the
  `casing` option) @ref https://orm.drizzle.team/docs/sql-schema-declaration#schemas
- A Drizzle select cannot take the additions `paginate` makes. "You can only invoke most of the
  methods once": a second `.where()` is a type error, and after `$dynamic()` it replaces the first
  condition. The selection is fixed by `db.select(fields)`. @ref
  https://orm.drizzle.team/docs/dynamic-query-building
- Drizzle prints the columns of a selected expression without their table when a query reads one
  table (`PgDialect.buildSelection`). A correlated aggregate selected as a sort key then reads
  `"contact_id" = "id"`, which resolves `id` inside the subquery and fails
  (`operator does not exist: uuid = integer`); `sql` in the relational API's `extras` had the same
  problem. A column nested one `sql` deeper keeps its table. @ref
  https://github.com/drizzle-team/drizzle-orm/issues/4696
- `and()` joins its conditions without putting each in parentheses, so a caller's condition written
  as `sql` with an `or` would absorb whatever is joined after it. Values interpolated in `sql` are
  parameters, but a JavaScript array prints as a parameter list, `($1, $2)`, while
  `sql.param(value)` binds one parameter. Tables and columns print "with escaped names", and
  `sql.raw` includes its text "without any additional processing or escaping". @ref
  https://orm.drizzle.team/docs/sql
- Before 0.45.2, Drizzle did not escape a quote inside an identifier (CVE-2026-39356). 1.0 is still
  a release candidate on npm (1.0.0-rc.4), and the documentation already describes it: `getColumns`
  in place of `getTableColumns`, and casing declared on the table. @ref
  https://github.com/advisories/GHSA-gpj5-g38j-94v9 @ref https://orm.drizzle.team/docs/goodies

## Decision

- `@nizam-os/drizzle-keyset` is the Drizzle adapter, beside `@nizam-os/kysely-keyset`. It depends on
  `@nizam-os/keyset-core` (`workspace:^`), re-exports it in full, and has
  `drizzle-orm >=0.45.2 <1.0.0` as its only peer dependency. CI runs its unit tests on 0.45.2, the
  floor.
- Names are the schema's. `createDefineKeyset(schema, defaults?)` takes the schema object the
  application hands `drizzle()`. A definition's `table` and each relation's `table` are keys of it,
  and every column is a property name of its table. The definer resolves every name to Drizzle's
  table or column object at definition time. It throws `TypeError` naming the option when a name
  does not resolve, or when a column field over a column that is not `notNull` omits
  `nullable: true` (ADR 0011, ADR 0016). The renderer interpolates those objects, so `casing` and
  `pgSchema` tables apply as in the application's own queries.
- Every column reference is its own nested `sql` chunk, so a target keeps its table wherever it is
  selected.
- The binding builds the select. `keyset.paginate(db, request, options)` runs
  `db.select({ ...select, keysetN: cast(<target> as text) }).from(<table>)`. The caller's `where`,
  the filter, and the seek each go in parentheses, joined with `and`; the keys' `order by` with null
  placement and the `limit` follow. `select` defaults to the table's columns, and a member of it
  named like a key alias is a `TypeError`. The total counts the rows of the caller's `where` and the
  filter.
- Every value is `sql.param(value)`. `sql.raw` takes only constant fragments, from lookup tables
  over the plan's closed vocabularies (operators, directions, functions), and the text search
  configuration, after `isSearchConfig` accepts it again.
- The cursors are the Kysely binding's. The keys are selected cast to text (ADR 0007), and the
  cursor context binds field names, never tables or columns (SPEC 6.1).

## Consequences

- ADR 0012's plain selection holds by construction: the binding selects from one table, without
  joins, `distinct`, or grouping, and nothing the caller passes can change that. The cost is that a
  page cannot join. Data from other tables comes from a second query keyed by the page's rows (the
  relational API with `inArray`, for instance), or from a correlated subquery in `select`, whose
  columns the caller nests as the binding does.
- A definition names columns as the application's code does. A cursor issued by a Drizzle keyset
  resumes in a Kysely keyset with the same fields, sort, and secret, and the reverse, so an
  application can move between the builders, or run both, without invalidating cursors.
- Names and nullability are checked at runtime as well as in the types, because the schema is a
  value. The Kysely binding has only the types.
- drizzle-orm 1.0 is outside the range. When it ships, the suite runs on it, and the range widens in
  a minor release or a new ADR records what changed.
