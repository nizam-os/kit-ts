---
'@nizam-os/resource-core': minor
---

A resource id now takes every spelling its key's write form takes and is output in the spelling the
server sends: `schema.id` and `validate.id` give a `uuid` in lower case, a `timestamp` with `T` and
its shortest fraction, a `timestamptz` in UTC with `Z`, a `numeric(p, s)` with s fraction digits, a
`bpchar(n)` padded to n characters, and a `real` as PostgreSQL prints it, so the ids a server sends
compare as text. Look a URL's id up with `schema.id`'s output. A `citext` key, a `numeric` key
without a scale, and a `bpchar` key without a length keep the text sent, since their values compare
more coarsely than any spelling. The JSON:API resource carries `validate.id` for every declaration,
so an update whose document spells the URL's key another way is no conflict.
