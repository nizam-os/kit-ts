---
'@nizam-os/jsonapi-core': minor
---

Every definition now carries, in types only, what a client reads and writes:
`TypesOf<typeof Articles>` holds the attributes as the JSON `serialize` produces (a `Date` arrives
as a string, an attribute that may be `undefined` is optional), each relationship's type and
cardinality, the filter operators, the include paths, whether the resource takes sparse fieldsets,
paginates, and has a search parameter, the validators' inputs for a create and an update, and the
fields each write takes. `defineResource` infers it from the definition as written, so a typed
client follows every edit with nothing generated. The member, `'~types'`, is never present at
runtime, and `serialize` still rejects a field the definition does not declare.

`ResourceDefinition` takes the client types as a ninth, optional type parameter, and
`ResourceDefinitionInit` now takes the init's own member types: the relationships, query,
validators, and writable lists as written. `JsonOf`, `ResourceTypes`, `TypesOf`, and
`ClientRelationship` are exported.
