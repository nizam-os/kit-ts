# ADR 0013: Hosts take the runtime contract, mount where the links point, and run an operations request in one transaction

- Status: accepted; amended by jsonapi ADR 0017 (`resourcePaths` lives in `@nizam-os/jsonapi-core`,
  so a client reads the same paths; the decision stands)
- Date: 2026-10-11

## Context

`@nizam-os/hono-resource` serves declared resources on Hono. The epic's sketch predates the runtime:
it mounts a `domain` and serves `domain.openapi()`, neither of which exists. What exists:

- `createResourceRuntime` resolves to `{ warnings, as(actor) }`. Its types (`ResourceRuntime`,
  `Domain`, `ResourceOperations`) live in `@nizam-os/kysely-resource`, so a host that typed the
  runtime would install Kysely.
- Each operation runs in a transaction of its own.
- The OpenAPI document reads each resource's paths from its JSON:API links (`resourcePaths`), and
  `links.base` comes from the definer (jsonapi ADR 0015).
- `@nizam-os/jsonapi-core`'s operations processor runs every operation inside a transaction the
  caller owns (jsonapi ADR 0010) and points a failure without a source at its operation.
- A refusal's items point where a single resource document holds the member: `/data/attributes/...`,
  `/data/relationships/<name>/data...`, `/data/id`.
- The Kysely runtime maps a PostgreSQL failure once the transaction ended, since a partition's names
  are read on a connection of their own (ADR 0010).

JSON:API requires an operations request to be atomic, and PostgreSQL aborts a transaction at its
first refused statement. @ref https://jsonapi.org/ext/atomic/#processing @ref
https://www.postgresql.org/docs/18/tutorial-transactions.html

## Decision

- The runtime contract is `@nizam-os/resource-core/server`'s (SPEC 12.10): `ResourceRuntime`,
  `RuntimeResources`, `Domain`, `ResourceOperations`, `ResourceInput`, and `ListOptions`.
  `@nizam-os/kysely-resource` implements it and re-exports the types; `@nizam-os/hono-resource`
  depends on `@nizam-os/resource-core` and `@nizam-os/hono-jsonapi` and imports no runtime.
- The runtime lists what it runs as `resources`. The routes serve exactly those resources, so a host
  cannot mount one the runtime cannot run, and an include's target is found among them, as boot
  already requires its behavior.
- Paths come from the links through `resourcePaths`, the function the OpenAPI document reads. The
  routes sit at full paths and the host mounts them at `/`: a mount prefix would make the links and
  the document name URLs nobody serves.
- `transaction(actor, work)` runs an operations request in one transaction. The first failed
  operation decides: the transaction rolls back, later calls are refused, and the failure is mapped
  once the transaction ended, exactly as the operation alone would map it. The hook after commit
  runs once with every event.
- The runtime keeps pointing at `/data...`, and the host moves the items to where its request held
  the input: a relationship document's `/data...`, an operation's
  `/atomic:operations/<index>/data...`. Only the host knows where it read the input, and one
  mechanism covers both.
- The host owns negotiation, the error handler, and `notFound`; `@nizam-os/hono-resource` adds
  routes and `resourceTypeOf` for `localizeErrors`. The actor resolves once per request, before any
  validator, so a request without a session learns nothing about the resource from a 400.
- A known path answers another method with 405 and `Allow`, as RFC 9110 requires.

## Consequences

`@nizam-os/kysely-resource` keeps its exports, now re-exported; it gains `resources` and
`transaction`. `resourcePaths` becomes public in `@nizam-os/resource-core/openapi`. A host that
serves under a prefix states it once, in the definer's `links.base`. Operations that change to-many
relationships wait for to-many relationships (DESIGN 6). A worker that catches an operation's
failure inside `transaction` cannot continue the transaction; it starts another.
