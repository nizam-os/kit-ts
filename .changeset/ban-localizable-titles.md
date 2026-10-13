---
'@nizam-os/ban-core': minor
'@nizam-os/hono-ban': minor
---

Document error titles as strings, so localized bodies conform. The Problem Details, JSON:API, and
plain schemas pinned `title` to the catalog's value with `const`, so a body whose title the
handler's `transform` localized, as RFC 9457 allows, failed the response its route documented. They
now document `title` as a string with the catalog's title as its example (`examples` in JSON Schema
2020-12 and OpenAPI 3.1, `example` in the OpenAPI 3.0 dialect), and keep `status` and `code` pinned,
so each entry's schema still refuses another entry's body.
