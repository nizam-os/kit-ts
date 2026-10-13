# @nizam-os/jsonapi-core: design

This document describes what @nizam-os/jsonapi-core, @nizam-os/hono-jsonapi, @nizam-os/jsonapi-client,
and @nizam-os/tanstack-query-jsonapi are, the API they expose, and how they are built.

Architecture decisions referenced as ADR-NNNN live in `docs/jsonapi/adr/`. The normative,
clause-by-clause specification that implementers work from is `docs/jsonapi/SPEC.md`; this document
explains the intent behind it. When the two disagree, fix one in the same PR.

## 1. Purpose

@nizam-os/jsonapi-core is the JSON:API layer for JavaScript servers: a framework-free core
(`@nizam-os/jsonapi-core`) and a Hono adapter (`@nizam-os/hono-jsonapi`) that re-exports it and adds
the framework glue (ADR-0013). They give an application:

1. one resource definition per type, from which field names, relationships, query capabilities,
   links, and validation all derive, so a response, a request check, and a query parser cannot
   disagree about what a resource is;
2. builders that produce documents the specification accepts: string ids, sparse fieldsets, full
   linkage in compound documents, pagination links that reproduce the client's query;
3. parsers that reject what the specification says to reject, with every problem reported at once
   and located by a JSON Pointer, a parameter name, or a header name;
4. the server side of content negotiation, the Cursor Pagination profile, and the Atomic Operations
   extension, each implemented from its text.

It is a library for teams who treat their JSON:API surface as a contract.

### Who it is for

- API teams on Hono, or on any runtime with a `fetch` handler, who want JSON:API 1.1 without
  re-reading the specification per endpoint.
- Teams whose clients are JSON:API clients (Ember Data, JSON:API resources, generated SDKs) and who
  have been burned by servers that are "mostly" JSON:API.
- Teams who paginate with keysets and want the one published cursor profile, with its links, meta,
  and error objects, rather than a house format.

### Non-goals

- Running queries. The package parses `sort`, `filter`, `page`, and `include` into a typed
  structure; the application turns that into SQL (or anything else). A keyset pagination engine for
  Kysely is a separate package.
- OpenAPI generation. Definitions carry enough to generate schemas, and a future subpath may; this
  line does not.
- A client for every JSON:API server. `@nizam-os/jsonapi-client` (section 3.6) calls servers whose
  resources are this family's definitions, and reads paths from their links; it is not a generic
  client for an arbitrary API (ADR-0017).
- Supporting CommonJS-only consumers or Node older than 22.12 (ADR-0004).

## 2. Principles

1. **The definition is the single source.** `defineResource` validates it once, at startup, with a
   `TypeError` naming the option (ADR-0012). Every parser and builder reads from it; nothing is
   declared twice.
2. **Spec-driven.** Each behavior is a cited clause, and the test names the clause. Where the
   specification leaves a choice to the server, the choice is an ADR (ADR-0007, ADR-0008, ADR-0009,
   ADR-0010, ADR-0014).
3. **Report everything, drop nothing.** A parser accumulates error objects and throws once. A
   parameter or member the endpoint does not know is a 400, never ignored.
4. **A document that would violate the specification never leaves the server.** Builders throw a
   `TypeError` for a non-string id, an undeclared relationship, an empty relationship object, or an
   included resource without full linkage.
5. **Nothing about the server reaches a client unless a builder put it there.** Unexpected errors
   render as a constant 500; the thrown value stays on `cause` for `onReport` (ADR-0014).
6. **Web standards only. No ambient environment.** `URL`, `URLSearchParams`, `Response`, `btoa`;
   nothing reads `process` (ADR-0003).
7. **One error model, shared with the application.** Every error is a
   [@nizam-os/ban-core](https://github.com/nizam-os/kit) `BanError`; `@nizam-os/jsonapi-core`
   depends on `@nizam-os/ban-core` and on nothing else, imports no framework, and the adapter renders
   through `@nizam-os/hono-ban`, so an application's own catalog, this package's, and any other
   library's on @nizam-os/ban-core go through one handler (ADR-0014). Validators arrive through
   Standard Schema; the types are vendored (ADR-0002, ADR-0013).
8. **Headers follow the body.** `Content-Type` parameters are derived from the document's `jsonapi`
   object; `Location` from the created resource's `self` link (ADR-0005).
9. **Client input is hostile.** Prototype keys are rejected wherever a name becomes a key; lookups
   into client-shaped objects are own-property lookups.
10. **Every non-obvious decision cites its source** with `@ref` in code and an ADR in docs.

## 3. The API by example

The examples use `@nizam-os/hono-jsonapi`. Every function in them that is not a Hono hook is
`@nizam-os/jsonapi-core`'s, and the core README shows the same minimal server as a plain `fetch`
handler.

### 3.1 Minimal

```ts
const app = new Hono<JsonApiEnv>();
app.use(jsonApi());
app.onError(errorHandler());
app.notFound(notFoundHandler());

app.get('/articles/:id', queryValidator(Articles), async (c) => {
  const row = await articles.find(c.req.param('id'));
  if (row === undefined) throw jsonApiError('NOT_FOUND');
  return respond(c, resourceDocument(Articles, row, { query: c.req.valid('query') }));
});
```

Three Hono hooks, one validator, one builder, one response helper. `jsonApi()` negotiates and adds
`Vary`; the validator throws its 400s; `errorHandler()` renders everything thrown (section 4.4).

### 3.2 The definition

```ts
const Articles = defineResource({
  type: 'articles',
  attributes: ['title', 'body'],
  relationships: { author: { type: 'people', cardinality: 'one', resource: () => People } },
  serialize: (row: ArticleRow) => ({
    id: row.id,
    attributes: { title: row.title, body: row.body },
    relationships: { author: row.authorId },
  }),
  links: { base: '/api/v1' },
  query: { sort: ['title'], filter: { title: ['eq', 'like'] }, include: ['author'], page: {} },
  validate: { create: CreateArticle, update: UpdateArticle },
});
```

The literal types of `type`, the attribute names, the relationship names, and the sort and filter
names are inferred and carried on the result, so `serialize` cannot return an undeclared field,
`c.req.valid('query').sort[0].field` is `'title'`, and
`relationshipValidator(Articles, 'editor', 'one')` is a type error. `resource` is a thunk so
definitions can reference each other.

`links: { base }` derives `self` (`/api/v1/articles/1`) and every relationship's `self` and
`related` links (`/api/v1/articles/1/relationships/author`, `/api/v1/articles/1/author`) by the URL
design the specification recommends; a builder written out wins over the derived one, and no `base`
means no links. An application states the base once with
`createDefineResource({ links: { base: '/api/v1' } })` and defines every resource with the result
(ADR-0015).

### 3.3 Queries

`parseQuery(Articles, 'include=author&fields[people]=name&sort=-title&filter[title][like]=rails')`
returns a `ParsedQuery` with `include` as segment arrays, `fields` by type, `sort` with directions,
`filter` as conditions and disjunction groups, `page` resolved with the definition's default size,
and `params` for links. Or it throws one 400 with every problem, which `errorHandler()` renders as:

```json
{
  "errors": [
    {
      "id": "6f1c2f0e-...",
      "links": {
        "type": "https://jsonapi.org/profiles/ethanresnick/cursor-pagination/unsupported-sort"
      },
      "status": "400",
      "code": "UNSUPPORTED_SORT",
      "title": "Unsupported Sort",
      "detail": "Sort field \"nope\" is not supported by this endpoint",
      "source": { "parameter": "sort" },
      "meta": { "location": "query" }
    },
    {
      "id": "6f1c2f0e-...",
      "status": "400",
      "code": "UNKNOWN_QUERY_PARAMETER",
      "title": "Unknown Query Parameter",
      "detail": "Query parameter \"bogus\" is not supported by this endpoint",
      "source": { "parameter": "bogus" },
      "meta": { "location": "query" }
    }
  ]
}
```

The `id` is the error id @nizam-os/hono-ban also sends as `X-Error-Id` and hands to `onReport`.

### 3.4 Request documents

`parseCreateDocument(Articles, body)` checks `data.type` against the definition (409), rejects a
client-generated `id` unless the definition accepts them (403), reports undeclared attributes and
relationships with pointers (400), enforces each relationship's cardinality and related type, runs
the create validator over the attributes (422, one error per issue, pointer per path), and returns
the resource object with `attributes` typed as the validator's output. `parseUpdateDocument` does
the same with the URL's id (409 on mismatch).

### 3.5 Atomic operations

```ts
app.post(
  '/operations',
  atomicOperations({
    resources: [articleHandlers, peopleHandlers],
    transaction: (c, run) => db.transaction().execute(run),
  }),
);
```

The processor parses the whole document first (every structural error in one 400), then runs the
operations in order inside `run`, parsing each operation's `data` against the targeted definition
with `lid` allowed, resolving `lid` references from earlier `add`s, and collecting results. An error
from a handler is given the operation's pointer; every failure propagates after the rollback to
`errorHandler()`. No data in any result means `204`.

### 3.6 The client

```ts
export const transport = createTransport({
  origin: 'https://api.example.com',
  language: getLocale,
});
export const clients = createClients({ articles: Articles, people: People }, transport);

const page = await clients.articles.list({
  include: ['author'],
  filter: { title: { like: 'rails' } },
  sort: ['-createdAt'],
  page: { size: 20 },
});
page.data[0]?.author?.name; // string | undefined: resolved, since the query includes author
```

`@nizam-os/jsonapi-client` takes the definitions the server is built from. The paths come from their
links, the query serializes to what `parseQuery` reads, and the types come from `'~types'`, which
`defineResource` infers from `serialize`, the relationships, the query capabilities, and the
validators' inputs (ADR-0018). Records are flat, `type`, `id`, and the fields, with a relationship
resolved into its included record on a path the query includes and left as linkage elsewhere, so
every result is plain data a cache can hold (ADR-0019). An error response rejects with a
`ResponseError` holding the status and the server's error objects, codes included.

### 3.7 TanStack Query

```ts
const articles = resourceQueries(clients.articles);
const page = useQuery(articles.list({ include: ['author'], sort: ['-createdAt'] }));
const create = useMutation(articles.create());
```

`@nizam-os/tanstack-query-jsonapi` turns a client's calls into TanStack Query options keyed by the
request each sends, so two calls that send one request share one cache entry, and each write
invalidates its type and settles once the reads on screen have refetched. It binds TanStack Query's
framework-free core, so the options go into the hooks of React, Vue, Solid, Svelte, and Angular
alike, typed through query-core with only the members it sets (ADR-0020). It reads the client alone,
so an application without the resource family uses it as it is.

## 4. Architecture

### 4.1 Modules

```
@nizam-os/jsonapi-core (packages/jsonapi-core/src)
  media-type   RFC 9110 parsing and serialization; the JSON:API media type and its parameters
  negotiate    the server negotiation rules as a pure function of two header values
  errors       the catalog fragment, the @nizam-os/ban-core instance, jsonApiError and errorItem
  document     types, member names, serialization, builders, full linkage
  resource     defineResource and query capability resolution
  query        parseQuery and the family parsers
  pagination   the Cursor Pagination profile
  request      identifiers, resource documents, relationship documents
  atomic       the extension: processor, content type check, document parser, lids, executors
@nizam-os/hono-jsonapi (packages/hono-jsonapi/src)
  middleware, respond, body, validators, handlers; atomic/handler wraps the core processor
```

Imports form a DAG from `internal` outward. Nothing in `@nizam-os/jsonapi-core` imports a framework;
it imports `@nizam-os/ban-core` for the error class, the catalog shape, and the JSON:API format.
`@nizam-os/hono-jsonapi` imports `@nizam-os/jsonapi-core`, `hono`, and `@nizam-os/hono-ban`, and
re-exports the core so applications see one package (ADR-0013). `import/no-cycle` is enforced.

### 4.2 Data flow for a read

```
request ──jsonApi()──▶ negotiation stored, 415/406 thrown
        ──queryValidator()──▶ parseQuery(definition, query string) ──▶ ParsedQuery | 400
        ──handler──▶ rows ──▶ resourceDocument / collectionDocument / paginatedDocument
                              serialize ▶ sparse fieldsets ▶ included (dedupe, full linkage)
        ──respond()──▶ Content-Type from document.jsonapi, Location on 201
        ──jsonApi()──▶ Vary: Accept
```

### 4.3 Data flow for a write

```
request ──jsonApi()──▶ 415 on bad parameters or unsupported ext
        ──bodyValidator()──▶ readDocument (415 unless JSON:API, 400 unless JSON)
                              parseCreateDocument / parseUpdateDocument (400/403/409/422)
        ──handler──▶ row ──▶ resourceDocument ──▶ respond(c, document, 201)
```

### 4.4 Error rendering

Every error is a `BanError` from `jsonApiBan`, the package's @nizam-os/ban-core instance:
`ERROR_CATALOG` over @nizam-os/ban-core's built-in catalog, rendered by @nizam-os/ban-core's JSON:API
format with `mixedEntries` on so one document can combine entries. A parser accumulates
`ErrorItem`s, each with the entry's identity and the occurrence's `detail` and address, and throws
once; a detail quotes what the client sent only when it is a plain token, such as a member name or
an id, and otherwise names the value without it (ADR-0016). The response status is the shared
entry's, else the "most generally applicable" one. Everything in the adapter throws: the validators,
`jsonApi()`, `readDocument`, and `atomicOperations()`. Hono hands a thrown error to `app.onError`,
where `errorHandler()`, a @nizam-os/hono-ban handler over the same catalog, renders it with an error
id in the header and the body, `Cache-Control: no-store`, the trace id from `traceparent`, and a
report; Hono's `HTTPException` is adopted by status and anything else is a constant 500. Without
`errorHandler()`, Hono's default handler still answers a thrown `BanError` through its
`getResponse()`, so a rejection is a JSON:API document either way (ADR-0014). An application with
entries of its own spreads `ERROR_CATALOG` into its `createBan` and installs that instance's
`onError`; the package's errors render through it unchanged.

### 4.5 Types

Eight type parameters ride on `ResourceDefinition`: type, attribute names, relationship names, row,
sort names, filter names, create output, update output. Consumers never spell them: `AnyResource`
erases them for registries, and helper types (`RowOf`, `RelationshipNameOf`, `CreateAttributesOf`,
`UpdateAttributesOf`) recover them where a signature needs one. Handler objects for the atomic
extension are typed with `ResourceHandlers<typeof Articles, Tx, Ctx>`, where `Ctx` is whatever the
host hands the processor per request (`Context<JsonApiEnv>` under Hono), and accepted by the erased
`AnyResourceHandlers` through bivariant method signatures.

### 4.6 What the previous implementation got wrong

This package replaces an internal JSON:API toolkit whose review found the defects below; each is now
a cited clause with a test.

- Unknown query parameters and undeclared `filter` members were silently dropped; now every one is a
  400 (`#query-parameters`).
- A bracket-notation query parser assigned into existing objects, so `__proto__[x]=y` polluted
  `Object.prototype`; now names are checked against the member grammar and prototype keys before
  they become keys, and `filter[constructor]` is an ordinary 400.
- Sparse fieldsets re-injected fields and rejected the empty value; now an empty `fields[type]`
  means no fields and only the named ones survive (`#fetching-sparse-fieldsets`).
- Ids were sometimes numbers; now `serialize` must return a string id or the builder throws.
- `self` and `first` links stripped the client's `page` parameters and dropped operator filters; now
  links are rebuilt from the request URL and only the cursors change.
- Compound documents could include resources the primary data never linked to; now full linkage is
  asserted before a document is returned (`#document-compound-documents`).
- Negotiation checks were gated on a non-empty extension list, counted `application/json` as a
  JSON:API instance, read profiles from `Content-Type`, and sent 406 and 415 as `application/json`;
  now the rules run unconditionally, profiles come from `Accept`, and every error document is
  `application/vnd.api+json`.
- `page[size]` accepted `0x10`, `1e2`, ` 5`, and `0`, and range requests defaulted to the normal
  page size; now the profile's `^[0-9]+$` rule and its max-size default apply.
- Unrecognized members were written into `meta.page`; the profile's error types were never wired;
  now only recognized members are emitted and the three error objects carry their `type` links.
- Atomic operations required UUID ids, rejected `href`, ignored `lid` on update and remove,
  discarded `data.relationships`, returned `{ data: null }` where no data is allowed, never answered
  `204`, and pinned transaction failures to operation 0; now each clause is implemented and errors
  point at the operation that failed.
- Driver and policy error text reached clients as `detail`; now unexpected errors are a
  constant 500.
- Details quoted the client's text verbatim, markup, line breaks, and 10 kB included; now a detail
  quotes a value only when it is a plain token and otherwise names it without it.
- Node-only `crypto` and `Buffer` imports; now web standards only, verified on Bun, Deno, and
  workerd.

## 5. Decisions

| ADR  | Decision                                                                                                      |
| ---- | ------------------------------------------------------------------------------------------------------------- |
| 0001 | Record architecture decisions                                                                                 |
| 0002 | Validators through vendored Standard Schema types; `hono` is the adapter's peer dependency                    |
| 0003 | Web standards only; no ambient environment reads                                                              |
| 0004 | ESM only, TypeScript 7 `isolatedDeclarations`, erasable syntax                                                |
| 0005 | `Content-Type` parameters and `Location` are derived from the document                                        |
| 0006 | Thrown errors render in `errorHandler`; validators and `jsonApi()` answer their own (superseded)              |
| 0007 | The `filter` grammar                                                                                          |
| 0008 | Cursor pagination: bounds, defaults, link rebuilding, the profile URI                                         |
| 0009 | A closed error catalog over registered status codes                                                           |
| 0010 | Atomic operations: caller-owned transaction, lid scope, two-phase processing                                  |
| 0011 | Conformance tests against the vendored JSON:API 1.0 schema with 1.1 deltas                                    |
| 0012 | Definitions are validated at definition time, never at request time                                           |
| 0013 | Two packages: the framework-neutral core `@nizam-os/jsonapi-core` and the Hono adapter `@nizam-os/hono-jsonapi` |
| 0014 | Errors are @nizam-os/ban-core errors; the adapter renders through @nizam-os/hono-ban; everything throws         |
| 0015 | Resource links by convention: opt-in `base`, a configured definer, no implicit defaults                       |
| 0016 | Error details quote request text only as a plain token; `source` locates the rest                             |
| 0017 | A typed client in the family, on fetch, over the server's definitions                                         |
| 0018 | Definitions carry the types a client reads and writes                                                         |
| 0019 | Records are flat and resolve relationships along the requested include paths                                  |
| 0020 | TanStack Query options are the clients' binding, typed through query-core                                     |
| 0021 | A list's pages key is tagged as TanStack Query's adapters tag an infinite key                                 |
| 0022 | Atomic Operations are values built from definitions and sent through the transport in one request             |
| 0023 | The operations endpoint and its cap are the definitions'                                                      |
