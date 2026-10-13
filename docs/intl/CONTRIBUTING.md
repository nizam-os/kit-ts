# Contributing to the intl family

`@nizam-os/intl-core` (the framework-free core) and `@nizam-os/paraglide-intl` (the Paraglide
binding). The root [`CONTRIBUTING.md`](../../CONTRIBUTING.md) covers setup, the quality gates, the
shared conventions, commits, changesets, and releases; this guide adds what is specific to the
family. Design intent lives in [`DESIGN.md`](DESIGN.md), the normative contract in
[`SPEC.md`](SPEC.md), and decisions in [`adr/`](adr); read those before proposing API changes.

## Conventions

- **Every behavior traces to a source.** ECMA-402, UAX #9, UTS #35, RFC 6265 and the RFC 6265bis
  draft, Paraglide's and the inlang SDK's source at a pinned commit. Add an `@ref <url>` comment
  next to the decision it justifies and name the rule in the test.
- **An engine's behavior is measured, not remembered.** `Intl` output depends on the engine's ICU
  and CLDR versions; a claim about it names the runtime and version it was measured on, in the code
  comment, the ADR, or the test. A test that pins engine output pins it on the tag and options the
  test passes, never on an engine default.
- **The core knows no host.** Nothing under `packages/intl-core/` imports Paraglide, the inlang SDK,
  `node:*`, or a framework, not even types; a request scope is the `RequestScope` interface, which
  an `AsyncLocalStorage` satisfies.
- **The binding follows Paraglide's own `compile()`.** A change in Paraglide's or the SDK's API is
  read from their source at a pinned commit, measured on the floor and the current version, and
  recorded in SPEC section 6 and an ADR before the binding relies on it.
- **Tests use real compiles.** The binding's tests compile fixture projects with Paraglide in
  `mkdtemp` directories and call the emitted functions; no compiler mocks.
- **End-to-end tests live in `e2e/intl/`.** That package consumes the built packages through
  `workspace:*`; never import from `src/` there. Run one file with
  `pnpm --filter @nizam-os/intl-e2e exec vitest run <name>` after `pnpm build`, and the runtime
  smoke with `pnpm --filter @nizam-os/intl-e2e run smoke:bun` (`smoke:deno`, `smoke:workerd`): each
  compiles the fixture on its runtime first, `smoke:bun` and `smoke:deno` then watch an edit
  compile, and `smoke:deno` needs Deno 2.6.10 or later.

## Adding a formatter

A formatter wraps one ECMA-402 constructor: add it to `create-intl.ts` and SPEC 3.3, key its cache
entries by the constructor's name, and test it against the same call on a fresh `Intl` object with
the formatting tag.
