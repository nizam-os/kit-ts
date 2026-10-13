---
'@nizam-os/paraglide-intl': minor
---

First release: `compile(options)` compiles a Paraglide JS project with every interpolated value
wrapped in U+2068 FIRST STRONG ISOLATE and U+2069 POP DIRECTIONAL ISOLATE, so a value displays in
place in left-to-right and right-to-left text, whatever its direction. It takes Paraglide's compiler
options plus `isolate`, `true` by default, `false`, or the locales to isolate; patterns rewrite in
memory, so the message files stay as they are. The project loads with the `@inlang/sdk` that
`@inlang/paraglide-js` 2.11 or later depends on, and the compiled JavaScript, TypeScript, and JSON
spell every bidi control as a `\u` escape. The package re-exports `@nizam-os/intl-core`.
