---
'@nizam-os/jsonapi-core': minor
'@nizam-os/hono-jsonapi': minor
---

New `writable` option on `defineResource`: `{ create, update }` lists the fields each write accepts,
typed as the declared names, and every field stays writable when an operation has no list. A create
or an update that carries a field its operation does not accept is refused with 403 `FORBIDDEN` at
the field's pointer before the validator runs, so a read-only field such as `createdAt` stays
served, sortable, and filterable without a write silently dropping it. Atomic operations refuse it
the same way, and `relationshipValidator` refuses a relationship that updates do not accept with 403
before reading the body. A document refused for such a field and for anything else answers 400 with
every error.
