---
'@nizam-os/hono-resource': minor
---

Serve the Atomic Operations endpoint at `<base>/operations` when a resource declares a write. A
request's operations run in one `runtime.transaction` as its actor: `add` is `create`, `update` is
`update`, `remove` is `remove`, and an `update` of a `readWrite` relationship is `update` with that
relationship alone. They commit together, or the first failure rolls every one back and points at
the operation that failed, inside its data where the runtime pointed into the input, a constraint
violation mapped once the transaction ended included. An `href` names a collection, a resource, or a
relationship link of the routes. `jsonApi()` must list `ATOMIC_OPERATIONS_EXTENSION`, and the
runtime must implement `transaction`.
