---
'@nizam-os/resource-core': minor
---

A unique index that no constraint backs derives an error code like a UNIQUE constraint, partial or
not, and takes `code` in `rules`: `contacts_active_name_unique` on `(organization_id, name)` where
`status = 'active'` gives a 409 `unique` entry that points at `name`. The definer takes public
catalogs of format 2, which `@nizam-os/pg-catalog` extracts with the unique indexes in them; a full
catalog still fails `tsc` with the message that asks for the public catalog.
