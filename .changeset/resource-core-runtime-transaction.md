---
'@nizam-os/resource-core': minor
---

The runtime contract gains `transaction(actor, work)`: `work` receives the domain `as(actor)` gives,
its operations share one transaction, one at a time, and `transaction` resolves to what `work`
resolved to once it committed. A runtime that implements the contract now provides it.
