# ADR 0010: A binding to a library with a framework-free core binds the core and is named for the library

- Status: accepted
- Date: 2026-10-12

## Context

[ADR 0003](0003-package-naming.md) names a binding `<host>-<thing>`, `<host>` being the host's npm
name without scope. The resource family's forms and lists were built as `@nizam-os/react-resource`
under that rule, for its optional peers `@tanstack/react-form` and `@tanstack/react-query` (resource
ADR 0015), yet nothing in it imports React: its bindings call TanStack Form's and TanStack Query's
framework-free API, which the React adapters re-export.

TanStack publishes each of its libraries as a framework-free core and one adapter per framework.
Each adapter's entry re-exports its core in full (`export * from '@tanstack/query-core'`), and each
depends on one exact release of the core. Measured on 2026-10-12:

| Library        | Core                   | Adapters                                                                                                          |
| -------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------- |
| TanStack Query | `@tanstack/query-core` | `react-query`, `vue-query`, `solid-query`, and `angular-query-experimental` 5.104.1, `svelte-query` 6.3.1         |
| TanStack Form  | `@tanstack/form-core`  | `react-form`, `vue-form`, `solid-form`, `svelte-form`, and `angular-form` 1.33.5, `lit-form` 1.25.5               |
| TanStack Table | `@tanstack/table-core` | `react-table`, `vue-table`, `solid-table`, `svelte-table`, `angular-table`, `lit-table`, and `preact-table` 9.3.1 |

What a binding hands these libraries comes from the core: Form's `revalidateLogic` and
`ValidationLogicFn`, Query's `DataTag`, `QueryFunction`, and `MutationFunction`. Options typed
through the core alone are taken by every adapter: on 2026-10-12, one set of form options spread
into the forms of all six Form adapters (`useForm`, `createForm`, `injectForm`, and Lit's
`TanStackFormController`) with the submit handler's values typed, and one set of query options went
into the queries, infinite queries, and mutations of all five Query adapters with their data typed.
What exists only in an adapter is the framework's: hooks, components, and the option helpers
`queryOptions`, `infiniteQueryOptions`, and `mutationOptions`, identity functions typed for that
adapter's hooks.

A binding named for one adapter serves one framework's applications though its code serves them all,
and a binding per adapter would publish one package five or six times.

## Decision

- A binding to a library published as a framework-free core plus framework adapters binds the core.
  Its types and runtime values come from the core, and it imports no adapter and no framework.
  [ADR 0011](0011-a-binding-takes-the-core-an-adapter-brings-as-an-optional-peer.md) records how it
  depends on the core.
- Its `<host>` is the library's name as its publisher writes it, in lower case and hyphenated, since
  `query` and `form` alone name no library: `tanstack-query`, `tanstack-form`. The TanStack Query
  binding of the jsonapi family is `@nizam-os/tanstack-query-jsonapi`, and the TanStack Form binding
  of the resource family is `@nizam-os/tanstack-form-resource`.
- A binding that needs what only an adapter has, a hook or a component, binds that adapter and keeps
  ADR 0003's form, `<adapter>-<thing>`.
- State a library holds as plain data needs no binding: a model reads and writes it as values, and
  its type tests assign the core's types to and from its own, as the resource family's list model
  does with TanStack Table v9's sorting and column filters (resource ADR 0018).

## Consequences

One package serves every framework the library supports, and an application keeps calling its own
adapter, whose hooks take the binding's options as they are. The family's e2e suite type-checks the
binding with each adapter, and the binding's README names them; an adapter for another framework
needs no release of the binding. The binding cannot use the adapters' option helpers, so it types
its options through the core (jsonapi ADR 0020); an application may still pass them through its
adapter's helper. `react` remains a `<host>` only for a binding that uses React itself. "Adding a
package" in `CONTRIBUTING.md` asks whether the host is published as a framework-free core plus
adapters.
