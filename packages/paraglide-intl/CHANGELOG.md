# @nizam-os/paraglide-intl

## 0.1.0

### Minor Changes

- [#171](https://github.com/nizam-os/kit-ts/pull/171) [`46d4bc9`](https://github.com/nizam-os/kit-ts/commit/46d4bc991b3b8867bd22a1b688c41a0ad1ebccd0) Thanks [@ali-issa](https://github.com/ali-issa)! - First release: `compile(options)` compiles a Paraglide JS project with every interpolated value
  wrapped in U+2068 FIRST STRONG ISOLATE and U+2069 POP DIRECTIONAL ISOLATE, so a value displays in
  place in left-to-right and right-to-left text, whatever its direction. It takes Paraglide's compiler
  options plus `isolate`, `true` by default, `false`, or the locales to isolate; patterns rewrite in
  memory, so the message files stay as they are. The project loads with the `@inlang/sdk` that
  `@inlang/paraglide-js` 2.11 or later depends on, and the compiled JavaScript, TypeScript, and JSON
  spell every bidi control as a `\u` escape. The package re-exports `@nizam-os/intl-core`.

- [#171](https://github.com/nizam-os/kit-ts/pull/171) [`6b0ebdc`](https://github.com/nizam-os/kit-ts/commit/6b0ebdc45173cd7ac45fd05db00aceec8d0282ba) Thanks [@ali-issa](https://github.com/ali-issa)! - `compile()` refuses, before it writes anything, a message that formats a value itself: an expression
  or a local declaration annotated with `number`, `datetime`, `date`, `time`, `relativetime`, or the
  ICU plugin's `icu:pound` for `#`, which Paraglide formats with the message's bare locale code and
  the runtime's time zone. The `MessageFormattingError` lists every finding by message key, locale,
  variable, and annotation, and holds them in `findings`. Format the value with `@nizam-os/intl-core`
  and interpolate the string; a plural still selects its variant on the raw count.
  `formatters: 'allow'` turns the refusal off.

- [#171](https://github.com/nizam-os/kit-ts/pull/171) [`878a8e6`](https://github.com/nizam-os/kit-ts/commit/878a8e6762dba452bb0116fbcda2e363e3c7f8c4) Thanks [@ali-issa](https://github.com/ali-issa)! - `watch()` compiles as `compile()` does, then again whenever the settings, a catalog, a plugin loaded
  from disk, or another file the project load read changes, so a dev server serves the messages with
  their isolates as the build does. It resolves once the first compile has finished, compiles once per
  save after events settle for 100 ms, and leaves alone a file no load read, such as an editor's swap
  file. With `cleanOutdir`, the first compile starts from the files already in `outdir` instead of
  removing it. A compile that throws goes to `onError` (`console.error` by default) and the watch goes
  on; `onCompile` receives each result. `close()` waits for a compile that runs and stops watching.
  The README shows it in a Vite plugin and in a script.

### Patch Changes

- [#171](https://github.com/nizam-os/kit-ts/pull/171) [`a2f6c04`](https://github.com/nizam-os/kit-ts/commit/a2f6c040054ab37f491485ac5dda68530b7be4ca) Thanks [@ali-issa](https://github.com/ali-issa)! - A compile given `previousCompilation` no longer cleans the output directory first: it writes the
  files whose content changed, keeps the rest, and deletes the ones the previous compile wrote and
  this one does not. With the default `cleanOutdir`, it used to leave only the changed files.
- Updated dependencies [[`608b235`](https://github.com/nizam-os/kit-ts/commit/608b2354f641864f9a9077750d5ad806c60ebe8f), [`fa0c8ee`](https://github.com/nizam-os/kit-ts/commit/fa0c8eefb77037e7423733875d76d48266b2e2c8), [`0b9c5c8`](https://github.com/nizam-os/kit-ts/commit/0b9c5c8335b6a52790d569917cca11dcd4b44d25)]:
  - @nizam-os/intl-core@0.1.0
