import { describe, expect, it } from 'vitest';

import { untypedDeclare } from '../test-support/catalog-builder';
import { issuesOf, outputOf } from '../test-support/validation';

const declare = untypedDeclare();

const Contacts = declare('contacts', {
  operations: ['list', 'get', 'create', 'update'],
  scope: 'organization',
  fields: {
    kind: { access: 'immutable' },
    name: { access: 'readWrite' },
    nickname: { access: 'readWrite' },
    email: { access: 'readWrite' },
    website: { access: 'readWrite' },
    status: { access: 'readWrite' },
    priority: { access: 'readWrite' },
    discount: { access: 'write' },
    tags: { access: 'readWrite' },
    created_at: { access: 'read' },
  },
});

const ROW = {
  kind: 'person',
  name: 'Ada',
  nickname: null,
  email: 'ada@example.com',
  website: null,
  status: 'active',
  priority: 3,
  tags: ['vip'],
  createdAt: '2026-01-05T09:00:00Z',
};

describe('schema.read (SPEC 6.2)', () => {
  const { read } = Contacts.schema;

  it('holds the read, readWrite, and immutable fields by public name', () => {
    expect(Object.keys(read.shape)).toEqual([
      'kind',
      'name',
      'nickname',
      'email',
      'website',
      'status',
      'priority',
      'tags',
      'createdAt',
    ]);
    expect(read.parse(ROW)).toEqual(ROW);
  });

  it('requires every member, a nullable one included', () => {
    const { nickname: _nickname, ...withoutNickname } = ROW;
    const result = read.safeParse(withoutNickname);
    expect(result.error?.issues.map((issue) => issue.path)).toEqual([
      ['nickname'],
    ]);
  });

  it('strips keys it does not know, so a response may gain members', () => {
    expect(read.parse({ ...ROW, discount: '5.00', score: 1 })).toEqual(ROW);
  });

  it('validates a sparse fieldset with pick', () => {
    const sparse = read.pick({ name: true, createdAt: true });
    expect(
      sparse.parse({ name: 'Ada', createdAt: '2026-01-05T09:00:00Z' }),
    ).toEqual({ name: 'Ada', createdAt: '2026-01-05T09:00:00Z' });
    expect(sparse.safeParse({ name: 'Ada' }).success).toBe(false);
  });

  it('runs the wire forms and the rules, not the validators', () => {
    expect(read.safeParse({ ...ROW, email: 'not an email' }).success).toBe(
      true,
    );
    expect(read.safeParse({ ...ROW, name: '' }).success).toBe(false);
    expect(read.safeParse({ ...ROW, priority: 9 }).success).toBe(false);
  });
});

describe('schema.create (SPEC 6.2, 6.3)', () => {
  const create = Contacts.validate.create;

  it('holds the readWrite, immutable, and write fields', () => {
    expect(Object.keys(Contacts.schema.create.shape)).toEqual([
      'kind',
      'name',
      'nickname',
      'email',
      'website',
      'status',
      'priority',
      'discount',
      'tags',
    ]);
  });

  it('requires the members required on insert: NOT NULL, no default', () => {
    expect(issuesOf(create, {})).toEqual([
      { code: 'required', path: ['name'] },
    ]);
    expect(outputOf(create, { name: 'Ada' })).toEqual({ name: 'Ada' });
  });

  it('takes a missing key and undefined alike, and never outputs undefined', () => {
    const output = outputOf(create, {
      name: 'Ada',
      nickname: undefined,
      priority: undefined,
    });
    expect(output).toEqual({ name: 'Ada' });
    expect(Object.keys(output as object)).toEqual(['name']);
  });

  it('takes null for a nullable member and refuses it for a NOT NULL one', () => {
    expect(outputOf(create, { name: 'Ada', nickname: null })).toEqual({
      name: 'Ada',
      nickname: null,
    });
    expect(issuesOf(create, { name: null, status: null })).toEqual([
      { code: 'required', path: ['name'] },
      { code: 'required', path: ['status'] },
    ]);
  });

  it('rejects unknown keys and read fields, one issue per key', () => {
    expect(
      issuesOf(create, {
        name: 'Ada',
        createdAt: '2026-01-05T09:00:00Z',
        score: 1,
      }),
    ).toEqual([
      { code: 'additionalProperties', path: ['createdAt'] },
      { code: 'additionalProperties', path: ['score'] },
    ]);
  });

  it('runs the validators, null included', () => {
    expect(issuesOf(create, { name: 'Ada', email: 'ada.example.com' })).toEqual(
      [{ code: 'EMAIL_CHECK', path: ['email'] }],
    );
    expect(outputOf(create, { name: 'Ada', email: null })).toEqual({
      name: 'Ada',
      email: null,
    });
  });

  it('reports every member that fails, and every rule of a member', () => {
    expect(
      issuesOf(create, {
        name: '',
        website: 'http://example.com',
        priority: 9,
        status: 'gone',
        tags: ['ok', 5],
      }),
    ).toEqual([
      { code: 'minLength', expected: '1', path: ['name'] },
      { code: 'pattern', expected: '^https://', path: ['website'] },
      { code: 'enum', expected: '["active","archived"]', path: ['status'] },
      { code: 'maximum', expected: '5', path: ['priority'] },
      { code: 'type', expected: 'string', path: ['tags', 1] },
    ]);
  });

  it('refuses a value that is not an object', () => {
    expect(issuesOf(create, 'Ada')).toEqual([
      { code: 'type', expected: 'object', path: [] },
    ]);
    expect(issuesOf(create, null)).toEqual([
      { code: 'type', expected: 'object', path: [] },
    ]);
  });
});

describe('schema.update (SPEC 6.2)', () => {
  const update = Contacts.validate.update;

  it('holds the readWrite and write fields, every one optional', () => {
    expect(Object.keys(Contacts.schema.update.shape)).toEqual([
      'name',
      'nickname',
      'email',
      'website',
      'status',
      'priority',
      'discount',
      'tags',
    ]);
    expect(outputOf(update, {})).toEqual({});
    expect(outputOf(update, { name: undefined })).toEqual({});
  });

  it('rejects an immutable field and refuses null for a NOT NULL one', () => {
    expect(issuesOf(update, { kind: 'company', name: null })).toEqual([
      { code: 'required', path: ['name'] },
      { code: 'additionalProperties', path: ['kind'] },
    ]);
  });

  it('runs the validators and reports every failed keyword, as JSON Schema does', () => {
    expect(
      issuesOf(update, { email: 'ada.example.com', discount: '100.001' }),
    ).toEqual([
      { code: 'EMAIL_CHECK', path: ['email'] },
      { code: 'multipleOf', expected: '0.01', path: ['discount'] },
      { code: 'maximum', expected: '100', path: ['discount'] },
    ]);
  });
});

describe('the schemas of a declared resource', () => {
  it('are built once, on first read, and frozen validators', () => {
    expect(Contacts.schema).toBe(Contacts.schema);
    expect(Contacts.validate).toBe(Contacts.validate);
    expect(Object.isFrozen(Contacts.validate)).toBe(true);
    expect(Object.isFrozen(Contacts.validate.create['~standard'])).toBe(true);
    expect(Contacts.validate.create['~standard'].vendor).toBe('nizam');
    expect(Contacts.validate.create['~standard'].version).toBe(1);
  });
});
