# keyset: keyset pagination for PostgreSQL

Keyset pagination for PostgreSQL in TypeScript, as three packages:

| Package                                                    | What it is                                                                                                                                                                                                                                                                                                                                      |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`@nizam-os/keyset-core`](../../packages/keyset-core)       | The database-free core: a definition of what a collection can sort, filter, and search on; a planner that turns a request into a query plan; HMAC-signed cursors bound to the request; page assembly with `prev` and `next`. Functions over plain values, web standards only; runs on Node, Bun, Deno, and Cloudflare Workers. No dependencies. |
| [`@nizam-os/kysely-keyset`](../../packages/kysely-keyset)   | The [Kysely](https://kysely.dev) adapter: `createDefineKeyset<DB>()` checks every table and column name of a definition against your `DB` interface, and `paginate` renders the plan onto your own select query and runs it. Re-exports the core in full, so a Kysely application imports from one package.                                     |
| [`@nizam-os/drizzle-keyset`](../../packages/drizzle-keyset) | The [Drizzle](https://orm.drizzle.team) adapter: `createDefineKeyset(schema)` checks every table and column name of a definition against your Drizzle schema, in the types and at startup, and `paginate` builds the select over your table, with your selection and your condition, and runs it. Re-exports the core in full.                  |

Declare once what a collection can sort, filter, and search on; the request type, the validation,
the seek predicate, the cursors, and the SQL all follow from the definition. The page semantics are
those of the JSON:API
[Cursor Pagination profile](https://jsonapi.org/profiles/ethanresnick/cursor-pagination/)
(`page[size]`, `page[after]`, `page[before]`, `prev` and `next` that are `null` when there is no
page, range requests, `rangeTruncated`), and every choice the profile leaves open is written down in
[`docs/keyset/SPEC.md`](SPEC.md).

## Install

```bash
pnpm add @nizam-os/kysely-keyset kysely         # Kysely applications (pulls in @nizam-os/keyset-core)
pnpm add @nizam-os/drizzle-keyset drizzle-orm   # Drizzle applications (pulls in @nizam-os/keyset-core)
pnpm add @nizam-os/keyset-core                   # another query builder, a driver, a client
```

Node 22.12+, Bun, Deno, and Cloudflare Workers are supported. `@nizam-os/kysely-keyset` has
`kysely >= 0.28.17` as its peer dependency and `@nizam-os/drizzle-keyset` has
`drizzle-orm >=0.45.2 <1.0.0`, each floor the first release past its builder's published SQL
injection advisories; both target PostgreSQL 14+ (and PGlite). CI runs the unit suites on Node 22
and 24, the adapters' tests on Kysely 0.28.17 and drizzle-orm 0.45.2, the end-to-end suite through
both adapters on PGlite, on node-postgres, and on PostgreSQL 14 and 18 servers, and a smoke test of
the three packages on Bun, Deno, and workerd.

## Quick start with Kysely

```ts
import type { DB } from './db'; // your Kysely database interface

import { createDefineKeyset } from '@nizam-os/kysely-keyset';

// keysets/define.ts: one definer for the whole application, holding what every keyset shares.
export const defineKeyset = createDefineKeyset<DB>({
  cursor: { secret: env.CURSOR_SECRET }, // at least 32 bytes; see Best practices
  page: { default: 20, max: 100 },
});

export const contacts = defineKeyset({
  table: 'contacts',
  key: ['id'],
  fields: {
    id: { column: 'id', type: 'uuid' },
    name: { column: 'name', type: 'text', collation: 'insensitive' },
    age: { column: 'age', type: 'integer', nullable: true },
    status: { column: 'status', type: 'enum', values: ['lead', 'customer'] },
    createdAt: { column: 'created_at', type: 'timestamptz' },
    emailCount: { aggregate: { relation: 'emails', fn: 'count' }, type: 'bigint' },
  },
  relations: {
    emails: {
      table: 'contact_emails',
      on: { contact_id: 'id' },
      fields: { email: { column: 'email', type: 'text' } },
    },
  },
  search: { columns: ['name', 'bio'] },
  sort: { default: ['-createdAt'] },
});
```

```ts
const page = await contacts.paginate(
  db.selectFrom('contacts').select(['id', 'name', 'created_at']),
  {
    sort: ['-createdAt'],
    filter: {
      and: [
        { field: 'status', op: 'eq', value: 'customer' },
        { field: 'emails.email', op: 'endsWith', value: '@example.com' },
      ],
    },
    search: 'ada',
    page: { size: 25, after: query.page.after },
  },
  { total: true },
);

page.rows; // Array<{ id: string; name: string; created_at: Date }>: your selection, untouched
page.next; // the page[after] cursor of the next page, or null
page.prev; // the page[before] cursor of the previous page, or null
page.total; // the rows the filter and search select, when asked for
page.cursor(row); // the cursor that falls on a row of this page
```

The SQL it ran after a cursor, with the cursor's values bound as parameters. The seek has a branch
per key: the rows past the cursor's `created_at`, and the rows at its `created_at` past its `id`.
Each runs as its own select, which an index on the sort bounds at the cursor, and the union is
ordered again. Each select repeats the selection and the filter, shortened here to `...`:

```sql
select "id", "name", "created_at",
  cast("contacts"."created_at" as text) as "keyset0", "contacts"."created_at" as "keyset0v",
  cast("contacts"."id" as text) as "keyset1", "contacts"."id" as "keyset1v"
from "contacts"
where (("contacts"."status" = $1
    and exists (select 1 as "one" from "contact_emails"
                where "contact_emails"."contact_id" = "contacts"."id"
                  and "contact_emails"."email" like $2))
    and to_tsvector('simple', concat_ws(' ', "contacts"."name", "contacts"."bio"))
        @@ websearch_to_tsquery('simple', $3))
  and false
union all (select ... where ((...)) and "contacts"."created_at" < $7
  order by "contacts"."created_at" desc, "contacts"."id" asc limit $8)
union all (select ... where ((...)) and ("contacts"."created_at" = $12 and "contacts"."id" > $13)
  order by "contacts"."created_at" desc, "contacts"."id" asc limit $14)
order by "keyset0v" desc, "keyset1v" asc
limit $15
-- ["customer", "%@example.com", "ada", "customer", "%@example.com", "ada", "2024-01-09 10:00:00+00", 26,
--  "customer", "%@example.com", "ada", "2024-01-09 10:00:00+00", "2a1b…", 26, 26]
```

A request that sorts on `bio`, filters `age` with `contains`, asks for 500 rows, or sends a cursor
issued under another sort is rejected before any query runs, with a typed error that says what was
wrong.

## Quick start with Drizzle

```ts
import { createDefineKeyset } from '@nizam-os/drizzle-keyset';

import * as schema from './schema'; // your Drizzle tables

// keysets/define.ts: one definer for the whole application, over your schema.
export const defineKeyset = createDefineKeyset(schema, {
  cursor: { secret: env.CURSOR_SECRET },
  page: { default: 20, max: 100 },
});

export const contacts = defineKeyset({
  table: 'contacts',
  key: ['id'],
  fields: {
    id: { column: 'id', type: 'uuid' },
    name: { column: 'name', type: 'text', collation: 'insensitive' },
    createdAt: { column: 'createdAt', type: 'timestamptz' },
  },
});
```

```ts
import { eq } from 'drizzle-orm';

const page = await contacts.paginate(
  db, // your drizzle() database, or a transaction
  { sort: ['-createdAt'], page: { size: 25, after: query.page.after } },
  {
    select: { id: schema.contacts.id, name: schema.contacts.name },
    where: eq(schema.contacts.organizationId, org.id),
    context: { organization: org.id }, // cursors resume only inside this organization
  },
);

page.rows; // Array<{ id: string; name: string }>: your selection, typed by Drizzle
```

Names are your schema's: the table's key and the column's property, which Drizzle maps to SQL,
`casing` and `pgSchema` tables included. A definition with the same field names as a Kysely one
issues and accepts the same cursors.

## Quick start anywhere else

The core is the same library without the SQL: it plans, you render, it assembles the page.

```ts
import { defineKeyset } from '@nizam-os/keyset-core';

const contacts = defineKeyset({
  table: 'contacts',
  key: ['id'],
  fields: {
    id: { column: 'id', type: 'uuid' },
    createdAt: { column: 'created_at', type: 'timestamptz' },
  },
  cursor: { secret: env.CURSOR_SECRET },
});

const plan = await contacts.plan({ sort: ['-createdAt'], page: { size: 25, after } });
// plan.keys: [{ alias: 'keyset0', valueAlias: 'keyset0v', target: { kind: 'column', column: 'created_at', ... }, direction: 'desc', nulls: null, nullable: false }, ...]
// plan.filter: a predicate tree to render; plan.seek: the cursor's branches, a select each; plan.limit: 26

const rows = await runYourQuery(plan); // select ..., cast(created_at as text) as keyset0, cast(id as text) as keyset1
const page = await contacts.page(plan, rows, (row) => [row.keyset0, row.keyset1]);
```

The three quick starts answer with the same `Page`, and the cursors they issue are interchangeable.

## What you get

- **One definition per collection.** `defineKeyset` fixes the fields and their types, the relations,
  the aggregates, the search, the key, the default sort, the page bounds, and the cursor secret.
  Planning, cursors, and SQL all read from it; a mistake in it is a `TypeError` at startup. With
  `createDefineKeyset<DB>()`, every table and column name is checked against your Kysely interface;
  with `createDefineKeyset(schema)`, against your Drizzle schema, at compile time and again at
  startup.
- **Shared options in one place.** `createDefineKeyset(defaults)` holds the cursor secret, the page
  bounds, and the search configuration your keysets share, merged under every definition option by
  option, so a secret rotation is one edit.
- **Keyset pagination that survives the hard cases.** Equal sort values, `NULL`s in sort columns,
  backward pages, microsecond timestamps, and sorts over aggregates of related rows all walk forward
  and backward without skipping or repeating a row. The end-to-end suite proves it on PGlite,
  node-postgres, and PostgreSQL servers.
- **Cursors a client cannot forge or misuse.** Signed with HMAC-SHA256, bound to the sort, filter,
  and search they were issued for and, when you pass one, to a context such as the tenant;
  versioned, with optional expiry and secret rotation.
- **Typed requests, typed errors.** `sort` accepts only sortable fields, `filter` only declared
  fields and relation paths with the operators their types allow; values are checked by type; every
  problem is a `KeysetError` with a stable `code` and the detail in fields, never in the message.
- **Nothing reaches SQL that the definition did not declare.** Identifiers come from the definition,
  values are bound parameters, and the one literal (the text search configuration) is validated
  against PostgreSQL's name syntax.

The package READMEs walk through each area:
[`@nizam-os/keyset-core`](../../packages/keyset-core/README.md) for the definition, the request, the
plan, the page, the cursors, and the errors;
[`@nizam-os/kysely-keyset`](../../packages/kysely-keyset/README.md) for the typed definer and its
shared defaults, `paginate`, the SQL it renders, and the best practices for secrets, indexes,
totals, and `CamelCasePlugin`; [`@nizam-os/drizzle-keyset`](../../packages/drizzle-keyset/README.md)
for the definer over your schema, `paginate` and its options, and the best practices for scoping,
related data, and `casing`.

## Documentation

- [`docs/keyset/DESIGN.md`](DESIGN.md): what the packages are, the principles, and the API by
  example
- [`docs/keyset/SPEC.md`](SPEC.md): the normative contract, section by section, with the tests that
  prove it
- [`docs/keyset/adr/`](adr): the decisions, including every choice the profile leaves to the server
- [`CONTRIBUTING.md`](CONTRIBUTING.md): the family's contribution guide; setup, gates, and releases
  are in the root [`CONTRIBUTING.md`](../../CONTRIBUTING.md)

## Why

Offset pagination drifts under writes and gets slower with every page. Hand-written keyset
pagination is usually right on the happy path and wrong on ties, nulls, backward pages, and
precision, and its cursors are usually base64 of whatever the last row had, which a client can edit
or replay under another sort. @nizam-os/keyset-core takes the position that the definition is the
contract and the profile and the PostgreSQL manual are the test plan: every rule is cited where it
is implemented and pinned by a test, the adapters' tests assert the exact SQL, and the e2e suite
walks real tables with ties and nulls in both directions on three databases.

## License

MIT
