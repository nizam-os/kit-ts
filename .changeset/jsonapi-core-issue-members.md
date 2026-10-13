---
'@nizam-os/jsonapi-core': minor
---

A validation issue's `code` and `expected`, when they are strings, now reach the client: each
`VALIDATION_FAILED` item of `parseCreateDocument`, `parseUpdateDocument`, and the atomic `add` and
`update` operations carries them as `reason` and `expected`, which `@nizam-os/ban-core`'s JSON:API
format renders as `meta.code` and `meta.expected`. A client can tell a length violation from a
pattern violation without parsing the `detail`. Nothing else of a vendor's issue is kept, so no
value from the request reaches the response. `errorItem` takes `reason` and `expected` too.
