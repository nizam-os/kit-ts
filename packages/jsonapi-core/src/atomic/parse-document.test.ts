import type { OperationTarget } from './types';

import { describe, expect, it } from 'vitest';

import { isBanError } from '@nizam-os/ban-core';

import { errorObjects } from '../errors/json-api-error';
import { parseOperationsDocument } from './parse-document';

const DEFAULTS: Parameters<typeof parseOperationsDocument>[1] = {
  maxOperations: 10,
};

const NO_TARGETS: Record<string, OperationTarget> = {};

function pointersOf(
  body: unknown,
  options: Parameters<typeof parseOperationsDocument>[1] = DEFAULTS,
): Array<string | undefined> {
  try {
    parseOperationsDocument(body, options);
  } catch (error) {
    if (isBanError(error)) {
      expect(error.status).toBe(400);
      return errorObjects(error).map((object) => object.source?.pointer);
    }
    throw error;
  }
  throw new Error('expected a BanError');
}

describe('parseOperationsDocument', () => {
  it('returns operations in order with their targets, data, and meta', () => {
    const operations = parseOperationsDocument(
      {
        jsonapi: { version: '1.1' },
        meta: { note: 'ignored' },
        '@context': 'ignored too',
        'atomic:operations': [
          { op: 'add', data: { type: 'a' }, meta: { m: 1 } },
          { op: 'remove', ref: { type: 'a', id: '1' } },
          {
            op: 'update',
            ref: { type: 'a', lid: 'x', relationship: 'r' },
            data: null,
          },
        ],
      },
      { maxOperations: 3 },
    );
    expect(operations).toEqual([
      {
        index: 0,
        pointer: '/atomic:operations/0',
        op: 'add',
        target: undefined,
        hasData: true,
        data: { type: 'a' },
        meta: { m: 1 },
      },
      {
        index: 1,
        pointer: '/atomic:operations/1',
        op: 'remove',
        target: { type: 'a', id: '1', lid: undefined, relationship: undefined },
        targetMember: 'ref',
        hasData: false,
        data: undefined,
        meta: undefined,
      },
      {
        index: 2,
        pointer: '/atomic:operations/2',
        op: 'update',
        target: { type: 'a', id: undefined, lid: 'x', relationship: 'r' },
        targetMember: 'ref',
        hasData: true,
        data: null,
        meta: undefined,
      },
    ]);
  });

  it('rejects documents that are not objects or lack operations', () => {
    expect(pointersOf(null)).toEqual(['']);
    expect(pointersOf([])).toEqual(['']);
    expect(pointersOf({})).toEqual(['/atomic:operations']);
    expect(pointersOf({ 'atomic:operations': {} })).toEqual([
      '/atomic:operations',
    ]);
    expect(pointersOf({ 'atomic:operations': [] })).toEqual([
      '/atomic:operations',
    ]);
    expect(
      pointersOf(
        { 'atomic:operations': [{ op: 'add' }, { op: 'add' }] },
        {
          maxOperations: 1,
        },
      ),
    ).toEqual(['/atomic:operations']);
  });

  it('rejects top-level members the extension forbids or does not know', () => {
    expect(
      pointersOf({
        data: null,
        included: [],
        errors: [],
        'atomic:results': [],
        custom: 1,
        'atomic:operations': [{ op: 'add' }],
      }),
    ).toEqual(['/data', '/included', '/errors', '/atomic:results', '/custom']);
  });

  it('reports every malformed operation member together', () => {
    expect(
      pointersOf({
        'atomic:operations': [
          'nope',
          { op: 'patch' },
          { op: 'add', extra: 1, meta: 'm' },
          { op: 'add', ref: {}, href: '/x' },
        ],
      }),
    ).toEqual([
      '/atomic:operations/0',
      '/atomic:operations/1/op',
      '/atomic:operations/2/extra',
      '/atomic:operations/2/meta',
      '/atomic:operations/3',
    ]);
  });

  it('checks ref: a string type, exactly one of id and lid, a string relationship', () => {
    expect(
      pointersOf({
        'atomic:operations': [
          { op: 'remove', ref: 'x' },
          { op: 'remove', ref: { type: 1, id: '1' } },
          { op: 'remove', ref: { type: 'a' } },
          { op: 'remove', ref: { type: 'a', id: '1', lid: 'l' } },
          { op: 'remove', ref: { type: 'a', id: 1 } },
          { op: 'remove', ref: { type: 'a', lid: 1 } },
          { op: 'remove', ref: { type: 'a', id: '1', relationship: 2 } },
          { op: 'remove', ref: { type: 'a', id: '1', other: true } },
        ],
      }),
    ).toEqual([
      '/atomic:operations/0/ref',
      '/atomic:operations/1/ref/type',
      '/atomic:operations/2/ref',
      '/atomic:operations/3/ref',
      '/atomic:operations/4/ref/id',
      '/atomic:operations/4/ref',
      '/atomic:operations/5/ref/lid',
      '/atomic:operations/5/ref',
      '/atomic:operations/6/ref/relationship',
      '/atomic:operations/7/ref/other',
    ]);
  });

  it('resolves href through the resolver and rejects it otherwise', () => {
    expect(
      pointersOf({ 'atomic:operations': [{ op: 'remove', href: '/a/1' }] }),
    ).toEqual(['/atomic:operations/0/href']);
    expect(
      pointersOf(
        { 'atomic:operations': [{ op: 'remove', href: 1 }] },
        { maxOperations: 1, resolveHref: (href) => NO_TARGETS[href] },
      ),
    ).toEqual(['/atomic:operations/0/href']);
    expect(
      pointersOf(
        { 'atomic:operations': [{ op: 'remove', href: '/nope' }] },
        { maxOperations: 1, resolveHref: (href) => NO_TARGETS[href] },
      ),
    ).toEqual(['/atomic:operations/0/href']);
    const [operation] = parseOperationsDocument(
      { 'atomic:operations': [{ op: 'remove', href: '/a/1' }] },
      { maxOperations: 1, resolveHref: () => ({ type: 'a', id: '1' }) },
    );
    expect(operation?.target).toEqual({ type: 'a', id: '1' });
  });
});
