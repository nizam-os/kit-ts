# Contributing to the catalog family

`@nizam-os/catalog-core` (the database-free model) and `@nizam-os/pg-catalog` (the extractor and CLI).
The root [`CONTRIBUTING.md`](../../CONTRIBUTING.md) covers setup, the quality gates, the shared
conventions, commits, changesets, and releases; this guide adds what is specific to the family.
Design intent lives in [`DESIGN.md`](DESIGN.md), the normative contract in [`SPEC.md`](SPEC.md), and
decisions in [`adr/`](adr); read those before proposing changes to the model or the recognizer.

## Conventions

- **PostgreSQL is the authority.** The catalog is read from `pg_catalog` and PostgreSQL's deparse
  functions; migration text is never parsed. Where the manual is silent, the PostgreSQL source is
  the reference (`ruleutils.c`, `printtup.c`); add an `@ref <url>` comment next to the decision and
  name the rule in the test.
- **Capture deparsed text, do not write it.** Tests of the tokenizer, parser, recognizer, and
  normalizers use text PostgreSQL printed. To add a case, write the SQL, run it on PGlite and a
  PostgreSQL 14 server (the e2e harnesses do both), and paste the output; if the two majors differ,
  test both forms.
- **Never guess.** A new rule shape, default form, or mapping row must be exact for every value of
  the column's type. If a case cannot be decided from the catalog, the answer is `null`, and the
  documentation says what covers it instead.
- **Determinism is tested.** `e2e/catalog/expected/` is compared byte for byte, and the server suite
  compares PGlite with PostgreSQL 14 and 18. A change that alters the output updates `expected/` in
  the same PR, and the reviewer reads that diff.
- **End-to-end tests live in `e2e/catalog/`.** That directory is a private pnpm workspace package
  that depends on both packages through `workspace:*`, so its imports resolve into `dist/` and its
  `tsc` run checks the emitted declarations. Run one file with
  `pnpm --filter @nizam-os/catalog-e2e exec vitest run <name>` after `pnpm build`; set
  `CATALOG_PG_URL` to a PostgreSQL server (a role with `CREATEDB`) to include the server files.

## Adding a capability

- **A rule shape.** The captured deparse forms, the grammar or shape in `recognize/`, SPEC 8.3 (and
  8.4 for patterns), an amendment to ADR 0006 stating why the shape is equivalent, table-driven
  tests including the near misses that must stay `null`, a CHECK in the e2e fixture, the regenerated
  `expected/`, and a `minor` changeset for `@nizam-os/pg-catalog`.
- **A model member or object kind.** An ADR, SPEC 2 (and 3 when it is public), the query in
  `extract/queries.ts` for every supported major, `CATALOG_FORMAT` incremented, the core types, the
  e2e fixture and `expected/`, and a `major` changeset for both packages: every committed catalog
  changes.
- **A Kysely mapping row.** The pg-types source line that justifies it, SPEC 9.2, a row in the e2e
  runtime check that reads the column through `pg`, and a `minor` changeset (`major` when an
  existing row changes, since application types change).
- **A command or option.** SPEC 10 or 11, validation in `defineExtraction` with a `TypeError` naming
  the option, CLI exit codes, the README, and tests at the unit and CLI level.

**Constraints every contribution inherits.**

- `@nizam-os/catalog-core` has no dependencies and imports no runtime API beyond the language.
  `@nizam-os/pg-catalog` depends on `pg` and the core only; PGlite stays an optional peer imported
  dynamically.
- PostgreSQL 14 is the oldest supported major. A query that reads a column added later selects a
  constant on older majors (SPEC 7.2), and CI runs the server suite on 14 and 18.
- Errors from commands are `PgCatalogError` with a `code` from SPEC 12; a new failure mode is a new
  code, a SPEC row, and CLI exit 2.
- `e2e/catalog/package-surface.e2e.test.ts` lists every value export of both packages; a new export
  goes there and into an e2e file that runs it.

**Checklist.** Every item below is checked by CI or by a reviewer.

1. Source file in the right directory (see the repository map in `AGENTS.md`), with a
   `@packageDocumentation` header naming the SPEC section it implements and `@ref` links to the
   sources.
2. Unit tests beside the file; extraction tests run against PGlite, never a mock.
3. `docs/catalog/SPEC.md` for the behavior; `docs/catalog/DESIGN.md` when the intent changes; the
   README when a user would look for it.
4. `e2e/catalog/expected/` regenerated and reviewed when the output changes.
5. An ADR for a model change, a new rule shape, a dependency, or a change to a recorded decision.
6. A changeset: additive behavior (a rule shape, an option, an export) is `minor`, and says when it
   changes generated output so users re-extract; a model change (`CATALOG_FORMAT`), a changed
   mapping row, or a removed option is `major`.
