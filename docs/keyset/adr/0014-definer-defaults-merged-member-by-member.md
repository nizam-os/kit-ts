# ADR 0014: Definer defaults are merged member by member

- Status: accepted
- Date: 2026-10-09

## Context

An application defines one keyset per collection, and most of them share the cursor secret, the page
bounds, and the text-search configuration. Repeating those in every definition invites drift: one
keyset left on the old secret after a rotation, one with another maximum page size, one searching
with `simple` where the rest stem with `english`. `@nizam-os/jsonapi-core` already solves the same
problem for resource links with `createDefineResource(defaults)`
([jsonapi ADR 0015](../../jsonapi/adr/0015-resource-links-by-convention.md)), and
`@nizam-os/resource-core` will derive keysets from one configured definer.

Two merge rules were possible. Replacing a whole member (the definition's `cursor` replaces the
default `cursor`) forces a definition that wants only a shorter `ttl` to repeat the secret, which is
the drift the defaults exist to remove. Merging the options of each member (`cursor`, `page`) keeps
the secret in one place. Merging deeper has nothing to apply to: every option inside those members
is a scalar, a key, or a list (`previousSecrets`) that replaces as a whole. Object spread copies
every own enumerable property, including one set to `undefined`, so a definition can also remove a
default (`ttl: undefined`). @ref
https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Spread_syntax#spread_in_object_literals

Search differs: its source (`columns` or `vector`) belongs to one table, so only the `regconfig`
name can be shared, and it means something only for full-text search. @ref
https://www.postgresql.org/docs/current/textsearch-controls.html

## Decision

`createDefineKeyset(defaults)` in `@nizam-os/keyset-core` takes
`{ cursor?, page?, search?: { config? } }`, validates it at the call with the rules `defineKeyset`
applies to the same options (ADR 0011), and returns a definer. For each definition the definer
builds `cursor` as `{ ...defaults.cursor, ...definition.cursor }` and `page` as
`{ ...defaults.page, ...definition.page }`, gives a full-text search that names no `config` the
default one, leaves a `like` search and every other member alone, and passes the result to
`defineKeyset` unchanged. A definition is therefore validated and normalized exactly as if it had
spelled the defaults out. The merged cursor must have a secret.

The types follow the values: with a `cursor` default, the definition's `cursor` is optional and
partial; without one, it stays required, and `createDefineKeyset()` types as `defineKeyset`. Each
definer owns its defaults; there is no global configuration. `@nizam-os/kysely-keyset` exports its
own `createDefineKeyset<DB>(defaults)`, which keeps every compile-time name check and delegates the
merge to the core's.

## Consequences

One module per application holds the secret, the page bounds, and the search configuration, and a
secret rotation is one edit. A default `page.default` above a definition's own `page.max` fails when
that definition is created, not at startup, because only then is the bound known. Defaults for other
members can be added later without breaking a definition; a default sort or search source cannot,
since both name one table's fields.
