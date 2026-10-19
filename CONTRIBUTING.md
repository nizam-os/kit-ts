# Contributing

Thanks for helping. This repository holds every `@nizam-os` package, grouped in families: ban
(`@nizam-os/ban-core`, `@nizam-os/hono-ban`), catalog (`@nizam-os/catalog-core`,
`@nizam-os/pg-catalog`), intl (`@nizam-os/intl-core`, `@nizam-os/paraglide-intl`), jsonapi
(`@nizam-os/jsonapi-core`, `@nizam-os/hono-jsonapi`, `@nizam-os/jsonapi-client`,
`@nizam-os/tanstack-query-jsonapi`), keyset (`@nizam-os/keyset-core`, `@nizam-os/kysely-keyset`,
`@nizam-os/drizzle-keyset`), and resource (`@nizam-os/resource-core`, `@nizam-os/kysely-resource`,
`@nizam-os/hono-resource`, `@nizam-os/resource-ui`, `@nizam-os/tanstack-form-resource`). This guide
covers what every family shares: setup, the quality gates, the conventions, commits, changesets, and
releases. Each family adds its own guide with its layout, extension points, constraints, and
checklist:

- [`docs/ban/CONTRIBUTING.md`](docs/ban/CONTRIBUTING.md)
- [`docs/catalog/CONTRIBUTING.md`](docs/catalog/CONTRIBUTING.md)
- [`docs/intl/CONTRIBUTING.md`](docs/intl/CONTRIBUTING.md)
- [`docs/jsonapi/CONTRIBUTING.md`](docs/jsonapi/CONTRIBUTING.md)
- [`docs/keyset/CONTRIBUTING.md`](docs/keyset/CONTRIBUTING.md)
- [`docs/resource/CONTRIBUTING.md`](docs/resource/CONTRIBUTING.md)

Design intent lives in each family's `DESIGN.md`, the normative contract in its `SPEC.md`, and
decisions in its `adr/`; read those before proposing API changes. Decisions about the repository
itself are in [`docs/adr/`](docs/adr).

This repository is a mirror. The kit is developed as one tree of the Nizam suite's repository and
exported here after each merge, history included; this repository's `pnpm-workspace.yaml` and
`pnpm-lock.yaml` are written by the export. Pull requests are welcome here: they are reviewed here,
land in the suite's repository, and arrive with the next export rather than through a merge commit
of their own.

## Prerequisites

- Node.js 24 (see `.node-version`; Node 22.12+ is supported at runtime and in CI)
- pnpm 12 (`corepack enable` or `npm install -g pnpm@12`; the exact version is pinned in
  `package.json` `packageManager`)
- `bun` and `deno` for `pnpm test:runtimes` (optional locally; CI installs both)
- a PostgreSQL server for `e2e/keyset/postgres.e2e.test.ts` (optional locally; the file skips itself
  without `KEYSET_PG_URL`, and CI runs it against PostgreSQL 14 and 18)
- a PostgreSQL server whose role has `CREATEDB` for the catalog's server tests (optional locally;
  they skip themselves without `CATALOG_PG_URL`, and CI runs them against PostgreSQL 14 and 18)

## Setup

```bash
git clone https://github.com/nizam-os/kit-ts.git
cd kit-ts
pnpm install
```

`pnpm install` also installs the git hooks (lefthook): formatting and linting run on commit, types
and tests run on push. Run `pnpm build` once before `pnpm check`: the type-aware lint of `e2e/*` and
the package checks (`publint`, `attw`) read `dist/`. The packages themselves need no build between
edits: a binding resolves its core from source through the `source` condition of the core's
`exports` map, enabled only in the binding's `tsconfig.json` and its Vitest project; everything
else, `e2e/*` included, resolves `dist/`.

## Scripts

| Script                     | What it does                                                           |
| -------------------------- | ---------------------------------------------------------------------- |
| `pnpm check`               | Runs every `check:*` script below, in order                            |
| `pnpm check:deps`          | `knip`: unused files, exports, dependencies                            |
| `pnpm check:floors`        | Each peer range's floor has a CI job that tests the package on it      |
| `pnpm check:format`        | `oxfmt --check`                                                        |
| `pnpm check:lint`          | `oxlint` with type-aware rules                                         |
| `pnpm check:pkg`           | `publint` and `arethetypeswrong` against each built package            |
| `pnpm check:types`         | `tsc --noEmit` for the root configs and scripts, and each package      |
| `pnpm audit:floors`        | No published advisory affects a floor (queries GitHub; weekly in CI)   |
| `pnpm test`                | Vitest over every package, including type tests in `*.test-d.ts`       |
| `pnpm test:coverage`       | Vitest with V8 coverage over every package; thresholds are enforced    |
| `pnpm test:e2e`            | Build, then type-check and run each `e2e/*` package against the builds |
| `pnpm test:runtimes`       | Build, then run each family's smoke test on Bun, Deno, and workerd     |
| `pnpm build`               | tsdown for each package: ESM, declarations, updates its `exports`      |
| `pnpm format` / `lint:fix` | Apply formatting / autofixable lint fixes                              |

CI runs the same commands, plus these packages' tests on the floors of their peer ranges:
`@nizam-os/kysely-keyset` on Kysely 0.28.17, `@nizam-os/kysely-resource` on Kysely 0.29.0,
`@nizam-os/drizzle-keyset` on drizzle-orm 0.45.2, `@nizam-os/resource-core` on Zod 4.5.0,
`@nizam-os/tanstack-query-jsonapi` on TanStack Query's core 5.89.0,
`@nizam-os/tanstack-form-resource` on TanStack Form's core 1.17.0, `@nizam-os/hono-ban`,
`@nizam-os/hono-jsonapi`, and `@nizam-os/hono-resource` on Hono 4.13.7, `@nizam-os/pg-catalog` on
PGlite 0.5.0, and `@nizam-os/paraglide-intl` on Paraglide JS 2.11.0. It also runs the keyset e2e
suite on a PostgreSQL server, and `@nizam-os/pg-catalog`'s tests and the catalog e2e suite on
PostgreSQL servers. A pull request must be green on all of them: the last CI job, `CI passed`, needs
every other job and is the one status a pull request shows
([ADR 0012](docs/adr/0012-main-is-written-by-the-export-alone.md)), so a new CI job goes into its
`needs` list. To work on one package or family, filter by name:

```bash
pnpm --filter @nizam-os/keyset-core test
pnpm --filter @nizam-os/kysely-keyset exec vitest run paginate
pnpm --filter @nizam-os/keyset-e2e exec vitest run cursors        # after pnpm build
KEYSET_PG_URL=postgres://postgres:postgres@localhost:5432/postgres pnpm --filter @nizam-os/keyset-e2e exec vitest run postgres
CATALOG_PG_URL=postgres://postgres:postgres@localhost:5432/postgres pnpm --filter @nizam-os/pg-catalog test
```

## Conventions

- **Every behavior traces to a source.** The specification a family implements (JSON:API 1.1 and its
  profiles and extensions, RFC 9457, the Cursor Pagination profile), the PostgreSQL manual, the host
  library's documentation, and the RFCs they lean on are the sources. Add an `@ref <url>` comment
  next to the decision it justifies, and name the clause in the test. Where a source leaves a choice
  to the implementation, the choice is recorded in the family's `SPEC.md` and an ADR, never only in
  code.
- **A core knows no host.** Nothing under `packages/<thing>-core/` imports a framework, a query
  builder, or a driver; what needs one lives in the binding (`packages/<host>-<thing>/`) and calls
  the core. The core types a host's objects structurally or as a type parameter, never as a concrete
  framework type.
- **Tests are colocated.** `foo.ts` has `foo.test.ts` next to it, and `foo.test-d.ts` when the types
  are part of the contract. New behavior ships with tests; bug fixes ship with a failing test first.
  Coverage thresholds are enforced on the combined source of every package.
- **End-to-end tests live in `e2e/<family>/`.** Each is a private pnpm workspace package that
  depends on its family's packages through `workspace:*`, so its imports resolve through the
  published `exports` maps into `dist/` and its `tsc` run checks the emitted declarations. Never
  import from `src/` there. Run one file with
  `pnpm --filter @nizam-os/<family>-e2e exec vitest run <name>` after `pnpm build`.
- **Runtime smoke tests live in `e2e/<family>/smoke/`.** One module imports the family's packages;
  `run.ts` drives it in-process on Bun and Deno and `workerd.ts` bundles it with tsdown and runs it
  in Miniflare's workerd.
- **Nothing reads `process.env` at module scope.** Behavior is configured through options so every
  package runs on workerd, Deno, Bun, and Node.
- **Client input is hostile.** Names from a request become object keys only through a family's
  prototype-safe helpers or after a prototype-key check; reads of client-shaped objects use
  `Object.hasOwn`; error messages are constant. See `SECURITY.md` for what counts as a
  vulnerability.
- **Files stay small and single-purpose.** One exported concept per file; split rather than add
  section dividers.
- **Type at boundaries, infer locally.** Exports carry explicit types (required by
  `isolatedDeclarations`); locals do not.
- **No `any`, no non-null assertions, `Array<T>` over `T[]`, `??` over `||`.** oxlint enforces
  these.
- **Shared dependency versions live in the catalog.** A dependency that two or more workspace
  packages declare takes its version from the default catalog in `pnpm-workspace.yaml` and is
  referenced as `"name": "catalog:"`. One that a single package uses stays pinned there, and peer
  ranges always stay in the package
  ([ADR 0005](docs/adr/0005-share-dependency-versions-through-a-pnpm-catalog.md)).
- **A peer range starts past its peer's published advisories, and its floor runs in CI**
  ([ADR 0007](docs/adr/0007-a-peer-range-starts-past-published-advisories-and-ci-tests-its-floor.md)).
  The floor of a peer range on a package outside the workspace is the later of the oldest release
  the package's typecheck and tests pass on and the first release no advisory in GitHub's advisory
  database affects. An advisory published later raises it, with a `minor` changeset. The package
  gets a job beside the other floor jobs in `.github/workflows/ci.yml`: it installs the floor, runs
  the typecheck and tests, and is listed in `CI passed`'s `needs`. Workspace packages that share the
  peer go on one version per step, as an application has one copy. `pnpm check:floors` checks the
  jobs and `pnpm audit:floors` the advisories
  ([ADR 0008](docs/adr/0008-scripts-check-the-peer-floors.md)); write a floor step as one pnpm
  command per line with the packages filtered by name, the form the check reads.
- **No emojis** in code, docs, or commit messages.
- **Lint disables carry a reason.** `// oxlint-disable-next-line rule -- reason: <why>`.

## Adding a package

The name follows [ADR 0003](docs/adr/0003-package-naming.md): `<thing>-core` for a core,
`<host>-<thing>` for a binding, `<thing>-<facet>` for a companion. A host published as a
framework-free core plus framework adapters, as TanStack's libraries are, is named for the library
(`tanstack-query`, `tanstack-form`), not for an adapter
([ADR 0010](docs/adr/0010-a-binding-to-a-library-with-a-framework-free-core-binds-the-core.md)).
Open an issue labeled `epic` first so the scope is settled before code exists, then:

1. Copy the closest sibling under `packages/` (`keyset-core` for a core, `kysely-keyset` for a
   binding) to `packages/<name>` and set `name`, `description`, `keywords`, `homepage`, and
   `repository.directory` in its `package.json`. A binding declares its host as a peer dependency
   and depends on its core through `workspace:^`, re-exporting it, unless the application imports
   the core itself and hands the binding values made with it: then the core, and any other workspace
   package the application hands it values from, is a peer too, and a `workspace:^` development
   dependency
   ([ADR 0006](docs/adr/0006-a-binding-takes-the-packages-the-application-hands-it-values-from-as-peers.md)).
   A binding that makes values with one of its host's dependencies and hands them to the host
   imports that dependency from the host's package instead of declaring it
   ([ADR 0009](docs/adr/0009-a-binding-makes-what-it-hands-its-host-with-the-hosts-own-dependency.md)).
   A binding to a host's framework-free core imports no adapter and takes the core as an optional
   peer, importing from it at runtime only the values it hands the library, and its README tells a
   Yarn Plug'n'Play application to list the core at its adapter's release
   ([ADR 0011](docs/adr/0011-a-binding-takes-the-core-an-adapter-brings-as-an-optional-peer.md));
   the family's e2e package type-checks it with each adapter.
2. Keep `tsdown.config.ts` as the one source of the subpaths: `pnpm build` writes the `exports` maps
   into `package.json`, and CI fails on a diff. Name the Vitest project after the package.
3. Add the package's re-export-only files, if any, to the coverage `exclude` list in the root
   `vitest.config.ts`.
4. Add it to the family's e2e package: a `package-surface` entry listing its exports, a feature file
   that drives it against a real host, and the smoke module. A new family gets a new `e2e/<family>`
   package, named in the `e2e` job's `family` matrix in `.github/workflows/ci.yml`, and a
   `docs/<family>` directory, copied from a sibling.
5. Document it: the family `README.md`, `DESIGN.md`, `SPEC.md`, an ADR, a bullet under its family in
   the root `README.md` (a new family adds a section there), and the package dropdown in
   `.github/ISSUE_TEMPLATE/feature_request.yml`.
6. Add a `minor` changeset for its first release. npm has no trusted publisher for a package it does
   not have yet, so a maintainer publishes its first version with a bootstrap token
   ([Releases](#releases), "A package's first version").

## Commits and pull requests

- Use conventional commit subjects with the family or package as the scope:
  `feat(keyset): add the overlaps operator`, `fix(hono-ban): preserve HTTPException headers`. Types:
  `feat`, `fix`, `refactor`, `perf`, `test`, `docs`, `chore`, `build`, `ci`.
- Keep pull requests focused: one epic, or a few related issues, per pull request, with one commit
  per issue. Each commit passes `pnpm check`, `pnpm test`, and the family's e2e suite on its own,
  carries its own changeset, and ends with `Closes #<issue>`. Describe the why in the body.
- A pull request is not merged here: `main` is written by the export alone
  ([ADR 0012](docs/adr/0012-main-is-written-by-the-export-alone.md)). Once it is approved, a
  maintainer applies its commits where the kit is developed, with you as their author, and closes it
  with a link to the exported commit.
- Every user-visible change needs a changeset (next section). CI fails without one on
  `packages/*/src` changes. A source change users cannot see, such as a comment, a lint directive,
  or a test, takes an empty one: `pnpm changeset add --empty`.

## Changesets and releases

Every user-visible change is described by a [Changesets](https://github.com/changesets/changesets)
entry.

1. In your branch run `pnpm changeset`, pick the package or packages that change, and pick `patch`,
   `minor`, or `major` for each. Write the entry for users, not for maintainers: what changed and
   what they have to do. The packages are versioned independently; a core change that a binding only
   passes through needs no entry for the binding (Changesets bumps its dependency range on its own).
2. Commit the generated file under `.changeset/`.

For a prerelease line, a maintainer runs `pnpm changeset pre enter <tag>` and commits the resulting
`.changeset/pre.json`; releases then go to that npm dist-tag instead of `latest` until
`pnpm changeset pre exit` is committed.

### Releases

A maintainer releases ([ADR 0013](docs/adr/0013-releases-are-checked-tarballs-staged-on-npm.md)):

1. `changeset version`, where the kit is developed, turns the pending changesets into each affected
   package's new version and `CHANGELOG.md` section. The version commit reaches `main` here with the
   next export.
2. That push runs the release workflow (`.github/workflows/release.yml`). It runs CI on the commit,
   then `pnpm run release:pack`: `changeset pack` packs every public package whose version npm does
   not have, and each tarball must hold only `package.json`, `README.md`, `LICENSE`, `CHANGELOG.md`
   and `dist/`, carry a `package.json` that installs the same anywhere, go to the right dist-tag,
   have a changelog section for its version, and pass a gitleaks scan. The job writes
   `release.json`, which names each tarball by its SHA-512. A package at `0.0.0` was never versioned
   and is left out.
3. The maintainer approves the run's deployment to the `npm` environment. The publish job checks the
   tarballs against the manifest and asks npm whether the trusted publisher of each package it would
   stage accepts the workflow; when one does not, it stops before staging anything and names the
   package. Then it stages each version on npm through its trusted publisher, with provenance.
   Nothing is public yet.
4. The maintainer approves each staged version with two-factor authentication: the package's Staged
   Packages tab on npmjs.com, or `npm stage approve <stage id>` (the job summary lists the ids).
5. Once npm serves every version, the workflow tags the commit `<name>@<version>` and creates one
   GitHub release per package with its changelog section. It waits an hour for the approvals; after
   a later approval, rerun its failed job.

`pnpm run release:pack --out-dir <empty directory>` shows what a release would pack and runs every
check on it; it publishes nothing. It needs `gitleaks` on the `PATH`.

#### A package's first version

npm accepts a trusted publisher only for a package it already has, and staging a package it does not
have publishes a public `0.0.0-stage` placeholder. So the publish job publishes a new package's
first version directly, with a bootstrap token, and stops before publishing anything when it finds a
new package and no token. The maintainer, with two-factor authentication on their npm account:

1. Creates a granular access token on npmjs.com with read and write access to the `@nizam-os` scope
   only, the shortest expiry that covers the release, and "Bypass two-factor authentication"
   checked: npm leaves it unchecked, and the publish job cannot answer a two-factor challenge.
   Stores it in the environment (`gh secret set NPM_BOOTSTRAP_TOKEN --env npm`).
2. Approves the release run's deployment. Packages npm already has are staged as above.
3. Once the new package is on npm, sets its publishing access to "Require two-factor authentication
   and disallow tokens", in its settings on npmjs.com or with
   `npm access set mfa=publish @nizam-os/<name>`.
4. Revokes the token on npmjs.com and deletes the secret
   (`gh secret delete NPM_BOOTSTRAP_TOKEN --env npm`).

Until its next release, nothing can publish the package without a maintainer's two-factor
authentication. Its trusted publisher comes with that release: one configured now would expire
first.

#### A package's trusted publisher

npm expires a trusted publisher configuration that has not completed a successful publish within 2
days of its creation ([trusted publishing](https://docs.npmjs.com/trusted-publishers)). So the
maintainer configures a package's trusted publisher, which may only stage, at most 2 days before the
release that first stages the package, its second version:

```sh
npm trust github @nizam-os/<name> --file release.yml --repo nizam-os/kit-ts --env npm --allow-stage-publish --yes
```

Staging that release's version and approving it, both within the 2 days, validates the
configuration, which then stays; npm does not say which of the two does.
`npm trust list @nizam-os/<name>` shows a package's configurations; one that expired unused is
revoked (`npm trust revoke @nizam-os/<name> --id=<id>`) and configured again. The publish job asks
npm about every package it would stage before it stages anything, so a missing or expired trusted
publisher stops the release before it starts, with the package's name.

## Architecture decisions

Anything that changes a package's public API, a wire or cursor format, a choice its specification
leaves open, the runtime or database support matrix, or a dependency gets an ADR in the family's
`docs/<family>/adr/`. Anything that changes the repository (layout, naming, shared tooling, the
release process) gets one in `docs/adr/`. Copy the directory's `0000-template.md`, number it, and
link it from the PR.

## Reporting bugs and requesting features

Use the issue templates. For security issues follow `SECURITY.md`; do not open a public issue.
