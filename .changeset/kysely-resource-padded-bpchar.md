---
'@nizam-os/kysely-resource': patch
'@nizam-os/resource-core': patch
---

The Kysely storage adapter reads a `char(n)` member, key, or relationship padded to n, as PostgreSQL
prints it and as its read form and `schema.id` spell it. A cast to text had stripped the padding, so
a stored `'ab  '` read as `ab`, while an array of `char(n)` kept it. The storage contract's fixture
gains `labels`, keyed by a `char(4)` client id, and gives `tasks` a `char(4)` code and a
relationship to a label, so the contract suite fails an adapter that strips the padding or reads a
null one as the empty string.
