---
'@nizam-os/resource-ui': minor
---

Describe a row's and a selection's actions from the declaration. `recordActions(resource, options)`
and `bulkActions(resource, options)` take actions by name, each a removal or an update with fixed
values, and hold the write to the declaration: it must serve the write, an update's values must set
members its update writes and pass its write validator, and anything else throws `TypeError` before
the model returns. Each action keeps the application's texts as given and reports `state(target)`,
whether it shows by `can` and `hidden` and whether it runs by `disabled`, with a reason for a
tooltip. A record action gives the variables of `resourceQueries`' `update` or `remove`; a bulk
action gives one Atomic Operations operation per selected id for `operationsMutation`, disables a
selection that is empty or over the definition's `atomic.max`, and maps a refusal to the record of
each operation and the member it names.
