---
'@nizam-os/kysely-resource': patch
'@nizam-os/resource-core': patch
---

`list` orders a key that is not nullable without a null placement, so an index of the scope column,
the sort columns in their directions, and the key starts each page at its cursor however deep it is.
The READMEs give the index advice with measurements on PostgreSQL 14.
