---
'@nizam-os/jsonapi-core': minor
---

`resourcePaths(definition, { caller? })` reads where a resource's operations live from its links:
the collection, the resource with its `{id}`, each relationship's `self` and `related` path, and an
absolute link's origin. It throws `TypeError` when the links cannot give them, each message starting
with `caller` (default `resourcePaths`). `ResourcePaths` and `ResourcePathsOptions` are exported,
and `@nizam-os/hono-jsonapi` re-exports all three. The OpenAPI document of `@nizam-os/resource-core`
and the routes of `@nizam-os/hono-resource` read their paths through it, so a client calls the URLs
they name.
