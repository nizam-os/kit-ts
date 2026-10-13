/**
 * `@nizam-os/paraglide-intl`: Paraglide's compile with every interpolated
 * value isolated and every message that formats refused (SPEC 6), its
 * watch mode for development, and the core, re-exported for build scripts.
 * @packageDocumentation
 */
export type { CompileOptions, CompileResult } from './compile-options';
export type { FormattingFinding } from './formatting-annotations';
export type { Watcher, WatchOptions } from './watch';

export * from '@nizam-os/intl-core';
export { compile } from './compile';
export { MessageFormattingError } from './formatting-annotations';
export { watch } from './watch';
