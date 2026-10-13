/**
 * `checkRules` (catalog SPEC 10.3, resource SPEC 7.3) on the built
 * packages: every case `oracleCases` gives for the oracle's schema, the
 * contacts application, and the PostgreSQL 18 schema runs, and the
 * declarations agree with PGlite and with the server `RESOURCE_PG_URL`
 * names (from PostgreSQL 18 for the last). The faults a review misses are
 * reported: a validator that refuses what its CHECK holds, a storage codec
 * whose text the database refuses, and a catalog older than the
 * migrations.
 */
import type { ExtractionConfig, RulesReport } from '@nizam-os/pg-catalog';

import type { Period } from './support/time-range-text.ts';

import { cp, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { checkRules } from '@nizam-os/pg-catalog';
import {
  createDeclareResource,
  defineValidator,
} from '@nizam-os/resource-core';
import { oracleCases } from '@nizam-os/resource-core/testing';

import { publicCatalog as contactsCatalog } from './fixtures/contacts/public-catalog.ts';
import { Calls } from './resources/calls.ts';
import { codecs } from './resources/codecs.ts';
import { Contacts } from './resources/contacts.ts';
import { ImportedContacts, Owners } from './resources/imported-contacts.ts';
import { Meetings } from './resources/meetings.ts';
import { Notes } from './resources/notes.ts';
import { Organizations } from './resources/organizations.ts';
import { validators } from './resources/validators.ts';
import { serverVersion } from './support/oracle-database.ts';
import {
  KEYS,
  Links,
  Numbers,
  Others,
  Texts,
} from './support/oracle-resources.ts';
import { CONTACTS_DIR, ORACLE_DIR, POSTGRES18_DIR } from './support/paths';
import { timeRangeText } from './support/time-range-text.ts';

const SERVER = process.env['RESOURCE_PG_URL'];
const POSTGRES_18 = 180_000;

const ORACLE = [Texts, Numbers, Others, Links, ...KEYS];
const CONTACTS = [Organizations, Contacts, Meetings, Notes, Calls];
const POSTGRES18 = [Owners, ImportedContacts];

/** The targets a schema replays into: PGlite, and the server when it is set. */
function targets(): ReadonlyArray<
  readonly [string, ExtractionConfig['database']]
> {
  return [
    ['PGlite', undefined],
    ...(SERVER === undefined
      ? []
      : [['a PostgreSQL server', { url: SERVER }] as const]),
  ];
}

function failing(report: RulesReport): ReadonlyArray<string> {
  return report.cases.flatMap(({ subject, problem, disagreements }) => [
    ...(problem === null ? [] : [`${subject}: ${problem}`]),
    ...disagreements.map(
      ({ label, reason }) => `${subject} ${label}: ${reason}`,
    ),
  ]);
}

const oracleConfig = (
  database: ExtractionConfig['database'],
): ExtractionConfig => ({
  migrations: 'migrations',
  database: database ?? { pglite: { extensions: ['citext'] } },
  out: { catalog: 'catalog.ts' },
  resources: { registry: () => ORACLE },
});

const contactsConfig = (
  database?: ExtractionConfig['database'],
  changes: Partial<ExtractionConfig> = {},
): ExtractionConfig => ({
  migrations: 'migrations',
  database: database ?? {
    pglite: { extensions: ['pg_trgm', 'btree_gist', 'citext'] },
  },
  schemas: ['public', 'audit'],
  out: {
    catalog: 'catalog.ts',
    public: {
      file: 'public-catalog.ts',
      tables: [
        'calls',
        'contacts',
        'contact_phones',
        'import_batches',
        'import_rows',
        'meetings',
        'notes',
        'organizations',
      ],
    },
  },
  resources: {
    registry: () => CONTACTS,
    storage: { timeRange: timeRangeText },
  },
  ...changes,
});

describe.each(targets())('checkRules on %s', (_name, database) => {
  it("runs every case of the oracle's schema, and the declarations agree with the database", async () => {
    const report = await checkRules(oracleConfig(database), {
      cwd: ORACLE_DIR,
    });
    expect(report.cases.map(({ subject }) => subject)).toEqual(
      oracleCases(ORACLE).map(({ subject }) => subject),
    );
    expect(report.cases.every(({ fixtures }) => fixtures > 0)).toBe(true);
    expect(failing(report)).toEqual([]);
  });

  it('runs every case of the contacts application, and the declarations agree with the database', async () => {
    const report = await checkRules(contactsConfig(database), {
      cwd: CONTACTS_DIR,
    });
    expect(report.cases.map(({ subject }) => subject)).toEqual(
      oracleCases(CONTACTS, { storage: { timeRange: timeRangeText } }).map(
        ({ subject }) => subject,
      ),
    );
    expect(failing(report)).toEqual([]);
    expect(report.unusedTables).toEqual([
      'contact_phones',
      'import_batches',
      'import_rows',
    ]);
  });
});

describe.each(targets())(
  'checkRules on %s, PostgreSQL 18 schema',
  (_name, database) => {
    it('agrees with the database on the NOT ENFORCED declarations, from PostgreSQL 18', async (context) => {
      if (
        database !== undefined &&
        'url' in database &&
        typeof database.url === 'string' &&
        (await serverVersion(database.url)) < POSTGRES_18
      ) {
        context.skip();
      }
      const report = await checkRules(
        {
          migrations: 'migrations',
          ...(database === undefined ? {} : { database }),
          out: { catalog: 'catalog.ts' },
          resources: { registry: () => POSTGRES18 },
        },
        { cwd: POSTGRES18_DIR },
      );
      expect(report.cases.length).toBeGreaterThan(0);
      expect(failing(report)).toEqual([]);
    });
  },
);

describe('checkRules on PGlite reports the faults a review misses', () => {
  it('a validator that refuses what its CHECK holds', async () => {
    const declareFaulty = createDeclareResource({
      catalog: contactsCatalog,
      codecs,
      validators: {
        ...validators,
        lowercase: defineValidator({
          schema: z
            .string()
            .refine(
              (value) => value === value.toLowerCase() && !/\d/u.test(value),
            )
            .nullable(),
          fixtures: {
            accept: ['lobby', '', null],
            reject: ['Lobby', 'lobby-2'],
          },
        }),
      },
      domains: {
        email: { email_check: { validator: 'email' } },
        handle: { handle_check: { validator: 'lowercase' } },
      },
    });
    const rooms = declareFaulty('meetings', {
      operations: ['get', 'update'],
      fields: { room: { access: 'readWrite' } },
      rules: { meetings_room_lowercase: { validator: 'lowercase' } },
    });
    const report = await checkRules(
      contactsConfig(undefined, { resources: { registry: () => [rooms] } }),
      {
        cwd: CONTACTS_DIR,
      },
    );
    expect(failing(report)).toEqual([
      'meetings CHECK meetings_room_lowercase (validator lowercase) reject[1]: the validator refuses it; the database accepts it',
    ]);
  });

  it('a storage codec whose text the database refuses', async () => {
    const report = await checkRules(
      contactsConfig(undefined, {
        resources: {
          registry: () => CONTACTS,
          storage: {
            timeRange: {
              read: timeRangeText.read,
              write: ({ start, end }: Period) => `[${end},${start})`,
            },
          },
        },
      }),
      { cwd: CONTACTS_DIR },
    );
    expect(failing(report)).toEqual([
      'meetings.during (codec timeRange) fixtures[0]: the database refuses it (22000)',
      'meetings.during (codec timeRange) fixtures[1]: the database refuses it (22000)',
    ]);
  });

  it('a catalog older than the migrations', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'rules-e2e-'));
    await cp(join(CONTACTS_DIR, 'migrations'), join(directory, 'migrations'), {
      recursive: true,
    });
    const contacts = join(directory, 'migrations', 'V4__contacts.sql');
    const sql = await readFile(contacts, 'utf8');
    await writeFile(
      contacts,
      sql.replace(
        'char_length(name) between 1 and 200',
        'char_length(name) between 1 and 100',
      ),
    );
    const report = await checkRules(contactsConfig(), {
      cwd: directory,
    });
    expect(failing(report)).toEqual([
      'contacts.name maxLength 200: the schema accepts it; the database refuses it (23514 contacts_name_check)',
      'contacts.name maxLength 200 in astral characters: the schema accepts it; the database refuses it (23514 contacts_name_check)',
    ]);
  });
});
