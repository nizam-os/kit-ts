# ADR 0006: Every interpolated value is isolated, in every locale

- Status: accepted
- Date: 2026-10-12

## Context

Text inserted into a sentence takes part in the sentence's bidirectional resolution. An isolate has
"the effect of a neutral like U+FFFC OBJECT REPLACEMENT CHARACTER" outside it, and "the text inside
the isolate has no effect on the ordering of the text outside it, and vice versa"
([UAX #9 revision 52, 2.4](https://www.unicode.org/reports/tr9/#Explicit_Directional_Isolates)).
Without one, rules W2 and W7 resolve European digits by the strong character before them, which may
be inside the inserted value ([UAX #9, W2 and W7](https://www.unicode.org/reports/tr9/#W2)).
Measured with bidi-js 1.1.0, which passes the UAX #9 conformance tests (2026-10-12):

| Paragraph     | Text (value in braces)        | Plain                              | Isolated |
| ------------- | ----------------------------- | ---------------------------------- | -------- |
| left to right | `Shared by {محمد} (2)`        | the `(2)` displays before the name | in order |
| left to right | `Assigned to {محمد}: 5 tasks` | `5 :` displays before the name     | in order |
| right to left | `أرسل {Casey} 5 رسائل`        | `Casey 5` displays as one run      | in order |

The problem exists in both directions, because a value's direction is the data's, not the locale's.
Fluent isolates every placeable with U+2068 FIRST STRONG ISOLATE and U+2069 POP DIRECTIONAL ISOLATE
by default, in every locale, when the pattern has more than one element
([`bundle.ts`](https://github.com/projectfluent/fluent.js/blob/%40fluent/bundle%400.19.1/fluent-bundle/src/bundle.ts#L55),
[`resolver.ts`](https://github.com/projectfluent/fluent.js/blob/%40fluent/bundle%400.19.1/fluent-bundle/src/resolver.ts#L321)).
The W3C equates FSI with `dir="auto"` and applies the controls to plain text such as a `title`
attribute
([How to use Unicode controls for bidi text](https://www.w3.org/International/questions/qa-bidi-unicode-controls)).

## Decision

- `isolate(value)` returns the value between U+2068 and U+2069.
- `@nizam-os/paraglide-intl` isolates every interpolated value of every message in every locale by
  default; `isolate: false` turns it off and a list of locales limits it. A message that is only the
  value (`{name}`) is left bare, as in Fluent: there is no surrounding text to protect.
- A number is isolated like any value: inside an isolate, digits resolve on their own, which is what
  a count next to a name needs. A plural still selects on the raw input.

## Consequences

A compiled string carries two invisible characters per value; a test that compares a message with a
value expects them (`\u2068`, `\u2069`). Text copied from the page carries them too, so a search box
that receives pasted text should strip U+2066 to U+2069; the docs say so. A message used as a URL or
an attribute that is not text (an `href` built from a message) must not interpolate, or must opt its
locale out.

The isolate holds any value whose own isolate controls are balanced. A value that carries an
unmatched U+2069 closes it early, and one that carries an unmatched U+2066, U+2067, or U+2068 takes
the closing U+2069 for itself ([UAX #9, BD9](https://www.unicode.org/reports/tr9/#BD9)), exactly as
inside a `<bdi>` element, where "bidi control codes in the source text are still honored"
([CSS Writing Modes 3, 2.4.2](https://www.w3.org/TR/css-writing-modes-3/#bidi-control-codes)).
Measured with bidi-js 1.1.0, `Shared by {a\u2069\u202Exyz} (2) files` displays everything after the
name reversed. The MessageFormat 2 Default Bidi Strategy
([LDML, Message Format](https://www.unicode.org/reports/tr35/tr35-messageFormat.html#default-bidi-strategy))
and Fluent append the controls around the value as it is, and `isolate` does the same: rewriting the
value would hide data from the application and could not reach the compiled messages, which
interpolate the raw value. Names and other text accepted from users have `\p{Bidi_Control}` removed
where they are accepted; the docs say so.
