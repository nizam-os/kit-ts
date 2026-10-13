---
'@nizam-os/resource-core': minor
---

Error responses can be localized with the application's i18n library.
`defineMessages(resources, appErrors, messages)` takes one object of message functions, so Paraglide
JS's compiled messages fit as they are: a title and a detail for every code no resource derives and
for every constraint kind the resources have, a message for each of the thirteen issue kinds, a
label for every public member, and a label for every option. A missing or unknown key fails `tsc`,
and so does a message whose variables, in any locale, are not the inputs its kind receives (`field`,
`fields`, `limit`, `values`, `format`, `type`). `localizeErrors(messages, { resource })` is a
`transform` for the ban handler that rewrites each JSON:API error object's `title` and `detail` from
its code, its item's issue kind, the member its pointer names, and the labels of a constraint's
members and of the allowed options, never echoing a member name the request invented; codes,
statuses, pointers, and `meta` stay. The locale is the message functions' own, so with Paraglide it
is the one `paraglideMiddleware` resolved. `defaultMessages(resources, appErrors?)` gives complete
English messages. The new types are `MessagesFor`, `Messages`, `Message`, `Label`, `ErrorText`,
`CodeInputs`, `ConstraintInputs`, `IssueInputs`, `LocalizeErrorsOptions`, and `ErrorTransform`.
