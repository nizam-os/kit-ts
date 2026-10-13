---
'@nizam-os/keyset-core': minor
'@nizam-os/kysely-keyset': minor
---

Cursors can be bound to a context the server supplies, such as the tenant a query is scoped to.

- `plan(request, { context })` in `@nizam-os/keyset-core` and
  `paginate(query, request, { context })` in `@nizam-os/kysely-keyset` take named strings, numbers,
  bigints, booleans, or `null`. A cursor issued under one context is rejected under another, or
  under none, with `InvalidCursorError` (reason `context`) before any query runs.
- Requests without a context bind exactly as before, so existing cursors keep working and the cursor
  format version stays 1.
