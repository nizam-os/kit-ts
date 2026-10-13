---
'@nizam-os/resource-core': minor
---

The JSON:API resource a declaration derives now lists the members each write accepts by their
access: a create takes `readWrite`, `immutable`, and `write` members, an update `readWrite` and
`write` ones. A request that carries a `read` member, or an `immutable` member on update, is now a
403 `FORBIDDEN` at the member instead of a 422, as JSON:API requires for an unsupported update, on
the resource routes, the relationship routes, and in atomic operations alike.
