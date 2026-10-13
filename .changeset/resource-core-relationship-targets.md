---
'@nizam-os/resource-core': minor
---

`relationshipTargets(resource, write, { pointer })` from `@nizam-os/resource-core/server` lists the
rows a create or an update references, each with the error its foreign key's code makes for a
missing row. PostgreSQL checks foreign keys without row security, so a runtime looks each target up
in the actor's scope and answers one the actor cannot see exactly as a missing one, which keeps a
write from referencing another tenant's row or learning which ids it holds.
`contractFixture.catalog` from `@nizam-os/resource-core/testing` is now typed as the extracted
catalog, so a test can declare its own resources over it.
