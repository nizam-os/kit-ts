# ADR 0019: Record and bulk actions are a model over the declaration, and a selection writes in one request

- Status: accepted; superseded in part by ADR 0020 (a selection's writes fan out over the per-id
  endpoints under the suite's API contract; the action model stands)
- Date: 2026-10-12

## Context

ADR 0018 placed record and bulk actions in the model, with their mutations in the query binding, and
ADR 0015 named Atomic Operations for bulk writes. A screen offers a record's actions in its row,
such as archiving or removing it, and a selection's actions in a bar. Each action has a label, a
tone, a confirmation, a reason when it is unavailable, the write it makes, and the place its refusal
lands.

Measured on 2026-10-12 against the contacts application:

- The operations endpoint answers a refused operation at its index and rolls every operation back:
  `409 CONTACT_EMAIL_TAKEN` at `/atomic:operations/1/data/attributes/email`, `403 QUOTA_EXCEEDED` at
  `/atomic:operations/1`, `404 NOT_FOUND` at `/atomic:operations/0`.
- A form model's `errors(error)` reads `/data/...` pointers only: the same `409` at an operation's
  pointer lands in the banner (`{ fields: {}, form: ['E-Mail taken.'] }`), losing the record and the
  field.
- A table's selection is the ids of its rows, kept across pages (SPEC 20.7), not the records.

Prior art agrees on an action's parts:

- Filament's actions: a `label`, a `color`, `requiresConfirmation`, a form in the modal (`schema`),
  `visible` and `hidden`, `disabled`, and `authorize` through a policy, whose message
  `authorizationTooltip` shows on the disabled trigger.
- react-admin's `BulkUpdateButton` and `BulkDeleteButton`: the `data` to write to the selection, a
  `confirmTitle` and `confirmContent`, and an "XX elements updated" notification, a text that takes
  the count.
- Another application's actions kit: one object per action, placed in a row menu or a bar alike over
  a generic target, a record or a selection; a disabled reason shown as a tooltip; a `can` the
  application injects; dialogs rendered at the application's root. Its bulk actions send one request
  per record and summarize "N succeeded, M failed", and its labels are strings computed once, so a
  locale change does not reach them.

@ref https://filamentphp.com/docs/4.x/actions/overview @ref
https://marmelab.com/react-admin/Buttons.html @ref https://jsonapi.org/ext/atomic/#processing

## Decision

- **Two models.** `recordActions(resource, options)` and `bulkActions(resource, options)` in
  `@netvark/resource-ui` describe the actions the application names, each a removal or an update
  with fixed values. The declaration must serve the write: `remove` or `update` declared, values of
  members the update writes that its write validator accepts. The types refuse any other, and so
  does each function, with `TypeError`, before it returns.
- **Texts are the application's message functions**, held as given and called when the screen
  renders (ADR 0014): the `label`, the confirmation's `title`, `body`, and `confirm`, and `done`,
  the text of a committed write. A record action's texts take the record, a bulk action's
  `{ count }`. The tone, `danger` for a removal, is stated once, on the action.
- **Availability is computed per target.** `state(target)` is `{ visible, disabled, reason }`: an
  action is visible when the injected `can(name)` returns `true`, anything else hiding it, and a
  record action's `hidden(record)` does not; it is disabled by its `disabled(target)`, `true` or a
  reason, and a bulk action also when the selection is empty or holds more than the cap of one
  request, the definitions' `atomic.max` (jsonapi ADR 0023), with the reason `tooMany({ max })`
  gives. Without `can`, every action is visible: the server authorizes every write.
- **A record action makes the client's own call.** Its `variables(record)` are the variables of
  `resourceQueries`' `update` or `remove` mutation, as its `call` names, so it works against any
  server of the definitions.
- **A selection writes in one Atomic Operations request.** A bulk action's `operations(ids)` are one
  operation per id, built with `operationsOf` (jsonapi ADR 0022) and sent through
  `operationsMutation`, so the selection commits whole or not at all. No write is fanned out.
- **A refusal lands where it points.** A record action's `errors(error)` places each error object as
  a form model does (SPEC 20.4), on the members the action writes. A bulk action's
  `errors(error, ids)` reads each object's operation (`operationOf`) and places it on the record at
  that index, and by the rest of its pointer on the field; an object that names no operation is the
  selection's. The texts are the server's, in the language the request asked for.
- **No state.** The models hold no pending flag, no error, and no hook. The screen's mutation holds
  the request's state, and the screen renders the triggers and the confirmation where it chooses.

## Consequences

A screen builds its row menu and its selection bar from two models and keeps its own markup. A bulk
write never leaves part of a selection changed, so there is no partial result to report, and a
refusal shows on the row it names. A record action's request is the single call, while a bulk
action's needs the operations endpoint, which `@netvark/hono-resource` serves. Texts and `disabled`
see a selection's ids and count, not its records. Values a person chooses for a selection, such as a
status picked in a dialog, are left to a later change: a form over chosen members that starts blank
and writes each of them. For one record, that form is an update form already (SPEC 20.3).
