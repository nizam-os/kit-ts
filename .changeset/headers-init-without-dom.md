---
'@nizam-os/ban-core': patch
'@nizam-os/jsonapi-core': patch
'@nizam-os/jsonapi-client': patch
---

Declarations that compile without the DOM library. Every `headers` option named `HeadersInit`, an
alias only TypeScript's DOM library declares: Node's types declare `Headers` but not the alias, so a
Node application without `lib: ["dom"]` got TS2304 in the packages' declarations, or read each
`headers` option as `any` where it skipped checking them. `@nizam-os/ban-core` and
`@nizam-os/jsonapi-client` now vendor the Fetch Standard's `HeadersInit` as the DOM library types
it, and `@nizam-os/jsonapi-core` types an error's `headers` as `BanErrorOptions['headers']`. Every
value the DOM library's alias accepts is still accepted.
