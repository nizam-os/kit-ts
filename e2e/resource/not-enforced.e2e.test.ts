/**
 * NOT ENFORCED constraints end to end (catalog ADR 0010; resource SPEC 6.1,
 * 9.1, 15.4), through the built packages over the catalog `pg-catalog
 * extract` wrote for `fixtures/postgres18`. PostgreSQL 18 stores a row that
 * breaks every unenforced CHECK and the unenforced foreign key, and the
 * declared resource accepts that row on create and on read; it still
 * refuses what the enforced CHECK refuses, as the database does, and only
 * the enforced constraints derive codes. PostgreSQL 14 cannot parse NOT
 * ENFORCED, so with an older server only PGlite runs.
 * @ref https://www.postgresql.org/docs/18/sql-createtable.html (`NOT ENFORCED`)
 */
import type { ResourceIssue } from '@nizam-os/resource-core';

import type { OracleDatabase } from './support/oracle-database.ts';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ImportedContacts } from './resources/imported-contacts.ts';
import { postgres18Databases } from './support/oracle-database.ts';

const databases = await postgres18Databases();

const STORED = '5d0c7a1e-2b3f-4c6d-9e8a-1f2b3c4d5e6f';
const UNREACHABLE = '6e1d8b2f-3c4a-4d7e-8f9b-2a3c4d5e6f70';
const REFUSED = '7f2e9c3a-4d5b-4e8f-9a0c-3b4d5e6f7081';
/** An owner no row of `owners` holds: the unenforced foreign key lets it through. */
const NOBODY = '8a3f0d4b-5e6c-4f9a-8b1d-4c5e6f708192';

/** Ada's attributes as stored: they break the unenforced CHECKs on email and status. */
const BROKEN = {
  name: 'Ada',
  nickname: null,
  email: 'not an address',
  status: 'deleted',
  score: null,
};
/** Bea's attributes as stored: with no owner either, they break the unenforced CHECK over both. */
const UNREACHED = {
  name: 'Bea',
  nickname: null,
  email: null,
  status: null,
  score: null,
};

/** The fields of a PostgreSQL error both drivers expose. */
interface Refusal {
  readonly code?: string;
  readonly constraint?: string;
}

/** The issues of a create as `[code, path, expected]`, or `[]` when it passes. */
function createIssues(value: unknown): ReadonlyArray<ReadonlyArray<unknown>> {
  const result = ImportedContacts.write.create['~standard'].validate(value) as {
    readonly issues?: ReadonlyArray<ResourceIssue>;
  };
  return (result.issues ?? []).map(({ code, path, expected }) => [
    code,
    path.join('/'),
    expected,
  ]);
}

describe.each(databases)('NOT ENFORCED on %s', (_label, open) => {
  let database: OracleDatabase;

  beforeAll(async () => {
    database = await open();
  });

  afterAll(async () => {
    await database.close();
  });

  it('stores a row that breaks every unenforced constraint, and the schemas accept it', async () => {
    await database.query(
      `insert into imported_contacts (id, name, nickname, email, status, owner_id)
       values ($1, 'Ada', null, 'not an address', 'deleted', $2)`,
      [STORED, NOBODY],
    );
    await database.query(
      "insert into imported_contacts (id, name) values ($1, 'Bea')",
      [UNREACHABLE],
    );
    const rows = await database.query(
      `select id, name, nickname, email, status, score, owner_id
       from imported_contacts order by name`,
    );
    expect(rows).toEqual([
      { id: STORED, ...BROKEN, owner_id: NOBODY },
      { id: UNREACHABLE, ...UNREACHED, owner_id: null },
    ]);
    expect(ImportedContacts.schema.read.parse(BROKEN)).toEqual(BROKEN);
    expect(ImportedContacts.schema.read.parse(UNREACHED)).toEqual(UNREACHED);
    expect(
      createIssues({
        attributes: BROKEN,
        relationships: { owner: { type: 'owners', id: NOBODY } },
      }),
    ).toEqual([]);
    expect(
      createIssues({ attributes: UNREACHED, relationships: { owner: null } }),
    ).toEqual([]);
  });

  it('refuses a score above 100, as the enforced CHECK does', async () => {
    const refusal: Refusal = await database
      .query(
        "insert into imported_contacts (id, name, score) values ($1, 'Cy', 101)",
        [REFUSED],
      )
      .then(
        () => ({}),
        (error: unknown) => error as Refusal,
      );
    expect(refusal).toMatchObject({
      code: '23514',
      constraint: 'imported_contacts_score_check',
    });
    expect(
      createIssues({
        attributes: { name: 'Cy', score: 101 },
        relationships: {},
      }),
    ).toEqual([['maximum', 'attributes/score', '100']]);
  });
});

describe('NOT ENFORCED codes (SPEC 9.1)', () => {
  it('come from the enforced constraints only', () => {
    expect(Object.keys(ImportedContacts.errors)).toEqual([
      'IMPORTED_CONTACTS_SCORE_CHECK',
      'IMPORTED_CONTACTS_NAME_NOT_NULL',
    ]);
  });
});
