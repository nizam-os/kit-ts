# ADR 0013: Releases are checked tarballs, staged on npm

- Status: accepted
- Date: 2026-10-18

## Context

The release workflow followed Changesets' recommended setup: on a push to `main` it opened a
"Version Packages" pull request, and on that pull request's merge it ran `changeset publish` with
npm trusted publishing. Since ADR 0012, `main` is written by the export alone, so no pull request
merges here and the workflow could never publish.

What a release must guarantee, in the order a mistake would cost:

1. **Nothing but a package's built code reaches npm.** A tarball holds what `files` and npm's
   defaults let through; a stray file, a test fixture or a secret in `dist/` would be public for
   good, since npm does not allow a version to be republished.
2. **What npm publishes is what was checked.** Checking one build and publishing another, or letting
   a step between them change the tarball, defeats the check.
3. **A leaked CI credential cannot publish.** npm's trusted publishing exchanges the job's OIDC
   token for a short-lived token bound to one repository, workflow and environment, so no long-lived
   token sits in the repository ([trusted publishers](https://docs.npmjs.com/trusted-publishers)).
   npm's staged publishing goes further: a version uploaded by CI stays unpublished until a
   maintainer approves it with two-factor authentication
   ([staged publishing](https://docs.npmjs.com/staged-publishing)). npm recommends both.

Changesets now packs and publishes in separate steps: `changeset pack --out-dir` writes each
package's tarball and a `publish-plan.json` naming each tarball by its SHA-256, for CI pipelines
that split building from publishing ([CLI](https://changesets.dev/guide/cli#pack)). Its guide
recommends the split and an `id-token` on the publish job alone, and says that staged publishing
does not work with Changesets yet ([automating](https://changesets.dev/guide/automating)).

npm accepts a trusted publisher only for a package it already has
([`npm trust`](https://docs.npmjs.com/cli/v11/commands/npm-trust)), and staging a package it does
not have publishes a public `0.0.0-stage` placeholder. `npm stage publish` needs npm 11.15.0.

## Decision

- **The version commit is made where the kit is developed.** `changeset version` runs there and the
  commit reaches this repository with the next export. A release is a push to `main` whose
  `package.json` versions npm lacks. A package at `0.0.0` was never versioned and is not released.
- **The release workflow gates on CI of the same commit.** `release.yml` runs `ci.yml` as a reusable
  workflow; nothing is packed from a commit that fails it. `ci.yml` no longer runs on pushes by
  itself.
- **The pack job checks every tarball before anything can publish.** `pnpm run release:pack` runs
  `changeset pack` and refuses the release when a tarball (`scripts/release/`):
  - is not a plain gzipped ustar archive of regular files and directories under `package/`;
  - holds a file other than `package.json`, `README.md`, `LICENSE`, `CHANGELOG.md` or one under
    `dist/`, or lacks one of the first four or `dist/`;
  - has a `package.json` naming another package or version, marked private, without a license, with
    a dependency that is not a semver range (a `workspace:`, `catalog:` or other protocol would
    install differently, or not at all, outside this repository), with bundled dependencies, an
    install script, a `repository` other than this one with the package's directory, or a
    `publishConfig` that sets anything but public access and provenance;
  - differs from the SHA-256 `changeset pack` recorded;
  - would go to a dist-tag other than `latest` as a release, or to `latest` as a prerelease outside
    pre mode;
  - lacks a changelog section for its version;
  - holds anything gitleaks finds with its default rules, no allowlist comment counted.

  It then writes `release.json`, which names each tarball by its SHA-512, and passes the manifest's
  SHA-256 and the artifact's id to the next jobs.

- **The publish job publishes exactly those bytes.** It runs in the `npm` environment, which a
  maintainer approves, downloads the artifact by id, checks the manifest against its digest and each
  tarball against the manifest, and installs nothing: its scripts use Node's built-in modules only.
  npm runs with a configuration of the job's own, none of the runner's `npm_config_*` variables, and
  `--ignore-scripts`. Before running npm, it reads every package from the registry and stops without
  publishing anything when a version npm holds has other content, or a first publish has no token.
- **Every version npm has a package for is staged** with trusted publishing, which is configured
  with `--allow-stage-publish` and without `--allow-publish`, so the OIDC token can only stage.
  Provenance is attached. A maintainer approves each staged version on npmjs.com with two-factor
  authentication.
- **A package's first version is published with a bootstrap token**: a granular token the maintainer
  creates for that release and stores in the `npm` environment, then revokes once the new package
  has its trusted publisher and "Require two-factor authentication and disallow tokens".
- **Tags and GitHub releases follow npm.** Once npm serves every version with the manifest's
  integrity, the workflow tags the commit `<name>@<version>` and creates one immutable GitHub
  release per package with its changelog section, none marked latest. A run that stops is rerun;
  each job picks up where it stopped.
- **One release runs at a time**, never cancelled.

## Consequences

- No pull request is opened here for a release. A version goes live after two approvals by a
  maintainer: the deployment to `npm` on GitHub, and the staged version on npm with two-factor
  authentication. A package's first version goes live with the deployment's approval alone.
- A credential stolen from a release run can stage a version, which goes nowhere without a
  maintainer's approval; it cannot publish one.
- A new package needs a short-lived token for its first release, and its trusted publisher set up by
  hand afterwards (CONTRIBUTING, "Releases").
- A version left staged past the release run's wait (an hour) needs its GitHub release job rerun
  after the approval.
- When Changesets supports staged publishing, its publish command can replace `publish.ts` if it
  keeps the checks of the published bytes.
