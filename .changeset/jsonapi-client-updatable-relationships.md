---
'@nizam-os/jsonapi-client': patch
---

`setRelationship`, `addToRelationship`, and `removeFromRelationship` take only the relationships an
update may carry, the ones the definition's `writable.update` list names, and none where the
definition serves no update. The server refuses a write to any other relationship with 403, so a
call naming one now fails `tsc` instead.
