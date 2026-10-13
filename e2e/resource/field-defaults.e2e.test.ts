/**
 * A default's read form against PostgreSQL (resource SPEC 5.4, 8): over a
 * table with a constant default for every type with a wire form
 * (`support/defaults-table.ts`), `default.literal` is the constant as
 * PostgreSQL prints it in the catalog's settings, and `default.value` the
 * read form of what the database stores for a member a create leaves
 * out, but where a type modifier respells the stored value: the same
 * value, as ADR 0005 compares it. A constant outside the read form and an
 * expression have none. On PGlite and on the server `RESOURCE_PG_URL`
 * names.
 * @ref https://github.com/postgres/postgres/blob/REL_18_STABLE/src/backend/utils/adt/ruleutils.c (get_const_expr)
 */
import type { FieldMeta } from '@nizam-os/resource-core';

import type { DefaultsFixture, StoredRow } from './support/defaults-table.ts';
import type { OracleDatabase } from './support/oracle-database.ts';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  DEFAULTS_MIGRATION,
  defaultsFixture,
  storedValue,
  storeRow,
  typeOf,
} from './support/defaults-table.ts';
import { CONTACTS_SCHEMA, liveDatabases } from './support/oracle-database.ts';
import { UNREPRESENTABLE } from './support/read-form.ts';
import { sameValue } from './support/same-value.ts';

/** Each member's constant as PostgreSQL prints it in UTC with ISO dates; `null` for `now()`. */
const LITERALS = {
  label: 'plain',
  code: 'ab',
  padded: 'ab',
  small: '-3',
  seats: '5',
  big: '9007199254740993',
  price: '1',
  ratio: '0.50',
  weight: '1.5',
  score: '-2.25',
  flag: 'true',
  token: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  dueOn: '2026-01-31',
  startsAt: '2026-01-31 09:30:00.5',
  occursAt: '2026-01-31 07:30:00+00',
  config: '{"sizes": [1, 2], "theme": "light"}',
  kind: 'company',
  discount: '12.5',
  tags: String.raw`{"a b","c,d","","NULL","q\"uote"}`,
  openDays: '{t,t,t,t,t,f,f}',
  sizes: '{1,2,3}',
  kinds: '{person,company}',
  reminders: '{"2026-01-31 07:30:00+00"}',
  expiresOn: 'infinity',
  notedAt: null,
};

/** Each member's constant in its read form; `infinity` and `now()` have none. */
const VALUES = {
  label: 'plain',
  code: 'ab',
  padded: 'ab',
  small: -3,
  seats: 5,
  big: '9007199254740993',
  price: '1',
  ratio: '0.50',
  weight: 1.5,
  score: -2.25,
  flag: true,
  token: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  dueOn: '2026-01-31',
  startsAt: '2026-01-31T09:30:00.5',
  occursAt: '2026-01-31T07:30:00Z',
  config: { sizes: [1, 2], theme: 'light' },
  kind: 'company',
  discount: '12.5',
  tags: ['a b', 'c,d', '', 'NULL', 'q"uote'],
  openDays: [true, true, true, true, true, false, false],
  sizes: [1, 2, 3],
  kinds: ['person', 'company'],
  reminders: ['2026-01-31T07:30:00Z'],
  expiresOn: undefined,
  notedAt: undefined,
};

/** The stored values a type modifier respells: `char(4)` pads, `numeric(6,2)` and `percentage` print two fraction digits. */
const RESPELLED = { padded: 'ab  ', price: '1.00', discount: '12.50' };

/** The members whose default has no read form. */
const WITHOUT_VALUE = new Set(['expiresOn', 'notedAt']);

for (const [name, open] of liveDatabases(CONTACTS_SCHEMA)) {
  describe(`a default's read form, on ${name}`, () => {
    let fixture: DefaultsFixture;
    let database: OracleDatabase;
    let stored: StoredRow;

    beforeAll(async () => {
      fixture = await defaultsFixture();
      database = await open();
      await database.query(DEFAULTS_MIGRATION);
      stored = await storeRow(database);
    });

    afterAll(async () => {
      await database.close();
    });

    function members(): ReadonlyArray<FieldMeta> {
      return Object.values(fixture.resource.fields);
    }

    function member(memberName: string): FieldMeta {
      const meta = fixture.resource.fields[memberName];
      if (meta === undefined) {
        throw new Error(`${memberName} is not a member`);
      }
      return meta;
    }

    it("states each constant as PostgreSQL prints it in the catalog's settings, and none for an expression", () => {
      expect(
        Object.fromEntries(
          members().map((meta) => [meta.name, meta.default?.literal]),
        ),
      ).toEqual(LITERALS);
    });

    it('states as its value the read form of what the database stores for a member left out, a type modifier aside', () => {
      expect(
        Object.fromEntries(
          members().map((meta) => [meta.name, meta.default?.value]),
        ),
      ).toStrictEqual(VALUES);
      const valued = members().filter(
        ({ name: field }) => !WITHOUT_VALUE.has(field),
      );
      expect(
        Object.fromEntries(
          valued.map((meta) => [
            meta.name,
            storedValue(fixture.catalog, stored, meta),
          ]),
        ),
      ).toEqual({
        ...Object.fromEntries(
          Object.entries(VALUES).filter(([field]) => !WITHOUT_VALUE.has(field)),
        ),
        ...RESPELLED,
      });
    });

    it('states the value a type modifier respells as the value the database stores, compared as ADR 0005 compares a write', () => {
      for (const field of Object.keys(RESPELLED)) {
        const meta = member(field);
        expect([
          field,
          sameValue(
            storedValue(fixture.catalog, stored, meta),
            meta.default?.value,
            typeOf(fixture.catalog, meta),
          ),
        ]).toEqual([field, true]);
      }
    });

    it('states no value for a constant outside the read form, nor for an expression', () => {
      expect(storedValue(fixture.catalog, stored, member('expiresOn'))).toBe(
        UNREPRESENTABLE,
      );
      expect(member('expiresOn').default).toStrictEqual({
        literal: 'infinity',
        value: undefined,
      });
      expect(member('notedAt').default).toStrictEqual({
        literal: null,
        value: undefined,
      });
    });

    it('freezes each default, its value included', () => {
      const { config, tags } = fixture.resource.fields;
      expect(Object.isFrozen(config?.default)).toBe(true);
      expect(Object.isFrozen(config?.default?.value)).toBe(true);
      expect(Object.isFrozen(VALUES.config)).toBe(false);
      expect(Object.isFrozen(tags?.default?.value)).toBe(true);
    });
  });
}
