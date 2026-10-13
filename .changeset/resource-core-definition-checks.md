---
'@nizam-os/resource-core': minor
---

`declareResource` refuses a declaration whose derived keyset or JSON:API definition
`@nizam-os/keyset-core` or `@nizam-os/jsonapi-core` would refuse, in types and at runtime. A `filter`
lists at least one operator, each once. The public name of a member that filters or sorts is a
keyset-core field name (ASCII letters, digits, `_`, and `-`), and a filtered member is not named
`or`, nor `q` when the resource has `search`. `sort.default` names each field once. A search
configuration is an unqualified name keyset-core accepts, such as `english`. The primary key has a
type keyset-core can order pages by. Each mistake fails `tsc` at the option and throws `TypeError`
naming it, such as
`notes.fields.size.filter: public name "größe" is outside @nizam-os/keyset-core's field names (^[A-Za-z0-9][A-Za-z0-9_-]*$)`.
Declarations that filter or sort by a member named with a letter outside ASCII, or that list
`filter: []`, no longer compile; give the member `as` or drop the empty list.
