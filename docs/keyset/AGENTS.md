# keyset family: instructions for coding agents

Read with the root [`AGENTS.md`](../../AGENTS.md), which holds the rules every family shares; this
file adds what is specific to `@nizam-os/keyset-core` (the database-free core),
`@nizam-os/kysely-keyset` (the Kysely binding), and `@nizam-os/drizzle-keyset` (the Drizzle
binding). Humans: see [`CONTRIBUTING.md`](CONTRIBUTING.md).

## Ground rules

- Read `docs/keyset/DESIGN.md` for intent and `docs/keyset/SPEC.md` for the exact contract before
  changing public API. Implement from the SPEC section named in the file header; update the SPEC in
  the same PR when the code must differ. Read the relevant ADR in `docs/keyset/adr/` before changing
  a decision it records; add a new ADR instead of silently reversing one.
- Spec-driven, not memory-driven. Every behavior comes from the Cursor Pagination profile
  (https://jsonapi.org/profiles/ethanresnick/cursor-pagination/), the PostgreSQL documentation
  (ordering, pattern matching, arrays, text search, data types), Kysely's or Drizzle's
  documentation, the Web Crypto specification, or an RFC (2104 for HMAC, 4648 for base64url, 8785
  for canonical JSON). A Drizzle behavior its documentation does not state is measured, on the floor
  and the current version, before code relies on it. Fetch the clause, cite it in the code with an
  `@ref <url>` comment next to the decision it justifies, and name it in the test. Where the profile
  leaves a choice to the server, the choice is written down in `docs/keyset/SPEC.md` and an ADR.
- Every identifier in SQL comes from the definition, validated once in `defineKeyset`; every value
  from a request is a bound parameter. The one literal (the text search configuration) is validated
  against `regconfig`'s name syntax at definition time. Never interpolate request data.
- Error messages are constant. Request data goes into the error's structured fields, never into
  `message`.
- Client input never becomes an object key without a check (`PROTO_KEYS`, `Object.hasOwn`), and
  every lookup into client-shaped data goes through `internal/object.ts` or a `ReadonlyMap`.
- Database code stays in the adapters. Nothing under `packages/keyset-core/` imports `kysely`,
  `drizzle-orm`, or a driver; what needs a query builder lives in an adapter and renders the plan
  (ADR 0004, ADR 0017).
- In `packages/drizzle-keyset/`, every column reference is its own nested `sql` chunk (Drizzle drops
  the table of a column directly inside a selected expression), every value is `sql.param`, and
  `sql.raw` takes only the constant fragments of a lookup table and a configuration `isSearchConfig`
  accepted (ADR 0017).

## Repository map

A pnpm workspace: `packages/keyset-core` (the database-free core, published as
`@nizam-os/keyset-core`), `packages/kysely-keyset` (the Kysely adapter, published as
`@nizam-os/kysely-keyset`, depends on the core and re-exports it), `packages/drizzle-keyset` (the
Drizzle adapter, published as `@nizam-os/drizzle-keyset`, the same), and `e2e/keyset/` (private).
Root configs (`vitest.config.ts` with `test.projects`, `tsconfig.base.json`, `knip.jsonc`,
`.oxlintrc.json`, `.oxfmtrc.json`) apply to all of them.

`packages/keyset-core/src/`:

- `internal/` base64url and UTF-8 over web APIs, Web Crypto (SHA-256, HMAC), prototype-safe object
  helpers, canonical JSON, LIKE escaping; never exported
- `definition/` `defineKeyset`: the field type vocabularies (`field-types.ts`), field and relation
  validation (`normalize-fields.ts`, `normalize-relations.ts`), the definition types (`types.ts`),
  and the definition everything else reads from (`define-keyset.ts`)
- `filter/` the filter tree (`types.ts`), the operator table (`operators.ts`), value checks by type
  (`values.ts`), one condition to one predicate (`condition.ts`), the tree to a predicate
  (`normalize.ts`)
- `sort/` sort resolution with the key appended, and the sort signature cursors bind to
- `plan/` the query plan types (`types.ts`), the planner (`plan.ts`), the seek predicate and its
  branches (`seek.ts`)
- `page/` page request resolution (`page-request.ts`) and page assembly (`finish.ts`)
- `cursor/` the cursor codec: signing, verification, rotation, expiry, context binding
- `errors.ts` the request-time error classes
- `test-support/` the shared definition and helpers for the repository's own tests; not published

`packages/kysely-keyset/src/`:

- `index.ts` re-exports `@nizam-os/keyset-core` and adds the adapter
- `define-keyset.ts` `createDefineKeyset<DB>()`: a `defineKeyset` that checks names against the
  Kysely `DB` interface and whose keysets carry `paginate`
- `paginate.ts` the plan rendered onto the caller's select query: filter, total, seek, key
  selections, ordering, limit; rows split from the private aliases
- `page-query.ts` the page statement: one select, or a select per seek branch under `union all`
  (ADR 0020)
- `render/` `renderTarget` (columns, correlated aggregates, `concat_ws`) and `renderPredicate`
  (every predicate kind as a Kysely expression)
- `test-support/` a compile-only Kysely, a canned-rows driver, and the rows it answers, for the unit
  tests; not published

`packages/drizzle-keyset/src/`:

- `index.ts` re-exports `@nizam-os/keyset-core` and adds the adapter
- `define-keyset.ts` and `typed-init.ts` `createDefineKeyset(schema)`: a `defineKeyset` whose names
  are checked against the Drizzle schema's type and whose keysets carry `paginate`
- `check-names.ts` every name of a validated definition resolved in the schema object at definition
  time, and the nullability of each column field's column
- `schema.ts` `tableOf` and `columnOf`: prototype-safe lookups of tables and columns
- `paginate.ts` the select the binding builds: the caller's selection and condition, the filter, the
  total, the seek, the key selections, the ordering, the limit; rows split from the private aliases
- `page-query.ts` the page statement: one select, or a select per seek branch under `unionAll`
  (ADR 0020)
- `render/` `renderTarget` (columns, correlated aggregates, `concat_ws`) and `renderPredicate`
  (every predicate kind as Drizzle `sql`)
- `test-support/` a Drizzle schema, a `pg-proxy` database that records statements and answers canned
  rows, and the rows; not published

`e2e/keyset/`: end-to-end suite, a private workspace package that consumes the three built packages
through `workspace:*`; never imports from `src/`. `e2e/keyset/support/` holds the schema and seed
(`schema.ts`, `seed.ts`), the Drizzle schema of the same tables (`drizzle-schema.ts`), the harnesses
(`db.ts`: PGlite, node-postgres over pglite-socket, a PostgreSQL server), the keysets under test
(`keysets.ts`, each through both adapters), a pager per adapter (`bindings.ts`), the invariants
every harness and adapter must satisfy (`invariants.ts`), and the `EXPLAIN` runner the server plan
tests share (`explain.ts`). `e2e/keyset/smoke/` is the runtime smoke test (Bun, Deno, workerd).

- `docs/keyset/DESIGN.md` what we are building and why; `docs/keyset/SPEC.md` the normative
  contract; `docs/keyset/adr/` decisions
