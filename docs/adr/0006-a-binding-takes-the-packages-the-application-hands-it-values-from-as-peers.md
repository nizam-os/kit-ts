# ADR 0006: A binding takes as peers the packages whose values the application hands it

- Status: accepted
- Date: 2026-10-11

## Context

A binding depends on its core through `workspace:^` and re-exports it: `@nizam-os/hono-jsonapi`
re-exports `@nizam-os/jsonapi-core`, and `@nizam-os/kysely-keyset` re-exports `@nizam-os/keyset-core`.
An application imports from the binding alone, so one copy of the core serves both.

The resource family has another shape. The application imports `@nizam-os/resource-core` itself, to
declare its resources, and hands the declarations to two bindings, `@nizam-os/kysely-resource` and
`@nizam-os/hono-resource`, neither of which can re-export the core for the other. Some values that
cross that boundary are recognized by identity, so a value made by one copy fails in another:

- A declared resource and a behavior are registered in module-level `WeakMap`s and `WeakSet`s of the
  copy that made them (`isDeclaredResource`, `isResourceBehavior`). Another copy refuses them with a
  `TypeError`.
- A `BanError` is recognized with `instanceof` (`isBanError`). A refusal thrown by one copy of
  `@nizam-os/ban-core` reaches the handler of another as an unknown error, which answers 500.

When two packages depend on one package with ranges that one version satisfies, the package manager
installs one copy. When the ranges do not overlap, as `^0.1.0` and `^0.2.0` never do, each package
gets its own copy, and nothing reports it until a request fails. A peer dependency states the
relationship npm calls a plugin's to its host. npm 7 and later install peer dependencies by default,
and "trying to install another plugin with a conflicting requirement may cause an error if the tree
cannot be resolved correctly"
([npm docs](https://docs.npmjs.com/cli/v11/configuring-npm/package-json#peerdependencies)).
`@nizam-os/pg-catalog` already takes `@nizam-os/resource-core` as a peer, since `rules --check` loads
the application's declarations.

## Decision

- A binding takes as a peer dependency each workspace package whose values the application makes
  with its own import and hands to the binding. Its own build and tests take the package through
  `workspace:^` in `devDependencies`.
- A binding whose core the application imports only through the binding keeps depending on it and
  re-exporting it.
- `@nizam-os/hono-resource` takes `@nizam-os/resource-core` (the declarations) and
  `@nizam-os/hono-jsonapi` (the `jsonApi()` negotiation and the `BanError`s its handlers render) as
  peers, beside `hono`.
- `@nizam-os/kysely-resource` takes `@nizam-os/resource-core` (the declarations, behaviors, and
  scopes) and `@nizam-os/keyset-core` (the keyset definer, whose refusals it maps by class) as peers,
  beside `kysely` (#106).

## Consequences

- An application installs each of those packages itself, as it already does to use them, and a set
  whose ranges cannot meet fails at install instead of on a request.
- Adding a binding means answering one question: does the application hand it values made with
  another workspace package? `CONTRIBUTING.md`'s "Adding a package" asks it.
- A second copy can still come from outside these peers, such as `@nizam-os/ban-core` under the
  runtime and under the handler. The ban family recognizes a `BanError` across copies by a
  registered brand (ban ADR 0019, #107).
