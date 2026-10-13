---
'@nizam-os/pg-catalog': minor
---

CHECK constraints become rules that a client can enforce and get PostgreSQL's verdict.

- Every check constraint, on a table or a domain, carries a `rule` read from PostgreSQL's deparsed
  expression: character length bounds, a numeric range with the inclusiveness of each bound, a set
  of values, `IS NOT NULL`, or a regular expression in the subset that PostgreSQL and JavaScript,
  with the flags `su`, read identically. Any other CHECK has `rule: null`, which tells an API layer
  that a validator must cover it.
- A rule is read only when it agrees with its CHECK on every non-null value: an enforced CHECK on
  one column, NOT VALID ones included, in a documented shape, under a deterministic collation, on a
  type whose comparisons the rule describes. Columns under a nondeterministic collation, and
  `citext`, `char(n)`, and `real` columns, keep only `notNull`; a NOT ENFORCED CHECK has no rule.
- Range bounds keep every digit as decimal text, and lengths count code points.
- The recognizer is tested against the exact text PostgreSQL 14 and 18 deparse, and its rules
  against the database's own verdict on values around every bound.
