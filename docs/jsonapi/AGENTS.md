# jsonapi family: instructions for coding agents

Read with the root [`AGENTS.md`](../../AGENTS.md), which holds the rules every family shares; this
file adds what is specific to `@nizam-os/jsonapi-core` (the framework-free core),
`@nizam-os/hono-jsonapi` (the Hono binding), `@nizam-os/jsonapi-client` (the typed client), and
`@nizam-os/tanstack-query-jsonapi` (the client's TanStack Query binding). Humans: see
[`CONTRIBUTING.md`](CONTRIBUTING.md).

## Ground rules

- Read `docs/jsonapi/DESIGN.md` for intent and `docs/jsonapi/SPEC.md` for the exact contract before
  changing public API. Implement from the SPEC section named in the file header; update the SPEC in
  the same PR when the code must differ. Read the relevant ADR in `docs/jsonapi/adr/` before
  changing a decision it records; add a new ADR instead of silently reversing one.
- Spec-driven, not memory-driven. Every behavior comes from a clause of JSON:API 1.1
  (https://jsonapi.org/format/1.1/), the Cursor Pagination profile
  (https://jsonapi.org/profiles/ethanresnick/cursor-pagination/), the Atomic Operations extension
  (https://jsonapi.org/ext/atomic/), RFC 9110, RFC 6901, or Standard Schema. Fetch the clause, cite
  it in the code with an `@ref <url>` comment next to the decision it justifies, and quote the
  normative words in the test name. Where the specification leaves a choice to the server, the
  choice is written down in `docs/jsonapi/SPEC.md` and an ADR.
- Nothing about the server reaches a client that a factory did not put there: unexpected errors
  render as a constant 500, the `cause` stays on the error for `report`.
- Client input never becomes an object key without a check (`PROTO_KEYS`, `Object.hasOwn`), and
  every lookup into client-shaped data goes through `internal/object.ts`.
- Framework code stays in the adapter. Nothing under `packages/jsonapi-core/` imports `hono` or
  another framework; what needs a request, a response, or a framework context lives in
  `packages/hono-jsonapi/` and calls the core (ADR 0013). The host context handlers receive is the
  `TContext` type parameter, never a concrete framework type, in the core.
- The client runs wherever `fetch` does. Nothing under `packages/jsonapi-client/` imports a
  framework, a Node built-in, or `process`; it reads a definition's `type`, `relationships`,
  `links`, and `query`, and never calls its `serialize` or a validator (SPEC 15).
- The TanStack Query binding binds the core every adapter is built on. Nothing under
  `packages/tanstack-query-jsonapi/` imports a framework, an adapter, or a value of
  `@tanstack/query-core`, only its types; the options are plain objects holding only the members the
  binding sets (ADR 0020), a pages key tagged as the adapters tag an infinite key (ADR 0021), and
  every adapter's hooks take them as they are (SPEC 16).

## Repository map

A pnpm workspace: `packages/jsonapi-core` (the framework-free core, published as
`@nizam-os/jsonapi-core`), `packages/hono-jsonapi` (the Hono adapter, published as
`@nizam-os/hono-jsonapi`, depends on the core and re-exports it), `packages/jsonapi-client` (the
typed client, published as `@nizam-os/jsonapi-client`, depends on the core alone),
`packages/tanstack-query-jsonapi` (the TanStack Query binding, published as
`@nizam-os/tanstack-query-jsonapi`, takes the client as a peer and query-core as an optional peer it
imports types from), and `e2e/jsonapi/` (private). Root configs (`vitest.config.ts` with
`test.projects`, `tsconfig.base.json`, `knip.jsonc`, `.oxlintrc.json`, `.oxfmtrc.json`) apply to all
of them.

`packages/jsonapi-core/src/`:

- `internal/` constants, prototype-safe object helpers, RFC 6901 pointers, vendored Standard Schema
  types; never exported
- `media-type/` RFC 9110 media type and `Accept` parsing and serialization, the JSON:API media type
  and its `ext` and `profile` parameters
- `negotiate/` the server content negotiation rules as a pure function
- `errors/` the catalog fragment over @nizam-os/ban-core's built-ins, the `jsonApiBan` instance,
  `jsonApiError` and `errorItem`; every error is a @nizam-os/ban-core `BanError`
- `document/` document and resource object types, member name rules, resource serialization,
  document builders, full linkage
- `resource/` `defineResource`: the definition everything else reads from; `links.ts` derives links
  from `links.base`; `createDefineResource` configures defaults once
- `query/` `parseQuery`: `include`, `fields`, `sort`, `page`, `filter`, search, custom
- `pagination/` the Cursor Pagination profile: links, meta, errors, `paginatedDocument`
- `request/` request documents: identifiers, resource objects, relationship documents
- `atomic/` the Atomic Operations extension (`@nizam-os/jsonapi-core/atomic`):
  `operationsProcessor`, `assertOperationsContentType`, `errorAtOperation`, the document parser,
  lids, executors
- `test-support/` the vendored JSON:API 1.0 JSON Schema and the Ajv conformance helper for the
  repository's own tests; not published

`packages/hono-jsonapi/src/`:

- `index.ts` re-exports `@nizam-os/jsonapi-core` and adds the Hono integration: `jsonApi()`
  middleware (`middleware.ts`), `respond` (`respond.ts`), `readDocument` (`body.ts`), validators
  (`validators.ts`), `errorHandler` and `notFoundHandler` (`handlers.ts`)
- `atomic/` re-exports `@nizam-os/jsonapi-core/atomic` and adds `atomicOperations()`, the operations
  endpoint as a Hono handler

`packages/jsonapi-client/src/` (SPEC 15.1):

- `transport/` `createTransport` and the opaque `Transport` (`transport.ts`), the origin and the
  links the client follows (`origin.ts`), and `send`, one request and its response (`send.ts`)
- `client/` `createClients` (`create-clients.ts`), the calls of one resource (`resource-client.ts`,
  typed wide in `wide-client.ts`), their URLs (`urls.ts`), the documents writes send
  (`request-documents.ts`), the results the calls read (`results.ts`), `next` and `prev`
  (`follow.ts`), and the types of the clients (`types.ts`)
- `query/` the query types (`types.ts`) and `serializeQuery` (`serialize-query.ts`,
  `serialize-filter.ts`)
- `pagination/cursors.ts` `pageCursors` and `cursorOf`
- `document/` `deserialize` (`deserialize.ts`), the include tree it resolves along
  (`include-tree.ts`), the shape-checked readers of links, relationship objects, and identifiers
  (`members.ts`), and the record types (`types.ts`)
- `errors/response-error.ts` `ResponseError` and `isResponseError`
- `client/record-types.ts` `RecordOf`: the record a query returns, derived from the definitions
- `internal/object.ts` prototype-safe reads of response JSON, and `internal/definition-types.ts` the
  type helpers over definitions; never exported
- `test-support/` the blog's definitions (`blog.ts`), a compound document (`compound.ts`), and a
  fetch double (`fetch-double.ts`) for the package's own tests; not published

`packages/tanstack-query-jsonapi/src/` (SPEC 16.1):

- `query-keys.ts` the keys: the query string each call sends (16.2)
- `pages.ts` an infinite list's page parameters, from the query's cursors and the pages' links
  (16.3)
- `query-types.ts` the options' types, holding only the members `resourceQueries` sets (16.5)
- `queries.ts` `resourceQueries`, and the `TypeError`s of an argument that is not a client (16.2 to
  16.6)
- `test-support/` the blog's definitions (`blog.ts`) and a fetch double that holds each answer until
  the test releases it (`fetch-double.ts`); not published

`e2e/jsonapi/`: end-to-end suite, a private workspace package that consumes the built
`@nizam-os/jsonapi-core`, `@nizam-os/hono-jsonapi`, `@nizam-os/jsonapi-client`, and
`@nizam-os/tanstack-query-jsonapi` through `workspace:*` and drives a blog API over real HTTP with
`@hono/node-server`, the `client-*` files through the client and `query/` through TanStack Query,
whose `query/adapters/` type-checks the options with the hooks of React, Vue, Solid, Svelte, and
Angular Query; never imports from `src/`. `e2e/jsonapi/smoke/` is the runtime smoke test (Bun, Deno,
workerd), the client's and the binding's checks running inside each runtime.

- `docs/jsonapi/DESIGN.md` what we are building and why; `docs/jsonapi/SPEC.md` the normative
  contract; `docs/jsonapi/adr/` decisions
