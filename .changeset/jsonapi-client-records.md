---
'@nizam-os/jsonapi-client': minor
---

Reads responses. `deserialize(document, { include })` turns a JSON:API document into flat records,
each holding `type`, `id`, its attributes, and its relationships, with `$links`, `$meta`, and
`$relationships` for the rest. A relationship resolves to the included record only along the include
paths the request asked for; otherwise it stays the linkage, `{ type, id }`, so a record never
claims more than the server sent. `RecordOf` gives the record a query returns from the server's
definitions: a literal include or fieldset narrows it exactly, a computed one leaves the fields
optional. Members, links, and identifiers are checked against their shapes, and a document that is
not JSON:API is refused with a constant `TypeError`. `ResponseError` carries the status, the error
objects with their codes and pointers, and the `Allow` and `Retry-After` headers; its message names
the type, the call, and the status, never the URL or the body. `isResponseError(error, code)`
narrows by code across bundles.
