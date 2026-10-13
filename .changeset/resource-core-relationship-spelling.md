---
'@nizam-os/resource-core': patch
---

`declareResource` refuses a relationship whose foreign key spells ids unlike the key it references,
at compile time and with a `TypeError`: a `char(n)` of another length, a `numeric` of another scale,
a `float8` to a `real`, or a string type to a `char(n)`. PostgreSQL takes such a foreign key, but
the relationship reads as its column's text, so its linkage would not name the target's id as the
target spells it, and an include would return targets the document's linkage does not identify. The
integers spell alike, as do `text` and `varchar`.
