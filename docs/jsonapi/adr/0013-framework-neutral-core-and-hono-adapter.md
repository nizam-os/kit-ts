# ADR 0013: Two packages: a framework-neutral core (`@nizam-os/jsonapi-core`) and the Hono adapter (`@nizam-os/hono-jsonapi`)

- Status: accepted; the dependency statements amended by ADR-0014 (`@nizam-os/jsonapi-core` depends
  on `@nizam-os/ban-core`, `@nizam-os/hono-jsonapi` also has `@nizam-os/hono-ban` as a peer
  dependency, and `ErrorStatusCode` is @nizam-os/ban-core's)
- Date: 2026-10-08

## Context

The library was first written as one package, `@nizam-os/hono-jsonapi`. Three quarters of its source
never touched Hono: resource definitions, documents, query and request parsing, negotiation,
pagination, and the atomic executors are functions over strings, parsed JSON, and `URL`s. Hono
reached the core in three places only: the `Context` stored on `OperationContext.c` and handed to
`AtomicOptions.transaction`, the atomic endpoint's request handling (405, 415, body reading,
rendering), and a type-only import of Hono's status code unions for `ErrorStatusCode`. Everything
else that is JSON:API rather than HTTP framework glue was already usable from a plain `fetch`
handler, another framework, or a client, but the package name said otherwise and the coupling in the
atomic module made that use awkward. @ref https://jsonapi.org/format/1.1/ @ref
https://tanstack.com/query/latest/docs/framework/react/overview (one core, thin framework adapters)
@ref https://tsdown.dev/options/package-exports#devexports

## Decision

- Two packages in one pnpm workspace. `@nizam-os/jsonapi-core` is the core: no dependencies, no peer
  dependencies, no framework or runtime API beyond web standards (ADR 0003).
  `@nizam-os/hono-jsonapi` is the Hono adapter: it depends on `@nizam-os/jsonapi-core`
  (`workspace:^`, published as a caret range), has `hono` as its only peer dependency (ADR 0002 now
  describes this package), and re-exports the core in full from both of its subpaths, so a Hono
  application imports from one package and a second copy of the core never enters the graph
  (`e2e/jsonapi/package-surface.e2e.test.ts` checks the bindings are the same objects).
- The atomic module splits along the HTTP boundary. The core exposes `operationsProcessor(options)`,
  which parses an operations document and runs it inside the caller's transaction, returning the
  results and the response document (or none, for `204`), and `assertOperationsContentType`, which
  checks a header value. The host type is a type parameter: `OperationContext.ctx: TContext` and
  `transaction(ctx, run)` receive whatever the adapter hands the processor per request. The
  adapter's `atomicOperations()` owns the method check (405 with `Allow`), the header read,
  `readDocument`, and rendering, and passes Hono's `Context` as `ctx`.
- `ErrorStatusCode` is the core's own literal union of the registered 4xx and 5xx codes (identical
  in membership to Hono's, so the adapter needs no assertions; ADR 0009).
- Repository mechanics. Each package's `exports` map carries a `source` condition pointing at `src/`
  (tsdown `devExports: 'source'`); `@nizam-os/hono-jsonapi`'s tsconfig and Vitest project enable
  that condition, so its type-check and tests run against the core as it is edited with no build in
  between, while the published map (`publishConfig.exports`, applied by `pnpm publish` and
  `pnpm pack`) and `e2e/jsonapi/` see only `dist/`. One Vitest run covers both packages through
  `test.projects`, with coverage thresholds over the combined source. Versions are independent;
  Changesets bumps `@nizam-os/hono-jsonapi` by a patch whenever its `@nizam-os/jsonapi-core` range
  has to move (`updateInternalDependencies: patch`), and each package has its own npm trusted
  publisher.

## Consequences

Other runtimes and frameworks get the full library with nothing to strip out, and a second adapter
is one package following `packages/hono-jsonapi/` as the precedent: a `Context`-like type for
`TContext`, a handler around `operationsProcessor`, validators in the framework's own shape. Hono
users see one API; `OperationContext.c` became `ctx`, and `transaction`'s first argument is the host
context rather than a Hono `Context` by construction. The cost is two packages to version, publish,
and document, and the `source` export condition that contributors must know about when a resolution
surprises them.
