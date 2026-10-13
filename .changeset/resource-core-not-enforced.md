---
'@nizam-os/resource-core': minor
---

A NOT ENFORCED CHECK or foreign key (PostgreSQL 18) no longer reaches clients: the schemas apply no
rule of it, so they accept every value the database stores; it needs no validator and refuses one;
and it derives no error code, so `code` on its key is refused. An unenforced foreign key still
declares a relationship. The definer takes public catalogs of format 3, which carry `enforced`.
