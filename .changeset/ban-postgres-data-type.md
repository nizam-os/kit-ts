---
'@nizam-os/ban-core': minor
'@nizam-os/hono-ban': minor
---

`readPostgresFields` returns `dataType`, the domain named by a violated domain constraint
(PostgreSQL error field `d`), read from `dataType` or postgres.js's `data type_name`. A field that
is not a string, such as the number Bun puts on `column` when the server sent none, reads as
undefined.
