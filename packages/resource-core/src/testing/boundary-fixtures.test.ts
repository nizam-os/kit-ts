import type { PublicCheckConstraint, Rule } from '@nizam-os/catalog-core';

import type { BoundaryFixture } from './fixture';

import { describe, expect, it } from 'vitest';

import {
  catalogOf,
  column,
  table,
  untypedDeclare,
} from '../test-support/catalog-builder';
import { TEST_REGISTRIES } from '../test-support/definer';
import { boundaryFixtures } from './boundary-fixtures';
import { nextSingle } from './float-steps';

const KEY = { nullable: false, default: { literal: null } };
const check = (name: string, rule: Rule): PublicCheckConstraint => ({
  kind: 'check',
  columns: [name],
  rule,
  enforced: true,
});
const declare = untypedDeclare(
  {
    ...catalogOf({
      owners: table('owners', {
        id: column({ type: 'int4', sqlType: 'integer', ...KEY }),
      }),
      samples: table(
        'samples',
        {
          id: column({ type: 'uuid', sqlType: 'uuid', ...KEY }),
          code: column({ type: 'varchar', maxLength: 3 }),
          body: column(),
          rank: column({ type: 'int4', sqlType: 'integer' }),
          ratio: column({ type: 'float4', sqlType: 'real' }),
          amount: column({ type: 'numeric', precision: 5, scale: 2 }),
          big: column({ type: 'int8', sqlType: 'bigint' }),
          share: column({ type: 'numeric', sqlType: 'numeric' }),
          state: column({ type: 'mood', typeKind: 'enum' }),
          labels: column({ array: true, sqlType: 'text[]' }),
          data: column({ type: 'jsonb', sqlType: 'jsonb' }),
          phone: column(),
          owner_id: column({ type: 'int4', sqlType: 'integer' }),
        },
        {
          samples_body_check: check('body', {
            kind: 'length',
            min: 2,
            max: null,
          }),
          samples_rank_check: check('rank', {
            kind: 'range',
            min: { value: '0', inclusive: false },
            max: { value: '100', inclusive: true },
          }),
          samples_ratio_check: check('ratio', {
            kind: 'range',
            min: { value: '0.1', inclusive: false },
            max: null,
          }),
          samples_share_check: check('share', {
            kind: 'range',
            min: null,
            max: { value: '0.5', inclusive: true },
          }),
          samples_state_check: check('state', {
            kind: 'enum',
            values: ['happy', 'sad'],
          }),
          samples_owner_id_fkey: {
            kind: 'foreignKey',
            columns: ['owner_id'],
            references: { table: 'owners', columns: ['id'] },
            enforced: true,
          },
        },
      ),
    }),
    enums: { mood: ['happy', 'sad', 'angry'] },
  },
  { codecs: TEST_REGISTRIES.codecs, validators: TEST_REGISTRIES.validators },
);
const Owners = declare('owners', { operations: ['get'], fields: {} });
const Samples = declare('samples', {
  operations: ['update'],
  fields: {
    ...Object.fromEntries(
      ['code', 'body', 'rank', 'ratio', 'amount', 'big', 'share', 'state']
        .concat(['labels', 'data'])
        .map((name) => [name, { access: 'readWrite' }]),
    ),
    phone: { access: 'readWrite', codec: 'phone' },
  },
  relationships: { owner_id: { target: () => Owners, access: 'readWrite' } },
});

const { fields, relationships } = boundaryFixtures(Samples);
const update = Samples.schema.update.shape;

/** Each fixture value of a field with the verdict of the field's own schema. */
function verdicts(name: string): ReadonlyMap<unknown, boolean> {
  const schema = update[name];
  if (schema === undefined) {
    throw new Error(`no field ${name}`);
  }
  return new Map(
    (fields[name] ?? []).map(({ value }) => [
      value,
      schema.safeParse(value).success,
    ]),
  );
}

describe('boundaryFixtures (SPEC 15.3)', () => {
  it('straddles every field: its own schema accepts some fixtures and refuses others', () => {
    for (const name of Object.keys(fields)) {
      const seen = new Set(verdicts(name).values());
      expect([name, seen.has(true), seen.has(false)]).toEqual([
        name,
        true,
        true,
      ]);
    }
  });

  it.each([
    ['code', ['aaa', '\u{1F600}'.repeat(3)], ['aaaa', 'aaa ', 'a\u0000b']],
    ['body', ['aa'], ['a', '\u{1F600}']],
    ['rank', [1, 100], [0, 101, 1.5, 2_147_483_648]],
    ['ratio', [0.1], [nextSingle(0.1, -1), 3.402_823_567_797_336_6e38]],
    ['amount', ['999.99', '-999.99'], ['1000', '-1000', '0.005', '999.995']],
    ['big', ['9223372036854775807'], ['9223372036854775808', '-0', '+1']],
    ['share', ['0.5', '0.49'], ['0.51', '.5', '1e3']],
    ['state', ['happy', 'sad'], ['angry', 'HAPPY', 'happy ', '']],
  ])('probes each limit of %s from both sides', (name, accepted, refused) => {
    const found = verdicts(name);
    for (const value of accepted) {
      expect([value, found.get(value)]).toEqual([value, true]);
    }
    for (const value of refused) {
      expect([value, found.get(value)]).toEqual([value, false]);
    }
  });

  it('puts each element fixture in an array of its own, beside the empty array', () => {
    const labels = (fields['labels'] ?? []).map(({ value }) => value);
    expect(labels).toContainEqual([]);
    expect(labels).toContainEqual(['a\u0000b']);
  });

  it('probes U+0000 and unpaired surrogates inside JSON, in strings and keys', () => {
    const found = verdicts('data');
    const refused = [...found].filter(([, ok]) => !ok).map(([value]) => value);
    expect(refused).toEqual([
      { text: 'a\u0000b' },
      { 'a\u0000b': 1 },
      { text: 'a\uD800b' },
      { 'a\uD800b': 1 },
    ]);
  });

  it('leaves out a codec field, whose codec fixtures cover it', () => {
    expect(Object.keys(fields)).not.toContain('phone');
  });

  it("gives a relationship ids in its key's form, and the spellings the id form refuses", () => {
    const ids = relationships['owner'] ?? [];
    const schema = Samples.linkage.update.shape['owner'];
    const accepts = (id: unknown) =>
      schema?.safeParse({ type: 'owners', id }).success;
    const values = ids.map(({ value }) => value);
    expect(values).toEqual(expect.arrayContaining(['2147483647', '0']));
    expect(values.filter((id) => accepts(id) === true)).toEqual(
      expect.not.arrayContaining(['-0', '+1', '01', '1.5', '2147483648']),
    );
    expect(values).toEqual(expect.arrayContaining(['-0', '+1', '2147483648']));
  });

  it('lists each value once, every fixture frozen with its value', () => {
    const all: ReadonlyArray<BoundaryFixture> = Object.values(fields).flat();
    for (const list of Object.values(fields)) {
      const keys = list.map(
        ({ value }) => `${typeof value}:${JSON.stringify(value)}`,
      );
      expect(new Set(keys).size).toBe(keys.length);
    }
    expect(all.every((entry) => Object.isFrozen(entry))).toBe(true);
    expect(Object.isFrozen(fields['data']?.[0]?.value)).toBe(true);
  });

  it('refuses a value declareResource did not return', () => {
    expect(() => boundaryFixtures({ ...Samples })).toThrow(
      new TypeError(
        'boundaryFixtures: the resource must be one declareResource returned',
      ),
    );
  });
});
