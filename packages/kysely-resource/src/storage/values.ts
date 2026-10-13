/**
 * Values between the wire and PostgreSQL's text (SPEC 18.2): a selected
 * text becomes its member's read form, through the field's storage codec
 * when it has one, and a written value becomes its parameter text the same
 * way. A relationship's text is its target's id.
 * @packageDocumentation
 */
import type {
  PublicCatalog,
  PublicColumn,
  PublicTable,
} from '@nizam-os/catalog-core';
import type { DeclaredResource, FieldMeta } from '@nizam-os/resource-core';
import type { PublicRow } from '@nizam-os/resource-core/server';

import type { TextCodec } from './types';

import { ownValue } from '../internal/object';
import { columnType } from './column-type';
import { parameterText } from './parameter-text';
import { NO_READ_FORM, readForm } from './read-form';
import { columnOf } from './sql';

/** What values convert with: the catalog's types and the storage codecs. */
export interface ValueContext {
  readonly catalog: PublicCatalog;
  readonly codecs: Readonly<Record<string, TextCodec>>;
}

/** A row as the driver returns it, by alias. */
export type Row = Readonly<Record<string, unknown>>;

/** The storage codec named `name`; throws when there is none. */
function codecOf(context: ValueContext, name: string): TextCodec {
  const codec = ownValue(context.codecs, name);
  if (codec === undefined) {
    throw new Error(`no storage codec ${name}`);
  }
  return codec;
}

/** The members a row shows: every field and relationship but a `write` field. */
export function readable(resource: DeclaredResource): ReadonlyArray<FieldMeta> {
  return Object.values(resource.fields).filter(
    (meta) => meta.access !== 'write',
  );
}

function readValue(
  context: ValueContext,
  table: PublicTable,
  resource: DeclaredResource,
  meta: FieldMeta,
  text: unknown,
): unknown {
  if (text === null) {
    return null;
  }
  if (typeof text !== 'string') {
    throw new TypeError(
      `${resource.names.type}.${meta.name}: the driver returned a value that is not text`,
    );
  }
  if (meta.kind === 'relationship') {
    return text;
  }
  if (meta.codec !== null) {
    return codecOf(context, meta.codec).read(text);
  }
  const value = readForm(
    text,
    columnType(context.catalog, columnOf(table, meta.column)),
  );
  if (value === NO_READ_FORM) {
    throw new Error(
      `${resource.names.type}.${meta.name}: the stored value has no read form`,
    );
  }
  return value;
}

/** The public row of a selected row; throws for a value with no read form. */
export function readRow(
  context: ValueContext,
  table: PublicTable,
  resource: DeclaredResource,
  row: Row,
): PublicRow {
  const id = row['id'];
  if (typeof id !== 'string') {
    throw new TypeError(
      `${resource.names.type}: the driver returned an id that is not text`,
    );
  }
  const members = readable(resource).map((meta): readonly [string, unknown] => [
    meta.name,
    readValue(context, table, resource, meta, row[meta.name]),
  ]);
  return { ...Object.fromEntries(members), id };
}

/**
 * The text of a member's value for its column, through its storage codec
 * when it has one; `null` for `null`. A codec's `write` takes the codec's
 * value, which the write schema has parsed, and must return text.
 */
export function writeText(
  context: ValueContext,
  column: PublicColumn,
  meta: FieldMeta | undefined,
  value: unknown,
): string | null {
  if (value === null) {
    return null;
  }
  if (meta?.codec != null) {
    const text: unknown = Reflect.apply(
      codecOf(context, meta.codec).write,
      undefined,
      [value],
    );
    if (typeof text !== 'string') {
      throw new TypeError(
        `storage codec ${meta.codec}: write returned a value that is not text`,
      );
    }
    return text;
  }
  return parameterText(value, columnType(context.catalog, column));
}
