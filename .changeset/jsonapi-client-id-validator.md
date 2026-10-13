---
'@nizam-os/jsonapi-core': minor
'@nizam-os/hono-jsonapi': minor
---

New `validate.id` on `defineResource`: a Standard Schema for the resource id. With
`clientIds: true`, a create's client-generated id outside it is refused with 422 `VALIDATION_FAILED`
at `/data/id`, reported before any issue of the attributes, in a `POST` and in an atomic `add`
alike, and the parsed id is the validator's output.
