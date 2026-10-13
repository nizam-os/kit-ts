---
'@nizam-os/kysely-keyset': minor
---

Requires `kysely` 0.28.17 or later, the first release past Kysely's published SQL injection
advisories (GHSA-wmrf-hv6w-mr66, GHSA-fr9j-6mvq-frcv, GHSA-8cpq-38p9-67gx, GHSA-pv5w-4p9q-p3v2).
None of them reaches the queries the adapter builds, but the adapter runs on the application's own
copy of Kysely, so its peer range no longer admits an affected release. An application on an earlier
0.28 release upgrades within 0.28.
