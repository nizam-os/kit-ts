# ADR 0014: The React bindings render the application's one messages object

- Status: accepted; applies ADR 0009 to the browser; amended by ADR-0018 (the functions it governs
  are `@nizam-os/resource-ui`'s)
- Date: 2026-10-12

## Context

The epic for `@nizam-os/react-resource` planned a provider taking "the locales from `defineMessages`
and the current language", with `useMessages()` returning the typed messages (issue #45). ADR 0009
decided otherwise for the whole family: there is one messages object per application, every message
is a function that reads the locale itself, and no library of the family parses `Accept-Language` or
holds a locale.

The browser side of Paraglide JS works the same way. `getLocale()` resolves the locale through the
compiled strategies (URL, cookie, `localStorage`, the browser's preferred languages, the base
locale), and a message function calls it when it runs. Changing the locale is a document navigation,
not framework reactivity: `setLocale()` updates the strategies and then navigates to the localized
URL or reloads the document, and `setLocale(locale, { reload: false })` is documented as a
client-only escape hatch. An application that needs another locale source replaces `getLocale` with
`overwriteGetLocale`, once per runtime.

Three facts follow for a client library:

- A text computed when a module loads is frozen in whatever locale was current then. On the server
  that is no request's locale at all: Paraglide keeps the request's locale in `AsyncLocalStorage`,
  which only holds while a request runs. Labels have to be computed when they render.
- A React context for the messages object adds nothing the module does not already give: the object
  is a constant, imported where it is used, and typed by `MessagesFor` with no provider in between.
  A provider would only add a place where the type is lost and a second locale source that can
  disagree with the document's.
- The server already renders the error documents in the request's locale (ADR 0009, SPEC 10.4), and
  `@nizam-os/jsonapi-client` sends that locale on every request when the transport's `language` is
  `getLocale` (jsonapi SPEC 15.2). An error the server returns is in the reader's language before
  the client sees it. What the client renders itself is the issues of its own validation, which
  happen before any request.

@ref https://paraglidejs.com/basics ("Locale switching uses a full document navigation, not
framework reactivity") @ref https://paraglidejs.com/strategy (`overwriteGetLocale`) @ref
https://paraglidejs.com/server-side-rendering

## Decision

- **No provider and no `useMessages`.** Every function of `@nizam-os/react-resource` that renders
  text takes the application's messages object, what `defineMessages` or `defaultMessages` returned,
  as an argument. The application imports it where it builds a form or a list.
- **Texts are computed on call.** A field's label, an option's label, and an issue's message are
  computed when the binding is asked for them, during render, never when a module loads or a model
  is built. A model may be built once; its texts are not.
- **The client renders its own issues with the server's rules.** `@nizam-os/resource-core` gains
  `localizeIssues(messages)`, which gives an issue of `write.create` or `write.update` the detail
  `localizeErrors` gives the item the server makes of the same issue (SPEC 10.5). A value refused in
  the form reads as the server would answer it, in the same words.
- **The server's texts are shown as it wrote them.** A field error from a response is the error
  object's `detail`, which the server localized for the locale the request carried; the binding
  never re-renders it and never shows a JavaScript error's `message`.

## Consequences

Issue #45 changes from a provider to labels, option labels, and issue texts drawn from the one
messages object. An application switches the locale the way Paraglide does it, and every text the
bindings render follows on the next render. A test that needs another locale sets it the way the
application does, through the Paraglide runtime (`overwriteGetLocale`), or passes closures that read
a variable. Messages remain typed by `MessagesFor`; nothing in the bindings widens them.
