/**
 * The two definitions every declared resource derives (resource SPEC 11),
 * through the built packages: the server's `createDefineKeyset({ cursor })`
 * accepts `keyset`; every request `@nizam-os/jsonapi-core`'s `parseQuery`
 * accepts on `resource`, `@nizam-os/keyset-core` plans, its filters mapped
 * by `keysetRequest`; and what parseQuery refuses, keyset-core refuses
 * too, except a sort by the key, which only keyset-core names. SPEC 15.5
 * holds the same property on two real catalogs, where every page query
 * also runs in PostgreSQL.
 */
import type {
  FilterCondition as ParsedCondition,
  ParsedQuery,
} from '@nizam-os/jsonapi-core';
import type { Keyset } from '@nizam-os/keyset-core';
import type { DeclaredResource } from '@nizam-os/resource-core';

import { describe, expect, it } from 'vitest';

import { isBanError, parseQuery } from '@nizam-os/jsonapi-core';
import {
  createDefineKeyset,
  isKeysetError,
  OPERATORS,
} from '@nizam-os/keyset-core';
import { keysetRequest } from '@nizam-os/resource-core/server';

import { Calls } from './resources/calls.ts';
import { Contacts } from './resources/contacts.ts';
import { ImportedContacts, Owners } from './resources/imported-contacts.ts';
import { Meetings } from './resources/meetings.ts';
import { Notes } from './resources/notes.ts';
import { Organizations } from './resources/organizations.ts';
import { filterRequest } from './support/filter-request.ts';

const defineKeyset = createDefineKeyset({
  cursor: { secret: 'an e2e cursor secret of at least thirty-two bytes' },
});

const RESOURCES: ReadonlyArray<readonly [string, DeclaredResource]> = [
  ['organizations', Organizations],
  ['contacts', Contacts],
  ['meetings', Meetings],
  ['notes', Notes],
  ['calls', Calls],
  ['owners', Owners],
  ['imported_contacts', ImportedContacts],
];

type Verdict = 'accepts' | 'refuses';

/** A refusal is a `BanError`; anything else thrown fails the test. */
function parsed(
  resource: DeclaredResource['resource'],
  query: string,
): Verdict {
  try {
    parseQuery(resource, query);
    return 'accepts';
  } catch (error) {
    if (isBanError(error)) {
      return 'refuses';
    }
    throw error;
  }
}

/** A query of `condition` alone, which a route never builds: parseQuery refused it. */
function alone(
  resource: DeclaredResource['resource'],
  condition: ParsedCondition,
): ParsedQuery {
  return {
    ...parseQuery(resource, ''),
    filter: { conditions: [condition], anyOf: [] },
  };
}

/** A refusal is a `KeysetError`; anything else thrown fails the test. */
async function planned(keyset: Keyset, request: object): Promise<Verdict> {
  try {
    await keyset.plan(request);
    return 'accepts';
  } catch (error) {
    if (isKeysetError(error)) {
      return 'refuses';
    }
    throw error;
  }
}

describe.each(RESOURCES)('%s', (table, declared) => {
  const keyset = defineKeyset(declared.keyset);
  const { resource } = declared;
  const { fields } = declared.keyset;
  const names = [
    ...new Set([
      ...Object.keys(fields),
      ...resource.attributes,
      ...Object.keys(resource.relationships),
      'undeclared',
    ]),
  ];

  it('defines a keyset for the table and its key with the resource page bounds', () => {
    expect(keyset.definition.table).toBe(table);
    expect(keyset.definition.key).toEqual(['id']);
    expect(keyset.definition.page).toEqual(resource.query.page);
    expect(parseQuery(resource, '').page?.size).toBe(
      keyset.definition.page.default,
    );
  });

  it('plans exactly the filters parseQuery accepts', async () => {
    const accepted: Array<string> = [];
    const disagreements: Array<string> = [];
    for (const name of names) {
      const field = fields[name];
      for (const op of OPERATORS) {
        const { query, condition } = filterRequest(name, field, op);
        const byParse = parsed(resource, query);
        const parsedQuery =
          byParse === 'accepts'
            ? parseQuery(resource, query)
            : alone(resource, condition);
        expect(parsedQuery.filter.conditions).toEqual([condition]);
        const request = keysetRequest(declared, parsedQuery);
        const byPlan = await planned(keyset, request);
        if (byParse !== byPlan) {
          disagreements.push(
            `${query}: parseQuery ${byParse}, keyset-core ${byPlan}`,
          );
        } else if (byParse === 'accepts') {
          accepted.push(`${name} ${op}`);
        }
      }
    }
    expect(disagreements).toEqual([]);
    expect(accepted).toEqual(
      Object.entries(resource.query.filter).flatMap(([name, ops]) =>
        ops.map((op) => `${name} ${op}`),
      ),
    );
  });

  it('plans every accepted filter at once, as conditions and as one or group, isNull=false and lists of one included', async () => {
    const accepted = Object.entries(resource.query.filter).flatMap(
      ([name, ops]) =>
        OPERATORS.filter((op) => ops.includes(op)).map(
          (op) => [name, op] as const,
        ),
    );
    for (const group of [undefined, 0]) {
      const requests = accepted.map(([name, op]) =>
        filterRequest(name, fields[name], op, { single: true, group }),
      );
      const parsedQuery = parseQuery(
        resource,
        requests.map((item) => item.query).join('&'),
      );
      const conditions = requests.map((item) => item.condition);
      expect(parsedQuery.filter).toEqual(
        group === undefined || conditions.length === 0
          ? { conditions, anyOf: [] }
          : { conditions: [], anyOf: [conditions] },
      );
      await expect(
        planned(keyset, keysetRequest(declared, parsedQuery)),
      ).resolves.toBe('accepts');
    }
  });

  it('plans exactly the sorts parseQuery accepts, and the key besides', async () => {
    const verdicts: Array<string> = [];
    for (const name of names) {
      for (const item of [name, `-${name}`]) {
        const byParse = parsed(resource, `sort=${item}`);
        const byPlan = await planned(keyset, { sort: [item] });
        verdicts.push(`${item}: ${byParse}, ${byPlan}`);
      }
    }
    const expected = names.flatMap((name) =>
      [name, `-${name}`].map((item) => {
        if (name === 'id') {
          return `${item}: refuses, accepts`;
        }
        const verdict = resource.query.sort.includes(name)
          ? 'accepts'
          : 'refuses';
        return `${item}: ${verdict}, ${verdict}`;
      }),
    );
    expect(verdicts).toEqual(expected);
    await expect(planned(keyset, {})).resolves.toBe('accepts');
  });

  it('agrees on search, the page maximum, and include', async () => {
    const search = resource.query.search?.parameter ?? 'filter[q]';
    const term = parsed(resource, `${search}=ada%20lovelace`);
    const searched = await planned(keyset, { search: 'ada lovelace' });
    expect([term, searched]).toEqual(
      resource.query.search === undefined
        ? ['refuses', 'refuses']
        : ['accepts', 'accepts'],
    );
    const max = keyset.definition.page.max;
    expect(parsed(resource, `page[size]=${String(max)}`)).toBe('accepts');
    await expect(planned(keyset, { page: { size: max } })).resolves.toBe(
      'accepts',
    );
    expect(parsed(resource, `page[size]=${String(max + 1)}`)).toBe('refuses');
    await expect(planned(keyset, { page: { size: max + 1 } })).resolves.toBe(
      'refuses',
    );
    for (const path of resource.query.include) {
      expect(parsed(resource, `include=${path}`)).toBe('accepts');
      const relationship = resource.relationships[path];
      expect(relationship?.type).toBeTypeOf('string');
      expect(relationship?.resource?.().type).toBe(relationship?.type);
    }
  });
});
