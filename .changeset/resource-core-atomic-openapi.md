---
'@nizam-os/resource-core': minor
'@nizam-os/jsonapi-core': minor
'@nizam-os/hono-jsonapi': minor
---

List the Atomic Operations endpoint in the OpenAPI document. When a listed resource declares
`create`, `update`, or `remove`, `openapi()` lists `POST <base>/operations` (operation id
`atomic:operations`) under the extension's media type: a request schema of each operation the
processor runs for each resource, with the new `<type>.local`, `<type>.atomic-add`, and
`<type>.atomic-update` components; a 200 of `atomic:results` and a 204 where an operation can answer
them; and the error responses of the processor and of every write. Collections under different
bases, or one at the endpoint's path, throw `TypeError`, as the routes do. `DEFAULT_MAX_OPERATIONS`,
the processor's default limit, is exported from `@nizam-os/jsonapi-core/atomic` and
`@nizam-os/hono-jsonapi/atomic`.
