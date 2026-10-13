---
'@nizam-os/resource-ui': minor
---

New package: a framework-free model of forms and lists over resource-core declarations, starting
with field descriptors. `fieldsOf(resource, messages)` describes each public field and relationship
with the messages' own label functions and option labels, which render in the locale of each call,
whether a create must carry it, whether it sorts, and its filter's control and declared operators.
