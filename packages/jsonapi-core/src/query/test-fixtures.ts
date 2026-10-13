/**
 * Fixtures shared by the query parser tests: a small graph of definitions
 * and a helper that returns the error objects a parse throws with.
 */
import type { ErrorObject } from '../document/types';
import type { AnyResource } from '../resource/types';

import { expect } from 'vitest';

import { isBanError } from '@nizam-os/ban-core';

import { errorObjects } from '../errors/json-api-error';
import { defineResource } from '../resource/define-resource';
import { parseQuery } from './parse-query';

export interface Row {
  readonly id: string;
}

export const People: AnyResource = defineResource({
  type: 'people',
  attributes: ['name', 'age'],
  relationships: {
    company: {
      type: 'companies',
      cardinality: 'one',
      resource: () => Companies,
    },
  },
  serialize: (row: Row) => ({ id: row.id }),
  query: { include: ['company'] },
});

export const Companies: AnyResource = defineResource({
  type: 'companies',
  attributes: ['name'],
  serialize: (row: Row) => ({ id: row.id }),
});

const Comments: AnyResource = defineResource({
  type: 'comments',
  attributes: ['body'],
  relationships: {
    author: { type: 'people', cardinality: 'one', resource: () => People },
  },
  serialize: (row: Row) => ({ id: row.id }),
});

export const Articles: AnyResource = defineResource({
  type: 'articles',
  attributes: ['title', 'body'],
  relationships: {
    author: { type: 'people', cardinality: 'one', resource: () => People },
    comments: {
      type: 'comments',
      cardinality: 'many',
      resource: () => Comments,
    },
    tags: { type: 'tags', cardinality: 'many' },
  },
  serialize: (row: Row) => ({ id: row.id }),
  query: {
    sort: ['title', 'author.name', 'created'],
    filter: {
      title: ['eq', 'like'],
      'author.name': ['eq'],
      created: ['gt', 'lt'],
    },
    include: ['author', 'comments.author.company'],
    page: { default: 10, max: 50, range: true },
    search: 'filter[q]',
    custom: ['viewAs'],
  },
});

/** Runs the parser and returns the error objects it threw with. */
export function errorsOf(
  input: string,
  resource: AnyResource = Articles,
): ReadonlyArray<ErrorObject> {
  try {
    parseQuery(resource, input);
  } catch (error) {
    if (isBanError(error)) {
      expect(error.status).toBe(400);
      return errorObjects(error);
    }
    throw error;
  }
  throw new Error('expected parseQuery to throw');
}
