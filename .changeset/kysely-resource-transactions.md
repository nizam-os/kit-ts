---
'@nizam-os/kysely-resource': minor
---

Add `@nizam-os/kysely-resource`, the Kysely runtime for resource declarations on PostgreSQL.
`createKyselyStorage` checks its options at startup and runs each operation in one READ COMMITTED
transaction whose first statement fixes how values print and sets every scope's session parameter
for that transaction only, so a pooled connection carries nothing into the next transaction. A
statement that failed fails the transaction even when the operation caught its error and went on.
