---
'@nizam-os/resource-core': minor
---

The storage contract suite checks `list` (obligation 5). Five tasks are paged two at a time, each
request walked with `next` and back with `prev`: the declared default sort; every sortable field in
both directions, nulls last, ties broken by the key; every declared operator on a value of its
keyset type, among them an `int8` past 2^53, `timestamptz` values a microsecond apart, an enum that
sorts in the order of its labels, and array elements that need quoting; search in websearch mode; a
cursor that resumes after its row though the row was removed since; the page bounds; and a
partitioned table ordered by its `int8` key. The fixture gains a migration with an enum, an `int4`,
and a generated `tsvector`, and its declarations filter, sort, and search. `StorageListRequest` is
keyset-core's request without relation filters, what a declared resource's keyset definition plans,
so an adapter hands it to `defineKeyset(resource.keyset).plan` as it is.
