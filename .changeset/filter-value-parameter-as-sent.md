---
'@nizam-os/jsonapi-core': minor
'@nizam-os/keyset-core': minor
'@nizam-os/resource-core': minor
'@nizam-os/kysely-resource': patch
'@nizam-os/hono-resource': patch
---

A refused filter value's error names the query parameter the client sent, as the parser's own
refusals do. `parseQuery`'s filter conditions keep the `parameter` they came in, as the request
spelled it, and a condition built by hand names one too. Each entry of keyset-core's
`InvalidFilterValueError` carries its condition's `path` in the filter tree.
`@nizam-os/resource-core`'s `filterParameters(resource, query)` lists each condition's path and
parameter, which a runtime's `list` takes as its `parameters` option. `@nizam-os/kysely-resource`
then answers a refused value at that parameter, in a transaction too: `filter[status]` or
`filter[or][0][status]`, where it answered `filter[status][eq]`. `@nizam-os/hono-resource`'s list
route passes the parameters.
