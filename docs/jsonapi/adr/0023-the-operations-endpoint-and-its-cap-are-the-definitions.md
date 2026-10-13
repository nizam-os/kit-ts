# ADR 0023: The operations endpoint and its cap are the definitions'

- Status: accepted
- Date: 2026-10-12

## Context

`operationsProcessor` takes `maxOperations`, 10 by default (ADR 0010, JsonApiDotNetCore's default),
and `@nizam-os/hono-resource` passes none (resource SPEC 19.4). Nothing a client imports holds the
cap, so a screen that writes a selection in one request (ADR 0022) cannot know it: a bulk action
over a page of 50 records is a `400` it could not foresee. The OpenAPI document states the default
as the request's `maxItems` (resource SPEC 13.1), whatever the processor was given.

The endpoint's path is derived twice, `<base>/operations` with the base the collection path without
its last segment, by `@nizam-os/hono-resource`'s routes and by `@nizam-os/resource-core`'s OpenAPI
document; the client would derive it a third time. Every other path the three name comes from
`resourcePaths` (SPEC 5.4), which reads it from the definition's links, so they agree.

The definitions are what the server, the document, and the client share. Their links give the paths,
and their query capabilities the page sizes, which a list screen reads as `page.max` (resource SPEC
20.7); the definers merge an application's defaults under every definition (ADR 0015).

@ref https://www.jsonapi.net/usage/writing/bulk-batch-operations.html ("The maximum number of
operations per request defaults to 10"; its example posts to `/api/operations`) @ref
https://jsonapi.org/ext/atomic/#processing

## Decision

- A definition holds `atomic: { max }`, the most operations one request at its base takes: a
  positive safe integer, 10 by default (`DEFAULT_MAX_OPERATIONS`), refused with `TypeError` naming
  `atomic.max` otherwise. `createDefineResource`'s defaults take `atomic` and merge it as they merge
  `links`; `@nizam-os/resource-core`'s definer takes it and passes it on (resource SPEC 2).
- `ResourcePaths.operations` is `<base>/operations`, the collection path without its last segment
  followed by `/operations`, where the extension's examples and JsonApiDotNetCore's post. The host
  serves the endpoint there, the OpenAPI document lists it there, and the client sends there.
- `operationsProcessor` takes the cap from its resources' definitions, which must agree; when they
  differ it throws `TypeError` before it serves anything. `AtomicOptions` no longer has
  `maxOperations`. This replaces ADR 0010's last bullet; the default stays 10.
- The OpenAPI document's `maxItems` is that cap.

## Consequences

The server enforces the value a screen reads from the definition it imports, so a selection over it
is refused before anything is sent (resource ADR 0019). Definitions from two definers that disagree
fail at startup rather than on a request. An application that needs more than 10 operations per
request raises the cap in its definer, where its links and page sizes are set. A host that mounts
the endpoint at another path still processes operations, but the client sends to
`<base>/operations`.
