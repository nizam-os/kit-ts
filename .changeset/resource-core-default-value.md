---
'@nizam-os/resource-core': minor
---

Field metadata states a default's value: `default` is a `FieldDefault`, `{ literal, value }`, where
`value` is the constant as a read gives it (a `boolean[]` column's `{t,f}` is `[true, false]`), a
relationship's as its id's text, and `undefined` for an expression such as `now()`, a codec's field,
or a constant outside the read form. A form starts a member from it without reading PostgreSQL's
text itself.
