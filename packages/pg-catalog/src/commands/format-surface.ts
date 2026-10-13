/**
 * `formatSurface(report, file)` (SPEC 10.4): a `checkSurface` report as
 * text for people, the breaking changes first. Like `formatRules`', the
 * text may change between minor versions; the report is the format for
 * machines.
 * @packageDocumentation
 */
import type { SurfaceChange } from '@nizam-os/resource-core/openapi';

import type { SurfaceCheckReport } from './surface';

import { plural, showShort } from './show-value';

/** A path segment printed as is; any other is quoted, as an option such as `in progress` needs. */
const PLAIN_SEGMENT = /^[\p{L}\p{N}_-]+$/u;

const MARKS: Readonly<Record<SurfaceChange['change'], string>> = {
  added: '+',
  removed: '-',
  changed: '~',
};

function pathText(path: ReadonlyArray<string>): string {
  return path
    .map((segment) =>
      PLAIN_SEGMENT.test(segment) ? segment : JSON.stringify(segment),
    )
    .join('.');
}

function changeLine(change: SurfaceChange): string {
  const line = `  ${MARKS[change.change]} ${pathText(change.path)}`;
  return change.change === 'changed'
    ? `${line}: ${showShort(change.before)} -> ${showShort(change.after)}`
    : line;
}

function section(
  heading: string,
  changes: ReadonlyArray<SurfaceChange>,
): ReadonlyArray<ReadonlyArray<string>> {
  return changes.length === 0
    ? []
    : [[heading, ...changes.map((change) => changeLine(change))]];
}

/**
 * `<file>: no changes`, `<file>: missing; write it with pg-catalog
 * surface`, or the summary line, `<file>: <n> changes, <b> breaking` (or
 * `none breaking`), then, after a blank line, the `Breaking` and the
 * `Safe` changes, one per line, two spaces in: `+` for an addition, `-`
 * for a removal, or `~`, then the path, and for a changed value
 * `: <before> -> <after>` (JSON, cut after 60 characters); then a line
 * saying how to record them.
 */
export function formatSurface(
  report: SurfaceCheckReport,
  file: string,
): string {
  if (report.status === 'missing') {
    return `${file}: missing; write it with pg-catalog surface`;
  }
  if (report.status === 'unchanged') {
    return `${file}: no changes`;
  }
  const breaking = report.changes.filter((change) => change.breaking);
  const safe = report.changes.filter((change) => !change.breaking);
  const counted = breaking.length === 0 ? 'none' : String(breaking.length);
  return [
    [
      `${file}: ${plural(report.changes.length, 'change')}, ${counted} breaking`,
    ],
    ...section('Breaking', breaking),
    ...section('Safe', safe),
    ['Run pg-catalog surface to record them.'],
  ]
    .map((lines) => lines.join('\n'))
    .join('\n\n');
}
