---
'@nizam-os/hono-resource': minor
---

Serve each to-one relationship's routes where its links point: `GET` of the relationship link
answers the row's linkage, `PATCH` updates it where the relationship is `readWrite` and the resource
declares `update`, and `GET` of the related link answers the target's resource document, or
`data: null`. An update a relationship link does not support answers 403, as JSON:API requires, and
a refused linkage points at `/data`, where the relationship document holds it. `jsonApiRoutes` now
requires every relationship's target among the runtime's resources, includable or not.
