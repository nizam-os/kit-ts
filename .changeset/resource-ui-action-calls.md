---
'@nizam-os/resource-ui': patch
---

Type each action of a model by the call its write makes. `recordActions` and `bulkActions` typed
every action as either write the declaration serves, so
`update.mutate(rowActions.archive.variables(contact))` did not compile until the screen narrowed on
`call`. They now infer, by name, what each action gives as `remove`: `true` types a removal, nothing
or `undefined` an update, and an action typed as its init before the call either write. Every action
is still checked against its init, so a member no action takes or an attribute no update writes
stays an error. `RecordActions` and `BulkActions` take each name's `ActionCall`, now exported, and
`RecordActionsOptions` and `BulkActionsOptions` take what each action gives as `remove` in place of
the names.
