# ADR 0019: A `BanError` is recognized across copies of the package by a registered brand

- Status: accepted
- Date: 2026-10-11

## Context

`isBanError(value)` was `value instanceof BanError`, and the handler resolves a thrown value with it
(SPEC 6.3), as do `ban.from()`, `@nizam-os/jsonapi-core`'s negotiation and Atomic Operations, and the
testing helpers. `instanceof` compares prototypes, so a `BanError` built by a second copy of the
package, which has a class of its own, is not one: the handler treats it as an unexpected failure
and answers 500.

A package manager installs a second copy whenever two dependents' ranges do not meet, and before 1.0
every minor release makes ranges that cannot meet: `^0.1.0` and `^0.2.0` share no version. Every
package of the family depends on `@nizam-os/ban-core`, directly or through `@nizam-os/jsonapi-core`,
so upgrading one of them without the others is enough. Built from the packed packages, an
application that serves `@nizam-os/kysely-resource`'s runtime with `@nizam-os/hono-resource` answered
the runtime's `NOT_FOUND` with 500 once a second copy of `@nizam-os/ban-core` sat under the runtime
(#107). Root ADR 0006 makes the application's own packages peers, but `@nizam-os/ban-core` reaches
the runtime and the handler as a dependency of each, and left recognizing an error across copies to
this family.

Libraries whose values cross package boundaries recognize them by something every copy computes
alike. Effect gives each type a registered symbol and tests for the property:
`TypeId = Symbol.for("effect/Option")` and `isOption = (input) => hasProperty(input, TypeId)`
([effect 3.18.4](https://unpkg.com/effect@3.18.4/src/internal/option.ts)). Zod 4 defines
`Symbol.hasInstance` on each constructor so that `instanceof` tests a set of trait names the
instance carries, `inst?._zod?.traits?.has(name)`, after the prototype check
([zod 4.6.5](https://unpkg.com/zod@4.6.5/src/v4/core/core.ts)). `Symbol.for` returns the same symbol
for the same key in every module and realm of an agent, from the global symbol registry. @ref
https://tc39.es/ecma262/#sec-symbol.for @ref https://tc39.es/ecma262/#sec-instanceofoperator
(InstanceofOperator calls `@@hasInstance` first)

## Decision

- `BanError.prototype` carries the brand `Symbol.for('@nizam-os/ban-core/BanError')`, a
  non-enumerable, non-writable property whose value is the version of the shape SPEC 4 lists: `1`.
  It sits on the prototype, so an error has no extra own property and serializes as before.
- `BanError[Symbol.hasInstance](value)` is the ordinary prototype check, or, called on `BanError`
  itself, whether `value` is an object whose brand is the version this copy reads. A subclass keeps
  the ordinary check, so `instanceof` a subclass never accepts an error of another class.
  `isBanError` stays `value instanceof BanError`, and both agree in every copy.
- The version changes when a member SPEC 4 lists changes its name, type, or meaning. A copy
  recognizes only its own version, so an error from an incompatible copy is still an unexpected
  failure, answered with the constant 500, and is never rendered from members read wrongly.
- The handler renders a recognized error as it renders its own: from its public members, `toInit()`
  for the body cap, and its own `getResponse()`, whose renderer the private field of its own class
  holds.

## Consequences

- An error from any compatible copy keeps its status, code, detail, and items through every handler,
  and `instanceof BanError` in application code agrees with `isBanError`.
- Only code can throw a value, so the brand is no trust boundary: an object that claims it is an
  error the code meant to throw, rendered from its members as any `BanError` is, with `meta`
  sanitized at render time (ADR 0007).
- TypeScript narrows `instanceof BanError` to `BanError` as before: `[Symbol.hasInstance]` returns
  `boolean`, not a type predicate, so a subclass narrows to itself.
- Two copies remain two catalogs, two sets of formats, and two configurations; the brand makes their
  errors interchangeable, not their instances. Keeping one copy is still the recommendation, and the
  README says how to find a second.
