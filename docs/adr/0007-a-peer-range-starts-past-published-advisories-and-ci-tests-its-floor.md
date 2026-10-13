# ADR 0007: A peer range starts past its peer's published advisories, and CI tests its floor

- Status: accepted; amended by ADR-0008 (scripts check both rules: the floor jobs with every check,
  the advisories weekly)
- Date: 2026-10-12

## Context

ADR 0005 keeps peer ranges in each package, "chosen for its users", and ADR 0006 says which packages
are peers. Neither says where a range starts or what checks it. A range's floor is a claim to the
application: every release from there on works with the package.

Running each package that declares a peer range on its floor, with one copy of the peer as an
application has, found the claims unchecked (#142):

- `@nizam-os/hono-resource` could not load on its floor, `hono` 4.12.34: `hono/utils/url` exports
  the `tryDecodeURIComponent` it imports from 4.13.0 on.
- `@nizam-os/kysely-resource`'s tests could not run on its floor, `kysely` 0.28.0: they reach PGlite
  through `PGliteDialect`, which 0.29.0 added.
- No CI job ran the Hono packages, `@nizam-os/pg-catalog`, or `@nizam-os/kysely-resource` on their
  floors.
- The Kysely and Hono ranges admitted releases with published advisories, though the families had
  already set floors at a security fix: ban DESIGN's "upstream security floor" for `hono`, and
  keyset ADR 0017 for `drizzle-orm` (CVE-2026-39356).

A package manager enforces a range only as far as it reports a release outside it. pnpm's
`strictPeerDependencies` is false by default; with an application pinned to `hono` 4.13.0 and a
package that peers on `hono >=4.13.7`, pnpm 12.9.1 printed "Issues with peer dependencies found",
exited 0, and linked the package against 4.13.0. npm 7 and later may refuse a tree whose peers
conflict (ADR 0006). A range that admits an affected release does neither: the application keeps it
and hears nothing.

@ref https://pnpm.io/settings/peer-dependencies (strictPeerDependencies, default false) @ref
https://docs.github.com/en/rest/security-advisories/global-advisories (the advisory database the
floors are checked against)

## Decision

- This applies to every peer range a package declares on a package outside the workspace. Workspace
  peers move with the workspace and are tested at its head.
- The floor is the later of two releases: the oldest one the package's typecheck and tests pass on,
  with one copy of the peer, and the first one that no published advisory in GitHub's advisory
  database affects, withdrawn advisories aside. Every advisory counts, whatever its severity and
  whether or not the package calls the affected API: the application runs on the same copy.
- An advisory published later against a release in the range raises the floor to its fix, with a
  `minor` changeset. The package's SPEC and README state the floor and the reason for it, and keep
  the API floor where it explains a dependency.
- Each floor has a CI job beside the others in `.github/workflows/ci.yml`. It installs the floor
  with `pnpm add --save-dev`, uncommitted (ADR 0005), runs the package's typecheck and tests there,
  and is listed in `CI passed`'s `needs` (ADR 0004). Packages that share a peer go on one version
  per step. CONTRIBUTING lists the floors CI runs.

## Consequences

An application on a floor runs what CI ran, and a release with a published advisory is an unmet peer
dependency that its package manager reports. An application pinned below a raised floor upgrades the
peer: within Hono 4 from 4.12 to 4.13, and within Kysely 0.28.

Where the advisories set the floor, it no longer marks the oldest API the package needs, but CI
still runs the tests there, so the package keeps to that release's API.

Nothing yet checks the floors against newly published advisories or checks that every peer range has
a floor job; both are done by review. A script that queries the advisory database for every floor
and reads the floor jobs, run on a schedule and on pull requests, would make both mechanical (#153).
