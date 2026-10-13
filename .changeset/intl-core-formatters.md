---
'@nizam-os/intl-core': minor
---

`createIntl({ locale, timeZone, formattingLocales, cacheSize })` returns formatters for dates, date
ranges, numbers, relative times, lists, display names, plural categories, and collation. Each call
reads the locale, and a date call the reader's time zone, from the getters you pass, so one set of
formatters serves concurrent requests on a server and the document in a browser. Each call formats
through an `Intl` object built for the locale's formatting tag, such as
`ar-SA-u-ca-gregory-nu-latn`, so the calendar and the digits no longer depend on the engine, and the
last 256 objects are reused. Numeric text, such as a PostgreSQL `numeric`, formats with every digit.
