---
'@nizam-os/jsonapi-core': minor
'@nizam-os/hono-jsonapi': minor
---

`validate.id` no longer needs `clientIds: true`. An update's document id names the request's
resource when the texts are equal or `validate.id` takes both with one output, so a client that
requests a key in its own spelling, such as a UUID in upper case, and sends back the document the
server gave it is no longer refused with 409, in a `PATCH` and in an atomic `update` alike. The
parsed update id stays the document's text.
