---
'@nizam-os/kysely-resource': minor
---

`runtime.transaction(actor, work)` runs every operation of the domain `work` receives in one
transaction with the actor's scopes, one at a time. It commits when `work` resolves and no operation
failed, handing every event to `afterCommit` once. The first failure ends the transaction at once,
rolled back with its locks released. Its call rejects with what it threw, every later call rejects
with a `TypeError`, and `transaction` rejects with the failure mapped as the operation alone maps
it, or with what `work` rejected with when that is another value.
