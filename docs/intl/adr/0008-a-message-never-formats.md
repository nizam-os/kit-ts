# ADR 0008: A message never formats

- Status: accepted
- Date: 2026-10-12

## Context

Paraglide compiles the annotations `number`, `datetime`, `relativetime`, and the ones its ICU plugin
imports (`date`, `time`, and `icu:pound` for `#`) to `registry.*` calls that build an `Intl` object
from the message's locale code and the options written in the message
([`compile-annotation.ts`](https://github.com/opral/paraglide-js/blob/0c6cf2c971b667cedf133dea471101897c8c0ade/src/compiler/compile-annotation.ts),
[`registry.ts`](https://github.com/opral/paraglide-js/blob/0c6cf2c971b667cedf133dea471101897c8c0ade/src/compiler/registry.ts)).
That is the bare code ADR 0004 replaces with a formatting tag, and, for a date, the runtime's zone
ADR 0005 replaces with the reader's. Measured with one compiled message,
`خصم {amount: number style=percent}`, called with `0.25` in `ar` (2026-10-12): Node 24.20 renders
the amount as `25\u200E%\u200E` and Node 18.14 as `٢٥٪\u061C`. `plural` is different: it selects a
variant on the raw number and prints nothing.

## Decision

- `@nizam-os/paraglide-intl`'s `compile()` refuses, before it writes anything, every message that
  formats: an expression or a local declaration annotated with `number`, `datetime`, `date`, `time`,
  `relativetime`, or `icu:pound`. The error lists every finding at once, each with the message's
  key, its locale, and the annotation.
- `formatters: 'allow'` turns the refusal off, for a project that accepts the engine's defaults.
- The application formats with `@nizam-os/intl-core` and interpolates the string; a count keeps
  selecting its plural variant on the number.

## Consequences

A number or a date in a sentence reads the same as the same value in a table cell. An ICU catalog
that uses `#` in plural branches has to pass the formatted count as its own input; the docs show
how.
