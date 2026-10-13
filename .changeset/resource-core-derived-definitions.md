---
'@nizam-os/resource-core': minor
---

Every declared resource carries the two definitions a collection endpoint needs. `resource` is the
`@nizam-os/jsonapi-core` resource: the attributes, the relationships, `serialize` for public rows,
the create and update validators of the served operations, and the declared sorts, filters with
their operators, includes, `filter[q]` search, and page bounds; it is built on first read, since it
names each relationship target's type. `keyset` is the `@nizam-os/keyset-core` definition without the
cursor: the same filters and sorts with each column's keyset type, the search column and
configuration, the key `id`, and the default sort, which a server passes to its own
`createDefineKeyset({ cursor })`. Both use the same public names and the same resolved page bounds,
so what `parseQuery` accepts the keyset plans, and both are typed from the declaration: the keyset's
request names exactly the declared sorts and filters, and the resource carries the type, member
names, row, and create and update attribute types.
