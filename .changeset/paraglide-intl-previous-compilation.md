---
'@nizam-os/paraglide-intl': patch
---

A compile given `previousCompilation` no longer cleans the output directory first: it writes the
files whose content changed, keeps the rest, and deletes the ones the previous compile wrote and
this one does not. With the default `cleanOutdir`, it used to leave only the changed files.
