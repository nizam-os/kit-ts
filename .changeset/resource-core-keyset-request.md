---
'@nizam-os/resource-core': minor
---

`keysetRequest(resource, query)` on `@nizam-os/resource-core/server` builds the keyset request of a
query `parseQuery` parsed with a declared resource's JSON:API definition, typed by its keyset
definition, so a list route hands keyset-core what it takes. It gives `isNull` its boolean and a
single `in`, `nin`, `between`, or array value its list, joins the conditions and the `filter[or][n]`
groups, passes `search` and the page as they are, and leaves `sort` out of a query without one, so
the declared default applies. Every other value goes to keyset-core unchanged, which refuses a value
of the wrong type with its own `InvalidFilterValueError`.
