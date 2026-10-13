# @nizam-os/paraglide-intl

[Paraglide JS](https://inlang.com/m/gerre34r/library-inlang-paraglideJs) messages whose interpolated
values display in place in left-to-right and right-to-left text. `compile()` is Paraglide's
`compile()` with one step added: before Paraglide compiles the project, every interpolated value of
every message is wrapped in Unicode isolates. `watch()` compiles again on each change during
development. It re-exports
[`@nizam-os/intl-core`](https://www.npmjs.com/package/@nizam-os/intl-core), which formats dates and
numbers and isolates values in your own strings. The rules are written down in
[`docs/intl/SPEC.md`](https://github.com/nizam-os/kit-ts/blob/main/docs/intl/SPEC.md), and the
decisions, with their measurements, in
[`docs/intl/adr`](https://github.com/nizam-os/kit-ts/tree/main/docs/intl/adr).

## Install

```bash
pnpm add -D @nizam-os/paraglide-intl @inlang/paraglide-js
```

A build-time tool for Node 22.12+, Bun, and Deno 2.6.10+, with `@inlang/paraglide-js` 2.11 or later
as its peer. It loads your project with the inlang SDK that your Paraglide itself depends on, so
there is no SDK to install or match: a Paraglide release that moves to a new SDK major works as it
is. Application code imports the formatters from `@nizam-os/intl-core`, because this package's entry
also loads Paraglide's compiler.

On an older Deno, a compile with inlang SDK 3.1 or 4 finishes but the process does not exit, as with
Paraglide's own compile: the SDK runs its database in a `node:worker_threads` worker, and Deno
before 2.6.10 did not unref a worker reliably
([denoland/deno#32161](https://github.com/denoland/deno/pull/32161)). Run a compile or watch script
on Deno with `--allow-read --allow-write --allow-env`: it reads the project and its plugins, writes
the output, and Paraglide's logger reads `TERM` and the variables that name a CI provider.

## Compile

```ts
// scripts/compile-messages.ts
import { compile } from '@nizam-os/paraglide-intl';

const { warnings } = await compile({
  project: './project.inlang',
  outdir: './src/lib/paraglide',
  strategy: ['cookie', 'baseLocale'],
});
for (const warning of warnings) console.warn(warning);
```

```json
{
  "scripts": {
    "build": "node scripts/compile-messages.ts && vite build"
  }
}
```

`compile()` takes Paraglide's compiler options, the same ones its `compile()`, CLI, and bundler
plugins take, and returns `{ outputHashes, warnings }`: pass the result back as
`previousCompilation` and only the files whose content changed are written, the directory is not
cleaned first, and files the previous compile wrote and this one does not are deleted. `warnings`
are the project's errors that did not stop the compile, such as a plugin that failed to import.
Compiles run one at a time, as Paraglide's do.

With the message `"Shared by {name} ({count})"`, `m.shared_by({ name: 'محمد', count: 2 })` returns
`'Shared by \u2068محمد\u2069 (\u20682\u2069)'`. In a sentence, the name and the count are each a
neutral unit in place: without the isolates, `(2)` displays before the Arabic name, because the
digits take their direction from the strong character before them
([UAX #9, W2 and W7](https://www.unicode.org/reports/tr9/#W2)). What is isolated:

- Every expression of a pattern that has more than one part, in every locale: the direction of a
  value is the data's, not the locale's. A plural still selects on the raw count; the count is
  isolated where the message prints it. Markup keeps its place.
- Not a message that is only the value, such as `"{name}"`: there is no surrounding text.
- `isolate: false` turns it off, and `isolate: ['ar']` limits it to the locales listed, each of
  which the project must declare.

Your catalogs are never changed. As it loads the project, the inlang SDK writes its own files into
`project.inlang` (`.gitignore`, `.meta.json`, `README.md`, `.lix/README.md`), as it does for
Paraglide's own compile. The compiled code writes U+2068 and U+2069, and any other bidi control a
catalog holds, as `\u` escapes, so the generated files show them instead of hiding them; the
messages return the same strings.

### A message never formats

Paraglide formats a value annotated in a message, such as `{amount: number}` and `{when: datetime}`,
or `{amount, number}`, `{when, date}`, and `#` in an ICU catalog, with the message's bare locale
code and, for a date, the runtime's time zone: the digits and the calendar depend on the engine, and
a date can render one way on the server and another in the browser. `compile()` refuses such a
message before it writes anything, with a `MessageFormattingError` that lists each one and holds
them in `findings`:

```text
compile: 2 values are formatted inside messages, with the engine's defaults; format each with @nizam-os/intl-core and interpolate the string, or pass formatters: 'allow'
  total (ar): amount: number
  total (en): amount: number
```

Format the value with `@nizam-os/intl-core` and interpolate the string. A plural still selects its
variant on the raw count, so pass the count and its text:

```json
{
  "total": "Total: {amount}",
  "items": [
    {
      "declarations": ["input count", "input countText", "local countPlural = count: plural"],
      "selectors": ["countPlural"],
      "match": {
        "countPlural=one": "{countText} item",
        "countPlural=other": "{countText} items"
      }
    }
  ]
}
```

```ts
// intl: createIntl() from @nizam-os/intl-core, created once at module scope
m.total({ amount: intl.number(1234.5, { style: 'currency', currency: 'SAR' }) });
m.items({ count, countText: intl.number(count) });
```

In an ICU catalog, write `{countText}` where `#` was:
`{count, plural, one {{countText} item} other {{countText} items}}`. `formatters: 'allow'` turns the
refusal off, for a project that accepts the engine's defaults.

### In place of Paraglide's CLI and bundler plugin

Paraglide's bundler plugins and its CLI call Paraglide's own `compile()`, which writes the messages
without isolates: replace `paraglide-js compile` in your scripts with your compile script, and
remove `paraglideVitePlugin` (or the webpack, Rollup, Rolldown, esbuild, or Rspack plugin) from your
bundler configuration, since it would overwrite the output. Run the compile script before the
bundler in `build`, and `watch()` in development.

## Watch during development

`watch()` compiles as `compile()` does, then again whenever the project changes, and resolves once
the first compile has finished. In Vite, start it from `configureServer`, which Vite awaits before
the dev server starts and calls once, even with an SSR environment, and close it in `buildEnd`,
which Vite calls when the dev server closes:

```ts
// vite.config.ts
import type { Plugin } from 'vite';

import type { Watcher } from '@nizam-os/paraglide-intl';

import { defineConfig } from 'vite';

import { watch } from '@nizam-os/paraglide-intl';

/** Compiles the messages before the dev server starts, and again on each change. */
function messages(): Plugin {
  let watcher: Watcher | undefined;
  return {
    name: 'messages',
    apply: 'serve',
    async configureServer() {
      watcher = await watch({ project: './project.inlang', outdir: './src/lib/paraglide' });
    },
    async buildEnd() {
      await watcher?.close();
    },
  };
}

export default defineConfig({ plugins: [messages()] });
```

Vite serves each compile as it lands: the dev server reloads the changed message modules. Without
Vite, run a script beside your dev server:

```ts
// scripts/watch-messages.ts
import process from 'node:process';

import { watch } from '@nizam-os/paraglide-intl';

const watcher = await watch({
  project: './project.inlang',
  outdir: './src/lib/paraglide',
  onCompile: ({ warnings }) => {
    for (const warning of warnings) console.warn(warning.message);
  },
});
process.once('SIGINT', () => void watcher.close());
```

On Ctrl-C, `close()` lets a compile that runs finish and stops watching, and the process exits on
its own. Both examples are measured with Vite 8.3 on Node 24, Bun 1.4, and Deno 2.9.

- **What is a change.** Each compile records what loading the project read: the settings, every file
  in `project.inlang`, the catalogs, a plugin loaded from disk. A change to any of them compiles
  again; a file next to them that no load read, such as an editor's swap file, does not. Saves
  within 100 ms of each other compile once, and a change made while a compile runs compiles again
  when it ends.
- **A compile that throws** goes to `onError`, which writes it to the console unless you pass one: a
  message that formats, or a catalog saved half-written. The output keeps the last compile, and the
  watch goes on: fix the file and it compiles again. `onCompile` receives each result, with its
  `warnings`.
- **The output directory is never removed under the dev server.** With `cleanOutdir`, the default,
  the first compile starts from the files already in `outdir`, as Paraglide's CLI and plugins do: it
  rewrites the files that changed and deletes the ones it no longer writes. A dev server restarted
  over a current output rewrites none.
- **Expect a compile per change, not per keystroke.** An edit compiles in under a second on a
  project of 85 messages, and in about 3 to 4 seconds on one of 2,120 (Node 24, Bun 1.4, Deno 2.9).
  Paraglide's bundler plugins compile with `outputStructure: 'locale-modules'` in development: one
  module per locale instead of one per message, 10 files instead of 2,129 for those 2,120 messages,
  which a dev server would otherwise serve one by one
  ([opral/paraglide-js#486](https://github.com/opral/paraglide-js/issues/486)). Pass it to `watch()`
  for the same, and keep the default for the build.
- **File events come from the operating system.** A network file system or a container's bind mount
  may not deliver them
  ([Node's `fs.watch` caveats](https://nodejs.org/docs/latest-v24.x/api/fs.html#availability)): run
  the compile script after each edit there.

## Best practices

- **Compile in the build, watch in development, never by hand.** Paraglide's output directory
  ignores itself in git (`emitGitIgnore`), so every checkout compiles it, from the catalogs, with
  the isolates.
- **Expect the isolates in tests** that compare a message with a value: `isolate(name)` from this
  package, or `'\u2068'` and `'\u2069'` around the value. Text copied from the page carries them
  too, so strip U+2066 to U+2069 from text a user pastes into a search field.
- **Remove bidi controls from names and other text you accept from users**, where you accept it:
  `value.replace(/\p{Bidi_Control}/gu, '')`. A value with an unmatched U+2069 of its own closes the
  isolate early
  ([ADR 0006](https://github.com/nizam-os/kit-ts/blob/main/docs/intl/adr/0006-every-interpolated-value-is-isolated-in-every-locale.md)).
- **Format in code, not in the message**: dates and numbers through `@nizam-os/intl-core`, so a
  value reads the same in a sentence as in a table cell, and the plural on the raw count.
- **Never interpolate into a message that is not displayed as text**: a URL, an `href`, an
  identifier. The isolates are characters and travel with the string.
- **Check catalogs with `inlang check`** in CI: Paraglide renders the base locale for a missing
  translation and the message key for a missing plural form
  ([ADR 0009](https://github.com/nizam-os/kit-ts/blob/main/docs/intl/adr/0009-catalog-consistency-is-left-to-inlang-check.md)).

## License

MIT
