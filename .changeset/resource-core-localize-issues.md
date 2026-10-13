---
'@nizam-os/resource-core': minor
---

`localizeIssues(messages)` returns the text of an issue of `write.create` or `write.update` on a
resource type: the detail `localizeErrors` gives the error object the server makes of the same
issue, so a form that validates before it sends shows the words the server would answer with, in the
locale the message functions read when it renders. Each text is computed when it is asked for.
