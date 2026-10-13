---
'@nizam-os/keyset-core': minor
'@nizam-os/kysely-resource': minor
---

Every refused filter value of a request is reported at once. `InvalidFilterValueError` carries
`values`, one `{ field, operator, expected }` per condition whose value its field's type refuses, in
the order of the request's conditions, in place of its single `field`, `operator`, and `expected`. A
malformed filter, or a field or operator the definition does not have, is still reported alone,
before any value. `@nizam-os/kysely-resource` answers one `INVALID_QUERY_PARAMETER` error object per
refused value, at its `filter[<field>][<operator>]`, so a client fixes every value in one round
trip.
