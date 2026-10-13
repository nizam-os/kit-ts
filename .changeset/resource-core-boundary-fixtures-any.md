---
'@nizam-os/resource-core': patch
---

`boundaryFixtures` takes `AnyDeclaredResource`. Against the wide `DeclaredResource`, TypeScript
compared every typed resource with the definer's context member by member, so taking the fixtures of
each resource of a 111-table schema tripled its instantiations and check time; it now costs a few
hundred instantiations.
