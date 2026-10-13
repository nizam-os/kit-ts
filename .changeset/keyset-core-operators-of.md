---
'@nizam-os/keyset-core': minor
---

`OperatorsOf<TType>` is the operator table of SPEC 4.2 as a type: the operators a field of a type
accepts, without the `isNull` a nullable field adds. A library that builds keyset definitions from
its own declarations can refuse an operator at compile time, before `defineKeyset` would throw. The
runtime table behind `operatorsFor` is typed by it, so the two cannot disagree.
