# ADR 0002: `hono` is the only peer dependency; validators through Standard Schema

- Status: accepted; scope narrowed by ADR-0013 (`hono` is the peer dependency of
  `@nizam-os/hono-jsonapi`) and amended by ADR-0014 (`@nizam-os/jsonapi-core` depends on
  `@nizam-os/ban-core`; `@nizam-os/hono-ban` is `@nizam-os/hono-jsonapi`'s second peer dependency). The
  Standard Schema decision stands unchanged.
- Date: 2026-10-08

## Context

Attribute validation on create and update needs a schema library, and applications already have one:
Zod 4, Valibot, ArkType, Effect Schema. Depending on any of them would pin a version and force a
second copy on applications using another. The previous toolkit depended on Zod and
`@hono/zod-openapi` in its core and leaked Zod's issue shapes into responses. @ref
https://standardschema.dev/ (the `~standard` interface, implemented by every library above) @ref
https://standardschema.dev/#how-do-i-accept-standard-schemas-in-my-library

## Decision

`hono` is the only peer dependency and the package has no runtime dependencies. Validators are
accepted through the Standard Schema V1 interface, whose types are vendored in
`src/internal/standard-schema-types.ts` (the specification is a type-only contract, so vendoring is
the documented way to consume it). `defineResource` checks a validator structurally: `~standard` is
read with `in`, because zod 4, Valibot, and ArkType define it as a prototype getter, and `version`
must be 1 with a `validate` function. Issue paths become RFC 6901 pointers; the issue `message`
becomes `detail`; nothing else from the library reaches a response.

The real libraries used in tests (Zod) are devDependencies of the root and of `e2e/jsonapi/`.

## Consequences

Any Standard Schema library works without a hook per library. Validator-specific features (Zod error
maps, Valibot flattening) are the application's concern. A library that does not implement Standard
Schema needs a thin adapter object in application code.
