# ADR 0008: Scripts check the peer floors: the jobs with every check, the advisories weekly

- Status: accepted
- Date: 2026-10-12

## Context

ADR 0007 set two rules for every peer range on a package outside the workspace: the floor starts
past the peer's published advisories, and a CI job runs the package's typecheck and tests on it. It
left both to review (#153), and review had already missed each: `@nizam-os/kysely-keyset`'s floor was
set below a published advisory, `@nizam-os/hono-ban`'s fell behind advisories published the day after
it was set, and `@nizam-os/pg-catalog`'s and `@nizam-os/kysely-resource`'s had no job (#142).

The two checks need different things:

- Whether a floor has its job follows from files alone: the floor is the lowest version the range
  admits, and a floor job is `pnpm --filter <package>... add --save-dev <peer>@<version>` followed
  by the package's `typecheck` and `test`. Nothing outside the repository changes the answer, so it
  can run with every other check.
- Whether an advisory affects a floor changes without a commit. GitHub's REST API lists the advisory
  database with `affects=<package>@<version>`, matched against each advisory's vulnerable ranges on
  GitHub's side. Its `type` defaults to `reviewed`, which leaves out malware advisories, the ones
  that mark a compromised release: `affects=chalk@5.6.1` finds GHSA-2v46-p5h4-248w only with
  `type=malware`. A scheduled workflow runs on the default branch, notifies the user who last
  changed its cron syntax when it fails, and in a public repository is disabled after 60 days
  without activity.

Measured on this repository: the job check maps each of the ten floors to its job, and fails on four
changes to `ci.yml` (kysely-keyset left on another Kysely beside kysely-resource, the Hono job on
4.13.6, a dropped test step, an install after the tests). The advisory check finds nothing on the
ten floors, and finds GHSA-pv5w-4p9q-p3v2 on kysely 0.28.16, the four advisories fixed in 4.13.5 and
4.13.7 on hono 4.13.0, GHSA-gpj5-g38j-94v9 on drizzle-orm 0.45.1, and the malware advisory on chalk
5.6.1.

@ref
https://docs.github.com/en/rest/security-advisories/global-advisories#list-global-security-advisories
@ref
https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule

## Decision

- Both checks live in `scripts/peer-floors/`: TypeScript that Node runs through type stripping, with
  `semver` for the floors and `yaml` for the workflow as root development dependencies, and unit
  tests in the root Vitest config's `scripts` project.
- `pnpm check:floors` finds, for each floor, a job in `.github/workflows/ci.yml` whose steps install
  `<peer>@<floor>` for the package and then run its `typecheck` and `test`, while every workspace
  package it builds on that peers on the same package is on that version. It is part of `pnpm check`
  and of CI's quality job, so a peer range without a floor job fails both.
- `pnpm audit:floors` finds no reviewed or malware advisory in GitHub's advisory database, withdrawn
  ones aside, that affects a floor, with `GITHUB_TOKEN` when it is set. It runs in
  `.github/workflows/peer-floors.yml` weekly, on demand, and on pull requests that change a package
  manifest, the workspace file, or the scripts. It is not part of `CI passed` (ADR 0004): an
  advisory published today must not block unrelated pull requests, and the failed weekly run
  notifies.
- A floor job keeps the form the check reads: one pnpm command per line, packages filtered by name.

## Consequences

A new advisory against a floor surfaces within a week, and the fix raises the floor (ADR 0007). A
floor job's command form is now a contract with the check, which names the floor it cannot find. The
weekly run reports only through GitHub's notification, and stays enabled only while the repository
has activity.
