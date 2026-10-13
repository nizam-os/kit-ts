---
'@nizam-os/jsonapi-client': minor
---

New package: a typed client for JSON:API servers built with `@nizam-os/jsonapi-core`. This first part
writes queries. `serializeQuery(definition, query)` gives the query string the server's `parseQuery`
reads back as the query meant, in one order, so one query is one URL; a list repeats its parameter,
so a comma stays part of a filter value. `ListQuery` and `GetQuery` type the query from the server's
definitions, with nothing generated: the declared include paths and sorts, the filter operators by
field with `or` groups, the fieldsets of each type a response can hold, and `page`, `search`, and
custom parameters only where the definition declares them, so what the server would answer with a
400 fails to compile. `pageCursors` and `cursorOf` read the Cursor Pagination profile's cursors.
Runs wherever `fetch` does.
