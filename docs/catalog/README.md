# catalog: your PostgreSQL schema as TypeScript

Your SQL migrations, replayed and read back from PostgreSQL's own catalog, as committed TypeScript:

- [`@nizam-os/catalog-core`](../../packages/catalog-core#readme): the catalog model as TypeScript
  types, plus two pure functions, `toPublicCatalog` (the browser-safe slice) and `diffCatalogs` (the
  structural comparison drift uses). No dependencies; runs on Node, Bun, Deno, Cloudflare Workers,
  and in browsers.
- [`@nizam-os/pg-catalog`](../../packages/pg-catalog#readme): the extractor and its CLI. It replays
  the migrations into PGlite or a throwaway database on a server, reads `pg_catalog`, translates the
  CHECK constraints it can translate exactly, and writes the full catalog, the public catalog, and
  Kysely types; `extract --check` keeps them current in CI and `drift` compares a live database with
  them. Node 22.12+, Bun, and Deno.

One extraction gives you every table, column, constraint (with PostgreSQL's deparsed expression and
the rule read from it), index, row security policy, enum, and domain, written deterministically so
that the files are reviewed with the migration that changed them. Every choice is written down in
[`docs/catalog/SPEC.md`](SPEC.md).

## Install

```bash
pnpm add -D @nizam-os/pg-catalog @electric-sql/pglite   # extraction with in-process PostgreSQL
pnpm add @nizam-os/catalog-core                          # only for libraries typed by a catalog
```

`@electric-sql/pglite` (0.5, PostgreSQL 18) is an optional peer dependency: leave it out when you
extract against a PostgreSQL server instead. The generated files import nothing at runtime, so
neither package ends up in your application bundle. The Kysely types import `kysely`'s types.

## Quick start

```ts
// pg-catalog.config.ts
import { defineExtraction } from '@nizam-os/pg-catalog';

export default defineExtraction({
  migrations: 'db/migrations', // Flyway V/R files or any *.sql, see "Migrations"
  out: {
    catalog: 'src/generated/catalog.ts',
    public: { file: 'src/generated/public-catalog.ts', tables: ['contacts'] },
    types: 'src/generated/db.ts',
  },
  drift: { production: { url: () => process.env['PRODUCTION_READONLY_URL'] } },
});
```

```bash
pnpm exec pg-catalog extract            # write the three files
pnpm exec pg-catalog extract --check    # in CI: exit 1 when a file is stale
pnpm exec pg-catalog drift --env production
```

```ts
import type { DB } from './generated/db';

import { Kysely, PostgresDialect } from 'kysely';

import { catalog } from './generated/catalog';

const db = new Kysely<DB>({ dialect: new PostgresDialect({ pool }) });

catalog.tables.contacts.constraints.contacts_name_length.rule;
// { kind: 'length', min: 1, max: 200 }, typed as that literal
```

## What you get

- **The schema PostgreSQL actually built.** Extraction replays your migrations into an empty
  database and reads `pg_catalog`, so the catalog describes the result of every `ALTER`, default,
  and generated expression, not a parse of the SQL text. Expressions are PostgreSQL's own deparsed
  text.
- **Rules you can trust.** Length bounds, numeric ranges, membership lists, `IS NOT NULL`, and
  regular expressions in a subset both engines read identically become rules that agree with the
  CHECK on every value. Anything else is `null`, which tells your API layer a validator must cover
  it.
- **A public slice you choose.** The public catalog holds only the tables you list and only what a
  form needs: types, nullability, defaults, rules, and every uniqueness rule, a unique index's
  included. No expressions, policies, or comments.
- **Kysely types from the same extraction.** Select types follow your driver's parsers,
  node-postgres's (`int8` and `numeric` are strings, timestamps are `Date`) or PGlite's own behind
  `PGliteDialect` (`int8` is `number | bigint`), and insert types take what the driver can send, so
  the types match the rows you get back, and they can never disagree with the catalog. With
  `camelCase`, the keys are the ones Kysely's `CamelCasePlugin` uses.
- **Deterministic files.** Same migrations, same bytes, on every machine and on PostgreSQL 14 to 18;
  CI proves the committed files current.
- **Drift detection.** A scheduled job compares a live database with the committed catalog through a
  read-only transaction and exits non-zero on any difference: a column added by hand, a dropped
  policy, a changed CHECK.

## Migrations

`migrations` is a directory or a function returning `{ name, sql }` entries in the order to run. In
a directory, when every file follows Flyway's naming, `V<version>__*.sql` files run by version and
`R__*.sql` files after them; otherwise every `*.sql` file runs in natural order of its path
(`2_x.sql` before `10_x.sql`), which fits dbmate, golang-migrate (`.down.sql` files are skipped),
and timestamped files. Each file runs as one implicit transaction, as most migration tools run it.

## Replay targets

PGlite is the default: PostgreSQL 18 in-process, nothing to install or start. Load the contrib
extensions your migrations create:

```ts
database: { pglite: { extensions: ['pgcrypto', 'citext', 'uuid-ossp'] } },
```

Any other PGlite extension (such as `@electric-sql/pglite-pgvector`) goes in the same list as the
imported object. Use a server when your migrations need an extension PGlite does not ship, or when
you want the exact major you run in production:

```ts
database: { url: () => process.env['CATALOG_DATABASE_URL'] },
```

Extraction creates a database named `nizam_catalog_<random>` from `template0`, replays into it, and
drops it, so the role needs `CREATEDB`. A local server for this is one command:

```bash
docker run --rm -d -p 5432:5432 -e POSTGRES_PASSWORD=postgres postgres:18
```

## In CI

```yaml
# .github/workflows/ci.yml (excerpt): fail when a migration changed and the files were not re-extracted
- run: pnpm exec pg-catalog extract --check
```

```yaml
# .github/workflows/drift.yml: compare production with the catalog of the deployed release
name: Database drift
on:
  schedule: [{ cron: '0 6 * * *' }]
  workflow_dispatch:
jobs:
  drift:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7 # pin by SHA, and check out the ref deployed to production
      - uses: pnpm/action-setup@v6
      - uses: actions/setup-node@v7
        with: { node-version: 24, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm exec pg-catalog drift --env production
        env:
          PRODUCTION_READONLY_URL: ${{ secrets.PRODUCTION_READONLY_URL }}
```

`drift` exits 0 when the database matches, 1 when it does not (with the differences grouped by
object kind, or as JSON with `--json`), and 2 when it could not run.

## Best practices

- **Name every constraint.** `constraint contacts_name_length check (...)` gives the catalog, the
  diffs, and your error mapping a stable key; PostgreSQL's generated names change when a column is
  renamed.
- **One concern per CHECK.** A length bound and a pattern in two constraints become two rules, each
  with its own name; joined in one constraint they become no rule at all.
- **Write CHECKs the recognizer reads.** `char_length(name) between 1 and 200`,
  `score >= 0 and score <= 100`, `status in ('draft', 'sent')`, `phone ~ '^\+[1-9][0-9]{6,14}$'`.
  Functions (`btrim(name) <> ''`), case-insensitive matches (`~*`), multi-column checks, and the
  regular expression features outside the subset (`\d`, `\w`, lookahead) stay `null`; cover them
  with a validator. SPEC section 8 lists every shape.
- **Enforce rules the way PostgreSQL does.** Count code points, compare bounds as exact decimals,
  keep a pattern's flags, and let null through; `@nizam-os/catalog-core`'s README has a function
  that does all four.
- **Use `now()`, never `'now'`.** A `'now'` default is converted to a constant when the migration
  runs, so every replay writes a different catalog (and production stores the deployment time).
- **Create roles idempotently.** Roles belong to the server, not the database, so a throwaway
  database on a shared server sees the roles of every earlier replay:
  `do $$ begin create role app_user nologin; exception when duplicate_object then null; end $$;`
- **Keep each file replayable as one transaction.** psql meta-commands and `COPY ... FROM stdin`
  cannot run; `CREATE INDEX CONCURRENTLY` must be alone in its file.
- **Commit the generated files, and exclude them from formatters and linters.** Their bytes are the
  contract `extract --check` verifies; a formatter that rewrites their quotes makes the check fail.
- **Review the public catalog's diff.** Adding a table to `public.tables` is a decision to show its
  structure to every browser; the diff of `public-catalog.ts` is where reviewers see it.
- **Give drift its own read-only role.** It needs `CONNECT` and `USAGE` on the configured schemas,
  nothing else: no table privileges, since it reads only the system catalogs. Without `USAGE`,
  PostgreSQL would qualify every name in the schema, so `drift` refuses to run instead of reporting
  false differences.

  ```sql
  create role catalog_drift login password '...';
  grant connect on database app to catalog_drift;
  grant usage on schema public to catalog_drift;
  ```

- **Name your driver.** Set `types.driver: 'pglite'` when the application queries PGlite through
  Kysely's `PGliteDialect`, and call `refreshArrayTypes()` after migrations that create types used
  in arrays; keep the default `'node-postgres'` for `PostgresDialect`, PGlite over a socket
  included.
- **Mirror custom type parsers in the Kysely types.** If your application registers parsers (for
  example `int8` as `bigint`), declare the same in `types.overrides` so the types keep matching the
  rows. With node-postgres an array type has a parser of its own, so `int8[]` stays strings, and
  `numeric` is a string but `numeric[]` is parsed as floats.
- **Write JSON as text with node-postgres, and name JSON shapes with domains.** node-postgres sends
  a JavaScript array as a PostgreSQL array, so `jsonb` columns take `JSON.stringify(value)`; PGlite
  takes the value itself. A domain such as `create domain settings as jsonb` can be overridden with
  its own TypeScript type.
- **Put NOT NULL on the column, not the domain.** A nullable column of a NOT NULL domain can still
  read as null, as PostgreSQL's documentation warns, so its select type keeps `| null`.
- **Give `types.camelCase` the options CamelCasePlugin gets.** A name the plugin cannot turn back
  into itself, such as `line_1` under the default options, stops extraction with
  `camel_case_mismatch`, which lists every one. Set `maintainNestedObjectKeys` on the plugin to read
  JSON keys as they were written.

## Documentation

- [`docs/catalog/DESIGN.md`](DESIGN.md): what the packages are, the principles, and the workflow by
  example
- [`docs/catalog/SPEC.md`](SPEC.md): the normative contract: the model, the queries, the recognizer
  grammar, the file formats, the type mapping, the CLI, and the tests that prove each
- [`docs/catalog/adr/`](adr): the decisions
- [`CONTRIBUTING.md`](CONTRIBUTING.md): the family's contribution guide; setup, gates, and releases
  are in the root [`CONTRIBUTING.md`](../../CONTRIBUTING.md)

## Why

A schema written in SQL is restated by hand in validation schemas, form metadata, API documents, and
query builder types, and every copy drifts on its own schedule. Code generators that parse SQL text
miss what `ALTER` statements and defaults did; ORMs that own the schema make SQL a second-class
input. This family takes the position that PostgreSQL is the authority on what the migrations built:
replay them, ask PostgreSQL, write the answer down deterministically, and translate a constraint
only when the translation is exact.

## License

MIT
