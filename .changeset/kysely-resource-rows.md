---
'@nizam-os/kysely-resource': minor
---

The Kysely storage reads and writes rows: `get`, `lock`, `create`, `update`, `remove`, `count`,
`record`, and `partitionRoot`. A create inserts only the members present, so column defaults fill
the rest, and an update sets only the members present. Every value travels as text cast to its
column's type and comes back in the exact read form of its type, through the storage codec for a
codec field; a stored value outside every read form fails the read instead of changing. `lock` takes
the row lock its write needs, `count` locks its quota per scope value, and `record` writes events to
the outbox table in the operation's transaction.
