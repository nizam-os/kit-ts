---
'@nizam-os/jsonapi-core': patch
---

Error details quote what the client sent only when it is a plain token: letters, digits, `_`, `-`,
`.`, and square brackets, at most 64 characters, such as a member name, a parameter name, or an id.
Anything else, such as markup, a line break, a URL, or 10 kB of text, is named without its value,
and `source` still locates it. An unsupported extension's detail no longer quotes the URI.
