---
'@nizam-os/intl-core': minor
---

First release: `isolate(value)` wraps an interpolated value in U+2068 FIRST STRONG ISOLATE and
U+2069 POP DIRECTIONAL ISOLATE, so a right-to-left name no longer pulls the digits and punctuation
after it out of place, and `FIRST_STRONG_ISOLATE` and `POP_DIRECTIONAL_ISOLATE` name the two
characters.
