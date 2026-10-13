# catalog family: instructions for coding agents

Read with the root [`AGENTS.md`](../../AGENTS.md), which holds the rules every family shares; this
file adds what is specific to `@nizam-os/catalog-core` (the database-free model) and
`@nizam-os/pg-catalog` (the PostgreSQL extractor and CLI). Humans: see
[`CONTRIBUTING.md`](CONTRIBUTING.md).

## Ground rules

- Read `docs/catalog/DESIGN.md` for intent and `docs/catalog/SPEC.md` for the exact contract before
  changing public API or the model. Implement from the SPEC section named in the file header; update
  the SPEC in the same PR when the code must differ. Read the relevant ADR in `docs/catalog/adr/`
  before changing a decision it records; add a new ADR instead of silently reversing one.
- PostgreSQL is the authority. Facts come from `pg_catalog` and PostgreSQL's deparse functions
  (`pg_get_constraintdef`, `pg_get_expr`, `pg_get_indexdef`, `format_type`), never from parsing
  migration text. Behavior comes from the PostgreSQL manual (system catalogs, pattern matching,
  configuration), PostgreSQL's source where the manual is silent (`ruleutils.c` for deparsing,
  `printtup.c` for wire types), the ECMAScript specification for regular expressions, pg-types and
  PGlite's source (`types.ts`, `base.ts`) for the drivers' parsers and serializers, Kysely's
  documentation, PGlite's documentation, and Flyway's naming rules. Cite the clause next to the
  decision with an `@ref <url>` comment and name it in the test.
- Deparsed text in tests is real. Every expression a recognizer or normalizer test feeds in is text
  PostgreSQL 14 or 18 printed, captured by running the SQL, not typed from memory; the e2e suite
  proves the captured forms by extracting them again on PGlite and both servers.
- Never guess. A rule exists only when it is equivalent to its CHECK (SPEC 2.9, 8); a default
  literal only when the input conversion of the literal yields the stored default (SPEC 7.3). When
  in doubt the answer is `null`.
- Determinism is a contract. The output must be byte-identical across runs, machines, and majors 14
  to 18: sort in JavaScript, pin the session settings of SPEC 7.1, and never write object
  identifiers, versions, names of throwaway databases, or timestamps. A change to the model's shape
  increments `CATALOG_FORMAT`.
- The core knows no database. Nothing under `packages/catalog-core/` imports a driver, PGlite, or a
  Node.js module (ADR 0002).
- Extraction SQL is fixed text. Schema names reach the queries only as bound parameters, and the one
  setting built from configuration (`search_path`) goes through `set_config` with each name quoted
  by `quote_ident`.

## Repository map

`packages/catalog-core/src/`: `model.ts` and `rules.ts` (the model types and `CATALOG_FORMAT`),
`public.ts` (`toPublicCatalog`), `diff.ts` (`diffCatalogs`), `internal/json.ts` (JSON helpers);
never imports anything outside itself.

`packages/pg-catalog/src/`:

- `migrations/` loading a directory or a function, Flyway detection, natural order
- `target/` the session interface and settings, PGlite, a throwaway database on a server, and the
  live connection drift uses
- `replay.ts` running the migrations in order with the pinned settings
- `extract/` the queries by server version, `readCatalog`, and the normalizers (type modifiers,
  default literals, search configuration, names and keys)
- `sql/` the tokenizer and expression parser for deparsed SQL
- `recognize/` the CHECK recognizer and the regular expression subset
- `render/` the catalog modules, their parser, and the Kysely types with one type table per driver
  (`kysely-node-postgres.ts`, `kysely-pglite.ts`) and the mapping over them (`kysely-mapping.ts`)
- `commands/` `extractCatalog`, `extract`, `introspectCatalog`, `drift`, `formatDiff`
- `config.ts`, `config-validate.ts`, `config-file.ts` `defineExtraction`, its checks, and loading
  `pg-catalog.config.*`
- `cli.ts`, `cli/arguments.ts`, `cli/main.ts` the bin, its argument parser, and `runCli`

`e2e/catalog/`: the end-to-end suite, a private workspace package that consumes the built packages
through `workspace:*` and never imports from `src/`. `fixtures/contacts/` holds a realistic
application's migrations and `expected/` the three files extraction must produce for them, with the
types rendered with `camelCase` and for PGlite; `smoke/` runs the packages on Bun, Deno, and
workerd.

- `docs/catalog/DESIGN.md` what we are building and why; `docs/catalog/SPEC.md` the normative
  contract; `docs/catalog/adr/` decisions
