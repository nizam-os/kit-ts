# ADR 0009: A binding makes what it hands its host with the host's own dependency

- Status: accepted
- Date: 2026-10-12

## Context

[ADR 0003](0003-package-naming.md) gives a binding its host as its only peer dependency, plus the
sibling binding it builds on, and
[ADR 0006](0006-a-binding-takes-the-packages-the-application-hands-it-values-from-as-peers.md) adds
each workspace package whose values the application makes and hands it. A third case arrived with
the intl family: a binding that makes values with one of its host's dependencies and hands them to
the host. `@nizam-os/paraglide-intl` loads a project with the inlang SDK
(`loadProjectFromDirectory()`) and hands it to Paraglide's `compileProject()`, which reads it
through its own copy of the SDK. Paraglide depends on one SDK major per minor range (SDK 2 through
2.23, SDK 3 from 2.24, SDK 4 from 2.27), and a project loaded by another major does not compile:
measured on 2026-10-12, a project loaded by SDK 4.0.0 fails in Paraglide 2.26.0's `compileProject()`
(the SDK 3 table `bundle` is not found), and one loaded by SDK 3.1.0 fails in 2.27.0's with a
`TypeError`.

A peer dependency on the SDK does not prevent this. Its range is independent of the host's, and no
installer relates the two: an application on Paraglide 2.20, which depends on SDK 2, that installs
the binding gets the newest SDK the binding's range allows, from pnpm's `auto-install-peers` or a
plain `pnpm add @inlang/sdk`, and the mismatch surfaces as a database error inside Paraglide's
compiler.

## Decision

A binding that hands its host values made with one of the host's dependencies makes them with the
host's own copy. It resolves the dependency from the host's package, where the host's own imports
resolve it (Node's `createRequire()` on the host's entry, then `require.resolve()`), and imports it
from there. The dependency is neither a peer nor a dependency of the binding: the binding types it
through the host's declarations, checks at the boundary the part of its API it calls, and runs its
tests on the host's floor (ADR 0007) and on each major of the dependency the host's range covers.

## Consequences

The values and the host's code come from one copy whatever host version the application installs, so
a host release that moves to the dependency's next major needs nothing from the application. The
binding may call only API that every major in the host's range provides, and a module without it
fails with a `TypeError` naming what is missing. The question "Adding a package" asks a new binding
grows by one: does it hand its host values made with one of the host's dependencies?
