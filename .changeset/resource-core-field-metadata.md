---
'@nizam-os/resource-core': minor
---

Declared resources gain `fields`, the metadata of each public field and relationship for forms,
documentation, and clients: wire type, format, fraction digits, nullability, whether a create must
carry it, the default PostgreSQL applies, the folded limits (numeric bounds as decimal strings,
`patterns` read with the flags `su`), options, an array's elements, the target, filter operators,
sortability, and codec. It is read from the specs the schemas are built from, so a value the
metadata admits is one the schemas accept; validators are not described. A relationship describes
its id, and a `bool` key's ids are `true` and `false`. Over a typed catalog each entry is typed,
with literal names, requiredness, and option labels, and declaring a resource computes none of it.
The new types are `FieldFacts`, `FieldLimits`, `ItemMeta`, and `WireType`.
