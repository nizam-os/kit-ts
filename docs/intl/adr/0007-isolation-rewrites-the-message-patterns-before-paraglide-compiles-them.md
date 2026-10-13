# ADR 0007: Isolation rewrites the message patterns before Paraglide compiles them

- Status: accepted
- Date: 2026-10-12

## Context

Paraglide 2.27 compiles an expression part of a pattern to an interpolation in a template literal
(`` `Shared by ${i?.name}` ``) and has no option to wrap it
([`compile-pattern.ts`](https://github.com/opral/paraglide-js/blob/0c6cf2c971b667cedf133dea471101897c8c0ade/src/compiler/compile-pattern.ts)).
There are three places to add the isolates:

1. The catalogs. The two characters are invisible, translators' editors strip them, and every
   locale's file would need them on every value.
2. Paraglide's emitted JavaScript, after `compile()`: rewrite each interpolation of each locale
   function. This works, and the application package this family generalizes does it, but it couples
   the build to the shape of generated code, which changed within Paraglide 2 (the JSDoc casts, the
   locale branches), so it needs a gate that fails on any shape it does not recognize.
3. The message patterns, between loading the project and compiling it. A pattern is the inlang SDK's
   documented data model, an array of `text`, `expression`, and markup parts, and Paraglide's own
   `compile()` is exactly `loadProjectFromDirectory()`, `compileProject()`, `writeOutput()`
   ([`compile.ts`](https://github.com/opral/paraglide-js/blob/0c6cf2c971b667cedf133dea471101897c8c0ade/src/compiler/compile.ts#L58-L69)),
   all three exported. The SDK's `selectBundleNested()` and `upsertBundleNested()` read and write a
   bundle with its messages and variants across the SDK's table renames.

Measured on Paraglide 2.27.0 with inlang SDK 4.0.1 (2026-10-12): wrapping each expression of a
loaded project in two text parts and compiling it emits
`` `Shared by \u2068${i?.name}\u2069 (\u2068${i?.count}\u2069)` ``, but with U+2068 and U+2069 as
raw characters, in the template literal and in the JSDoc table of each message. The catalogs on disk
are byte-identical afterwards: `loadProjectFromDirectory()` without a `syncInterval` writes only its
own files into the project directory as it loads it (`.gitignore`, `.meta.json`, `README.md`,
`.lix/README.md`), exactly as for Paraglide's own `compile()`, and nothing after the load. With no
pattern rewritten, the output is byte-identical to Paraglide's own `compile()`.

## Decision

`@nizam-os/paraglide-intl`'s `compile()` is Paraglide's `compile()` with one step between the load
and the compile: for each message of an isolated locale, each variant's pattern with more than one
part has each `expression` part replaced by a text part U+2068, the part, and a text part U+2069,
written back with `upsertBundleNested()`. Before the output is written, each bidi control in its
JavaScript, TypeScript, and JSON files is written as a `\u` escape: such a character can stand only
in a string, a template, a regular expression, or a comment, and in the first three the escape
denotes the same character, so the messages return the same strings while the code shows the
isolates instead of hiding them. The project is loaded with the SDK Paraglide depends on (root ADR
0009). `compile()` takes Paraglide's compiler options and returns what Paraglide's `compile()`
returns, with the project's warnings.

## Consequences

The isolation follows the message model, so a change in Paraglide's code generation does not touch
it, and the output is Paraglide's own for the rewritten patterns, but for the escapes. A change in
the SDK's nested bundle API does: the binding checks each bundle it reads, and CI runs its tests on
Paraglide's floor, on the last release of each older SDK major, and on the current release. An
application that runs Paraglide through its bundler plugin calls this `compile()` from its build
script instead, as one already does to compile ahead of the bundler; the binding offers no bundler
plugin.

Measured on stern's catalogs (85 messages) and a second application's (2,120 messages, 67 of them
plural), with Paraglide 2.20.2, 2.25.2, and 2.27.0 installed beside the packed package under Node
24.20, Bun 1.4.2, and Deno 2.9.7 (2026-10-12): with `isolate: false`, every output file is
byte-identical to Paraglide's own; with the isolates, every message returns Paraglide's string once
U+2068 and U+2069 are removed, and the files differ only by the escaped isolates and by where the
JSDoc table cuts a long message, at 160 characters counting the two. Reading the bundles and writing
back the changed ones adds 0.2 to 0.4 s to the 2,120-message compile on SDK 2 and 1.9 to 2.9 s on
SDKs 3 and 4, where Paraglide's own compile takes 0.9 to 1.9 s.
