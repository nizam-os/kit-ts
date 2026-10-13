/**
 * The oracle (resource SPEC 15.3, ADR 0005, 0006): every boundary fixture
 * of every field of the oracle's schema runs through the field's schema
 * and is written into its column, and the verdicts agree; where the wire
 * form is stricter, PostgreSQL stores a value the read form does not give
 * back as sent. Relationship ids run through the linkage schema and into
 * the key column. Runs on PGlite, and on the server `RESOURCE_PG_URL`
 * names.
 */
import type { PublicCatalog } from '@nizam-os/catalog-core';
import type { DeclaredResource } from '@nizam-os/resource-core';
import type { BoundaryFixture } from '@nizam-os/resource-core/testing';

import type { ColumnType } from './support/column-type.ts';
import type { OracleDatabase } from './support/oracle-database.ts';

import { isDeepStrictEqual } from 'node:util';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { boundaryFixtures } from '@nizam-os/resource-core/testing';

import { columnType } from './support/column-type.ts';
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

const SHOWN = 60;

interface Probe {
  /** The table and column written to. */
  readonly table: string;
  readonly column: string;
  readonly type: ColumnType;
  readonly fixtures: ReadonlyArray<BoundaryFixture>;
  /** The schema's verdict on a fixture value. */
  readonly accepts: (value: unknown) => boolean;
  /** What a fixture value is written as: a field's value, or a relationship's id as the key's value. */
  readonly wire: (value: unknown) => unknown;
  /** Whether a read form gives back exactly the fixture value: the value, or the id's text. */
  readonly givesBack: (read: unknown, value: unknown) => boolean;
}

/** The catalog with its literal types widened, for lookups by name. */
const catalog: PublicCatalog = publicCatalog;

function columnOf(table: string, column: string): ColumnType {
  const definition = catalog.tables[table]?.columns[column];
  if (definition === undefined) {
    throw new Error(`${table}.${column} is not in the oracle's catalog`);
  }
  return columnType(catalog, definition);
}

function fieldProbes(resource: DeclaredResource): ReadonlyArray<Probe> {
  const shape = resource.schema.update.shape;
  return Object.entries(boundaryFixtures(resource).fields).map(
    ([name, fixtures]) => {
      const column = resource.names.fields.get(name) ?? name;
      return {
        table: resource.table,
        column,
        type: columnOf(resource.table, column),
        fixtures,
        accepts: (value) => shape[name]?.safeParse(value).success === true,
        wire: (value) => value,
        givesBack: (read, value) => isDeepStrictEqual(read, value),
      };
    },
  );
}

/** An id as the key column's wire value: a number or a boolean for those keys. */
function keyValue(id: unknown, type: ColumnType): unknown {
  if (type.base === 'bool') {
    return id === 'true';
  }
  return ['int2', 'int4', 'float4', 'float8'].includes(type.base)
    ? Number(id)
    : id;
}

const TARGETS: ReadonlyMap<string, string> = new Map([
  ['smallint_id', 'key_smallints'],
  ['bigint_id', 'key_bigints'],
  ['numeric_id', 'key_numerics'],
  ['real_id', 'key_reals'],
  ['double_id', 'key_doubles'],
  ['boolean_id', 'key_booleans'],
  ['text_id', 'key_texts'],
  ['uuid_id', 'key_uuids'],
  ['date_id', 'key_dates'],
  ['instant_id', 'key_instants'],
  ['mood_id', 'key_moods'],
  ['local_id', 'key_locals'],
  ['code_id', 'key_codes'],
  ['name_id', 'key_names'],
  ['amount_id', 'key_amounts'],
  ['whole_id', 'key_wholes'],
  ['integer_id', 'key_integers'],
]);

function idProbes(resource: DeclaredResource): ReadonlyArray<Probe> {
  const shape = resource.linkage.update.shape;
  return Object.entries(boundaryFixtures(resource).relationships).map(
    ([name, fixtures]) => {
      const column = resource.names.relationships.get(name) ?? name;
      const table = TARGETS.get(column);
      if (table === undefined) {
        throw new Error(`no key table for ${column}`);
      }
      const type = columnOf(table, 'id');
      return {
        table,
        column: 'id',
        type,
        fixtures,
        accepts: (id) =>
          shape[name]?.safeParse({ type: table, id }).success === true,
        wire: (id) => keyValue(id, type),
        givesBack: (read, id) =>
          (typeof read === 'string' ? read : String(read)) === id,
      };
    },
  );
}

const PROBES: ReadonlyArray<Probe> = [
  ...fieldProbes(Texts),
  ...fieldProbes(Numbers),
  ...fieldProbes(Others),
  ...idProbes(Links),
];

function shown(value: unknown): string {
  const text = JSON.stringify(value);
  return text.length > SHOWN ? `${text.slice(0, SHOWN)}...` : text;
}

async function disagreements(
  database: OracleDatabase,
  probe: Probe,
): Promise<ReadonlyArray<string>> {
  const found: Array<string> = [];
  for (const { value, label } of probe.fixtures) {
    const wire = probe.wire(value);
    const verdict = await databaseVerdict(
      database,
      probe.table,
      probe.column,
      parameterText(wire, probe.type),
    );
    const problem = disagreement(
      wire,
      probe.accepts(value),
      verdict,
      probe.type,
      (read) => probe.givesBack(read, value),
    );
    if (problem !== undefined) {
      found.push(`${label} ${shown(value)}: ${problem}`);
    }
  }
  return found;
}

for (const [name, open] of oracleDatabases()) {
  describe(`the oracle on ${name}`, () => {
    let database: OracleDatabase;

    beforeAll(async () => {
      database = await open();
    });

    afterAll(async () => {
      await database.close();
    });

    it.each(PROBES.map((probe) => [`${probe.table}.${probe.column}`, probe]))(
      '%s: the schema and the database agree on every boundary fixture',
      async (_where, probe) => {
        expect(await disagreements(database, probe)).toEqual([]);
      },
    );
  });
}
