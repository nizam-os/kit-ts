/**
 * The field metadata against PostgreSQL (resource SPEC 8, 15.3): a client
 * that follows `fields` alone sends values PostgreSQL stores as sent, and
 * every value one step past a stated bound or outside the stated options
 * is one PostgreSQL refuses or stores as a different value, as with the
 * schemas, which give the same verdict as the metadata on every probe.
 * Every column type of the oracle's schema, and each relationship's id
 * written into its key, on PGlite and on the server `RESOURCE_PG_URL`
 * names.
 */
import type { PublicCatalog } from '@nizam-os/catalog-core';
import type { DeclaredResource, FieldMeta } from '@nizam-os/resource-core';

import type { ColumnType } from './support/column-type.ts';
import type { MetaProbe } from './support/meta-probes.ts';
import type { OracleDatabase } from './support/oracle-database.ts';

import { isDeepStrictEqual } from 'node:util';

import {
  afterAll,
  beforeAll,
  describe,
  expect,
  expectTypeOf,
  it,
} from 'vitest';

import { columnType } from './support/column-type.ts';
import { fieldProbes, idProbes } from './support/meta-probes.ts';
import { oracleDatabases } from './support/oracle-database.ts';
import {
  Links,
  Numbers,
  Others,
  publicCatalog,
  Texts,
} from './support/oracle-resources.ts';
import { databaseVerdict, disagreement } from './support/oracle-verdicts.ts';
import { parameterText } from './support/pg-text.ts';

/** A column the probes of one member are written into. */
interface Target {
  readonly meta: FieldMeta;
  readonly table: string;
  readonly column: string;
  readonly type: ColumnType;
  readonly probes: ReadonlyArray<MetaProbe>;
  readonly skipped: number;
  /** The schema's verdict on a probe value. */
  readonly accepts: (value: unknown) => boolean;
  /** The value written: a field's value, or an id as its key's value. */
  readonly written: (value: unknown) => unknown;
  readonly givesBack: (read: unknown, value: unknown) => boolean;
}

/** The catalog with its literal types widened, for lookups by name. */
const catalog: PublicCatalog = publicCatalog;

function typeOf(table: string, column: string): ColumnType {
  const definition = catalog.tables[table]?.columns[column];
  if (definition === undefined) {
    throw new Error(`${table}.${column} is not in the oracle's catalog`);
  }
  return columnType(catalog, definition);
}

const metas = (resource: DeclaredResource): ReadonlyArray<FieldMeta> =>
  Object.values(resource.fields);

function fieldTargets(resource: DeclaredResource): ReadonlyArray<Target> {
  const shape = resource.schema.update.shape;
  return metas(resource).map((meta) => {
    const { probes, skipped } = fieldProbes(meta);
    return {
      meta,
      table: resource.table,
      column: meta.column,
      type: typeOf(resource.table, meta.column),
      probes,
      skipped,
      accepts: (value) => shape[meta.name]?.safeParse(value).success === true,
      written: (value) => value,
      givesBack: isDeepStrictEqual,
    };
  });
}

/** An id as its key column's value: a number or a boolean for those keys. */
function keyValue(id: unknown, type: ColumnType): unknown {
  if (type.base === 'bool') {
    return id === 'true';
  }
  return ['int2', 'int4', 'float4', 'float8'].includes(type.base)
    ? Number(id)
    : id;
}

function idTargets(resource: DeclaredResource): ReadonlyArray<Target> {
  const shape = resource.linkage.update.shape;
  return metas(resource).map((meta) => {
    const table = meta.target ?? '';
    const type = typeOf(table, 'id');
    const { probes, skipped } = idProbes(meta);
    return {
      meta,
      table,
      column: 'id',
      type,
      probes,
      skipped,
      accepts: (id) =>
        shape[meta.name]?.safeParse({ type: table, id }).success === true,
      written: (id) => keyValue(id, type),
      givesBack: (read, id) =>
        (typeof read === 'string' ? read : String(read)) === id,
    };
  });
}

const TARGETS: ReadonlyArray<Target> = [
  ...fieldTargets(Texts),
  ...fieldTargets(Numbers),
  ...fieldTargets(Others),
  ...idTargets(Links),
];

async function disagreements(
  database: OracleDatabase,
  target: Target,
): Promise<ReadonlyArray<string>> {
  const found: Array<string> = [];
  for (const { value, admitted, label } of target.probes) {
    const shown = `${label} ${JSON.stringify(value)}`;
    if (target.accepts(value) !== admitted) {
      found.push(`${shown}: the schema and the metadata disagree`);
    }
    const written = target.written(value);
    const verdict = await databaseVerdict(
      database,
      target.table,
      target.column,
      written === null ? null : parameterText(written, target.type),
    );
    const problem = disagreement(
      written,
      admitted,
      verdict,
      target.type,
      (read) => target.givesBack(read, value),
    );
    if (problem !== undefined) {
      found.push(`${shown}: ${problem.replace('the schema', 'the metadata')}`);
    }
  }
  return found;
}

/** Labels of probes that test no stated fact. */
const UNSTATED: ReadonlySet<string> = new Set([
  'null',
  'no elements',
  'a free value',
]);

/** Whether a probe tests a stated fact of the value or of an element. */
const testsStated = ({ label }: MetaProbe): boolean =>
  !UNSTATED.has(label.replace(/^an element: /u, ''));

/** Formats and wire types that hold a value to a form a near miss can leave. */
const FORMS: ReadonlySet<string> = new Set(['date', 'uuid', 'boolean']);

/** Whether metadata states a fact a probe tests: options, a bound, a pattern, fraction digits, or a form. */
function states(
  facts: Pick<
    FieldMeta,
    'limits' | 'options' | 'fractionDigits' | 'format' | 'wire'
  >,
): boolean {
  const { patterns, ...bounds } = facts.limits;
  return (
    facts.options !== null ||
    facts.fractionDigits !== null ||
    patterns.length > 0 ||
    Object.values(bounds).some((bound) => bound !== null) ||
    FORMS.has(facts.format ?? facts.wire)
  );
}

describe('the probes the field metadata gives', () => {
  it("test every stated bound, option, fraction digit, and form of the oracle's columns", () => {
    const unprobed = TARGETS.filter(
      ({ meta, probes, skipped }) =>
        skipped > 0 ||
        ((states(meta) || (meta.items !== null && states(meta.items))) &&
          !probes.some((probe) => testsStated(probe))),
    );
    expect(unprobed.map(({ table, column }) => `${table}.${column}`)).toEqual(
      [],
    );
    const stated = TARGETS.filter(({ probes }) =>
      probes.some((probe) => testsStated(probe)),
    );
    // A citext key and a numeric key without a scale state nothing a probe tests.
    expect(stated.length).toBe(47);
  });

  it("describe a bool key's ids and the options, as the emitted declarations type them", () => {
    expect(Links.fields.boolean.options).toEqual(['true', 'false']);
    expectTypeOf(Links.fields.boolean.options).toEqualTypeOf<
      ReadonlyArray<'true' | 'false'>
    >();
    expectTypeOf(Links.fields.mood.options).toEqualTypeOf<
      ReadonlyArray<'happy' | 'sad' | 'angry'>
    >();
    expectTypeOf(Texts.fields.status.options).toEqualTypeOf<
      ReadonlyArray<'open' | 'closed' | 'held' | 'lost'>
    >();
    expect(Texts.fields.status.options).toEqual(['open', 'closed']);
  });
});

for (const [name, open] of oracleDatabases()) {
  describe(`the field metadata on ${name}`, () => {
    let database: OracleDatabase;

    beforeAll(async () => {
      database = await open();
    });

    afterAll(async () => {
      await database.close();
    });

    it.each(
      TARGETS.map((target) => [`${target.table}.${target.column}`, target]),
    )(
      '%s: the metadata, the schema, and the database agree on every probe',
      async (_where, target) => {
        expect(await disagreements(database, target)).toEqual([]);
      },
    );
  });
}
