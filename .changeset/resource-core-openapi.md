---
'@nizam-os/resource-core': minor
---

New `@nizam-os/resource-core/openapi` entry. `openapi(resources, options)` builds the OpenAPI 3.1.2
document of the resources you serve: every declared operation and relationship endpoint, its query
parameters from the declared filters, sorts, includes, and page bounds, its JSON:API documents, and
an error response for each status it can answer with, listing its codes, whose error objects, and
the response of each status that carries one code, are shared components. The schemas admit every
request the server accepts. Name the codes of your rules, quotas, and middleware in `codes`, and
give business examples in `examples`, which must pass the schemas the server applies, or the call
throws. `surfaceOf(resources)` records what clients depend on as sorted JSON to commit next to the
catalog, and `diffSurfaces(before, after)` lists every change between two surfaces, each marked
breaking or safe.
