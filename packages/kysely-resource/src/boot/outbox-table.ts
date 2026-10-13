/**
 * The outbox problems (SPEC 18.3, 18.6): once any behavior has effects,
 * the storage records events, so it needs an outbox table, and the table
 * needs the columns the insert writes and the relay reads, each of the
 * type they cross the driver as. The message names the first resource
 * whose behavior has effects.
 * @packageDocumentation
 */
import type { CatalogColumn, CatalogTable } from '@nizam-os/catalog-core';
import type { ResourceBehavior } from '@nizam-os/resource-core/server';

import type { BootContext } from './options';

import { ownValue } from '../internal/object';

/** Whether `behavior` records events: an operation of it has effects. */
function hasEffects(behavior: ResourceBehavior): boolean {
  return Object.values(behavior.operations).some(
    (operation) => operation !== undefined && operation.effects.length > 0,
  );
}

function isType(column: CatalogColumn | undefined, type: string): boolean {
  return column?.type === type && !column.array;
}

/** What `table` lacks of the outbox's columns, each as the requirement it fails. */
function missingColumns(table: CatalogTable): ReadonlyArray<string> {
  const position = ownValue(table.columns, 'position');
  const keyed =
    isType(position, 'int8') &&
    table.primaryKey?.length === 1 &&
    table.primaryKey[0] === 'position' &&
    (position?.default !== null || position.identity !== null);
  return [
    ...(keyed
      ? []
      : ['position, an int8 primary key with a default or an identity']),
    ...(isType(ownValue(table.columns, 'name'), 'text')
      ? []
      : ['name of type text']),
    ...(isType(ownValue(table.columns, 'version'), 'int4')
      ? []
      : ['version of type int4']),
    ...(isType(ownValue(table.columns, 'payload'), 'jsonb')
      ? []
      : ['payload of type jsonb']),
  ];
}

/** The outbox problems of the composition; none when no behavior has effects. */
export function outboxProblems(boot: BootContext): ReadonlyArray<string> {
  const recording = boot.resources.find(([, behavior]) => hasEffects(behavior));
  if (recording === undefined) {
    return [];
  }
  const { type } = recording[1].resource.names;
  const { outbox } = boot.config;
  if (outbox === undefined) {
    return [
      `${type}: its effects record events, but the storage was created without outbox`,
    ];
  }
  const name = `${outbox.schema}.${outbox.table}`;
  const table = Object.values(boot.catalog.tables).find(
    (candidate) =>
      candidate.schema === outbox.schema && candidate.name === outbox.table,
  );
  if (table === undefined) {
    return [
      `${type}: its effects record events, but the catalog has no outbox table ${name}`,
    ];
  }
  return missingColumns(table).map(
    (requirement) => `${type}: the outbox table ${name} needs ${requirement}`,
  );
}
