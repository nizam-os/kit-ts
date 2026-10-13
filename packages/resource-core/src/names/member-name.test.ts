import { describe, expect, it } from 'vitest';

import { defineResource, isMemberName } from '@nizam-os/jsonapi-core';

import { MEMBER_NAME_CASES } from '../test-support/member-name-cases';
import { memberNameProblem, typeNameProblem } from './member-name';

/** Whether `@nizam-os/jsonapi-core`'s `defineResource` accepts `name` as an attribute. */
function acceptsAttribute(name: string): boolean {
  try {
    defineResource({
      type: 'notes',
      attributes: [name],
      serialize: () => ({ id: '1' }),
    });
    return true;
  } catch {
    return false;
  }
}

/** Whether `defineResource` accepts `name` as a resource type. */
function acceptsType(name: string): boolean {
  try {
    defineResource({
      type: name,
      attributes: [],
      serialize: () => ({ id: '1' }),
    });
    return true;
  } catch {
    return false;
  }
}

describe('isMemberName, the runtime twin of IsMemberName (SPEC 4.2)', () => {
  it.each(MEMBER_NAME_CASES)('%j is a member name: %s', (name, valid) => {
    expect(isMemberName(name)).toBe(valid);
  });
});

describe('memberNameProblem and typeNameProblem (SPEC 4.2)', () => {
  it('refuses the members of every resource object as fields, never as types', () => {
    for (const name of ['type', 'id', 'lid']) {
      expect(memberNameProblem(name)).toBe(
        'is a member of every resource object',
      );
      expect(typeNameProblem(name)).toBeUndefined();
    }
  });

  it('refuses members of Object.prototype as fields and as types', () => {
    for (const name of ['constructor', 'prototype']) {
      expect(memberNameProblem(name)).toBe('is a member of Object.prototype');
      expect(typeNameProblem(name)).toBe('is a member of Object.prototype');
    }
  });

  it('refuses what is not a member name', () => {
    expect(memberNameProblem('_Tmp')).toBe('is not a JSON:API member name');
    expect(typeNameProblem('legacy$notes')).toBe(
      'is not a JSON:API member name',
    );
    expect(memberNameProblem('createdAt')).toBeUndefined();
  });

  it('refuses exactly what defineResource of @nizam-os/jsonapi-core refuses', () => {
    const names = [
      ...MEMBER_NAME_CASES.map(([name]) => name),
      'type',
      'id',
      'lid',
      'constructor',
      'prototype',
      '__proto__',
      'toString',
    ];
    for (const name of names) {
      expect(memberNameProblem(name) === undefined, name).toBe(
        acceptsAttribute(name),
      );
      expect(typeNameProblem(name) === undefined, name).toBe(acceptsType(name));
    }
  });
});
