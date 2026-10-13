---
'@nizam-os/paraglide-intl': minor
---

`watch()` compiles as `compile()` does, then again whenever the settings, a catalog, a plugin loaded
from disk, or another file the project load read changes, so a dev server serves the messages with
their isolates as the build does. It resolves once the first compile has finished, compiles once per
save after events settle for 100 ms, and leaves alone a file no load read, such as an editor's swap
file. With `cleanOutdir`, the first compile starts from the files already in `outdir` instead of
removing it. A compile that throws goes to `onError` (`console.error` by default) and the watch goes
on; `onCompile` receives each result. `close()` waits for a compile that runs and stops watching.
The README shows it in a Vite plugin and in a script.
