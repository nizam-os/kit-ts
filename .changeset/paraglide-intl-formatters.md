---
'@nizam-os/paraglide-intl': minor
---

`compile()` refuses, before it writes anything, a message that formats a value itself: an expression
or a local declaration annotated with `number`, `datetime`, `date`, `time`, `relativetime`, or the
ICU plugin's `icu:pound` for `#`, which Paraglide formats with the message's bare locale code and
the runtime's time zone. The `MessageFormattingError` lists every finding by message key, locale,
variable, and annotation, and holds them in `findings`. Format the value with `@nizam-os/intl-core`
and interpolate the string; a plural still selects its variant on the raw count.
`formatters: 'allow'` turns the refusal off.
