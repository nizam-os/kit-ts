/**
 * The seek starts an index scan at the cursor (keyset SPEC 6.2, ADRs 0016
 * and 0020). On a PostgreSQL server with 10 000 rows and an index on the
 * sort and the key, the page after or before a cursor halfway down the
 * list runs a select per seek branch, each an index scan whose index
 * condition bounds the first sort key at the cursor, so the page reads
 * about one page of entries instead of the 5 000 before the cursor. Runs
 * only when `KEYSET_PG_URL` names a server: only a server's planner shows
 * the plan production runs.
 * @ref https://www.postgresql.org/docs/current/using-explain.html
 * @ref https://use-the-index-luke.com/sql/partial-results/fetch-next-page
 */
import type { QueryEvent } from '@nizam-os/kysely-keyset';

import type { PlanNode } from './support/explain.ts';

import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createDefineKeyset } from '@nizam-os/kysely-keyset';

import { explainPage, nodesOf, scansOf } from './support/explain.ts';
import { SECRET } from './support/keysets.ts';

// oxlint-disable-next-line import/no-named-as-default-member -- reason: node-postgres is CommonJS and documents `import pg from 'pg'; const { Pool } = pg` for ESM
const { Pool } = pg;

const URL = process.env['KEYSET_PG_URL'];
const ROWS = 10_000;
/** The page whose plan is read. */
const SIZE = 100;
/** The pages walked to reach the middle of the list. */
const STRIDE = 1000;
const DEPTH = 5;
/** A page and the row that tells whether another follows: what a seek branch reads at most. */
const LIMIT = SIZE + 1;
const INDEX_SCAN = /^Index (?:Only )?Scan$/u;

interface IndexDB {
  people: { id: string; name: string; nickname: string | null };
}

const defineKeyset = createDefineKeyset<IndexDB>({
  cursor: { secret: SECRET },
});
const people = defineKeyset({
  table: 'people',
  key: ['id'],
  fields: {
    id: { column: 'id', type: 'bigint' },
    name: { column: 'name', type: 'text' },
    nickname: { column: 'nickname', type: 'text', nullable: true },
  },
  page: { max: STRIDE },
});
type Request = Parameters<typeof people.paginate>[1];

/** A scan of `people_name_id` in `direction` whose index condition matches `condition`. */
function nameScan(direction: string, condition: RegExp): unknown {
  return expect.objectContaining({
    'Node Type': expect.stringMatching(INDEX_SCAN),
    'Index Name': 'people_name_id',
    'Scan Direction': direction,
    'Index Cond': expect.stringMatching(condition),
  });
}

describe.skipIf(URL === undefined)(
  'PostgreSQL server: a page deep in the list is an index range scan',
  () => {
    const schema = `keyset_index_${Date.now().toString(36)}`;
    let pool: pg.Pool;
    let db: Kysely<IndexDB>;

    beforeAll(async () => {
      const admin = new Pool({ connectionString: URL, max: 1 });
      await admin.query(`create schema ${schema}`);
      await admin.end();
      pool = new Pool({
        connectionString: URL,
        max: 2,
        options: `-c search_path=${schema}`,
      });
      await pool.query(`
        create table people (
          id int8 generated always as identity primary key,
          name text not null,
          nickname text
        );
        insert into people (name, nickname)
          select md5(n::text), case when n % 4 = 0 then null else md5((n * 7)::text) end
          from generate_series(1, ${String(ROWS)}) as n;
        create index people_name_id on people (name, id);
        analyze people;`);
      db = new Kysely<IndexDB>({ dialect: new PostgresDialect({ pool }) });
    });
    afterAll(async () => {
      await pool.query(`drop schema ${schema} cascade`);
      await db.destroy();
    });

    /** The plan of the page query for `request`, as run by EXPLAIN ANALYZE. */
    async function planOf(request: Request): Promise<PlanNode> {
      const events: Array<QueryEvent> = [];
      await people.paginate(db.selectFrom('people').select('id'), request, {
        onQuery: (event) => {
          events.push(event);
        },
      });
      return explainPage(pool, events);
    }

    /** The cursor halfway down `sort`. */
    async function middle(sort: Request['sort']): Promise<string> {
      let after: string | undefined;
      for (let walked = 0; walked < DEPTH; walked += 1) {
        const page = await people.paginate(
          db.selectFrom('people').select('id'),
          {
            sort,
            page: { size: STRIDE, after },
          },
        );
        after = page.next ?? undefined;
      }
      if (after === undefined) {
        throw new Error('the list ended early');
      }
      return after;
    }

    it('after a cursor: forward index scans that start at the cursor', async () => {
      const after = await middle(['name']);
      const { scans, read } = scansOf(
        await planOf({ sort: ['name'], page: { size: SIZE, after } }),
      );
      expect(scans).toEqual([
        nameScan('Forward', /^\(name > '/u),
        nameScan('Forward', /^\(\(name = '.+\) AND \(id > '/u),
      ]);
      expect(read).toBeLessThanOrEqual(LIMIT);
    });

    it('before a cursor: backward index scans that start at the cursor', async () => {
      const before = await middle(['name']);
      const { scans, read } = scansOf(
        await planOf({ sort: ['name'], page: { size: SIZE, before } }),
      );
      expect(scans).toEqual([
        nameScan('Backward', /^\(name < '/u),
        nameScan('Backward', /^\(\(name = '.+\) AND \(id < '/u),
      ]);
      expect(read).toBeLessThanOrEqual(LIMIT);
    });

    it('descending over the ascending index: a backward scan from the cursor, ties sorted as they come', async () => {
      const after = await middle(['-name']);
      const plan: PlanNode = await planOf({
        sort: ['-name'],
        page: { size: SIZE, after },
      });
      const { scans, read } = scansOf(plan);
      expect(scans).toEqual([
        nameScan('Backward', /^\(name < '/u),
        nameScan('Forward', /^\(\(name = '.+\) AND \(id > '/u),
      ]);
      expect(nodesOf(plan)).toContainEqual(
        expect.objectContaining({
          'Node Type': 'Incremental Sort',
          'Presorted Key': [expect.stringMatching(/(?:^|\.)name$/u)],
        }),
      );
      expect(read).toBeLessThan(2 * SIZE);
    });

    it('walks a nullable sort through every row, its nulls last', async () => {
      const seen: Array<string | null> = [];
      let after: string | undefined;
      do {
        const page = await people.paginate(
          db.selectFrom('people').select(['id', 'nickname']),
          { sort: ['nickname'], page: { size: STRIDE, after } },
        );
        seen.push(...page.rows.map((row) => row.nickname));
        after = page.next ?? undefined;
      } while (after !== undefined);
      const nulls = seen.filter((nickname) => nickname === null).length;
      expect([seen.length, nulls]).toEqual([ROWS, ROWS / 4]);
      expect(seen.slice(-nulls).every((nickname) => nickname === null)).toBe(
        true,
      );
    });
  },
);
