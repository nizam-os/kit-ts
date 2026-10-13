# ADR 0018: Forms and lists are a framework-free model and a TanStack Form binding, in two packages

- Status: accepted
- Date: 2026-10-12

## Context

ADR 0015 built the forms and lists as one package, `@nizam-os/react-resource`: a framework-free model
at its root, `./form` binding it to TanStack Form, and `./query` binding the clients to TanStack
Query, with `@tanstack/react-form` and `@tanstack/react-query` as optional peers. Built, the package
imports nothing of React. The root imports nothing of TanStack either, and the bindings call only
what TanStack's framework-free cores export and the React adapters re-export, but their types came
from the React adapters (`useForm`'s options, `UseMutationOptions`), so an application on Vue,
Solid, Svelte, Angular, or Lit could not use them.

Root ADR 0010 binds a library published as a framework-free core plus adapters through its core and
names the binding for the library, and root ADR 0011 takes the core as an optional peer.
`resourceQueries` reads no declaration: its keys, reads, pages, and writes come from a client and
the definition it holds (jsonapi SPEC 15.4), which belong to the jsonapi family.

## Decision

- `@nizam-os/resource-ui` is the model, the root entry of `@nizam-os/react-resource` as it was:
  `fieldsOf`, `resourceForm`, and `resourceList`. It is a companion of the family (root ADR 0003),
  takes `@nizam-os/resource-core` and `@nizam-os/jsonapi-client` as peers, since the application hands
  it declarations, messages, and the client's results and errors (root ADR 0006), and depends on
  `@nizam-os/jsonapi-core`, for `parseQuery`. It imports no TanStack package: TanStack Table v9 holds
  sorting and column filters as plain values, and the type tests assign `@tanstack/table-core`'s to
  and from the model's.
- `@nizam-os/tanstack-form-resource` is `./form` as it was: `resourceFormOptions` and
  `bindResponseErrors`. It takes `@nizam-os/resource-ui` as a peer, since the application hands it
  form models, and `@tanstack/form-core` `^1.17.0` as an optional peer, importing `revalidateLogic`
  from it at runtime and the rest as types (root ADR 0011). `resourceFormOptions` returns its
  options as a plain object, since TanStack Form's `formOptions` only types them.
- `./query` becomes `@nizam-os/tanstack-query-jsonapi`, the jsonapi family's binding (jsonapi ADR
  0020), and `@nizam-os/react-resource`, never published, is removed.
- ADR 0014 holds for both packages, and ADR 0015's decisions on values, writes, validation, error
  placement, and list state hold as ADRs 0016 and 0017 amend them.
- Each package's tests run on the cores, and `e2e/resource` renders screens built with each
  framework's adapters against the contacts application over HTTP, in React and in Vue, and
  type-checks the binding with every TanStack Form adapter.

## Consequences

An application on any framework TanStack Form supports builds its forms and lists from the
declaration with one model and one binding. The imports change: `@nizam-os/react-resource` is
`@nizam-os/resource-ui`, `@nizam-os/react-resource/form` is `@nizam-os/tanstack-form-resource`, and
`@nizam-os/react-resource/query` is `@nizam-os/tanstack-query-jsonapi`. A binding to another form
library is a package beside `@nizam-os/tanstack-form-resource`, over the same model. Record and bulk
actions, which ADR 0015 left to a later epic, belong to the model, with their mutations in the query
binding.
