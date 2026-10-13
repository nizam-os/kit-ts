---
'@nizam-os/resource-core': minor
'@nizam-os/kysely-resource': patch
---

`@nizam-os/resource-core/server` now holds the runtime contract hosts and workers take:
`ResourceRuntime`, `RuntimeResources`, `Domain`, `ResourceOperations`, `ResourceInput`, and
`ListOptions`, so code given a runtime types it without Kysely or a driver.
`@nizam-os/kysely-resource` re-exports them, so its imports keep working, and its runtime now lists
the declared resource of each behavior as `runtime.resources`, in the order of `options.resources`.
