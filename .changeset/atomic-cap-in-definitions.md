---
'@nizam-os/jsonapi-core': minor
'@nizam-os/hono-jsonapi': minor
'@nizam-os/resource-core': minor
'@nizam-os/hono-resource': minor
---

Hold the Atomic Operations endpoint and its cap in the definitions. `defineResource` takes
`atomic: { max }`, the most operations one request takes: 10 by default, and a positive safe integer
or a `TypeError` naming `atomic.max`. `createDefineResource` and `createDeclareResource` take it as
a default, and `ResourceDefaults` gains `atomic`. `resourcePaths` returns `operations`, the
collection's base followed by `/operations`, where `@nizam-os/hono-resource` mounts the endpoint and
the OpenAPI document lists it. `operationsProcessor` and `atomicOperations` read the cap from their
resources' definitions and throw `TypeError` at setup when the caps differ; `maxOperations` is no
longer an option. The OpenAPI document's `maxItems` is the cap, and its refusal of links under
different bases now names their operations paths.
