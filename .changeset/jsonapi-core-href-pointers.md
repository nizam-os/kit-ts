---
'@nizam-os/jsonapi-core': patch
---

Point the errors about an operation's target at `href` when the operation named its target through
`href`: an unknown type, an unknown relationship, an unknown `lid`, or a collection where a resource
is required answered with a pointer under `ref`, a member such an operation does not hold.
