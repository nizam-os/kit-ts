/**
 * A create form over a table's defaults (resource SPEC 20.3):
 * `resourceForm` from the built `@nizam-os/resource-ui`, over the table
 * of `support/defaults-table.ts`, starts each member from its default as
 * a read gives it, so the form shows what the database stores for a
 * member the person leaves alone. A create left alone writes nothing, and
 * the row the database stores for it starts an update form where the
 * create form started, but where a type modifier respells the stored
 * value; adding Saturday to the open days sends that member alone. A
 * constant outside the read form and an expression start blank. On PGlite
 * and on the server `RESOURCE_PG_URL` names.
 */
import type { FieldMeta } from '@nizam-os/resource-core';

import type { DefaultsFixture } from '../support/defaults-table.ts';
import type { OracleDatabase } from '../support/oracle-database.ts';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { defaultMessages } from '@nizam-os/resource-core';
import { resourceForm } from '@nizam-os/resource-ui';

import {
  DEFAULTS_MIGRATION,
  defaultsFixture,
  storedValue,
  storeRow,
  typeOf,
} from '../support/defaults-table.ts';
import { CONTACTS_SCHEMA, liveDatabases } from '../support/oracle-database.ts';
import { parameterText } from '../support/pg-text.ts';

/** Each member's start: its default as its input edits it, blank for `infinity` and `now()`. */
const STARTS = {
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
  flag: true,
  token: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  dueOn: '2026-01-31',
  startsAt: '2026-01-31T09:30:00.5',
  occursAt: '2026-01-31T07:30:00Z',
  config: { sizes: [1, 2], theme: 'light' },
  kind: 'company',
  discount: '12.5',
  tags: ['a b', 'c,d', '', 'NULL', 'q"uote'],
  openDays: ['true', 'true', 'true', 'true', 'true', 'false', 'false'],
  sizes: ['1', '2', '3'],
  kinds: ['person', 'company'],
  reminders: ['2026-01-31T07:30:00Z'],
  expiresOn: '',
  notedAt: '',
};

/** Where an update of the stored row starts the members a type modifier respells. */
const RESPELLED = { padded: 'ab  ', price: '1.00', discount: '12.50' };

/** The open days with Saturday added, as the input edits them. */
const WITH_SATURDAY = ['true', 'true', 'true', 'true', 'true', 'true', 'false'];

for (const [name, open] of liveDatabases(CONTACTS_SCHEMA)) {
  describe(`a create form over a table's defaults, on ${name}`, () => {
    let fixture: DefaultsFixture;
    let database: OracleDatabase;

    beforeAll(async () => {
      fixture = await defaultsFixture();
      database = await open();
      await database.query(DEFAULTS_MIGRATION);
    });

    afterAll(async () => {
      await database.close();
    });

    function member(memberName: string): FieldMeta {
      const meta = fixture.resource.fields[memberName];
      if (meta === undefined) {
        throw new Error(`${memberName} is not a member`);
      }
      return meta;
    }

    function form(
      operation: 'create' | 'update',
      options: {
        record?: Record<string, unknown>;
        members?: Array<string>;
      } = {},
    ) {
      const messages = defaultMessages([fixture.resource]);
      return resourceForm(fixture.resource, operation, {
        messages,
        ...options,
      });
    }

    it('starts each member from its default as a read gives it, and blank where the default has no read form', () => {
      expect(form('create').defaultValues).toStrictEqual(STARTS);
    });

    it('writes nothing for a create left alone, and the row stored for it starts an update where the create started', async () => {
      const create = form('create');
      expect(create.write(create.defaultValues)).toStrictEqual({});
      const row = await storeRow(database);
      const valued = Object.values(fixture.resource.fields).filter(
        (meta) => meta.default?.value !== undefined,
      );
      const members = valued.map((meta) => meta.name);
      const update = form('update', {
        record: {
          type: fixture.resource.names.type,
          id: row['id'],
          ...Object.fromEntries(
            valued.map((meta) => [
              meta.name,
              storedValue(fixture.catalog, row, meta),
            ]),
          ),
        },
        members,
      });
      expect(update.defaultValues).toStrictEqual({
        ...Object.fromEntries(
          members.map((field) => [field, create.defaultValues[field]]),
        ),
        ...RESPELLED,
      });
    });

    it('sends the open days with Saturday added, and nothing else, which the database stores as sent', async () => {
      const create = form('create');
      const write = create.write({
        ...create.defaultValues,
        openDays: WITH_SATURDAY,
      });
      const sent = [true, true, true, true, true, true, false];
      expect(write).toStrictEqual({ attributes: { openDays: sent } });
      const openDays = member('openDays');
      const row = await storeRow(database, {
        [openDays.column]: parameterText(
          sent,
          typeOf(fixture.catalog, openDays),
        ),
      });
      expect(storedValue(fixture.catalog, row, openDays)).toStrictEqual(sent);
      expect(storedValue(fixture.catalog, row, member('sizes'))).toStrictEqual([
        1, 2, 3,
      ]);
    });
  });
}
