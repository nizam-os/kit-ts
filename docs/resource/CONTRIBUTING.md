# Contributing to the resource family

`@nizam-os/resource-core` (declarations, derivations, messages, the `server` contracts, OpenAPI) and,
as their epics start, `@nizam-os/kysely-resource`, `@nizam-os/hono-resource`, `@nizam-os/resource-ui`,
and `@nizam-os/tanstack-form-resource`. The root [`CONTRIBUTING.md`](../../CONTRIBUTING.md) covers
setup, the quality gates, the shared conventions, commits, changesets, and releases; this guide adds
what is specific to the family. Design intent lives in [`DESIGN.md`](DESIGN.md), the normative
contract in [`SPEC.md`](SPEC.md), and decisions in [`adr/`](adr); read those before proposing
changes to the grammar, the derivations, or the error model.

## Conventions

- **The catalog is the authority.** Declarations read database facts from the public catalog; a
  feature that needs a fact the catalog lacks starts in the catalog family (a model change there, an
  ADR, a new catalog format).
- **Run the SQL, then write the test.** Every claim about PostgreSQL's behavior (what an input
  function accepts, what it rounds, which SQLSTATE and fields an error carries) is captured on
  PGlite and a PostgreSQL 14 server before it is written into code, a test, or the SPEC; when majors
  differ, both forms are tested.
- **Twins share a table.** A derivation implemented twice, once in types and once at runtime (names,
  requiredness, issue kinds), reads one case table from a `*.test-d.ts` and a `*.test.ts`.
- **Startup, not requests.** A mistake in a declaration fails `tsc` where TypeScript can see it and
  throws `TypeError` when the module loads where it cannot; nothing is deferred to the first
  request.
- **Measure type-level checks.** A check that changes shape is compiled against the real catalogs of
  SPEC 15.5 (`tsc --extendedDiagnostics --checkers 1`) before it merges, and the numbers go into the
  pull request; the package README's performance notes say what keeps the valid path cheap.
- **End-to-end tests live in `e2e/resource/`.** Run one file with
  `pnpm --filter @nizam-os/resource-e2e exec vitest run <name>` after `pnpm build`; set
  `RESOURCE_PG_URL` to a PostgreSQL server (a role with `CREATEDB`) to include the server files.

## Adding a capability

- **A wire form.** A row in SPEC 5.1 and its reason in 5.2, the JSON Schema and keyset type,
  accepted and rejected values in `wire-forms.test.ts`, boundary fixtures and oracle cases on PGlite
  and both servers, the storage contract's read form, and an amendment to ADR 0005 when it relaxes
  or tightens what a write accepts. A `minor` changeset when a type gains a form, `major` when an
  existing form changes.
- **A rule shape.** It is recognized in `@nizam-os/pg-catalog` first (catalog SPEC 8.3); here it
  needs its check in SPEC 6.1, an issue kind, its JSON Schema keyword, its fold into `limits`,
  boundary fixtures, and oracle cases.
- **An issue kind or a constraint kind.** SPEC 6.4 or 9.1, the `Messages` types, the English
  default, the inputs its message receives (SPEC 10.3), a localization test, and an ADR: the
  vocabulary is a public contract, so removing or renaming a kind is `major`.
- **A declaration option.** SPEC 3 and 14, the type-level check with its `@ts-expect-error` case, a
  `fails/` declaration in `e2e/resource/` whose `// error:` marker pins the compiler's message, the
  runtime `TypeError` with its message, the README when a user would look for it, and a `minor`
  changeset.
- **A server contract.** SPEC 12, a case in the storage contract suite, the reference adapter in
  `e2e/resource/`, and a changeset for every adapter package that must follow.

**Constraints every contribution inherits.**

- `@nizam-os/resource-core` depends on `@nizam-os/catalog-core`, `@nizam-os/jsonapi-core`,
  `@nizam-os/keyset-core`, and `@nizam-os/ban-core`, and on `zod` as a peer dependency; a new
  dependency needs an ADR.
- The `zod` floor is 4.5.0 and CI runs the unit tests there; code that needs a newer Zod raises the
  floor in the same PR, with a `major` changeset.
- Errors from declarations are `TypeError`s whose message starts with the option path (SPEC 14);
  errors on the wire are catalog entries (SPEC 9).
- `@nizam-os/tanstack-form-resource` takes TanStack Form's core, `@tanstack/form-core`, as an
  optional peer at the lowest release with what it uses (SPEC 20.9), and CI runs its tests there;
  code that needs a newer release raises the floor in the same PR, with a `major` changeset.
  `e2e/resource/form/adapters/` type-checks it with every adapter; a new adapter goes there.
- `e2e/resource/package-surface.e2e.test.ts` lists every value export of every entry point; a new
  export goes there and into an e2e file that runs it.

**Checklist.** Every item below is checked by CI or by a reviewer.

1. Source file in the right directory (see the repository map in `AGENTS.md`), with a
   `@packageDocumentation` header naming the SPEC section it implements and `@ref` links to the
   sources.
2. Unit and type tests beside the file; behavior that depends on PostgreSQL proven in the oracle,
   never with a mock.
3. `docs/resource/SPEC.md` for the behavior; `docs/resource/DESIGN.md` when the intent changes; the
   README when a user would look for it.
4. The surface snapshot of the e2e fixture regenerated and reviewed when the derived surface
   changes.
5. An ADR for a change to the grammar, a derivation, a wire form, the error model, the server
   contracts, or the dependencies.
6. A changeset: an additive capability is `minor`; a change to a derived name, a wire form, a code,
   a status, or an issue kind is `major`, because clients see it.
