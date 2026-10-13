import { PGlite } from '@electric-sql/pglite';
import { Kysely, PGliteDialect } from 'kysely';
import { describe, expect, it } from 'vitest';

import { contractFixture } from '@nizam-os/resource-core/testing';

import { storageOptions } from '../test-support/database';
import { createKyselyStorage } from './create-storage';

/** A Kysely whose PGlite opens on first use, counting how often it opened. */
function lazyDatabase(): { readonly db: Kysely<unknown>; opened: number } {
  const state = {
    db: new Kysely<unknown>({
      dialect: new PGliteDialect({
        pglite: () => {
          state.opened += 1;
          return new PGlite();
        },
      }),
    }),
    opened: 0,
  };
  return state;
}

const { db } = lazyDatabase();
const valid = storageOptions(db);

describe('createKyselyStorage options', () => {
  it('runs no query', () => {
    const lazy = lazyDatabase();
    createKyselyStorage(storageOptions(lazy.db));
    expect(lazy.opened).toBe(0);
  });

  it('keeps the catalog and resolves the outbox schema to public', () => {
    const storage = createKyselyStorage(valid);
    expect(storage.catalog).toBe(contractFixture.catalog);
    expect(storage.outbox).toEqual({
      schema: 'public',
      table: 'contract_outbox',
    });
    expect(Object.isFrozen(storage)).toBe(true);
    expect(Object.isFrozen(storage.outbox)).toBe(true);
  });

  it('keeps the schema an outbox names', () => {
    const storage = createKyselyStorage({
      ...valid,
      outbox: { schema: 'events', table: 'outbox' },
    });
    expect(storage.outbox).toEqual({ schema: 'events', table: 'outbox' });
  });

  it('takes no outbox and no codecs', () => {
    const { codecs: _codecs, outbox: _outbox, ...rest } = valid;
    expect(createKyselyStorage(rest).outbox).toBeUndefined();
  });

  const full = { ...contractFixture.catalog, schemas: ['public'] };
  const cases: ReadonlyArray<{
    readonly option: string;
    readonly options: unknown;
    readonly message: string;
  }> = [
    { option: 'options', options: null, message: 'options must be an object' },
    {
      option: 'a key',
      options: { ...valid, codec: {} },
      message: 'options.codec is not an option',
    },
    {
      option: 'db',
      options: { ...valid, db: undefined },
      message: 'options.db must be a Kysely instance',
    },
    {
      option: 'db',
      options: { ...valid, db: {} },
      message: 'options.db must be a Kysely instance',
    },
    {
      option: 'catalog',
      options: { ...valid, catalog: undefined },
      message:
        'options.catalog must be the public catalog the declarations are built from',
    },
    {
      option: 'catalog',
      options: { ...valid, catalog: full },
      message:
        'options.catalog: a full catalog; pass the public catalog the declarations are built from (toPublicCatalog)',
    },
    {
      option: 'catalog',
      options: { ...valid, catalog: { ...contractFixture.catalog, format: 2 } },
      message: 'options.catalog: format 2 is not supported (expected 3)',
    },
    {
      option: 'catalog',
      options: {
        ...valid,
        catalog: { ...contractFixture.catalog, tables: [] },
      },
      message: 'options.catalog.tables must be an object',
    },
    {
      option: 'codecs',
      options: { ...valid, codecs: [] },
      message:
        'options.codecs must be an object of storage codecs by codec name',
    },
    {
      option: 'codecs',
      options: { ...valid, codecs: { point: null } },
      message: 'options.codecs.point.read must be a function',
    },
    {
      option: 'codecs',
      options: {
        ...valid,
        codecs: { point: { read: () => null, write: 'x' } },
      },
      message: 'options.codecs.point.write must be a function',
    },
    {
      option: 'defineKeyset',
      options: { ...valid, defineKeyset: { cursor: {} } },
      message:
        "options.defineKeyset must be the server's keyset definer: createDefineKeyset({ cursor })",
    },
    {
      option: 'outbox',
      options: { ...valid, outbox: 'outbox' },
      message: 'options.outbox must be { table, schema? }',
    },
    {
      option: 'outbox',
      options: { ...valid, outbox: { table: '' } },
      message: 'options.outbox.table must be a table name',
    },
    {
      option: 'outbox',
      options: { ...valid, outbox: { table: 'outbox', schema: 5 } },
      message: 'options.outbox.schema must be a schema name',
    },
    {
      option: 'outbox',
      options: { ...valid, outbox: { table: 'outbox', shema: 'events' } },
      message: 'options.outbox.shema is not an option',
    },
  ];

  it.each(cases)('refuses $option: $message', ({ options, message }) => {
    expect(() => createKyselyStorage(options as never)).toThrow(
      new TypeError(`createKyselyStorage: ${message}`),
    );
  });
});
