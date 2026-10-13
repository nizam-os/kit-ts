# Contributing to the keyset family

`@nizam-os/keyset-core` (the database-free core), `@nizam-os/kysely-keyset` (the Kysely binding),
and `@nizam-os/drizzle-keyset` (the Drizzle binding). The root
[`CONTRIBUTING.md`](../../CONTRIBUTING.md) covers setup, the quality gates, the shared conventions,
commits, changesets, and releases; this guide adds what is specific to the family. Design intent
lives in [`DESIGN.md`](DESIGN.md), the normative contract in [`SPEC.md`](SPEC.md), and decisions in
[`adr/`](adr); read those before proposing API changes.

## Conventions

- **Every behavior traces to a source.** The Cursor Pagination profile, the PostgreSQL documentation
  (ordering, pattern matching, arrays, text search, data types), Kysely's and Drizzle's
  documentation, the Web Crypto specification, and RFCs 2104, 4648, and 8785 are the sources. A
  Drizzle behavior its documentation does not state is measured on the floor and the current
  version, and the measurement is cited. Add an `@ref <url>` comment next to the decision it
  justifies, and name the rule in the test. Where the profile leaves a choice to the server (page
  size bounds, the cursor format, null ordering, the operator table), the choice is recorded in
  `docs/keyset/SPEC.md` and an ADR, never only in code.
- **The core knows no database.** Everything under `packages/keyset-core/` is functions over plain
  values; the plan it produces is data (`QueryPlan`, `Predicate`, `Target`). What needs a query
  builder or a driver goes in an adapter, `packages/kysely-keyset/` or `packages/drizzle-keyset/`,
  and renders the plan (ADR 0004, ADR 0017).
- **Identifiers from the definition, values as parameters.** Table, column, relation, and
  configuration names reach SQL only after `defineKeyset` validated them; request values are always
  bound parameters; each adapter's unit tests assert the compiled SQL and parameters exactly. In
  `packages/drizzle-keyset/`, every column reference is its own nested `sql` chunk, every value is
  `sql.param`, and `sql.raw` takes only constant fragments and a configuration `isSearchConfig`
  accepted (ADR 0017).
- **End-to-end tests live in `e2e/keyset/`.** That directory is a private pnpm workspace package
  that depends on the three packages through `workspace:*`, so its imports resolve through the
  published `exports` maps into `dist/` and its `tsc` run checks the emitted declarations. Each
  `*.e2e.test.ts` file opens a database harness from `e2e/keyset/support/db.ts` (PGlite in-process,
  node-postgres over a PGlite socket server, or a PostgreSQL server) and asserts over real rows;
  expectations are computed in JavaScript from the seed, never read back from the SQL under test. A
  file that runs plans against rows runs once per adapter (`support/bindings.ts`). Never import from
  `src/` there. Run one file with `pnpm --filter @nizam-os/keyset-e2e exec vitest run <name>` after
  `pnpm build`.
- **Client input is hostile.** Names from a request become object keys only through
  `internal/object.ts` or after a `PROTO_KEYS` check; reads of client-shaped objects use
  `Object.hasOwn`; error messages are constant. See `SECURITY.md` for what counts as a
  vulnerability.

## Adding a capability

New library surface falls into one of these:

- **A filter operator.** A row in the operator table (`filter/operators.ts`), its mapping in
  `filter/condition.ts`, a predicate kind in `plan/types.ts` if none fits, each adapter's render
  case, the SPEC 4.2 row, an amendment to ADR 0005, tests at every layer, an e2e case, and a `minor`
  changeset for the three packages.
- **A field type.** The vocabulary in `definition/field-types.ts`, a value checker in
  `filter/values.ts`, its operators in the table, SPEC 3.1 and 4.3, tests, and a `minor` changeset.
- **A search mode or a sort feature.** A SPEC section and an ADR first (these change the SQL shape
  and the cursor context), then code.
- **An adapter for another query builder or driver.** A new package `packages/<name>-keyset/`
  following `packages/kysely-keyset/` and `packages/drizzle-keyset/` as the precedents: depends on
  `@nizam-os/keyset-core` (`workspace:^`), re-exports it in full, renders every `Predicate` and
  `Target` kind (or rejects the ones its target cannot express, documented), and exposes a
  `paginate` that calls `plan` and `page`. Its own e2e coverage joins `e2e/keyset/`.

**Constraints every contribution inherits.**

- `@nizam-os/keyset-core` has no dependencies and imports no runtime API beyond web standards (ADR
  0002). `kysely` is `@nizam-os/kysely-keyset`'s only peer dependency, at `>= 0.28.17`, and
  `drizzle-orm` is `@nizam-os/drizzle-keyset`'s, at `>=0.45.2 <1.0.0`. Each floor is the first
  release past its builder's published SQL injection advisories (ADR 0017, ADR 0018), and an
  advisory published against a release in a range raises that floor (root ADR 0007). CI tests both
  floors, so an API an adapter uses must exist at its floor: Kysely 0.28.17, drizzle-orm 0.45.2.
- A definition is validated once, in `defineKeyset`, with a `TypeError` naming the option. A
  request-time check that a definition mistake could trigger belongs there, not in the planner.
- A request-time error is one of the `KeysetError` classes in `errors.ts`, with a constant message
  and structured fields; a new one is a class, a `code`, a SPEC 9 row, and a `minor` changeset.
- The cursor format is versioned (`CURSOR_VERSION`). A change to the payload bumps the version and
  gets an ADR; old cursors are then rejected with reason `version`, never misread.
- `e2e/keyset/package-surface.e2e.test.ts` lists every value export of the three packages; a new
  export goes there, and into an e2e file that runs it against a database.

**Checklist.** Every item below is checked by CI or by a reviewer.

1. Source file in the right directory (see the repository map in `AGENTS.md`), with a
   `@packageDocumentation` header naming the SPEC section it implements and `@ref` links to the
   sources.
2. Unit tests beside the file; a `*.test-d.ts` when inference is part of the contract.
3. `docs/keyset/SPEC.md`: the section for the behavior, and section 1 when the public surface
   changes; `docs/keyset/DESIGN.md` when the intent changes; the README when a user would look for
   it.
4. `e2e/keyset/package-surface.e2e.test.ts` and an e2e case for anything that changes the SQL or the
   cursors.
5. An ADR for a public API change, a cursor format change, a server choice, or a dependency.
6. A changeset: an additive export or option is `minor`; anything that changes an existing cursor
   format, plan shape, SQL shape, or exported type is `major`.
