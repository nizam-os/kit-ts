# ADR 0018: The `kysely` peer range starts past Kysely's published advisories

- Status: accepted
- Date: 2026-10-12

## Context

ADR 0004 gave `@nizam-os/kysely-keyset` the peer range `kysely >= 0.28.0`, the oldest release whose
API the adapter uses, while CI ran its unit tests on 0.28.17. Every release before 0.28.17 is
affected by at least one published high-severity SQL injection advisory:

| Advisory                                                                            | Affected                 | Fixed in |
| ----------------------------------------------------------------------------------- | ------------------------ | -------- |
| GHSA-wmrf-hv6w-mr66 (CVE-2026-32763): unsanitized JSON path keys                    | `>= 0.26.0, <= 0.28.11`  | 0.28.12  |
| GHSA-fr9j-6mvq-frcv (CVE-2026-33442): backslash bypass in MySQL JSON paths          | `>= 0.28.12, <= 0.28.13` | 0.28.14  |
| GHSA-8cpq-38p9-67gx (CVE-2026-33468): backslashes in MySQL `sql.lit`                | `<= 0.28.13`             | 0.28.14  |
| GHSA-pv5w-4p9q-p3v2 (CVE-2026-44635): unsanitized path legs in `.key()` and `.at()` | `>= 0.26.0, < 0.28.17`   | 0.28.17  |

None of them reaches the SQL `paginate` builds. It reads no JSON path, and its two `sql.lit` values,
`' '` and a text search configuration that must match `^[a-z_][a-z0-9_]{0,62}$` (ADR 0011), go to
PostgreSQL (ADR 0009). They reach the application: the adapter runs on the application's own copy of
Kysely, and a range that admits 0.28.0 lets the application keep an affected one. The repository's
other adapters already start their ranges past their peer's published advisories:
`@nizam-os/hono-ban` at Hono's ("upstream security floor", ban DESIGN) and
`@nizam-os/drizzle-keyset` at `drizzle-orm >=0.45.2` (CVE-2026-39356, ADR 0017).

Measured: the adapter's typecheck and its 40 unit tests pass on Kysely 0.28.0 as on 0.28.17, so the
oldest API it needs is still 0.28.0's. Kysely 0.29.0, published five days after 0.28.17, ships both
parts of that release's fix: the query compiler's escaping of JSON path members and the index check
in `.at()`.

@ref https://github.com/advisories/GHSA-wmrf-hv6w-mr66 @ref
https://github.com/advisories/GHSA-fr9j-6mvq-frcv @ref
https://github.com/advisories/GHSA-8cpq-38p9-67gx @ref
https://github.com/advisories/GHSA-pv5w-4p9q-p3v2 @ref
https://github.com/kysely-org/kysely/releases/tag/v0.28.17 @ref
https://github.com/kysely-org/kysely/releases/tag/v0.29.0

## Decision

- `kysely >= 0.28.17` is `@nizam-os/kysely-keyset`'s only peer dependency. This amends ADR 0004,
  which set `>= 0.28.0`; the rest of that decision stands.
- CI's floor job runs the adapter's typecheck and unit tests on 0.28.17, the floor itself.

## Consequences

No release these advisories affect satisfies the adapter's peer range. An application pinned below
0.28.17 gets an unmet peer dependency and upgrades within 0.28. The floor now marks the advisories,
not the oldest API the adapter needs; CI still runs the tests there, so the adapter keeps to APIs
0.28.17 has. An advisory published later against a release in the range raises the floor again,
through a new ADR.
