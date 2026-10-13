---
'@nizam-os/kysely-resource': minor
---

Add `checkResourceRuntime` and `createResourceRuntime`. Both check the composition against the full
catalog `pg-catalog extract` writes: behaviors keyed by their types, the scope bindings, the
resources that run without a scope, includable targets, quotas, the outbox table, and row security
policies that read each scope's parameter for every command the operations run, with warnings for
unserved sorts and for unique indexes that leave the scope out. `checkResourceRuntime` runs them
without a connection, for CI. `createResourceRuntime` also refuses a role that is a superuser, has
`BYPASSRLS`, or owns a scoped table without `FORCE ROW LEVEL SECURITY`, and rejects with a
`BootError` listing every problem. Otherwise it resolves to a runtime whose `as(actor)` returns the
domain, typed by the behaviors.
