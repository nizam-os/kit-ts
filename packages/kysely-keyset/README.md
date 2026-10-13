# @nizam-os/kysely-keyset

Keyset pagination for [Kysely](https://kysely.dev) on PostgreSQL. Declare once what a collection can
sort, filter, and search on, checked against your `DB` interface; then `paginate` any select query
of that table and get a page with cursors that survive ties, nulls, backward walks, and microsecond
timestamps. The page semantics are those of the JSON:API
[Cursor Pagination profile](https://jsonapi.org/profiles/ethanresnick/cursor-pagination/); every
rule is a cited clause of the profile or the PostgreSQL manual, and every choice the profile leaves
open is written down in
[`docs/keyset/SPEC.md`](https://github.com/nizam-os/kit-ts/blob/main/docs/keyset/SPEC.md).

This is the Kysely adapter of
[`@nizam-os/keyset-core`](https://www.npmjs.com/package/@nizam-os/keyset-core), the database-free
core. Everything the core exports is re-exported here, so an application imports from one package;
what this package adds is `createDefineKeyset<DB>()`, `paginate`, and the two render functions that
turn the core's plan into Kysely expressions.

## Install

```bash
pnpm add @nizam-os/kysely-keyset kysely
```

`kysely >= 0.28.17` is the peer dependency, the first release past Kysely's published SQL injection
advisories. None of them reaches the queries the adapter builds, but the adapter runs on your copy
of Kysely: an affected one in your application is an unmet peer dependency. The adapter targets
PostgreSQL 14+ and PGlite through any Kysely PostgreSQL dialect (`PostgresDialect` over `pg`,
`PGliteDialect`, or your own). Node 22.12+, Bun, Deno, and Cloudflare Workers are supported. CI runs
the unit tests on Kysely 0.28.17 and 0.29, the end-to-end suite on PGlite, on node-postgres, and on
PostgreSQL 14 and 18 servers, and a smoke test on Bun, Deno, and workerd.

## Quick start

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
page.total; // the rows the filter and search select
page.cursor(row); // the cursor that falls on a row of this page
```

A typo in a table or column name is a type error; a request that sorts on an undeclared field,
filters with an operator the type does not accept, asks for more than `max` rows, or sends a cursor
issued under another sort is rejected before any query runs, with a typed error (see Errors).

### Define keysets against `DB`

`createDefineKeyset<DB>(defaults?)` returns the core's `defineKeyset` with the names checked at
compile time: `table` must be a table of `DB`, every `column` a column of it, every relation's
`table` a table of `DB` with `on` pairing its columns to the main table's, every aggregate `column`
a column of the relation's table, and the search `columns` or `vector` columns of the main table.
Call it once and define every keyset with the result. The runtime is the core's, unchanged: the same
validation, the same `TypeError` naming the option at startup, the same definition.

Column names are the interface's. Under a `CamelCasePlugin` the interface says `createdAt`, so the
definition says `column: 'createdAt'`, and the plugin maps the `"contacts"."created_at"` reference
the adapter emits exactly as it maps your own. The adapter's private aliases (`keyset0`, `keyset1`,
..., and `keyset0v`, `keyset1v`, ...) contain no underscore or capital, so the plugin leaves them
alone.

The core README covers what a definition can hold: field types and their operators, aggregates,
relations, search modes, the key, page bounds, and cursor options.

### Shared defaults

What most keysets of an application share goes into the definer once: the cursor options, the page
bounds, and the text-search configuration. Every definition the definer creates inherits them and
overrides them option by option.

```ts
export const defineKeyset = createDefineKeyset<DB>({
  cursor: { secret: env.CURSOR_SECRET, previousSecrets: [env.OLD_CURSOR_SECRET] },
  page: { default: 20, max: 100 },
  search: { config: 'english' },
});

export const auditEvents = defineKeyset({
  table: 'audit_events',
  key: ['id'],
  fields: {
    id: { column: 'id', type: 'uuid' },
    at: { column: 'at', type: 'timestamptz' },
  },
  sort: { default: ['-at'] },
  page: { max: 500 }, // page.default stays 20
  cursor: { ttl: 3600 }, // the shared secrets stay
});
```

- **`cursor` and `page` merge option by option.** A definition's `cursor: { ttl: 3600 }` keeps the
  shared secret; an option set to `undefined` removes the default (`cursor: { ttl: undefined }`).
- **`search.config` fills a full-text search that names none.** A `like` search has no
  configuration, and a definition without `search` stays without one.
- **The defaults are checked when `createDefineKeyset` runs**, with the rules and messages a
  definition gets. A definition that ends up without a secret throws
  `cursor.secret must be set by the definition or the defaults`; a default `page.default` above a
  definition's own `page.max` throws when that definition is created.
- **Types follow.** With a `cursor` default, `cursor` is optional in a definition; without one it
  stays required. Every name check against `DB` is unchanged.

### Paginate

`keyset.paginate(query, request, options?)` plans the request, renders the plan onto `query`, runs
it, and assembles the page. `query` is any Kysely select of the definition's table:

- its **selection** is yours and comes back as `page.rows`, typed as Kysely typed it; the adapter
  adds the sort keys cast to text under private aliases and strips them again;
- its **`where`** clauses are kept and combined with the filter, so a tenant scope or a soft-delete
  predicate stays in your hands;
- its **`order by`, `limit`, and `offset`** are replaced;
- it must be a **plain selection**: no `distinct`, `group by`, `having`, or set operations. Joins
  are fine when they keep one row per row of the main table; a join that multiplies rows breaks the
  one-row-per-key assumption cursors rely on, so aggregate what you need through an aggregate field
  or a correlated subquery in the selection instead;
- the **main table** is referenced as `table.column`, so the definition's `table` must be the name
  or alias the query exposes.

```ts
const page = await contacts.paginate(
  db
    .selectFrom('contacts')
    .where('tenant_id', '=', tenantId)
    .where('deleted_at', 'is', null)
    .select(['id', 'name', 'created_at'])
    .select((eb) =>
      eb
        .selectFrom('contact_emails')
        .select(eb.fn.countAll().as('n'))
        .whereRef('contact_emails.contact_id', '=', 'contacts.id')
        .as('email_count'),
    ),
  request,
);
```

When the query is scoped by something outside the request, such as the tenant, pass the same values
as `context` so the cursors are bound to that scope too:

```ts
const page = await contacts.paginate(
  db.selectFrom('contacts').where('org_id', '=', org.id).select(['id', 'name']),
  request,
  { context: { org: org.id } },
);
```

A cursor issued for one organization is then rejected for another with `InvalidCursorError` (reason
`context`) before any query runs, even when the sort, filter, and search are the same. `context`
takes named strings, numbers, bigints, booleans, or `null`; it binds cursors and nothing else, so
the `where` clause still scopes the rows.

`paginate(keyset, query, request, options?)` is also exported as a function, for keysets defined
with the core's `defineKeyset` (untyped column names).

### The SQL

A first page, default sort, `select(['id', 'name'])`:

```sql
select "id", "name",
  cast("contacts"."created_at" as text) as "keyset0",
  cast("contacts"."id" as text) as "keyset1"
from "contacts"
order by "contacts"."created_at" desc, "contacts"."id" asc
limit $1   -- [21]
```

One more row than the page size is fetched to learn whether a next page exists. The key is appended
to every sort, so the order is total. A nullable key gets an explicit `nulls last`; a key that is
not nullable gets no placement, so the order is the one a plain index has (see Best practices).

The next page, through the cursor of the last row (the quick start's request with its filter and
search), captured on Kysely 0.29.6 over PGlite. Each select of the union repeats the selection and
the filter, shortened here to `...`:

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

The seek has a branch per key: the rows past the cursor's `created_at`, and the rows at its
`created_at` past its `id`. Each branch runs as its own select, a conjunction from which PostgreSQL
starts an index scan at the cursor, even inside a tie of `created_at`; a disjunction of the two
would only be filtered. After a value of a nullable first key, its nulls are a branch of their own.
The union keeps no order, so it is ordered again by each key's value, selected uncast under
`keyset0v`, `keyset1v`, ..., and limited again: a page reads at most one page and a row per branch.
Kysely does not parenthesize the query a union starts from, so the union starts from your query
where `false` holds, which reads no row. A seek of one branch, such as the page after a null of a
nullable first key, is added to your query's `where` without a union.

The cursor's values are bound as text parameters that PostgreSQL casts back to the columns' types,
so a `timestamptz` keeps its microseconds and a `numeric` its digits. Every request value is a
parameter; the only literal is the text search configuration, validated at definition time.

The page before a cursor runs inverted so that `limit` keeps the rows nearest the cursor, and the
rows are reversed back into request order:

```sql
... where ("contacts"."created_at" >= $1
  and ("contacts"."created_at" > $2
    or ("contacts"."created_at" = $3 and "contacts"."id" < $4)))
order by "contacts"."created_at" asc, "contacts"."id" desc
limit $5
```

An insensitive sort, an aggregate sort, and an `isNull` filter:

```sql
select "id", "name",
  cast(lower("contacts"."name") as text) as "keyset0",
  cast((select count(*) as "value" from "contact_emails"
        where "contact_emails"."contact_id" = "contacts"."id") as text) as "keyset1",
  cast("contacts"."id" as text) as "keyset2"
from "contacts"
where "contacts"."age" is not null
order by lower("contacts"."name") asc,
  (select count(*) as "value" from "contact_emails"
   where "contact_emails"."contact_id" = "contacts"."id") desc,
  "contacts"."id" asc
limit $1
```

Relation filters are `exists` over the relation's table correlated on every join pair; array
operators bind the list as one parameter (`"contacts"."tags" && $1`); patterns bind the escaped
pattern (`"contacts"."name" ilike $1` with `%ada%`).

### Totals and query events

`total: true` runs a second statement first, `select count(*) as "total"` over the filtered query
with the selection, ordering, limit, and offset cleared. It counts what the filter and the search
select, never the cursors, so it is the size of the whole collection the client is paging through.
The two statements are not in a transaction; under concurrent writes the total may differ from what
the pages add up to.

`onQuery` is called after each statement with its kind (`page` or `total`), SQL, parameters,
duration in milliseconds, and row count:

```ts
const page = await contacts.paginate(query, request, {
  total: true,
  onQuery: (event) =>
    log.debug({ kind: event.kind, ms: event.durationMs, rows: event.rowCount }, event.sql),
});
```

### Errors

`plan` and `paginate` reject a bad request before any query runs, with one of the core's
`KeysetError` classes: a stable `code`, the detail in fields, a constant message. A JSON:API layer
on [`@nizam-os/jsonapi-core`](https://github.com/nizam-os/kit-ts) maps them to the profile's error
objects:

```ts
import {
  invalidCursor,
  jsonApiError,
  maxPageSizeExceededError,
  rangePaginationNotSupportedError,
  unsupportedSortError,
} from '@nizam-os/jsonapi-core';
import { isKeysetError } from '@nizam-os/kysely-keyset';

function toJsonApi(error: unknown): never {
  if (!isKeysetError(error)) throw error;
  switch (error.code) {
    case 'UNSUPPORTED_SORT':
      throw jsonApiError(error.fields.map((field) => unsupportedSortError(field)));
    case 'PAGE_SIZE_EXCEEDED':
      throw jsonApiError(maxPageSizeExceededError(error.requested, error.max));
    case 'RANGE_NOT_SUPPORTED':
      throw jsonApiError(rangePaginationNotSupportedError());
    case 'INVALID_CURSOR':
      throw invalidCursor(`page[${error.parameter}]`);
    default:
      throw jsonApiError('INVALID_QUERY_PARAMETER', {
        detail: error.message,
        source: { parameter: 'filter' },
      });
  }
}
```

`error.fields` are the sort items as the client sent them; `unsupportedSortError` quotes one only
when it is a plain token and otherwise writes `A sort field is not supported by this endpoint`
([jsonapi ADR 0016](https://github.com/nizam-os/kit-ts/blob/main/docs/jsonapi/adr/0016-details-quote-request-text-as-plain-tokens.md)),
so they pass through as they came. The `default` branch's `error.message` is constant.

With `@nizam-os/jsonapi-core`, the parsed query's `page` is the request's `page`, and the page is
the document's input:
`paginatedDocument(Contacts, { rows: page.rows, next: page.next, prev: page.prev, total: page.total, cursor: (row) => page.cursor(row) }, { url, query })`.
Keep both definitions' page bounds equal, since each applies its own default and max.

### Best practices

- **One definer, one module.** Export `createDefineKeyset<DB>(defaults)` once, with the cursor
  secret and whatever page bounds and search configuration your keysets share, and define every
  keyset with it. A rotation or a new page bound is then one edit, and no keyset is left behind. A
  keyset defined with the core's untyped `defineKeyset` by mistake loses the name checks.
- **The secret is 32 random bytes from your secret manager**, never typed, never reused for another
  signing purpose, one per environment. Rotate with `previousSecrets` in the definer's defaults, so
  every keyset rotates together: add the current secret there, set the new one, deploy, and drop the
  old one after your longest cursor lifetime. Set `ttl` when cursors leave your control (emailed
  links, saved searches). A cursor is signed, not encrypted: anyone holding it can read the sort-key
  values of the row it points at, so do not offer a sort over a column the client must not learn.
- **Bind cursors to the tenant.** In a multi-tenant API, pass the scope your query applies as
  `context` on every page (`{ context: { org: org.id } }`). Without it, two tenants sending the same
  request share cursors, so a cursor from one tenant is accepted by the other and seeks with the
  first tenant's values. Pass it from one place, such as the module that builds the scoped query, so
  no endpoint forgets it; an endpoint that does issues cursors the others reject.
- **Declare `nullable` truthfully.** It decides where nulls can be: a field that is not nullable
  gets no null branch in the seek and no null placement in the order, and a page that meets a null
  in it throws a `TypeError` instead of skipping the row. The typed definer requires
  `nullable: true` for a column whose type includes `null`; make the column `NOT NULL` where the
  data allows rather than declaring a nullable one as not nullable.
- **Index for the sorts you offer.** Every page is an index range scan that starts at its cursor,
  however deep, when an index holds the sort columns in the sort's directions followed by the key:
  `create index on contacts (created_at desc, id)` for `-createdAt`, whose appended key ascends.
  `(created_at, id)` serves it too, read backward with an incremental sort of each tie (PostgreSQL
  13 and later), and serves `createdAt` forward. A nullable column sorted descending needs the
  query's placement in the index: `(age desc nulls last, id)`. In a multi-tenant table the scope
  column leads: `(organization_id, created_at desc, id)`. Each branch of the seek is a range of that
  index, so a first key with many equal values (a status, a bulk-loaded timestamp) or a nullable
  first key costs a page per branch, not the entries before the cursor; a sort has at most a branch
  per key and one more per nullable key, so short sorts over `NOT NULL` columns read least. An
  insensitive field sorts and compares through `lower()`, so index the expression:
  `create index on contacts (lower(name), id)`. An aggregate sort computes a correlated subquery per
  candidate row; keep it for small relations, or maintain the value in a column (a trigger or a
  generated column where PostgreSQL allows it) and declare that column as a plain field.
- **Prefer a stored `tsvector` for search.** `search: { columns }` computes `to_tsvector` per row at
  query time; a generated column with a GIN index answers the same query from the index:

  ```sql
  alter table contacts add column search_vector tsvector
    generated always as (to_tsvector('simple', coalesce(name, '') || ' ' || coalesce(bio, ''))) stored;
  create index on contacts using gin (search_vector);
  ```

  then `search: { vector: 'search_vector', config: 'simple' }` with the same configuration on both
  sides. `like` search (`ILIKE '%term%'`) cannot use a B-tree index; use it for small tables or
  behind a `pg_trgm` index.

- **Pin the session time zone.** The text form of a `timestamptz` carries the session's zone
  (`2024-01-09 10:00:00+00` here, `03:00:00-07` on a session in Los Angeles). Comparisons are exact
  either way, because the text is self-describing, but cursors issued under different zones differ
  as strings; set `TimeZone=UTC` on the pool (`options: '-c TimeZone=UTC'` in node-postgres, or
  `alter role ... set timezone = 'UTC'`) when that matters to you.
- **Count only when the client needs it.** `total: true` is a second statement that scans what the
  filter selects; offer it on request (JSON:API's `meta.page.total`), not on every page, and
  consider an estimate for very large tables.
- **Keep the base query plain** (see Paginate) and treat `keyset0`, `keyset1`, ... as reserved
  selection names.
- **Validate at startup.** `defineKeyset` throws for a mistaken definition; import your keysets
  module during application boot (or in a test) so a wrong column, an unsortable key, or a short
  secret fails there rather than on the first request.

## Documentation

- [`docs/keyset/DESIGN.md`](https://github.com/nizam-os/kit-ts/blob/main/docs/keyset/DESIGN.md):
  what the packages are, the principles, and the API by example
- [`docs/keyset/SPEC.md`](https://github.com/nizam-os/kit-ts/blob/main/docs/keyset/SPEC.md): the
  normative contract, section by section, with the tests that prove it
- [`docs/keyset/adr/`](https://github.com/nizam-os/kit-ts/tree/main/docs/keyset/adr): the decisions,
  including every choice the profile leaves to the server

## License

MIT
