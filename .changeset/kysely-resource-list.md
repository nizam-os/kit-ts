---
'@nizam-os/kysely-resource': minor
---

The Kysely storage lists rows: `list` plans the request with the resource's keyset definition, binds
every cursor to the transaction's scope values so a cursor of one tenant is refused in another, and
with `{ total: true }` also counts the rows the filter selects. `many` reads the rows of several ids
in the scope in one statement, for includes. `ListOptions` is exported.
