# intl family: instructions for coding agents

Read with the root [`AGENTS.md`](../../AGENTS.md), which holds the rules every family shares; this
file adds what is specific to `@nizam-os/intl-core` (the framework-free core) and
`@nizam-os/paraglide-intl` (the Paraglide binding). Humans: see [`CONTRIBUTING.md`](CONTRIBUTING.md).

## Ground rules

- Read `docs/intl/DESIGN.md` for intent and `docs/intl/SPEC.md` for the exact contract before
  changing public API. Implement from the SPEC section named in the file header; update the SPEC in
  the same PR when the code must differ. Read the relevant ADR in `docs/intl/adr/` before changing a
  decision it records; add a new ADR instead of silently reversing one.
- `Intl` output is engine data. Measure it on the runtimes the family supports before code or a test
  relies on it, and cite the runtime and version; pin formatting tags (`-u-ca-`, `-u-nu-`) in tests.
- `packages/intl-core` imports nothing from Paraglide, the inlang SDK, or `node:*`, not even types.
  The application hands it getters and a request scope.
- `packages/paraglide-intl` is a build-time tool (ADR 0002): it may use `node:buffer`,
  `node:crypto`, `node:fs`, `node:module`, `node:path`, `node:process`, and `node:url`, reads no
  environment at module scope, and calls only Paraglide's and the SDK's exported API
  (`compileProject`, `writeOutput`, `defaultCompilerOptions`, `loadProjectFromDirectory`,
  `selectBundleNested`, `upsertBundleNested`), read from their source at a pinned commit. The SDK is
  the one Paraglide depends on, imported from Paraglide's package (root ADR 0009); never add
  `@inlang/sdk` to the binding's dependencies or peers. An SDK API it starts to call must be
  exported by every SDK major in Paraglide's range (SDK 2 to 4 today), and the floor job in
  `.github/workflows/ci.yml` runs each.
- Error messages are constant apart from option names and configured locale codes; a cookie, a
  header, or a value read from a request never goes into one.

## Repository map

- `packages/intl-core/src/isolate.ts` `isolate` and the isolate characters
- `packages/intl-core/src/intl/` `createIntl`, the formatting tag, the `Intl` cache
- `packages/intl-core/src/time-zone/` `toTimeZone`, `detectTimeZone`, the cookie helpers,
  `createTimeZone`
- `packages/paraglide-intl/src/` `compile`, `watch`, the pattern rewrite, the formatting annotations
- `e2e/intl/` end-to-end suite: a private workspace package that consumes the built packages through
  `workspace:*`, compiles a fixture project, and compares server and browser renders;
  `e2e/intl/smoke/` is the runtime smoke test (Bun, Deno, workerd)
- `docs/intl/DESIGN.md` what we are building and why; `docs/intl/SPEC.md` the normative contract;
  `docs/intl/adr/` decisions
