# @nizam-os/pg-catalog

Your PostgreSQL schema as committed TypeScript. It replays your SQL migrations into a fresh database
(PGlite in-process, or a throwaway database on a server), reads PostgreSQL's own catalog, and writes
it as an `as const` module: every table, column, constraint, index, row security policy, enum, and
domain, written deterministically so the file is reviewed with the migration that changed it. From
the same catalog it writes your Kysely types, `drift` compares a live database with it, and
`rules --check` proves that the schemas of your declared resources agree with the database. Every
choice is specified in
[`docs/catalog/SPEC.md`](https://github.com/nizam-os/kit-ts/blob/main/docs/catalog/SPEC.md).

## Install

```bash
pnpm add -D @nizam-os/pg-catalog @electric-sql/pglite
```

Node 22.12+, Bun, and Deno. It depends on [`pg`](https://node-postgres.com) and on
[`@nizam-os/catalog-core`](https://www.npmjs.com/package/@nizam-os/catalog-core), which it
re-exports in full. `@electric-sql/pglite` (0.5, PostgreSQL 18) is an optional peer dependency:
leave it out when you extract against a server. So is `@nizam-os/resource-core`, which only
`rules --check` loads. The generated files import nothing, so neither package reaches your
application bundle.

## Quick start

```ts
// pg-catalog.config.ts
import { defineExtraction } from '@nizam-os/pg-catalog';

export default defineExtraction({
  migrations: 'db/migrations',
  database: { pglite: { extensions: ['pg_trgm', 'citext'] } },
  schemas: ['public', 'audit'],
  out: {
    catalog: 'src/generated/catalog.ts',
    public: { file: 'src/generated/public-catalog.ts', tables: ['contacts', 'organizations'] },
    types: 'src/generated/db.ts',
  },
});
```

```bash
pnpm exec pg-catalog extract           # write the files
pnpm exec pg-catalog extract --check   # in CI: write nothing, exit 1 when a file is stale or missing
```

```text
written   src/generated/catalog.ts
written   src/generated/public-catalog.ts
written   src/generated/db.ts
```

```ts
import { catalog } from './generated/catalog';

catalog.tables.contacts.columns.status.default;
// { expression: "'active'::text", literal: 'active' }
catalog.tables.contacts.constraints.contacts_organization_id_fkey.references;
// { table: 'organizations', columns: ['id'] }
```

## The CLI

```text
pg-catalog extract [--check] [--config <file>]
pg-catalog drift --env <name> [--json] [--config <file>]
pg-catalog rules --check [--config <file>]
pg-catalog surface [--check] [--config <file>]
pg-catalog --help
pg-catalog --version
```

| Command           | Exits 0                  | Exits 1                                      | Exits 2          |
| ----------------- | ------------------------ | -------------------------------------------- | ---------------- |
| `extract`         | files written or current | never                                        | it could not run |
| `extract --check` | every file current       | a file is stale or missing                   | it could not run |
| `drift`           | no differences           | differences                                  | it could not run |
| `rules --check`   | no disagreements         | a disagreement, or a case that could not run | it could not run |
| `surface`         | file written or current  | never                                        | it could not run |
| `surface --check` | no breaking change       | a breaking change, or no file                | it could not run |

`extract` prints one line per file: its status (`written`, `unchanged`, `stale`, or `missing`) and
its path. `drift` prints the differences, or with `--json` the `CatalogDiff` itself (see
[Drift](#drift)). `rules --check` prints each disagreement (see
[Checking declarations against the database](#checking-declarations-against-the-database)).
`surface` prints the file's status (`written` or `unchanged`) and path, and `surface --check` each
change from it (see [The API surface](#the-api-surface)). Failures go to standard error as
`pg-catalog: <message>`, and a mistake in the arguments adds a pointer to `--help`.

Without `--config`, the CLI loads the first of `pg-catalog.config.ts`, `pg-catalog.config.mts`,
`pg-catalog.config.js`, and `pg-catalog.config.mjs` in the working directory. Relative paths in it
resolve against its own directory, so `pg-catalog extract --config db/pg-catalog.config.ts` works
from anywhere. Its default export must be a configuration. `defineExtraction` types it and checks it
as the file loads: an unknown option (`postgres:` where `database:` was meant), an empty path, a
`database` with both or neither of `pglite` and `url`, a system or duplicate schema, a
`types.driver` other than `'node-postgres'` and `'pglite'`, an interface name that does not start
with an uppercase letter or that both modules share, or a drift environment name outside
`^[A-Za-z0-9][A-Za-z0-9_-]*$` fails with a message naming the option. URL functions run only in the
command that needs them, so `extract` never reads the variable behind a drift URL.

A TypeScript configuration needs a runtime that strips types: Node.js 22.18 or later, Bun, or Deno.
On Node.js 22.12 to 22.17, set `NODE_OPTIONS=--experimental-strip-types`, or write
`pg-catalog.config.mjs`. Node.js strips types without compiling, so imports of your own modules
carry their extension (`'./db/migrations.ts'`), and `enum` and `namespace` are not available. Bun
runs the CLI as `bunx --bun pg-catalog`, and Deno as `deno run -A npm:@nizam-os/pg-catalog`.

The same commands are functions. `extract(config, { check, cwd })` returns the status of each file
without printing anything, and relative paths resolve against `cwd`, which defaults to the working
directory:

```ts
import { extract } from '@nizam-os/pg-catalog';

const report = await extract(
  { migrations: 'db/migrations', out: { catalog: 'src/generated/catalog.ts' } },
  { check: true },
);
const outdated = report.files.filter((file) => file.status !== 'unchanged');
```

## What it writes

- **`catalog.ts`**: `export const catalog: ExtractedCatalog`, the full catalog of the configured
  schemas (the model is described in `@nizam-os/catalog-core`). Expressions and definitions are
  PostgreSQL's own deparsed text; objects that belong to an extension, views, functions, sequences,
  and partitions are left out.
- **`public-catalog.ts`** (with `out.public`): `export const publicCatalog: ExtractedPublicCatalog`,
  the slice of the tables you list that a browser may see, without expressions, policies, or
  comments. Of the indexes it keeps the unique ones no constraint backs, as unique constraints
  marked `partial` when a `WHERE` clause limits them. A CHECK or foreign key keeps `enforced`, false
  when it is NOT ENFORCED.
- **`db.ts`** (with `out.types`): the Kysely types, one interface per table and the `DB` interface
  that collects them. It imports only types from `kysely`.

The catalog modules are JSON under `as const`, with keys in a fixed order (code-unit order, columns
in table order). Every file is rendered the same way from the same catalog, so the same migrations
give the same bytes on every machine, and on PostgreSQL 14 to 18.

```ts
// Generated by @nizam-os/pg-catalog. Do not edit: change the migrations and run `pg-catalog extract`.
const value = {
  "format": 3,
  ...
} as const;

/** The type of `catalog`, by a name compile errors print in place of its members. */
export interface ContactsCatalog extends Readonly<typeof value> {}

export const catalog: ContactsCatalog = value;
```

The binding's type is an interface that extends the literal's type and restates nothing, because
TypeScript prints an interface by its name and an anonymous literal member by member. A compile
error in code typed by the catalog then reads `DeclareContext<ContactsPublicCatalog, ...>` instead
of a dump of the catalog cut short, and costs far less to check: on a schema of 115 tables, a file
with 76 such errors checked in 0.44 s and 183 MB instead of 13.4 s and 5.8 GB. The interfaces are
`ExtractedCatalog` and `ExtractedPublicCatalog` unless the configuration names them:

```ts
out: {
  catalog: { file: 'src/generated/catalog.ts', interface: 'ContactsCatalog' },
  public: {
    file: 'src/generated/public-catalog.ts',
    tables: ['contacts', 'organizations'],
    interface: 'ContactsPublicCatalog',
  },
},
```

A name is an ASCII identifier that starts with an uppercase letter, and the two differ.
`typeof catalog` is the interface, so code that names the type either way keeps working.

## Kysely types

A column's select type is what your driver returns for it, and its insert and update types are the
values the driver can send, so the types match the rows you get back. The default driver is
node-postgres, behind Kysely's `PostgresDialect`; [PGlite](#pglite) behind `PGliteDialect` has a
table of its own. From the repository's contacts application:

```ts
export type ContactKind = 'person' | 'company';

export interface ContactsTable {
  id: Generated<string>;
  organization_id: ColumnType<string, string | number | bigint, string | number | bigint>;
  kind: Generated<ContactKind>;
  name: string;
  email: string | null;
  discount: ColumnType<string | null, string | number | null | undefined, string | number | null>;
  tags: ColumnType<Array<string>, Array<string> | string | undefined, Array<string> | string>;
  search: GeneratedAlways<string | null>;
  created_at: ColumnType<Date, Date | string | undefined, Date | string>;
}
```

```ts
import type { DB } from './generated/db';

import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';

const db = new Kysely<DB>({ dialect: new PostgresDialect({ pool: new pg.Pool() }) });

const contact = await db
  .selectFrom('contacts')
  .select(['id', 'kind', 'tags', 'created_at'])
  .executeTakeFirstOrThrow();
// { id: string; kind: ContactKind; tags: Array<string>; created_at: Date }
```

With node-postgres:

| PostgreSQL                                       | Select             | Insert and update            |
| ------------------------------------------------ | ------------------ | ---------------------------- |
| `int2`, `int4`, `float4`, `float8`, `oid`        | `number`           | `number`                     |
| `int8`                                           | `string`           | `string \| number \| bigint` |
| `numeric`                                        | `string`           | `string \| number`           |
| `bool`                                           | `boolean`          | `boolean`                    |
| `date`, `timestamp`, `timestamptz`               | `Date`             | `Date \| string`             |
| `interval`                                       | `PostgresInterval` | `PostgresInterval \| string` |
| `bytea`                                          | `Buffer`           | `Buffer`                     |
| `json`, `jsonb`                                  | `JsonValue`        | `string`, the JSON text      |
| `point`, `circle`                                | `Point`, `Circle`  | `string`                     |
| an enum                                          | its labels         | its labels                   |
| `text`, `uuid`, `citext`, ranges, and all others | `string`           | `string`                     |

- **Nullability and defaults.** A nullable column adds `| null`. A default, the column's or its
  domain's, or an identity `BY DEFAULT` makes a column optional on insert; an identity `ALWAYS` or a
  generated column is `GeneratedAlways`, which Kysely never writes.
- **Arrays.** Arrays of the common built-in types come back parsed, such as `Array<number>` or
  `Array<Date>`; arrays of enums, domains, and other types come back as PostgreSQL's array text, so
  their select type is `string`. Every array column accepts a JavaScript array or array text.
- **Domains** map as the type they are declared over. A domain from a schema outside `schemas` maps
  to `unknown`, and an enum from one to `string`.
- **Helpers.** `JsonValue`, `JsonParameter`, `PostgresInterval`, `Point`, and `Circle` are declared
  in the file when a column uses them.

SPEC section 9.2 lists every type of both tables. Tests hold each table against its driver,
node-postgres on PostgreSQL 14 and 18 and PGlite on 0.5.0 and the current release: a value of every
insert type goes in, and what comes back has the select type.

### PGlite

An application on Kysely's `PGliteDialect` reads rows through PGlite's own parsers, which return
other types than node-postgres's. Name the driver:

```ts
types: { file: 'src/generated/db.ts', driver: 'pglite' },
```

```ts
import type { DB } from './generated/db';

import { PGlite } from '@electric-sql/pglite';
import { Kysely, PGliteDialect } from 'kysely';

const pglite = await PGlite.create('idb://app');
await migrate(pglite);
// PGlite learns array types when it starts: an enum[] the migrations just created parses after this.
await pglite.refreshArrayTypes();

const db = new Kysely<DB>({ dialect: new PGliteDialect({ pglite }) });
```

Where PGlite differs from node-postgres:

| PostgreSQL                                          | Select             | Insert and update                      |
| --------------------------------------------------- | ------------------ | -------------------------------------- |
| `int8`                                              | `number \| bigint` | `string \| number \| bigint`           |
| `bytea`                                             | `Uint8Array`       | `Uint8Array`                           |
| `json`, `jsonb`                                     | `JsonValue`        | `JsonParameter`: a value, or JSON text |
| `interval`, `point`, `circle`                       | `string`           | `string`                               |
| `numeric[]`, `interval[]`, and other unparsed types | `Array<string>`    | `Array<element insert type> \| string` |
| an enum's array                                     | `Array<labels>`    | `Array<labels> \| string`              |
| a domain's array                                    | `Array<string>`    | `Array<element insert type> \| string` |

- **`int8`** is a number up to 2^53 − 1 and a `bigint` beyond, as PGlite's parser returns it.
- **JSON** goes in as a value, which PGlite sends with `JSON.stringify`; a string is sent as JSON
  text, so write `'"plain"'` for the JSON string `plain`.
- **Arrays.** PGlite parses every array, each element with its type's parser; a domain has none, so
  its elements stay text. It learns the array types when it starts and on `refreshArrayTypes()`:
  call it after migrations that create a type an array column uses. A database opened later needs
  nothing.
- **Domains.** PGlite sends a domain column's value with `toString()`, so a domain over a date or
  time type, `bytea`, `json`, `jsonb`, or an array takes PostgreSQL's text:
  `'2026-01-02 03:04:05+00'`, `'\x0102'`, `'{"a":1}'`, `'{1,2}'`. A `Uint8Array` would be stored as
  the text of its bytes, without an error.
- **Time zones.** PGlite writes a `Date` in UTC but reads a `timestamp` (without time zone) in the
  process's local zone: use `timestamptz`, or run in UTC.
- **pglite-socket.** PGlite served over a socket to node-postgres returns node-postgres's types;
  keep the default driver there.

### Overrides

When your application registers its own parsers, or a column holds a shape TypeScript should know,
override the mapping per type, with one type for all three positions or one per position:

```ts
// The parsers the application registers before it creates its pool:
pg.types.setTypeParser(20, BigInt); // int8
pg.types.setTypeParser(1082, (text) => text); // date, as 'YYYY-MM-DD'
```

```ts
types: {
  file: 'src/generated/db.ts',
  overrides: {
    // Mirror the parsers above. int8[] and date[] keep parsers of their own.
    int8: 'bigint',
    date: { select: 'string', insert: 'Date | string', update: 'Date | string' },
    // A domain names a JSON object: `create domain settings as jsonb;`
    settings: 'Settings',
  },
  imports: ["import type { Settings } from '../settings';"],
},
```

A key is a type as the catalog names it (`int8`, `settings`, `audit.level`), or `<type>[]` for its
arrays. The override of a column's own type wins over those of the domains under it. A missing
`insert` or `update` takes the `select` type, as in Kysely's `ColumnType`, and `imports` are written
verbatim after Kysely's.

The table follows `types.driver`. Any other driver needs an override for every type it returns
differently from the table you pick. With PGlite, which parses an array's elements with the element
type's parser, the application's included, the override of `int8` also types `int8[]`.

### camelCase

An application that uses Kysely's `CamelCasePlugin` writes `contactPhones.contactId` for the column
`contact_phones.contact_id`. With `camelCase`, the types use those keys, and type names stay the
same:

```ts
types: { file: 'src/generated/db.ts', camelCase: true },
```

```ts
import { CamelCasePlugin, Kysely, PostgresDialect } from 'kysely';

const db = new Kysely<DB>({
  dialect: new PostgresDialect({ pool: new pg.Pool() }),
  plugins: [new CamelCasePlugin()],
});

const phone = await db
  .selectFrom('contactPhones')
  .select(['contactId', 'number'])
  .executeTakeFirstOrThrow();
// { contactId: string; number: string }
```

Give `camelCase` the options the plugin gets: `{ underscoreBeforeDigits: true }` for
`new CamelCasePlugin({ underscoreBeforeDigits: true })`. In queries the plugin turns each key back
into snake_case, and some names do not survive the trip: with the default options, `line_1` becomes
`line1`, which turns back into `line1`. Rather than write keys whose queries would fail, `extract`
stops with `camel_case_mismatch` and lists every such name. Rename those columns, or pick the
options under which all of them survive.

## Rules from CHECK constraints

Each CHECK constraint, on a table or a domain, carries a `rule` when its expression can be read
exactly: the length, range, set of values, not-null test, or pattern it states, which agrees with
PostgreSQL's verdict on every value. Anything else is `null`, which tells your API layer that a
validator must cover it. From the repository's test schema:

| CHECK                                             | `rule`                                                                                          |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `char_length(name) between 1 and 200`             | `{ kind: 'length', min: 1, max: 200 }`                                                          |
| `nickname <> ''`                                  | `{ kind: 'length', min: 1, max: null }`                                                         |
| `seats > 0`                                       | `{ kind: 'range', min: { value: '0', inclusive: false }, max: null }`                           |
| `priority between 1 and 5`                        | `{ kind: 'range', min: { value: '1', inclusive: true }, max: { value: '5', inclusive: true } }` |
| `status in ('active', 'archived')`                | `{ kind: 'enum', values: ['active', 'archived'] }`                                              |
| `website is null or website ~ '^https://'`        | `{ kind: 'pattern', source: '^https://', flags: 'su' }`                                         |
| `value is not null`, on a domain                  | `{ kind: 'notNull' }`                                                                           |
| `value ~ '^[^@ ]+@[^@ ]+$'`, on a `citext` domain | `null`: `citext` compares case-insensitively                                                    |

- A CHECK becomes a rule when it tests one column, or a domain's `VALUE`, in a shape SPEC section 8
  lists. The recognizer reads PostgreSQL's deparsed text, so `between`, `in`, and an `is null or`
  guard all qualify.
- A NOT VALID CHECK keeps its rule, since PostgreSQL checks every new row; its `validated: false`
  says older rows may break it. A NOT ENFORCED CHECK (PostgreSQL 18) has none, since the database
  never checks it, and the public catalog marks it `enforced: false`.
- Columns under a nondeterministic (case- or accent-insensitive) collation, and `citext`, `char(n)`,
  and `real` columns, get no rule but `notNull`: their comparisons are not the ones a rule
  describes. A domain's CHECK compares under the collation of the type the domain is declared over.
- To enforce a rule in your application exactly as PostgreSQL does, follow
  [`@nizam-os/catalog-core`'s README](https://github.com/nizam-os/kit-ts/tree/main/packages/catalog-core#enforcing-a-rule).

## Migrations

`migrations` is a directory, relative to `cwd`, or a function returning `{ name, sql }` entries in
the order to run. In a directory:

- When every `.sql` file follows Flyway's naming, `V<version>__<description>.sql` files run by
  version (`V1_10` after `V1_9`) and `R__<description>.sql` files after them; `U` undo files never
  run. Two files with the same version fail.
- Otherwise every `.sql` file runs in natural order of its path (`2_x.sql` before `10_x.sql`), which
  fits dbmate, golang-migrate, and timestamped files. `.down.sql` files are skipped.

Each file runs as one simple-protocol query, which PostgreSQL runs as one implicit transaction. A
failing file stops the extraction with its name, PostgreSQL's message and code, and the line and
column:

```text
migration V8__broken.sql failed at line 2, column 20: type "txt" does not exist (SQLSTATE 42704)
```

## Replay targets

**PGlite** is the default: PostgreSQL 18 in-process, nothing to install or start. Name the contrib
extensions your migrations create; your migrations still run `create extension` themselves:

```ts
database: { pglite: { extensions: ['pgcrypto', 'citext', 'uuid-ossp'] } },
```

A PGlite extension object, such as the export of `@electric-sql/pglite-pgvector`, goes in the same
list.

**A server** when your migrations need an extension PGlite lacks (PostGIS), or to replay on the
exact major you run in production:

```ts
database: { url: () => process.env['CATALOG_DATABASE_URL'] },
```

Extraction creates `nizam_catalog_<random>` from `template0` with UTF-8 encoding, replays into it,
reads it, and drops it, even when a migration fails, so the role needs `CREATEDB`. A function is
called only when the URL is needed.

## Drift

`pg-catalog drift --env <name>` compares a live database with the committed catalog. It connects to
the environment's URL, reads the catalog with the queries `extract` uses inside a
`REPEATABLE READ READ ONLY` transaction, rolls back, and diffs the result against `out.catalog`. It
replays nothing and cannot write, even through a privileged role.

```ts
// pg-catalog.config.ts
export default defineExtraction({
  migrations: 'db/migrations',
  schemas: ['public', 'audit'],
  out: { catalog: 'src/generated/catalog.ts' },
  drift: { production: { url: () => process.env['PRODUCTION_READONLY_URL'] } },
});
```

```bash
pnpm exec pg-catalog drift --env production          # exit 1 when the database differs
pnpm exec pg-catalog drift --env production --json   # the CatalogDiff, for scripts
```

After a hotfix outside the migrations, the repository's contacts application reports:

```text
3 objects differ: 1 added, 1 removed, 1 changed

Columns
  + contacts.fax

Constraints
  ~ organizations.organizations_seats_check
      expression: expected "(seats > 0)", actual "(seats >= 0)"
      rule.min.inclusive: expected false, actual true
      definition: expected "CHECK ((seats > 0))", actual "CHECK ((seats >= 0))"

Policies
  - meetings.meetings_tenant_isolation
```

`+` marks an object only the live database has, `-` one only the committed catalog has, and `~` one
that differs. The text is for people and may change between minor versions; the `--json` output, the
`CatalogDiff` of `diffCatalogs`, is the stable format for machines. From code,
`drift(config, 'production')` returns `{ environment, diff }`, `formatDiff(diff)` gives the text,
and `introspectCatalog({ url, schemas })` returns the live catalog itself.

The URL is meant for a role of its own that can only connect and read names:

```sql
create role catalog_drift login password '...';
grant connect on database app to catalog_drift;
grant usage on schema public, audit to catalog_drift;
```

Without `USAGE` on a configured schema, PostgreSQL leaves that schema out of the role's search path
and qualifies every name in it, so `drift` stops with `schema_usage` instead of reporting false
drift. Unknown environments, URL functions that return nothing, and an unreadable committed catalog
fail before any connection is made.

## Checking declarations against the database

`pg-catalog rules --check` proves that the declared resources of
[`@nizam-os/resource-core`](https://www.npmjs.com/package/@nizam-os/resource-core) agree with the
database your migrations build. It replays the migrations, writes each fixture into a temporary copy
of the columns it belongs to, with their types, collations, and the CHECKs that apply, and holds
PostgreSQL's verdict against the schema's:

- each field's and relationship's boundary values (the empty string, `maxLength` and one past it, a
  type's limits, an unpaired surrogate): a value the schema accepts must be stored as itself, and
  one it refuses must be refused;
- each validator's fixtures: an `accept` fixture must be stored, and a `reject` fixture refused by
  the CHECK the validator stands for, not by the column's type;
- each codec's fixtures: written through its storage codec, stored, and read back as the same value.

```ts
// pg-catalog.config.ts
import { defineExtraction } from '@nizam-os/pg-catalog';

import { timeRangeText } from './src/storage/time-range-text.ts';

export default defineExtraction({
  migrations: 'db/migrations',
  out: {
    catalog: 'src/generated/catalog.ts',
    public: { file: 'src/generated/public-catalog.ts', tables: ['meetings', 'contact_phones'] },
  },
  resources: {
    registry: async () => (await import('./src/resources/index.ts')).resources,
    storage: { timeRange: timeRangeText },
  },
});
```

```bash
pnpm add -D @nizam-os/resource-core   # if it is not a dependency already
pnpm exec pg-catalog rules --check   # exit 1 on a disagreement
```

On the repository's contacts application, with a `lowercase` validator that also refuses digits and
a codec fixture written with an offset, it reports:

```text
3 cases, 12 fixtures: 2 disagreements

meetings CHECK meetings_room_lowercase (validator lowercase)
  reject[1] "lobby-2": the validator refuses it; the database accepts it
meetings.during (codec timeRange)
  fixtures[0] {"start":"2026-03-02T09:00:00+01:00","end":"2026-03-02T10:30…: the database stores ["2026-03-02 08:00:00+00","2026-03-02 09:30:00+00"), which reads back as {"start":"2026-03-02T08:00:00Z","end":"2026-03-02T09:30:00Z"}

warning: out.public.tables lists contact_phones, which no declared resource reads
```

The CHECK `room = lower(room)` holds `lobby-2`, so the validator would tell a client that a room the
database takes is invalid; and `tstzrange` keeps instants, not offsets, so the fixture does not read
back as written. Each line gives the fixture's label, its value, and how the two disagree. A case
whose table, column, CHECK, or domain the migrations do not create, as with a catalog older than the
migrations, is reported as `could not run` and fails the check too. A table of `out.public.tables`
that no declaration reads gets a warning, which does not.

A storage codec over text does what your storage adapter's codec does, in the text PostgreSQL reads
and prints rather than the driver's values: `write` turns the codec's value into the text a column
of its type reads, and `read` turns the text it prints, in a UTC session with ISO dates, back into
the value. For pgvector's `vector`:

```ts
const vectorText = {
  write: (values: ReadonlyArray<number>): string => `[${values.join(',')}]`,
  read: (stored: string): unknown => JSON.parse(stored), // [0.25,-1,3]
};
```

From code, `checkRules(config, { cwd })` returns the report, `{ cases, unusedTables }`, with each
case's subject, fixture count, problem, and disagreements, and `formatRules(report)` gives the text,
which may change between minor versions.

## The API surface

`pg-catalog surface` writes the API surface of the declared resources, what their clients depend on,
to a JSON file you commit: per type its operations, and per field and relationship its access, wire
form, limits, options, nullability, requiredness, operators, and sortability, with the error codes
and their statuses (`surfaceOf` of `@nizam-os/resource-core/openapi`). `pg-catalog surface --check`
compares the committed file with the declarations and prints each change, marked breaking when a
client written against the file may fail: a type, operation, member, code, operator, or option
removed; an access that loses a capability; a member that becomes required on create; a wire form,
format, or codec changed; a limit tightened. It exits 1 on a breaking change, and 0 when every
change is safe, such as a member, an operator, or an option added.

```ts
// pg-catalog.config.ts
export default defineExtraction({
  migrations: 'db/migrations',
  out: {
    catalog: 'src/generated/catalog.ts',
    public: { file: 'src/generated/public-catalog.ts', tables: ['contacts', 'organizations'] },
  },
  resources: {
    registry: async () => (await import('./src/resources/index.ts')).resources,
    surface: 'api-surface.json',
  },
});
```

```bash
pnpm exec pg-catalog surface           # write api-surface.json, and commit it
pnpm exec pg-catalog surface --check   # in CI: exit 1 on a breaking change
```

On the repository's contacts application, after its declaration withdraws `remove`, makes `nickname`
read-only, filters `email` with `in` too, and stops sorting `priority`, the check prints:

```text
api-surface.json: 4 changes, 3 breaking

Breaking
  - contacts.operations.remove
  ~ contacts.fields.nickname.access: "readWrite" -> "read"
  ~ contacts.fields.priority.sortable: true -> false

Safe
  + contacts.fields.email.operators.in

Run pg-catalog surface to record them.
```

The command reads the declarations alone: it replays no migration and needs no database. When a
breaking change is meant, run `pg-catalog surface` and commit the file with the change, so the
review shows it. A missing file fails the check, and a file that is not JSON, or that a version with
another surface `format` wrote, fails with `surface_unreadable`; write it again with
`pg-catalog surface`.

From code, `writeSurface(config, { cwd })` returns `{ file, status }`, and
`checkSurface(config, { cwd })` returns `{ file, status, changes }` with each change as
`diffSurfaces` gives it; `formatSurface(report, file)` gives the text, which may change between
minor versions.

## Errors

Every failure is a `PgCatalogError` (`isPgCatalogError` narrows it) with a `code`, a message naming
the object or file, and PostgreSQL's error as `cause` where there is one. The CLI prints the message
and exits 2. `defineExtraction` throws a `TypeError` instead, since its mistakes are in the code:

| `code`                  | When                                                                                                                                                                |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `config_invalid`        | no configuration file, a file that fails to load or validate, a URL function returned nothing, an unknown drift environment, or a malformed contrib extension name  |
| `pglite_missing`        | the PGlite target is used without `@electric-sql/pglite`, or a contrib extension is unknown                                                                         |
| `migrations_invalid`    | the directory is missing or empty, or two Flyway migrations share a version                                                                                         |
| `migration_failed`      | a migration fails during replay                                                                                                                                     |
| `connection_failed`     | connecting to the server, or creating or dropping the throwaway database, fails; the message gives the reason, never the URL                                        |
| `unsupported_server`    | the server is older than PostgreSQL 14                                                                                                                              |
| `schema_usage`          | the role `drift` connects as lacks `USAGE` on a configured schema                                                                                                   |
| `unsafe_name`           | an object to be written as a key is named `__proto__`                                                                                                               |
| `duplicate_key`         | two objects map to the same key, such as a table `"a.b"` and table `b` of schema `a`                                                                                |
| `public_table_unknown`  | `out.public.tables` names a table the catalog does not hold                                                                                                         |
| `name_collision`        | two objects get the same name in the Kysely types, such as tables `a_b` and `"a.b"`                                                                                 |
| `camel_case_mismatch`   | with `camelCase`, names `CamelCasePlugin` would not turn back into themselves; all are listed                                                                       |
| `catalog_unreadable`    | `drift` cannot read the committed catalog, or `parseCatalogModule` was given a file that is not a catalog module                                                    |
| `catalog_format`        | `parseCatalogModule` was given a catalog written in another format                                                                                                  |
| `resource_core_missing` | `rules --check` or `surface` cannot load `@nizam-os/resource-core`                                                                                                  |
| `registry_invalid`      | `resources.registry` returned anything but a list of declared resources, or the declarations or storage codecs are refused, such as a codec without a storage codec |
| `surface_unreadable`    | `surface --check` found a surface file that is not JSON, or not a surface this version reads                                                                        |

## Best practices

- **Commit the generated files, and exclude them from formatters and linters.** Their bytes are what
  `extract --check` compares; a formatter that rewrites their quotes makes every check fail, a
  linter flags the empty interface that names the catalog, and the next `pg-catalog surface`
  rewrites a surface file a formatter reflowed, line by line.
- **Name the interfaces after the application.** `interface: 'ContactsCatalog'` says which catalog a
  compile error is about, which matters once a repository holds more than one.
- **Run the checks in CI.** `pg-catalog extract --check` writes nothing and exits 1 when a migration
  changed and the files were not extracted again, `pg-catalog rules --check` exits 1 when a schema
  and the database disagree, and `pg-catalog surface --check` exits 1 when a migration or a
  declaration breaks a client. All run against PGlite or no database, with no secrets.
- **Record the surface in the pull request that changes it.** When `surface --check` lists changes,
  run `pg-catalog surface` and commit the file with the migration or declaration that made them: the
  diff shows reviewers every renamed field, new requirement, and withdrawn operator, safe changes
  included, so the file stays the surface clients see. A renamed column shows up as a removal and an
  addition; keep the old name with `as` while clients use it.
- **Load the registry lazily.** Import the declarations inside `resources.registry`, as in
  `async () => (await import('./src/resources/index.ts')).resources`: then only `rules --check` and
  `surface` load them, Zod, and what they import, and `extract` and `drift` stay fast.
- **Write codec fixtures as the database gives them back.** A codec's fixture is a round-trip value:
  write instants in UTC (`2026-03-02T08:00:00Z`, not `09:00:00+01:00`), numbers at the precision the
  column keeps, and a vector with the dimensions its column declares.
- **Write storage codecs over PostgreSQL's text.** The check writes literals and reads `::text`, so
  a storage codec in `resources.storage` handles `{a,b}`, `\x0102`, and `2026-03-02 08:00:00+00`,
  whatever your driver parses them into.
- **Give validators values of their column.** A `reject` fixture the column's type refuses, such as
  `'x'` for an `integer`, says nothing of the CHECK, so it is reported; a fixture with no text form,
  such as a symbol, is reported as unwritable, never sent.
- **Treat a warning as a review question.** A public table that no declaration reads ships its
  structure to browsers without an API to serve it: declare it, or drop it from `public.tables`.
- **Keep URLs and passwords out of the configuration file.** Write `url: () => process.env['X']`:
  the function runs only in the command that needs it, so extraction and the check need no secrets,
  and the file can be committed.
- **Parse `--json`, not the text.** The `CatalogDiff` is the stable format; the text of `drift` may
  change between minor versions.
- **Name every constraint.** `constraint contacts_name_length check (...)` gives the catalog and its
  diffs a stable key; generated names change when a column is renamed.
- **One rule per CHECK.** `check (char_length(slug) <= 63)` and `check (slug ~ '^[a-z0-9-]+$')`
  become two rules, each under its own name; one CHECK joining them with `and` becomes none.
- **Write sets with `in` and ranges with `between` or two comparisons.** Both become rules;
  `not in`, `<> all (...)`, and functions such as `btrim(name) <> ''` or `lower(code) = code` do
  not, so validate those in the application.
- **Keep patterns in the shared subset.** Write `[0-9]` rather than `\d`, and `[A-Za-z0-9_]` rather
  than `\w`; `\b`, lookahead, `(?i)`, POSIX classes such as `[[:alpha:]]`, and `~*` leave the rule
  `null`. A literal `-` goes first or last in a bracket, as in `^[a-z0-9-]+$`.
- **Validate case-insensitive columns yourself.** A `citext` column, or one under a nondeterministic
  collation, compares in ways no rule describes, so its CHECKs stay `null`.
- **Use `now()`, never `'now'`.** A `'now'` default becomes a constant when the migration runs, so
  every replay writes a different catalog.
- **Create roles idempotently.** Roles belong to the server, so a throwaway database on a shared
  server sees the roles of every earlier replay:
  `do $$ begin create role app_user nologin; exception when duplicate_object then null; end $$;`
- **Keep each file replayable as one transaction.** psql meta-commands and `COPY ... FROM stdin`
  cannot run, and `CREATE INDEX CONCURRENTLY` must be alone in its file.
- **Review the public catalog's diff.** Adding a table to `public.tables` shows its structure to
  every browser; the diff of `public-catalog.ts` is where reviewers see it.
- **Mirror the parsers you register.** Every parser your application registers needs the same
  override. With node-postgres an array type has a parser of its own: registering one for `int8`
  leaves `int8[]` as strings.
- **Write JSON as text with node-postgres.** Pass `JSON.stringify(value)` for `json` and `jsonb`.
  node-postgres sends an object as JSON, but an array as a PostgreSQL array and a string as raw
  text, so the types take only text. PGlite sends any value with `JSON.stringify`, so its types take
  values too.
- **Refresh PGlite's array types after migrating.** Call `refreshArrayTypes()` once the migrations
  that create enums, domains, or composite types used in arrays have run; until then PGlite returns
  those arrays as text and refuses JavaScript arrays for them.
- **Name JSON shapes with domains.** `create domain settings as jsonb` with the override
  `settings: 'Settings'` types those columns and leaves every other `jsonb` column alone. Since
  node-postgres sends an object as JSON, a `Settings` object can be written as it is.
- **Mind `numeric[]`.** node-postgres returns `numeric` as a string but `numeric[]` as floats, which
  round. When the digits matter, register a parser for its OID (1231) and override `numeric[]`.
  PGlite returns both as strings.
- **Keep nulls and nesting out of arrays.** The types say `Array<string>`, but any `text[]` stores
  `{a,NULL}` and `{{a},{b}}`; `check (array_position(tags, null) is null)` refuses both.
- **Keep infinite dates out.** node-postgres returns `infinity` dates and timestamps as the number
  `Infinity`, and PGlite as a `Date` whose time is `NaN`. Refuse them with
  `check (isfinite(starts_at))`, or override the type to admit `number`.
- **Put NOT NULL on the column, not the domain.** It is PostgreSQL's own advice: a nullable column
  of a NOT NULL domain can still read as null, so its select type keeps `| null`.
- **Read every schema your tables use.** A domain from a schema outside `schemas` types its columns
  as `unknown`.
- **Compare production with the catalog of the release it runs.** Run `drift` from the deployed
  commit, so a migration that is merged but not yet deployed does not show up as drift.
- **Give drift a role of its own.** `CONNECT` and `USAGE` on the configured schemas are all it
  needs; it never requires the application's role or one that can write.
- **Keep JSON keys as written under CamelCasePlugin.** The plugin also camelCases the keys of
  objects inside the `json` and `jsonb` values it reads, while values you write keep their keys.
  Pass `new CamelCasePlugin({ maintainNestedObjectKeys: true })` so JSON reads back as it was
  written, which a JSON shape override relies on.

## License

MIT
