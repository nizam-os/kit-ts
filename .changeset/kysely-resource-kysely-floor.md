---
'@nizam-os/kysely-resource': minor
---

Requires `kysely` 0.29.0 or later. The tests run every query against PGlite through Kysely's
`PGliteDialect`, which 0.29.0 added, so 0.29.0 is the oldest release they prove the runtime on, and
CI now runs them there.
