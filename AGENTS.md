# Nizam Kit: instructions for coding agents

This file is read by AI coding agents working in this repository. Humans: see `CONTRIBUTING.md`.
Each family adds its own rules in `docs/<family>/AGENTS.md`, which the `CLAUDE.md` of every package
and e2e directory imports; read the family's file before changing that family.

## Ground rules

- Read the family's `docs/<family>/DESIGN.md` for intent and `docs/<family>/SPEC.md` for the exact
  contract before changing public API. Implement from the SPEC section named in the file header;
  update the SPEC in the same PR when the code must differ. Read the relevant ADR (the family's
  `docs/<family>/adr/`, or `docs/adr/` for the repository) before changing a decision it records;
  add a new ADR instead of silently reversing one.
- Spec-driven, not memory-driven. Every behavior comes from the specification the family implements,
  the PostgreSQL manual, the host library's documentation, or an RFC. Fetch the clause, cite it in
  the code with an `@ref <url>` comment next to the decision it justifies, and name it in the test.
  Where a source leaves a choice to the implementation, the choice is written down in the family's
  `SPEC.md` and an ADR.
- Run the gates after every meaningful change, not at the end: `pnpm check:types`,
  `pnpm check:lint`, then `pnpm test` (every package; a binding resolves its core from source
  through the `source` export condition, so no build is needed between edits). Run `pnpm build`,
  `pnpm check`, and `pnpm test:e2e` before declaring done, in that order: the type-aware lint of
  `e2e/*` and the package checks read `dist/`, and the e2e suites are the only checks that exercise
  `dist/`, the published `exports` maps, and a real host (HTTP, a database). `pnpm test:runtimes`
  (Bun, Deno, workerd smoke) needs `bun` and `deno` installed; CI runs it. Filter by package name to
  work on one: `pnpm --filter @nizam-os/<name> test`.
- Tests are colocated (`x.test.ts`, `x.test-d.ts`) and cover behavior, not implementation. A test
  earns its place by pinning a clause of the source, a choice recorded in the SPEC, or a regression.
  Coverage thresholds are enforced on the combined source of every package; do not lower them.
- A core knows no host. Nothing under `packages/<thing>-core/` imports a framework, a query builder,
  or a driver, not even types; what needs one lives in the binding, `packages/<host>-<thing>/`, and
  calls the core by package name.
- Client input never becomes an object key without a check, every lookup into client-shaped data
  goes through the family's prototype-safe helpers, and error messages are constant: request data
  goes into structured fields, never into `message`.
- No `process.env` at module scope, no Node-only APIs in `src/` (web standards only), no enums or
  parameter properties (`erasableSyntaxOnly`), no `any`, no `T[]`, no emojis. The two exceptions to
  web standards only are build-time tools: `@nizam-os/pg-catalog`, which reads files and drives
  PostgreSQL (`docs/catalog/adr/0002-a-database-free-core-and-a-postgresql-binding.md`), and
  `@nizam-os/paraglide-intl`, which compiles Paraglide messages
  (`docs/intl/adr/0002-a-framework-free-core-and-a-paraglide-binding.md`); both still read no
  environment at module scope.
- A dependency that two or more workspace packages declare takes its version from the default
  catalog in `pnpm-workspace.yaml` (`"zod": "catalog:"`); peer ranges stay in each package
  (`docs/adr/0005-share-dependency-versions-through-a-pnpm-catalog.md`). Each floor is past its
  peer's published advisories, and a CI job runs the package's typecheck and tests on it
  (`docs/adr/0007-a-peer-range-starts-past-published-advisories-and-ci-tests-its-floor.md`);
  `pnpm check:floors` and `pnpm audit:floors` check both
  (`docs/adr/0008-scripts-check-the-peer-floors.md`).
- One pull request per epic (or a few related issues) with one commit per issue; each commit passes
  the gates on its own and ends with `Closes #<issue>`, and the pull request merges with rebase.
- Commit subjects use conventional commits with the package or family as the scope. Every
  user-visible change needs a changeset in `.changeset/` (`pnpm changeset`) naming the package or
  packages it changes.
- A new package follows `docs/adr/0003-package-naming.md` and the "Adding a package" steps in
  `CONTRIBUTING.md`; open an `epic` issue first.
- Never mention AI assistance in commits, changesets, or docs.

## Repository map

A pnpm workspace of six families:

| Family   | Core                      | Binding                           | Docs            | E2E            |
| -------- | ------------------------- | --------------------------------- | --------------- | -------------- |
| ban      | `packages/ban-core`       | `packages/hono-ban`               | `docs/ban`      | `e2e/ban`      |
| catalog  | `packages/catalog-core`   | `packages/pg-catalog`             | `docs/catalog`  | `e2e/catalog`  |
| jsonapi  | `packages/jsonapi-core`   | `packages/hono-jsonapi`           | `docs/jsonapi`  | `e2e/jsonapi`  |
|          | `packages/jsonapi-client` | `packages/tanstack-query-jsonapi` |                 |                |
| intl     | `packages/intl-core`      | `packages/paraglide-intl`         | `docs/intl`     | `e2e/intl`     |
| keyset   | `packages/keyset-core`    | `packages/kysely-keyset`          | `docs/keyset`   | `e2e/keyset`   |
|          |                           | `packages/drizzle-keyset`         |                 |                |
| resource | `packages/resource-core`  | `packages/kysely-resource`        | `docs/resource` | `e2e/resource` |
|          | `packages/resource-ui`    | `packages/hono-resource`          |                 |                |
|          |                           | `packages/tanstack-form-resource` |                 |                |

- `packages/<name>/`: one published package, `@nizam-os/<name>`. `src/` with colocated tests;
  `tsdown.config.ts`, whose entry map becomes the `exports` map in `package.json` on build;
  `vitest.config.ts`, the package's Vitest project; `tsconfig.json`, which in a binding enables the
  `source` condition.
- `e2e/<family>/`: a private package that consumes the family's built packages through `workspace:*`
  and never imports from `src/`; `support/` holds its harness, `smoke/` the runtime smoke test.
- `docs/<family>/`: `README.md` (overview), `DESIGN.md` (intent), `SPEC.md` (the contract), `adr/`
  (decisions), `CONTRIBUTING.md` and `AGENTS.md` (family-specific rules).
- `docs/adr/`: decisions about the repository.
- Root configs apply to every package: `vitest.config.ts` (projects and coverage),
  `tsconfig.base.json`, `knip.jsonc`, `.oxlintrc.json`, `.oxfmtrc.json`, `pnpm-workspace.yaml` (pnpm
  settings), `.changeset/`, and `.github/workflows/` (CI, CodeQL, release). The last CI job,
  `CI passed`, is the only check `main` requires; a new CI job goes into its `needs` list
  (`docs/adr/0004-protect-main-with-one-aggregate-check.md`).
