# @nizam-os/keyset-core: design

This document describes what @nizam-os/keyset-core and its two adapters, @nizam-os/kysely-keyset and
@nizam-os/drizzle-keyset, are, the API they expose, and how they are built.

Architecture decisions referenced as ADR-NNNN live in `docs/keyset/adr/`. The normative,
clause-by-clause specification that implementers work from is `docs/keyset/SPEC.md`; this document
explains the intent behind it. When the two disagree, fix one in the same PR.

## 1. Purpose

@nizam-os/keyset-core is the pagination layer between an API and a PostgreSQL database: a
database-free core (`@nizam-os/keyset-core`) and two adapters that re-export it and add the SQL,
`@nizam-os/kysely-keyset` for Kysely (ADR-0004) and `@nizam-os/drizzle-keyset` for Drizzle
(ADR-0017). They give an application:

1. one definition per collection, from which the request type, the validation, the seek predicate,
   the cursors, and the SQL all derive, so a client cannot sort, filter, or search on anything the
   definition did not declare, and a cursor cannot mean something other than what it was issued for;
2. keyset pagination that is correct in the cases offset pagination and naive cursors get wrong:
   equal sort values, `NULL`s in sort columns, backward pages, microsecond timestamps, sorts over
   aggregates of related rows;
3. cursors a client can hold but not forge, reuse under another request, or keep forever: signed
   with HMAC-SHA256, bound to the sort, filter, and search, versioned, with optional expiry and
   secret rotation (ADR-0006);
4. the page semantics of the JSON:API
   [Cursor Pagination profile](https://jsonapi.org/profiles/ethanresnick/cursor-pagination/):
   `page[size]`, `page[after]`, `page[before]`, `prev` and `next` that are `null` when there is no
   page, range requests with `rangeTruncated`, and errors a JSON:API layer maps to the profile's
   error objects.

It is a library for teams who paginate large tables and want the hard cases handled once.

### Who it is for

- Teams on Kysely and PostgreSQL who want `paginate(query, request)` to be the whole story.
- Teams on Drizzle and PostgreSQL who want the same from the schema they already declared:
  `paginate(db, request)`.
- Teams on another query builder, a raw driver, or a client who want the planning, the cursors, and
  the page semantics without the SQL: the core hands them a plan to render.
- Teams serving JSON:API who want the one published cursor profile, end to end:
  `@nizam-os/jsonapi-core` parses the query and builds the document, @nizam-os/keyset-core runs the
  page in between.

### Non-goals

- Parsing URLs or query strings. The request is data (`sort`, `filter`, `search`, `page`); an API
  layer builds it from whatever grammar it speaks.
- HTTP. No status codes, no error documents; the errors are typed classes an API layer maps
  (ADR-0010).
- Databases other than PostgreSQL (ADR-0009). The predicate vocabulary is PostgreSQL's; another
  database is another adapter and an ADR.
- Offset pagination, `last` links, or page numbers.
- Encrypting cursors. They are signed, so they cannot be forged or altered; what they contain (the
  sort-key values of one row) is readable.
- Supporting CommonJS-only consumers or Node older than 22.12 (ADR-0003).

## 2. Principles

1. **The definition is the single source.** `defineKeyset` validates it once, at startup, with a
   `TypeError` naming the option (ADR-0011). The planner, the cursor codec, and the adapter read
   from it; nothing is declared twice.
2. **Spec-driven.** The profile fixes the page semantics; PostgreSQL's documentation fixes ordering,
   pattern matching, arrays, and text search; RFCs fix HMAC, base64url, and canonical JSON. Each
   behavior is a cited clause, and the test names the rule. Where a choice is the library's, it is
   an ADR (ADR-0005 to ADR-0009, ADR-0012 to ADR-0016).
3. **Every identifier from the definition, every value a parameter.** No request data reaches SQL
   except as a bound parameter. The one literal, the text search configuration, is validated against
   `regconfig`'s name syntax at definition time.
4. **A cursor is a signed claim, checked before it is read.** Verify, then parse; then version,
   expiry, context. A cursor issued for one sort, filter, or search is rejected under another, so
   the values in it can never be compared against columns they were not read from; with a caller
   context, one issued inside one tenant is rejected inside another (ADR-0015).
5. **The order is total.** The key is appended to every sort, `NULL`s have a fixed place, and the
   seek predicate is built so that walking forward and backward visits the same rows in the same
   order (ADR-0008). The e2e suite proves it over sorts with ties and nulls on three databases.
6. **A page costs one page.** The seek leads with a range on the first key and the order matches a
   plain index, so an index on the sort starts its scan at the cursor whatever the page's depth
   (ADR-0016). Inside a tie of the first key, or after a value of a nullable one, the seek runs as
   one select per branch under `union all`, each bounded by the index, so those pages cost a page
   per branch (ADR-0020). Server-only e2e tests read the plans to prove it.
7. **Report, never drop.** An unknown sort field, an operator the field does not accept, a bad
   value, a malformed filter node, a cursor from another request: each is a typed error with the
   detail in a field. Nothing is ignored.
8. **Nothing about the data reaches a message.** Error messages are constant; the request's values
   go in structured fields the API layer decides what to do with.
9. **Web standards only. No ambient environment.** Web Crypto, `btoa`, `TextEncoder`; nothing reads
   `process` (ADR-0002). The same code runs on Node, Bun, Deno, and workerd.
10. **Client input is hostile.** Field, relation, and operator names are looked up in `ReadonlyMap`s
    or after a prototype-key check; never in a plain object by the request's key.
11. **Every non-obvious decision cites its source** with `@ref` in code and an ADR in docs.

## 3. The API by example

The examples use `@nizam-os/kysely-keyset`. `createDefineKeyset`, `paginate`, and the render
functions are the adapter's; everything else is `@nizam-os/keyset-core`'s, and the core README shows
the same flow without Kysely. 3.7 shows the Drizzle adapter.

### 3.1 Minimal

```ts
export const defineKeyset = createDefineKeyset<DB>({ cursor: { secret: env.CURSOR_SECRET } });

export const contacts = defineKeyset({
  table: 'contacts',
  key: ['id'],
  fields: {
    id: { column: 'id', type: 'uuid' },
    name: { column: 'name', type: 'text' },
    createdAt: { column: 'created_at', type: 'timestamptz' },
  },
});

const page = await contacts.paginate(db.selectFrom('contacts').selectAll(), {
  sort: ['-createdAt'],
  page: { size: 25, after: query.page.after },
});
```

One definer per application holds what its keysets share, here the cursor secret; one definition per
collection; one call per page. `page.rows` is the selection as Kysely typed it; `page.next` and
`page.prev` are the cursors for the neighbouring pages or `null`; `page.cursor(row)` is the cursor
that falls on a row.

### 3.2 The definition

```ts
const contacts = defineKeyset({
  table: 'contacts',
  key: ['id'],
  fields: {
    id: { column: 'id', type: 'uuid' },
    lastName: { column: 'last_name', type: 'text', collation: 'insensitive', nullable: true },
    age: { column: 'age', type: 'integer', nullable: true },
    status: { column: 'status', type: 'enum', values: ['lead', 'customer'] },
    tags: { column: 'tags', type: 'array', of: 'text' },
    createdAt: { column: 'created_at', type: 'timestamptz' },
    bio: { column: 'bio', type: 'text', sortable: false, operators: ['contains', 'containsi'] },
    emailCount: { aggregate: { relation: 'emails', fn: 'count' }, type: 'bigint' },
    latestStart: {
      aggregate: { relation: 'workHistory', fn: 'max', column: 'start_date' },
      type: 'date',
    },
  },
  relations: {
    emails: {
      table: 'contact_emails',
      on: { contact_id: 'id' },
      fields: { email: { column: 'email', type: 'text' } },
    },
    workHistory: { table: 'work_history', on: { contact_id: 'id' } },
  },
  search: { vector: 'search_vector', config: 'english' },
  sort: { default: ['-createdAt'] },
  page: { default: 20, max: 100, range: true },
  cursor: { secret: env.CURSOR_SECRET, previousSecrets: [env.PREVIOUS_CURSOR_SECRET], ttl: 86_400 },
});
```

Field names are the request's vocabulary; columns are the database's. A field's type fixes which
operators it accepts and how values are checked (SPEC 4.2, 4.3); `sortable: false` keeps it out of
`sort`; `operators` narrows further. Aggregates are values computed over a relation's rows and sort
and filter like any other field. Relations declare their own fields, reachable as `emails.email` in
a condition or inside `{ relation: 'emails', some: ... }`. The literal types flow into the result:
`sort` accepts only sortable field names, `filter` only declared fields and relation paths, and with
`createDefineKeyset<DB>()` every table and column name is checked against the Kysely interface.

What most keysets share belongs in the definer rather than in each definition:
`createDefineKeyset<DB>({ cursor, page, search: { config } })` merges those options under every
definition it creates, option by option, so `cursor: { ttl: 3600 }` in one definition keeps the
shared secret, and a full-text search that names no configuration takes the shared one (ADR-0014,
SPEC 3.6). The merged definition is validated as if it had spelled the defaults out.

### 3.3 The request

```ts
const request: KeysetRequestOf<typeof contacts> = {
  sort: ['-emailCount', 'lastName'],
  filter: {
    and: [
      { field: 'status', op: 'eq', value: 'customer' },
      { field: 'tags', op: 'overlaps', value: ['ops', 'sec'] },
      {
        or: [
          { field: 'age', op: 'gte', value: 30 },
          { field: 'age', op: 'isNull' },
        ],
      },
      { relation: 'emails', some: { field: 'email', op: 'endsWithi', value: '@EXAMPLE.COM' } },
    ],
  },
  search: 'lovelace -ada',
  page: { size: 50, after: cursor },
};
```

The filter is a tree, not a grammar (ADR-0005): an API layer builds it from its own syntax
(`@nizam-os/jsonapi-core`'s parsed conditions map one to one). Values arrive as JSON or as the
type's text form, because query strings carry text. Values the types do not accept are one
`InvalidFilterValueError` listing, for each such condition in request order, the field, the
operator, and what was expected (ADR-0019), so a client fixes them all in one round trip.

### 3.4 The plan

```ts
const plan = await contacts.plan(request);
// plan.keys    [{ alias: 'keyset0', valueAlias: 'keyset0v', field: 'emailCount', target: {...}, direction: 'desc', nulls: 'last' }, ...]
// plan.filter  the filter and the search as one predicate tree
// plan.seek    the cursor's branches, each a predicate tree; none on a first page
// plan.limit   51: one more than the page size
// plan.context the hash cursors are bound to
```

An adapter renders `plan.filter` and `plan.seek` (thirteen predicate kinds over three target kinds,
SPEC 6), selects each key cast to text under its alias, orders by the keys with the stated null
placement, and limits. A seek of one branch joins the `where`; two or more run as one select each,
joined with `union all` and ordered again by each key's value under its `valueAlias` (ADR-0020). The
planner validated everything: an adapter renders without re-checking.

What scopes the rows outside the request, such as the tenant in the query's `where`, scopes the
cursors through the second argument: `plan(request, { context: { tenant: org.id } })`, or the same
option on `paginate`. The context joins the hash, so a cursor resumes only inside the scope that
issued it; without a context the hash is what it always was (ADR-0015, SPEC 6.1).

### 3.5 The page

```ts
const page = await contacts.page(plan, rows, (row) => [row.keyset0, row.keyset1]);
```

`finishPage` takes the fetched rows (one more than the page size, to know whether a next page
exists), reverses a backward page back into request order, signs a cursor per row, and decides
`prev` and `next`. An empty page still links back to the cursors it came from, as the profile
requires. Each adapter's `paginate` does 3.4 and 3.5 in one call.

### 3.6 Errors to HTTP

```ts
try {
  return await contacts.paginate(query, request);
} catch (error) {
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
    case 'INVALID_FILTER_VALUE':
      throw jsonApiError(
        error.values.map(({ field, operator }) =>
          errorItem('INVALID_QUERY_PARAMETER', {
            detail: 'The value is not valid for its field.',
            source: { parameter: `filter[${field}][${operator}]` },
          }),
        ),
      );
    default:
      throw badRequest(error.code, error);
  }
}
```

Every request-time error is a `KeysetError` with a stable `code` and the detail in fields
(ADR-0010). The example maps them to `@nizam-os/jsonapi-core`'s profile errors, one error object per
refused sort field and per refused filter value; any API layer does the same with its own catalog. A
refused value's `path` leads to its condition in the tree, so a layer that built the tree from query
parameters names the parameter the client sent, as `@nizam-os/resource-core`'s `filterParameters`
does (ADR-0019); the example's `filter[<field>][<operator>]` is that grammar's canonical spelling.
The fields hold the request's text, which `unsupportedSortError` quotes only when it is a plain
token (jsonapi ADR 0016); a layer of its own does the same.

### 3.7 With Drizzle

```ts
import { createDefineKeyset } from '@nizam-os/drizzle-keyset';

import * as schema from './schema'; // your Drizzle tables

export const defineKeyset = createDefineKeyset(schema, { cursor: { secret: env.CURSOR_SECRET } });

export const contacts = defineKeyset({
  table: 'contacts',
  key: ['id'],
  fields: {
    id: { column: 'id', type: 'uuid' },
    name: { column: 'name', type: 'text' },
    createdAt: { column: 'createdAt', type: 'timestamptz' },
  },
});

const page = await contacts.paginate(db, request, {
  select: { id: schema.contacts.id, name: schema.contacts.name },
  where: eq(schema.contacts.organizationId, org.id),
  context: { organization: org.id },
});
```

The definer takes the schema object, so a definition names tables and columns as the application's
code does, by table key and column property, and Drizzle maps them to SQL, `casing` and `pgSchema`
tables included. Every name is checked against the schema in the types and again at startup, where a
nullable column declared otherwise is refused. A Drizzle select cannot be extended once built, so
`paginate` builds it: the caller hands over a selection and a condition, and the binding adds the
filter, the seek, the key selections, the order, and the limit (ADR-0017). The cursors are those of
the Kysely adapter, so a definition with the same field names accepts the cursors of either.

## 4. Architecture

### 4.1 Modules

```
@nizam-os/keyset-core (packages/keyset-core/src)
  internal     base64url, Web Crypto, prototype-safe objects, canonical JSON, LIKE escaping
  definition   defineKeyset: vocabularies, field and relation validation, the definition
  filter       the tree, the operator table, value checks, condition and tree normalization
  sort         sort resolution with the key appended; the sort signature
  plan         the plan types, the planner, the seek predicate and its branches
  page         page request resolution, page assembly
  cursor       the codec: sign, verify, rotate, expire, bind to context
  errors       the request-time error classes
@nizam-os/kysely-keyset (packages/kysely-keyset/src)
  define-keyset   createDefineKeyset<DB>(): names checked against DB, keysets with paginate
  paginate        the plan onto a select query: filter, total, seek, keys, order, limit
  page-query      the page statement: one select, or a union of the seek's branches
  render          targets and predicates as Kysely expressions
@nizam-os/drizzle-keyset (packages/drizzle-keyset/src)
  define-keyset   createDefineKeyset(schema): names checked against the schema, keysets with paginate
  check-names     every name of a definition resolved in the schema at startup
  paginate        the select it builds: selection, where, filter, total, seek, keys, order, limit
  page-query      the page statement: one select, or a union of the seek's branches
  render          targets and predicates as Drizzle sql
```

Imports form a DAG from `internal` outward. Nothing in `@nizam-os/keyset-core` imports a database
library; it has no dependencies. `@nizam-os/kysely-keyset` imports `@nizam-os/keyset-core` and
`kysely` and re-exports the core so applications see one package (ADR-0004);
`@nizam-os/drizzle-keyset` does the same with `drizzle-orm` (ADR-0017). `import/no-cycle` is
enforced.

### 4.2 Data flow for a page

```
request ──plan()──▶ resolveSort ▶ normalizeFilter ▶ search ▶ resolvePage ▶ context
                    decode cursors (verify, version, expiry, context) ▶ pageSeek ▶ keys
        ──paginate()──▶ where(filter) ▶ [count(*) as total] ▶ where(branch), per seek branch
                        ▶ select cast(key as text) as keysetN [, key as keysetNv]
                        ▶ order by keys [nulls last|first] ▶ limit size + 1
                        ▶ [union all the branches ▶ order by keysetNv ▶ limit size + 1]
                        ▶ execute ▶ split aliases from rows
        ──page()──▶ reverse a backward page ▶ sign a cursor per row ▶ prev, next, total, rangeTruncated
```

### 4.3 Null ordering and backward pages

PostgreSQL sorts `NULL` last on `ASC` and first on `DESC` by default; a seek over a nullable key
needs one fixed rule. Every nullable key is ordered `NULLS LAST` in the request's direction. A page
before a cursor runs the query inverted (`ASC` becomes `DESC`, `NULLS LAST` becomes `NULLS FIRST`),
so the rows closest to the cursor come first and `limit` cuts the right end; `finishPage` reverses
them back. A key that is not nullable gets no placement: PostgreSQL's default is then the order of
an index declared in the sort's directions, which an explicit placement would not match (ADR-0016).
The seek predicate is a disjunction of prefix-equality conjunctions whose last term knows what lies
beyond a value or a null in each direction; over several keys it leads with a range on the first key
that every row of the disjunction lies in, which PostgreSQL uses as the index condition that starts
the scan at the cursor (SPEC 6.2). The range bounds the first key only, so a page runs the disjuncts
as branches, each a conjunction an index bounds, the nulls after a value of a nullable key a branch
of their own (ADR-0020). The definition's `nullable` decides both, so `finishPage` refuses a null
sort value on a key declared not nullable. The e2e invariants walk eight sorts, with ties and nulls,
forward and backward on PGlite, node-postgres, and a PostgreSQL server, and check that each walk
visits every row once in the expected order.

### 4.4 Cursor values

Sort-key values travel as text: `paginate` selects `cast(<key> as text) as "keysetN"` beside the
caller's columns, the cursor stores that text, and the seek binds it as a parameter that PostgreSQL
casts back to the column's type (ADR-0007). A `timestamptz` keeps its microseconds, a `numeric` its
digits, and the caller's own columns keep whatever the driver parses them into. The text form of a
`timestamptz` carries the session's time zone, so the same instant produces different text under
different `TimeZone` settings; the comparison is exact either way, and an application that wants
identical cursors across sessions fixes the zone on its connections.

### 4.5 Types

Two type parameters ride on `Keyset`: the fields and the relations, as declared (`const` type
parameters keep the literals). From them derive the request type (`KeysetRequestOf`): sortable field
names, filterable field names and relation paths, and the relation filters. The adapter adds the
database: `createDefineKeyset<DB>(defaults?)` returns a definer whose `TypedKeysetInit` checks
`table`, every `column`, every relation `table` and `on` pair, aggregate columns, and search columns
against `DB`, and makes `cursor` optional when the defaults carry one; `paginate` is generic over
the caller's query, so `Page<TRow>` is the selection's row type. The Drizzle adapter reads the same
checks from the schema object's type, `createDefineKeyset(schema, defaults?)`, and types
`Page<TRow>` from the `select` it is handed, or the table's `$inferSelect` without one.

## 5. Decisions

| ADR  | Decision                                                                                                      |
| ---- | ------------------------------------------------------------------------------------------------------------- |
| 0001 | Record architecture decisions                                                                                 |
| 0002 | Web standards only; no ambient environment reads                                                              |
| 0003 | ESM only, TypeScript 7 `isolatedDeclarations`, erasable syntax                                                |
| 0004 | Two packages: the database-free core `@nizam-os/keyset-core` and the Kysely adapter `@nizam-os/kysely-keyset` |
| 0005 | The filter is a typed tree with a per-type operator table                                                     |
| 0006 | Cursors: HMAC-signed, versioned, bound to the request context, with expiry and rotation                       |
| 0007 | Sort-key values travel as text under private aliases                                                          |
| 0008 | The key is a mandatory tie-breaker; `NULLS LAST` forward, inverted on backward pages                          |
| 0009 | PostgreSQL first                                                                                              |
| 0010 | Typed error classes with constant messages; no @nizam-os/ban-core dependency                                  |
| 0011 | Definitions are validated at definition time, never at request time                                           |
| 0012 | Totals are an opt-in second query; the base query must be a plain selection                                   |
| 0013 | Page size bounds, defaults, and range requests                                                                |
| 0014 | Definer defaults are merged member by member                                                                  |
| 0015 | Cursors can be bound to a caller-supplied context                                                             |
| 0016 | The seek leads with a range on the first key; declared nullability shapes seek and order                      |
| 0017 | The Drizzle binding takes names from the schema object and builds the select itself                           |
| 0018 | The `kysely` peer range starts past Kysely's published advisories                                             |
| 0019 | The planner reports every refused filter value at once                                                        |
| 0020 | A seek of two or more branches runs as one select per branch, joined with `union all`                         |
