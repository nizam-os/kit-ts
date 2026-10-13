/**
 * `formatDiff` (SPEC 10.2): a catalog diff as text for people, grouped by
 * the kind of object each change belongs to. The text may change between
 * minor versions; the `CatalogDiff` itself is the stable machine format.
 * @packageDocumentation
 */
import type {
  CatalogChange,
  CatalogDiff,
  JsonValue,
} from '@nizam-os/catalog-core';

/** The members whose entries are objects, with the heading of their group (SPEC 4). */
const RECORDS: ReadonlyMap<string, string> = new Map([
  ['enums', 'Enums'],
  ['domains', 'Domains'],
  ['tables', 'Tables'],
  ['columns', 'Columns'],
  ['constraints', 'Constraints'],
  ['indexes', 'Indexes'],
  ['policies', 'Policies'],
]);
const GROUPS: ReadonlyArray<string> = [
  'Catalog',
  'Extensions',
  ...RECORDS.values(),
];
const MARKERS = { added: '+', removed: '-', changed: '~' } as const;
const OBJECT_INDENT = '  ';
const MEMBER_INDENT = '      ';

type Marker = (typeof MARKERS)[keyof typeof MARKERS];

/** Where a change belongs: its group, the object's name, and the member path inside the object. */
interface Location {
  readonly group: string;
  readonly object: string;
  readonly member: string;
}

/** One object's line: its marker, the values of a change to the whole object, and its member lines. */
interface Entry {
  marker: Marker;
  value: string | null;
  readonly members: Array<string>;
}

/**
 * The nearest record entry along the path is the object; the names of the
 * entries above it qualify its name, as in `contacts.email`. A member of
 * the catalog itself, such as `extensions` or `schemas`, is its own object.
 */
function locate(path: ReadonlyArray<string>): Location {
  const names: Array<string> = [];
  let group = 'Catalog';
  let end = 0;
  for (let index = 0; index + 1 < path.length; index += 1) {
    const heading = RECORDS.get(path[index] ?? '');
    if (heading !== undefined) {
      names.push(path[index + 1] ?? '');
      group = heading;
      index += 1;
      end = index + 1;
    }
  }
  if (names.length === 0) {
    const [member = ''] = path;
    return {
      group: member === 'extensions' ? 'Extensions' : 'Catalog',
      object: member,
      member: path.slice(1).join('.'),
    };
  }
  return { group, object: names.join('.'), member: path.slice(end).join('.') };
}

function json(value: JsonValue): string {
  return JSON.stringify(value);
}

/** The values of a change: what was expected, what was found, or both. */
function values(change: CatalogChange): string {
  if (change.kind === 'added') {
    return `added ${json(change.actual)}`;
  }
  if (change.kind === 'removed') {
    return `removed ${json(change.expected)}`;
  }
  return `expected ${json(change.expected)}, actual ${json(change.actual)}`;
}

function summary(entries: ReadonlyArray<Entry>): string {
  const counts: Array<string> = [];
  for (const [word, marker] of Object.entries(MARKERS)) {
    const count = entries.filter((entry) => entry.marker === marker).length;
    if (count > 0) {
      counts.push(`${count} ${word}`);
    }
  }
  const noun = entries.length === 1 ? 'object differs' : 'objects differ';
  return `${entries.length} ${noun}: ${counts.join(', ')}`;
}

/** The changes by group and object, each object once, in the order the diff first names it. */
function byObject(
  changes: ReadonlyArray<CatalogChange>,
): ReadonlyMap<string, ReadonlyMap<string, Entry>> {
  const groups = new Map<string, Map<string, Entry>>();
  for (const change of changes) {
    const location = locate(change.path);
    const objects = groups.get(location.group) ?? new Map<string, Entry>();
    groups.set(location.group, objects);
    const entry = objects.get(location.object) ?? {
      marker: MARKERS.changed,
      value: null,
      members: [],
    };
    objects.set(location.object, entry);
    if (location.member !== '') {
      entry.members.push(`${location.member}: ${values(change)}`);
    } else if (change.kind === 'changed') {
      entry.value = values(change);
    } else {
      entry.marker = MARKERS[change.kind];
    }
  }
  return groups;
}

function section(heading: string, objects: ReadonlyMap<string, Entry>): string {
  const lines = [heading];
  for (const [object, entry] of objects) {
    const value = entry.value === null ? '' : `: ${entry.value}`;
    lines.push(`${OBJECT_INDENT}${entry.marker} ${object}${value}`);
    for (const member of entry.members) {
      lines.push(`${MEMBER_INDENT}${member}`);
    }
  }
  return lines.join('\n');
}

/**
 * The diff as text: a summary line, then the changed objects grouped by
 * kind, one line per object marked `+` (only in the live database), `-`
 * (only in the committed catalog), or `~` (different), with a line per
 * changed member giving its path and both values as JSON.
 */
export function formatDiff(diff: CatalogDiff): string {
  if (diff.changes.length === 0) {
    return 'No differences';
  }
  const groups = byObject(diff.changes);
  const entries: Array<Entry> = [];
  const sections: Array<string> = [];
  for (const heading of GROUPS) {
    const objects = groups.get(heading);
    if (objects !== undefined) {
      entries.push(...objects.values());
      sections.push(section(heading, objects));
    }
  }
  return [summary(entries), ...sections].join('\n\n');
}
