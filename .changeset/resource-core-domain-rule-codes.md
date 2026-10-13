---
'@nizam-os/resource-core': minor
---

The definer's `domains` can rename the code of any domain CHECK, including one whose rule the
schemas enforce: `domains: { short_text: { short_text_check: { code: 'NAME_LENGTH' } } }`.

- A CHECK with a rule takes an entry of `code` alone; a validator there still fails `tsc` and throws
  `validator: the CHECK has a rule, which enforces it already`.
- A CHECK without a rule still needs its validator, and an entry without one now reads
  `validator: a CHECK without a rule needs a validator`.
- The given code reaches the declared resource's `errors`, `errorCatalog`, and `constraintError`,
  which maps PostgreSQL's refusal by that CHECK to it.
- When a domain CHECK's derived code is not A-Z, 0-9, and `_`, or repeats another code of the
  resource, the message now points at `code` in the definer's `domains` instead of a migration.
