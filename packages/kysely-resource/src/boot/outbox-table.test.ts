/**
 * The outbox problems of boot (resource SPEC 18.3, 18.6): once a behavior
 * has effects, the storage needs an outbox table, and the table the
 * columns the insert writes and the relay reads.
 */
import type { CatalogColumn, CatalogTable } from '@nizam-os/catalog-core';

import type { TestDomain } from '../test-support/domain';

import { describe, expect, it } from 'vitest';

import { createDeclareResource } from '@nizam-os/resource-core';
import { createDomainDefiners } from '@nizam-os/resource-core/server';
import { contractFixture } from '@nizam-os/resource-core/testing';

import { createKyselyStorage } from '../storage/create-storage';
import { withoutTable, withTable } from '../test-support/boot-catalog';
import { bootOptions } from '../test-support/boot-options';
import { storageOptions } from '../test-support/database';
import { BEHAVIORS, LOCKED } from '../test-support/domain';
import { domainDatabase } from '../test-support/domain-database';
import { checkResourceRuntime } from './check-runtime';

const { outbox: _outbox, ...withoutOutbox } = storageOptions(
  domainDatabase().db,
);
const unrecorded = createKyselyStorage(withoutOutbox);

const declareResource = createDeclareResource({
  catalog: contractFixture.catalog,
  codecs: contractFixture.codecs,
  scopes: { workspace: { column: 'workspace_id' } },
});
const { defineResource, definePolicy } = createDomainDefiners<TestDomain>();
const Quiet = declareResource('tasks', {
  operations: ['get', 'create'],
  scope: 'workspace',
  fields: { title: { access: 'readWrite' } },
});
/** A behavior whose create has a server value and a rule, and no effects. */
const QUIET = defineResource(Quiet, {
  policy: definePolicy(Quiet, { get: () => true, create: () => true }),
  operations: {
    create: {
      values: ({ actor }) => ({ created_by: actor.id }),
      rules: [
        ({ input, reject }) => {
          if (input.attributes.title === LOCKED) {
            reject('TASK_LOCKED');
          }
        },
      ],
    },
  },
});

/** `table` with its column `name` changed by `change`. */
function column(
  table: CatalogTable,
  name: string,
  change: (column: CatalogColumn) => CatalogColumn,
): CatalogTable {
  const current = table.columns[name];
  if (current === undefined) {
    throw new Error(`the outbox has no column ${name}`);
  }
  return { ...table, columns: { ...table.columns, [name]: change(current) } };
}

/** `table` without its column `name`. */
function withoutColumn(table: CatalogTable, name: string): CatalogTable {
  const { [name]: _removed, ...columns } = table.columns;
  return { ...table, columns };
}

/** The outbox with a position that has a default and no identity. */
function defaulted(table: CatalogTable): CatalogTable {
  return column(table, 'position', (current) => ({
    ...current,
    identity: null,
    default: { expression: "nextval('outbox_position')", literal: null },
  }));
}

describe('boot: the outbox (resource SPEC 18.3)', () => {
  it('reports effects over a storage created without outbox', async () => {
    const options = await bootOptions();
    expect(
      checkResourceRuntime({ ...options, storage: unrecorded }).problems,
    ).toEqual([
      'tasks: its effects record events, but the storage was created without outbox',
    ]);
  });

  it('asks nothing of the outbox when no operation has effects', async () => {
    const options = await bootOptions();
    const { workspaces, logs } = BEHAVIORS;
    const catalog = withoutTable(options.catalog, 'contract_outbox');
    expect(
      checkResourceRuntime({
        ...options,
        storage: unrecorded,
        catalog,
        resources: { workspaces, logs, tasks: QUIET },
      }).problems,
    ).toEqual([]);
  });

  it('reports an outbox table the catalog lacks', async () => {
    const options = await bootOptions();
    const catalog = withoutTable(options.catalog, 'contract_outbox');
    expect(checkResourceRuntime({ ...options, catalog }).problems).toEqual([
      'tasks: its effects record events, but the catalog has no outbox table public.contract_outbox',
    ]);
  });

  it('reports each column the outbox table lacks or holds as another type', async () => {
    const options = await bootOptions();
    const catalog = withTable(options.catalog, 'contract_outbox', (table) =>
      column(
        column(withoutColumn(table, 'name'), 'version', (version) => ({
          ...version,
          type: 'int8',
        })),
        'payload',
        (payload) => ({ ...payload, array: true }),
      ),
    );
    expect(checkResourceRuntime({ ...options, catalog }).problems).toEqual([
      'tasks: the outbox table public.contract_outbox needs name of type text',
      'tasks: the outbox table public.contract_outbox needs version of type int4',
      'tasks: the outbox table public.contract_outbox needs payload of type jsonb',
    ]);
  });

  it('takes a position with a default or an identity as the primary key, and reports any other', async () => {
    const options = await bootOptions();
    const position = (change: (table: CatalogTable) => CatalogTable) =>
      checkResourceRuntime({
        ...options,
        catalog: withTable(options.catalog, 'contract_outbox', change),
      }).problems;
    const missing = [
      'tasks: the outbox table public.contract_outbox needs position, an int8 primary key with a default or an identity',
    ];
    expect(position(defaulted)).toEqual([]);
    expect(
      position((table) =>
        column(table, 'position', (current) => ({
          ...current,
          identity: null,
        })),
      ),
    ).toEqual(missing);
    expect(position((table) => ({ ...table, primaryKey: null }))).toEqual(
      missing,
    );
    expect(
      position((table) =>
        column(table, 'position', (current) => ({ ...current, type: 'int4' })),
      ),
    ).toEqual(missing);
  });
});
