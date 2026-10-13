---
'@nizam-os/hono-resource': minor
---

Serve the OpenAPI document and name the resource a request addressed for localized errors. With the
new `openapi` option, `jsonApiRoutes` serves `openapi(runtime.resources, options)` at
`GET <base>/openapi.json` as `application/json`, without an actor; the document is built once when
the routes are made, so one that cannot be built fails at boot, and a resource whose route takes the
path is refused. The new `resourceTypeOf(c)` is the type of the resource the request's route serves,
the target's on a related link, and the type of the operation that failed on the operations
endpoint, so `localizeErrors(messages, { resource: resourceTypeOf })` labels each member an error
points at in the words of its own resource.
