# ADR 0003: Package naming

- Status: accepted; amended by ADR-0006 (a binding takes as peers the workspace packages whose
  values the application hands it), ADR-0009 (a binding takes as peers the packages whose values it
  hands its host), ADR-0010 (a binding to a library published as a framework-free core plus adapters
  binds the core and is named for the library, `tanstack-query` or `tanstack-form`), and ADR-0011
  (such a binding takes the core as an optional peer)
- Date: 2026-10-10

## Context

The packages were named ad hoc: a core was `<thing>-kit` and a binding `<host>-<thing>`, and the
unscoped names left no room for a family to grow (a client, a second binding, a tool). Moving every
package under the `@nizam-os` scope is the moment to fix a rule that makes a package's role readable
from its name, the way `@tanstack/query-core`, `@tanstack/react-query`, and
`@tanstack/query-devtools` do.

## Decision

Every package is `@nizam-os/<name>` with `<name>` in one of three shapes:

- `<thing>-core`: the framework-free, database-free core of a family. `<thing>` is the family name,
  one word, lower case: `ban`, `jsonapi`, `keyset`. A core depends on nothing but other cores.
- `<host>-<thing>`: the binding of a family to a host library, where `<host>` is the host's npm name
  without scope (`hono`, `kysely`, `drizzle`, `react`). A binding depends on its core, re-exports it
  in full, and has the host as its only peer dependency, plus the sibling binding it builds on where
  one exists (`@nizam-os/hono-jsonapi` on `@nizam-os/hono-ban`).
- `<thing>-<facet>`: a companion of a family that binds to no host: a client, a CLI, a test helper
  (`<thing>-client`, `<thing>-cli`, `<thing>-testing`).

The directory under `packages/` is `<name>`; the private end-to-end package of a family is
`@nizam-os/<thing>-e2e` under `e2e/<thing>`; a Vitest project carries the package name. The renamed
packages keep their version lines: `@nizam-os/hono-ban` continues `hono-ban` at 2.0.0, and the
unscoped `hono-ban` is deprecated on npm in its favor; the other five publish their first versions
under the new names.

## Consequences

A reader can tell a core from a binding from a companion by the name alone, and a family's packages
sort together on npm and in this repository. Existing documentation, examples, and the one published
package change names once. The rule constrains future packages: something that is neither a core, a
binding, nor a companion of a family does not fit and needs a new ADR.
