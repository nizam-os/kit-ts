---
'@nizam-os/resource-core': minor
---

A declared resource's `resource` now carries its client types, so
`TypesOf<typeof Contacts.resource>` from `@nizam-os/jsonapi-core` holds the read types as JSON
attributes, each relationship's target type, the filter operators and includes by public name, that
it takes sparse fieldsets, whether the declaration has `search`, the create and update validators'
inputs (`never` for an operation it does not serve), the members each write holds, and `clientIds`.
Types only: nothing changes at runtime.
