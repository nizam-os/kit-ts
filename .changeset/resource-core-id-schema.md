---
'@nizam-os/resource-core': minor
---

Every declared resource now exposes the form of its ids: `schema.id`, a Zod schema, and
`validate.id`, its Standard Schema validator, which take an id in its key's form. The JSON:API
resource of a declaration with `clientIds` validates a create's client id with it, so an id outside
the form is a 422 at `/data/id` instead of a 500 or a key stored under another spelling. Check a
URL's id with `schema.id` before querying and answer `NOT_FOUND` when it refuses: no row has that
id.
