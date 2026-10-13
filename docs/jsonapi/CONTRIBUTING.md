# Contributing to the jsonapi family

`@nizam-os/jsonapi-core` (the framework-free core), `@nizam-os/hono-jsonapi` (the Hono binding),
`@nizam-os/jsonapi-client` (the typed client), and `@nizam-os/tanstack-query-jsonapi` (the client's
TanStack Query binding). The root [`CONTRIBUTING.md`](../../CONTRIBUTING.md) covers setup, the
quality gates, the shared conventions, commits, changesets, and releases; this guide adds what is
specific to the family. Design intent lives in [`DESIGN.md`](DESIGN.md), the normative contract in
[`SPEC.md`](SPEC.md), and decisions in [`adr/`](adr); read those before proposing API changes.

## Conventions

- **Every behavior traces to a clause.** JSON:API 1.1, the Cursor Pagination profile, the Atomic
  Operations extension, RFC 9110, RFC 6901, and Standard Schema are the sources. Add an `@ref <url>`
  comment next to the decision it justifies, and name the clause in the test. Where the
  specification leaves a choice to the server (the filter grammar, page size bounds, the error
  catalog), the choice is recorded in `docs/jsonapi/SPEC.md` and an ADR, never only in code.
- **The core knows no framework.** Everything under `packages/jsonapi-core/` is functions over plain
  values; what needs a request, a response, or a framework context goes in `packages/hono-jsonapi/`
  and calls the core (ADR 0013). A handler context is the `TContext` type parameter in the core.
- **The client is typed by the definitions, never by hand.** What `packages/jsonapi-client/` sends
  and reads is typed from `'~types'` (SPEC 5.3); a capability a definition can declare gets its
  client type there first, so the server's definition stays the one source.
- **The TanStack Query binding serves every adapter.** `packages/tanstack-query-jsonapi/` imports
  only types from `@tanstack/query-core` and hands TanStack Query plain objects (ADR 0020); an
  option it adds is type-checked with the hooks of every adapter in `e2e/jsonapi/query/adapters/`,
  and its tests run on query-core 5.89.0, the floor, in CI. Its tests read the cache through
  query-core's observers, which the floor has, never through the `QueryClient` methods TanStack
  Query has deprecated since.
- **End-to-end tests live in `e2e/jsonapi/`.** That directory is a private pnpm workspace package
  that depends on the family's packages through `workspace:*`, so its imports resolve through the
  published `exports` maps into `dist/` and its `tsc` run checks the emitted declarations. Each
  `*.e2e.test.ts` file starts the blog API in `e2e/jsonapi/support/` on `@hono/node-server` and
  asserts over `fetch`. Never import from `src/` there. Run one file with
  `pnpm --filter @nizam-os/jsonapi-e2e exec vitest run <name>` after `pnpm build`.
- **Client input is hostile.** Names from a request become object keys only through
  `internal/object.ts` or after a `PROTO_KEYS` check; reads of client-shaped objects use
  `Object.hasOwn`. See `SECURITY.md` for what counts as a vulnerability.

## Adding a capability

The package has one extension point today: a handler that implements an operation of the Atomic
Operations extension is application code (`ResourceHandlers`), not a contribution. New library
surface falls into one of these:

- **A specification clause not yet implemented.** Open an issue quoting the clause. The change ships
  with the clause cited in code and tests, a SPEC section, and a changeset.
- **A server choice the specification leaves open** (a filter operator, a pagination strategy, a
  query parameter family). Open a discussion first; the result is an ADR, then code.
- **Another JSON:API extension or profile.** It is a new subpath of the core
  (`packages/jsonapi-core/src/<name>/index.ts`, an entry in its `tsdown.config.ts`, a row in SPEC
  section 1, an `e2e/jsonapi/package-surface.e2e.test.ts` entry, a smoke check, an ADR, and a
  `minor` changeset), following `atomic/` as the precedent; what needs the HTTP layer gets a
  matching subpath in `@nizam-os/hono-jsonapi` that re-exports it and adds the handler.
- **An adapter for another framework.** A new package `packages/<framework>-jsonapi/` following
  `packages/hono-jsonapi/` as the precedent: depends on `@nizam-os/jsonapi-core` (`workspace:^`),
  re-exports it in full, adds the framework's middleware, validators, response helpers, and a
  handler around `operationsProcessor` with the framework's request context as `TContext`. Its own
  e2e coverage joins `e2e/jsonapi/`.

**Constraints every contribution inherits.**

- `@nizam-os/jsonapi-core` depends on `@nizam-os/ban-core` and on nothing else; `hono` and
  `@nizam-os/hono-ban` are `@nizam-os/hono-jsonapi`'s only peer dependencies (ADR 0014). Validators
  are consumed through the Standard Schema interface, whose types are vendored in
  `packages/jsonapi-core/src/internal/standard-schema-types.ts`; the packages never import Zod,
  Valibot, or ArkType (ADR 0002). The real libraries used in tests are devDependencies.
- A definition is validated once, in `defineResource`, with a `TypeError` naming the option. A
  request-time check that a definition mistake could trigger belongs there, not in a parser.
- A parser reports every problem it finds in one `BanError` built with `jsonApiError`, each error
  item with a `source` (`pointer`, `parameter`, or `header`), and never drops input silently.
- Every `code` the packages emit is in `ERROR_CODES`; a new one is a catalog entry, a SPEC 4.1 row,
  and a `minor` changeset (ADR 0009, ADR 0014). Nothing in the adapter renders its own rejection; it
  throws, and `errorHandler()` renders.

**Checklist.** Every item below is checked by CI or by a reviewer.

1. Source file in the right directory (see the repository map in `AGENTS.md`), with a
   `@packageDocumentation` header naming the SPEC section it implements and `@ref` links to the
   specification.
2. Unit tests beside the file; a `*.test-d.ts` when inference is part of the contract.
3. `docs/jsonapi/SPEC.md`: the section for the behavior, and section 1 or 12 when the public surface
   changes; `docs/jsonapi/DESIGN.md` when the intent changes; the README when a user would look for
   it.
4. `e2e/jsonapi/package-surface.e2e.test.ts` lists every export of all four subpaths; a new export
   goes there, and into an e2e file that drives it over HTTP.
5. An ADR for a public API change, a wire shape, a server choice, or a dependency.
6. A changeset: an additive export or option is `minor`; anything that changes an existing wire
   shape, parse result, or exported type is `major`.
