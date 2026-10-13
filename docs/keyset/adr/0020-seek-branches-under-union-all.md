# ADR 0020: A seek of two or more branches runs as one select per branch, joined with `union all`

- Status: accepted
- Date: 2026-10-12

## Context

ADR 0016 leads the seek with a range on the first key, which an index uses to start its scan at the
cursor. The range narrows the first key only. Inside a tie of the first key, every entry of the tie
before the cursor passes the range, and the disjunction filters it out. After a value of a nullable
first key there is no range at all, since the rows after a value include the key's nulls. On stern
(PostgreSQL 14, 20 000 contacts in one organization, page size 100, 10 000 rows down, issue #101),
`-createdAt` over 20 000 equal timestamps read 10 101 index entries in 3.6 ms, and `-title`, a
nullable column, read 10 101 in 3.8 ms after a value; `name`, with few ties, read 102.

PostgreSQL starts an index scan only from conditions joined by `and`, and the conditions on the
later keys all sit inside the disjunction. Each disjunct alone is a conjunction, equality on the
keys before one key and a bound on that key, which an index on the sort holds as a range. GitLab's
keyset pagination runs the disjuncts that way: "`OR` queries are difficult to optimize in
PostgreSQL. We generally advise using `UNION` queries instead." A union keeps no order: it appends
its operands "although there is no guarantee that this is the order in which the rows are actually
returned", and an operand with its own `limit` has to be in parentheses, or the `limit` applies to
the whole union. @ref https://docs.gitlab.com/development/database/keyset_pagination/ @ref
https://www.postgresql.org/docs/current/queries-union.html

A row-value comparison, `(k_1, ..., k_n) > (v_1, ..., v_n)`, is a single condition an index takes,
but only when every key has the same direction and none is nullable. ADR 0008 appends the key
ascending, so `-createdAt` is mixed, and a nullable key would still need its nulls apart. @ref
https://use-the-index-luke.com/sql/partial-results/fetch-next-page

Three shapes were measured on PostgreSQL 14.19 over a table shaped like stern's contacts, 20 000
rows in one organization, page size 100, 10 000 rows down, with the indexes of issue #101 (shared
buffers read, and execution time):

| Page                              | Range and disjunction | A select per branch, `union all` | Key-only branches, rows joined back with `in` |
| --------------------------------- | --------------------- | -------------------------------- | --------------------------------------------- |
| `-createdAt`, every value equal   | 2 110, 3.5 ms         | 32, 0.14 ms                      | 310, 0.7 ms                                   |
| `-title`, nullable, after a value | 10 162, 4.8 ms        | 111, 0.13 ms                     | 606, 3.6 ms                                   |

For `-title` the planner joined the semi join's 202 keys to a sequential scan of the organization's
20 000 rows.

## Decision

- keyset-core splits a seek into branches (`seekBranches`, SPEC 6.2). For each key in order, a
  branch holds equality on every earlier key and a bound on that key: after a value, greater on an
  ascending key and smaller on a descending one; before a value, the reverse; before a null,
  `is not null`. After a value on a nullable key, the key's nulls are a branch of their own
  (`is null`); after a null, the key has no branch. The branches are disjoint, and together they
  select the rows of ADR 0016's seek.
- `QueryPlan.seek` lists the branches: none on a first page; the cursor's branches, those of `after`
  when it is given and of `before` otherwise; with both cursors, the branches of `after`, each also
  holding ADR 0016's predicate for `before`, whose range bounds where each scan ends. When the first
  key is an aggregate, the seek is one branch, ADR 0016's predicate: no index holds an aggregate, so
  every branch would compute it for every row.
- `PlanKey` gains `valueAlias`, `keyset<index>v`: the alias a union selects the key's value under,
  uncast, to order by it. Ordering by the value keeps the key's type and collation, which its text
  would lose. The value aliases are reserved as ADR 0007's aliases are, and stripped from the rows
  with them.
- An adapter adds a single branch to its page select with `where`, as before. Two or more branches
  run as one statement. Each branch is the filtered select where the branch holds, with every key
  selected as text under its alias and as its value under its value alias, ordered by the keys, and
  limited to the plan's limit, in parentheses. The selects are joined with `union all`, and the
  union is ordered by the value aliases in the keys' directions and null placements and limited to
  the plan's limit again. A page therefore reads at most one limit of rows per branch and sorts at
  most that many in all.
- `@nizam-os/kysely-keyset` builds on the caller's query, and Kysely does not parenthesize the query
  a set operation starts from. Its union therefore starts with the caller's query where `false`
  holds: an operand that holds no row and names the union's columns. Every branch follows it.
  `@nizam-os/drizzle-keyset`'s builder parenthesizes every operand, so its first branch leads.
  `@nizam-os/kysely-resource` writes its statement itself.

## Consequences

An index on the sort's columns in the sort's directions, followed by the key, now bounds every
branch, so the pages inside a tie and after a value of a nullable key read about one page of
entries, as the others do since ADR 0016. A page reads at most one limit of rows per branch, and a
seek has at most one branch per key plus one per nullable key. A sort with no index on its first key
reads its rows once per branch instead of once; `@nizam-os/kysely-resource` already warns at boot
about a sortable member that no index serves.

Measured on stern after the change, with the setup of issue #101 and its row security, through
`@nizam-os/kysely-resource`'s own list statement: `-createdAt` inside the tie reads 101 index
entries in 0.17 ms, `-title` after a value 102 in 0.15 ms, and `name` 101 in 0.13 ms, each page
holding the rows an offset over the same order gives. When each branch arrives in the union's order,
the planner merges the branches (`Merge Append`) and stops at the page's limit, so a page reads its
own rows and at most one more per other branch. Inside the tie the planner bounded the key through
the primary key instead, `id > ` the cursor's key, which the equality on the earlier key leaves in
the sort's order.

The SQL of every page with two or more branches changes: the branches, the value aliases, and the
union's order. The rows, their order, and the cursors do not, and neither do the cursor format or
`CURSOR_VERSION`. `QueryPlan.seek` changes from one predicate or `null` to a list, which an adapter
outside this repository has to follow.

A semi join, with key-only branches whose keys select the page's rows with `in`, would have spared
the Kysely binding its empty operand, but it reads every row of the page twice, and its plan rests
on the planner choosing a nested loop: for `-title` it scanned the organization instead. An option
to keep the disjunction, as GitLab's `use_union_optimization` opts in to the union, was left out:
ADR 0016 already asks for an index on every sort, and two statement shapes would double what every
adapter's tests must cover.
