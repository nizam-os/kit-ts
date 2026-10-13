# @nizam-os/drizzle-keyset

Keyset pagination for [Drizzle ORM](https://orm.drizzle.team) on PostgreSQL. Declare once what a
collection can sort, filter, and search on, named as your Drizzle schema names its tables and
columns; then `paginate` that table and get a page with cursors that survive ties, nulls, backward
walks, and microsecond timestamps. The page semantics are those of the JSON:API
[Cursor Pagination profile](https://jsonapi.org/profiles/ethanresnick/cursor-pagination/); every
rule is a cited clause of the profile or the PostgreSQL manual, and every choice the profile leaves
open is written down in
[`docs/keyset/SPEC.md`](https://github.com/nizam-os/kit/blob/main/docs/keyset/SPEC.md).

This is the Drizzle adapter of
[`@nizam-os/keyset-core`](https://www.npmjs.com/package/@nizam-os/keyset-core), the database-free
core. Everything the core exports is re-exported here, so an application imports from one package;
what this package adds is `createDefineKeyset(schema)`, whose keysets carry `paginate`, and the two
render functions that turn the core's plan into Drizzle `sql`.

## Install

```bash
pnpm add @nizam-os/drizzle-keyset drizzle-orm
```

`drizzle-orm >=0.45.2 <1.0.0` is the peer dependency. 0.45.2 is the release that escapes quotes
inside identifiers (CVE-2026-39356), and 1.0 is still a release candidate. The adapter targets
PostgreSQL 14+ and PGlite through any Drizzle PostgreSQL driver. Node 22.12+, Bun, Deno, and
Cloudflare Workers are supported. CI runs the unit tests on 0.45.2 and on the current 0.45 release,
the end-to-end suite on PGlite, on node-postgres, and on PostgreSQL 14 and 18 servers, and a smoke
test on Bun, Deno, and workerd.

## Quick start

```ts
import { createDefineKeyset } from '@nizam-os/drizzle-keyset';

import * as schema from './schema'; // your Drizzle tables, the object you hand drizzle()

// keysets/define.ts: one definer for the whole application, holding what every keyset shares.
export const defineKeyset = createDefineKeyset(schema, {
  cursor: { secret: env.CURSOR_SECRET }, // at least 32 bytes; see Best practices
  page: { default: 20, max: 100 },
});

export const contactsKeyset = defineKeyset({
  table: 'contacts',
  key: ['id'],
  fields: {
    id: { column: 'id', type: 'uuid' },
    name: { column: 'name', type: 'text', collation: 'insensitive' },
    age: { column: 'age', type: 'integer', nullable: true },
    status: { column: 'status', type: 'enum', values: ['lead', 'customer'] },
    createdAt: { column: 'createdAt', type: 'timestamptz' },
    emailCount: { aggregate: { relation: 'emails', fn: 'count' }, type: 'bigint' },
  },
  relations: {
    emails: {
      table: 'contactEmails',
      on: { contactId: 'id' },
      fields: { email: { column: 'email', type: 'text' } },
    },
  },
  search: { columns: ['name', 'bio'] },
  sort: { default: ['-createdAt'] },
});
```

```ts
import { eq } from 'drizzle-orm';

import { contacts } from './schema';

const page = await contactsKeyset.paginate(
  db,
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
  {
    select: { id: contacts.id, name: contacts.name, createdAt: contacts.createdAt },
    where: eq(contacts.orgId, org.id),
    context: { org: org.id },
    total: true,
  },
);

page.rows; // Array<{ id: string; name: string; createdAt: Date }>: your selection, as Drizzle reads it
page.next; // the page[after] cursor of the next page, or null
page.prev; // the page[before] cursor of the previous page, or null
page.total; // the rows your where, the filter, and the search select
page.cursor(row); // the cursor that falls on a row of this page
```

A typo in a table or column name is a type error, and a `TypeError` at startup should a definition
get around the types; a request that sorts on an undeclared field, filters with an operator the type
does not accept, asks for more than `max` rows, or sends a cursor issued under another sort or
another `context` is rejected before any query runs, with a typed error (see Errors).

### Define keysets against your schema

`createDefineKeyset(schema, defaults?)` takes the schema object you hand `drizzle()`. A definition
names a table by its key in that object and a column by its property, as your code writes
`contacts.createdAt`; never by its SQL name. The types check every name: `table` must be a table of
the schema (not a relations object or an enum), every `column` a column of it, every relation's
`table` a table with `on` pairing its columns to the main table's, every aggregate `column` a column
of the relation's table, and the search `columns` or `vector` columns of the main table. A column
whose type includes `null` must be declared `nullable: true`.

At definition time the core's validation runs first, unchanged; then every name is resolved in the
schema object, and a name that does not resolve throws a `TypeError` naming the option:
`fields.createdAt.column: the schema table contacts has no column created_at`. The nullability is
checked again against the column: a field over a column without `.notNull()` (a primary key is not
null) must be `nullable: true`.

Since the names resolve to Drizzle's own table and column objects, Drizzle prints them: a column
declared without a name (`createdAt: timestamp()`) gets the database's `casing`, and a table of a
`pgSchema` prints as `"audit"."events"`, exactly as in your own queries.

The core README covers what a definition can hold: field types and their operators, aggregates,
relations, search modes, the key, page bounds, and cursor options.

### Shared defaults

What most keysets of an application share goes into the definer once: the cursor options, the page
bounds, and the text-search configuration. Every definition the definer creates inherits them and
overrides them option by option.

```ts
export const defineKeyset = createDefineKeyset(schema, {
  cursor: { secret: env.CURSOR_SECRET, previousSecrets: [env.OLD_CURSOR_SECRET] },
  page: { default: 20, max: 100 },
  search: { config: 'english' },
});

export const auditEventsKeyset = defineKeyset({
  table: 'auditEvents',
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
  `cursor.secret must be set by the definition or the defaults`.
- **Types follow.** With a `cursor` default, `cursor` is optional in a definition; without one it
  stays required. Every name check is unchanged.

### Paginate

`keyset.paginate(db, request, options?)` plans the request, builds the select over the definition's
table, runs it on `db`, and assembles the page. `db` is any Drizzle PostgreSQL database, of any
driver, or a transaction (`tx`), or a `withReplicas` database. The options:

- **`select`** is your selection, as `db.select(fields)` takes it, and comes back as `page.rows`,
  typed as Drizzle types it; without it the rows are the table's columns (`$inferSelect`). The
  adapter adds the sort keys cast to text under the aliases `keyset0`, `keyset1`, ..., and their
  values under `keyset0v`, `keyset1v`, ... when the seek has several branches, and strips them
  again, so a member of yours named like one throws a `TypeError`.
- **`where`** is your condition, such as a tenant scope or a soft-delete predicate. The adapter puts
  it in parentheses before it joins the filter and the cursor's seek with `and`, in each select a
  page runs, so a condition written as `sql` with an `or` keeps its meaning (Drizzle's `and()` does
  not parenthesize).
- **`context`** binds the page's cursors to values outside the request, such as the tenant of your
  `where` (see Best practices).
- **`total`** and **`onQuery`**: see Totals and query events.

The select reads the definition's table alone, one row per row, which the cursors rely on. Related
data comes in three ways: an aggregate field, for what clients sort or filter on; a correlated
subquery in `select`; or a second query for the page's ids
(`inArray(contactEmails.contactId, page.rows.map((row) => row.id))`). A correlated subquery needs
its condition one `sql` deeper:

```ts
import { and, eq, getTableColumns, isNull, sql } from 'drizzle-orm';

const page = await contactsKeyset.paginate(db, request, {
  select: {
    ...getTableColumns(contacts),
    emailCount: sql<number>`(select count(*) from ${contactEmails}
      where ${sql`${contactEmails.contactId} = ${contacts.id}`})`.mapWith(Number),
  },
  where: and(eq(contacts.orgId, org.id), isNull(contacts.deletedAt)),
  context: { org: org.id },
});
```

In a query over one table, Drizzle prints a column directly inside a selected `sql` without its
table. Written directly, the condition would print `"contact_id" = "id"`, and inside the subquery
`"id"` is `contact_emails.id`; one `sql` deeper both keep their tables,
`"contact_emails"."contact_id" = "contacts"."id"`. The adapter's own references are nested so.

### The SQL

The quick start's first page:

```sql
select "id", "name", "created_at",
  cast("contacts"."created_at" as text) as "keyset0",
  cast("contacts"."id" as text) as "keyset1"
from "contacts"
where ("contacts"."org_id" = $1)
  and ((("contacts"."status" = $2
      and exists (select 1 as "one" from "contact_emails"
                  where "contact_emails"."contact_id" = "contacts"."id"
                    and "contact_emails"."email" like $3))
    and to_tsvector('simple', concat_ws(' ', "contacts"."name", "contacts"."bio"))
        @@ websearch_to_tsquery('simple', $4)))
order by "contacts"."created_at" desc, "contacts"."id" asc
limit $5
```

One more row than the page size is fetched to learn whether a next page exists. The key is appended
to every sort, so the order is total. A nullable key gets an explicit `nulls last`; a key that is
not nullable gets no placement, so the order is the one a plain index has (see Best practices).

The next page, through the cursor of the last row, runs the seek's branches under `union all`
(captured on drizzle-orm 0.45.4 over PGlite). `(((...)))` is the filter and the search of the first
page, and the second select repeats the first one's selection:

```sql
(select "id", "name", "created_at",
   cast("contacts"."created_at" as text) as "keyset0", "contacts"."created_at" as "keyset0v",
   cast("contacts"."id" as text) as "keyset1", "contacts"."id" as "keyset1v"
 from "contacts"
 where ("contacts"."org_id" = $1) and (((...)))
   and ("contacts"."created_at" < $5)
 order by "contacts"."created_at" desc, "contacts"."id" asc
 limit $6)
union all
(select ... where ("contacts"."org_id" = $7) and (((...)))
   and (("contacts"."created_at" = $11 and "contacts"."id" > $12))
 order by "contacts"."created_at" desc, "contacts"."id" asc
 limit $13)
order by "keyset0v" desc, "keyset1v" asc
limit $14
-- [org.id, "customer", "%@example.com", "ada", "2024-01-09 10:00:00+00", 26,
--  org.id, "customer", "%@example.com", "ada", "2024-01-09 10:00:00+00", "2a1b…", 26, 26]
```

The seek has a branch per key: the rows past the cursor's `created_at`, and the rows at its
`created_at` past its `id`. Each branch runs as its own select, a conjunction from which PostgreSQL
starts an index scan at the cursor, even inside a tie of `created_at`; a disjunction of the two
would only be filtered. After a value of a nullable first key, its nulls are a branch of their own.
The union keeps no order, so it is ordered again by each key's value, selected uncast under
`keyset0v`, `keyset1v`, ..., and limited again: a page reads at most one page and a row per branch.
A seek of one branch, such as the page after a null of a nullable first key, joins the `where`
without a union.

The cursor's values are bound as text parameters that PostgreSQL casts back to the columns' types,
so a `timestamptz` keeps its microseconds and a `numeric` its digits. Every request value is a
parameter; the only literal is the text search configuration, validated at definition time.

The page before a cursor runs inverted so that `limit` keeps the rows nearest the cursor, and the
rows are reversed back into request order:

```sql
(select ... where ("contacts"."created_at" > $1)
 order by "contacts"."created_at" asc, "contacts"."id" desc limit $2)
union all
(select ... where (("contacts"."created_at" = $3 and "contacts"."id" < $4))
 order by "contacts"."created_at" asc, "contacts"."id" desc limit $5)
order by "keyset0v" asc, "keyset1v" desc
limit $6
```

An insensitive sort, an aggregate sort, and an `isNull` filter:

```sql
select "id", "name",
  cast(lower("contacts"."name") as text) as "keyset0",
  cast((select count(*) as "value" from "contact_emails"
        where "contact_emails"."contact_id" = "contacts"."id") as text) as "keyset1",
  cast("contacts"."id" as text) as "keyset2"
from "contacts"
where ("contacts"."age" is not null)
order by lower("contacts"."name") asc,
  (select count(*) as "value" from "contact_emails"
   where "contact_emails"."contact_id" = "contacts"."id") desc,
  "contacts"."id" asc
limit $1
```

### Totals and query events

`total: true` runs a second statement first, `select count(*) from "contacts"` with your `where`,
the filter, and the search, never the cursors, so it is the size of the whole collection the client
is paging through. The two statements read separate snapshots, so under concurrent writes the total
may differ from what the page shows; when that matters, run `paginate` on a transaction opened with
`{ isolationLevel: 'repeatable read' }`, whose statements read one snapshot.

`onQuery` is called after each statement with its kind (`page` or `total`), SQL, parameters,
duration in milliseconds, and row count:

```ts
const page = await contactsKeyset.paginate(db, request, {
  total: true,
  onQuery: (event) =>
    log.debug({ kind: event.kind, ms: event.durationMs, rows: event.rowCount }, event.sql),
});
```

### Errors

`plan` and `paginate` reject a bad request before any query runs, with one of the core's
`KeysetError` classes: a stable `code`, the detail in fields, a constant message. A JSON:API layer
on [`@nizam-os/jsonapi-core`](https://www.npmjs.com/package/@nizam-os/jsonapi-core) maps them to the
profile's error objects:

```ts
import { isKeysetError } from '@nizam-os/drizzle-keyset';
import {
  invalidCursor,
  jsonApiError,
  maxPageSizeExceededError,
  rangePaginationNotSupportedError,
  unsupportedSortError,
} from '@nizam-os/jsonapi-core';

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
when it is a plain token, so they pass through as they came. The `default` branch's `error.message`
is constant.

### Cursors across bindings

A cursor holds the sort keys' values as PostgreSQL prints them and a hash of the request; neither
names a table or a column. So a Drizzle keyset and a
[`@nizam-os/kysely-keyset`](https://www.npmjs.com/package/@nizam-os/kysely-keyset) keyset with the
same fields, sort, and secret read each other's cursors, and an API that moves from one binding to
the other keeps its clients' cursors.

### Rendering a plan yourself

`renderTarget(target, context)` and `renderPredicate(node, context)` return Drizzle `SQL` for the
targets and predicates of a plan the core made (`keyset.plan(request)`), with `context` naming the
schema object and the definition's table:
`renderPredicate(plan.filter, { schema, table: 'contacts' })`. `paginate` is built on them. A name
the schema does not hold is a `TypeError`; a plan made from a definition over the same schema never
has one.

### Best practices

- **One definer, one module.** Export `createDefineKeyset(schema, defaults)` once, over the schema
  object you hand `drizzle()`, with the cursor secret and whatever page bounds and search
  configuration your keysets share, and define every keyset with it. A rotation or a new page bound
  is then one edit, and no keyset is left behind.
- **The secret is 32 random bytes from your secret manager**, never typed, never reused for another
  signing purpose, one per environment. Rotate with `previousSecrets` in the definer's defaults, so
  every keyset rotates together: add the current secret there, set the new one, deploy, and drop the
  old one after your longest cursor lifetime. Set `ttl` when cursors leave your control (emailed
  links, saved searches). A cursor is signed, not encrypted: anyone holding it can read the sort-key
  values of the row it points at, so do not offer a sort over a column the client must not learn.
- **Scope with `where`, bind with `context`, from one place.** In a multi-tenant API every page
  needs both: `where` keeps other tenants' rows out, and `context` makes a cursor issued for one
  tenant fail for another, which it would otherwise accept and seek with the first tenant's values.
  Build them together so no endpoint passes one without the other:

  ```ts
  export function orgScope(org: Org): { where: SQL; context: { org: string } } {
    return { where: eq(contacts.orgId, org.id), context: { org: org.id } };
  }

  const page = await contactsKeyset.paginate(db, request, orgScope(org));
  ```

- **Declare `nullable` truthfully.** It decides where nulls can be: a field that is not nullable
  gets no null branch in the seek and no null placement in the order, and a page that meets a null
  in it throws a `TypeError` instead of skipping the row. The definer requires `nullable: true` for
  a column without `.notNull()`; make the column `NOT NULL` where the data allows.
- **Index for the sorts you offer.** Every page is an index range scan that starts at its cursor,
  however deep, when an index holds the sort columns in the sort's directions followed by the key:
  `index().on(t.createdAt.desc(), t.id)` for `-createdAt`, whose appended key ascends.
  `(created_at, id)` serves it too, read backward with an incremental sort of each tie (PostgreSQL
  13 and later). A nullable column sorted descending needs the query's placement in the index:
  `index().on(t.age.desc().nullsLast(), t.id)`. In a multi-tenant table the scope column leads:
  `index().on(t.orgId, t.createdAt.desc(), t.id)`. Each branch of the seek is a range of that index,
  so a first key with many equal values (a status, a bulk-loaded timestamp) or a nullable first key
  costs a page per branch, not the entries before the cursor; a sort has at most a branch per key
  and one more per nullable key, so short sorts over `NOT NULL` columns read least. An insensitive
  field sorts and compares through `lower()`, so index the expression. An aggregate sort computes a
  correlated subquery per candidate row; keep it for small relations, or maintain the value in a
  column and declare that column as a plain field.
- **Prefer a stored `tsvector` for search.** `search: { columns }` computes `to_tsvector` per row at
  query time; a generated column with a GIN index, declared as in Drizzle's
  [full-text search guide](https://orm.drizzle.team/docs/guides/full-text-search-with-generated-columns),
  answers the same query from the index: `search: { vector: 'searchVector', config: 'simple' }`,
  with the same configuration on both sides. `like` search (`ILIKE '%term%'`) cannot use a B-tree
  index; use it for small tables or behind a `pg_trgm` index.
- **Pin the session time zone.** The text form of a `timestamptz` carries the session's zone
  (`2024-01-09 10:00:00+00` here, `03:00:00-07` on a session in Los Angeles). Comparisons are exact
  either way, because the text is self-describing, but cursors issued under different zones differ
  as strings; set `TimeZone=UTC` on the connection (`options: '-c TimeZone=UTC'` in node-postgres)
  or the role when that matters to you.
- **Count only when the client needs it.** `total: true` is a second statement that scans what the
  filter selects; offer it on request (JSON:API's `meta.page.total`), not on every page.
- **Validate at startup.** The definer throws for a mistaken definition; import your keysets module
  during application boot (or in a test) so a wrong column, an unsortable key, or a short secret
  fails there rather than on the first request.

## Documentation

- [`docs/keyset/DESIGN.md`](https://github.com/nizam-os/kit/blob/main/docs/keyset/DESIGN.md): what
  the packages are, the principles, and the API by example
- [`docs/keyset/SPEC.md`](https://github.com/nizam-os/kit/blob/main/docs/keyset/SPEC.md): the
  normative contract, section by section, with the tests that prove it; section 14 is this adapter
- [`docs/keyset/adr/`](https://github.com/nizam-os/kit/tree/main/docs/keyset/adr): the decisions,
  ADR 0017 among them for this adapter

## License

MIT
