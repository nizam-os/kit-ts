---
'@nizam-os/kysely-resource': minor
---

`relayOutbox({ db, outbox, deliver, limit })` delivers the events operations recorded, once their
transactions have committed. Each run is one READ COMMITTED transaction that claims the oldest
`limit` rows (100 by default) with `FOR UPDATE SKIP LOCKED`, hands them to `deliver` in position
order, and deletes them, so several relays can drain one outbox side by side. When `deliver`
rejects, the events stay for the next run: delivery is at least once, and consumers deduplicate by
`position`. `OutboxEvent` and `RelayOptions` are exported.
