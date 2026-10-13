import type { DB, Harness } from './support/db.ts';

/**
 * A configured definer (SPEC 3.6, 10.1, 14.1): the application calls
 * `createDefineKeyset(defaults)` once, and every definition inherits the
 * cursor secret, the page sizes, and the text-search configuration,
 * overriding them member by member, through either binding. English
 * stemming makes the default configuration observable: "programs" finds
 * "wrote the first program" only when both sides are stemmed.
 * Runs on PGlite, and on the server `KEYSET_PG_URL` names when set.
 * @ref https://www.postgresql.org/docs/current/textsearch-dictionaries.html#TEXTSEARCH-SNOWBALL-DICTIONARY
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createDefineKeyset as createDrizzleDefineKeyset } from '@nizam-os/drizzle-keyset';
import {
  createDefineKeyset,
  PageSizeExceededError,
} from '@nizam-os/kysely-keyset';

import { drizzlePager, kyselyPager } from './support/bindings.ts';
import { databases } from './support/db.ts';
import { schema } from './support/drizzle-schema.ts';
import {
  COLUMN_FIELDS,
  DRIZZLE_COLUMN_FIELDS,
  SECRET,
} from './support/keysets.ts';
import { expectedIds } from './support/schema.ts';

const DEFAULT_SIZE = 3;
const DEFAULT_MAX = 4;
const OWN_MAX = 50;

const DEFAULTS = {
  cursor: { secret: SECRET },
  page: { default: DEFAULT_SIZE, max: DEFAULT_MAX },
  search: { config: 'english' },
} as const;

const defineKeyset = createDefineKeyset<DB>(DEFAULTS);
const defineDrizzle = createDrizzleDefineKeyset(schema, DEFAULTS);

/**
 * Per binding, `stemmed` takes everything from the defaults, and `exact`
 * names its own search configuration and page maximum.
 */
const PAGERS = [
  [
    'Kysely',
    {
      stemmed: kyselyPager(
        defineKeyset({
          table: 'contacts',
          key: ['id'],
          fields: COLUMN_FIELDS,
          search: { columns: ['first_name', 'bio'] },
        }),
      ),
      exact: kyselyPager(
        defineKeyset({
          table: 'contacts',
          key: ['id'],
          fields: COLUMN_FIELDS,
          search: { columns: ['first_name', 'bio'], config: 'simple' },
          page: { max: OWN_MAX },
        }),
      ),
    },
  ],
  [
    'Drizzle',
    {
      stemmed: drizzlePager(
        defineDrizzle({
          table: 'contacts',
          key: ['id'],
          fields: DRIZZLE_COLUMN_FIELDS,
          search: { columns: ['firstName', 'bio'] },
        }),
      ),
      exact: drizzlePager(
        defineDrizzle({
          table: 'contacts',
          key: ['id'],
          fields: DRIZZLE_COLUMN_FIELDS,
          search: { columns: ['firstName', 'bio'], config: 'simple' },
          page: { max: OWN_MAX },
        }),
      ),
    },
  ],
] as const;

describe.each(databases())('%s: a configured definer', (_name, open) => {
  let harness: Harness;
  beforeAll(async () => {
    harness = await open();
  });
  afterAll(async () => {
    await harness.close();
  });

  describe.each(PAGERS)('through %s', (_binding, { stemmed, exact }) => {
    it('pages with the default size and walks every row with the default secret', async () => {
      const seen: Array<string> = [];
      let page = await stemmed(harness, {});
      seen.push(...page.rows.map((row) => row.id));
      expect(page.rows).toHaveLength(DEFAULT_SIZE);
      while (page.next !== null) {
        page = await stemmed(harness, { page: { after: page.next } });
        seen.push(...page.rows.map((row) => row.id));
      }
      expect(seen).toEqual(expectedIds(['id']));
    });

    it('enforces the default maximum unless the definition sets its own', async () => {
      await expect(
        stemmed(harness, { page: { size: DEFAULT_MAX + 1 } }),
      ).rejects.toBeInstanceOf(PageSizeExceededError);
      const own = await exact(harness, { page: { size: DEFAULT_MAX + 1 } });
      expect(own.rows).toHaveLength(DEFAULT_MAX + 1);
      const sized = await exact(harness, {});
      expect(sized.rows).toHaveLength(DEFAULT_SIZE);
    });

    it('searches with the default configuration unless the definition names one', async () => {
      async function names(
        pager: typeof stemmed,
        search: string,
      ): Promise<Array<string>> {
        const page = await pager(harness, { search });
        return page.rows.map((row) => row.first_name);
      }
      expect(await names(stemmed, 'programs')).toEqual(['Ada']);
      expect(await names(stemmed, 'walking')).toEqual(['Heidi']);
      expect(await names(exact, 'programs')).toEqual([]);
      expect(await names(exact, 'walks')).toEqual(['Heidi']);
    });
  });
});
