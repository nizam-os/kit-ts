/**
 * The input of a write (resource SPEC 9.3, 18.4) at its edges: an issue
 * the write schema raises at the resource object itself points at it, and
 * a write schema whose output is not `{ attributes, relationships }` with
 * each relationship as its linkage is a `TypeError`, never a write.
 */
import type { DeclaredResource } from '@nizam-os/resource-core';

import { describe, expect, it } from 'vitest';

import { errorObjects } from '@nizam-os/jsonapi-core';

import { BEHAVIORS } from '../test-support/domain';
import { writeOf } from './input';

const tasks = BEHAVIORS.tasks.resource;

/** `tasks` with a write schema that answers `result` for every input. */
function answering(result: unknown): DeclaredResource {
  const validate = () => result;
  const write = { create: { '~standard': { validate } } };
  return { ...tasks, declaration: tasks.declaration, write } as never;
}

describe('writeOf (resource SPEC 18.4)', () => {
  it('points an issue raised at the resource object, or at a whole part, under /data', () => {
    const issues = [
      { message: 'Must be an object.', path: [], code: 'type' },
      { message: 'Must be an object.', path: ['relationships'], code: 'type' },
    ];
    const thrown = (() => {
      try {
        return writeOf(answering({ issues }), 'create', {});
      } catch (error) {
        return error;
      }
    })();
    expect(
      errorObjects(thrown as never).map((object) => object.source),
    ).toEqual([{ pointer: '/data' }, { pointer: '/data/relationships' }]);
  });

  it('refuses a validated write that is not attributes and relationships with linkages', () => {
    expect(() =>
      writeOf(answering({ value: { attributes: {} } }), 'create', {}),
    ).toThrow(
      new TypeError('a validated write has no attributes or relationships'),
    );
    expect(() =>
      writeOf(
        answering({
          value: { attributes: {}, relationships: { parent: { id: 7 } } },
        }),
        'create',
        {},
      ),
    ).toThrow(new TypeError('a validated relationship has no id'));
  });

  it('gives a missing member as empty, and the targets of the linkages it validated', () => {
    expect(
      writeOf(tasks, 'create', {
        attributes: { title: 'a' },
        relationships: {
          parent: { type: 'tasks', id: '00000000-0000-4000-8000-00000000000A' },
        },
      }),
    ).toEqual({
      attributes: { title: 'a' },
      relationships: { parent: '00000000-0000-4000-8000-00000000000a' },
    });
    expect(writeOf(tasks, 'update', { id: 'ignored' })).toEqual({
      attributes: {},
      relationships: {},
    });
  });
});
