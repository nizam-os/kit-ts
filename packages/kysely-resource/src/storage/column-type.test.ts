import type {
  PublicCatalog,
  PublicColumn,
  PublicDomain,
} from '@nizam-os/catalog-core';

import { describe, expect, it } from 'vitest';

import { contractFixture } from '@nizam-os/resource-core/testing';

import { columnType } from './column-type';
import { columnOf, tableOf } from './sql';

const { catalog } = contractFixture;
const tasks = tableOf(catalog, contractFixture.resources.tasks);

const domain = (
  type: string,
  typeKind: PublicDomain['typeKind'],
  array: boolean,
): PublicDomain => ({
  schema: 'public',
  name: 'd',
  type,
  typeKind,
  array,
  sqlType: type,
  maxLength: null,
  precision: null,
  scale: null,
  nullable: true,
  default: null,
  constraints: {},
});
const withDomains: PublicCatalog = {
  ...catalog,
  domains: {
    cents: domain('int4', 'base', false),
    cents_list: domain('cents', 'domain', true),
    level: domain('task_priority', 'enum', false),
  },
};
const of = (
  type: string,
  typeKind: PublicColumn['typeKind'],
  array = false,
): PublicColumn => ({
  ...columnOf(tasks, 'title'),
  type,
  typeKind,
  array,
});

describe('columnType', () => {
  it('reads a column of a base type, an enum, and an array', () => {
    expect(columnType(catalog, columnOf(tasks, 'estimate'))).toEqual({
      base: 'numeric',
      enum: false,
      array: false,
    });
    expect(columnType(catalog, columnOf(tasks, 'priority'))).toEqual({
      base: 'task_priority',
      enum: true,
      array: false,
    });
    expect(columnType(catalog, columnOf(tasks, 'tags'))).toEqual({
      base: 'text',
      enum: false,
      array: true,
    });
  });

  it('follows domains to the base type, an array on the way included', () => {
    expect(columnType(withDomains, of('cents', 'domain'))).toEqual({
      base: 'int4',
      enum: false,
      array: false,
    });
    expect(columnType(withDomains, of('cents_list', 'domain'))).toEqual({
      base: 'int4',
      enum: false,
      array: true,
    });
    expect(columnType(withDomains, of('level', 'domain'))).toEqual({
      base: 'task_priority',
      enum: true,
      array: false,
    });
  });

  it('reads citext in any schema as citext', () => {
    expect(columnType(catalog, of('extensions.citext', 'base')).base).toBe(
      'citext',
    );
  });

  it('refuses a domain the catalog does not hold', () => {
    expect(() => columnType(catalog, of('toString', 'domain'))).toThrow(
      new Error('the catalog has no domain toString'),
    );
  });
});
