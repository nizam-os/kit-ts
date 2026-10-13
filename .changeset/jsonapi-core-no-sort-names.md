---
'@nizam-os/jsonapi-core': patch
---

A definition whose query declares no `sort` types its sort names as `never` instead of `string`, so
`query.sort` is `ReadonlyArray<never>` and a typed client refuses a sort the server would answer
with a 400.
